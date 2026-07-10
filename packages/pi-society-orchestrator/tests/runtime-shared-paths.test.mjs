import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
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
  getAgentTeamDisplayLabel,
  resolveAgentForTeam,
  resolveConfiguredDefaultAgentTeam,
  validateLoopAgentsForTeam,
} from "../src/runtime/agent-routing.ts";
import { resolveAkPath, runAkCommand, runAkCommandAsync } from "../src/runtime/ak.ts";
import {
  formatAkCloseFrameStatusSection,
  readAkCloseFrameStatus,
} from "../src/runtime/ak-close-frame-status.ts";
import { resetBoundaryTelemetry } from "../src/runtime/boundaries.ts";
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

async function waitForFooterMatch(footer, width, pattern, timeoutMs = 1000) {
  const deadline = Date.now() + timeoutMs;
  let rendered = footer.render(width)[0];
  while (!pattern.test(rendered) && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 50));
    rendered = footer.render(width)[0];
  }
  return rendered;
}

const timeoutEmptyOutputCase = loadExecutionSeamCase("timeout-empty-output");
const timeoutWhitespaceOutputCase = loadExecutionSeamCase("timeout-whitespace-output");
const assistantProtocolSemanticErrorCase = loadExecutionSeamCase(
  "assistant-protocol-semantic-error",
);
const assistantProtocolParseErrorCase = loadExecutionSeamCase("assistant-protocol-parse-error");
const assistantProtocolIncompleteCase = loadExecutionSeamCase("assistant-protocol-incomplete");

function createSessionUsageManager() {
  return {
    id: "runtime-status-test-session",
    getEntries() {
      return [
        {
          type: "message",
          message: {
            role: "assistant",
            usage: {
              input: 1200,
              output: 400,
              cacheRead: 300,
              cacheWrite: 200,
            },
          },
        },
      ];
    },
  };
}

function createContextUsage() {
  return {
    tokens: 20000,
    contextWindow: 128000,
    percent: 15.625,
  };
}

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
    const provenanceExtensionPath = path.join(tempDir, "pi-provenance.ts");
    fs.writeFileSync(provenanceExtensionPath, "export default function () {}\n");

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
      extensions: [provenanceExtensionPath],
      env: {
        PI_PROVENANCE_REVIEW_LANE_ID: "orch-lane-1",
        PI_PROVENANCE_OUTPUT_FILE: "/tmp/orch-lane-1.json",
      },
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
    assert.deepEqual(calls[0].def.extensionSources, [provenanceExtensionPath]);
    assert.deepEqual(calls[0].def.env, {
      PI_PROVENANCE_REVIEW_LANE_ID: "orch-lane-1",
      PI_PROVENANCE_OUTPUT_FILE: "/tmp/orch-lane-1.json",
    });
    assert.match(calls[0].def.systemPrompt || "", /You are a code reviewer agent/);
    assert.match(calls[0].def.systemPrompt || "", /FRAMEWORK: audit deeply/);
    assert.match(calls[0].def.systemPrompt || "", /## OBJECTIVE\n\nReview the evidence trail/);
    assert.match(calls[0].def.systemPrompt || "", /## LOOP\nphase=orient/);
    assert.match(result.text, /\[custom\] done/);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test("createOrchestratorSubagentExecutor forwards model context for ASC child extension selection", async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "pi-orch-asc-model-context-"));
  const previous = process.env.PI_MULTI_PASS_EXTENSION;
  const calls = [];

  try {
    const multiPassExtensionPath = path.join(tempDir, "multi-pass.ts");
    fs.writeFileSync(multiPassExtensionPath, "export default function () {}\n");
    process.env.PI_MULTI_PASS_EXTENSION = multiPassExtensionPath;

    const executor = createOrchestratorSubagentExecutor({
      sessionsDir: tempDir,
      spawner: async (def, model, ctx, state, signal) => {
        calls.push({ def, model, ctx, state, signal });
        return {
          output: "delegated answer",
          exitCode: 0,
          elapsed: 10,
          status: "done",
        };
      },
    });

    const result = await executor.execute({
      agentProfile: AGENT_PROFILES.scout,
      cognitiveToolName: "first-principles",
      cognitiveToolContent: "FRAMEWORK: reason from first principles",
      objective: "Diagnose the test suite",
      model: "openai-codex-2/gpt-5.5",
      cwd: "/tmp/worktree",
    });

    assert.equal(result.ok, true);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].model, "openai-codex-2/gpt-5.5");
    assert.deepEqual(calls[0].ctx.model, { provider: "openai-codex-2", id: "gpt-5.5" });
    assert.deepEqual(calls[0].def.extensionSources, [multiPassExtensionPath]);
    assert.equal(result.details.requestedModel, "openai-codex-2/gpt-5.5");
    assert.equal(result.details.effectiveModel, "openai-codex-2/gpt-5.5");
    assert.deepEqual(result.details.loadedExtensions, [multiPassExtensionPath]);
  } finally {
    if (previous === undefined) {
      delete process.env.PI_MULTI_PASS_EXTENSION;
    } else {
      process.env.PI_MULTI_PASS_EXTENSION = previous;
    }
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

test("toExecutionLike preserves incomplete-protocol failures from the execution seam casebook", () => {
  const execution = toExecutionLike(assistantProtocolIncompleteCase.dispatchResult);

  assert.equal(execution.output, assistantProtocolIncompleteCase.expected.executionLikeOutput);
  assert.equal(execution.failureKind, assistantProtocolIncompleteCase.expected.failureKind);
  assert.deepEqual(
    execution.executionState,
    assistantProtocolIncompleteCase.dispatchResult.details.executionState,
  );
  assert.equal(
    getExecutionStatus(execution),
    assistantProtocolIncompleteCase.expected.executionLikeStatus,
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
  assert.equal(getAgentTeamDisplayLabel("full"), "all agents");
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
        transport: { kind: "transport", exitCode: 17, aborted: false, timedOut: false },
        protocol: { kind: "assistant_protocol", stopReason: "stop" },
      },
    }),
    "done",
  );
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
      exitCode: 124,
      timedOut: true,
      executionState: {
        transport: { kind: "transport", exitCode: 124, aborted: false, timedOut: true },
        protocol: { kind: "assistant_protocol", stopReason: "aborted" },
      },
    }),
    "aborted",
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

