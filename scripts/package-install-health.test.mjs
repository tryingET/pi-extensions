// summary: Real-Git regression coverage for warning-only install checks and doctor integration.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

const ROOT = path.resolve(import.meta.dirname, '..');
const POSTS = ['post-checkout', 'post-merge', 'post-rewrite'];
const SOURCES = ['scripts/install-hooks.sh', 'scripts/validate-package-installs.mjs',
  'scripts/tracked-files.mjs', 'scripts/agent-doctor.mjs', 'scripts/package-install-health.mjs',
  'scripts/package-install-hook.sh', ...POSTS.map(name => `.githooks/${name}`)];
function write(root, name, text, mode) {
  const file = path.join(root, name);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text, mode ? { mode } : undefined);
}
function json(root, name, value) { write(root, name, JSON.stringify(value)); }
function env(root) {
  const clean = { ...process.env };
  for (const key of Object.keys(clean)) if (key.startsWith('GIT_')) delete clean[key];
  return { ...clean, HOME: path.join(root, 'home'), GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1',
    GIT_AUTHOR_NAME: 'Fixture', GIT_AUTHOR_EMAIL: 'fixture@example.test',
    GIT_COMMITTER_NAME: 'Fixture', GIT_COMMITTER_EMAIL: 'fixture@example.test' };
}
function run(root, command, args, options = {}) {
  return spawnSync(command, args, { cwd: root, env: env(root), encoding: 'utf8', ...options });
}
function git(root, ...args) {
  const result = run(root, 'git', args);
  assert.equal(result.status, 0, `${args.join(' ')}: ${result.stderr}`);
  return result;
}
function bump(root, version = '2.0.0', pkg = 'packages/demo') {
  json(root, `${pkg}/package-lock.json`, { lockfileVersion: 3, packages: {
    '': { dependencies: { dep: '*' } }, 'node_modules/dep': { version },
  } });
}
function fixture(t, { chain = false, pkg = 'packages/demo' } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'install health $fixture-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.mkdirSync(path.join(root, 'home'));
  git(root, 'init', '-q', '-b', 'main');
  write(root, '.gitignore', 'node_modules/\nhome/\n');
  json(root, 'package.json', { name: 'fixture', type: 'module' });
  for (const source of SOURCES) {
    if (fs.existsSync(path.join(ROOT, source))) {
      write(root, source, fs.readFileSync(path.join(ROOT, source)), fs.statSync(path.join(ROOT, source)).mode & 0o777);
    }
  }
  for (const name of ['pre-commit', 'pre-push']) write(root, `.githooks/${name}`, '#!/bin/sh\nexit 0\n', 0o755);
  json(root, `${pkg}/package.json`, { name: 'demo', dependencies: { dep: '*' } });
  bump(root, '1.0.0', pkg);
  json(root, `${pkg}/node_modules/dep/package.json`, { name: 'dep', version: '1.0.0' });
  json(root, `${pkg}/node_modules/.package-lock.json`, { lockfileVersion: 3, packages: {
    'node_modules/dep': { version: '1.0.0' },
  } });
  git(root, 'add', '.');
  git(root, 'commit', '-qm', 'baseline');
  if (chain) {
    write(root, '.git/ubs-chain-hooks/pre-commit', '#!/bin/sh\nprintf "ubs\\n" >> .git/ubs-proof\nexec .githooks/pre-commit "$@"\n', 0o755);
    fs.symlinkSync(path.join(root, '.githooks/pre-push'), path.join(root, '.git/ubs-chain-hooks/pre-push'));
    git(root, 'config', 'core.hooksPath', '.git/ubs-chain-hooks');
  }
  return root;
}
function install(root) {
  const result = run(root, 'bash', ['scripts/install-hooks.sh']);
  assert.equal(result.status, 0, result.stderr);
}
function warned(result, event) {
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stderr, /package-install-health.*WARNING/s);
  assert.match(result.stderr, new RegExp(event));
  assert.match(result.stderr, /packages\/demo.*installed 1\.0\.0; expected 2\.0\.0/s);
  assert.match(result.stderr, /npm ci/);
}
function changedBranch(root) {
  git(root, 'checkout', '-qb', 'changed');
  bump(root);
  git(root, 'add', 'packages/demo/package-lock.json');
  git(root, 'commit', '-qm', 'new lock');
  git(root, 'checkout', '-q', 'main');
}

