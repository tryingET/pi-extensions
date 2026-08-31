// ---
// summary: "verifies bounded Ghostty terminal-surface admission and normalization"
// read_when:
//   - "changing terminal card identity or headless publisher admission"
// ---

import assert from "node:assert/strict";
import test from "node:test";

import {
  canonicalGhosttyTerminalKey,
  normalizeGhosttySurfaceId,
  resolveTerminalIdentity,
  terminalTitleSegment,
} from "../src/common/terminal-identity.mjs";

test("Ghostty surface ids normalize to bounded unsigned decimal", () => {
  assert.equal(normalizeGhosttySurfaceId("0x1234"), "4660");
  assert.equal(normalizeGhosttySurfaceId("4660"), "4660");
  assert.equal(normalizeGhosttySurfaceId("-1"), "");
  assert.equal(normalizeGhosttySurfaceId("surface-1"), "");
  assert.equal(normalizeGhosttySurfaceId("18446744073709551616"), "");
});

test("terminal key, family, and surface must form one coherent identity", () => {
  const valid = {
    terminalKind: "ghostty-surface",
    terminalKey: "ghostty:main:17",
    terminalFamily: "main",
    terminalSurfaceId: "17",
  };
  assert.equal(canonicalGhosttyTerminalKey(valid), "ghostty:main:17");
  assert.equal(canonicalGhosttyTerminalKey({ ...valid, terminalKey: "ghostty:main:18" }), "");
  assert.equal(canonicalGhosttyTerminalKey({ ...valid, terminalFamily: "unknown" }), "");
  assert.equal(terminalTitleSegment({ ...valid, terminalKey: "ghostty:main:18" }), "");
});

test("interactive Ghostty TUI receives a namespaced terminal identity", () => {
  const identity = resolveTerminalIdentity({
    env: { TERM_PROGRAM: "ghostty", GHOSTTY_SURFACE_ID: "0x1234" },
    hasUI: true,
    stdinIsTTY: true,
    ttyPath: "/dev/pts/9",
    ancestorExecutable: "/opt/ghostty-origin-main/bin/ghostty",
  });
  assert.deepEqual(identity, {
    terminalKind: "ghostty-surface",
    terminalKey: "ghostty:main:4660",
    terminalFamily: "main",
    terminalSurfaceId: "4660",
  });
  assert.equal(terminalTitleSegment(identity), "gs:main:4660");
});

test("headless descendants cannot claim an inherited Ghostty surface", () => {
  for (const candidate of [
    { hasUI: false, stdinIsTTY: true, ttyPath: "/dev/pts/9" },
    { hasUI: true, stdinIsTTY: false, ttyPath: "/dev/pts/9" },
    { hasUI: true, stdinIsTTY: true, ttyPath: "pipe:[123]" },
  ]) {
    const identity = resolveTerminalIdentity({
      env: { TERM_PROGRAM: "ghostty", GHOSTTY_SURFACE_ID: "0x1234" },
      ancestorExecutable: "/opt/ghostty-origin-main/bin/ghostty",
      ...candidate,
    });
    assert.equal(identity.terminalKind, "unbound");
    assert.equal(identity.terminalKey, "");
  }
});
