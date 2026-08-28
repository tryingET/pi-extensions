import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { AGENT_PROFILES } from "../../src/runtime/agent-profiles.ts";
import { getExecutionStatus } from "../../src/runtime/execution-status.ts";
import {
  buildCombinedSystemPrompt,
  createOrchestratorSubagentExecutor,
  toExecutionLike,
} from "../../src/runtime/subagent.ts";
import {
  assistantProtocolIncompleteCase,
  assistantProtocolParseErrorCase,
  assistantProtocolSemanticErrorCase,
  timeoutEmptyOutputCase,
  timeoutWhitespaceOutputCase,
} from "./helpers.mjs";

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
      customSpawnerCapacityOwnership: "parent_owned",
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
    // ASC's current execution contract carries the combined role/objective prompt in the
    // dispatch def's userPrompt (initial user message) so sibling children can share Pi's
    // stable host prefix; def.systemPrompt is intentionally no longer populated.
    assert.match(calls[0].def.userPrompt || "", /You are the reviewer/);
    assert.match(calls[0].def.userPrompt || "", /FRAMEWORK: audit deeply/);
    assert.match(calls[0].def.userPrompt || "", /## OBJECTIVE\n\nReview the evidence trail/);
    assert.match(calls[0].def.userPrompt || "", /## LOOP\nphase=orient/);
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
      customSpawnerCapacityOwnership: "parent_owned",
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
      customSpawnerCapacityOwnership: "parent_owned",
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
