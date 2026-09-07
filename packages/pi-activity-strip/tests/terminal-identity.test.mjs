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

test("Ghostty ancestor discovery walks procfs and host resolution requires a matching family", async () => {
  const { findGhosttyAncestor, resolveTerminalHostPid } = await import(
    "../src/common/terminal-identity.mjs"
  );
  const stat = (pid, ppid, start) =>
    `${pid} (node) S ${ppid} 1 1 0 -1 0 0 0 0 0 0 0 0 0 20 0 1 0 ${start} 0`;
  const files = new Map([
    ["/proc/501/stat", stat(501, 400, 777)],
    ["/proc/400/stat", `400 (sh -lc) S 300 1 1 0 -1 0 0 0 0 0 0 0 0 0 20 0 1 0 700 0`],
    ["/proc/400/comm", "sh\n"],
    ["/proc/300/stat", stat(300, 1, 600)],
    ["/proc/300/comm", "ghostty\n"],
    ["/proc/1/stat", stat(1, 0, 1)],
    ["/proc/1/comm", "systemd\n"],
  ]);
  const links = new Map([["/proc/300/exe", "/opt/ghostty-origin-main/bin/ghostty"]]);
  const procfs = {
    readFile: (filePath) => files.get(filePath) ?? "",
    readLink: (filePath) => links.get(filePath) ?? "",
  };
  assert.deepEqual(findGhosttyAncestor(501, procfs), {
    pid: 300,
    executable: "/opt/ghostty-origin-main/bin/ghostty",
  });
  assert.equal(findGhosttyAncestor(300, procfs), null, "a process is not its own ancestor");
  assert.equal(findGhosttyAncestor(9999, procfs), null);

  const session = {
    processId: 501,
    terminalKind: "ghostty-surface",
    terminalKey: "ghostty:main:16",
    terminalFamily: "main",
    terminalSurfaceId: "16",
  };
  const cache = new Map();
  assert.equal(resolveTerminalHostPid(session, { procfs, cache }), 300);
  assert.deepEqual([...cache.entries()], [["501:777", 300]]);
  assert.equal(
    resolveTerminalHostPid(session, { procfs: { ...procfs, readFile: () => "" }, cache }),
    0,
    "a vanished publisher process never resolves a host, even with a warm cache",
  );
  assert.equal(
    resolveTerminalHostPid(
      { ...session, terminalFamily: "legacy", terminalKey: "ghostty:legacy:16" },
      { procfs },
    ),
    0,
    "the ancestor family must match the admitted family",
  );
  assert.equal(
    resolveTerminalHostPid({ ...session, terminalKey: "ghostty:main:17" }, { procfs }),
    0,
  );
  assert.equal(resolveTerminalHostPid({ ...session, processId: 0 }, { procfs }), 0);
  files.set("/proc/300/comm", "foot\n");
  assert.equal(resolveTerminalHostPid(session, { procfs, cache }), 300, "cache hit by start time");
  files.set("/proc/501/stat", stat(501, 400, 778));
  assert.equal(
    resolveTerminalHostPid(session, { procfs, cache }),
    0,
    "a reused pid is re-resolved",
  );
});
