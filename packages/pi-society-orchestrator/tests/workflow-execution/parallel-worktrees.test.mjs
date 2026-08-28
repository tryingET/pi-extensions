/**
 * summary: "Workflow execution coverage (parallel worktrees and provenance); split from workflow-execution.test.mjs."
 * read_when:
 *   - "changing parallel worktrees and provenance workflow executor behavior."
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  PI_PROVENANCE_OUTPUT_FILE,
  PI_PROVENANCE_REVIEW_LANE_ID,
} from "../../src/runtime/review-lane-provenance.ts";
import {
  createWorkflowExecutor,
  WorkflowExecutionError,
} from "../../src/runtime/workflow-execution.ts";
import { cleanupRepo, createFakeDispatchResult, createRepo } from "./helpers.mjs";

test("workflow executor renders parallel failure fan-in without hiding raw step failures", async () => {
  const executor = createWorkflowExecutor({
    executor: {
      state: {},
      async execute(params) {
        if (params.objective.includes("Review")) {
          return createFakeDispatchResult({
            status: "error",
            output: "review failed",
            failureKind: "assistant_protocol_error",
            exitCode: 1,
          });
        }

        return createFakeDispatchResult({
          status: "done",
          output: `done: ${params.objective}`,
          exitCode: 0,
        });
      },
    },
  });

  const result = await executor.execute({
    activeTeam: "full",
    model: "mock/model",
    cwd: "/repo",
    cognitiveToolContent: "FRAMEWORK: workflow",
    request: {
      mode: "parallel",
      steps: [
        {
          kind: "parallel",
          tasks: [
            { kind: "step", agent: "builder", objective: "Implement feature A" },
            { kind: "step", agent: "reviewer", objective: "Review feature A" },
          ],
        },
      ],
    },
  });

  assert.equal(result.status, "error");
  assert.deepEqual(
    result.steps.map((step) => ({
      index: step.index,
      agent: step.agent,
      status: step.status,
      failureKind: step.failureKind || null,
    })),
    [
      { index: 0, agent: "builder", status: "done", failureKind: null },
      {
        index: 1,
        agent: "reviewer",
        status: "error",
        failureKind: "assistant_protocol_error",
      },
    ],
  );
  assert.match(result.aggregatedOutput, /- step_statuses: done=1, error=1/);
  assert.match(result.aggregatedOutput, /## Parallel group 1 — error/);
  assert.match(result.aggregatedOutput, /- failure_kinds: assistant_protocol_error=1/);
  assert.match(result.aggregatedOutput, /### Task 2 — reviewer — error/);
  assert.match(result.aggregatedOutput, /Failure kind: assistant_protocol_error/);
});

test("workflow executor attaches review-lane provenance sidecars when enabled", async () => {
  const artifactRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pi-orch-provenance-captured-"));
  const extensionPath = path.join(artifactRoot, "pi-provenance.ts");
  fs.writeFileSync(extensionPath, "export default function () {}\n", "utf-8");
  const calls = [];

  try {
    const executor = createWorkflowExecutor({
      executor: {
        state: {},
        async execute(params) {
          calls.push({
            objective: params.objective,
            extensions: params.extensions,
            env: params.env,
          });
          fs.mkdirSync(path.dirname(params.env[PI_PROVENANCE_OUTPUT_FILE]), { recursive: true });
          fs.writeFileSync(
            params.env[PI_PROVENANCE_OUTPUT_FILE],
            `${JSON.stringify(
              {
                provenance_schema: "pi.assistant_message.provenance.v1",
                source_owner: "pi-runtime",
                pi_session: { message_entry_id: `entry-${calls.length}` },
                assistant_message: {
                  provider: "mock-provider",
                  model: "mock-model",
                  api: "mock-api",
                },
                capture_context: {
                  kind: "review_lane",
                  review_lane_id: params.env[PI_PROVENANCE_REVIEW_LANE_ID],
                },
              },
              null,
              2,
            )}\n`,
            "utf-8",
          );

          return createFakeDispatchResult({
            status: "done",
            output: `done: ${params.objective}`,
            exitCode: 0,
          });
        },
      },
    });

    const result = await executor.execute({
      activeTeam: "full",
      model: "mock/model",
      cwd: "/repo",
      cognitiveToolContent: "FRAMEWORK: workflow",
      provenance: {
        mode: "review_lane",
        artifactRoot,
        extensionPath,
      },
      request: {
        mode: "parallel",
        steps: [
          {
            kind: "parallel",
            tasks: [
              { kind: "step", agent: "reviewer", objective: "Review feature A" },
              { kind: "step", agent: "reviewer", objective: "Review feature B" },
            ],
          },
        ],
      },
    });

    assert.equal(result.status, "done");
    assert.equal(calls.length, 2);
    assert.deepEqual(calls[0].extensions, [extensionPath]);
    assert.deepEqual(calls[1].extensions, [extensionPath]);
    assert.notEqual(
      calls[0].env[PI_PROVENANCE_REVIEW_LANE_ID],
      calls[1].env[PI_PROVENANCE_REVIEW_LANE_ID],
    );
    assert.notEqual(
      calls[0].env[PI_PROVENANCE_OUTPUT_FILE],
      calls[1].env[PI_PROVENANCE_OUTPUT_FILE],
    );
    assert.match(calls[0].env[PI_PROVENANCE_REVIEW_LANE_ID], /^orch-review-lane:/);

    assert.equal(result.steps[0].provenance?.status, "captured");
    assert.equal(result.steps[1].provenance?.status, "captured");
    assert.ok(result.steps[0].provenance?.path.startsWith(artifactRoot));
    assert.equal(
      result.steps[0].provenance?.provenance.capture_context.review_lane_id,
      calls[0].env[PI_PROVENANCE_REVIEW_LANE_ID],
    );
    assert.match(result.aggregatedOutput, /Provenance: captured/);
  } finally {
    fs.rmSync(artifactRoot, { recursive: true, force: true });
  }
});

test("workflow executor reports missing review-lane provenance as a warning", async () => {
  const artifactRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pi-orch-provenance-missing-"));
  const extensionPath = path.join(artifactRoot, "pi-provenance.ts");
  fs.writeFileSync(extensionPath, "export default function () {}\n", "utf-8");
  const calls = [];

  try {
    const executor = createWorkflowExecutor({
      executor: {
        state: {},
        async execute(params) {
          calls.push(params);
          return createFakeDispatchResult({
            status: "done",
            output: `done: ${params.objective}`,
            exitCode: 0,
          });
        },
      },
    });

    const result = await executor.execute({
      activeTeam: "full",
      model: "mock/model",
      cwd: "/repo",
      cognitiveToolContent: "FRAMEWORK: workflow",
      provenance: {
        mode: "review_lane",
        artifactRoot,
        extensionPath,
      },
      request: {
        mode: "chain",
        steps: [{ kind: "step", agent: "reviewer", objective: "Review without sidecar" }],
      },
    });

    assert.equal(result.status, "done");
    assert.equal(result.steps[0].provenance?.status, "missing");
    assert.match(result.steps[0].provenance?.warning || "", /provenance_missing/);
    assert.equal(fs.existsSync(calls[0].env[PI_PROVENANCE_OUTPUT_FILE]), false);
    assert.match(result.aggregatedOutput, /Provenance: missing/);
  } finally {
    fs.rmSync(artifactRoot, { recursive: true, force: true });
  }
});

test("workflow executor leaves generic workflows without provenance markers", async () => {
  const calls = [];
  const executor = createWorkflowExecutor({
    executor: {
      state: {},
      async execute(params) {
        calls.push(params);
        return createFakeDispatchResult({
          status: "done",
          output: `done: ${params.objective}`,
          exitCode: 0,
        });
      },
    },
  });

  const result = await executor.execute({
    activeTeam: "full",
    model: "mock/model",
    cwd: "/repo",
    cognitiveToolContent: "FRAMEWORK: workflow",
    request: {
      mode: "chain",
      steps: [{ kind: "step", agent: "scout", objective: "Map generic workflow" }],
    },
  });

  assert.equal(result.status, "done");
  assert.equal(calls[0].env, undefined);
  assert.equal(calls[0].extensions, undefined);
  assert.equal(result.steps[0].provenance, undefined);
  assert.equal(result.aggregatedOutput.includes("Provenance:"), false);
});

test("workflow executor runs worktree parallel groups with isolated cwd values and bounded diff summaries", async () => {
  const repoDir = createRepo("pi-orch-worktree-success-");
  const calls = [];

  try {
    const executor = createWorkflowExecutor({
      executor: {
        state: {},
        async execute(params) {
          const fileName = params.objective.includes("Implement")
            ? "feature-a.txt"
            : "feature-b.txt";
          calls.push({ cwd: params.cwd, objective: params.objective, fileName });
          fs.writeFileSync(path.join(params.cwd, fileName), `${params.objective}\n`, "utf-8");
          return createFakeDispatchResult({
            status: "done",
            output: `done: ${params.objective}`,
            exitCode: 0,
          });
        },
      },
    });

    const result = await executor.execute({
      activeTeam: "full",
      model: "mock/model",
      cwd: repoDir,
      cognitiveToolContent: "FRAMEWORK: workflow",
      request: {
        mode: "parallel",
        cwd: repoDir,
        steps: [
          {
            kind: "parallel",
            worktree: true,
            tasks: [
              { kind: "step", agent: "builder", objective: "Implement feature A" },
              { kind: "step", agent: "reviewer", objective: "Review feature B" },
            ],
          },
        ],
      },
    });

    assert.equal(result.status, "done");
    assert.equal(result.worktreeSummary?.changedTasks, 2);
    assert.ok(result.worktreeSummary?.patchDir, "expected patchDir");
    assert.ok(fs.existsSync(result.worktreeSummary.patchDir), "patchDir should exist");
    const patchFiles = fs
      .readdirSync(result.worktreeSummary.patchDir)
      .filter((file) => file.endsWith(".patch"));
    assert.equal(patchFiles.length, 2);
    const firstPatch = fs.readFileSync(
      path.join(result.worktreeSummary.patchDir, patchFiles[0]),
      "utf-8",
    );
    assert.match(firstPatch, /(feature-a|feature-b)\.txt/);
    assert.equal(new Set(calls.map((call) => call.cwd)).size, 2);
    assert.ok(calls.every((call) => call.cwd !== repoDir));
    assert.ok(calls.every((call) => fs.existsSync(call.cwd) === false));
    assert.match(result.aggregatedOutput, /- worktree_changed_tasks: 2/);
    assert.match(result.aggregatedOutput, /## Parallel group 1 — done/);
    assert.match(result.aggregatedOutput, /- worktree: true/);
    assert.match(result.aggregatedOutput, /Worktree changes:/);
    assert.match(result.worktreeSummary.diffSummaryText, /Full patches:/);
  } finally {
    cleanupRepo(repoDir);
  }
});

test("workflow executor cleans up worktrees after failing parallel groups and preserves failure truth", async () => {
  const repoDir = createRepo("pi-orch-worktree-failure-");
  const calls = [];

  try {
    const executor = createWorkflowExecutor({
      executor: {
        state: {},
        async execute(params) {
          const fileName = params.objective.includes("Implement")
            ? "feature-a.txt"
            : "review-notes.txt";
          calls.push({ cwd: params.cwd, objective: params.objective, fileName });
          fs.writeFileSync(path.join(params.cwd, fileName), `${params.objective}\n`, "utf-8");

          if (params.objective.includes("Review")) {
            return createFakeDispatchResult({
              status: "error",
              output: "review failed",
              failureKind: "assistant_protocol_error",
              exitCode: 1,
            });
          }

          return createFakeDispatchResult({
            status: "done",
            output: `done: ${params.objective}`,
            exitCode: 0,
          });
        },
      },
    });

    const result = await executor.execute({
      activeTeam: "full",
      model: "mock/model",
      cwd: repoDir,
      cognitiveToolContent: "FRAMEWORK: workflow",
      request: {
        mode: "parallel",
        cwd: repoDir,
        steps: [
          {
            kind: "parallel",
            worktree: true,
            tasks: [
              { kind: "step", agent: "builder", objective: "Implement feature A" },
              { kind: "step", agent: "reviewer", objective: "Review feature A" },
            ],
          },
        ],
      },
    });

    assert.equal(result.status, "error");
    assert.equal(result.worktreeSummary?.changedTasks, 2);
    assert.ok(calls.every((call) => fs.existsSync(call.cwd) === false));
    assert.match(result.aggregatedOutput, /## Parallel group 1 — error/);
    assert.match(result.aggregatedOutput, /Failure kind: assistant_protocol_error/);
    assert.match(result.worktreeSummary.diffSummaryText, /Task 1 \(builder\)/);
    assert.match(result.worktreeSummary.diffSummaryText, /Task 2 \(reviewer\)/);
  } finally {
    cleanupRepo(repoDir);
  }
});

test("workflow executor fails closed on worktree cwd conflicts before execution starts", async () => {
  const repoDir = createRepo("pi-orch-worktree-conflict-");
  let calls = 0;

  try {
    const executor = createWorkflowExecutor({
      executor: {
        state: {},
        async execute() {
          calls += 1;
          return createFakeDispatchResult({ status: "done", output: "unexpected" });
        },
      },
    });

    await assert.rejects(
      executor.execute({
        activeTeam: "full",
        model: "mock/model",
        cwd: repoDir,
        cognitiveToolContent: "FRAMEWORK: workflow",
        request: {
          mode: "parallel",
          cwd: repoDir,
          steps: [
            {
              kind: "parallel",
              worktree: true,
              tasks: [
                { kind: "step", agent: "builder", objective: "Implement feature A" },
                {
                  kind: "step",
                  agent: "reviewer",
                  objective: "Review feature A",
                  cwd: path.join(repoDir, "other"),
                },
              ],
            },
          ],
        },
      }),
      (error) => {
        assert.ok(error instanceof WorkflowExecutionError);
        assert.equal(error.code, "workflow_worktree_cwd_conflict");
        assert.match(error.message, /worktree isolation uses the shared cwd/i);
        return true;
      },
    );

    assert.equal(calls, 0);
  } finally {
    cleanupRepo(repoDir);
  }
});

test("workflow executor fails closed on dirty repos before worktree execution starts", async () => {
  const repoDir = createRepo("pi-orch-worktree-dirty-");
  let calls = 0;

  try {
    fs.writeFileSync(path.join(repoDir, "tracked.txt"), "dirty\n", "utf-8");
    const executor = createWorkflowExecutor({
      executor: {
        state: {},
        async execute() {
          calls += 1;
          return createFakeDispatchResult({ status: "done", output: "unexpected" });
        },
      },
    });

    await assert.rejects(
      executor.execute({
        activeTeam: "full",
        model: "mock/model",
        cwd: repoDir,
        cognitiveToolContent: "FRAMEWORK: workflow",
        request: {
          mode: "parallel",
          cwd: repoDir,
          steps: [
            {
              kind: "parallel",
              worktree: true,
              tasks: [{ kind: "step", agent: "builder", objective: "Implement feature A" }],
            },
          ],
        },
      }),
      (error) => {
        assert.ok(error instanceof WorkflowExecutionError);
        assert.equal(error.code, "workflow_worktree_setup_failed");
        assert.match(error.message, /clean git working tree/i);
        return true;
      },
    );

    assert.equal(calls, 0);
  } finally {
    cleanupRepo(repoDir);
  }
});

test("workflow executor fails closed on team validation before execution starts", async () => {
  let calls = 0;
  const executor = createWorkflowExecutor({
    executor: {
      state: {},
      async execute() {
        calls += 1;
        return createFakeDispatchResult({ status: "done", output: "unexpected" });
      },
    },
  });

  await assert.rejects(
    executor.execute({
      activeTeam: "quality",
      model: "mock/model",
      cwd: "/repo",
      cognitiveToolContent: "FRAMEWORK: workflow",
      request: {
        mode: "chain",
        steps: [{ kind: "step", agent: "builder", objective: "Implement a fix" }],
      },
    }),
    (error) => {
      assert.ok(error instanceof WorkflowExecutionError);
      assert.equal(error.code, "workflow_validation_failed");
      assert.deepEqual(
        error.issues?.map((issue) => issue.code),
        ["team_disallows_agent"],
      );
      return true;
    },
  );

  assert.equal(calls, 0);
});
