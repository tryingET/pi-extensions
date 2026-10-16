// Owned nested-compositor input, never /dev/uinput. Initialize BEFORE hover: starting a new
// wtype client on a parked compositor can consume the whole three-second typing idle period.
#define _GNU_SOURCE
#include <ctype.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/mman.h>
#include <time.h>
#include <unistd.h>
#include <wayland-client.h>
#include <xkbcommon/xkbcommon.h>
#include "virtual-keyboard-client.h"

static struct zwp_virtual_keyboard_manager_v1 *manager;
static struct wl_seat *seat;
static struct zwp_virtual_keyboard_v1 *keyboard;
static struct wl_display *display;
static struct xkb_keymap *map;
static void fail(const char *message) { fprintf(stderr, "%s\n", message); exit(1); }
static void capabilities(void *data, struct wl_seat *s, uint32_t caps) {
    (void)data; (void)s; (void)caps;
}
static const struct wl_seat_listener seat_listener = { .capabilities = capabilities };
static void global(void *data, struct wl_registry *registry, uint32_t id,
                   const char *interface, uint32_t version) {
    (void)data; (void)version;
    if (!strcmp(interface, "wl_seat")) {
        seat = wl_registry_bind(registry, id, &wl_seat_interface, 1);
        wl_seat_add_listener(seat, &seat_listener, NULL);
    }
    if (!strcmp(interface, "zwp_virtual_keyboard_manager_v1"))
        manager = wl_registry_bind(registry, id, &zwp_virtual_keyboard_manager_v1_interface, 1);
}
static void removed(void *data, struct wl_registry *registry, uint32_t id) {
    (void)data; (void)registry; (void)id;
}
static uint32_t now_ms(void) {
    struct timespec ts;
    clock_gettime(CLOCK_MONOTONIC, &ts);
    return (uint32_t)(ts.tv_sec * 1000 + ts.tv_nsec / 1000000);
}
static void key(xkb_keysym_t symbol) {
    for (xkb_keycode_t code = xkb_keymap_min_keycode(map); code <= xkb_keymap_max_keycode(map); code++) {
        for (xkb_level_index_t level = 0; level < 2; level++) {
            const xkb_keysym_t *symbols;
            int count = xkb_keymap_key_get_syms_by_level(map, code, 0, level, &symbols);
            if (count != 1 || symbols[0] != symbol) continue;
            uint32_t mods = level ? 1u << xkb_keymap_mod_get_index(map, XKB_MOD_NAME_SHIFT) : 0;
            zwp_virtual_keyboard_v1_modifiers(keyboard, mods, 0, 0, 0);
            zwp_virtual_keyboard_v1_key(keyboard, now_ms(), code - 8, WL_KEYBOARD_KEY_STATE_PRESSED);
            zwp_virtual_keyboard_v1_key(keyboard, now_ms(), code - 8, WL_KEYBOARD_KEY_STATE_RELEASED);
            zwp_virtual_keyboard_v1_modifiers(keyboard, 0, 0, 0, 0);
            return;
        }
    }
    fail("fixture key is not in its US keymap");
}
static void text(const char *value) {
    for (const unsigned char *p = (const unsigned char *)value; *p; p++) {
        if (*p >= 128) fail("fixture input is ASCII only");
        key(xkb_utf32_to_keysym(*p));
    }
}
int main(void) {
    const char *isolated = getenv("PI_ACTIVITY_STRIP_ISOLATED_GUI");
    if (!isolated || strcmp(isolated, "1")) fail("owned isolated GUI environment required");
    display = wl_display_connect(NULL);
    if (!display) fail("cannot connect to owned display");
    struct wl_registry *registry = wl_display_get_registry(display);
    const struct wl_registry_listener listener = {global, removed};
    wl_registry_add_listener(registry, &listener, NULL);
    if (wl_display_roundtrip(display) < 0 || !manager || !seat) fail("virtual keyboard/seat unavailable");
    keyboard = zwp_virtual_keyboard_manager_v1_create_virtual_keyboard(manager, seat);
    struct xkb_context *context = xkb_context_new(XKB_CONTEXT_NO_FLAGS);
    struct xkb_rule_names names = { .layout = "us" };
    map = xkb_keymap_new_from_names(context, &names, XKB_KEYMAP_COMPILE_NO_FLAGS);
    if (!map) fail("cannot create fixture keymap");
    char *keymap = xkb_keymap_get_as_string(map, XKB_KEYMAP_FORMAT_TEXT_V1);
    size_t size = strlen(keymap) + 1;
    int fd = memfd_create("ak7114-isolated-keymap", MFD_CLOEXEC);
    if (fd < 0 || write(fd, keymap, size) != (ssize_t)size) fail("cannot write anonymous keymap");
    zwp_virtual_keyboard_v1_keymap(keyboard, WL_KEYBOARD_KEYMAP_FORMAT_XKB_V1, fd, (uint32_t)size);
    close(fd); free(keymap);
    if (wl_display_roundtrip(display) < 0) fail("keymap initialization failed");
    puts("ready"); fflush(stdout);
    char *line = NULL;
    size_t capacity = 0;
    while (getline(&line, &capacity, stdin) >= 0) {
        line[strcspn(line, "\n")] = 0;
        char *value = strchr(line, '\t');
        if (!value) fail("expected command<TAB>value");
        *value++ = 0;
        if (!strcmp(line, "text")) text(value);
        else if (!strcmp(line, "key")) key(xkb_keysym_from_name(value, XKB_KEYSYM_CASE_INSENSITIVE));
        else if (!strcmp(line, "number") || !strcmp(line, "unlisted")) {
            size_t length = strlen(value);
            if (!length || length > 12) fail("invalid fixture number");
            for (size_t i = 0; i < length; i++) if (!isdigit((unsigned char)value[i])) fail("invalid digit");
            text(value);
            int unlisted = !strcmp(line, "unlisted");
            if (unlisted) key(XKB_KEY_Return);
            for (int i = 0; i < (unlisted ? 50 : 30); i++) {
                if (wl_display_flush(display) < 0) fail("keyboard flush failed");
                usleep(500000);
                key(XKB_KEY_BackSpace);
                if (!unlisted) text(value + length - 1);
            }
            if (!unlisted) key(XKB_KEY_Return);
        } else fail("unknown fixture command");
        if (wl_display_roundtrip(display) < 0) fail("keyboard roundtrip failed");
        puts("typed"); fflush(stdout);
    }
    free(line);
    zwp_virtual_keyboard_v1_destroy(keyboard);
    wl_display_roundtrip(display);
    wl_display_disconnect(display);
    xkb_keymap_unref(map); xkb_context_unref(context);
    return 0;
}
