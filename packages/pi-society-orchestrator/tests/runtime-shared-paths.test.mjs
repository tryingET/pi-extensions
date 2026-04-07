import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { loadExecutionSeamCase } from "../../../governance/execution-seam-cases/index.mjs";
import extension from "../extensions/society-orchestrator.ts";
import { BUILT_IN_PLUGINS, registerLoopTools } from "../src/loops/engine.ts";
import { AGENT_PROFILES } from "../src/runtime/agent-profiles.ts";
import {
  AGENT_TEAMS,
  resolveAgentForTeam,
  resolveConfiguredDefaultAgentTeam,
  validateLoopAgentsForTeam,
} from "../src/runtime/agent-routing.ts";
import { resolveAkPath, runAkCommand, runAkCommandAsync } from "../src/runtime/ak.ts";
import { finalizeExecutionEffects, recordEvidence } from "../src/runtime/evidence.ts";
import { getExecutionStatus, isExecutionSuccess } from "../src/runtime/execution-status.ts";
import { superviseProcess } from "../src/runtime/process-supervisor.ts";
import {
  createRuntimeTruthSnapshot,
  formatRuntimeStatusReport,
} from "../src/runtime/status-semantics.ts";
import {
  buildCombinedSystemPrompt,
  createOrchestratorSubagentExecutor,
  toExecutionLike,
} from "../src/runtime/subagent.ts";
import { createSessionTeamStore } from "../src/runtime/team-state.ts";

const timeoutEmptyOutputCase = loadExecutionSeamCase("timeout-empty-output");
const timeoutWhitespaceOutputCase = loadExecutionSeamCase("timeout-whitespace-output");
const assistantProtocolSemanticErrorCase = loadExecutionSeamCase(
  "assistant-protocol-semantic-error",
);
const assistantProtocolParseErrorCase = loadExecutionSeamCase("assistant-protocol-parse-error");

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

