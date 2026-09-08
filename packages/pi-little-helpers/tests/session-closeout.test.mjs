// summary: proves immutable inventory and fail-closed AK/Git closeout checks.
import assert from "node:assert/strict";
import test from "node:test";
import {
  addObligation,
  bindObligation,
  digest,
  evaluate,
  inventoryDigest,
  openState,
  restoreState,
} from "../src/sessionCloseout.ts";
import { activityDigest, pendingCalls } from "../src/sessionCloseoutHost.ts";
import { machine, observeObligation } from "../src/sessionCloseoutReadback.ts";

const host = {
  sessionId: "caller",
  sessionFile: "/sessions/caller.jsonl",
  cwd: "/repo",
  repo: "/repo",
};
const item = {
  title: "Fix bug",
  acceptance: "Negative regression passes",
  repo: "/repo",
  kind: "work",
};
const snapshot = { repo: "/repo", head: "a".repeat(40), dirty: false, digest: "git-digest" };
const binding = {
  id: "O1",
  disposition: "resolved",
  taskId: 1,
  evidenceId: 10,
  rationale: "Actual regression proof",
};
function frozen() {
  const s = addObligation(openState(host, "start"), item);
  return { ...s, revision: s.revision + 1, frozenDigest: inventoryDigest(s) };
}
function fixture() {
  const task = { id: 1, repo: "/repo", status: "done", entity_version: 3 };
  const proof = {
    id: 10,
    task_id: 1,
    repo: "/repo",
    result: "pass",
    details: { commit: snapshot.head },
  };
  return { task, proof };
}
function owner(f, change = (x) => x) {
  return async (_command, args) => {
    const isTask = args[0] === "task";
    return JSON.stringify(
      change({
        surface: isTask ? "task.show" : "evidence.task",
        schema_version: 1,
        ok: true,
        error: null,
        payload_kind: isTask ? "task_detail" : "evidence_collection",
        payload: isTask ? { task: f.task } : { task_id: 1, count: 1, evidence: [f.proof] },
      }),
    );
  };
}

test("inventory is append-only and additions invalidate freeze; work cannot become retained", () => {
  const a = openState(host, "start");
  const b = addObligation(a, item);
  const c = { ...b, revision: b.revision + 1, frozenDigest: inventoryDigest(b) };
  assert.equal(restoreState([a, b, c], host).obligations[0].id, "O1");
  assert.throws(() => restoreState([a, b, { ...c, obligations: [] }], host), /lost|rewrote/);
  assert.throws(
    () =>
      restoreState(
        [a, b, { ...c, obligations: [{ ...b.obligations[0], acceptance: "weaker" }] }],
        host,
      ),
    /lost|rewrote/,
  );
  assert.throws(() => restoreState([a, b, { ...c, revision: 9 }], host), /lost|rewrote/);
  assert.throws(() => bindObligation(c, { ...binding, disposition: "retained" }), /relabel/);
  assert.equal(addObligation(c, { ...item, title: "Another" }).frozenDigest, undefined);
  assert.throws(() => addObligation(b, item), /Duplicate/);
  assert.throws(() => bindObligation(b, binding), /freeze/);
  assert.throws(() => bindObligation(c, { ...binding, id: "O99" }), /Unknown/);
});

test("forked/imported state cannot certify another host; wrong repo fails", () => {
  const s = frozen();
  assert.equal(restoreState([s], { ...host, sessionId: "auditor-child" }), undefined);
  assert.throws(() => restoreState([s], { ...host, repo: "/foreign" }), /identity/);
  assert.throws(() => restoreState([null], host), /Corrupt/);
});

test("passing row needs exact done task/repo/evidence/current Git identity", async () => {
  const f = fixture();
  const o = { ...item, id: "O1" };
  assert.equal((await observeObligation(o, binding, snapshot, owner(f))).valid, true);
  const variants = [
    (x) => {
      x.task.status = "pending";
    },
    (x) => {
      x.task.repo = "/foreign";
    },
    (x) => {
      x.task.id = 3;
    },
    (x) => {
      x.proof.id = 12;
    },
    (x) => {
      x.proof.result = "fail";
    },
    (x) => {
      x.proof.task_id = 2;
    },
    (x) => {
      x.proof.details.commit = "b".repeat(40);
    },
    (x) => {
      x.proof.details = { verified: true };
    },
  ];
  for (const mutate of variants) {
    const x = fixture();
    mutate(x);
    assert.equal((await observeObligation(o, binding, snapshot, owner(x))).valid, false);
  }
  assert.equal(
    (await observeObligation(o, binding, { ...snapshot, dirty: true }, owner(f))).valid,
    false,
  );
  f.proof.details.closeout_git_digest = snapshot.digest;
  assert.equal(
    (await observeObligation(o, binding, { ...snapshot, dirty: true }, owner(f))).valid,
    true,
  );
  const state = bindObligation(frozen(), binding);
  const observations = [await observeObligation(o, binding, snapshot, owner(f))];
  assert.equal(evaluate(state, observations, "activity", []).work, "COMPLETE");
  assert.notEqual(
    evaluate(state, observations, "activity", []).digest,
    evaluate(state, observations, "new-tool", []).digest,
  );
  assert.ok(evaluate(state, observations, "activity", ["active job"]).blockers.length);
  assert.ok(evaluate(state, [], "activity", []).blockers.length);
  assert.ok(evaluate(state, [...observations, ...observations], "activity", []).blockers.length);
});

