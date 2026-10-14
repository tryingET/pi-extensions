// Production conformance checks: registry metadata and retained downloaded bytes,
// not candidate receipts or publication authority. The caller must audit signatures.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { ASC_NAME, ascArtifactHashes, verifyAscCandidateArtifact,
  verifyAscCandidateLocks as verifyAscOwnerLocks,
  verifyAscInstalledContent } from '../packages/pi-society-orchestrator/src/runtime/asc-candidate-artifact.ts';
import { evaluateAscRegistryLock } from '../packages/pi-society-orchestrator/scripts/validate-asc-bridge-lifecycle.mjs';

export function requiresRetainedConsumerIdentity(plan, wave, consumer) {
  const expected = plan?.consumerArtifact;
  return Boolean(wave?.components?.some(entry => entry.packageName === ASC_NAME) ||
    (expected && expected.name === consumer.name && expected.version === consumer.version));
}
function regularBytes(file) {
  const stat = fs.lstatSync(file);
  assert(stat.isFile() && !stat.isSymbolicLink(), `Production proof file must be regular: ${file}`);
  assert.equal(fs.realpathSync(file), path.resolve(file), `Production proof file path must be physical: ${file}`);
  return fs.readFileSync(file);
}
const json = file => JSON.parse(regularBytes(file).toString());
export function verifyProductionAscInstalled({ project, tarball, pkg, lock, registryReleaseState, registryArtifact }) {
  assert.equal(registryReleaseState?.schema, undefined, 'Candidate receipt is not registry release evidence');
  assert.equal(registryArtifact?.schema, undefined, 'Candidate receipt is not registry artifact evidence');
  const evaluation = evaluateAscRegistryLock({ pkg, lock, registryReleaseState, registryArtifact });
  assert(evaluation.ok, evaluation.issues.join('\n'));
  const bytes = regularBytes(tarball);
  const hashes = ascArtifactHashes(bytes);
  assert.equal(hashes.integrity, evaluation.integrity, 'Downloaded production bytes do not match registry SRI');
  // This identity is derived from actual downloaded bytes after registry admission.
  // Reused identity/content functions grant no candidate or publication authority.
  const artifact = { name: ASC_NAME, version: evaluation.selectedVersion,
    relativePath: path.basename(tarball), ...hashes };
  verifyAscCandidateArtifact(artifact, path.dirname(tarball));
  const modules = path.resolve(project, 'node_modules');
  assert(fs.lstatSync(modules).isDirectory() && !fs.lstatSync(modules).isSymbolicLink(),
    'Production node_modules must be a physical directory');
  assert.equal(fs.realpathSync(modules), modules, 'Production node_modules escapes installation');
  const installedPkg = json(path.join(project, 'package.json'));
  const regular = json(path.join(project, 'package-lock.json'));
  const hidden = json(path.join(modules, '.package-lock.json'));
  verifyAscOwnerLocks({ selector: evaluation.selectedVersion, artifact }, installedPkg, regular, hidden);
  verifyAscInstalledContent(path.join(modules, ...ASC_NAME.split('/')), tarball,
    evaluation.selectedVersion, project);
  return evaluation;
}
