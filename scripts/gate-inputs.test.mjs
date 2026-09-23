// summary: Regression coverage for commit-gate toolchain, tracked paths, and install admission.
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { auditFileBudgets } from './file-budget-audit.mjs';

const ROOT = path.resolve(import.meta.dirname, '..');
function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'gate-inputs-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return root;
}
function json(root, name, value) {
  const file = path.join(root, name);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(value));
}
function git(root, ...args) { return execFileSync('git', ['-C', root, ...args], { encoding: 'utf8' }); }
function installedFixture(t) {
  const root = fixture(t);
  git(root, 'init', '-q');
  json(root, 'packages/demo/package.json', { name: 'demo', dependencies: { dep: '1.0.0' } });
  json(root, 'packages/demo/package-lock.json', { lockfileVersion: 3, packages: {
    '': { name: 'demo', dependencies: { dep: '1.0.0' } },
    'node_modules/dep': { version: '1.0.0', resolved: 'https://example.test/dep.tgz', integrity: 'sha512-test' },
    'node_modules/platform-only': { version: '1.0.0', optional: true, os: ['darwin'] },
  } });
  json(root, 'packages/demo/node_modules/dep/package.json', { name: 'dep', version: '1.0.0' });
  json(root, 'packages/demo/node_modules/.package-lock.json', { lockfileVersion: 3, packages: {
    'node_modules/dep': { version: '1.0.0', resolved: 'https://example.test/dep.tgz', integrity: 'sha512-test' },
  } });
  git(root, 'add', 'packages/demo/package.json', 'packages/demo/package-lock.json');
  return root;
}
function checkInstalls(root) {
  return spawnSync(process.execPath, [path.join(ROOT, 'scripts/validate-package-installs.mjs'), '--repo-root', root], { encoding: 'utf8' });
}
function updateJson(root, name, mutate) {
  const value = JSON.parse(fs.readFileSync(path.join(root, name)));
  mutate(value);
  json(root, name, value);
}

test('incomplete lock cannot hide required dependencies', t => {
  const root = installedFixture(t);
  updateJson(root, 'packages/demo/package-lock.json', lock => { delete lock.packages['node_modules/dep']; });
  json(root, 'packages/demo/node_modules/.package-lock.json', { lockfileVersion: 3, packages: {} });
  assert.match(checkInstalls(root).stderr, /required dependency dep.*missing.*lock/);
});
test('peer requirements and optional-peer metadata stay synchronized', t => {
  const root = installedFixture(t);
  updateJson(root, 'packages/demo/package.json', manifest => { manifest.peerDependencies = { dep: '^2.0.0' }; });
  assert.match(checkInstalls(root).stderr, /peerDependencies differs/);
  updateJson(root, 'packages/demo/package-lock.json', lock => { lock.packages[''].peerDependencies = { dep: '^2.0.0' }; });
  updateJson(root, 'packages/demo/package.json', manifest => { manifest.peerDependenciesMeta = { dep: { optional: true } }; });
  assert.match(checkInstalls(root).stderr, /peerDependenciesMeta differs/);
  git(root, 'rm', '-f', '--cached', 'packages/demo/package-lock.json');
  json(root, 'packages/demo/package.json', { name: 'demo', peerDependencies: { dep: '*' } });
  assert.match(checkInstalls(root).stderr, /tracked package-lock/);
});
test('optional local links may be absent but dangling entries fail', t => {
  const root = installedFixture(t);
  json(root, 'packages/provider/package.json', { name: 'provider', version: '1.0.0' });
  updateJson(root, 'packages/demo/package-lock.json', lock => { lock.packages['node_modules/provider'] = { link: true, optional: true, resolved: '../provider' }; });
  assert.equal(checkInstalls(root).status, 0);
  fs.symlinkSync('/nonexistent/ak5787-target', path.join(root, 'packages/demo/node_modules/provider'));
  assert.equal(checkInstalls(root).status, 1);
});
test('npm-produced optional local link can be omitted without a false positive', t => {
  const root = fixture(t);
  git(root, 'init', '-q');
  json(root, 'packages/demo/package.json', { name: 'demo', version: '1.0.0', optionalDependencies: { provider: 'file:../provider' } });
  json(root, 'packages/provider/package.json', { name: 'provider', version: '1.0.0' });
  fs.writeFileSync(path.join(root, 'fixture.npmrc'), '');
  execFileSync('npm', ['install', '--offline', '--ignore-scripts', '--no-audit', '--no-fund',
    '--cache', path.join(root, 'npm-cache'), '--userconfig', path.join(root, 'fixture.npmrc')],
    { cwd: path.join(root, 'packages/demo'), stdio: 'pipe' });
  git(root, 'add', 'packages/demo/package.json', 'packages/demo/package-lock.json', 'packages/provider/package.json');
  const lock = JSON.parse(fs.readFileSync(path.join(root, 'packages/demo/package-lock.json')));
  assert.equal(lock.packages['../provider'].optional, true, JSON.stringify(lock));
  const before = checkInstalls(root);
  assert.equal(before.status, 0, before.stderr);
  fs.unlinkSync(path.join(root, 'packages/demo/node_modules/provider'));
  const after = checkInstalls(root);
  assert.equal(after.status, 0, after.stderr);
});
test('tracked budget rejects an external symlinked ancestor', t => {
  const root = fixture(t), outside = fixture(t);
  git(root, 'init', '-q');
  fs.mkdirSync(path.join(root, 'src'));
  fs.writeFileSync(path.join(root, 'src/a.mjs'), '// source');
  git(root, 'add', '.');
  fs.rmSync(path.join(root, 'src'), { recursive: true });
  fs.writeFileSync(path.join(outside, 'a.mjs'), '// external\n'.repeat(501));
  fs.symlinkSync(outside, path.join(root, 'src'));
  const result = auditFileBudgets({ root, tracked: true });
  assert.equal(result.errors.length, 1);
  assert.equal(result.violations.length, 0);
});


