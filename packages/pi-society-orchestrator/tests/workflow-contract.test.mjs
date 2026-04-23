import assert from "node:assert/strict";
import test from "node:test";
import {
  countWorkflowParallelGroups,
  flattenWorkflowSteps,
  validateWorkflowRequest,
} from "../src/runtime/workflow.ts";

test("validateWorkflowRequest accepts a minimal chain request", () => {
  const result = validateWorkflowRequest({
    mode: "chain",
    steps: [
      { kind: "step", agent: "scout", objective: "Map the auth flow" },
      { kind: "step", agent: "builder", objective: "Implement the agreed fix" },
    ],
  });

  assert.equal(result.ok, true);
  if (!result.ok) return;

  assert.equal(result.value.mode, "chain");
  assert.equal(result.value.steps.length, 2);
  assert.equal(countWorkflowParallelGroups(result.value), 0);
  assert.deepEqual(
    flattenWorkflowSteps(result.value).map((ref) => ({ path: ref.path, agent: ref.step.agent })),
    [
      { path: "steps[0]", agent: "scout" },
      { path: "steps[1]", agent: "builder" },
    ],
  );
});

test("validateWorkflowRequest accepts a parallel group with bounded worktree settings", () => {
  const result = validateWorkflowRequest({
    mode: "parallel",
    cwd: "/repo",
    steps: [
      {
        kind: "parallel",
        concurrency: 2,
        worktree: true,
        tasks: [
          { kind: "step", agent: "builder", objective: "Implement feature A" },
          { kind: "step", agent: "reviewer", objective: "Audit changed interfaces" },
        ],
      },
    ],
  });

  assert.equal(result.ok, true);
  if (!result.ok) return;

  assert.equal(result.value.cwd, "/repo");
  assert.equal(countWorkflowParallelGroups(result.value), 1);
  assert.deepEqual(
    flattenWorkflowSteps(result.value).map((ref) => ({
      path: ref.path,
      parallelTaskIndex: ref.parallelTaskIndex,
      agent: ref.step.agent,
    })),
    [
      { path: "steps[0].tasks[0]", parallelTaskIndex: 0, agent: "builder" },
      { path: "steps[0].tasks[1]", parallelTaskIndex: 1, agent: "reviewer" },
    ],
  );
});

test("validateWorkflowRequest rejects unknown agents and empty objectives", () => {
  const result = validateWorkflowRequest({
    mode: "chain",
    steps: [{ kind: "step", agent: "manager", objective: "   " }],
  });

  assert.equal(result.ok, false);
  if (result.ok) return;

  assert.deepEqual(
    result.issues.map((issue) => issue.code),
    ["invalid_agent", "empty_objective"],
  );
});

test("validateWorkflowRequest rejects nested parallel groups in Slice A", () => {
  const result = validateWorkflowRequest({
    mode: "parallel",
    steps: [
      {
        kind: "parallel",
        tasks: [
          {
            kind: "parallel",
            tasks: [{ kind: "step", agent: "scout", objective: "Nested should fail" }],
          },
        ],
      },
    ],
  });

  assert.equal(result.ok, false);
  if (result.ok) return;

  assert.match(result.issues[0]?.path || "", /steps\[0\]\.tasks\[0\]\.kind/);
  assert.equal(result.issues[0]?.code, "nested_parallel_group");
});

test("validateWorkflowRequest rejects worktree on a step", () => {
  const result = validateWorkflowRequest({
    mode: "chain",
    steps: [
      {
        kind: "step",
        agent: "scout",
        objective: "Inspect the repo",
        worktree: true,
      },
    ],
  });

  assert.equal(result.ok, false);
  if (result.ok) return;

  assert.deepEqual(
    result.issues.map((issue) => issue.code),
    ["worktree_on_step"],
  );
});

test("validateWorkflowRequest enforces current team constraints when requested", () => {
  const result = validateWorkflowRequest(
    {
      mode: "chain",
      steps: [{ kind: "step", agent: "builder", objective: "Implement the feature" }],
    },
    { activeTeam: "quality" },
  );

  assert.equal(result.ok, false);
  if (result.ok) return;

  assert.equal(result.issues[0]?.code, "team_disallows_agent");
  assert.match(result.issues[0]?.message || "", /does not allow agent 'builder'/);
});

test("validateWorkflowRequest rejects invalid team names clearly", () => {
  const result = validateWorkflowRequest(
    {
      mode: "chain",
      steps: [{ kind: "step", agent: "scout", objective: "Map the files" }],
    },
    { activeTeam: "unknown-team" },
  );

  assert.equal(result.ok, false);
  if (result.ok) return;

  assert.deepEqual(
    result.issues.map((issue) => issue.code),
    ["unknown_team"],
  );
});

test("validateWorkflowRequest rejects invalid concurrency and empty task arrays", () => {
  const result = validateWorkflowRequest({
    mode: "parallel",
    steps: [{ kind: "parallel", concurrency: 0, tasks: [] }],
  });

  assert.equal(result.ok, false);
  if (result.ok) return;

  assert.deepEqual(
    result.issues.map((issue) => issue.code),
    ["parallel_tasks_empty", "invalid_concurrency"],
  );
});
