// summary: Given/When/Then regressions for checkout-bound source-test prerequisite admission.
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { validatePackageInstalls } from './validate-package-installs.mjs';

const ROOT = path.resolve(import.meta.dirname, '..');
const CLI = path.join(ROOT, 'scripts/validate-test-source-dependencies.mjs');
function json(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(value));
}
function git(root, ...args) {
  return execFileSync('git', ['-C', root, ...args], { encoding: 'utf8' });
}
function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'source-test-deps-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  git(root, 'init', '-q');
  const consumer = path.join(root, 'packages/consumer');
  json(path.join(consumer, 'package.json'), { name: 'consumer', private: true });
  const provider = path.join(root, 'packages/provider');
  const manifest = { name: 'provider', version: '1.0.0', dependencies: { dep: '1.0.0' } };
  const packages = { 'node_modules/dep': { version: '1.0.0', resolved: 'https://example.test/dep.tgz', integrity: 'sha512-test' } };
  json(path.join(provider, 'package.json'), manifest);
  json(path.join(provider, 'package-lock.json'), { lockfileVersion: 3, packages: { '': manifest, ...packages } });
  const policy = path.join(consumer, 'policy/test-source-dependencies.json');
  json(policy, { version: 1, packages: [{ path: 'packages/provider', reason: 'Real integration producer and broker' }] });
  git(root, 'add', 'packages');
  function install() {
    json(path.join(provider, 'node_modules/dep/package.json'), { name: 'dep', version: '1.0.0' });
    json(path.join(provider, 'node_modules/.package-lock.json'), { lockfileVersion: 3, packages });
  }
  function check() {
    return spawnSync(process.execPath, [CLI, '--repo-root', root, '--package', consumer], { encoding: 'utf8' });
  }
  return { root, consumer, provider, policy, install, check };
}

test('Given one selected healthy owner and an unrelated broken install, When admitted, Then only the selected owner is checked', t => {
  const f = fixture(t);
  f.install();
  json(path.join(f.root, 'packages/unrelated/package.json'), { dependencies: { missing: '1.0.0' } });
  git(f.root, 'add', 'packages/unrelated');
  const result = validatePackageInstalls(f.root, { packageRoots: [f.provider] });
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.equal(result.packageCount, 1);
});

test('Given a selected owner has a linked dependency, When its owner is omitted, Then require explicit selection and check its installation too', t => {
  const f = fixture(t);
  f.install();
  const leaf = path.join(f.root, 'packages/leaf');
  json(path.join(leaf, 'package.json'), { name: 'leaf', version: '1.0.0' });
  json(path.join(leaf, 'package-lock.json'), { lockfileVersion: 3, packages: { '': { name: 'leaf', version: '1.0.0' } } });
  const manifest = JSON.parse(fs.readFileSync(path.join(f.provider, 'package.json')));
  manifest.dependencies.leaf = 'file:../leaf';
  json(path.join(f.provider, 'package.json'), manifest);
  const lock = JSON.parse(fs.readFileSync(path.join(f.provider, 'package-lock.json')));
  lock.packages[''] = manifest;
  lock.packages['node_modules/leaf'] = { link: true, resolved: '../leaf' };
  json(path.join(f.provider, 'package-lock.json'), lock);
  fs.symlinkSync(leaf, path.join(f.provider, 'node_modules/leaf'));
  git(f.root, 'add', 'packages/leaf');
  let result = f.check();
  assert.equal(result.status, 1, result.stderr);
  assert.match(result.stderr, /linked source owner.*explicit.*select/);
  json(f.policy, { version: 1, packages: [
    { path: 'packages/provider', reason: 'producer' }, { path: 'packages/leaf', reason: 'linked runtime' },
  ] });
  result = f.check();
  assert.equal(result.status, 1, result.stderr);
  assert.match(result.stderr, /packages\/leaf/);
  json(path.join(leaf, 'node_modules/.package-lock.json'), { lockfileVersion: 3, packages: {} });
  result = f.check();
  assert.equal(result.status, 0, result.stderr);
});

