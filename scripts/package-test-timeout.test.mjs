// summary: Package test files with leaked handles fail within the declared timeout, on JS and TS paths.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const ROOT = path.resolve(import.meta.dirname, '..');
async function runGate(t, { suffix = 'mjs', timeout = '1000' } = {}) {
  const parent = path.join(ROOT, '.tmp-test');
  fs.mkdirSync(parent, { recursive: true });
  const root = fs.mkdtempSync(path.join(parent, 'ak5789-timeout-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ name: 'timeout-fixture', private: true, type: 'module' }));
  fs.mkdirSync(path.join(root, 'tests'));
  fs.writeFileSync(path.join(root, `tests/leak.test.${suffix}`), "import test from 'node:test'; test('passes but leaks a handle', () => { setInterval(() => {}, 1000); });\n");
  if (suffix === 'ts') {
    // Exercise the --import branch without adding root package dependencies.
    // Node's native TS stripping is sufficient for this synthetically JS-only file.
    fs.mkdirSync(path.join(root, 'node_modules/.bin'), { recursive: true });
    fs.mkdirSync(path.join(root, 'node_modules/tsx'));
    fs.writeFileSync(path.join(root, 'node_modules/.bin/tsx'), '#!/bin/sh\nexit 0\n', { mode: 0o755 });
    fs.writeFileSync(path.join(root, 'node_modules/tsx/package.json'), JSON.stringify({ name: 'tsx', type: 'module', exports: './index.mjs' }));
    fs.writeFileSync(path.join(root, 'node_modules/tsx/index.mjs'), 'export {};\n');
  }
  const started = Date.now();
  const env = { ...process.env, NODE_TEST_TIMEOUT_MS: timeout, PI_EXTENSIONS_TMPDIR: path.join(root, 'tmp') };
  delete env.NODE_TEST_CONTEXT; // Start a real nested test coordinator, not an inherited worker.
  const child = spawn('bash', [path.join(ROOT, 'scripts/package-quality-gate.sh'), 'test', root], {
    cwd: ROOT, detached: true,
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '', emergency = false;
  child.stdout.on('data', chunk => { output += chunk; });
  child.stderr.on('data', chunk => { output += chunk; });
  // Test-only watchdog owns this synthetic process group; never kill machine-wide matches.
  const watchdog = setTimeout(() => { emergency = true; process.kill(-child.pid, 'SIGKILL'); }, 5000);
  const code = await new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('close', resolve);
  }).finally(() => clearTimeout(watchdog));
  return { code, output, emergency, elapsed: Date.now() - started };
}
for (const suffix of ['mjs', 'ts']) {
  test(`leaking ${suffix} file fails naturally within the configured file deadline`, async t => {
    const result = await runGate(t, { suffix });
    assert.equal(result.emergency, false, `runner hung beyond file timeout:\n${result.output}`);
    assert.notEqual(result.code, 0);
    assert.match(result.output, /^\s*ok 1 - passes but leaks a handle$/m);
    assert.match(result.output, /timed out|testTimeoutFailure/);
    assert.ok(result.elapsed < 5000);
  });
}
for (const timeout of ['0', '-1', 'Infinity', 'junk']) {
  test(`invalid timeout ${timeout} is rejected instead of disabling the deadline`, async t => {
    const result = await runGate(t, { timeout });
    assert.equal(result.emergency, false);
    assert.notEqual(result.code, 0);
    assert.match(result.output, /NODE_TEST_TIMEOUT_MS.*positive/);
  });
}
