import assert from "node:assert/strict";
import { digest } from "./pins.mjs";

// Independent expected effect set for this fresh, dependency/deferral-free synthetic task.
// No producer verify_effects implementation is called or copied.
export function claimEffects(before, after, claim) {
  const permitted = new Set([
    "status",
    "entity_version",
    "claimed_by",
    "claimed_at",
    "lease_expires_at",
  ]);
  for (const key of new Set([...Object.keys(before.task), ...Object.keys(after.task)]))
    if (!permitted.has(key))
      assert.deepEqual(after.task[key], before.task[key], `unexpected task effect: ${key}`);
  assert.equal(after.task.status, "claimed");
  assert.equal(after.task.entity_version, before.task.entity_version + 1);
  assert.deepEqual(claim, {
    task_id: after.task.id,
    repo: after.task.repo,
    version: after.task.entity_version,
    claimed_by: after.task.claimed_by,
    claimed_at: after.task.claimed_at,
    lease_expires_at: after.task.lease_expires_at,
  });
  assert.deepEqual(Object.keys(after.families).sort(), Object.keys(before.families).sort());
  for (const name of Object.keys(before.families)) {
    if (name !== "tasks")
      assert.deepEqual(
        after.families[name],
        before.families[name],
        `unexpected family effect: ${name}`,
      );
    else {
      assert.equal(before.families.tasks.length, 1);
      assert.equal(after.families.tasks.length, 1);
      for (const key of new Set([
        ...Object.keys(before.families.tasks[0]),
        ...Object.keys(after.families.tasks[0]),
      ]))
        if (!permitted.has(key))
          assert.deepEqual(
            after.families.tasks[0][key],
            before.families.tasks[0][key],
            `unexpected raw task effect: ${key}`,
          );
    }
  }
}
export function exchange(events, admission, t1, after) {
  const sent = events.filter((e) => e.event === "send").map((e) => e.value);
  const received = events.filter((e) => e.event === "receive").map((e) => e.value);
  assert.equal(sent.filter((m) => m.kind === "PREPARED").length, 1);
  assert.equal(sent.filter((m) => m.kind === "T1_PUBLISHED").length, 1);
  assert.equal(received.filter((m) => m.kind === "CLOSED").length, 1);
  const prepared = sent.find((m) => m.kind === "PREPARED");
  const closed = received.find((m) => m.kind === "CLOSED");
  assert.deepEqual(
    received.find((m) => m.kind === "ADMISSION_RESULT"),
    admission,
  );
  assert.deepEqual(
    sent.find((m) => m.kind === "T1_PUBLISHED"),
    t1,
  );
  for (const message of [admission, t1, closed])
    assert.deepEqual(message.binding, prepared.binding);
  assert.equal(admission.body.effects, "committed_verified");
  assert.equal(admission.body.readback_digest, digest(after));
  assert.equal(t1.body.admission_digest, digest(admission));
  assert.equal(closed.body.t1_digest, digest(t1));
  assert.equal(t1.body.outcome, "ADMITTED");
  assert.equal(closed.body.outcome, "ADMITTED");
  const indexes = ["PREPARED", "ADMISSION_RESULT", "T1_PUBLISHED", "CLOSED"].map((kind) =>
    events.findIndex((e) => e.value?.kind === kind),
  );
  assert(indexes.every((v, i) => v >= 0 && (i === 0 || v > indexes[i - 1])));
  assert(events.findIndex((e) => e.event === "fetch") > indexes[3], "fetch before CLOSED");
}
