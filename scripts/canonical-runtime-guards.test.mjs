// summary: Real-Git coverage for the canonical checkout's runtime guards: the pre-commit install guard and land-canonical.sh (AK6069).
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

const ROOT = path.resolve(import.meta.dirname, '..');
const SOURCES = ['scripts/commit-install-guard.mjs', 'scripts/land-canonical.sh', 'scripts/validate-package-installs.mjs',
  'scripts/tracked-files.mjs', 'scripts/package-install-health.mjs', 'scripts/link-host-packages.mjs'];

// npm ci --prefix <dir>: install exactly what the lock names, as npm would record it
const FAKE_NPM = `#!/usr/bin/env node
const fs = require('node:fs'), path = require('node:path');
const args = process.argv.slice(2);
fs.appendFileSync(process.env.FAKE_NPM_LOG, args.join(' ') + '\\n');
const dir = args[args.indexOf('--prefix') + 1];
const lock = JSON.parse(fs.readFileSync(path.join(dir, 'package-lock.json'), 'utf8'));
fs.rmSync(path.join(dir, 'node_modules'), { recursive: true, force: true });
const hidden = { lockfileVersion: 3, packages: {} };
for (const [key, entry] of Object.entries(lock.packages)) {
  if (!key.startsWith('node_modules/')) continue;
  fs.mkdirSync(path.join(dir, key), { recursive: true });
  fs.writeFileSync(path.join(dir, key, 'package.json'), JSON.stringify({ name: key.slice(13), version: entry.version }));
  hidden.packages[key] = entry;
}
fs.writeFileSync(path.join(dir, 'node_modules/.package-lock.json'), JSON.stringify(hidden));
`;

// the Pi smoke: fails like a broken extension whenever the tree carries BROKEN
const FAKE_SMOKE = `#!/usr/bin/env bash
if [[ -f BROKEN ]]; then echo 'Error: Failed to load extension "x": Cannot find module'; exit 1; fi
echo 'provider model'
`;

function write(root, name, text, mode) {
  const file = path.join(root, name);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text, mode ? { mode } : undefined);
}
const json = (root, name, value) => write(root, name, JSON.stringify(value));

function fixture(t) {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'canonical-runtime-'));
  t.after(() => fs.rmSync(base, { recursive: true, force: true }));
  const root = path.join(base, 'repo'), bin = path.join(base, 'bin');
  fs.mkdirSync(root);
  write(bin, 'npm', FAKE_NPM, 0o755);
  write(bin, 'smoke', FAKE_SMOKE, 0o755);
  const clean = { ...process.env };
  for (const key of Object.keys(clean)) if (key.startsWith('GIT_')) delete clean[key];
  const env = { ...clean, PATH: `${bin}:${process.env.PATH}`, HOME: path.join(base, 'home'),
    GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1',
    GIT_AUTHOR_NAME: 'Fixture', GIT_AUTHOR_EMAIL: 'f@example.test', GIT_COMMITTER_NAME: 'Fixture',
    GIT_COMMITTER_EMAIL: 'f@example.test', FAKE_NPM_LOG: path.join(base, 'npm.log'),
    PI_SMOKE_CMD: path.join(bin, 'smoke'), LAND_NO_FETCH: '1', PI_HOST_BIN: path.join(base, 'no-pi') };
  const run = (cwd, command, args, extra = {}) =>
    spawnSync(command, args, { cwd, env: { ...env, ...extra }, encoding: 'utf8' });
  const git = (cwd, ...args) => {
    const result = run(cwd, 'git', args);
    assert.equal(result.status, 0, `git ${args.join(' ')}: ${result.stderr}`);
    return result.stdout.trim();
  };
  git(root, 'init', '-q', '-b', 'main');
  write(root, '.gitignore', 'node_modules/\n');
  json(root, 'package.json', { name: 'fixture', type: 'module' });
  for (const source of SOURCES) {
    write(root, source, fs.readFileSync(path.join(ROOT, source)), fs.statSync(path.join(ROOT, source)).mode & 0o777);
  }
  write(root, '.githooks/pre-commit', '#!/usr/bin/env bash\nset -e\nnode scripts/commit-install-guard.mjs\n', 0o755);
  for (const pkg of ['packages/demo', 'packages/other']) setDep(root, pkg, '1.0.0');
  git(root, 'add', '.');
  git(root, 'commit', '-qm', 'baseline');
  for (const pkg of ['packages/demo', 'packages/other']) install(root, pkg);
  git(root, 'config', 'core.hooksPath', '.githooks');
  const npmCalls = () => (fs.existsSync(env.FAKE_NPM_LOG) ? fs.readFileSync(env.FAKE_NPM_LOG, 'utf8').trim().split('\n') : []);
  return { base, root, run, git, npmCalls };
}

