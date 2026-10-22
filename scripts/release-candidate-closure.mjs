// Candidate closure adapter: only the explicitly qualified numerical ASC edge.
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { ASC_NAME, ASC_SOURCE_PATH, ASC_PLAN_PATH, ascArtifactHashes, ascVersionInRange, verifyAscCandidateReceipt,
  verifyAscCandidateArtifact, verifyAscInstalledContent } from '../packages/pi-society-orchestrator/src/runtime/asc-candidate-artifact.ts';

export function candidateAscDependency(root, packageManifest, closure) {
  if (!process.env.PI_ASC_CANDIDATE_RECEIPT || packageManifest.name === ASC_NAME) return null;
  const spec = packageManifest.dependencies?.[ASC_NAME] ?? packageManifest.optionalDependencies?.[ASC_NAME];
  if (!spec || closure.some(entry => entry.manifest.name === ASC_NAME)) return null;
  const receipt = verifyAscCandidateReceipt(root, process.env.PI_ASC_CANDIDATE_RECEIPT);
  assert(ascVersionInRange(receipt.artifact.version, spec), 'Managed numerical dependency excludes retained ASC artifact');
  return { field: 'dependencies', root: path.join(root, ASC_SOURCE_PATH),
    manifest: JSON.parse(fs.readFileSync(path.join(root, ASC_SOURCE_PATH, 'package.json'), 'utf8')) };
}
export function reuseCandidateAsc(root, packageRoot, destination, artifactRoot) {
  const manifest = JSON.parse(fs.readFileSync(path.join(packageRoot, 'package.json'), 'utf8'));
  if (manifest.name !== ASC_NAME || !process.env.PI_ASC_CANDIDATE_RECEIPT) return null;
  const receiptPath = process.env.PI_ASC_CANDIDATE_RECEIPT;
  const receipt = verifyAscCandidateReceipt(root, receiptPath);
  const retained = verifyAscCandidateArtifact(receipt.artifact, path.dirname(receiptPath));
  assert.equal(manifest.version, receipt.artifact.version);
  fs.mkdirSync(destination, { recursive: true });
  const basename = path.basename(retained);
  const tarballPath = path.join(destination, basename);
  fs.copyFileSync(retained, tarballPath, fs.constants.COPYFILE_EXCL);
  return { root: packageRoot, manifest, tarballPath, basename,
    relativePath: path.relative(artifactRoot, tarballPath).replaceAll(path.sep, '/'),
    sha256: receipt.artifact.sha256, size: receipt.artifact.size,
    npmIntegrity: receipt.artifact.integrity,
    npmShasum: crypto.createHash('sha1').update(fs.readFileSync(retained)).digest('hex'),
    fileCount: null, unpackedSize: null };
}
export function verifyPackedCandidateIdentity(root, packed) {
  if (!process.env.PI_ASC_CANDIDATE_RECEIPT || ![ASC_NAME, '@tryinget/pi-society-orchestrator'].includes(packed.manifest.name)) return;
  const receipt = verifyAscCandidateReceipt(root, process.env.PI_ASC_CANDIDATE_RECEIPT);
  const plan = JSON.parse(fs.readFileSync(path.join(root, ASC_PLAN_PATH), 'utf8'));
  const expected = packed.manifest.name === ASC_NAME ? receipt.artifact : plan.consumerArtifact;
  assert.equal(packed.manifest.name, expected.name);
  assert.equal(packed.manifest.version, expected.version);
  for (const [key, value] of Object.entries(ascArtifactHashes(fs.readFileSync(packed.tarballPath)))) {
    assert.equal(value, expected[key], `Packed candidate differs from pre-tag retained artifact: ${key}`);
  }
}
export function verifyInstalledCandidateClosure(root, records, installRoot) {
  if (!process.env.PI_ASC_CANDIDATE_RECEIPT || !records.some(record => record.name === ASC_NAME)) return;
  const receiptPath = process.env.PI_ASC_CANDIDATE_RECEIPT;
  const receipt = verifyAscCandidateReceipt(root, receiptPath);
  const tarball = verifyAscCandidateArtifact(receipt.artifact, path.dirname(receiptPath));
  verifyAscInstalledContent(path.join(installRoot, 'node_modules', ...ASC_NAME.split('/')),
    tarball, receipt.artifact.version, installRoot);
}
