// Structural workflow tests complement, not replace, installed artifact execution.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
const read = name => fs.readFileSync(new URL(`../${name}`, import.meta.url), 'utf8');
test('candidate installation/evidence paths explicitly qualify retained bytes', () => {
  for (const name of ['ci', 'release-check', 'compatibility-canary', 'release-evidence']) {
    const workflow = read(`.github/workflows/${name}.yml`);
    assert.match(workflow, /asc-candidate-artifact\.mjs qualify-if-needed/);
    assert.match(workflow, /--output-env-file "\$GITHUB_ENV"/);
    if (name === 'release-check' || name === 'compatibility-canary') {
      assert(workflow.indexOf('qualify-if-needed') < workflow.indexOf('name: Install package dependencies') ||
        workflow.indexOf('qualify-if-needed') < workflow.indexOf('name: Install scenario dependencies'));
    }
  }
  const compatibility = read('.github/workflows/compatibility-canary.yml');
  assert.match(compatibility, /if \[\[ -n "\$\{PI_ASC_CANDIDATE_RECEIPT:-\}" \]\]; then\s+node .* verify-installed/);
});
test('planned identity and generated consumer owner are committed before any future tagging; no tag mutation', () => {
  const workflow = read('.github/workflows/release-please.yml');
  const sync = workflow.slice(workflow.indexOf('name: Sync release PR lockfiles'));
  const scratch = sync.indexOf('mktemp -d "$RUNNER_TEMP/asc-release-plan.XXXXXX"');
  const exported = sync.indexOf('export TMPDIR="$release_tmp"');
  assert(scratch >= 0 && scratch < exported && exported < sync.indexOf('prepare-plan'));
  assert(sync.indexOf('prepare-plan') < sync.indexOf('sync-release-locks.mjs'));
  assert(sync.indexOf('git add policy/asc-candidate-plan.json') < sync.indexOf('git commit'));
  assert(sync.indexOf('governed-runtime-asc-owner.generated.ts') < sync.indexOf('git commit'));
  assert.doesNotMatch(sync, /git tag|npm publish/);
  assert.match(workflow, /Dispatch dependency-first publication wave/);
});
test('publication retains strict registry handoff and exact candidate equality; it never qualifies candidates', () => {
  const workflow = read('.github/workflows/publish.yml');
  assert(workflow.indexOf('registry-handoff-check') < workflow.indexOf('name: Install package dependencies'));
  assert.equal((workflow.match(/asc-candidate-artifact\.mjs"? publication-check/g) ?? []).length, 3);
  assert.doesNotMatch(workflow, /qualify-if-needed|prepare-plan/);
  assert.match(workflow, /release-tooling\/scripts\/asc-candidate-artifact.mjs/);
  assert.equal((workflow.match(/--repo-root "\$GITHUB_WORKSPACE"/g) ?? []).length, 4);
  const helper = read('scripts/asc-candidate-artifact.mjs');
  assert.match(helper, /npm.*|audit/);
  assert.match(helper, /\['audit', 'signatures', '--registry=https:\/\/registry.npmjs.org\/'\]/);
  assert.match(helper, /evaluateAscRegistryLock/);
  assert.match(helper, /assertPlannedPublicationBytes/);
  assert.match(helper, /rejectCandidatePublication\(\)/);
  const production = helper.slice(helper.indexOf('async function registryHandoffCheck'), helper.indexOf('async function main'));
  assert(production.indexOf('fs.writeFileSync(downloaded, bytes') < production.indexOf("['install', '--ignore-scripts'"));
  assert(production.indexOf("['audit', 'signatures'") < production.indexOf('verifyProductionAscInstalled({'));
  assert(production.indexOf('verifyProductionAscInstalled({') < production.indexOf('verifyInstalledAscExecution(scratch)'));
  assert.match(production, /requiresRetainedConsumerIdentity\(plan, wave, pkg\)/);
});
test('numeric candidate closure reuses retained bytes; production declarations remain numerical and unbundled', () => {
  const helper = read('scripts/release-artifact.mjs');
  assert.match(helper, /candidateAscDependency\(ROOT, packageManifest, closure\)/);
  assert.match(helper, /reuseCandidateAsc\(ROOT, dependency.root/);
  assert.match(helper, /verifyInstalledCandidateClosure/);
  const pkg = JSON.parse(read('packages/pi-society-orchestrator/package.json'));
  assert.match(pkg.dependencies['@tryinget/pi-autonomous-session-control'], /^\^?\d+\.\d+\.\d+$/);
  assert(![...(pkg.bundleDependencies ?? []), ...(pkg.bundledDependencies ?? [])].includes('@tryinget/pi-autonomous-session-control'));
  const graph = read('packages/pi-society-orchestrator/src/runtime/governed-runtime-graph.ts');
  assert.match(graph, /verifyAscCandidateInstalled/);
  assert.match(graph, /candidateReceipt \? "candidate_artifact" : "registry_external"/);
  const full = read('scripts/ci/full.sh');
  assert.match(full, /asc-candidate-artifact.test.mjs/);
});
