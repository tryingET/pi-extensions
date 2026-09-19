// summary: Shared drift assertions; accepts supplied observations only and never discovers live sources.
import assert from "node:assert/strict";

export function assertFleetBaseline(report, baseline) {
  assert.equal(report.authorityEffect, "none");
  assert.equal(report.policy.dispatchPosture, "fleet_phase_0_disabled");
  assert.equal(report.summary.status, "unhealthy");
  assert.equal(
    report.profileSource.rawSha256,
    baseline.profileSource.rawSha256,
    "engineering-core profile bytes drift",
  );
  assert.equal(
    report.profileSource.commit,
    baseline.profileSource.commit,
    "engineering-core HEAD drift",
  );
  assert.equal(report.reportSha256, baseline.reportSha256, "fleet observation drift");
  assert.equal(report.stateSha256, baseline.stateSha256, "fleet state drift");
  assert.doesNotMatch(JSON.stringify(report), /\/home\/tryinget/u);
  for (const [field, value] of Object.entries(baseline.summary)) {
    assert.equal(report.summary[field], value, field);
  }
  assert.deepEqual(
    Object.fromEntries(
      report.repositories.map((entry) => [
        entry.repo,
        {
          commit: entry.revision.commit,
          codes: entry.diagnostics.map((diagnostic) => diagnostic.code),
        },
      ]),
    ),
    baseline.repositories,
  );
}
