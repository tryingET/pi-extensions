// These 0.8.1 metadata records are fixtures, NOT claims of publication/provenance.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { ASC_NAME, ASC_EXECUTION_VALUES, ascArtifactHashes, ascCanonicalUrl } from '../packages/pi-society-orchestrator/src/runtime/asc-candidate-artifact.ts';
import { requiresRetainedConsumerIdentity, verifyProductionAscInstalled } from './asc-registry-handoff.mjs';
import { parseNpmPackJson } from './npm-pack-json.mjs';
const write = (file, value) => fs.writeFileSync(file, JSON.stringify(value, null, 2) + '\n');
function fixture(t) {
  assert(process.env.TMPDIR, 'Owned TMPDIR required');
  const root = fs.mkdtempSync(path.join(process.env.TMPDIR, 'ak7076-production-falsifier-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const source = path.join(root, 'source'), project = path.join(root, 'project');
  fs.mkdirSync(source); fs.mkdirSync(project);
  const version = '0.8.1';
  write(path.join(source, 'package.json'), { name: ASC_NAME, version, type: 'module', exports: { '.': './self.js', './execution': './execution.js' } });
  fs.writeFileSync(path.join(source, 'self.js'), 'export default function self() {}\n');
  fs.writeFileSync(path.join(source, 'execution.js'), ASC_EXECUTION_VALUES.map(name => name === 'ASC_EXECUTION_OBSERVATION_EVENT'
    ? `export const ${name} = 'fixture';` : `export function ${name}() { return {}; }`).join('\n'));
  const npm = (args, cwd = project) => execFileSync('npm', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  const pack = parseNpmPackJson(npm(['pack', '--json', '--ignore-scripts', '--pack-destination', root], source));
  const tarball = path.join(root, pack.filename), hashes = ascArtifactHashes(fs.readFileSync(tarball));
  const pkg = { name: '@tryinget/pi-society-orchestrator', version: '0.13.4', dependencies: { [ASC_NAME]: '^0.8.0' } };
  const entry = { version, resolved: ascCanonicalUrl(version), integrity: hashes.integrity };
  const lock = { lockfileVersion: 3, packages: { '': pkg, [`node_modules/${ASC_NAME}`]: entry } };
  write(path.join(project, 'package.json'), { name: 'production-installed-fixture', version: '0.0.0', private: true, dependencies: { [ASC_NAME]: version } });
  write(path.join(project, 'package-lock.json'), { lockfileVersion: 3, requires: true, packages: {
    '': JSON.parse(fs.readFileSync(path.join(project, 'package.json'))), [`node_modules/${ASC_NAME}`]: entry,
  } });
  const cache = path.join(root, 'cache');
  npm(['cache', 'add', tarball, `--cache=${cache}`]);
  npm(['ci', '--offline', '--ignore-scripts', '--legacy-peer-deps', '--no-audit', '--no-fund', `--cache=${cache}`]);
  const args = { project, tarball, pkg, lock,
    registryReleaseState: { versions: ['0.8.0', version], time: { '0.8.0': '2026-10-01T00:00:00Z', [version]: '2026-10-02T00:00:00Z' } },
    registryArtifact: { version, dist: { tarball: entry.resolved, integrity: hashes.integrity,
      signatures: [{ keyid: 'fixture', sig: 'fixture' }], attestations: { url: 'https://fixture.invalid/attestation',
        provenance: { predicateType: 'https://slsa.dev/provenance/v1' } } } } };
  return { root, source, project, args, owner: path.join(project, 'node_modules', ...ASC_NAME.split('/')) };
}
test('production installed-boundary check rejects tampered content, links, duplicates and wrong import owner', t => {
  const f = fixture(t);
  assert.equal(verifyProductionAscInstalled(f.args).ok, true);
  const execution = path.join(f.owner, 'execution.js'), original = fs.readFileSync(execution);
  fs.appendFileSync(execution, '\n// unqualified installed bytes\n');
  assert.throws(() => verifyProductionAscInstalled(f.args), /bytes differ/);
  fs.writeFileSync(execution, original);
  const duplicateParent = path.join(f.project, 'node_modules/duplicate');
  const duplicate = path.join(duplicateParent, 'node_modules', ...ASC_NAME.split('/'));
  fs.mkdirSync(path.dirname(duplicate), { recursive: true });
  write(path.join(duplicateParent, 'package.json'), { name: 'duplicate', version: '0.0.0' });
  fs.cpSync(f.owner, duplicate, { recursive: true });
  assert.throws(() => verifyProductionAscInstalled(f.args), /Duplicate physical/);
  fs.rmSync(duplicateParent, { recursive: true });
  const retained = `${f.owner}.retained`;
  fs.renameSync(f.owner, retained); fs.symlinkSync(f.source, f.owner, 'dir');
  assert.throws(() => verifyProductionAscInstalled(f.args), /physical installed artifact/);
  fs.unlinkSync(f.owner); fs.renameSync(retained, f.owner);
  fs.unlinkSync(path.join(f.owner, 'self.js')); fs.symlinkSync(path.join(f.source, 'self.js'), path.join(f.owner, 'self.js'));
  assert.throws(() => verifyProductionAscInstalled(f.args), /link|physical/);
});
test('production checks require regular/hidden lock agreement with registry identity, not just hidden metadata', t => {
  const f = fixture(t), key = `node_modules/${ASC_NAME}`;
  for (const filename of ['package-lock.json', 'node_modules/.package-lock.json']) {
    const file = path.join(f.project, filename), original = fs.readFileSync(file);
    for (const [field, bad] of [['version', '0.8.0'], ['integrity', 'sha512-wrong'], ['resolved', ascCanonicalUrl('0.8.0')], ['link', true]]) {
      const lock = JSON.parse(original); lock.packages[key][field] = bad; write(file, lock);
      assert.throws(() => verifyProductionAscInstalled(f.args)); fs.writeFileSync(file, original);
    }
  }
  const regular = path.join(f.project, 'package-lock.json'), original = fs.readFileSync(regular);
  const lock = JSON.parse(original); lock.packages[''].dependencies[ASC_NAME] = '0.8.0'; write(regular, lock);
  assert.throws(() => verifyProductionAscInstalled(f.args), /root lock/); fs.writeFileSync(regular, original);
  const hidden = path.join(f.project, 'node_modules/.package-lock.json'), bytes = fs.readFileSync(hidden);
  fs.unlinkSync(hidden); fs.writeFileSync(path.join(f.root, 'foreign-hidden.json'), bytes);
  fs.symlinkSync(path.join(f.root, 'foreign-hidden.json'), hidden);
  assert.throws(() => verifyProductionAscInstalled(f.args), /must be regular/);
});
test('production always retains canonical SRI, signatures and SLSA checks; candidate receipts cannot substitute', t => {
  const f = fixture(t);
  for (const mutate of [x => delete x.registryArtifact.dist.signatures,
    x => delete x.registryArtifact.dist.attestations, x => x.registryArtifact.dist.integrity = 'sha512-wrong',
    x => x.registryArtifact.dist.tarball = 'file:local.tgz', x => x.registryArtifact.schema = 'pi.asc-candidate-artifact.v1']) {
    const args = { ...f.args, registryArtifact: structuredClone(f.args.registryArtifact) }; mutate(args);
    assert.throws(() => verifyProductionAscInstalled(args));
  }
  fs.appendFileSync(f.args.tarball, 'tamper');
  assert.throws(() => verifyProductionAscInstalled(f.args), /registry SRI/);
});
test('historical ASC 0.8.0 plan does not constrain later independent consumer 0.13.4 with registry ASC 0.8.1', t => {
  const f = fixture(t);
  const plan = { artifact: { name: ASC_NAME, version: '0.8.0', integrity: 'sha512-historical' },
    consumerArtifact: { name: f.args.pkg.name, version: '0.13.3' } };
  const independentWave = { components: [{ packageName: f.args.pkg.name, version: '0.13.4' }] };
  assert.equal(requiresRetainedConsumerIdentity(plan, independentWave, f.args.pkg), false);
  assert.equal(verifyProductionAscInstalled(f.args).selectedVersion, '0.8.1');
  assert.equal(requiresRetainedConsumerIdentity(plan, null, { ...f.args.pkg, version: '0.13.3' }), true);
  assert.equal(requiresRetainedConsumerIdentity(plan, { components: [{ packageName: ASC_NAME, version: '0.8.1' }] }, f.args.pkg), true);
  assert.equal(requiresRetainedConsumerIdentity(null, independentWave, f.args.pkg), false);
});