test('real fast-forward merge warns without installing or failing Git', t => {
  const root = fixture(t);
  changedBranch(root);
  install(root);
  const before = fs.readFileSync(path.join(root, 'packages/demo/node_modules/dep/package.json'));
  warned(git(root, 'merge', '--ff-only', 'changed'), 'post-merge');
  assert.deepEqual(fs.readFileSync(path.join(root, 'packages/demo/node_modules/dep/package.json')), before);
});
test('real branch and file-only checkout warn; clean checkout is quiet', t => {
  const root = fixture(t);
  changedBranch(root);
  install(root);
  assert.doesNotMatch(git(root, 'checkout', '-q', 'main').stderr, /package-install-health/);
  warned(git(root, 'checkout', '-q', 'changed'), 'post-checkout');
  bump(root, '1.0.0');
  warned(git(root, 'checkout', 'HEAD', '--', 'packages/demo/package-lock.json'), 'post-checkout');
});
test('real amend and rebase fire post-rewrite without installing', t => {
  const root = fixture(t);
  install(root);
  bump(root);
  git(root, 'add', 'packages/demo/package-lock.json');
  warned(git(root, 'commit', '--amend', '--no-edit'), 'post-rewrite');
  git(root, 'checkout', '-qb', 'topic');
  write(root, 'topic.txt', 'topic'); git(root, 'add', 'topic.txt'); git(root, 'commit', '-qm', 'topic');
  git(root, 'checkout', '-q', 'main');
  write(root, 'main.txt', 'main'); git(root, 'add', 'main.txt'); git(root, 'commit', '-qm', 'main');
  git(root, 'checkout', '-q', 'topic');
  warned(git(root, 'rebase', 'main'), 'post-rewrite');
});
test('installer preserves the enabled UBS chain and is idempotent', t => {
  const root = fixture(t, { chain: true });
  const pre = fs.readFileSync(path.join(root, '.git/ubs-chain-hooks/pre-commit'));
  const push = fs.readlinkSync(path.join(root, '.git/ubs-chain-hooks/pre-push'));
  install(root); install(root);
  assert.equal(git(root, 'config', '--get', 'core.hooksPath').stdout.trim(), '.git/ubs-chain-hooks');
  assert.deepEqual(fs.readFileSync(path.join(root, '.git/ubs-chain-hooks/pre-commit')), pre);
  assert.equal(fs.readlinkSync(path.join(root, '.git/ubs-chain-hooks/pre-push')), push);
  changedBranch(root);
  warned(git(root, 'merge', '--ff-only', 'changed'), 'post-merge');
  assert.equal(fs.readFileSync(path.join(root, '.git/ubs-proof'), 'utf8'), 'ubs\n');
});
test('installer refuses unknown hook owners before any wiring changes', t => {
  // An explicit custom path is an owner boundary even before its hooks exist.
  const root = fixture(t);
  git(root, 'config', 'core.hooksPath', 'custom-hooks');
  const result = run(root, 'bash', ['scripts/install-hooks.sh']);
  assert.notEqual(result.status, 0);
  assert.equal(git(root, 'config', '--get', 'core.hooksPath').stdout.trim(), 'custom-hooks');
});
test('unset hooksPath cannot silently bypass active default hooks', t => {
  const root = fixture(t);
  write(root, '.git/hooks/post-checkout', '#!/bin/sh\necho OWNER_HOOK >&2\n', 0o755);
  const before = fs.readFileSync(path.join(root, '.git/hooks/post-checkout'));
  assert.notEqual(run(root, 'bash', ['scripts/install-hooks.sh']).status, 0);
  assert.equal(run(root, 'git', ['config', '--get', 'core.hooksPath']).status, 1);
  assert.deepEqual(fs.readFileSync(path.join(root, '.git/hooks/post-checkout')), before);
  assert.match(git(root, 'checkout', '-q', 'main').stderr, /OWNER_HOOK/);
});
test('installer does not overwrite existing chain post hooks or partially install others', t => {
  const root = fixture(t, { chain: true });
  write(root, '.git/ubs-chain-hooks/post-merge', '#!/bin/sh\necho custom\n', 0o755);
  const before = fs.readFileSync(path.join(root, '.git/ubs-chain-hooks/post-merge'));
  assert.notEqual(run(root, 'bash', ['scripts/install-hooks.sh']).status, 0);
  assert.deepEqual(fs.readFileSync(path.join(root, '.git/ubs-chain-hooks/post-merge')), before);
  assert.equal(fs.existsSync(path.join(root, '.git/ubs-chain-hooks/post-checkout')), false);
});
test('doctor exposes consistency separately, including with --no-drift', t => {
  const root = fixture(t);
  const doctor = () => run(root, process.execPath, ['scripts/agent-doctor.mjs', '--json', '--no-drift']);
  const clean = doctor();
  assert.equal(clean.status, 0, clean.stderr);
  assert.equal(JSON.parse(clean.stdout).info.installConsistency.ok, true);
  bump(root);
  const stale = doctor();
  assert.equal(stale.status, 1, stale.stderr);
  const report = JSON.parse(stale.stdout);
  assert.equal(report.info.drift, 'skipped');
  assert.equal(report.info.installConsistency.ok, false);
  assert.ok(report.info.installConsistency.issues.some(issue => issue.package === 'packages/demo'));
});
test('doctor reports checker failure rather than healthy status', t => {
  const root = fixture(t);
  fs.rmSync(path.join(root, '.git'), { recursive: true });
  const result = run(root, process.execPath, ['scripts/agent-doctor.mjs', '--json', '--no-drift']);
  assert.equal(result.status, 1, result.stderr);
  assert.equal(JSON.parse(result.stdout).info.installConsistency.ok, false);
});
test('linked worktree post hooks inspect that worktree, not canonical installs', t => {
  const root = fixture(t, { chain: true });
  install(root);
  const linked = path.join(root, 'linked');
  const result = git(root, '-c', 'core.hooksPath=.githooks', 'worktree', 'add', '--detach', linked, 'HEAD');
  assert.match(result.stderr, /package-install-health.*WARNING/s);
  assert.match(result.stderr, /packages\/demo/);
  assert.match(result.stderr, /missing|ENOENT/);
});
test('group package paths with shell metacharacters get a quoted manual repair', t => {
  const pkg = "packages/group/demo $cash's";
  const root = fixture(t, { pkg });
  install(root);
  bump(root, '2.0.0', pkg);
  const result = git(root, 'checkout', '-q', 'main');
  assert.match(result.stderr, /WARNING/);
  assert.ok(result.stderr.includes("npm ci --prefix 'packages/group/demo $cash'\\''s'"), result.stderr);
  assert.equal(fs.existsSync(path.join(root, 'cash')), false);
});

