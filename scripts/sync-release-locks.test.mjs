// summary: Release lock sync regenerates exactly the drifted packages and fails when npm leaves drift.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { NPM_LOCK_ONLY, syncReleaseLocks } from './sync-release-locks.mjs';
import { authoredLockIssues, registryLockIdentityIssues, validateAuthoredLocks } from './validate-package-installs.mjs';

function writeJson(root, name, value) {
  const file = path.join(root, name);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
}

function releasedRepo(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'release-locks-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const manifest = (name, peer) => ({ name, version: '1.0.1', peerDependencies: { peer: peer } });
  const lock = (name, peer) => ({
    name,
    version: '1.0.1',
    lockfileVersion: 3,
    requires: true,
    packages: { '': { name, version: '1.0.1', peerDependencies: { peer: peer } } },
  });
  // As a release PR leaves it: the peer range moved in package.json, not in the lock root.
  writeJson(root, 'packages/bumped/package.json', manifest('bumped', '0.4.1'));
  writeJson(root, 'packages/bumped/package-lock.json', lock('bumped', '0.4.0'));
  writeJson(root, 'packages/steady/package.json', manifest('steady', '2.0.0'));
  writeJson(root, 'packages/steady/package-lock.json', lock('steady', '2.0.0'));
  execFileSync('git', ['init', '-q'], { cwd: root });
  execFileSync('git', ['add', '.'], { cwd: root });
  return root;
}

/** Stands in for `npm install --package-lock-only`: rewrites the lock root from package.json. */
function npmRegenerates(args, cwd) {
  assert.deepEqual(args, NPM_LOCK_ONLY);
  const manifest = JSON.parse(fs.readFileSync(path.join(cwd, 'package.json'), 'utf8'));
  const lockPath = path.join(cwd, 'package-lock.json');
  const lock = JSON.parse(fs.readFileSync(lockPath, 'utf8'));
  lock.packages[''].peerDependencies = manifest.peerDependencies;
  fs.writeFileSync(lockPath, `${JSON.stringify(lock, null, 2)}\n`);
}

const ASC = '@tryinget/pi-autonomous-session-control';
const ASC_KEY = `node_modules/${ASC}`;
function falseIdentity(root) {
  const cwd = path.join(root, 'packages/bumped');
  npmRegenerates(NPM_LOCK_ONLY, cwd);
  const file = path.join(cwd, 'package-lock.json');
  const lock = JSON.parse(fs.readFileSync(file, 'utf8'));
  const manifestPath = path.join(cwd, 'package.json');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  manifest.dependencies = { [ASC]: '^0.8.0' };
  lock.packages[''].dependencies = manifest.dependencies;
  fs.writeFileSync(manifestPath, JSON.stringify(manifest));
  lock.packages[ASC_KEY] = {
    version: '0.8.0',
    resolved: `https://registry.npmjs.org/${ASC}/-/pi-autonomous-session-control-0.7.0.tgz`,
    integrity: 'sha512-b2xk',
  };
  writeJson(root, 'packages/bumped/package-lock.json', lock);
  return { cwd, file, original: fs.readFileSync(file) };
}

test('false installed-entry version is detected even when lock root mirrors manifest', t => {
  const root = releasedRepo(t);
  const { cwd, file } = falseIdentity(root);
  const manifest = JSON.parse(fs.readFileSync(path.join(cwd, 'package.json'), 'utf8'));
  assert.match(authoredLockIssues(manifest, JSON.parse(fs.readFileSync(file, 'utf8'))).join('\n'), /0.8.0 disagrees.*0.7.0/);
});

test('repair evicts false artifact metadata and delegates replacement bytes identity to npm', t => {
  const root = releasedRepo(t);
  const { file } = falseIdentity(root);
  const result = syncReleaseLocks(root, { run(args, cwd) {
    assert.deepEqual(args, NPM_LOCK_ONLY);
    const lock = JSON.parse(fs.readFileSync(file, 'utf8'));
    assert.equal(lock.packages[ASC_KEY], undefined);
    lock.packages[ASC_KEY] = {
      version: '0.8.0',
      resolved: `https://registry.npmjs.org/${ASC}/-/pi-autonomous-session-control-0.8.0.tgz`,
      integrity: 'sha512-bmV3',
    };
    fs.writeFileSync(file, JSON.stringify(lock));
  } });
  assert.equal(result.ok, true);
  assert.equal(JSON.parse(fs.readFileSync(file)).packages[ASC_KEY].integrity, 'sha512-bmV3');
});