test('Given an individual host-owned package link, When selected admission runs, Then retain the existing host exception', t => {
  const f = fixture(t), host = fixture(t);
  const name = '@earendil-works/pi-ai';
  const manifest = { name: 'provider', devDependencies: { [name]: '1.1.0' } };
  json(path.join(f.provider, 'package.json'), manifest);
  json(path.join(f.provider, 'package-lock.json'), { lockfileVersion: 3, packages: {
    '': manifest, [`node_modules/${name}`]: { version: '1.1.0' },
  } });
  json(path.join(f.provider, 'node_modules/.package-lock.json'), { lockfileVersion: 3, packages: {} });
  json(path.join(host.root, 'host/package.json'), { name, version: '1.1.0' });
  fs.mkdirSync(path.join(f.provider, 'node_modules/@earendil-works'), { recursive: true });
  fs.symlinkSync(path.join(host.root, 'host'), path.join(f.provider, 'node_modules', name));
  const result = f.check();
  assert.equal(result.status, 0, result.stderr);
});

test('Given an uninstalled source-test owner, When checked, Then fail with owner and repair without writing files', t => {
  const f = fixture(t);
  const before = git(f.root, 'status', '--porcelain', '--untracked-files=all');
  const result = f.check();
  assert.equal(result.status, 1, result.stderr);
  assert.match(result.stderr, /test-source-dependencies/);
  assert.match(result.stderr, /packages\/consumer.*packages\/provider/);
  assert.match(result.stderr, /npm ci --prefix/);
  assert.match(result.stderr, /no installs|read-only/);
  assert.equal(fs.existsSync(path.join(f.provider, 'node_modules')), false);
  assert.equal(git(f.root, 'status', '--porcelain', '--untracked-files=all'), before);
});

test('Given installed owner metadata but missing or stale runtime dependencies, When checked, Then fail instead of trusting directory existence', t => {
  const f = fixture(t);
  f.install();
  fs.rmSync(path.join(f.provider, 'node_modules/dep'), { recursive: true });
  assert.match(f.check().stderr, /installed package missing/);
  json(path.join(f.provider, 'node_modules/dep/package.json'), { name: 'dep', version: '9.0.0' });
  assert.match(f.check().stderr, /installed 9.0.0; expected 1.0.0/);
});

test('Given locked local installs, When checked, Then pass without requiring live Pi host links', t => {
  const f = fixture(t);
  f.install();
  const result = f.check();
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /1 source package/);
  assert.equal(fs.lstatSync(path.join(f.provider, 'node_modules/dep')).isSymbolicLink(), false);
});

test('Given a healthy foreign checkout, When its package or node_modules substitutes for the selected checkout, Then reject', t => {
  for (const substitute of ['package', 'node_modules', 'dependency']) {
    const f = fixture(t), other = fixture(t);
    other.install();
    if (substitute === 'package') {
      fs.rmSync(f.provider, { recursive: true });
      fs.symlinkSync(other.provider, f.provider);
    } else if (substitute === 'node_modules') {
      fs.symlinkSync(path.join(other.provider, 'node_modules'), path.join(f.provider, 'node_modules'));
    } else {
      f.install();
      fs.rmSync(path.join(f.provider, 'node_modules/dep'), { recursive: true });
      fs.symlinkSync(path.join(other.provider, 'node_modules/dep'), path.join(f.provider, 'node_modules/dep'));
    }
    const result = f.check();
    assert.equal(result.status, 1, result.stderr);
    assert.match(result.stderr, /outside|selected checkout/);
    assert.doesNotMatch(result.stderr, /npm ci/, 'do not recommend installs through a foreign-checkout substitution');
  }
});

test('Given a tracked prerequisite policy is missing, When checked, Then refuse instead of silently skipping admission', t => {
  const f = fixture(t);
  fs.unlinkSync(f.policy);
  const result = f.check();
  assert.equal(result.status, 1, result.stderr);
  assert.match(result.stderr, /tracked.*missing/);
});

