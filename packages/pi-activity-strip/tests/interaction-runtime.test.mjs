// ---
// summary: "verifies the native layer-shell runtime wiring and removal of Electron control paths"
// read_when:
//   - "changing native panel launch, keyboard entry, exclusive-zone, or supervision"
// ---

import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const cli = fs.readFileSync(new URL("../bin/pi-activity-strip.mjs", import.meta.url), "utf8");
const controller = fs.readFileSync(new URL("../src/native/main.mjs", import.meta.url), "utf8");
const app = fs.readFileSync(new URL("../native/panel/src/app.rs", import.meta.url), "utf8");
const cardView = fs.readFileSync(
  new URL("../native/panel/src/card_view.rs", import.meta.url),
  "utf8",
);
const panelMain = fs.readFileSync(new URL("../native/panel/src/main.rs", import.meta.url), "utf8");
const cargo = fs.readFileSync(new URL("../native/panel/Cargo.toml", import.meta.url), "utf8");

test("CLI launches only the native controller and routes keyboard entry through the broker", () => {
  assert.match(cli, /spawn\("flock", \["--nonblock", runtimeLockPath/);
  assert.match(cli, /makeMessage\("focus-strip"\)/);
  assert.match(cli, /layer-shell placement is compositor-owned/);
  assert.doesNotMatch(cli, /electron|BrowserWindow|focusNiriStrip|move-floating-window/i);
});

test("native controller supervises a receipt-verified panel and coalesces backpressure", () => {
  assert.match(controller, /pi-activity-strip-native-artifact\.v1/);
  assert.match(controller, /artifact\.sha256 !== digest/);
  assert.match(controller, /panelWriteReady = false/);
  assert.match(controller, /panelRestartCount < 3/);
  assert.match(controller, /child\.stdin\.on\("error"/);
  assert.match(controller, /activation-result/);
  assert.match(controller, /PI_ACTIVITY_STRIP_RUNTIME_LOCK_HELD/);
  assert.doesNotMatch(controller, /niri-reserved-space|BrowserWindow/);
});

test("GTK panel owns layer-shell reservation, click-through, keyboard, and parent death", () => {
  assert.match(cargo, /gtk4-layer-shell/);
  assert.match(app, /set_exclusive_zone\(COMPACT_HEIGHT\)/);
  assert.match(app, /set_keyboard_mode\(KeyboardMode::Exclusive\)/);
  assert.match(app, /set_input_region\(Some\(&gtk::cairo::Region::create\(\)\)\)/);
  assert.match(app, /AppMsg::ParentGone => root\.close\(\)/);
  assert.match(cardView, /AccessibleAnnouncementPriority::Medium/);
  assert.match(panelMain, /PR_SET_PDEATHSIG/);
  assert.match(panelMain, /visible_on_activate\(false\)/);
});
