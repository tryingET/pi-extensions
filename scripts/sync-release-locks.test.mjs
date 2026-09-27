// summary: Release lock sync regenerates exactly the drifted packages and fails when npm leaves drift.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { NPM_LOCK_ONLY, syncReleaseLocks } from './sync-release-locks.mjs';
import { validateAuthoredLocks } from './validate-package-installs.mjs';

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
