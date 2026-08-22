import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { runTelemetryKesLifecycleDogfood } from "../scripts/dogfood-telemetry-kes-lifecycle.mjs";

const PACKAGE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SCRIPT = path.join(PACKAGE_ROOT, "scripts", "dogfood-telemetry-kes-lifecycle.mjs");

function byId(report, id) {
  const result = report.cases.find((entry) => entry.id === id);
  assert.ok(result, `dogfood case not found: ${id}`);
  return result;
}

test("dogfoods supporting, falsifying, and insufficient-evidence lifecycle paths", async () => {
  const report = await runTelemetryKesLifecycleDogfood();
  assert.equal(report.schema, "pi.telemetry-kes-dogfood.v1");
  assert.equal(report.fixture.synthetic, true);
  assert.equal(report.fixture.observedValue, 20);
  assert.equal(report.cases.length, 3);

  const supporting = byId(report, "supporting");
  assert.equal(supporting.expectedDisposition, "candidate-materialized");
  assert.equal(supporting.review.thresholdCrossed, true);
  assert.equal(supporting.review.sampleSufficient, true);
  assert.equal(supporting.review.liveCoverageSufficient, true);
  assert.equal(supporting.review.blockerCount, 0);
  assert.equal(supporting.materializedFiles.length, 2);
  assert.deepEqual(
    supporting.materializedFiles.map((entry) => entry.path),
    [
      "docs/learnings/candidates/2026-07-28-subagent-failure-rates-at-or-above-the-declared-threshold-justify-an-owner-reviewed-kes-proposal.md",
      "docs/learnings/diary/2026-07-28-telemetry-subagent-failure-rate-pct.md",
    ],
  );
  for (const file of supporting.materializedFiles) {
    assert.match(file.sha256, /^[0-9a-f]{64}$/u);
  }

  const falsifying = byId(report, "falsifying");
  assert.equal(falsifying.expectedDisposition, "proposal-blocked-by-counterevidence");
  assert.equal(falsifying.review.thresholdCrossed, false);
  assert.equal(falsifying.review.sampleSufficient, true);
  assert.equal(falsifying.review.liveCoverageSufficient, true);
  assert.ok(falsifying.review.blockerCount > 0);
  assert.deepEqual(falsifying.materializedFiles, []);

  const insufficient = byId(report, "insufficient-evidence");
  assert.equal(insufficient.expectedDisposition, "proposal-blocked-by-sample-size");
  assert.equal(insufficient.review.thresholdCrossed, true);
  assert.equal(insufficient.review.sampleSufficient, false);
  assert.equal(insufficient.review.liveCoverageSufficient, true);
  assert.ok(insufficient.review.blockerCount > 0);
  assert.deepEqual(insufficient.materializedFiles, []);

  for (const entry of report.cases) {
    assert.equal(entry.authority.kesStage, "proposal");
    assert.equal(entry.authority.agentKernelMutation, false);
    assert.equal(entry.authority.engineeringContentPromotion, false);
  }
});

test("dogfood CLI is byte-deterministic and contains no temporary paths", () => {
  const run = () =>
    spawnSync(process.execPath, [SCRIPT], {
      cwd: PACKAGE_ROOT,
      encoding: "utf8",
      env: { ...process.env, TZ: "UTC" },
    });

  const first = run();
  const second = run();
  assert.equal(first.status, 0, `${first.stdout}\n${first.stderr}`);
  assert.equal(second.status, 0, `${second.stdout}\n${second.stderr}`);
  assert.equal(second.stdout, first.stdout);
  assert.equal(second.stderr, first.stderr);

  const report = JSON.parse(first.stdout);
  assert.equal(report.schema, "pi.telemetry-kes-dogfood.v1");
  assert.doesNotMatch(first.stdout, /\/tmp\//u);
  assert.doesNotMatch(
    first.stdout,
    /pi-telemetry-kes-(?:supporting|falsifying|insufficient-evidence)-/u,
  );
  assert.doesNotMatch(first.stdout, /society\.db|ak evidence record/iu);
});