test('Given absent metadata, When an unrelated package is checked, Then existing package behavior is unchanged', t => {
  const f = fixture(t);
  git(f.root, 'rm', '-f', f.policy);
  const result = f.check();
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /0 source package/);
});

test('Given malformed or escaping declarations, When checked, Then fail closed', t => {
  assert.ok(fs.existsSync(CLI), 'the admission implementation must exist');
  const f = fixture(t);
  for (const value of [
    { version: 2, packages: [] },
    { version: 1, packages: 'provider' },
    { version: 1, packages: [{ path: '../foreign', reason: 'escape' }] },
    { version: 1, packages: [{ path: 'packages/untracked', reason: 'not an owner' }] },
    { version: 1, packages: [{ path: 'packages/provider', reason: '' }] },
  ]) {
    json(f.policy, value);
    const result = f.check();
    assert.equal(result.status, 1, result.stderr);
  }
});

function gateFixture(t) {
  // Use the real gate and admission code; only unrelated host pins/runner are sentinels.
  const f = fixture(t);
  for (const file of ['package-quality-gate.sh', 'validate-local-package-links.mjs',
    'validate-package-installs.mjs', 'validate-test-source-dependencies.mjs', 'tracked-files.mjs']) {
    fs.mkdirSync(path.join(f.root, 'scripts'), { recursive: true });
    fs.copyFileSync(path.join(ROOT, 'scripts', file), path.join(f.root, 'scripts', file));
  }
  fs.mkdirSync(path.join(f.root, 'scripts/pi-host-compatibility-canary'), { recursive: true });
  fs.writeFileSync(path.join(f.root, 'scripts/pi-host-compatibility-canary/check-dev-pin-drift.mjs'), '// separate host pin checker not under test\n');
  fs.writeFileSync(path.join(f.root, 'scripts/run-package-tests.mjs'),
    `import fs from 'node:fs'; fs.writeFileSync(${JSON.stringify(path.join(f.root, 'tests-started'))}, 'yes');\n`);
  fs.mkdirSync(path.join(f.consumer, 'tests'));
  fs.writeFileSync(path.join(f.consumer, 'tests/example.test.mjs'), '// test runner ordering sentinel\n');
  return { ...f, gate: stage => spawnSync('bash', [path.join(f.root, 'scripts/package-quality-gate.sh'), stage, f.consumer], {
    cwd: f.root, encoding: 'utf8', env: { ...process.env, PI_EXTENSIONS_TMPDIR: path.join(f.root, 'tmp') },
  }) };
}

test('Given missing integration prerequisites, When test/pre-push/ci run, Then admission blocks before the test runner; after explicit preparation it runs', t => {
  const f = gateFixture(t);
  for (const stage of ['test', 'pre-push', 'ci']) {
    const result = f.gate(stage);
    assert.equal(result.status, 1, result.stderr);
    assert.match(result.stderr, /test-source-dependencies/);
    assert.equal(fs.existsSync(path.join(f.root, 'tests-started')), false);
  }
  f.install();
  const green = f.gate('test');
  assert.equal(green.status, 0, green.stderr);
  assert.equal(fs.readFileSync(path.join(f.root, 'tests-started'), 'utf8'), 'yes');
});

test('Given the real little-helpers producer and broker fixtures, When metadata is read, Then both test-only owners are declared without changing npm release edges', () => {
  const policy = JSON.parse(fs.readFileSync(path.join(ROOT, 'packages/pi-little-helpers/policy/test-source-dependencies.json')));
  assert.deepEqual(policy.packages.map(entry => entry.path).sort(), [
    'packages/pi-autonomous-session-control', 'packages/pi-peer-messaging',
  ]);
  const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'packages/pi-little-helpers/package.json')));
  assert.equal(manifest.dependencies?.['@tryinget/pi-autonomous-session-control'], undefined);
  assert.equal(manifest.devDependencies?.['@tryinget/pi-autonomous-session-control'], undefined);
});