test('unpublished replacement or missing replacement restores exact original locks', t => {
  for (const run of [() => { throw new Error('unpublished'); }, () => {}]) {
    const root = releasedRepo(t);
    const { file, original } = falseIdentity(root);
    assert.throws(() => syncReleaseLocks(root, { run }), /unpublished|did not re-resolve/);
    assert.deepEqual(fs.readFileSync(file), original);
  }
});

test('a failed repair restores all earlier package repairs, not just the failing package', t => {
  const root = releasedRepo(t);
  const { file, original } = falseIdentity(root);
  const steadyFile = path.join(root, 'packages/steady/package-lock.json');
  const steady = JSON.parse(fs.readFileSync(steadyFile, 'utf8'));
  steady.packages[''].peerDependencies.peer = 'wrong';
  fs.writeFileSync(steadyFile, JSON.stringify(steady));
  const steadyOriginal = fs.readFileSync(steadyFile);
  assert.throws(() => syncReleaseLocks(root, { run(args, cwd) {
    if (cwd.endsWith('/steady')) throw new Error('unpublished later package');
    const repaired = JSON.parse(fs.readFileSync(file, 'utf8'));
    repaired.packages[ASC_KEY] = {
      version: '0.8.0',
      resolved: `https://registry.npmjs.org/${ASC}/-/pi-autonomous-session-control-0.8.0.tgz`,
      integrity: 'sha512-bmV3',
    };
    fs.writeFileSync(file, JSON.stringify(repaired));
  } }), /unpublished later/);
  assert.deepEqual(fs.readFileSync(file), original);
  assert.deepEqual(fs.readFileSync(steadyFile), steadyOriginal);
});

test('URL identity check handles aliases, nested packages, prereleases, and non-registry sources', () => {
  for (const [key, entry] of [
    ['node_modules/alias', { version: '1.2.3', resolved: 'https://registry.npmjs.org/actual/-/actual-1.2.3.tgz' }],
    ['node_modules/outer/node_modules/@scope/pkg', { version: '1.0.0-rc.1', resolved: 'https://registry.npmjs.org/@scope/pkg/-/pkg-1.0.0-rc.1.tgz' }],
    ['node_modules/local', { link: true, resolved: '../local' }],
    ['node_modules/remote', { version: '1.0.0', resolved: 'https://example.org/custom.tgz' }],
  ]) assert.deepEqual(registryLockIdentityIssues({ packages: { [key]: entry } }), []);
});

test('Given a release-bumped peer range, When locks sync, Then only that package is regenerated', (t) => {
  const root = releasedRepo(t);
  assert.deepEqual(
    validateAuthoredLocks(root).issues.map((issue) => issue.package),
    ['packages/bumped'],
  );
  const regenerated = [];
  const result = syncReleaseLocks(root, {
    run: (args, cwd) => {
      regenerated.push(path.relative(fs.realpathSync(root), cwd));
      npmRegenerates(args, cwd);
    },
  });
  assert.deepEqual(regenerated, ['packages/bumped']);
  assert.deepEqual(result, { synced: ['packages/bumped'], ok: true, remaining: [] });
});

test('Given npm leaves the drift in place, When locks sync, Then the result reports it', (t) => {
  const root = releasedRepo(t);
  const result = syncReleaseLocks(root, { run: () => {} });
  assert.equal(result.ok, false);
  assert.deepEqual(
    result.remaining.map((issue) => issue.package),
    ['packages/bumped'],
  );
});

test('Given agreeing locks, When locks sync, Then npm is never run', (t) => {
  const root = releasedRepo(t);
  npmRegenerates(NPM_LOCK_ONLY, path.join(root, 'packages/bumped'));
  const result = syncReleaseLocks(root, {
    run: () => assert.fail('npm must not run when nothing drifted'),
  });
  assert.deepEqual(result, { synced: [], ok: true, remaining: [] });
});
