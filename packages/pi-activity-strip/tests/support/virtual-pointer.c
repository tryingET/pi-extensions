// Isolated compositor fixture input. Requires wlr-virtual-pointer (never /dev/uinput).
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <time.h>
#include <wayland-client.h>
#include "virtual-pointer-client.h"

static struct zwlr_virtual_pointer_manager_v1 *manager;
static struct wl_seat *seat;
static void capabilities(void *data, struct wl_seat *s, uint32_t caps) {
    (void)data; (void)s; (void)caps;
}
static const struct wl_seat_listener seat_listener = { .capabilities = capabilities };
static uint32_t now_ms(void) {
    struct timespec ts;
    clock_gettime(CLOCK_MONOTONIC, &ts);
    return (uint32_t)(ts.tv_sec * 1000 + ts.tv_nsec / 1000000);
}
static void global(void *data, struct wl_registry *registry, uint32_t id,
                   const char *interface, uint32_t version) {
    (void)data;
    if (!strcmp(interface, "wl_seat")) {
        seat = wl_registry_bind(registry, id, &wl_seat_interface, 1);
        wl_seat_add_listener(seat, &seat_listener, NULL);
    }
    if (!strcmp(interface, "zwlr_virtual_pointer_manager_v1")) {
        manager = wl_registry_bind(registry, id, &zwlr_virtual_pointer_manager_v1_interface,
                                   version < 2 ? version : 2);
    }
}
static void removed(void *data, struct wl_registry *registry, uint32_t id) {
    (void)data; (void)registry; (void)id;
}
int main(int argc, char **argv) {
    if (argc != 5) { fprintf(stderr, "usage: virtual-pointer x y width height\n"); return 2; }
    struct wl_display *display = wl_display_connect(NULL);
    if (!display) return 3;
    struct wl_registry *registry = wl_display_get_registry(display);
    const struct wl_registry_listener listener = {global, removed};
    wl_registry_add_listener(registry, &listener, NULL);
    wl_display_roundtrip(display);
    if (!manager) { fprintf(stderr, "compositor has no virtual pointer\n"); return 4; }
    struct zwlr_virtual_pointer_v1 *pointer = zwlr_virtual_pointer_manager_v1_create_virtual_pointer(manager, seat);
    zwlr_virtual_pointer_v1_motion_absolute(pointer, now_ms(), atoi(argv[1]), atoi(argv[2]), atoi(argv[3]), atoi(argv[4]));
    zwlr_virtual_pointer_v1_frame(pointer);
    wl_display_roundtrip(display);
    puts("ready"); fflush(stdout);
    // Keep the device alive until the harness sends its next coordinates or closes stdin.
    unsigned x, y;
    while (scanf("%u %u", &x, &y) == 2) {
        zwlr_virtual_pointer_v1_motion_absolute(pointer, now_ms(), x, y, atoi(argv[3]), atoi(argv[4]));
        zwlr_virtual_pointer_v1_frame(pointer);
        wl_display_roundtrip(display);
        puts("moved"); fflush(stdout);
    }
    zwlr_virtual_pointer_v1_destroy(pointer);
    wl_display_roundtrip(display);
    wl_display_disconnect(display);
    return 0;
}
