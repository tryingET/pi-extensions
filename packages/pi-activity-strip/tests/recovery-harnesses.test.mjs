// ---
// summary: "verifies recovery harness classification: agy, AGNT's Electron helpers, runtime launchers, and agy presence-lock links"
// read_when:
//   - "changing which processes the recovery inventory attributes to a harness"
// ---

import assert from "node:assert/strict";
import test from "node:test";
import { processLink, RECOVERY_CAPABILITIES } from "../src/common/recovery-manifest.mjs";
import { foldRuntimeLaunchers, recoveryHarness } from "../src/native/recovery-proc.mjs";

const electron = "/home/x/agnt/projects/agnt-0.6.7/node_modules/electron/dist/electron";

test("AGNT is its Electron browser process, never its zygote, renderer, GPU or utility helpers", () => {
  const p = (argv1) => ({ comm: "electron", executable: electron, argv0: electron, argv1 });
  assert.equal(recoveryHarness(p(".")), "agnt");
  assert.equal(recoveryHarness(p("--ozone-platform=wayland")), "agnt");
  for (const type of ["zygote", "renderer", "gpu-process", "utility"])
    assert.equal(recoveryHarness(p(`--type=${type}`)), "", type);
});

test("agy is recognized as its own harness, apart from the Gemini CLI", () => {
  const agy = { comm: "agy", executable: "/home/x/.local/bin/agy", argv0: "agy", argv1: "" };
  assert.equal(recoveryHarness(agy), "agy");
  assert.ok(RECOVERY_CAPABILITIES.some((c) => c.harness === "agy" && c.claimantPrefix === null));
});

const base = {
  startTicks: "1",
  birthMs: 1,
  bootId: "b",
  pidDomain: "d",
  executableIdentity: "1:1",
  cwd: "/w",
};

test("Codex's Node launcher folds into the native Codex it starts", () => {
  const processes = [
    { ...base, pid: 10, ppid: 1, executable: "/usr/bin/node", harness: "codex" },
    { ...base, pid: 11, ppid: 10, executable: "/x/vendor/codex/codex", harness: "codex" },
    { ...base, pid: 20, ppid: 1, executable: "/usr/bin/node", harness: "codex" },
    { ...base, pid: 30, ppid: 1, executable: "/usr/bin/node", harness: "pi" },
    { ...base, pid: 31, ppid: 30, executable: "/x/vendor/codex/codex", harness: "codex" },
  ];
  assert.equal(foldRuntimeLaunchers(processes), 1);
  assert.deepEqual(
    processes.map((p) => `${p.pid}:${p.harness}`),
    ["10:", "11:codex", "20:codex", "30:pi", "31:codex"],
    "a launcher without a native child, or of another harness, keeps its harness",
  );
});

test("an agy presence flock links its process, but never as current-display proof", () => {
  const proc = { ...base, pid: 700, ppid: 1, executable: "/x/agy", harness: "agy" };
  const input = {
    startedAt: 1,
    endedAt: 2,
    bootId: "b",
    pidDomain: "d",
    before: [proc],
    after: [structuredClone(proc)],
    sessions: [],
    windows: [],
    windowsAfter: [],
    workspaces: [],
    workspacesAfter: [],
    claims: [],
    sources: [],
  };
  const session = (source) => ({
    harness: "agy",
    sessionId: "b758ec8f-6161-4de6-83bc-39a730cbb370",
    pid: 700,
    source,
    sourceRef: "/proc/700/fd/3",
    cwd: "",
    startedAt: 1,
    pidDomain: "d",
    procStart: "1",
    bootId: "b",
    changed: false,
    transcripts: [],
  });
  const held = processLink(session("agy-presence-flock"), input);
  assert.equal(held.state, "presence-lock-held");
  assert.ok(held.uncertainties.includes("flock-is-held-conversation-not-current-display"));
  assert.equal(
    processLink(session("agy-presence-open"), input).state,
    "open-descriptor-associated",
  );
  assert.equal(
    processLink({ ...session("agy-presence-flock"), procStart: "2" }, input).state,
    "birth-mismatch",
  );
});