function setDep(root, pkg, version) {
  json(root, `${pkg}/package.json`, { name: path.basename(pkg), dependencies: { dep: '*' } });
  json(root, `${pkg}/package-lock.json`, { lockfileVersion: 3, packages: {
    '': { name: path.basename(pkg), dependencies: { dep: '*' } },
    'node_modules/dep': { version, resolved: `https://registry.example/dep-${version}.tgz`, integrity: `sha512-${version}` },
  } });
}
function install(root, pkg) {
  const lock = JSON.parse(fs.readFileSync(path.join(root, pkg, 'package-lock.json'), 'utf8'));
  const entry = lock.packages['node_modules/dep'];
  json(root, `${pkg}/node_modules/dep/package.json`, { name: 'dep', version: entry.version });
  json(root, `${pkg}/node_modules/.package-lock.json`, { lockfileVersion: 3, packages: { 'node_modules/dep': entry } });
}

test('a commit that bumps a dependency this checkout has not installed is refused, and passes once installed', t => {
  const { root, run, git } = fixture(t);
  setDep(root, 'packages/demo', '2.0.0');
  git(root, 'add', 'packages/demo');
  const refused = run(root, 'git', ['commit', '-qm', 'bump demo']);
  assert.notEqual(refused.status, 0);
  assert.match(refused.stderr, /live Pi runtime/);
  assert.match(refused.stderr, /packages\/demo: node_modules\/dep: installed 1\.0\.0; expected 2\.0\.0/);
  assert.match(refused.stderr, /npm ci --prefix 'packages\/demo'/);

  install(root, 'packages/demo');
  const accepted = run(root, 'git', ['commit', '-qm', 'bump demo']);
  assert.equal(accepted.status, 0, accepted.stderr);
});

test('drift in a package the commit does not touch does not block it', t => {
  const { root, run, git } = fixture(t);
  // other's installs are stale, but this commit touches only demo's manifest and demo is consistent
  json(root, 'packages/other/node_modules/dep/package.json', { name: 'dep', version: '0.9.0' });
  write(root, 'packages/demo/README.md', 'docs\n');
  json(root, 'packages/demo/package.json', { name: 'demo', description: 'x', dependencies: { dep: '*' } });
  git(root, 'add', 'packages/demo');
  const result = run(root, 'git', ['commit', '-qm', 'describe demo']);
  assert.equal(result.status, 0, result.stderr);
});

test('a linked worktree is not the runtime and is not guarded', t => {
  const { base, root, run, git } = fixture(t);
  const wt = path.join(base, 'wt');
  git(root, 'worktree', 'add', '-q', '-b', 'dev', wt);
  setDep(wt, 'packages/demo', '2.0.0');
  git(wt, 'add', 'packages/demo');
  const result = run(wt, 'git', ['commit', '-qm', 'bump in a worktree']);
  assert.equal(result.status, 0, result.stderr);
});

