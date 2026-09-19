// summary: Health-lane drift alarms remain strict, using only owned synthetic Git/profile sources.
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { loadEcProfiles } from "../src/ec-profiles.ts";
import { lintAgentFleet } from "../src/fleet-lint.ts";
import { assertFleetBaseline } from "./environment-health/baseline-assertions.mjs";
import {
  commitAll,
  createMissingManifestRepo,
  createProfileRepo,
  git,
} from "./fleet-lint-fixtures.mjs";

function baseline(report) {
  return {
    reportSha256: report.reportSha256,
    stateSha256: report.stateSha256,
    profileSource: {
      commit: report.profileSource.commit,
      rawSha256: report.profileSource.rawSha256,
    },
    summary: {
      candidateRepositories: report.summary.candidateRepositories,
      manifests: report.summary.manifests,
      errors: report.summary.errors,
      warnings: report.summary.warnings,
    },
    repositories: Object.fromEntries(
      report.repositories.map((entry) => [
        entry.repo,
        {
          commit: entry.revision.commit,
          codes: entry.diagnostics.map((diagnostic) => diagnostic.code),
        },
      ]),
    ),
  };
}

test("health baseline detects HEAD-only commits and profile-byte drift without changing a live owner repo", async (t) => {
  const root = mkdtempSync(join(tmpdir(), "fleet-health-contract-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const core = join(root, "engineering-core");
  const agent = join(root, "agents/agent-legacy");
  createProfileRepo(core);
  createMissingManifestRepo(agent);
  const profile = join(core, "skills/profiles.json");
  const capture = async () =>
    lintAgentFleet({
      roots: [agent],
      ec: await loadEcProfiles(profile),
      observedAt: "2026-09-19T00:00:00.000Z",
    });
  const before = await capture();
  const pinned = baseline(before);
  assert.doesNotThrow(() => assertFleetBaseline(before, pinned));

  git(core, "commit", "--allow-empty", "--quiet", "-m", "unrelated owner commit");
  const headOnly = await capture();
  assert.equal(headOnly.profileSource.rawSha256, before.profileSource.rawSha256);
  assert.notEqual(headOnly.profileSource.commit, before.profileSource.commit);
  assert.throws(() => assertFleetBaseline(headOnly, pinned), /engineering-core HEAD drift/);

  writeFileSync(profile, `${readFileSync(profile, "utf8")}\n`);
  commitAll(core, "profile bytes changed");
  const changed = await capture();
  assert.notEqual(changed.profileSource.rawSha256, headOnly.profileSource.rawSha256);
  assert.throws(
    () => assertFleetBaseline(changed, baseline(headOnly)),
    /engineering-core profile bytes drift/,
  );
});
