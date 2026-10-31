import assert from "node:assert/strict";
import test from "node:test";
import {
  findFocusStripChord,
  humanizeChord,
  resolveStripHotkey,
} from "../src/native/strip-hotkey.mjs";

const config = `binds {
    Mod+Return hotkey-overlay-title="Terminal" { spawn "ghostty"; }
    // Mod+Shift+Z { spawn "node" "/x/pi-activity-strip/bin/pi-activity-strip.mjs" "focus-strip"; }
    Mod+Shift+A repeat=false allow-inhibiting=false hotkey-overlay-title="Toggle Pi Activity Ribbon keyboard mode" { spawn "/usr/bin/node" "/home/u/pi-extensions/packages/pi-activity-strip/bin/pi-activity-strip.mjs" "focus-strip"; }
    Mod+Shift+S { spawn "node" "/home/u/pi-extensions/packages/pi-activity-strip/bin/pi-activity-strip.mjs" "status"; }
}`;

test("the hint names the chord the compositor actually binds to focus-strip", () => {
  assert.equal(
    findFocusStripChord(config),
    "Mod+Shift+A",
    "comments and other subcommands never count",
  );
  assert.equal(findFocusStripChord('binds { Mod+K { spawn "x"; } }'), null);
  assert.equal(humanizeChord("Mod+Shift+A"), "Super+Shift+A");
  const read = (text) => () => text;
  assert.equal(
    resolveStripHotkey({ env: {}, readFileSync: read(config), homeDir: "/h" }),
    "Super+Shift+A",
  );
  assert.equal(
    resolveStripHotkey({
      env: {},
      readFileSync: () => {
        throw new Error("ENOENT");
      },
      homeDir: "/h",
    }),
    null,
    "no config, no guessed shortcut",
  );
  assert.equal(resolveStripHotkey({ env: { PI_ACTIVITY_STRIP_HOTKEY: "Alt+F1" } }), "Alt+F1");
  assert.equal(
    resolveStripHotkey({ env: { PI_ACTIVITY_STRIP_HOTKEY: "none" }, readFileSync: read(config) }),
    null,
  );
  let readPath = "";
  resolveStripHotkey({
    env: { XDG_CONFIG_HOME: "/cfg" },
    readFileSync: (file) => {
      readPath = String(file);
      return config;
    },
    homeDir: "/h",
  });
  assert.equal(readPath, "/cfg/niri/config.kdl");
});
