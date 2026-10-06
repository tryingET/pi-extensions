// summary: Feature: a push reuses a recorded pass only for the exact same tree and inputs (AK6739).
// read_when:
//   - "Changing scripts/prepush-verified-tree.mjs or the pre-push branch of scripts/quality-gate.sh."
// Each scenario drives the real quality-gate.sh and recorder in a throwaway git repo whose full
// check and install admission are stubs that count their runs; records live in a private
// XDG_STATE_HOME under the test's temporary directory, never the operator's.
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { computeKey, gateInputs } from './prepush-verified-tree.mjs';

const ROOT = path.resolve(import.meta.dirname, '..');
const STUB_FULL = '#!/bin/sh\necho full >> "$COUNT_FILE"\nexit "${FULL_EXIT:-0}"\n';
const STUB_INSTALLS = 'import fs from "node:fs";\nfs.appendFileSync(process.env.COUNT_FILE, "installs\\n");\nprocess.exit(Number(process.env.INSTALLS_EXIT || 0));\n';

function write(root, rel, text, mode = 0o644) {
  const file = path.join(root, rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text, { mode });
}
function git(root, ...args) { return execFileSync('git', ['-C', root, ...args], { encoding: 'utf8' }); }

function fixture(t) {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'prepush-tree-'));
  t.after(() => fs.rmSync(base, { recursive: true, force: true }));
  const repo = path.join(base, 'repo');
  fs.mkdirSync(repo);
  git(repo, 'init', '-q');
  git(repo, 'config', 'user.email', 'fixture@example.test');
  git(repo, 'config', 'user.name', 'fixture');
  for (const rel of ['scripts/quality-gate.sh', 'scripts/prepush-verified-tree.mjs']) {
    write(repo, rel, fs.readFileSync(path.join(ROOT, rel), 'utf8'), 0o755);
  }
  write(repo, 'scripts/select-gate-node.sh', ': # fixture: keep the ambient node\n');
  write(repo, 'scripts/ci/full.sh', STUB_FULL, 0o755);
  write(repo, 'scripts/ci/smoke.sh', '#!/bin/sh\n', 0o755);
  write(repo, 'scripts/ci/packages.sh', '#!/bin/sh\n', 0o755);
  write(repo, 'scripts/validate-package-installs.mjs', STUB_INSTALLS);
  write(repo, 'scripts/validate-local-package-links.mjs', STUB_INSTALLS);
  write(repo, 'policy/ci-toolchain-lock.json', '{"nodeVersion":"fixture"}\n');
  write(repo, '.githooks/pre-push', '#!/bin/sh\n', 0o755);
  write(repo, 'README.md', 'fixture\n');
  git(repo, 'add', '-A');
  git(repo, 'commit', '-qm', 'fixture');
  const count = path.join(base, 'count');
  const state = path.join(base, 'state');
  const env = { ...process.env, COUNT_FILE: count, XDG_STATE_HOME: state, TMPDIR: path.join(base, 'tmp') };
  delete env.PI_EXT_FULL_PREPUSH;
  for (const name of Object.keys(env)) if (/^PI_(SKIP_|FILE_BUDGET|HOST_COMPAT|GENERATION_)/.test(name)) delete env[name];
  return { repo, count, state, env };
}

function push(fx, extra = {}) {
  const run = spawnSync('bash', ['scripts/quality-gate.sh', 'pre-push'], {
    cwd: fx.repo, env: { ...fx.env, ...extra }, encoding: 'utf8',
  });
  return { status: run.status, out: `${run.stdout}${run.stderr}` };
}
const runs = (fx, kind) => (fs.existsSync(fx.count) ? fs.readFileSync(fx.count, 'utf8') : '')
  .split('\n').filter((line) => line === kind).length;
function records(fx) {
  const dir = path.join(fx.state, 'pi-extensions', 'verified-trees');
  return fs.existsSync(dir) ? fs.readdirSync(dir).filter((name) => name.endsWith('.json')).map((name) => path.join(dir, name)) : [];
}