test('squash merge and removed lockfiles still report current-tree inconsistency', t => {
  const root = fixture(t);
  changedBranch(root); install(root);
  warned(git(root, 'merge', '--squash', 'changed'), 'post-merge');
  git(root, 'rm', '-f', 'packages/demo/package-lock.json');
  const result = git(root, 'checkout', '-q', 'main');
  assert.match(result.stderr, /requires a tracked package-lock/);
});
test('unavailable Node warns without failing the real Git operation', t => {
  const root = fixture(t); install(root);
  const bin = path.join(root, 'home/bin'); fs.mkdirSync(bin);
  for (const command of ['git', 'bash']) {
    const location = spawnSync('which', [command], { encoding: 'utf8' }).stdout.trim();
    fs.symlinkSync(location, path.join(bin, command));
  }
  const result = run(root, 'git', ['checkout', '-q', 'main'], { env: { ...env(root), PATH: bin } });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stderr, /Node unavailable/);
});
test('checker launch failures warn, and rewrite hook drains large stdin', t => {
  const root = fixture(t); install(root);
  fs.rmSync(path.join(root, 'scripts/package-install-health.mjs'));
  const result = run(root, 'bash', ['.githooks/post-rewrite', 'amend'], { input: 'a'.repeat(1024 * 1024) });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stderr, /checker could not finish/);
});
