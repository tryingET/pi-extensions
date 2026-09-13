// summary: regressions for independent closeout review blockers (freshness and irreversible budgets).
import assert from "node:assert/strict";
import test from "node:test";
import {
  addObligation,
  bindObligation,
  digest,
  evaluate,
  inventoryDigest,
  openState,
} from "../src/sessionCloseout.ts";
import { gitSnapshot, observeObligation } from "../src/sessionCloseoutReadback.ts";

const host = { sessionId: "caller", sessionFile: "/s.jsonl", cwd: "/repo", repo: "/repo" };
const item = {
  id: "O1",
  title: "Fix",
  acceptance: "Regression passes",
  repo: "/repo",
  kind: "work",
};
const git = { repo: "/repo", head: "a".repeat(40), dirty: false, digest: "snapshot" };
const task = { id: 1, repo: "/repo", status: "done", entity_version: 1 };
const binding = {
  id: "O1",
  disposition: "resolved",
  taskId: 1,
  evidenceId: 10,
  rationale: "proof",
};
const passing = {
  id: 10,
  task_id: 1,
  repo: "/repo",
  result: "pass",
  details: { commit: git.head },
};
function owner(t, evidence) {
  return async (_cmd, args) =>
    JSON.stringify({
      ok: true,
      error: null,
      schema_version: 1,
      surface: args[0] === "task" ? "task.show" : "evidence.task",
      payload_kind: args[0] === "task" ? "task_detail" : "evidence_collection",
      payload: args[0] === "task" ? { task: t } : { task_id: 1, count: evidence.length, evidence },
    });
}
test("new contradictory evidence changes reviewed digest even when selected pass is unchanged", async () => {
  let state = addObligation(openState(host, null), item);
  state = bindObligation({ ...state, frozenDigest: inventoryDigest(state) }, binding);
  const a = await observeObligation(item, binding, git, owner(task, [passing]));
  const b = await observeObligation(
    item,
    binding,
    git,
    owner(task, [passing, { ...passing, id: 11, result: "fail" }]),
  );
  assert.equal(a.valid, true);
  assert.equal(b.valid, true); // independent reviewer adjudicates relevance
  assert.notEqual(
    evaluate(state, [a], "activity", []).digest,
    evaluate(state, [b], "activity", []).digest,
  );
  assert.equal(b.facts.evidenceIndex[1].result, "fail");
});
test("same porcelain with changed file bytes during capture fails closed", async () => {
  let diffCalls = 0;
  const run = async (_cmd, args) => {
    if (args[0] === "rev-parse") return git.head;
    if (args[0] === "status") return " M file\0";
    if (args[0] === "ls-files") return "";
    if (args[0] === "diff" && args.includes("--cached")) return "";
    if (args[0] === "diff") return ++diffCalls === 1 ? "old bytes" : "new bytes";
    throw new Error("unexpected command");
  };
  await assert.rejects(gitSnapshot("/repo", run), /content changed/);
});
test("deferral expiry uses time after asynchronous owner reads, not at operation entry", async () => {
  const future = Date.now() + 1000;
  const t = {
    ...task,
    status: "pending",
    active_deferral: {
      id: 2,
      task_id: 1,
      state: "active",
      review_at: new Date(future).toISOString(),
      trigger_json: {
        closeout: {
          schema: "pi.closeout-handoff.v1",
          owner: "operator",
          blocker: "missing secret",
          trigger: "secret available",
          next_action: "run CI",
          blast_radius: "no CI",
          rationale: "cannot mint credentials",
          acceptance: item.acceptance,
          deadline: new Date(future + 1000).toISOString(),
          evidence_ids: [10],
        },
      },
    },
  };
  let clock = future - 500;
  const read = owner(t, [passing]);
  const observation = await observeObligation(
    item,
    { ...binding, disposition: "deferred" },
    git,
    async (...args) => {
      const result = await read(...args);
      clock = future + 2000;
      return result;
    },
    () => clock,
  );
  assert.equal(observation.valid, false);
  assert.match(observation.reason, /expired/);
});
test("oversized additions fail before mutation and leave existing inventory reviewable", () => {
  let state = openState(host, null);
  let accepted = 0;
  for (let i = 0; i < 30; i++) {
    const before = digest(state);
    try {
      state = addObligation(state, { ...item, title: `item-${i}`, acceptance: "x".repeat(2000) });
      accepted++;
    } catch (error) {
      assert.match(error.message, /budget/);
      assert.equal(digest(state), before);
      break;
    }
  }
  assert.ok(accepted > 0 && accepted < 12);
  assert.ok(JSON.stringify(state.obligations).length <= 12000);
  state.frozenDigest = inventoryDigest(state);
  assert.equal(
    evaluate(state, [], "activity", []).blockers.includes("Inventory is not operator-frozen"),
    false,
  );
});
