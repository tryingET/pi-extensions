// ---
// summary: "reality-checks schema-v2 terminal bindings against live Pi processes and Niri titles"
// read_when:
//   - "changing session-presence terminal keys or Ghostty title identity"
// ---

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

test("a live schema-v2 terminal binding matches one exact Niri Ghostty title", (t) => {
  const runtimeDir = String(process.env.XDG_RUNTIME_DIR ?? "").trim();
  if (!runtimeDir || !process.env.NIRI_SOCKET) {
    t.skip("requires a live Niri user session with XDG_RUNTIME_DIR");
    return;
  }
  const presenceDir = path.join(runtimeDir, "pi-session-presence");
  if (!existsSync(presenceDir)) {
    t.skip("no live pi-session-presence directory");
    return;
  }

  const records = readdirSync(presenceDir)
    .filter((entry) => /^\d+\.json$/.test(entry))
    .flatMap((entry) => {
      try {
        const record = JSON.parse(readFileSync(path.join(presenceDir, entry), "utf8"));
        return existsSync(path.join("/proc", String(record.pid))) ? [record] : [];
      } catch {
        return [];
      }
    })
    .filter((record) => record.schemaVersion === 2 && record.terminalBound === true);
  if (records.length === 0) {
    t.skip("reload one interactive Pi tab with the schema-v2 session-presence extension");
    return;
  }

  const windows = JSON.parse(execFileSync("niri", ["msg", "-j", "windows"], { encoding: "utf8" }));
  const appIdByFamily = {
    main: "com.mitchellh.ghostty",
    legacy: "com.tryinget.ghosttysidequest",
  };
  for (const record of records) {
    assert.equal(
      record.terminalKey,
      `ghostty:${record.ghosttyFamily}:${record.ghosttySurfaceIdNormalized}`,
    );
    assert.match(record.windowTitle, / · gs:(main|legacy):\d+ · [0-9a-f]{32}$/i);
    assert.match(record.tty, /^\/dev\//);
  }
  const matches = records.filter(
    (record) =>
      windows.filter(
        (window) =>
          window.title === record.windowTitle &&
          window.app_id === appIdByFamily[record.ghosttyFamily],
      ).length === 1,
  );

  assert.ok(matches.length > 0, "at least one admitted surface must match one exact Niri title");
});