test("resolveAkPath prefers a repo-local scripts/ak.sh wrapper when available", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "pi-orch-ak-wrapper-"));
  const repoRoot = path.join(tempDir, "repo");
  const nestedCwd = path.join(repoRoot, "packages", "demo");
  const wrapperPath = path.join(repoRoot, "scripts", "ak.sh");
  const previousAgentKernel = process.env.AGENT_KERNEL;

  fs.mkdirSync(path.dirname(wrapperPath), { recursive: true });
  fs.mkdirSync(nestedCwd, { recursive: true });
  fs.writeFileSync(wrapperPath, "#!/usr/bin/env sh\nexit 0\n");
  fs.chmodSync(wrapperPath, 0o755);

  try {
    delete process.env.AGENT_KERNEL;
    assert.equal(resolveAkPath({ cwd: nestedCwd }), wrapperPath);
  } finally {
    if (previousAgentKernel === undefined) {
      delete process.env.AGENT_KERNEL;
    } else {
      process.env.AGENT_KERNEL = previousAgentKernel;
    }
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test("resolveAkPath honors AGENT_KERNEL over any repo-local wrapper", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "pi-orch-ak-explicit-"));
  const repoRoot = path.join(tempDir, "repo");
  const nestedCwd = path.join(repoRoot, "packages", "demo");
  const wrapperPath = path.join(repoRoot, "scripts", "ak.sh");
  const previousAgentKernel = process.env.AGENT_KERNEL;

  fs.mkdirSync(path.dirname(wrapperPath), { recursive: true });
  fs.mkdirSync(nestedCwd, { recursive: true });
  fs.writeFileSync(wrapperPath, "#!/usr/bin/env sh\nexit 0\n");
  fs.chmodSync(wrapperPath, 0o755);

  try {
    process.env.AGENT_KERNEL = "/tmp/explicit-ak";
    assert.equal(resolveAkPath({ cwd: nestedCwd }), "/tmp/explicit-ak");
  } finally {
    if (previousAgentKernel === undefined) {
      delete process.env.AGENT_KERNEL;
    } else {
      process.env.AGENT_KERNEL = previousAgentKernel;
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

test("runAkCommandAsync runs ak commands from the provided cwd", async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "pi-orch-ak-cwd-"));
  const nestedCwd = path.join(tempDir, "nested", "repo");
  const marker = path.join(tempDir, "cwd.txt");
  const akPath = path.join(tempDir, "ak-cwd.sh");

  fs.mkdirSync(nestedCwd, { recursive: true });
  fs.writeFileSync(
    akPath,
    `#!/usr/bin/env bash
pwd > ${JSON.stringify(marker)}
printf 'cwd-ok'
`,
  );
  fs.chmodSync(akPath, 0o755);

  try {
    const result = await runAkCommandAsync({
      akPath,
      societyDb: "/tmp/cwd-society.db",
      args: [],
      cwd: nestedCwd,
    });
    assert.equal(result.ok, true);
    assert.equal(result.stdout, "cwd-ok");
    assert.equal(fs.readFileSync(marker, "utf8").trim(), nestedCwd);
  } finally {
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

test("createOrchestratorSubagentExecutor reuses the ASC public runtime for orchestrator dispatch", async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "pi-orch-asc-runtime-"));
  const calls = [];
  const controller = new AbortController();

  try {
    const executor = createOrchestratorSubagentExecutor({
      sessionsDir: tempDir,
      spawner: async (def, model, ctx, state, signal) => {
        calls.push({ def, model, ctx, state, signal });
        return {
          output: "delegated answer",
          exitCode: 0,
          elapsed: 1500,
          status: "done",
        };
      },
    });

    const result = await executor.execute({
      agentProfile: AGENT_PROFILES.reviewer,
      cognitiveToolName: "audit",
      cognitiveToolContent: "FRAMEWORK: audit deeply",
      objective: "Review the evidence trail",
      model: "mock/provider",
      cwd: "/tmp/worktree",
      contextHeading: "OBJECTIVE",
      contextBody: "Review the evidence trail",
      extraSections: ["## LOOP\nphase=orient"],
      signal: controller.signal,
    });

    assert.equal(result.ok, true);
    assert.equal(result.details.status, "done");
    assert.equal(result.details.fullOutput, "delegated answer");
    assert.equal(calls.length, 1);
    assert.equal(calls[0].model, "mock/provider");
    assert.equal(calls[0].ctx.cwd, "/tmp/worktree");
    assert.equal(calls[0].state.sessionsDir, tempDir);
    assert.equal(calls[0].signal, controller.signal);
    assert.equal(calls[0].def.name, "reviewer-audit");
    assert.equal(calls[0].def.tools, AGENT_PROFILES.reviewer.tools);
    assert.match(calls[0].def.systemPrompt || "", /You are a code reviewer agent/);
    assert.match(calls[0].def.systemPrompt || "", /FRAMEWORK: audit deeply/);
    assert.match(calls[0].def.systemPrompt || "", /## OBJECTIVE\n\nReview the evidence trail/);
    assert.match(calls[0].def.systemPrompt || "", /## LOOP\nphase=orient/);
    assert.match(result.text, /\[custom\] done/);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test("toExecutionLike preserves timeout fallback text from the ASC public runtime casebook", () => {
  const execution = toExecutionLike(timeoutEmptyOutputCase.dispatchResult);

  assert.equal(execution.output, timeoutEmptyOutputCase.expected.executionLikeOutput);
  assert.equal(execution.exitCode, timeoutEmptyOutputCase.dispatchResult.details.exitCode);
  assert.equal(execution.elapsed, timeoutEmptyOutputCase.dispatchResult.details.elapsed);
  assert.equal(execution.timedOut, true);
  assert.equal(execution.aborted, false);
  assert.deepEqual(
    execution.executionState,
    timeoutEmptyOutputCase.dispatchResult.details.executionState,
  );
  assert.equal(execution.failureKind, timeoutEmptyOutputCase.expected.failureKind);
  assert.equal(getExecutionStatus(execution), timeoutEmptyOutputCase.expected.executionLikeStatus);
});

test("toExecutionLike prefers the ASC display output when raw fullOutput is whitespace-only", () => {
  const execution = toExecutionLike(timeoutWhitespaceOutputCase.dispatchResult);

  assert.equal(execution.output, timeoutWhitespaceOutputCase.expected.executionLikeOutput);
  assert.equal(execution.exitCode, timeoutWhitespaceOutputCase.dispatchResult.details.exitCode);
  assert.equal(execution.elapsed, timeoutWhitespaceOutputCase.dispatchResult.details.elapsed);
  assert.equal(execution.timedOut, true);
  assert.equal(execution.aborted, false);
  assert.deepEqual(
    execution.executionState,
    timeoutWhitespaceOutputCase.dispatchResult.details.executionState,
  );
  assert.equal(execution.failureKind, timeoutWhitespaceOutputCase.expected.failureKind);
  assert.equal(
    getExecutionStatus(execution),
    timeoutWhitespaceOutputCase.expected.executionLikeStatus,
  );
});

test("toExecutionLike preserves assistant protocol failures from the execution seam casebook", () => {
  const execution = toExecutionLike(assistantProtocolSemanticErrorCase.dispatchResult);

  assert.equal(execution.output, assistantProtocolSemanticErrorCase.expected.executionLikeOutput);
  assert.equal(
    execution.assistantStopReason,
    assistantProtocolSemanticErrorCase.expected.assistantStopReason,
  );
  assert.equal(
    execution.assistantErrorMessage,
    assistantProtocolSemanticErrorCase.expected.assistantErrorMessage,
  );
  assert.equal(execution.failureKind, assistantProtocolSemanticErrorCase.expected.failureKind);
  assert.equal(
    getExecutionStatus(execution),
    assistantProtocolSemanticErrorCase.expected.executionLikeStatus,
  );
});

test("toExecutionLike preserves parse failures from the execution seam casebook", () => {
  const execution = toExecutionLike(assistantProtocolParseErrorCase.dispatchResult);

  assert.equal(execution.output, assistantProtocolParseErrorCase.expected.executionLikeOutput);
  assert.equal(execution.failureKind, assistantProtocolParseErrorCase.expected.failureKind);
  assert.deepEqual(
    execution.executionState,
    assistantProtocolParseErrorCase.dispatchResult.details.executionState,
  );
  assert.equal(
    getExecutionStatus(execution),
    assistantProtocolParseErrorCase.expected.executionLikeStatus,
  );
});

test("createOrchestratorSubagentExecutor preserves truncation metadata from ASC output policy", async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "pi-orch-asc-truncation-"));

  try {
    const executor = createOrchestratorSubagentExecutor({
      sessionsDir: tempDir,
      spawner: async () => ({
        output: "x".repeat(70_000),
        exitCode: 0,
        elapsed: 25,
        status: "done",
      }),
    });

    const result = await executor.execute({
      agentProfile: AGENT_PROFILES.reviewer,
      cognitiveToolContent: "FRAMEWORK: audit deeply",
      objective: "Review truncation handling",
      model: "mock/provider",
      cwd: "/tmp/worktree",
    });

    assert.equal(result.details.outputTruncated, true);
    assert.match(result.details.fullOutput || "", /assistant output truncated/);
  } finally {
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

test("recordEvidence uses ak when the current cwd is nested inside a registered repo root", async () => {
  const repoRoot = path.join(os.tmpdir(), `pi-orch-registered-root-${Date.now()}`);
  const cwd = path.join(repoRoot, "packages", "demo");
  const akCalls = [];
  let sqlWrites = 0;

  const outcome = await recordEvidence(
    {
      check_type: "validation:registered-ancestor",
      result: "pass",
    },
    undefined,
    {
      akPath: "/tmp/fake-ak",
      societyDb: "/tmp/fake.db",
      cwd,
      async querySqliteJson() {
        return { ok: true, value: [{ path: repoRoot }] };
      },
      async runAk(params) {
        akCalls.push(params);
        return {
          ok: true,
          stdout: "ak-ok",
          stderr: "",
        };
      },
      async runSql() {
        sqlWrites += 1;
        return { ok: true, value: undefined };
      },
    },
  );

  assert.equal(outcome.ok, true);
  assert.equal(outcome.via, "ak");
  assert.equal(akCalls.length, 1);
  assert.equal(akCalls[0].cwd, cwd);
  assert.deepEqual(akCalls[0].args.slice(0, 2), ["evidence", "record"]);
  assert.equal(sqlWrites, 0);
});

test("recordEvidence bootstraps a missing repo registration through ak before writing evidence", async () => {
  const repoRoot = path.join(os.tmpdir(), `pi-orch-bootstrap-root-${Date.now()}`);
  const cwd = path.join(repoRoot, "packages", "demo");
  const bootstrapCalls = [];
  const akCalls = [];
  let sqlWrites = 0;

  const outcome = await recordEvidence(
    {
      check_type: "validation:bootstrap-register",
      result: "pass",
    },
    undefined,
    {
      akPath: "/tmp/fake-ak",
      societyDb: "/tmp/fake.db",
      cwd,
      async querySqliteJson() {
        return { ok: true, value: [] };
      },
      async runRepoBootstrap(params) {
        bootstrapCalls.push(params);
        return {
          ok: true,
          stdout: "",
          stderr: "",
          report: {
            requested_path: path.resolve(cwd),
            resolved_repo_root: repoRoot,
            classification: "auto_safe",
            outcome: "registered",
            reason: "safe leaf repo",
            guidance: "Registered canonical repo root.",
            registered_repo: {
              path: repoRoot,
              company: "softwareco",
              archetype: "project",
              layer: "L2",
              generated_from: null,
              copier_answers: null,
              ontology_ref: null,
              last_sync: "2026-04-01T00:00:00Z",
              created_at: "2026-04-01T00:00:00Z",
            },
            mutation_performed: true,
            evidence_id: 1,
            governance_receipt_id: 2,
          },
        };
      },
      async runAk(params) {
        akCalls.push(params);
        return {
          ok: true,
          stdout: "ak-ok",
          stderr: "",
        };
      },
      async runSql() {
        sqlWrites += 1;
        return { ok: true, value: undefined };
      },
    },
  );

  assert.equal(outcome.ok, true);
  assert.equal(outcome.via, "ak");
  assert.equal(bootstrapCalls.length, 1);
  assert.equal(bootstrapCalls[0].requestedPath, path.resolve(cwd));
  assert.equal(akCalls.length, 1);
  assert.equal(akCalls[0].cwd, path.resolve(cwd));
  assert.equal(sqlWrites, 0);
});

test("recordEvidence writes directly via SQL when guarded bootstrap excludes the current cwd", async () => {
  const cwd = path.join(os.tmpdir(), `pi-orch-excluded-${Date.now()}`);
  let bootstrapCalls = 0;
  let akCalls = 0;
  let sqlWrites = 0;

  const outcome = await recordEvidence(
    {
      check_type: "validation:unregistered-repo",
      result: "pass",
      details: { repo: cwd },
    },
    undefined,
    {
      akPath: "/tmp/fake-ak",
      societyDb: "/tmp/fake.db",
      cwd,
      async querySqliteJson() {
        return { ok: true, value: [] };
      },
      async runRepoBootstrap() {
        bootstrapCalls += 1;
        return {
          ok: true,
          stdout: "",
          stderr: "",
          report: {
            requested_path: path.resolve(cwd),
            resolved_repo_root: path.resolve(cwd),
            classification: "excluded",
            outcome: "excluded",
            reason: "outside bounded workspace",
            guidance: "No mutation was performed.",
            registered_repo: null,
            mutation_performed: false,
            evidence_id: 1,
            governance_receipt_id: 2,
          },
        };
      },
      async runAk() {
        akCalls += 1;
        return {
          ok: false,
          stdout: "",
          stderr: "ak should not have been called",
        };
      },
      async runSql() {
        sqlWrites += 1;
        return { ok: true, value: undefined };
      },
    },
  );

  assert.equal(outcome.ok, true);
  assert.equal(outcome.via, "sql-direct");
  assert.equal(bootstrapCalls, 1);
  assert.equal(akCalls, 0);
  assert.equal(sqlWrites, 1);
  assert.equal(outcome.akError, undefined);
});

test("recordEvidence caches excluded guarded-bootstrap results for the same cwd", async () => {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "pi-orch-bootstrap-cache-"));
  let bootstrapCalls = 0;
  let sqlWrites = 0;

  try {
    const config = {
      akPath: "/tmp/fake-ak",
      societyDb: "/tmp/fake.db",
      cwd,
      async querySqliteJson() {
        return { ok: true, value: [] };
      },
      async runRepoBootstrap() {
        bootstrapCalls += 1;
        return {
          ok: true,
          stdout: "",
          stderr: "",
          report: {
            requested_path: path.resolve(cwd),
            resolved_repo_root: path.resolve(cwd),
            classification: "excluded",
            outcome: "excluded",
            reason: "not inside a canonical repo",
            guidance: "No mutation was performed.",
            registered_repo: null,
            mutation_performed: false,
            evidence_id: 1,
            governance_receipt_id: 2,
          },
        };
      },
      async runSql() {
        sqlWrites += 1;
        return { ok: true, value: undefined };
      },
    };

    const first = await recordEvidence(
      {
        check_type: "validation:bootstrap-cache-first",
        result: "pass",
      },
      undefined,
      config,
    );
    const second = await recordEvidence(
      {
        check_type: "validation:bootstrap-cache-second",
        result: "pass",
      },
      undefined,
      config,
    );

    assert.equal(first.via, "sql-direct");
    assert.equal(second.via, "sql-direct");
    assert.equal(bootstrapCalls, 1);
    assert.equal(sqlWrites, 2);
  } finally {
    fs.rmSync(cwd, { recursive: true, force: true });
  }
});

test("recordEvidence refuses direct SQL fallback after guarded bootstrap times out", async () => {
  let akCalls = 0;
  let sqlWrites = 0;

  const outcome = await recordEvidence(
    {
      check_type: "validation:bootstrap-timeout",
      result: "fail",
    },
    undefined,
    {
      akPath: "/tmp/fake-ak",
      societyDb: "/tmp/fake.db",
      cwd: "/tmp/pi-orch-bootstrap-timeout",
      async querySqliteJson() {
        return { ok: true, value: [] };
      },
      async runRepoBootstrap() {
        return {
          ok: false,
          stdout: "",
          stderr: "bootstrap timed out",
          timedOut: true,
        };
      },
      async runAk() {
        akCalls += 1;
        return {
          ok: true,
          stdout: "ak-ok",
          stderr: "",
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
  assert.equal(akCalls, 0);
  assert.equal(sqlWrites, 0);
  assert.match(outcome.akError || "", /bootstrap timed out/);
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

test("runtime status report centralizes the shared runtime truth descriptor", () => {
  const snapshot = createRuntimeTruthSnapshot({
    cwd: "/tmp/runtime-truth",
    model: "test-model",
    activeTeam: "quality",
    societyDbPath: "/tmp/society.db",
    societyDbAvailable: true,
    vaultAvailable: true,
    vaultSummary: "available (7 cognitive tools)",
  });

  const text = formatRuntimeStatusReport(snapshot);
  assert.match(text, /coordination owner: `pi-society-orchestrator`/);
  assert.match(text, /execution owner: `pi-autonomous-session-control`/);
  assert.match(text, /routing: `quality` \(reviewer, researcher\)/);
  assert.match(text, /footer left: `test-model · orchestrator→ASC`/);
  assert.match(text, /footer right: `Routing: quality`/);
});

test("runtime-status command opens a runtime truth inspector", async () => {
  const commands = new Map();
  extension({
    registerTool() {},
    registerCommand(name, command) {
      commands.set(name, command);
    },
    on() {},
  });

  const editors = [];
  const command = commands.get("runtime-status");
  assert.ok(command, "expected runtime-status command to register");

  await command.handler("", {
    hasUI: true,
    cwd: process.cwd(),
    model: { id: "test-model" },
    ui: {
      async editor(title, text) {
        editors.push({ title, text });
      },
      notify() {},
    },
  });

  assert.equal(editors.length, 1);
  assert.equal(editors[0].title, "Runtime Status");
  assert.match(editors[0].text, /^# Society Orchestrator Runtime Status/m);
  assert.match(editors[0].text, /routing selector: `\/agents-team`/);
  assert.match(editors[0].text, /inspector: `\/runtime-status`/);
  assert.match(editors[0].text, /footer left: `test-model · orchestrator→ASC`/);
  assert.match(editors[0].text, /footer right: `Routing: full`/);
});

test("session_start surfaces routing status and the orchestrator to ASC seam in the footer", async () => {
  const events = new Map();
  extension({
    registerTool() {},
    registerCommand() {},
    on(name, handler) {
      events.set(name, handler);
    },
  });

  const sessionStart = events.get("session_start");
  assert.ok(sessionStart, "expected session_start handler to register");

  const notifications = [];
  let footerFactory;
  await sessionStart(
    {},
    {
      hasUI: true,
      cwd: process.cwd(),
      model: { id: "test-model" },
      ui: {
        notify(message, level) {
          notifications.push({ message, level });
        },
        setFooter(factory) {
          footerFactory = factory;
        },
      },
    },
  );

  assert.equal(notifications.length, 1);
  assert.match(notifications[0].message, /Routing: full/);
  assert.match(notifications[0].message, /\/runtime-status\s+Inspect runtime truth/);
  assert.doesNotMatch(notifications[0].message, /Team: full/);
  assert.ok(footerFactory, "expected session_start to register a footer");

  const footer = footerFactory(
    undefined,
    {
      fg(_color, text) {
        return text;
      },
    },
    undefined,
  );
  const rendered = footer.render(120)[0];
  assert.match(rendered, /orchestrator→ASC/);
  assert.match(rendered, /Routing: full/);
  assert.doesNotMatch(rendered, /· orchestra(?:\s|$)/);
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
        message: "Routing: quality (reviewer, researcher)",
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
