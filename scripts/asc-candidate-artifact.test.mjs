import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { ASC_NAME, ASC_CANDIDATE_SCHEMA, ASC_EXECUTION_VALUES, ascArtifactHashes,
  ascCanonicalUrl, verifyAscCandidateArtifact, verifyAscCandidateBinding, verifyAscCandidateReceipt,
  verifyAscCandidateLocks, verifyAscInstalledContent } from '../packages/pi-society-orchestrator/src/runtime/asc-candidate-artifact.ts';
import { assertPlannedPublicationBytes, rejectCandidatePublication } from './asc-candidate-artifact.mjs';
import { evaluateAscRegistryLock } from '../packages/pi-society-orchestrator/scripts/validate-asc-bridge-lifecycle.mjs';
import { parseNpmPackJson } from './npm-pack-json.mjs';
import { syncGeneratedAscRegistryOwner, renderAscRegistryOwnerSource } from '../packages/pi-society-orchestrator/scripts/generate-asc-registry-owner.mjs';
const write = (file, value) => fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
const npm = (args, cwd) => execFileSync('npm', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
const head = 'a'.repeat(40);
function binding(artifact) {
  const inputs = { 'packages/pi-autonomous-session-control/package.json': 'b'.repeat(64) };
  const selector = '^0.8.0';
  const receipt = { schema: ASC_CANDIDATE_SCHEMA, evidenceKind: 'retained_candidate_artifact',
    publicationAuthorized: false, registryProvenance: false, qualification: 'isolated_installed_execution', sourceCommit: head, sourceInputs: inputs, selector, artifact };
  const plan = { schema: 'pi.asc-candidate-plan.v1', evidenceKind: 'planned_artifact_identity',
    publicationAuthorized: false, registryProvenance: false, sourceInputs: inputs, selector, artifact };
  return { receipt, plan, inputs, source: { name: ASC_NAME, version: '0.8.0' }, consumer: { dependencies: { [ASC_NAME]: selector } } };
}
function locks(b) {
  const entry = { version: b.receipt.artifact.version, resolved: ascCanonicalUrl(b.receipt.artifact.version), integrity: b.receipt.artifact.integrity };
  return { regular: { lockfileVersion: 3, packages: { '': b.consumer, [`node_modules/${ASC_NAME}`]: entry } },
    hidden: { lockfileVersion: 3, packages: { [`node_modules/${ASC_NAME}`]: { ...entry } } } };
}
function fixture(t, { version = '0.8.0', broken = false } = {}) {
  const root = fs.mkdtempSync(path.join(process.env.TMPDIR || os.tmpdir(), 'ak7076-candidate-test-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const source = path.join(root, 'source');
  fs.mkdirSync(source);
  write(path.join(source, 'package.json'), { name: ASC_NAME, version, type: 'module',
    exports: { '.': './self.js', './execution': './execution.js' }, files: ['self.js', 'execution.js'] });
  fs.writeFileSync(path.join(source, 'self.js'), 'export default function self() {}\n');
  fs.writeFileSync(path.join(source, 'execution.js'), broken ? 'export const broken = true;\n' :
    ASC_EXECUTION_VALUES.map(name => name === 'ASC_EXECUTION_OBSERVATION_EVENT' ? `export const ${name} = "fixture";` : `export function ${name}() { return {}; }`).join('\n'));
  const record = parseNpmPackJson(npm(['pack', '--json', '--ignore-scripts', '--pack-destination', root], source));
  const tarball = path.join(root, record.filename);
  const artifact = { name: ASC_NAME, version, relativePath: record.filename, ...ascArtifactHashes(fs.readFileSync(tarball)) };
  return { root, source, tarball, artifact, b: binding(artifact) };
}
test('candidate evidence binding falsifies SHA, source/version/range and evidence category confusion', t => {
  const { b } = fixture(t);
  const verify = x => verifyAscCandidateBinding(x.receipt, head, x.inputs, x.source, x.consumer, x.plan);
  verify(b);
  for (const mutate of [
    x => x.receipt.sourceCommit = 'c'.repeat(40),
    x => x.source.version = '0.7.0',
    x => x.receipt.sourceInputs = { ...x.inputs, extra: 'd'.repeat(64) },
    x => x.consumer.dependencies[ASC_NAME] = '^0.7.0',
    x => { x.receipt.selector = x.plan.selector = '^0.7.0'; x.consumer.dependencies[ASC_NAME] = '^0.7.0'; },
    x => x.receipt.schema = 'pi.registry-receipt.v1',
    x => x.receipt.registryProvenance = true,
    x => x.receipt.publicationAuthorized = true,
  ]) {
    const x = structuredClone(b); mutate(x); assert.throws(() => verify(x));
  }
});
test('a pending receipt cannot be consumed as completed candidate qualification', t => {
  const f = fixture(t);
  const receipt = path.join(f.root, 'pending.json');
  write(receipt, { ...f.b.receipt, qualification: 'pending' });
  assert.throws(() => verifyAscCandidateReceipt(f.root, receipt), /qualification phase mismatch/);
});
test('real tarball checks reject relabeled 0.7 bytes and byte tampering', t => {
  const f = fixture(t, { version: '0.7.0' });
  verifyAscCandidateArtifact(f.artifact, f.root);
  assert.throws(() => verifyAscCandidateArtifact({ ...f.artifact, version: '0.8.0' }, f.root), /version mismatch/);
  fs.appendFileSync(f.tarball, 'tamper');
  assert.throws(() => verifyAscCandidateArtifact(f.artifact, f.root), /mismatch/);
});
test('candidate planned locks reject hidden owner drift, source links, and duplicate owner', t => {
  const { b } = fixture(t);
  const original = locks(b);
  verifyAscCandidateLocks(b.receipt, b.consumer, original.regular, original.hidden);
  for (const mutate of [
    x => x.hidden.packages[`node_modules/${ASC_NAME}`].version = '0.7.0',
    x => x.hidden.packages[`node_modules/${ASC_NAME}`].integrity = 'sha512-invalid',
    x => x.hidden.packages[`node_modules/${ASC_NAME}`].resolved = 'file:../pi-autonomous-session-control',
    x => x.regular.packages[`node_modules/${ASC_NAME}`].link = true,
    x => x.hidden.packages[`node_modules/other/node_modules/${ASC_NAME}`] = x.hidden.packages[`node_modules/${ASC_NAME}`],
  ]) {
    const x = structuredClone(original); mutate(x);
    assert.throws(() => verifyAscCandidateLocks(b.receipt, b.consumer, x.regular, x.hidden));
  }
});
test('generated owner frozen at predecessor 0.7 cannot satisfy planned 0.8 lock', t => {
  const { root, b } = fixture(t);
  fs.mkdirSync(path.join(root, 'src/runtime'), { recursive: true });
  write(path.join(root, 'package.json'), b.consumer);
  write(path.join(root, 'package-lock.json'), locks(b).regular);
  fs.writeFileSync(path.join(root, 'src/runtime/governed-runtime-asc-owner.generated.ts'), renderAscRegistryOwnerSource({
    consumer: 'packages/pi-society-orchestrator', name: ASC_NAME, version: '0.7.0', selector: '^0.7.0',
    url: ascCanonicalUrl('0.7.0'), integrity: 'sha512-old', specifiers: [ASC_NAME, `${ASC_NAME}/execution`],
  }));
  assert.equal(syncGeneratedAscRegistryOwner(root, { check: true }).ok, false);
  assert.equal(syncGeneratedAscRegistryOwner(root).ok, true);
  assert.equal(syncGeneratedAscRegistryOwner(root, { check: true }).ok, true);
});
test('real npm cached retained bytes satisfy an unpublished canonical lock without forging registry metadata', t => {
  const f = fixture(t);
  const project = path.join(f.root, 'consumer');
  const cache = path.join(f.root, 'cache');
  fs.mkdirSync(project);
  write(path.join(project, 'package.json'), { name: 'candidate-consumer', version: '0.0.0', private: true, ...f.b.consumer });
  const l = locks(f.b);
  write(path.join(project, 'package-lock.json'), { name: 'candidate-consumer', version: '0.0.0', requires: true, ...l.regular });
  npm(['cache', 'add', f.tarball, `--cache=${cache}`], project);
  // A fresh cache has no registry response for ASC. Offline success proves npm
  // uses retained content SRI; it says nothing about registry availability.
  npm(['ci', '--offline', '--ignore-scripts', '--legacy-peer-deps', '--no-audit', '--no-fund', `--cache=${cache}`], project);
  const hidden = JSON.parse(fs.readFileSync(path.join(project, 'node_modules/.package-lock.json')));
  verifyAscCandidateLocks(f.b.receipt, f.b.consumer, l.regular, hidden);
  const owner = path.join(project, 'node_modules', ...ASC_NAME.split('/'));
  verifyAscInstalledContent(owner, f.tarball, '0.8.0', project);
  const duplicateParent = path.join(project, 'node_modules/duplicate');
  const duplicate = path.join(duplicateParent, 'node_modules', ...ASC_NAME.split('/'));
  fs.mkdirSync(path.dirname(duplicate), { recursive: true });
  write(path.join(duplicateParent, 'package.json'), { name: 'duplicate', version: '0.0.0' });
  fs.cpSync(owner, duplicate, { recursive: true });
  assert.throws(() => verifyAscInstalledContent(owner, f.tarball, '0.8.0', project), /Duplicate physical candidate owner/);
  fs.rmSync(duplicateParent, { recursive: true });
  fs.writeFileSync(path.join(owner, 'execution.js'), 'export const changed = true;');
  assert.throws(() => verifyAscInstalledContent(owner, f.tarball, '0.8.0', project), /bytes differ/);
  fs.rmSync(owner, { recursive: true });
  fs.symlinkSync(f.source, owner, 'dir');
  assert.throws(() => verifyAscInstalledContent(owner, f.tarball, '0.8.0', project), /physical installed artifact/);
});
test('installed retained artifact with broken execution exports fails, even with coherent identity', t => {
  const f = fixture(t, { broken: true });
  const project = path.join(f.root, 'consumer');
  fs.mkdirSync(project);
  write(path.join(project, 'package.json'), { name: 'execution-probe', private: true, dependencies: { [ASC_NAME]: `file:${f.tarball}` } });
  npm(['install', '--ignore-scripts', '--legacy-peer-deps', '--no-audit', '--no-fund'], project);
  assert.throws(() => verifyAscInstalledContent(path.join(project, 'node_modules', ...ASC_NAME.split('/')), f.tarball, '0.8.0', project), /Broken candidate execution export/);
});
test('current publication checker binds an explicit frozen source root, rejects missing adopted plan and candidate context', t => {
  const f = fixture(t);
  const manifest = path.join(f.root, 'release-manifest.json');
  write(manifest, { package: { name: ASC_NAME, version: '0.8.0' } });
  const args = [new URL('./asc-candidate-artifact.mjs', import.meta.url).pathname, 'publication-check', '--repo-root', f.root, '--manifest', manifest];
  const invoke = env => spawnSync(process.execPath, args, { encoding: 'utf8', env: { ...process.env, PI_ASC_CANDIDATE_RECEIPT: '', RELEASE_WAVE_PATH: '', ...env } });
  // No new plan adoption on a legacy tag: its pre-existing production checks
  // remain authoritative. This source-root routing does not publish anything.
  assert.equal(invoke({}).status, 0);
  assert.notEqual(invoke({ PI_ASC_CANDIDATE_RECEIPT: 'candidate.json' }).status, 0);
  fs.mkdirSync(path.join(f.root, 'scripts'));
  fs.writeFileSync(path.join(f.root, 'scripts/asc-candidate-artifact.mjs'), '// adopted marker\n');
  const missing = invoke({});
  assert.notEqual(missing.status, 0);
  assert.match(missing.stderr, /requires a pre-tag retained plan/);
});
test('production rejects candidate receipt and unequal published bytes; registry validator remains strict', t => {
  const f = fixture(t);
  assertPlannedPublicationBytes(f.b.plan, ASC_NAME, '0.8.0', fs.readFileSync(f.tarball));
  assert.throws(() => assertPlannedPublicationBytes(f.b.plan, ASC_NAME, '0.8.0', Buffer.from('different publication')), /bytes differ/);
  const consumerBytes = Buffer.from('retained consumer with exact generated ASC 0.8 owner');
  const plan = { ...f.b.plan, consumerArtifact: { name: '@tryinget/pi-society-orchestrator', version: '0.13.3', ...ascArtifactHashes(consumerBytes) } };
  assertPlannedPublicationBytes(plan, '@tryinget/pi-society-orchestrator', '0.13.3', consumerBytes);
  assert.throws(() => assertPlannedPublicationBytes(plan, '@tryinget/pi-society-orchestrator', '0.13.3', Buffer.from('independently rebuilt different consumer')), /bytes differ/);
  assert.throws(() => rejectCandidatePublication({ PI_ASC_CANDIDATE_RECEIPT: 'candidate.json' }), /cannot be used as registry proof/);
  const result = evaluateAscRegistryLock({ pkg: f.b.consumer, lock: locks(f.b).regular,
    registryReleaseState: f.b.receipt, registryArtifact: f.b.receipt });
  assert.equal(result.ok, false);
  assert(result.issues.some(issue => issue.includes('No ^0.8.0 ASC release is published')));
  assert(result.issues.some(issue => issue.includes('Registry metadata does not prove')));
});