test("finalizeExecutionEffects prepares fail evidence for timed-out executions", async () => {
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
      return { ok: false, via: "failed", akError: "ak failed" };
    },
  });

  assert.equal(outcome.status, "timed_out");
  assert.equal(outcome.success, false);
  assert.equal(outcome.evidence.via, "failed");
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

test("recordEvidence fails closed when guarded bootstrap excludes the current cwd", async () => {
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

  assert.equal(outcome.ok, false);
  assert.equal(outcome.via, "failed");
  assert.equal(bootstrapCalls, 1);
  assert.equal(akCalls, 0);
  assert.equal(sqlWrites, 0);
  assert.match(outcome.akError || "", /excluded the current cwd/i);
});

test("recordEvidence caches excluded guarded-bootstrap failures for the same cwd", async () => {
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

    assert.equal(first.via, "failed");
    assert.equal(second.via, "failed");
    assert.equal(bootstrapCalls, 1);
    assert.equal(sqlWrites, 0);
    assert.match(first.akError || "", /excluded/i);
    assert.match(second.akError || "", /excluded/i);
  } finally {
    fs.rmSync(cwd, { recursive: true, force: true });
  }
});

test("recordEvidence fails closed after guarded bootstrap times out", async () => {
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

test("recordEvidence fails closed after non-timeout ak failure", async () => {
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

  assert.equal(outcome.ok, false);
  assert.equal(outcome.via, "failed");
  assert.equal(sqlWrites, 0);
  assert.match(outcome.akError || "", /ak unavailable/);
});

test("recordEvidence fails closed after ak timeout", async () => {
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

test("agents-team command presents the internal full team as all agents to operators", async () => {
  const commands = new Map();
  extension({
    registerTool() {},
    registerCommand(name, command) {
      commands.set(name, command);
    },
    on() {},
  });

  let selectTitle;
  let selectOptions;
  const command = commands.get("agents-team");
  assert.ok(command, "expected agents-team command to register");

  await command.handler("", {
    hasUI: true,
    cwd: process.cwd(),
    ui: {
      async select(title, options) {
        selectTitle = title;
        selectOptions = options;
        return undefined;
      },
      notify() {},
    },
  });

  assert.equal(selectTitle, "Select routing scope");
  assert.ok(selectOptions.includes("all agents — builder, researcher, reviewer, scout"));
  assert.equal(
    selectOptions.some((option) => option.startsWith("full —")),
    false,
  );
});

test("runtime status report centralizes the shared runtime truth descriptor", () => {
  const snapshot = createRuntimeTruthSnapshot({
    cwd: "/tmp/runtime-truth",
    model: "test-model",
    activeTeam: "quality",
    contextUsage: {
      tokens: 20000,
      contextWindow: 128000,
    },
    sessionTokens: {
      input: 1200,
      output: 400,
      cacheRead: 300,
      cacheWrite: 200,
    },
    boundaryTelemetry: {
      totalCalls: 5,
      successCount: 4,
      failureCount: 1,
      averageLatencyMs: 12.3,
      maxLatencyMs: 45.6,
      commandCounts: {
        "sqlite3:select": 3,
        "ak:evidence": 2,
      },
      latestFailure: {
        timestamp: "2026-04-21T15:00:00.000Z",
        command: "ak:evidence",
        exitCode: 7,
        error: "process exited with code 7",
      },
    },
    societyDbPath: "/tmp/society.db",
    societyDbAvailable: true,
    vaultAvailable: true,
    vaultSummary: "available (7 cognitive tools)",
  });

  const text = formatRuntimeStatusReport(snapshot);
  assert.match(text, /coordination owner: `pi-society-orchestrator`/);
  assert.match(text, /execution owner: `@tryinget\/pi-autonomous-session-control`/);
  assert.match(text, /routing: `quality` \(reviewer, researcher\)/);
  assert.match(text, /boundary telemetry inspector: `\/runtime-boundary-telemetry`/);
  assert.match(text, /context: 20,000 tokens \(window 128,000\)/);
  assert.match(text, /session tokens: in 1,200 · cache 500 \(300 read \+ 200 write\) · out 400/);
  assert.match(text, /lower-plane telemetry: 5 calls · 4 ok · 1 fail · avg 12\.3ms · max 45\.6ms/);
  assert.match(text, /lower-plane command mix: sqlite3:select=3, ak:evidence=2/);
  assert.match(
    text,
    /latest lower-plane failure: 2026-04-21T15:00:00\.000Z · ak:evidence · exit=7 · process exited with code 7/,
  );
  assert.match(text, /footer left: `test-model · orchestrator→ASC`/);
  assert.match(
    text,
    /footer optional context slot: `ctx <tokens>` when current context usage is known/,
  );
  assert.match(
    text,
    /footer optional token slot: `↑<input> ↺<cache> ↓<output>` after the session records usage/,
  );
  assert.match(text, /footer optional slots: `DB✓\|DB✗ · Vault✓\|Vault✗` when width allows/);
  assert.match(text, /footer right: `Routing: quality`/);
});

test("AK close-frame status reader uses read-only AK surfaces", async () => {
  const calls = [];
  const runAk = async ({ args, cwd }) => {
    calls.push(args);
    assert.equal(cwd, "/repo");

    if (args[0] === "strategy" && args[1] === "list") {
      return {
        ok: true,
        stdout: JSON.stringify({
          nodes: [{ key: "SF4", state: "active" }],
        }),
        stderr: "",
      };
    }
    if (args[0] === "wave" && args[1] === "list") {
      return {
        ok: true,
        stdout: JSON.stringify({
          nodes: [{ key: "IW8", parent_key: "SF4", state: "active" }],
        }),
        stderr: "",
      };
    }
    if (args[0] === "strategy" && args[1] === "open-frame-status") {
      return {
        ok: true,
        stdout: JSON.stringify({
          active_execution_task: { status: "present", task_id: 2692, title: "Await next route" },
          closeout_status: {
            closeout_ready: true,
            readiness_state: "ready",
            ready_for_operator_gate: true,
            blockers: [{ domain: "packet_lineage", reason: "packet check needed" }],
          },
          route_guidance: {
            posture: "route_wait",
            generic_proceed_rule: "inspect_status_before_proceeding",
            safe_commands: ["ak strategy open-frame-status --repo . SF4 -F json"],
            non_authorizations: ["no_sf4_closeout", "no_lifecycle_state_mutation"],
          },
          route_selection_policy: {
            status: "inspect_status",
            state_machine: "product_posture_first_route_selection_v1",
            recommended_action: "inspect status before proceeding",
          },
          route_wait_context: { generic_proceed_allowed: false },
        }),
        stderr: "",
      };
    }
    if (args[0] === "task" && args[1] === "close-check") {
      return {
        ok: true,
        stdout: JSON.stringify({ ready_to_close: true, warnings: [] }),
        stderr: "",
      };
    }
    if (args[0] === "strategy" && args[1] === "close-frame") {
      return {
        ok: true,
        stdout: JSON.stringify({
          apply_supported: false,
          blockers: ["unsafe_execution_task_posture"],
          non_actions: ["no_lifecycle_state_mutation", "no_source_owner_mutation"],
        }),
        stderr: "",
      };
    }
    throw new Error(`unexpected ak args: ${args.join(" ")}`);
  };

  const snapshot = await readAkCloseFrameStatus({
    cwd: "/repo",
    societyDb: "/tmp/society.db",
    akPath: "ak",
    runAk,
  });

  assert.equal(snapshot.status, "available");
  assert.equal(snapshot.strategicFrame, "SF4");
  assert.equal(snapshot.implementationWave, "IW8");
  assert.equal(snapshot.routePosture, "route_wait");
  assert.equal(snapshot.genericProceedRule, "inspect_status_before_proceeding");
  assert.equal(snapshot.genericProceedAllowed, false);
  assert.equal(snapshot.routePolicyStatus, "inspect_status");
  assert.equal(snapshot.routePolicyStateMachine, "product_posture_first_route_selection_v1");
  assert.equal(snapshot.closeoutReadinessState, "ready");
  assert.equal(snapshot.activeTaskCloseCheckReady, true);
  assert.deepEqual(snapshot.activeTaskCloseCheckWarnings, []);
  assert.equal(snapshot.closeFrameApplySupported, false);
  assert.deepEqual(snapshot.closeFrameBlockers, ["unsafe_execution_task_posture"]);
  assert.deepEqual(snapshot.closeoutBlockers, ["packet_lineage (packet check needed)"]);
  assert.deepEqual(snapshot.nonAuthorizations, ["no_sf4_closeout", "no_lifecycle_state_mutation"]);
  assert.ok(calls.every((args) => !args.includes("--apply")));

  const section = formatAkCloseFrameStatusSection(snapshot);
  assert.match(section, /AK close-frame\/readiness/);
  assert.match(section, /common proceed: `inspect_status_before_proceeding`/);
  assert.match(section, /generic proceed allowed: false/);
  assert.match(
    section,
    /route-policy: `inspect_status` \(product_posture_first_route_selection_v1\)/,
  );
  assert.match(section, /active task close-check ready: true/);
  assert.match(section, /close-frame apply supported: false/);
  assert.match(section, /closeout blockers: packet_lineage \(packet check needed\)/);
  assert.match(section, /non-authorized: no_sf4_closeout, no_lifecycle_state_mutation/);
  assert.match(section, /writes: none; Pi only displays AK readbacks/);
});

test("AK close-frame status reader renders no-wave active-frame discovery posture", async () => {
  const calls = [];
  const runAk = async ({ args, cwd }) => {
    calls.push(args);
    assert.equal(cwd, "/repo");

    if (args[0] === "strategy" && args[1] === "list") {
      return {
        ok: true,
        stdout: JSON.stringify({ nodes: [{ key: "SF13", state: "active" }] }),
        stderr: "",
      };
    }
    if (args[0] === "wave" && args[1] === "list") {
      return {
        ok: true,
        stdout: JSON.stringify({
          nodes: [
            {
              key: "IW25",
              parent_key: "SF13",
              state: "next",
              state_detail: "reserved_post_adr_placeholder",
            },
          ],
        }),
        stderr: "",
      };
    }
    if (args[0] === "strategy" && args[1] === "open-frame-status") {
      assert.equal(args.includes("--implementation-wave"), false);
      return {
        ok: true,
        stdout: JSON.stringify({
          implementation_wave: null,
          active_execution_task: { status: "present", task_id: 3338, title: "Track receipts" },
          closeout_status: {
            closeout_ready: false,
            readiness_state: "blocked",
            ready_for_operator_gate: false,
            blockers: [],
          },
          route_guidance: {
            posture: "active_execution",
            generic_proceed_rule: "continue_current_execution_task",
            safe_commands: ["ak strategy open-frame-status --repo . SF13 -F json"],
            non_authorizations: ["no_sf13_closeout", "no_lifecycle_state_mutation"],
          },
          route_selection_policy: {
            status: "active_execution_ok",
            state_machine: "product_posture_first_route_selection_v1",
            recommended_action:
              "continue the linked execution_task; do not create route-wait state",
          },
          route_wait_context: { generic_proceed_allowed: true },
        }),
        stderr: "",
      };
    }
    if (args[0] === "task" && args[1] === "close-check") {
      return {
        ok: true,
        stdout: JSON.stringify({
          ready_to_close: false,
          warnings: ["task can still complete because first-slice close-check is advisory"],
          missing_outcomes: ["owner receipt"],
          missing_validation: ["ak direction check --repo . --machine"],
          missing_evidence_classes: [],
        }),
        stderr: "",
      };
    }
    throw new Error(`unexpected ak args: ${args.join(" ")}`);
  };

  const snapshot = await readAkCloseFrameStatus({
    cwd: "/repo",
    societyDb: "/tmp/society.db",
    akPath: "ak",
    runAk,
  });

  assert.equal(snapshot.status, "available");
  assert.equal(snapshot.strategicFrame, "SF13");
  assert.equal(snapshot.implementationWave, undefined);
  assert.equal(snapshot.mode, "frame_without_active_wave");
  assert.deepEqual(snapshot.nonExecutionWaves, ["IW25:next/reserved_post_adr_placeholder"]);
  assert.equal(snapshot.genericProceedAllowed, true);
  assert.equal(snapshot.activeTaskCloseCheckReady, false);
  assert.match(snapshot.activeTaskCloseCheckWarnings.join("\n"), /missing outcome: owner receipt/);
  assert.ok(calls.every((args) => !(args[0] === "strategy" && args[1] === "close-frame")));

  const section = formatAkCloseFrameStatusSection(snapshot);
  assert.match(
    section,
    /no active implementation wave \(DiscoveryOrExecution\/default-discovery\)/,
  );
  assert.match(
    section,
    /non-execution waves\/placeholders: `IW25:next\/reserved_post_adr_placeholder`/,
  );
  assert.match(section, /active task close-check ready: false/);
  assert.match(section, /no_implementation_wave_creation_from_runtime_status/);
});

test("runtime-status command opens a runtime truth inspector", async () => {
  resetBoundaryTelemetry();
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
    sessionManager: createSessionUsageManager(),
    getContextUsage() {
      return createContextUsage();
    },
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
  assert.match(editors[0].text, /boundary telemetry inspector: `\/runtime-boundary-telemetry`/);
  assert.match(editors[0].text, /context: 20,000 tokens \(window 128,000\)/);
  assert.match(
    editors[0].text,
    /session tokens: in 1,200 · cache 500 \(300 read \+ 200 write\) · out 400/,
  );
  assert.match(editors[0].text, /lower-plane telemetry:/);
  assert.match(editors[0].text, /lower-plane command mix:/);
  assert.match(editors[0].text, /latest lower-plane failure: none recorded/);
  assert.match(editors[0].text, /footer left: `test-model · orchestrator→ASC`/);
  assert.match(
    editors[0].text,
    /footer optional context slot: `ctx <tokens>` when current context usage is known/,
  );
  assert.match(
    editors[0].text,
    /footer optional token slot: `↑<input> ↺<cache> ↓<output>` after the session records usage/,
  );
  assert.match(
    editors[0].text,
    /footer optional slots: `DB✓\|DB✗ · Vault✓\|Vault✗` when width allows/,
  );
  assert.match(editors[0].text, /footer right: `Routing: all agents`/);
  assert.match(editors[0].text, /routing: `all agents` \[internal: `full`\]/);
  assert.match(editors[0].text, /## AK close-frame\/readiness/);
  assert.match(editors[0].text, /writes: none/);
  resetBoundaryTelemetry();
});

test("runtime-boundary-telemetry command opens a lower-plane telemetry inspector", async () => {
  resetBoundaryTelemetry();
  const commands = new Map();
  extension({
    registerTool() {},
    registerCommand(name, command) {
      commands.set(name, command);
    },
    on() {},
  });

  const editors = [];
  const command = commands.get("runtime-boundary-telemetry");
  assert.ok(command, "expected runtime-boundary-telemetry command to register");

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
  assert.equal(editors[0].title, "Runtime Boundary Telemetry");
  assert.match(editors[0].text, /^# Orchestrator Boundary Telemetry/m);
  assert.match(editors[0].text, /Recent events/);
  resetBoundaryTelemetry();
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
      sessionManager: createSessionUsageManager(),
      getContextUsage() {
        return createContextUsage();
      },
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
  assert.match(notifications[0].message, /Routing: all agents/);
  assert.match(notifications[0].message, /\/agents-team\s+Select routing scope/);
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
  assert.match(rendered, /ctx 20k/);
  assert.match(rendered, /↑1\.2k ↺500 ↓400/);
  assert.match(rendered, /Routing: all agents/);
  assert.match(rendered, /DB(?:✓|✗)/);
  assert.match(rendered, /Vault(?:✓|✗)/);
  assert.doesNotMatch(rendered, /· orchestra(?:\s|$)/);

  const compactRendered = footer.render(40)[0];
  assert.match(compactRendered, /orchestrator→ASC/);
  assert.match(compactRendered, /Routing:/);
  assert.doesNotMatch(compactRendered, /ctx 20k/);
  assert.doesNotMatch(compactRendered, /↑1\.2k/);
  assert.doesNotMatch(compactRendered, /DB(?:✓|✗)/);
  assert.doesNotMatch(compactRendered, /Vault(?:✓|✗)/);

  const narrowRendered = footer.render(20)[0];
  assert.match(narrowRendered, /Routing:/);
  assert.doesNotMatch(narrowRendered, /orchestrator→ASC/);
  assert.doesNotMatch(narrowRendered, /DB(?:✓|✗)/);
  assert.doesNotMatch(narrowRendered, /Vault(?:✓|✗)/);
});

test("session_start footer composes selected lightweight extension statuses when width allows", async () => {
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

  let footerFactory;
  await sessionStart(
    {},
    {
      hasUI: true,
      cwd: process.cwd(),
      model: { id: "test-model" },
      sessionManager: createSessionUsageManager(),
      getContextUsage() {
        return createContextUsage();
      },
      ui: {
        notify() {},
        setFooter(factory) {
          footerFactory = factory;
        },
      },
    },
  );

  assert.ok(footerFactory, "expected session_start to register a footer");
  const footer = footerFactory(
    undefined,
    {
      fg(_color, text) {
        return text;
      },
    },
    {
      getExtensionStatuses() {
        return new Map([
          ["asc-rewind", "◆ 2 rewind points / 2 snapshots"],
          ["society-context", "Society ctx✓"],
          ["stash", "stash: 34"],
          ["unrelated-status", "idle"],
        ]);
      },
    },
  );

  const rendered = footer.render(200)[0];
  assert.match(rendered, /rw 2\/2/);
  assert.match(rendered, /Society ctx✓/);
  assert.match(rendered, /stash 34/);
  assert.doesNotMatch(rendered, /◆ 2 rewind points/);
  assert.doesNotMatch(rendered, /idle/);

  const compactRendered = footer.render(80)[0];
  assert.match(compactRendered, /Routing: all agents/);
  assert.doesNotMatch(compactRendered, /rw 2\/2/);
  assert.doesNotMatch(compactRendered, /Society ctx✓/);
  assert.doesNotMatch(compactRendered, /stash 34/);
});

test("session_start footer refreshes vault health after startup drift", async () => {
  const previousVaultDir = process.env.VAULT_DIR;
  const previousPiCompany = process.env.PI_COMPANY;
  const previousRefreshMs = process.env.PI_ORCH_FOOTER_HEALTH_REFRESH_MS;
  const tempVaultDir = fs.mkdtempSync(path.join(os.tmpdir(), "pi-orch-footer-health-"));
  execFileSync("dolt", ["init"], { cwd: tempVaultDir, stdio: "ignore" });
  process.env.VAULT_DIR = tempVaultDir;
  process.env.PI_COMPANY = "software";
  process.env.PI_ORCH_FOOTER_HEALTH_REFRESH_MS = "0";

  try {
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

    let footerFactory;
    let rerenders = 0;
    await sessionStart(
      {},
      {
        hasUI: true,
        cwd: process.cwd(),
        model: { id: "test-model" },
        ui: {
          notify() {},
          setFooter(factory) {
            footerFactory = factory;
          },
        },
      },
    );

    assert.ok(footerFactory, "expected session_start to register a footer");
    const footer = footerFactory(
      {
        requestRender() {
          rerenders += 1;
        },
      },
      {
        fg(_color, text) {
          return text;
        },
      },
      undefined,
    );

    const initial = footer.render(120)[0];
    assert.match(initial, /Vault✗/);
    await new Promise((resolve) => setTimeout(resolve, 100));

    execFileSync(
      "dolt",
      [
        "sql",
        "-q",
        [
          "create table prompt_templates (",
          "id int primary key,",
          "name varchar(64) not null,",
          "description text,",
          "content text,",
          "artifact_kind varchar(32) not null,",
          "control_mode varchar(32) not null,",
          "formalization_level varchar(32) not null,",
          "owner_company varchar(32) not null,",
          "visibility_companies json not null,",
          "controlled_vocabulary json,",
          "status varchar(16) not null,",
          "export_to_pi boolean not null,",
          "version int not null,",
          "unique key prompt_templates_name (name)",
          ");",
          "insert into prompt_templates values (1, 'inv', 'desc', 'body', 'cognitive', 'one_shot', 'bounded', 'software', '[\"software\"]', NULL, 'active', true, 1);",
        ].join(" "),
      ],
      { cwd: tempVaultDir, stdio: "ignore" },
    );

    const refreshed = await waitForFooterMatch(footer, 120, /Vault✓/);
    assert.match(refreshed, /Vault✓/);
    assert.ok(rerenders >= 1, "expected footer health refresh to request a rerender");
  } finally {
    if (previousVaultDir === undefined) {
      delete process.env.VAULT_DIR;
    } else {
      process.env.VAULT_DIR = previousVaultDir;
    }
    if (previousPiCompany === undefined) {
      delete process.env.PI_COMPANY;
    } else {
      process.env.PI_COMPANY = previousPiCompany;
    }
    if (previousRefreshMs === undefined) {
      delete process.env.PI_ORCH_FOOTER_HEALTH_REFRESH_MS;
    } else {
      process.env.PI_ORCH_FOOTER_HEALTH_REFRESH_MS = previousRefreshMs;
    }
    fs.rmSync(tempVaultDir, { recursive: true, force: true });
  }
});

test("session_start footer health retries respect the refresh interval", async () => {
  const previousVaultDir = process.env.VAULT_DIR;
  const previousPiCompany = process.env.PI_COMPANY;
  const previousRefreshMs = process.env.PI_ORCH_FOOTER_HEALTH_REFRESH_MS;
  const tempVaultDir = fs.mkdtempSync(path.join(os.tmpdir(), "pi-orch-footer-throttle-"));
  execFileSync("dolt", ["init"], { cwd: tempVaultDir, stdio: "ignore" });
  process.env.VAULT_DIR = tempVaultDir;
  process.env.PI_COMPANY = "software";
  process.env.PI_ORCH_FOOTER_HEALTH_REFRESH_MS = "1000";

  try {
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

    let footerFactory;
    let rerenders = 0;
    await sessionStart(
      {},
      {
        hasUI: true,
        cwd: process.cwd(),
        model: { id: "test-model" },
        ui: {
          notify() {},
          setFooter(factory) {
            footerFactory = factory;
          },
        },
      },
    );

    assert.ok(footerFactory, "expected session_start to register a footer");
    const footer = footerFactory(
      {
        requestRender() {
          rerenders += 1;
        },
      },
      {
        fg(_color, text) {
          return text;
        },
      },
      undefined,
    );

    const initial = footer.render(120)[0];
    assert.match(initial, /Vault✗/);

    execFileSync(
      "dolt",
      [
        "sql",
        "-q",
        [
          "create table prompt_templates (",
          "id int primary key,",
          "name varchar(64) not null,",
          "description text,",
          "content text,",
          "artifact_kind varchar(32) not null,",
          "control_mode varchar(32) not null,",
          "formalization_level varchar(32) not null,",
          "owner_company varchar(32) not null,",
          "visibility_companies json not null,",
          "controlled_vocabulary json,",
          "status varchar(16) not null,",
          "export_to_pi boolean not null,",
          "version int not null,",
          "unique key prompt_templates_name (name)",
          ");",
          "insert into prompt_templates values (1, 'inv', 'desc', 'body', 'cognitive', 'one_shot', 'bounded', 'software', '[\"software\"]', NULL, 'active', true, 1);",
        ].join(" "),
      ],
      { cwd: tempVaultDir, stdio: "ignore" },
    );

    footer.render(120);
    await new Promise((resolve) => setTimeout(resolve, 100));

    const stillStale = footer.render(120)[0];
    assert.match(stillStale, /Vault✗/);
    assert.equal(rerenders, 0, "expected footer retries to stay throttled before the interval");
  } finally {
    if (previousVaultDir === undefined) {
      delete process.env.VAULT_DIR;
    } else {
      process.env.VAULT_DIR = previousVaultDir;
    }
    if (previousPiCompany === undefined) {
      delete process.env.PI_COMPANY;
    } else {
      process.env.PI_COMPANY = previousPiCompany;
    }
    if (previousRefreshMs === undefined) {
      delete process.env.PI_ORCH_FOOTER_HEALTH_REFRESH_MS;
    } else {
      process.env.PI_ORCH_FOOTER_HEALTH_REFRESH_MS = previousRefreshMs;
    }
    fs.rmSync(tempVaultDir, { recursive: true, force: true });
  }
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

test("manifest campaign supervision tool advertises exact-anchor evidence-only boundaries", () => {
  const tools = new Map();

  extension({
    registerTool(tool) {
      tools.set(tool.name, tool);
    },
    registerCommand() {},
    on() {},
  });

  const tool = tools.get("autoresearch_manifest_campaign_supervision");
  assert.ok(tool, "expected autoresearch_manifest_campaign_supervision to register");
  assert.match(tool.description, /Observe one exact manifest-driven pi-autoresearch campaign/);
  assert.ok(
    tool.promptGuidelines.some((line) =>
      /one-shot observation or bounded AK evidence projection/.test(line),
    ),
  );
  assert.ok(
    tool.promptGuidelines.some((line) =>
      /does not add polling, stage execution, or task lifecycle mutation/.test(line),
    ),
  );

  const parameterContract = JSON.stringify(tool.parameters);
  assert.equal(parameterContract.includes("intervalSeconds"), false);
  assert.equal(parameterContract.includes("stage"), false);
  assert.equal(parameterContract.includes("buildId"), false);
});

test("workflow_execute fails closed when the governed cognitive tool is unavailable", async (t) => {
  const cases = [
    {
      name: "boundary failure",
      lookupResult: { ok: false, error: "prompt plane unavailable" },
      expectedReason: "boundary_failure",
      expectedError: /prompt plane unavailable/,
    },
    {
      name: "lookup exception",
      lookupError: new Error("prompt plane crashed"),
      expectedReason: "lookup_exception",
      expectedError: /prompt plane crashed/,
    },
    {
      name: "missing template",
      lookupResult: { ok: true, value: null },
      expectedReason: "not_found",
      expectedError: /was not found/,
    },
    {
      name: "empty prepared content",
      lookupResult: {
        ok: true,
        value: { name: "controlled", type: "cognitive", description: "", content: "  " },
      },
      expectedReason: "empty_content",
      expectedError: /empty content/,
    },
  ];

  for (const testCase of cases) {
    await t.test(testCase.name, async () => {
      const tools = new Map();
      const lookups = [];
      let workflowFactoryCalls = 0;
      extension(
        {
          registerTool(tool) {
            tools.set(tool.name, tool);
          },
          registerCommand() {},
          on() {},
        },
        {
          async workflowCognitiveToolLookup(name, context, signal) {
            lookups.push({ name, context, signal });
            if (testCase.lookupError) throw testCase.lookupError;
            return testCase.lookupResult;
          },
          workflowExecutorFactory() {
            workflowFactoryCalls += 1;
            throw new Error("workflow executor must not be constructed");
          },
        },
      );

      const workflow = tools.get("workflow_execute");
      assert.ok(workflow, "expected workflow_execute to register");
      const result = await workflow.execute(
        "workflow-fail-closed",
        {
          request: {
            mode: "chain",
            steps: [{ kind: "step", agent: "builder", objective: "must not dispatch" }],
          },
        },
        undefined,
        undefined,
        { cwd: "/tmp/workflow-fail-closed", model: undefined },
      );

      assert.deepEqual(lookups, [
        {
          name: "controlled",
          context: { cwd: "/tmp/workflow-fail-closed" },
          signal: undefined,
        },
      ]);
      assert.equal(workflowFactoryCalls, 0);
      assert.equal(result.details.ok, false);
      assert.equal(result.details.errorCode, "workflow_cognitive_tool_unavailable");
      assert.equal(result.details.mode, "chain");
      assert.equal(result.details.status, "blocked");
      assert.equal(result.details.stepCount, 0);
      assert.equal(result.details.cognitiveTool, "controlled");
      assert.equal(result.details.lookupFailure, testCase.expectedReason);
      assert.equal(result.details.dispatchedSteps, 0);
      assert.match(result.content[0].text, /Workflow execution blocked/);
      assert.match(result.content[0].text, testCase.expectedError);
    });
  }
});

test("workflow_execute preserves cancellation after cognitive lookup resolves", async (t) => {
  for (const testCase of [
    {
      name: "successful lookup result",
      lookupResult: {
        ok: true,
        value: {
          name: "controlled",
          type: "cognitive",
          description: "",
          content: "CONTROLLED FRAMEWORK",
        },
      },
    },
    {
      name: "boundary failure result",
      lookupResult: { ok: false, error: "prompt plane unavailable after cancellation" },
    },
  ]) {
    await t.test(testCase.name, async () => {
      const tools = new Map();
      const controller = new AbortController();
      let workflowFactoryCalls = 0;
      extension(
        {
          registerTool(tool) {
            tools.set(tool.name, tool);
          },
          registerCommand() {},
          on() {},
        },
        {
          async workflowCognitiveToolLookup() {
            controller.abort("operator cancelled workflow");
            return testCase.lookupResult;
          },
          workflowExecutorFactory() {
            workflowFactoryCalls += 1;
            throw new Error("workflow executor must not be constructed after cancellation");
          },
        },
      );

      await assert.rejects(
        tools.get("workflow_execute").execute(
          "workflow-cancelled-after-lookup",
          {
            request: {
              mode: "chain",
              steps: [{ kind: "step", agent: "builder", objective: "must not dispatch" }],
            },
          },
          controller.signal,
          undefined,
          { cwd: "/tmp/workflow-cancelled", model: undefined },
        ),
        (error) => error === "operator cancelled workflow",
      );
      assert.equal(workflowFactoryCalls, 0);
    });
  }
});

test("workflow_execute validates before cognitive lookup or executor construction", async () => {
  const tools = new Map();
  let lookupCalls = 0;
  let workflowFactoryCalls = 0;
  extension(
    {
      registerTool(tool) {
        tools.set(tool.name, tool);
      },
      registerCommand() {},
      on() {},
    },
    {
      async workflowCognitiveToolLookup() {
        lookupCalls += 1;
        throw new Error("must not look up an invalid workflow");
      },
      workflowExecutorFactory() {
        workflowFactoryCalls += 1;
        throw new Error("must not construct an executor for an invalid workflow");
      },
    },
  );

  const result = await tools.get("workflow_execute").execute(
    "workflow-invalid-before-lookup",
    {
      request: {
        mode: "chain",
        steps: [{ kind: "step", agent: "builder", objective: "" }],
      },
    },
    undefined,
    undefined,
    { cwd: "/tmp/workflow-invalid", model: undefined },
  );

  assert.equal(result.details.errorCode, "workflow_validation_failed");
  assert.equal(lookupCalls, 0);
  assert.equal(workflowFactoryCalls, 0);
});

test("workflow_execute preserves governed cognitive content exactly on success", async () => {
  const tools = new Map();
  const governedContent = "  CONTROLLED FRAMEWORK\nKeep deliberate whitespace.\n";
  let executionParams;
  let workflowFactoryCalls = 0;
  extension(
    {
      registerTool(tool) {
        tools.set(tool.name, tool);
      },
      registerCommand() {},
      on() {},
    },
    {
      async workflowCognitiveToolLookup() {
        return {
          ok: true,
          value: {
            name: "controlled",
            type: "cognitive",
            description: "",
            content: governedContent,
          },
        };
      },
      workflowExecutorFactory() {
        workflowFactoryCalls += 1;
        return {
          async execute(params) {
            executionParams = params;
            return {
              mode: "chain",
              status: "done",
              steps: [],
              aggregatedOutput: "workflow complete",
            };
          },
        };
      },
    },
  );

  const result = await tools.get("workflow_execute").execute(
    "workflow-governed-success",
    {
      request: {
        mode: "chain",
        steps: [{ kind: "step", agent: "builder", objective: "bounded success fixture" }],
      },
    },
    undefined,
    undefined,
    { cwd: "/tmp/workflow-governed-success", model: undefined },
  );

  assert.equal(result.details.ok, true);
  assert.equal(workflowFactoryCalls, 1);
  assert.equal(executionParams.cognitiveToolContent, governedContent);
});

test("workflow command seeds a workflow_execute call into the editor", async () => {
  const commands = new Map();

  extension({
    registerTool() {},
    registerCommand(name, command) {
      commands.set(name, command);
    },
    on() {},
  });

  const command = commands.get("workflow");
  assert.ok(command, "expected workflow command to register");

  const notifications = [];
  let editorText = "";
  await command.handler("Inspect the current repo for workflow entry points", {
    hasUI: true,
    cwd: process.cwd(),
    ui: {
      setEditorText(text) {
        editorText = text;
      },
      notify(message, level) {
        notifications.push({ message, level });
      },
    },
  });

  assert.match(editorText, /^workflow_execute\(/);
  assert.match(editorText, /"mode": "chain"/);
  assert.match(editorText, /Inspect the current repo for workflow entry points/);
  assert.match(editorText, /Review the findings from:/);
  assert.deepEqual(notifications, [
    {
      message:
        "Seeded workflow_execute chain for: Inspect the current repo for workflow entry points",
      level: "info",
    },
  ]);
});

test("workflows command shows wrapper usage and examples", async () => {
  const commands = new Map();

  extension({
    registerTool() {},
    registerCommand(name, command) {
      commands.set(name, command);
    },
    on() {},
  });

  const command = commands.get("workflows");
  assert.ok(command, "expected workflows command to register");

  const editors = [];
  await command.handler("", {
    hasUI: true,
    cwd: process.cwd(),
    ui: {
      async editor(title, text) {
        editors.push({ title, text });
      },
    },
  });

  assert.equal(editors.length, 1);
  assert.equal(editors[0]?.title, "Workflow wrappers");
  assert.match(editors[0]?.text || "", /Thin command adapters over `workflow_execute`/);
  assert.match(editors[0]?.text || "", /dispatch_subagent/);
  assert.match(editors[0]?.text || "", /cognitive_dispatch/);
  assert.match(editors[0]?.text || "", /loop_execute/);
  assert.match(editors[0]?.text || "", /workflow_execute/);
  assert.match(editors[0]?.text || "", /DSPy \/ DSPx/);
  assert.match(editors[0]?.text || "", /subagents are the execution units underneath/);
  assert.match(editors[0]?.text || "", /reserve worktree mode for eligible mutation cases/);
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
  const registeredTools = new Map();
  registerLoopTools(
    {
      registerTool(tool) {
        registeredTools.set(tool.name, tool);
      },
    },
    BUILT_IN_PLUGINS,
    "/tmp/nonexistent-vault",
    (agent, ctx) => {
      assert.equal(ctx.cwd, process.cwd());
      return resolveAgentForTeam(agent, "implement");
    },
  );

  const loopExecuteTool = registeredTools.get("loop_execute");
  assert.ok(loopExecuteTool, "expected loop_execute to register");
  const result = await loopExecuteTool.execute(
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

test("vault_execute_template dispatches known vault loop bindings into loop execution gate", async () => {
  const tempVaultDir = fs.mkdtempSync(path.join(os.tmpdir(), "pi-orch-vault-dispatch-"));
  const previousVaultDir = process.env.VAULT_DIR;
  const previousPiCompany = process.env.PI_COMPANY;

  try {
    execFileSync("dolt", ["init", "-b", "main"], { cwd: tempVaultDir, stdio: "ignore" });
    execFileSync(
      "dolt",
      [
        "sql",
        "-q",
        [
          "CREATE TABLE prompt_templates (",
          "id INT PRIMARY KEY,",
          "name VARCHAR(64) NOT NULL,",
          "description TEXT,",
          "content TEXT,",
          "artifact_kind VARCHAR(32) NOT NULL,",
          "control_mode VARCHAR(32) NOT NULL,",
          "formalization_level VARCHAR(32) NOT NULL,",
          "owner_company VARCHAR(32) NOT NULL,",
          "visibility_companies JSON NOT NULL,",
          "controlled_vocabulary JSON,",
          "status VARCHAR(16) NOT NULL,",
          "export_to_pi BOOLEAN NOT NULL,",
          "version INT NOT NULL,",
          "UNIQUE KEY prompt_templates_name (name)",
          ");",
          "INSERT INTO prompt_templates VALUES",
          "(1,'transcendent-iteration','Transcendent loop','body','procedure','loop','workflow','core','[\"core\",\"software\"]',NULL,'active',false,4),",
          "(2,'workflow-procedure','Workflow procedure','body','procedure','one_shot','workflow','core','[\"core\",\"software\"]',NULL,'active',false,1),",
          "(3,'pi-autoresearch-setup','Autoresearch setup','body','procedure','one_shot','workflow','software','[\"software\"]',NULL,'active',false,1);",
        ].join(" "),
      ],
      { cwd: tempVaultDir, stdio: "ignore" },
    );
    process.env.VAULT_DIR = tempVaultDir;
    process.env.PI_COMPANY = "software";

    const registeredTools = new Map();
    registerLoopTools(
      {
        registerTool(tool) {
          registeredTools.set(tool.name, tool);
        },
      },
      BUILT_IN_PLUGINS,
      tempVaultDir,
      (agent) => ({
        ok: false,
        agent,
        team: "implement",
        allowedAgents: ["builder"],
        error: `test resolver blocked ${agent}`,
      }),
    );

    const vaultExecuteTool = registeredTools.get("vault_execute_template");
    assert.ok(vaultExecuteTool, "expected vault_execute_template to register");
    const result = await vaultExecuteTool.execute(
      "tool-call-id",
      { template_name: "transcendent-iteration", objective: "Improve the runtime gate" },
      undefined,
      undefined,
      { cwd: process.cwd(), model: undefined },
    );

    assert.equal(result.details.ok, false);
    assert.equal(result.details.error, "loop-agent-team-mismatch");
    assert.match(
      result.content[0].text,
      /Loop 'transcendent' is incompatible with the active team:/,
    );

    const workflowResult = await vaultExecuteTool.execute(
      "tool-call-id-2",
      { template_name: "workflow-procedure", objective: "Try to execute workflow" },
      undefined,
      undefined,
      { cwd: process.cwd(), model: undefined },
    );
    assert.equal(workflowResult.details.ok, false);
    assert.equal(workflowResult.details.error, "vault-template-not-executable-through-bridge");
    assert.match(workflowResult.content[0].text, /workflow-grade but has no executable binding/);
    assert.match(workflowResult.content[0].text, /No owner-specific route is registered/);

    const autoresearchSetupResult = await vaultExecuteTool.execute(
      "tool-call-id-3",
      {
        template_name: "pi-autoresearch-setup",
        objective: "Reduce lane-op startup latency through a manifest campaign",
      },
      undefined,
      undefined,
      { cwd: process.cwd(), model: undefined },
    );
    assert.equal(autoresearchSetupResult.details.ok, false);
    assert.equal(
      autoresearchSetupResult.details.error,
      "vault-template-not-executable-through-bridge",
    );
    assert.match(autoresearchSetupResult.content[0].text, /Owner-specific lawful route/);
    assert.match(autoresearchSetupResult.content[0].text, /autoresearch_runtime_status/);
    assert.match(autoresearchSetupResult.content[0].text, /loop back to discovery\/design/);
  } finally {
    if (previousVaultDir === undefined) {
      delete process.env.VAULT_DIR;
    } else {
      process.env.VAULT_DIR = previousVaultDir;
    }
    if (previousPiCompany === undefined) {
      delete process.env.PI_COMPANY;
    } else {
      process.env.PI_COMPANY = previousPiCompany;
    }
    fs.rmSync(tempVaultDir, { recursive: true, force: true });
  }
});

test("workflow_execute fails closed on session-team disallowed agents before execution starts", async () => {
  const commands = new Map();
  const tools = new Map();
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "pi-orch-workflow-team-"));

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
    const workflowTool = tools.get("workflow_execute");
    assert.ok(command, "expected agents-team command to register");
    assert.ok(workflowTool, "expected workflow_execute tool to register");

    await command.handler("", {
      hasUI: true,
      sessionKey: "workflow-team-session",
      cwd: tempDir,
      ui: {
        async select() {
          return "quality — reviewer, researcher";
        },
        notify() {},
      },
    });

    const result = await workflowTool.execute(
      "workflow-tool-call-id",
      {
        request: {
          mode: "chain",
          steps: [{ kind: "step", agent: "builder", objective: "Implement a fix" }],
        },
      },
      undefined,
      undefined,
      { cwd: tempDir, sessionKey: "workflow-team-session", model: undefined },
    );

    assert.equal(result.details.ok, false);
    assert.equal(result.details.errorCode, "workflow_validation_failed");
    assert.deepEqual(
      result.details.issues.map((issue) => issue.code),
      ["team_disallows_agent"],
    );
    assert.match(result.content[0].text, /Workflow execution failed:/);
    assert.match(result.content[0].text, /does not allow agent 'builder'/);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test("loop_execute fails closed when PI_ORCH_KES_ROOT is invalid", async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "pi-orch-loop-tool-"));
  const badRootParent = fs.mkdtempSync(path.join(os.tmpdir(), "pi-orch-loop-bad-root-"));
  const badRoot = path.join(badRootParent, "not-a-dir");
  fs.writeFileSync(badRoot, "not a directory", "utf8");
  const previousKesRoot = process.env.PI_ORCH_KES_ROOT;

  try {
    process.env.PI_ORCH_KES_ROOT = badRoot;

    const registeredTools = new Map();
    registerLoopTools(
      {
        registerTool(tool) {
          registeredTools.set(tool.name, tool);
        },
      },
      BUILT_IN_PLUGINS,
      "/tmp/nonexistent-vault",
    );

    const loopExecuteTool = registeredTools.get("loop_execute");
    assert.ok(loopExecuteTool, "expected loop_execute to register");
    const result = await loopExecuteTool.execute(
      "tool-call-id",
      { loop: "kaizen", objective: "Verify invalid KES root handling" },
      undefined,
      undefined,
      { cwd: tempDir, model: undefined },
    );

    assert.equal(result.details.ok, false);
    assert.equal(result.details.error, "loop-kes-root-invalid");
    assert.equal(result.details.failureKind, "kes_root_invalid");
    assert.equal(result.details.kesRootSource, "env");
    assert.match(
      result.content[0].text,
      /configured KES root is invalid or not writable\. Check PI_ORCH_KES_ROOT or package write permissions\./,
    );
    assert.equal(result.content[0].text.includes(badRoot), false);
  } finally {
    if (previousKesRoot === undefined) {
      delete process.env.PI_ORCH_KES_ROOT;
    } else {
      process.env.PI_ORCH_KES_ROOT = previousKesRoot;
    }
    fs.rmSync(tempDir, { recursive: true, force: true });
    fs.rmSync(badRootParent, { recursive: true, force: true });
  }
});