test('Scenario: a clean tree that already passed is not checked again', (t) => {
  // Given a clean tree whose full check passed
  const fx = fixture(t);
  assert.equal(push(fx).status, 0);
  assert.equal(runs(fx, 'full'), 1);
  const [record] = records(fx);
  assert.ok(record, 'a pass is recorded');
  assert.equal(fs.statSync(record).mode & 0o777, 0o600);
  // When the same tree is pushed again
  const second = push(fx);
  // Then the full check is skipped, the record is named, and install admission still ran
  assert.equal(second.status, 0);
  assert.equal(runs(fx, 'full'), 1);
  assert.match(second.out, /reusing verification .*\.json/);
  assert.ok(runs(fx, 'installs') >= 2, 'install admission runs on reuse');
});

test('Scenario: a different tree runs the full check', (t) => {
  const fx = fixture(t);
  push(fx);
  write(fx.repo, 'README.md', 'changed\n');
  git(fx.repo, 'commit', '-qam', 'change');
  push(fx);
  assert.equal(runs(fx, 'full'), 2);
});

test('Scenario: a new untracked file runs the full check', (t) => {
  const fx = fixture(t);
  push(fx);
  write(fx.repo, 'packages/new/index.test.mjs', 'test\n');
  push(fx);
  assert.equal(runs(fx, 'full'), 2);
});

test('Scenario: a dirty tracked tree runs the full check and records nothing', (t) => {
  const fx = fixture(t);
  write(fx.repo, 'README.md', 'uncommitted\n');
  const result = push(fx);
  assert.equal(result.status, 0);
  assert.equal(runs(fx, 'full'), 1);
  assert.deepEqual(records(fx), []);
  assert.match(result.out, /tracked changes/);
});

test('Scenario: a failing full check is never recorded', (t) => {
  const fx = fixture(t);
  assert.notEqual(push(fx, { FULL_EXIT: '3' }).status, 0);
  assert.deepEqual(records(fx), []);
  push(fx);
  assert.equal(runs(fx, 'full'), 2, 'the next push runs the full check again');
});

test('Scenario: PI_EXT_FULL_PREPUSH=1 forces the full check', (t) => {
  const fx = fixture(t);
  push(fx);
  push(fx, { PI_EXT_FULL_PREPUSH: '1' });
  assert.equal(runs(fx, 'full'), 2);
});

test('Scenario: failing install admission falls back to the full check', (t) => {
  const fx = fixture(t);
  push(fx);
  push(fx, { INSTALLS_EXIT: '1' });
  assert.equal(runs(fx, 'full'), 2);
});

for (const [name, spoil] of [
  ['unreadable JSON', (file) => fs.writeFileSync(file, '{not json')],
  ['a tampered input', (file) => {
    const record = JSON.parse(fs.readFileSync(file, 'utf8'));
    record.inputs.node = 'v0.0.0';
    fs.writeFileSync(file, JSON.stringify(record));
  }],
  ['a failed result', (file) => {
    const record = JSON.parse(fs.readFileSync(file, 'utf8'));
    record.result = 'fail';
    fs.writeFileSync(file, JSON.stringify(record));
  }],
  ['group-readable permissions', (file) => fs.chmodSync(file, 0o640)],
  ['a symlink', (file) => {
    const target = `${file}.real`;
    fs.renameSync(file, target);
    fs.symlinkSync(target, file);
  }],
]) {
  test(`Scenario: a record with ${name} falls back to the full check`, (t) => {
    const fx = fixture(t);
    push(fx);
    spoil(records(fx)[0]);
    const result = push(fx);
    assert.equal(result.status, 0);
    assert.equal(runs(fx, 'full'), 2);
    assert.doesNotMatch(result.out, /reusing verification/);
  });
}

test('Scenario: node, npm, gate scripts and behavior env each change the key', (t) => {
  const fx = fixture(t);
  const inputs = gateInputs(fx.repo, fx.env);
  assert.ok(inputs.clean);
  const base = computeKey(inputs.key);
  for (const change of [
    { node: 'v0.0.1' },
    { npm: '0.0.1' },
    { gate: { ...inputs.key.gate, 'scripts/ci/full.sh': 'f'.repeat(64) } },
    { env: { ...inputs.key.env, PI_SKIP_PACKAGES: '1' } },
    { tree: '0'.repeat(40) },
    { untracked: 'e'.repeat(64) },
  ]) {
    assert.notEqual(computeKey({ ...inputs.key, ...change }), base, JSON.stringify(Object.keys(change)));
  }
  assert.equal(computeKey({ ...inputs.key }), base, 'the key is deterministic');
});