test('landing installs the packages whose manifests changed and smoke-tests Pi', t => {
  const { base, root, run, git, npmCalls } = fixture(t);
  const wt = path.join(base, 'wt');
  git(root, 'worktree', 'add', '-q', '-b', 'dev', wt);
  setDep(wt, 'packages/demo', '2.0.0');
  git(wt, 'add', '.');
  git(wt, 'commit', '-qm', 'bump demo');
  // another session's uncommitted, unrelated edit in the canonical checkout
  write(root, 'NOTES.md', 'wip\n');
  const landed = run(root, 'bash', ['scripts/land-canonical.sh', 'dev']);
  assert.equal(landed.status, 0, landed.stderr);
  const receipt = JSON.parse(landed.stdout.trim().split('\n').at(-1));
  assert.equal(receipt.outcome, 'landed');
  assert.equal(receipt.head, git(root, 'rev-parse', 'dev'));
  assert.deepEqual(npmCalls(), ['ci --prefix packages/demo --no-audit --no-fund']);
  assert.equal(fs.readFileSync(path.join(root, 'NOTES.md'), 'utf8'), 'wip\n');
});

test('a landing whose Pi smoke fails moves back and reinstalls the previous versions', t => {
  const { base, root, run, git, npmCalls } = fixture(t);
  const previous = git(root, 'rev-parse', 'HEAD');
  const wt = path.join(base, 'wt');
  git(root, 'worktree', 'add', '-q', '-b', 'dev', wt);
  setDep(wt, 'packages/demo', '2.0.0');
  write(wt, 'BROKEN', 'the TypeScript 7 import\n');
  git(wt, 'add', '.');
  git(wt, 'commit', '-qm', 'bump demo, break pi');
  write(root, 'NOTES.md', 'wip\n');
  const result = run(root, 'bash', ['scripts/land-canonical.sh', 'dev']);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Pi smoke failed .*Failed to load extension/);
  const receipt = JSON.parse(result.stdout.trim().split('\n').at(-1));
  assert.equal(receipt.outcome, 'rolled_back');
  assert.equal(git(root, 'rev-parse', 'HEAD'), previous);
  assert.equal(fs.existsSync(path.join(root, 'BROKEN')), false);
  assert.equal(JSON.parse(fs.readFileSync(path.join(root, 'packages/demo/node_modules/dep/package.json'), 'utf8')).version, '1.0.0');
  assert.equal(npmCalls().length, 2, 'installed the target, then the previous versions');
  assert.equal(fs.readFileSync(path.join(root, 'NOTES.md'), 'utf8'), 'wip\n');
});