test('tracked budget ignores untracked files but still audits tracked content, spaces and newlines', t => {
  const root = fixture(t);
  git(root, 'init', '-q');
  fs.writeFileSync(path.join(root, 'tracked name\nline.mjs'), '// small\n');
  git(root, 'add', '.');
  fs.writeFileSync(path.join(root, 'untracked.mjs'), '// large\n'.repeat(501));
  assert.equal(auditFileBudgets({ root, tracked: true }).violations.length, 0);
  fs.writeFileSync(path.join(root, 'tracked name\nline.mjs'), '// large\n'.repeat(501));
  assert.deepEqual(auditFileBudgets({ root, tracked: true }).violations.map(v => v.path), ['tracked name\nline.mjs']);
  fs.unlinkSync(path.join(root, 'tracked name\nline.mjs'));
  assert.equal(auditFileBudgets({ root, tracked: true }).errors.length, 1);
});
test('tracked selection fails closed outside git', t => {
  assert.throws(() => auditFileBudgets({ root: fixture(t), tracked: true }), /git|tracked/i);
});
test('toolchain admits only the existing exact CI lock', async () => {
  const { checkToolchain } = await import('./check-gate-toolchain.mjs');
  const lock = JSON.parse(fs.readFileSync(path.join(ROOT, 'policy/ci-toolchain-lock.json')));
  assert.deepEqual(checkToolchain(lock, lock.nodeVersion, lock.npmVersion), []);
  assert.match(checkToolchain(lock, '26.9.0', lock.npmVersion).join('\n'), /Node.*22\.22\.2/);
  assert.match(checkToolchain(lock, lock.nodeVersion, '10.9.0').join('\n'), /npm.*12\.0\.2/);
});
test('the next Node lane is opt-in and never widens the pinned lane', async () => {
  const { checkToolchain, expectedNodeVersion } = await import('./check-gate-toolchain.mjs');
  const lock = JSON.parse(fs.readFileSync(path.join(ROOT, 'policy/ci-toolchain-lock.json')));
  assert.notEqual(lock.nextNodeVersion, lock.nodeVersion);
  assert.deepEqual(checkToolchain(lock, lock.nextNodeVersion, lock.npmVersion, 'next'), []);
  assert.match(checkToolchain(lock, lock.nextNodeVersion, lock.npmVersion).join('\n'), /required Node 22\.22\.2/);
  assert.match(checkToolchain(lock, lock.nodeVersion, lock.npmVersion, 'next').join('\n'), /required Node 26\.9\.0/);
  assert.throws(() => expectedNodeVersion(lock, 'latest'), /unknown or unconfigured Node lane/);
  assert.throws(() => expectedNodeVersion({ ...lock, nextNodeVersion: undefined }, 'next'), /unconfigured/);
});
test('install preflight admits platform-optional absence and ignores untracked roots', t => {
  const root = installedFixture(t);
  json(root, 'packages/untracked/package.json', { dependencies: { missing: '*' } });
  const run = checkInstalls(root);
  assert.equal(run.status, 0, run.stderr);
  assert.match(run.stdout, /1 package/);
});
test('actual stale install fails even when hidden lock matches', t => {
  const root = installedFixture(t);
  json(root, 'packages/demo/node_modules/dep/package.json', { name: 'dep', version: '0.9.0' });
  const run = checkInstalls(root);
  assert.equal(run.status, 1);
  assert.match(run.stderr, /packages\/demo.*dep.*0\.9\.0.*1\.0\.0/s);
  assert.match(run.stderr, /npm ci/);
});
test('missing required install fails, while missing optional install does not', t => {
  const root = installedFixture(t);
  fs.rmSync(path.join(root, 'packages/demo/node_modules/dep'), { recursive: true });
  assert.match(checkInstalls(root).stderr, /packages\/demo.*dep.*missing/s);
});
test('hidden lock provenance mismatch is rejected even with matching versions', t => {
  const root = installedFixture(t);
  const file = path.join(root, 'packages/demo/node_modules/.package-lock.json');
  const lock = JSON.parse(fs.readFileSync(file));
  lock.packages['node_modules/dep'].integrity = 'sha512-other';
  fs.writeFileSync(file, JSON.stringify(lock));
  assert.match(checkInstalls(root).stderr, /integrity/);
});
test('missing lock on a tracked dependency-bearing package fails', t => {
  const root = installedFixture(t);
  git(root, 'rm', '--cached', 'packages/demo/package-lock.json');
  assert.match(checkInstalls(root).stderr, /tracked.*package-lock/);
});
test('gate runs toolchain and installs before smoke/tests and stops on their failure', t => {
  const tmp = fixture(t), bin = path.join(tmp, 'bin'), log = path.join(tmp, 'calls');
  fs.mkdirSync(bin);
  fs.writeFileSync(path.join(bin, 'node'), '#!/bin/sh\nprintf "%s\\n" "$*" >> "$CALL_LOG"\ncase "$1" in *check-gate-toolchain.mjs|*check-dev-pin-drift.mjs) exit 0;; *) exit 23;; esac\n', { mode: 0o755 });
  const run = spawnSync('bash', ['scripts/ci/full.sh'], { cwd: ROOT, encoding: 'utf8', env: { ...process.env, PATH: `${bin}:${process.env.PATH}`, CALL_LOG: log, PI_SKIP_PACKAGES: '0', PI_EXTENSIONS_TMPDIR: tmp } });
  assert.equal(run.status, 23);
  const logged = fs.readFileSync(log, 'utf8').trim().split('\n');
  // Node selection only evaluates read-only `node -p` queries before admission.
  const probes = logged.slice(0, logged.findIndex(c => c.includes('check-gate-toolchain')));
  assert.ok(probes.every(c => c.startsWith('-p ')), probes.join('\n'));
  const calls = logged.slice(probes.length);
  assert.match(calls[0], /check-gate-toolchain/);
  assert.match(calls.at(-1), /validate-package-installs/);
  assert.ok(!calls.some(c => c.includes('--test')));
});
test('commit gates select an installed exact pinned Node, force the pinned lane, and use nothing else', t => {
  const root = fixture(t);
  json(root, 'policy/ci-toolchain-lock.json', { schemaVersion: 1, nodeVersion: '1.2.3', npmVersion: '9.9.9', nextNodeVersion: '4.5.6' });
  const fakeNode = (name, version) => {
    const file = path.join(root, name);
    fs.writeFileSync(file, `#!/bin/sh\necho v${version}\n`, { mode: 0o755 });
    return file;
  };
  const select = (env) => spawnSync('sh', ['-c', `. "${path.join(ROOT, 'scripts/select-gate-node.sh')}"; echo "lane=$PI_GATE_NODE_LANE"; command -v node`], {
    cwd: root,
    encoding: 'utf8',
    env: { ...process.env, HOME: root, PI_EXTENSIONS_TMPDIR: path.join(root, 'tmp'), ...env },
  });
  const selected = (run) => fs.realpathSync(run.stdout.trim().split('\n').at(-1));
  fs.mkdirSync(path.join(root, 'tmp'));
  const ambient = execFileSync('sh', ['-c', 'command -v node'], { encoding: 'utf8' }).trim();

  const chosen = select({ PI_GATE_NODE_BIN: fakeNode('node-pinned', '1.2.3') });
  assert.equal(chosen.status, 0, chosen.stderr);
  assert.match(chosen.stdout, /using installed Node 1\.2\.3/);
  assert.equal(selected(chosen), path.join(root, 'node-pinned'));

  // A `next` lane left exported in the shell never reaches a commit gate.
  fakeNode('node-next', '4.5.6');
  const leftover = select({ PI_GATE_NODE_LANE: 'next', PI_GATE_NODE_BIN: path.join(root, 'node-next') });
  assert.match(leftover.stdout, /lane=pinned/);
  assert.equal(leftover.stdout.trim().split('\n').at(-1), ambient, 'the next-line binary is not the pin');

  const relative = select({ PI_GATE_NODE_BIN: './node-pinned' });
  assert.equal(selected(relative), path.join(root, 'node-pinned'), 'a relative candidate links to the real binary');

  const wrong = select({ PI_GATE_NODE_BIN: fakeNode('node-wrong', '1.2.4') });
  assert.equal(wrong.status, 0, wrong.stderr);
  assert.equal(wrong.stdout.trim().split('\n').at(-1), ambient, 'a candidate reporting another version is never used');
});
