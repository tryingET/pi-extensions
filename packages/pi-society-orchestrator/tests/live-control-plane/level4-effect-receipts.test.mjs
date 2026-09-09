import assert from "node:assert/strict";
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { runAutoresearchLevel4CampaignRunner as run } from "../../src/runtime/autoresearch-level4-runner.ts";
import { withTempDir } from "./helpers.mjs";

for (const effectStatus of [
  "dispatched",
  "effect_indeterminate",
  "failed",
  "aborted",
  "timed_out",
  "verified_success",
]) {
  test(`Given a journal claiming post-dispatch ${effectStatus}, When resumed with permissions, Then reject without replay, advancement or journal mutation`, async () => {
    await withTempDir(async (cwd) => {
      const input = request(cwd);
      const observed = run(input).newReceipts[0];
      const file = path.join(cwd, input.level4ReceiptPath);
      const text = `${JSON.stringify({ ...observed, effectStatus })}\n`;
      writeFileSync(file, text);
      assert.throws(
        () => run({ ...input, allowMeasureExportReview: true, allowReviewGeneration: true }),
        /Invalid\/legacy Level-4 receipt/,
      );
      assert.equal(readFileSync(file, "utf8"), text);
    });
  });
}

function request(cwd) {
  writeFileSync(path.join(cwd, "package.json"), JSON.stringify({ scripts: { check: "true" } }));
  const input = {
    taskId: 5582,
    cwd,
    objective: "verify Level-4 effect truth",
    direction: "lower",
    metricName: "total_ms",
    metricThreshold: 0,
    scenarios: ["safety"],
    hypotheses: ["receipts"],
    candidateCountPerCell: 1,
    parentPeerTarget: "controller-5582",
    level4ReceiptPath: ".autoresearch/receipts.jsonl",
  };
  const initial = run(input);
  const runner = initial.sourceLevel3Executor.level3Runner;
  return {
    ...input,
    checkpointConfirmation: runner.checkpointGate?.requiredToken ?? runner.requiredToken,
  };
}

test("Given an awaiting bind, When resumed repeatedly, Then no receipt advances the cursor", async () => {
  await withTempDir(async (cwd) => {
    const input = request(cwd);
    const first = run(input);
    for (let i = 0; i < 3; i++) {
      const next = run(input);
      assert.equal(next.completedActionCount, 0);
      assert.equal(
        next.sourceLevel3Executor.selectedAction.call,
        first.sourceLevel3Executor.selectedAction.call,
      );
      assert.equal(next.newReceipts.length, 0, "duplicate observations are idempotent");
    }
  });
});

test("Given both automation permissions but no effect adapter, When measurement is selected, Then no executed receipt or advancement is reported", async () => {
  await withTempDir(async (cwd) => {
    const input = {
      ...request(cwd),
      completedActionCount: 1,
      allowMeasureExportReview: true,
      allowReviewGeneration: true,
      maxAutomatedActions: 25,
    };
    const result = run(input);
    assert.equal(result.completedActionCount, 1);
    assert.equal(result.posture, "awaiting_external_controller");
    assert.equal(result.execution, "not_executed_by_orchestrator");
    assert.equal(
      result.newReceipts.some((r) => r.disposition === "executed_by_level4"),
      false,
    );
    assert.equal(result.newReceipts[0].effectStatus, "not_dispatched");
    assert.equal(result.metric.status, "blocked");
    assert.match(result.nextStep, /owner|controller/i);
    assert.equal(run({ ...input, completedActionCount: undefined }).completedActionCount, 1);
  });
});

for (const change of [
  { taskId: 99 },
  { objective: "different campaign" },
  { hypotheses: ["different plan"] },
]) {
  test(`Given persisted observations, When request identity drifts ${JSON.stringify(change)}, Then fail closed`, async () => {
    await withTempDir(async (cwd) => {
      const input = request(cwd);
      run(input);
      const before = readFileSync(path.join(cwd, input.level4ReceiptPath), "utf8");
      assert.throws(() => run({ ...input, ...change }), /receipt|identity|plan/i);
      assert.equal(readFileSync(path.join(cwd, input.level4ReceiptPath), "utf8"), before);
    });
  });
}

for (const line of [
  "{}",
  "null",
  '{"kind":"autoresearch.level4_campaign_runner_receipt.v1","disposition":"executed_by_level4"}',
  '{"partial":',
]) {
  test(`Given an untrusted or torn receipt ${line}, When resumed, Then reject without cursor movement`, async () => {
    await withTempDir(async (cwd) => {
      const input = request(cwd);
      mkdirSync(path.join(cwd, ".autoresearch"), { recursive: true });
      writeFileSync(path.join(cwd, input.level4ReceiptPath), `${line}\n`);
      assert.throws(() => run(input));
    });
  });
}

test("Given duplicated observations and a reordered action plan, When replayed, Then duplicates never count and plan drift is rejected", async () => {
  await withTempDir(async (cwd) => {
    const input = request(cwd);
    run(input);
    const file = path.join(cwd, input.level4ReceiptPath);
    appendFileSync(file, readFileSync(file, "utf8"));
    assert.equal(run(input).completedActionCount, 0);
    assert.throws(
      () =>
        run({
          ...input,
          candidateBindings: [
            {
              laneId: "cell-01-01-candidate-01",
              candidateWorktree: path.join(cwd, "candidate"),
              candidateBranch: "candidate/a",
              candidateBaseRef: "HEAD",
              candidateDiffSummary: "changed",
              candidateFilesChanged: ["a.ts"],
            },
          ],
        }),
      /plan|identity|receipt/i,
    );
  });
});

test("Given an out-of-range cursor, When called, Then fail closed rather than report completion", async () => {
  await withTempDir(async (cwd) => {
    const input = request(cwd);
    assert.throws(
      () => run({ ...input, completedActionCount: 999 }),
      /completedActionCount|cursor/i,
    );
  });
});

test("Given an aborted request, When called, Then no observation is written", async () => {
  await withTempDir(async (cwd) => {
    const input = request(cwd);
    assert.throws(() => run({ ...input, signal: AbortSignal.abort() }), /abort/i);
    assert.equal(existsSync(path.join(cwd, input.level4ReceiptPath)), false);
  });
});

test("Given an accepted checkpoint and no measured packets, When inspected, Then comparison remains pending", async () => {
  await withTempDir(async (cwd) => {
    const result = run(request(cwd));
    const packet = result.promptRunnerBundle.candidateCloseoutPacket;
    assert.equal(packet.comparison.status, "pending_candidate_result_packets");
    assert.equal(packet.postFaninPromotionHandoff.ownerReviewCall, null);
    assert.equal(result.metric.status, "blocked");
  });
});