test('a non-fast-forward needs --reset, and --reset refuses to discard modified tracked files', t => {
  const { root, run, git } = fixture(t);
  const head = git(root, 'rev-parse', 'HEAD');
  git(root, 'checkout', '-q', '-b', 'side', 'HEAD');
  write(root, 'side.txt', 'side\n');
  git(root, 'add', 'side.txt');
  git(root, 'commit', '-qm', 'side');
  git(root, 'checkout', '-q', 'main');
  write(root, 'main.txt', 'main\n');
  git(root, 'add', 'main.txt');
  git(root, 'commit', '-qm', 'main moves on');
  const mainHead = git(root, 'rev-parse', 'HEAD');

  const ff = run(root, 'bash', ['scripts/land-canonical.sh', 'side']);
  assert.equal(ff.status, 2);
  assert.match(ff.stderr, /not a fast-forward/);

  write(root, 'main.txt', 'edited by another session\n');
  const reset = run(root, 'bash', ['scripts/land-canonical.sh', '--reset', 'side']);
  assert.equal(reset.status, 2);
  assert.match(reset.stderr, /would discard another session's work/);
  assert.equal(git(root, 'rev-parse', 'HEAD'), mainHead);
  assert.notEqual(head, mainHead);
});

// A Pi installation as npm lays out a global one: the host packages under the coding agent.
function fakeHost(base) {
  const agent = path.join(base, 'host/lib/node_modules/@earendil-works/pi-coding-agent');
  json(base, path.relative(base, path.join(agent, 'package.json')), { name: '@earendil-works/pi-coding-agent', version: '9.0.0' });
  write(base, path.relative(base, path.join(agent, 'dist/cli.js')), '#!/usr/bin/env node\n', 0o755);
  const roots = { '@earendil-works/pi-coding-agent': agent };
  for (const name of ['@earendil-works/pi-ai', '@earendil-works/pi-agent-core', '@earendil-works/pi-tui', 'typebox']) {
    roots[name] = path.join(agent, 'node_modules', name);
    json(base, path.relative(base, path.join(roots[name], 'package.json')), { name, version: '9.0.0' });
  }
  return { bin: path.join(agent, 'dist/cli.js'), roots };
}

test('landing links installed host packages to the Pi on PATH, and the health check accepts the links', t => {
  const { base, root, run, git } = fixture(t);
  const host = fakeHost(base);
  const wt = path.join(base, 'wt');
  git(root, 'worktree', 'add', '-q', '-b', 'dev', wt);
  json(wt, 'packages/demo/package.json', { name: 'demo', dependencies: { dep: '*' }, devDependencies: { '@earendil-works/pi-ai': '1.0.0' } });
  json(wt, 'packages/demo/package-lock.json', { lockfileVersion: 3, packages: {
    '': { name: 'demo', dependencies: { dep: '*' }, devDependencies: { '@earendil-works/pi-ai': '1.0.0' } },
    'node_modules/dep': { version: '1.0.0', resolved: 'https://registry.example/dep-1.0.0.tgz', integrity: 'sha512-1.0.0' },
    'node_modules/@earendil-works/pi-ai': { version: '1.0.0', resolved: 'https://registry.example/pi-ai-1.0.0.tgz', integrity: 'sha512-ai', dev: true },
    'node_modules/@earendil-works/pi-ai/node_modules/nested': { version: '2.0.0', resolved: 'https://registry.example/nested-2.0.0.tgz', integrity: 'sha512-n', dev: true },
  } });
  git(wt, 'add', '.');
  git(wt, 'commit', '-qm', 'demo tests against the host');
  const landed = run(root, 'bash', ['scripts/land-canonical.sh', 'dev'], { PI_HOST_BIN: host.bin });
  assert.equal(landed.status, 0, landed.stderr);
  assert.equal(JSON.parse(landed.stdout.trim().split('\n').at(-1)).outcome, 'landed');
  const installed = path.join(root, 'packages/demo/node_modules/@earendil-works/pi-ai');
  assert.ok(fs.lstatSync(installed).isSymbolicLink(), 'the physical copy was replaced');
  assert.equal(fs.realpathSync(installed), fs.realpathSync(host.roots['@earendil-works/pi-ai']));
  assert.match(landed.stderr, /packages\/demo: @earendil-works\/pi-ai 1\.0\.0 -> host 9\.0\.0/);
  // Not a host package: still installed and checked against the lock.
  assert.equal(fs.lstatSync(path.join(root, 'packages/demo/node_modules/dep')).isSymbolicLink(), false);
  const health = run(root, 'node', ['scripts/package-install-health.mjs']);
  assert.equal(health.status, 0, health.stdout + health.stderr);
});

test('without a Pi executable the landing leaves host packages as installed', t => {
  const { base, root, run, git } = fixture(t);
  const wt = path.join(base, 'wt');
  git(root, 'worktree', 'add', '-q', '-b', 'dev', wt);
  setDep(wt, 'packages/demo', '2.0.0');
  git(wt, 'add', '.');
  git(wt, 'commit', '-qm', 'bump demo');
  const landed = run(root, 'bash', ['scripts/land-canonical.sh', 'dev']);
  assert.equal(landed.status, 0, landed.stderr);
  assert.match(landed.stderr, /no Pi executable found; host packages stay as installed/);
});
