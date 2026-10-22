// ---
// summary: "executable startup scenarios for binding explicit native panel selection"
// read_when:
//   - "changing native panel overrides or durable paired startup"
// ---

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { resolvePanelBinary } from "../src/native/panel-binary.mjs";

for (const unavailable of ["missing", "nonexecutable"])
  for (const allowUnverified of ["0", "1"])
    test(`Scenario: ${unavailable} explicit panel cannot select another build (dev=${allowUnverified})`, (t) => {
      // Given an explicit approved path which is missing or no longer executable.
      const root = fs.mkdtempSync(path.join(os.tmpdir(), "ak7417-panel-selection-"));
      t.after(() => fs.rmSync(root, { recursive: true, force: true }));
      const approved = path.join(root, "approved-panel");
      if (unavailable === "nonexecutable") fs.writeFileSync(approved, "inert", { mode: 0o600 });
      assert.throws(() => fs.accessSync(approved, fs.constants.X_OK));

      // When normal startup resolves the selection, Then no packaged/development fallback occurs.
      assert.throws(
        () =>
          resolvePanelBinary({
            PI_ACTIVITY_STRIP_NATIVE_PANEL_BIN: approved,
            PI_ACTIVITY_STRIP_ALLOW_UNVERIFIED_PANEL: allowUnverified,
          }),
        /Native panel binary is unavailable/,
      );
    });

test("Scenario: normal startup without an override still selects the receipted packaged panel", () => {
  // Given no override, When startup resolves, Then the packaged executable is selected.
  const binary = resolvePanelBinary({});
  assert.match(binary, /native\/bin\/linux-x64-gnu\/pi-activity-strip-panel$/);
  fs.accessSync(binary, fs.constants.X_OK);
});
