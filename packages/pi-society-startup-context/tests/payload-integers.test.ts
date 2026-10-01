import assert from "node:assert/strict";
import test from "node:test";
import { buildStartupContextPacket } from "../extensions/society-context.ts";
import { fixture } from "./fixture.ts";

test("reject original unsafe counts/IDs, sum overflow, fractional/ranged priorities and malformed optional fields even with zero warnings shown", async () => {
  const f = fixture();
  try {
    const row = { id: 42, title: "Task", priority: 1 };
    const base = {
      schema_version: 40,
      repo_scope: f.repo,
      task_status_counts: { claimed: 1, running: 1, blocked: 1 },
      ready_task_count: 1,
      ready_sample: [row],
      active_deferral_count: 0,
      expired_lease_count: 0,
      generated_at: "2026-10-01T00:00:00Z",
    };
    const invalid = [
      ...[
        "schema_version",
        "ready_task_count",
        "active_deferral_count",
        "expired_lease_count",
        "repo_count",
        "evidence_count",
        "decision_count",
      ].flatMap((key) =>
        [0.5, Number.MAX_SAFE_INTEGER + 1].map((value) => ({ ...base, [key]: value })),
      ),
      { ...base, task_status_counts: { claimed: Number.MAX_SAFE_INTEGER, running: 1 } },
      { ...base, task_status_counts: { blocked: Number.MAX_SAFE_INTEGER + 1 } },
      { ...base, task_status_counts: { pending: 0.5 } },
      { ...base, task_status_counts: { unexpected_status: 1 } },
      ...[
        { id: Number.MAX_SAFE_INTEGER + 1 },
        { id: 0.5 },
        { priority: 0.5 },
        { priority: -1 },
        { priority: 5 },
        { priority: "1" },
        { claimed_by: 42 },
        { claimed_by: {} },
        { status: null },
        { status: "complete" },
        { status: 7 },
      ].map((patch) => ({ ...base, ready_sample: [{ ...row, ...patch }] })),
    ];
    for (const payload of invalid) {
      const config = f.config(
        { "startup.snapshot": { payload } },
        { PI_SOCIETY_CONTEXT_MAX_WARNINGS: "0" },
      );
      const packet = await buildStartupContextPacket(f.repo, undefined, config);
      assert.equal(packet.sourceHealth, "degraded", JSON.stringify(payload));
      assert.ok((packet.warningCount || 0) > 0);
      assert.deepEqual(packet.warnings, []);
      assert.deepEqual(packet.readyTasks, []);
      assert.equal(packet.readyTaskCount, undefined);
      assert.equal(packet.activeTaskCount, undefined);
      assert.equal(packet.blockedTaskCount, undefined);
      assert.equal(packet.ak?.runtimeSchemaVersion, undefined);
      assert.ok(!packet.ak?.machineSurfaces.includes("startup.snapshot v1"));
    }
    for (const priority of [0, 4]) {
      const config = f.config({
        "startup.snapshot": {
          payload: {
            ...base,
            ready_sample: [
              {
                ...row,
                id: Number.MAX_SAFE_INTEGER,
                priority,
                status: "pending",
                claimed_by: null,
              },
            ],
          },
        },
      });
      const packet = await buildStartupContextPacket(f.repo, undefined, config);
      assert.equal(packet.sourceHealth, "healthy");
      assert.equal(packet.readyTasks[0]?.id, Number.MAX_SAFE_INTEGER);
      assert.equal(packet.readyTasks[0]?.priority, priority);
      assert.equal(packet.readyTasks[0]?.claimedBy, null);
    }
    const metadata = await buildStartupContextPacket(
      f.repo,
      undefined,
      f.config(
        {
          "repo.resolve": {
            payload: {
              input: f.repo,
              registered: true,
              canonical_path: f.repo,
              repo: { path: f.repo, company: 42 },
            },
          },
        },
        { PI_SOCIETY_CONTEXT_MAX_WARNINGS: "0" },
      ),
    );
    assert.equal(metadata.sourceHealth, "degraded");
    assert.equal(metadata.ak?.repoRegistered, null);
    assert.ok((metadata.warningCount || 0) > 0);
    assert.deepEqual(metadata.warnings, []);
  } finally {
    f.dispose();
  }
});
