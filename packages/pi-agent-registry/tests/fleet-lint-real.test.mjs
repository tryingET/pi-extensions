// summary: pins the exact unhealthy real-fleet observation so external manifest/profile drift cannot stay silent.
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { loadEcProfiles } from "../src/ec-profiles.ts";
import { lintAgentFleet } from "../src/fleet-lint.ts";
import { expandTildePath } from "../src/registry.ts";

const workspace = expandTildePath("~/ai-society");
const fleetPattern = join(workspace, "agents", "agent-*");
const profilesPath = join(workspace, "core", "engineering-core", "skills", "profiles.json");
const baseline = JSON.parse(
  readFileSync(new URL("./fixtures/real-fleet-lint-baseline.json", import.meta.url), "utf8"),
);

test("real fleet walk matches the exact revision-bound unhealthy baseline", async (t) => {
  if (!existsSync(join(workspace, "agents")) || !existsSync(profilesPath)) {
    t.skip("real ai-society agent fleet or engineering-core profile source is unavailable");
    return;
  }
  const ec = await loadEcProfiles(profilesPath);
  const report = await lintAgentFleet({
    roots: [fleetPattern],
    ec,
    observedAt: baseline.observedAt,
  });

  assert.equal(report.authorityEffect, "none");
  assert.equal(report.policy.dispatchPosture, "fleet_phase_0_disabled");
  assert.equal(report.summary.status, "unhealthy");
  assert.equal(report.reportSha256, baseline.reportSha256);
  assert.equal(report.stateSha256, baseline.stateSha256);
  assert.equal(report.profileSource.rawSha256, baseline.profileSource.rawSha256);
  assert.equal(report.profileSource.commit, baseline.profileSource.commit);
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
});