test("generic evidence booleans are insufficient; explicit non-code acceptance binding required", async () => {
  const f = fixture();
  delete f.proof.details.commit;
  f.proof.details.closeout = {
    obligation_id: "O1",
    acceptance_sha256: digest(item.acceptance),
    git_digest: snapshot.digest,
  };
  assert.equal(
    (await observeObligation({ ...item, id: "O1" }, binding, snapshot, owner(f))).valid,
    true,
  );
  f.proof.details.closeout.acceptance_sha256 = "forged";
  assert.equal(
    (await observeObligation({ ...item, id: "O1" }, binding, snapshot, owner(f))).valid,
    false,
  );
});

test("deferral requires real owner state, complete handoff, future review and existing evidence", async () => {
  const f = fixture();
  f.task.status = "pending";
  f.task.active_deferral = {
    id: 5,
    task_id: 1,
    state: "active",
    review_at: "2099-01-01T00:00:00Z",
    trigger_json: {
      closeout: {
        schema: "pi.closeout-handoff.v1",
        owner: "repo administrator",
        blocker: "credential unavailable",
        trigger: "credential provisioned",
        next_action: "Run hosted CI",
        blast_radius: "CI unavailable",
        rationale: "Separate secret authority",
        acceptance: item.acceptance,
        deadline: "2099-01-02T00:00:00Z",
        evidence_ids: [10],
      },
    },
  };
  const deferred = { ...binding, disposition: "deferred" };
  const observe = (x) => observeObligation({ ...item, id: "O1" }, deferred, snapshot, owner(x));
  assert.equal((await observe(f)).valid, true);
  for (const mutate of [
    (x) => {
      delete x.task.active_deferral;
    },
    (x) => {
      x.task.claimed_by = "executor";
    },
    (x) => {
      x.task.active_deferral.review_at = "2000-01-01";
    },
    (x) => {
      x.task.active_deferral.trigger_json.closeout.acceptance = "weaker";
    },
    (x) => {
      x.task.active_deferral.trigger_json.closeout.evidence_ids = [99];
    },
    (x) => {
      delete x.task.active_deferral.trigger_json.closeout.owner;
    },
  ]) {
    const x = structuredClone(f);
    mutate(x);
    assert.equal((await observe(x)).valid, false);
  }
  const s = bindObligation(frozen(), deferred);
  assert.equal(evaluate(s, [await observe(f)], "activity", []).work, "INCOMPLETE");
});

test("AK envelopes and adapter failures fail closed", async () => {
  for (const patch of [
    { ok: false },
    { schema_version: 2 },
    { surface: "wrong" },
    { payload_kind: "wrong" },
    { error: {} },
  ]) {
    const run = owner(fixture(), (e) => ({ ...e, ...patch }));
    await assert.rejects(machine(run, "/repo", ["task", "show", "1"], "task.show", "task_detail"));
  }
  const o = { ...item, id: "O1" };
  assert.equal(
    (
      await observeObligation(o, binding, snapshot, async () => {
        throw new Error("unavailable");
      })
    ).valid,
    false,
  );
});

test("pending parallel calls refuse closure; compaction never selects another session", () => {
  const entries = [
    { type: "custom", id: "start", customType: "other" },
    {
      type: "message",
      id: "a",
      message: {
        role: "assistant",
        content: [
          { type: "toolCall", id: "job", name: "bash", arguments: {} },
          { type: "toolCall", id: "seal", name: "session_closeout", arguments: {} },
        ],
      },
    },
  ];
  assert.equal(pendingCalls(entries, "start", "seal").length, 1);
  const before = activityDigest(entries);
  entries.push({
    type: "message",
    id: "r",
    message: { role: "toolResult", toolCallId: "job", toolName: "bash", isError: false },
  });
  assert.deepEqual(pendingCalls(entries, "start", "seal"), []);
  assert.notEqual(activityDigest(entries), before);
  entries.push({ type: "compaction", id: "compact", firstKeptEntryId: "a" });
  assert.deepEqual(pendingCalls(entries, "start", "seal"), []);
  assert.match(pendingCalls(entries, "missing", "seal")[0], /boundary/);
});
