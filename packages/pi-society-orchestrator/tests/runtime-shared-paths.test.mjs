import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import extension from "../extensions/society-orchestrator.ts";
import { BUILT_IN_PLUGINS, registerLoopTools } from "../src/loops/engine.ts";
import {
  AGENT_TEAMS,
  resolveAgentForTeam,
  resolveConfiguredDefaultAgentTeam,
  validateLoopAgentsForTeam,
} from "../src/runtime/agent-routing.ts";
import { runAkCommand, runAkCommandAsync } from "../src/runtime/ak.ts";
import { finalizeExecutionEffects, recordEvidence } from "../src/runtime/evidence.ts";
import { getExecutionStatus, isExecutionSuccess } from "../src/runtime/execution-status.ts";
import { superviseProcess } from "../src/runtime/process-supervisor.ts";
import { buildCombinedSystemPrompt, spawnPiSubagent } from "../src/runtime/subagent.ts";
import { createSessionTeamStore } from "../src/runtime/team-state.ts";

test("runAkCommand injects AK_DB when environment does not provide one", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "pi-orch-ak-"));
  const marker = path.join(tempDir, "ak-db.txt");
  const akPath = path.join(tempDir, "ak-mock.sh");
  const bashAkDbExpansion = "${" + "AK_DB:-}";

  fs.writeFileSync(
    akPath,
    `#!/usr/bin/env bash
printf '%s' "${bashAkDbExpansion}" > ${JSON.stringify(marker)}
`,
  );
  fs.chmodSync(akPath, 0o755);

  const previousAkDb = process.env.AK_DB;
  try {
    delete process.env.AK_DB;
    const result = runAkCommand({
      akPath,
      societyDb: "/tmp/custom-society.db",
      args: [],
    });
    assert.equal(result.ok, true);
    assert.equal(fs.readFileSync(marker, "utf8"), "/tmp/custom-society.db");
  } finally {
    if (previousAkDb === undefined) {
      delete process.env.AK_DB;
    } else {
      process.env.AK_DB = previousAkDb;
    }
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test("runAkCommand honors explicit societyDb over ambient AK_DB", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "pi-orch-ak-precedence-"));
  const marker = path.join(tempDir, "ak-db.txt");
  const akPath = path.join(tempDir, "ak-mock.sh");
  const bashAkDbExpansion = "${" + "AK_DB:-}";

  fs.writeFileSync(
    akPath,
    `#!/usr/bin/env bash
printf '%s' "${bashAkDbExpansion}" > ${JSON.stringify(marker)}
`,
  );
  fs.chmodSync(akPath, 0o755);

  const previousAkDb = process.env.AK_DB;
  try {
    process.env.AK_DB = "/tmp/ambient-ak.db";
    const result = runAkCommand({
      akPath,
      societyDb: "/tmp/explicit-society.db",
      args: [],
    });
    assert.equal(result.ok, true);
    assert.equal(fs.readFileSync(marker, "utf8"), "/tmp/explicit-society.db");
  } finally {
    if (previousAkDb === undefined) {
      delete process.env.AK_DB;
    } else {
      process.env.AK_DB = previousAkDb;
    }
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test("runAkCommandAsync injects AK_DB without blocking the event loop", async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "pi-orch-ak-async-"));
  const marker = path.join(tempDir, "ak-db.txt");
  const akPath = path.join(tempDir, "ak-mock.sh");
  const bashAkDbExpansion = "${" + "AK_DB:-}";

  fs.writeFileSync(
    akPath,
    `#!/usr/bin/env bash
sleep 0.2
printf '%s' "${bashAkDbExpansion}" > ${JSON.stringify(marker)}
printf 'async-ok'
`,
  );
  fs.chmodSync(akPath, 0o755);

  const previousAkDb = process.env.AK_DB;
  try {
    delete process.env.AK_DB;
    let timerFired = false;
    const timer = new Promise((resolve) => {
      setTimeout(() => {
        timerFired = true;
        resolve(undefined);
      }, 20);
    });

    const start = Date.now();
    const resultPromise = runAkCommandAsync({
      akPath,
      societyDb: "/tmp/async-society.db",
      args: [],
    });

    await timer;
    const elapsedUntilTimer = Date.now() - start;
    assert.equal(timerFired, true);
    assert.ok(
      elapsedUntilTimer < 150,
      `expected event loop to stay responsive, got ${elapsedUntilTimer}ms`,
    );

    const result = await resultPromise;
    assert.equal(result.ok, true);
    assert.equal(result.stdout, "async-ok");
    assert.equal(fs.readFileSync(marker, "utf8"), "/tmp/async-society.db");
  } finally {
    if (previousAkDb === undefined) {
      delete process.env.AK_DB;
    } else {
      process.env.AK_DB = previousAkDb;
    }
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test("runAkCommandAsync returns a timeout failure for hung processes", async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "pi-orch-ak-timeout-"));
  const akPath = path.join(tempDir, "ak-timeout.sh");

  fs.writeFileSync(
    akPath,
    `#!/usr/bin/env bash
sleep 2
`,
  );
  fs.chmodSync(akPath, 0o755);

  try {
    const result = await runAkCommandAsync({
      akPath,
      societyDb: "/tmp/timeout-society.db",
      args: [],
      timeoutMs: 50,
    });
    assert.equal(result.ok, false);
    assert.equal(result.timedOut, true);
    assert.match(result.stderr, /timed out/i);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test("superviseProcess preserves actual exit code when a timed-out process exits cleanly after SIGTERM", async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "pi-orch-supervisor-timeout-"));
  const scriptPath = path.join(tempDir, "graceful-timeout.sh");

  fs.writeFileSync(
    scriptPath,
    `#!/usr/bin/env bash
trap 'printf graceful-exit; exit 0' TERM
while true; do sleep 0.05; done
`,
  );
  fs.chmodSync(scriptPath, 0o755);

  try {
    const result = await superviseProcess({
      command: scriptPath,
      args: [],
      timeoutMs: 50,
    });
    assert.equal(result.timedOut, true);
    assert.equal(result.exitCode, 0);
    assert.match(result.stdout, /graceful-exit/);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test("superviseProcess bounds captured stdout/stderr while preserving streaming callbacks", async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "pi-orch-supervisor-bounded-"));
  const scriptPath = path.join(tempDir, "chatty.sh");
  let streamedStdout = "";
  let streamedStderr = "";

  fs.writeFileSync(
    scriptPath,
    `#!/usr/bin/env bash
printf 'stdout-abcdefghijklmnopqrstuvwxyz'
printf 'stderr-abcdefghijklmnopqrstuvwxyz' >&2
`,
  );
  fs.chmodSync(scriptPath, 0o755);

  try {
    const result = await superviseProcess({
      command: scriptPath,
      args: [],
      timeoutMs: 1000,
      maxStdoutBytes: 10,
      maxStderrBytes: 12,
      onStdoutData(chunk) {
        streamedStdout += chunk;
      },
      onStderrData(chunk) {
        streamedStderr += chunk;
      },
    });

    assert.equal(result.exitCode, 0);
    assert.equal(result.stdoutTruncated, true);
    assert.equal(result.stderrTruncated, true);
    assert.ok(Buffer.byteLength(result.stdout, "utf8") <= 10);
    assert.ok(Buffer.byteLength(result.stderr, "utf8") <= 12);
    assert.match(streamedStdout, /stdout-abcdefghijklmnopqrstuvwxyz/);
    assert.match(streamedStderr, /stderr-abcdefghijklmnopqrstuvwxyz/);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test("superviseProcess treats non-positive capture limits as zero-length captures", async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "pi-orch-supervisor-zero-capture-"));
  const scriptPath = path.join(tempDir, "chatty-zero.sh");

  fs.writeFileSync(
    scriptPath,
    `#!/usr/bin/env bash
printf 'stdout-data'
printf 'stderr-data' >&2
`,
  );
  fs.chmodSync(scriptPath, 0o755);

  try {
    const result = await superviseProcess({
      command: scriptPath,
      args: [],
      timeoutMs: 1000,
      maxStdoutBytes: 0,
      maxStderrBytes: -1,
    });

    assert.equal(result.exitCode, 0);
    assert.equal(result.stdout, "");
    assert.equal(result.stderr, "");
    assert.equal(result.stdoutTruncated, true);
    assert.equal(result.stderrTruncated, true);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test("buildCombinedSystemPrompt preserves agent role, cognitive tool, and objective context", () => {
  const prompt = buildCombinedSystemPrompt({
    agentSystemPrompt: "ROLE: reviewer",
    cognitiveToolContent: "FRAMEWORK: audit deeply",
    contextHeading: "OBJECTIVE",
    contextBody: "Find the hidden regression",
    extraSections: ["## LOOP\nphase=check"],
  });

  assert.match(prompt, /ROLE: reviewer/);
  assert.match(prompt, /FRAMEWORK: audit deeply/);
  assert.match(prompt, /## OBJECTIVE\n\nFind the hidden regression/);
  assert.match(prompt, /## LOOP\nphase=check/);
});

test("spawnPiSubagent flushes a final unterminated JSON event", async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "pi-orch-subagent-"));
  const piPath = path.join(tempDir, "pi");
  const sessionFile = path.join(tempDir, "session.json");
  const previousPath = process.env.PATH;

  fs.writeFileSync(
    piPath,
    `#!/usr/bin/env bash
printf '%s' '{"type":"message_end","message":{"role":"assistant","content":[{"type":"text","text":"final output without newline"}]}}'
`,
  );
  fs.chmodSync(piPath, 0o755);

  try {
    process.env.PATH = `${tempDir}:${previousPath || ""}`;
    const result = await spawnPiSubagent({
      tools: "read",
      systemPrompt: "ROLE: test",
      objective: "Say hello",
      model: "mock/provider",
      sessionFile,
    });

    assert.equal(result.exitCode, 0);
    assert.equal(result.output, "final output without newline");
  } finally {
    process.env.PATH = previousPath;
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test("spawnPiSubagent ignores non-JSON stdout noise when assistant completes cleanly", async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "pi-orch-subagent-noisy-"));
  const piPath = path.join(tempDir, "pi");
  const sessionFile = path.join(tempDir, "session.json");
  const previousPath = process.env.PATH;

  fs.writeFileSync(
    piPath,
    `#!/usr/bin/env bash
printf '\nchanged 1 package in 123ms\n\n'
printf '%s\n' '{"type":"session","version":3,"id":"x","timestamp":"2026-03-21T00:00:00.000Z","cwd":"/tmp"}'
printf '%s\n' '{"type":"message_end","message":{"role":"assistant","content":[{"type":"text","text":"coherent output"}],"stopReason":"stop"}}'
`,
  );
  fs.chmodSync(piPath, 0o755);

  try {
    process.env.PATH = `${tempDir}:${previousPath || ""}`;
    const result = await spawnPiSubagent({
      tools: "read",
      systemPrompt: "ROLE: test",
      objective: "Say hello",
      model: "mock/provider",
      sessionFile,
    });

    assert.equal(result.exitCode, 0);
    assert.equal(result.assistantStopReason, "stop");
    assert.equal(result.output, "coherent output");
    assert.match(result.stderr || "", /Ignored 1 non-JSON stdout line/);
  } finally {
    process.env.PATH = previousPath;
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test("spawnPiSubagent surfaces malformed JSON event streams explicitly", async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "pi-orch-subagent-malformed-"));
  const piPath = path.join(tempDir, "pi");
  const sessionFile = path.join(tempDir, "session.json");
  const previousPath = process.env.PATH;

  fs.writeFileSync(
    piPath,
    `#!/usr/bin/env bash
printf '%s' '{not-json'
`,
  );
  fs.chmodSync(piPath, 0o755);

  try {
    process.env.PATH = `${tempDir}:${previousPath || ""}`;
    const result = await spawnPiSubagent({
      tools: "read",
      systemPrompt: "ROLE: test",
      objective: "Say hello",
      model: "mock/provider",
      sessionFile,
    });

    assert.equal(result.exitCode, 1);
    assert.match(result.output, /Failed to parse 1 pi JSON event line/);
    assert.match(result.stderr || "", /Failed to parse 1 pi JSON event line/);
  } finally {
    process.env.PATH = previousPath;
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test("spawnPiSubagent propagates assistant stop-reason failures even when pi exits zero", async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "pi-orch-subagent-stopreason-"));
  const piPath = path.join(tempDir, "pi");
  const sessionFile = path.join(tempDir, "session.json");
  const previousPath = process.env.PATH;

  fs.writeFileSync(
    piPath,
    `#!/usr/bin/env bash
printf '%s\n' '{"type":"message_end","message":{"role":"assistant","content":[],"stopReason":"error","errorMessage":"boom"}}'
`,
  );
  fs.chmodSync(piPath, 0o755);

  try {
    process.env.PATH = `${tempDir}:${previousPath || ""}`;
    const result = await spawnPiSubagent({
      tools: "read",
      systemPrompt: "ROLE: test",
      objective: "Say hello",
      model: "mock/provider",
      sessionFile,
    });

    assert.equal(result.exitCode, 1);
    assert.equal(result.aborted, false);
    assert.equal(result.assistantStopReason, "error");
    assert.equal(result.assistantErrorMessage, "boom");
    assert.equal(result.output, "boom");
    assert.equal(result.executionState?.transport.aborted, false);
    assert.deepEqual(result.executionState?.protocol, {
      kind: "assistant_protocol",
      stopReason: "error",
      errorMessage: "boom",
    });
  } finally {
    process.env.PATH = previousPath;
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test("spawnPiSubagent keeps assistant aborts distinct from transport aborts", async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "pi-orch-subagent-assistant-abort-"));
  const piPath = path.join(tempDir, "pi");
  const sessionFile = path.join(tempDir, "session.json");
  const previousPath = process.env.PATH;

  fs.writeFileSync(
    piPath,
    `#!/usr/bin/env bash
printf '%s\n' '{"type":"message_end","message":{"role":"assistant","content":[],"stopReason":"aborted","errorMessage":"cancelled by policy"}}'
`,
  );
  fs.chmodSync(piPath, 0o755);

  try {
    process.env.PATH = `${tempDir}:${previousPath || ""}`;
    const result = await spawnPiSubagent({
      tools: "read",
      systemPrompt: "ROLE: test",
      objective: "Say hello",
      model: "mock/provider",
      sessionFile,
    });

    assert.equal(result.exitCode, 130);
    assert.equal(result.aborted, false);
    assert.equal(result.assistantStopReason, "aborted");
    assert.equal(result.output, "cancelled by policy");
    assert.equal(getExecutionStatus(result), "aborted");
    assert.equal(result.executionState?.transport.aborted, false);
    assert.deepEqual(result.executionState?.protocol, {
      kind: "assistant_protocol",
      stopReason: "aborted",
      errorMessage: "cancelled by policy",
    });
  } finally {
    process.env.PATH = previousPath;
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test("spawnPiSubagent returns semantic output for assistant length stops", async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "pi-orch-subagent-length-stop-"));
  const piPath = path.join(tempDir, "pi");
  const sessionFile = path.join(tempDir, "session.json");
  const previousPath = process.env.PATH;

  fs.writeFileSync(
    piPath,
    `#!/usr/bin/env bash
printf '%s\n' '{"type":"message_end","message":{"role":"assistant","content":[],"stopReason":"length"}}'
`,
  );
  fs.chmodSync(piPath, 0o755);

  try {
    process.env.PATH = `${tempDir}:${previousPath || ""}`;
    const result = await spawnPiSubagent({
      tools: "read",
      systemPrompt: "ROLE: test",
      objective: "Say hello",
      model: "mock/provider",
      sessionFile,
    });

    assert.equal(result.exitCode, 0);
    assert.equal(result.assistantStopReason, "length");
    assert.equal(getExecutionStatus(result), "error");
    assert.match(result.output, /response length limit/i);
  } finally {
    process.env.PATH = previousPath;
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test("spawnPiSubagent returns semantic output for assistant tool-use stops", async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "pi-orch-subagent-tooluse-stop-"));
  const piPath = path.join(tempDir, "pi");
  const sessionFile = path.join(tempDir, "session.json");
  const previousPath = process.env.PATH;

  fs.writeFileSync(
    piPath,
    `#!/usr/bin/env bash
printf '%s\n' '{"type":"message_end","message":{"role":"assistant","content":[],"stopReason":"toolUse"}}'
`,
  );
  fs.chmodSync(piPath, 0o755);

  try {
    process.env.PATH = `${tempDir}:${previousPath || ""}`;
    const result = await spawnPiSubagent({
      tools: "read",
      systemPrompt: "ROLE: test",
      objective: "Say hello",
      model: "mock/provider",
      sessionFile,
    });

    assert.equal(result.exitCode, 0);
    assert.equal(result.assistantStopReason, "toolUse");
    assert.equal(getExecutionStatus(result), "error");
    assert.match(result.output, /tool use before producing a final response/i);
  } finally {
    process.env.PATH = previousPath;
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test("spawnPiSubagent fails closed on unknown assistant stop reasons", async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "pi-orch-subagent-unknown-stopreason-"));
  const piPath = path.join(tempDir, "pi");
  const sessionFile = path.join(tempDir, "session.json");
  const previousPath = process.env.PATH;

  fs.writeFileSync(
    piPath,
    `#!/usr/bin/env bash
printf '%s\n' '{"type":"message_end","message":{"role":"assistant","content":[{"type":"text","text":"partial"}],"stopReason":"futureReason"}}'
`,
  );
  fs.chmodSync(piPath, 0o755);

  try {
    process.env.PATH = `${tempDir}:${previousPath || ""}`;
    const result = await spawnPiSubagent({
      tools: "read",
      systemPrompt: "ROLE: test",
      objective: "Say hello",
      model: "mock/provider",
      sessionFile,
    });

    assert.equal(result.exitCode, 1);
    assert.match(result.output, /Failed to parse 1 pi JSON event line/);
    assert.match(result.stderr || "", /Unknown assistant stop reason/);
    assert.deepEqual(result.executionState?.protocol, {
      kind: "assistant_protocol_parse_error",
      errorMessage:
        "Failed to parse 1 pi JSON event line(s).\nUnknown assistant stop reason from pi JSON protocol: futureReason",
    });
  } finally {
    process.env.PATH = previousPath;
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test("spawnPiSubagent respects abort signals", async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "pi-orch-subagent-abort-"));
  const piPath = path.join(tempDir, "pi");
  const sessionFile = path.join(tempDir, "session.json");
  const previousPath = process.env.PATH;

  fs.writeFileSync(
    piPath,
    `#!/usr/bin/env bash
sleep 2
`,
  );
  fs.chmodSync(piPath, 0o755);

  try {
    process.env.PATH = `${tempDir}:${previousPath || ""}`;
    const controller = new AbortController();
    setTimeout(() => controller.abort(), 20);

    const result = await spawnPiSubagent({
      tools: "read",
      systemPrompt: "ROLE: test",
      objective: "Say hello",
      model: "mock/provider",
      sessionFile,
      signal: controller.signal,
    });

    assert.equal(result.aborted, true);
    assert.match(result.output, /aborted/i);
  } finally {
    process.env.PATH = previousPath;
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test("spawnPiSubagent bounds assistant output and marks truncation", async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "pi-orch-subagent-truncated-"));
  const piPath = path.join(tempDir, "pi");
  const sessionFile = path.join(tempDir, "session.json");
  const previousPath = process.env.PATH;
  const longText = "x".repeat(64);

  fs.writeFileSync(
    piPath,
    `#!/usr/bin/env bash
printf '%s' ${JSON.stringify(
      JSON.stringify({
        type: "message_end",
        message: {
          role: "assistant",
          content: [{ type: "text", text: longText }],
        },
      }),
    )}
`,
  );
  fs.chmodSync(piPath, 0o755);

  try {
    process.env.PATH = `${tempDir}:${previousPath || ""}`;
    const result = await spawnPiSubagent({
      tools: "read",
      systemPrompt: "ROLE: test",
      objective: "Say hello",
      model: "mock/provider",
      sessionFile,
      maxOutputChars: 16,
    });

    assert.equal(result.outputTruncated, true);
    assert.match(result.output, /assistant output truncated/);
    assert.ok(result.output.startsWith("x".repeat(16)));
  } finally {
    process.env.PATH = previousPath;
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test("spawnPiSubagent fails when an event line exceeds the buffer limit without a newline", async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "pi-orch-subagent-buffer-"));
  const piPath = path.join(tempDir, "pi");
  const sessionFile = path.join(tempDir, "session.json");
  const previousPath = process.env.PATH;

  fs.writeFileSync(
    piPath,
    `#!/usr/bin/env bash
printf '%s' '0123456789abcdefghijklmnopqrstuvwxyz'
`,
  );
  fs.chmodSync(piPath, 0o755);

  try {
    process.env.PATH = `${tempDir}:${previousPath || ""}`;
    const result = await spawnPiSubagent({
      tools: "read",
      systemPrompt: "ROLE: test",
      objective: "Say hello",
      model: "mock/provider",
      sessionFile,
      maxEventBufferBytes: 8,
    });

    assert.equal(result.exitCode, 1);
    assert.match(result.stderr || "", /event buffer exceeded 8 bytes/);
  } finally {
    process.env.PATH = previousPath;
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test("full team includes every registered agent profile", () => {
  assert.deepEqual(AGENT_TEAMS.full, ["builder", "researcher", "reviewer", "scout"]);
});

test("resolveAgentForTeam fails closed instead of silently swapping agent roles", () => {
  const allowed = resolveAgentForTeam("researcher", "full");
  assert.equal(allowed.ok, true);
  if (allowed.ok) {
    assert.equal(allowed.agent, "researcher");
  }

  const rejected = resolveAgentForTeam("builder", "quality");
  assert.equal(rejected.ok, false);
  if (!rejected.ok) {
    assert.match(rejected.error, /does not allow agent 'builder'/);
    assert.deepEqual(rejected.allowedAgents, ["reviewer", "researcher"]);
  }

  const unknownTeam = resolveAgentForTeam("builder", "fulll");
  assert.equal(unknownTeam.ok, false);
  if (!unknownTeam.ok) {
    assert.match(unknownTeam.error, /Unknown agent team: fulll/);
    assert.deepEqual(unknownTeam.allowedAgents, []);
  }

  const prototypeTeam = resolveAgentForTeam("scout", "constructor");
  assert.equal(prototypeTeam.ok, false);
  if (!prototypeTeam.ok) {
    assert.match(prototypeTeam.error, /Unknown agent team: constructor/);
    assert.deepEqual(prototypeTeam.allowedAgents, []);
  }
});

test("session team store isolates team selections by session manager", () => {
  const store = createSessionTeamStore();
  const sessionA = { sessionManager: { id: "a" } };
  const sessionB = { sessionManager: { id: "b" } };

  assert.equal(store.getTeam(sessionA), "full");
  assert.equal(store.getTeam(sessionB), "full");

  assert.equal(store.setTeam(sessionA, "quality"), true);
  assert.equal(store.getTeam(sessionA), "quality");
  assert.equal(store.getTeam(sessionB), "full");
});

test("session team store persists team selections by session key", () => {
  const store = createSessionTeamStore();
  const firstCtx = { sessionKey: "session-key-1" };
  const secondCtx = { sessionKey: "session-key-1" };
  const otherCtx = { sessionKey: "session-key-2" };

  assert.equal(store.setTeam(firstCtx, "quality"), true);
  assert.equal(store.getTeam(secondCtx), "quality");
  assert.equal(store.getTeam(otherCtx), "full");
});

test("session team store preserves team selections across session identity shape changes", () => {
  const store = createSessionTeamStore();
  const sessionManager = { id: "session-a" };

  assert.equal(store.setTeam({ sessionManager }, "quality"), true);
  assert.equal(store.getTeam({ sessionManager, sessionKey: "session-key-a" }), "quality");
  assert.equal(store.getTeam({ sessionKey: "session-key-a" }), "quality");
});

test("session team store evicts the oldest session key when capacity is exceeded", () => {
  const store = createSessionTeamStore("full", { maxSessionKeys: 2 });

  assert.equal(store.setTeam({ sessionKey: "session-key-1" }, "quality"), true);
  assert.equal(store.setTeam({ sessionKey: "session-key-2" }, "implement"), true);
  assert.equal(store.getTeam({ sessionKey: "session-key-1" }), "quality");

  assert.equal(store.setTeam({ sessionKey: "session-key-3" }, "explore"), true);
  assert.equal(store.getTeam({ sessionKey: "session-key-1" }), "quality");
  assert.equal(store.getTeam({ sessionKey: "session-key-2" }), "full");
  assert.equal(store.getTeam({ sessionKey: "session-key-3" }), "explore");
});

test("session team store clamps non-positive capacity to one retained session key", () => {
  const store = createSessionTeamStore("full", { maxSessionKeys: 0 });

  assert.equal(store.setTeam({ sessionKey: "session-key-1" }, "quality"), true);
  assert.equal(store.setTeam({ sessionKey: "session-key-2" }, "explore"), true);
  assert.equal(store.getTeam({ sessionKey: "session-key-1" }), "full");
  assert.equal(store.getTeam({ sessionKey: "session-key-2" }), "explore");
});

test("resolveConfiguredDefaultAgentTeam ignores invalid configured defaults", () => {
  assert.equal(resolveConfiguredDefaultAgentTeam("quality"), "quality");
  assert.equal(resolveConfiguredDefaultAgentTeam("invalid-team"), "full");
  assert.equal(resolveConfiguredDefaultAgentTeam(undefined), "full");
});

test("session team store refuses to persist team selections without session identity", () => {
  const store = createSessionTeamStore();

  assert.equal(store.setTeam(undefined, "quality"), false);
  assert.equal(store.getTeam(undefined), "full");
});

test("execution status classifier honors explicit transport/protocol precedence", () => {
  assert.equal(getExecutionStatus({ exitCode: 0 }), "done");
  assert.equal(getExecutionStatus({ exitCode: 0, timedOut: true }), "timed_out");
  assert.equal(getExecutionStatus({ exitCode: 0, aborted: true }), "aborted");
  assert.equal(getExecutionStatus({ exitCode: 1 }), "error");
  assert.equal(getExecutionStatus({ exitCode: 0, assistantStopReason: "stop" }), "done");
  assert.equal(getExecutionStatus({ exitCode: 0, assistantStopReason: "error" }), "error");
  assert.equal(getExecutionStatus({ exitCode: 0, assistantStopReason: "aborted" }), "aborted");
  assert.equal(getExecutionStatus({ exitCode: 0, assistantStopReason: "toolUse" }), "error");
  assert.equal(
    getExecutionStatus({
      exitCode: 0,
      executionState: {
        transport: { kind: "transport", exitCode: 0, aborted: false, timedOut: false },
        protocol: {
          kind: "assistant_protocol_parse_error",
          errorMessage: "bad frame",
        },
      },
    }),
    "error",
  );
  assert.equal(
    getExecutionStatus({
      exitCode: 99,
      aborted: true,
      assistantStopReason: "stop",
      executionState: {
        transport: { kind: "transport", exitCode: 0, aborted: false, timedOut: false },
        protocol: {
          kind: "assistant_protocol",
          stopReason: "aborted",
        },
      },
    }),
    "aborted",
  );
  assert.equal(isExecutionSuccess({ exitCode: 0 }), true);
  assert.equal(isExecutionSuccess({ exitCode: 0, timedOut: true }), false);
  assert.equal(isExecutionSuccess({ exitCode: 0, aborted: true }), false);
  assert.equal(isExecutionSuccess({ exitCode: 0, assistantStopReason: "error" }), false);
});

test("finalizeExecutionEffects skips evidence writes for aborted executions", async () => {
  let evidenceCalls = 0;

  const outcome = await finalizeExecutionEffects({
    result: { exitCode: 130, aborted: true },
    createEvidenceEntry: () => ({
      check_type: "validation:aborted",
      result: "fail",
    }),
    async recordEvidence() {
      evidenceCalls += 1;
      return { ok: true, via: "ak" };
    },
  });

  assert.equal(outcome.status, "aborted");
  assert.equal(outcome.success, false);
  assert.deepEqual(outcome.evidence, { ok: false, via: "skipped", reason: "aborted" });
  assert.equal(evidenceCalls, 0);
});

test("finalizeExecutionEffects records fail evidence for timed-out executions", async () => {
  const entries = [];

  const outcome = await finalizeExecutionEffects({
    result: { exitCode: 124, timedOut: true },
    createEvidenceEntry: ({ status, success }) => ({
      check_type: `validation:${status}`,
      result: success ? "pass" : "fail",
      details: { status, success },
    }),
    async recordEvidence(entry) {
      entries.push(entry);
      return { ok: true, via: "sql-fallback", akError: "ak failed" };
    },
  });

  assert.equal(outcome.status, "timed_out");
  assert.equal(outcome.success, false);
  assert.equal(outcome.evidence.via, "sql-fallback");
  assert.deepEqual(entries, [
    {
      check_type: "validation:timed_out",
      result: "fail",
      details: { status: "timed_out", success: false },
    },
  ]);
});

test("recordEvidence falls back to SQL after non-timeout ak failure", async () => {
  let sqlWrites = 0;

  const outcome = await recordEvidence(
    {
      check_type: "validation:fallback",
      result: "fail",
      details: { reason: "ak-down" },
    },
    undefined,
    {
      akPath: "/tmp/fake-ak",
      societyDb: "/tmp/fake.db",
      async runAk() {
        return {
          ok: false,
          stdout: "",
          stderr: "ak unavailable",
        };
      },
      async runSql() {
        sqlWrites += 1;
        return { ok: true, value: undefined };
      },
    },
  );

  assert.equal(outcome.ok, true);
  assert.equal(outcome.via, "sql-fallback");
  assert.equal(sqlWrites, 1);
  assert.match(outcome.akError || "", /ak unavailable/);
});

test("recordEvidence refuses SQL fallback after ak timeout", async () => {
  let sqlWrites = 0;

  const outcome = await recordEvidence(
    {
      check_type: "validation:timeout",
      result: "fail",
    },
    undefined,
    {
      akPath: "/tmp/fake-ak",
      societyDb: "/tmp/fake.db",
      async runAk() {
        return {
          ok: false,
          stdout: "",
          stderr: "ak timed out",
          timedOut: true,
        };
      },
      async runSql() {
        sqlWrites += 1;
        return { ok: true, value: undefined };
      },
    },
  );

  assert.equal(outcome.ok, false);
  assert.equal(outcome.via, "failed");
  assert.equal(sqlWrites, 0);
  assert.match(outcome.akError || "", /ak timed out/);
});

test("agents-team command fails clearly when no session identity is available", async () => {
  const commands = new Map();
  extension({
    registerTool() {},
    registerCommand(name, command) {
      commands.set(name, command);
    },
    on() {},
  });

  const notifications = [];
  const command = commands.get("agents-team");
  assert.ok(command, "expected agents-team command to register");

  await command.handler("", {
    hasUI: true,
    cwd: process.cwd(),
    ui: {
      async select() {
        return "quality — reviewer, researcher";
      },
      notify(message, level) {
        notifications.push({ message, level });
      },
    },
  });

  assert.deepEqual(notifications, [
    {
      message: "Cannot set team for this session because no session identity is available.",
      level: "error",
    },
  ]);
});

test("agents-team command stores team selection per session manager", async () => {
  const commands = new Map();
  const tools = new Map();
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "pi-orch-session-manager-"));

  try {
    extension({
      registerTool(tool) {
        tools.set(tool.name, tool);
      },
      registerCommand(name, command) {
        commands.set(name, command);
      },
      on() {},
    });

    const command = commands.get("agents-team");
    const loopTool = tools.get("loop_execute");
    assert.ok(command, "expected agents-team command to register");
    assert.ok(loopTool, "expected loop_execute tool to register");

    const sessionA = { id: "session-a" };
    const sessionB = { id: "session-b" };
    const notifications = [];

    await command.handler("", {
      hasUI: true,
      sessionManager: sessionA,
      cwd: tempDir,
      ui: {
        async select() {
          return "quality — reviewer, researcher";
        },
        notify(message, level) {
          notifications.push({ message, level });
        },
      },
    });

    const blocked = await loopTool.execute(
      "tc-1",
      { loop: "strategic", objective: "Plan the migration" },
      undefined,
      undefined,
      { cwd: tempDir, sessionManager: sessionA, model: undefined },
    );
    assert.equal(blocked.details.ok, false);
    assert.equal(blocked.details.error, "loop-agent-team-mismatch");
    assert.match(blocked.content[0].text, /Loop 'strategic' is incompatible with the active team/);

    const sessionBAbort = new AbortController();
    sessionBAbort.abort();
    const notBlockedBySessionASelection = await loopTool.execute(
      "tc-2",
      { loop: "strategic", objective: "Plan the migration" },
      sessionBAbort.signal,
      undefined,
      { cwd: tempDir, sessionManager: sessionB, model: undefined },
    );
    assert.notEqual(notBlockedBySessionASelection.details.error, "loop-agent-team-mismatch");

    assert.deepEqual(notifications, [
      {
        message: "Team: quality (reviewer, researcher)",
        level: "info",
      },
    ]);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test("agents-team command stores team selection per session key", async () => {
  const commands = new Map();
  const tools = new Map();
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "pi-orch-session-key-"));

  try {
    extension({
      registerTool(tool) {
        tools.set(tool.name, tool);
      },
      registerCommand(name, command) {
        commands.set(name, command);
      },
      on() {},
    });

    const command = commands.get("agents-team");
    const loopTool = tools.get("loop_execute");
    assert.ok(command, "expected agents-team command to register");
    assert.ok(loopTool, "expected loop_execute tool to register");

    await command.handler("", {
      hasUI: true,
      sessionKey: "session-key-A",
      cwd: tempDir,
      ui: {
        async select() {
          return "quality — reviewer, researcher";
        },
        notify() {},
      },
    });

    const blocked = await loopTool.execute(
      "tc-3",
      { loop: "strategic", objective: "Plan the migration" },
      undefined,
      undefined,
      { cwd: tempDir, sessionKey: "session-key-A", model: undefined },
    );
    assert.equal(blocked.details.ok, false);
    assert.equal(blocked.details.error, "loop-agent-team-mismatch");

    const otherSessionAbort = new AbortController();
    otherSessionAbort.abort();
    const notBlockedBySessionKeySelection = await loopTool.execute(
      "tc-4",
      { loop: "strategic", objective: "Plan the migration" },
      otherSessionAbort.signal,
      undefined,
      { cwd: tempDir, sessionKey: "session-key-B", model: undefined },
    );
    assert.notEqual(notBlockedBySessionKeySelection.details.error, "loop-agent-team-mismatch");
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test("validateLoopAgentsForTeam surfaces incompatible loop phases before execution", () => {
  const failures = validateLoopAgentsForTeam({
    phases: BUILT_IN_PLUGINS.strategic.phases,
    agents: BUILT_IN_PLUGINS.strategic.agents,
    activeTeam: "implement",
  });

  assert.deepEqual(
    failures.map((entry) => entry.phase),
    ["mission", "intelligence"],
  );
  assert.match(failures[0].error, /does not allow agent 'researcher'/);
  assert.match(failures[1].error, /does not allow agent 'scout'/);
});

test("loop_execute reports loop/team mismatches before execution starts", async () => {
  let registeredTool;
  registerLoopTools(
    {
      registerTool(tool) {
        registeredTool = tool;
      },
    },
    BUILT_IN_PLUGINS,
    "/tmp/nonexistent-vault",
    (agent, ctx) => {
      assert.equal(ctx.cwd, process.cwd());
      return resolveAgentForTeam(agent, "implement");
    },
  );

  assert.ok(registeredTool, "expected loop_execute to register");
  const result = await registeredTool.execute(
    "tool-call-id",
    { loop: "strategic", objective: "Plan the migration" },
    undefined,
    undefined,
    { cwd: process.cwd(), model: undefined },
  );

  assert.equal(result.details.ok, false);
  assert.equal(result.details.error, "loop-agent-team-mismatch");
  assert.match(result.content[0].text, /Loop 'strategic' is incompatible with the active team:/);
  assert.match(result.content[0].text, /mission: researcher/);
  assert.match(result.content[0].text, /intelligence: scout/);
});
