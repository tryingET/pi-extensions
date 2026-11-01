// Builtin-only pin regressions. Explicit TMPDIR; no packages, installs or host lifecycle.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import test from 'node:test';
import { NODE22_DIALECT, assertSupportedNode, reconcileEvents } from './pi-host-compatibility-canary/selected-tests-protocol.mjs';
import * as closure from './pi-host-compatibility-canary/completion-fixture-closure.mjs';

const root = resolve(import.meta.dirname, '..');
// Injectable identity is for synthetic refusal tests only; the real entry uses process.version.
function withCalibrationRuntime(initialize, version = process.version) {
  assert.equal(version, 'v22.23.4', 'calibration requires exact Node v22.23.4');
  return initialize();
}
const { scratch, env, file } = withCalibrationRuntime(() => {
  assert.ok(process.env.TMPDIR, 'explicit owned TMPDIR required');
  const scratch = mkdtempSync(join(process.env.TMPDIR, 'node-pin-calibration-'));
  const home = join(scratch, 'home');
  mkdirSync(home);
  const env = { HOME: home, TMPDIR: scratch, PATH: '/usr/bin:/bin' };
  const file = join(scratch, 'selection.test.mjs');
  writeFileSync(file, "import test from 'node:test';\ntest('present', () => {});\n");
  return { scratch, env, file };
});
const adapter = join(root, 'scripts/pi-host-compatibility-canary/selected-tests.mjs');
const exec = args => {
  const start = performance.now();
  const result = spawnSync(process.execPath, args, { cwd: scratch, env, encoding: 'utf8',
    timeout: 10000, stdio: ['ignore', 'pipe', 'pipe', 'pipe'] });
  assert.ifError(result.error);
  assert.equal(result.signal, null);
  return { status: result.status, stdout: result.stdout, stderr: result.stderr,
    eventsWire: result.output[3], elapsedMs: performance.now() - start };
};
const raw = name => {
  const driver = join(scratch, `raw-${name}.mjs`);
  writeFileSync(driver, `import { run } from 'node:test';
import { writeSync } from 'node:fs';
for await (const event of run({ files: [${JSON.stringify(file)}], concurrency: 1,
  isolation: 'process', execArgv: [], testNamePatterns: [/^${name}$/] })) {
  writeSync(3, JSON.stringify(event) + '\\n');
}\n`);
  const result = exec([driver]);
  assert.equal(result.status, 0);
  return { ...result, events: result.eventsWire.trim().split('\n').map(JSON.parse) };
};
let calibrated;

test('Given exact target identity, when calibration runs, then other versions stop before fixtures and wrapper success is not body proof', t => {
  for (const version of ['v22.23.3', 'v22.23.5', 'v26.8.1', 'v99.0.0', null]) {
    let initialized = false;
    assert.throws(() => withCalibrationRuntime(() => { initialized = true; }, version),
      /calibration requires exact Node v22\.23\.4/);
    assert.equal(initialized, false, 'wrong identity must not initialize fixtures');
  }
  assert.equal(withCalibrationRuntime(() => 'initialized', 'v22.23.4'), 'initialized');
  const positive = raw('present');
  const zero = raw('absent');
  const mainZero = exec(['--test', '--test-name-pattern=^absent$', file]);
  const summary = result => result.events.find(event => event.type === 'test:summary' && event.data.file === file).data;
  assert.equal(summary(positive).counts.tests, 1);
  assert.equal(summary(zero).counts.tests, 0);
  assert.equal(zero.events.at(-1).data.success, true);
  assert.equal(zero.events.at(-1).data.counts.tests, 1, 'global count includes the wrapper');
  assert.equal(mainZero.status, 0, 'native main accepts zero selected bodies');
  const zeroPasses = zero.events.filter(event => event.type === 'test:pass');
  assert.equal(zeroPasses.length, 1);
  const wrapper = zeroPasses[0].data;
  assert.deepEqual([wrapper.name, wrapper.file, wrapper.line, wrapper.column], [file, file, 1, 1]);
  assert.deepEqual(positive.events.filter(event => event.data.name === 'present').map(event => event.type),
    ['test:enqueue', 'test:dequeue', 'test:complete', 'test:start', 'test:pass']);
  assert.ok(positive.events.concat(zero.events).every(event =>
    !['entryFile', 'testId', 'parentId', 'tags'].some(key => Object.hasOwn(event.data, key))));
  calibrated = { node: process.version, executable: process.execPath, file, positive, zero, mainZero };
  writeFileSync(join(scratch, 'raw-calibration.json'), JSON.stringify(calibrated, null, 2));
  t.diagnostic(`raw calibration retained at ${scratch}; ${process.version}`);
});

test('Given the approved patch, when support is checked, then only the exact version joins observation lists', () => {
  assert.ok(NODE22_DIALECT.includes('v22.23.4'));
  assert.equal(assertSupportedNode('v22.23.4'), 'v22.23.4');
  assert.doesNotThrow(() => closure.assertSupportedNode('v22.23.4'));
  assert.deepEqual(closure.ADMITTED_NODE_VERSIONS, ['v22.22.2', 'v26.8.1']);
  for (const version of ['v22.23.5', 'v22.24.0', 'v22.0.0', 'v26.9.0', 'v99.0.0']) {
    assert.throws(() => assertSupportedNode(version), /unsupported Node event protocol/);
    assert.throws(() => closure.assertSupportedNode(version), /unsupported exact Node version/);
  }
  const pins = { purpose: 'admitted_fixture', nodes: closure.ADMITTED_NODE_VERSIONS.map(version => ({ version })) };
  assert.doesNotThrow(() => closure.validatePurpose(pins));
  assert.throws(() => closure.validatePurpose({ ...pins, nodes: [...pins.nodes, { version: 'v22.23.4' }] }));
});

test('Given actual calibrated events, when reconciled, then one body passes and zero bodies or corrupt proof fail', () => {
  const inventory = { file, names: ['present'] };
  assert.equal(reconcileEvents(calibrated.positive.events, inventory).selected, 1);
  assert.throws(() => reconcileEvents(calibrated.zero.events, inventory), /summary mismatch|selection|plan/);
  for (const type of ['test:enqueue', 'test:dequeue', 'test:complete', 'test:start', 'test:pass']) {
    const damaged = calibrated.positive.events.filter(event => !(event.type === type && event.data.name === 'present'));
    assert.throws(() => reconcileEvents(damaged, inventory));
  }
});

test('Given native main exit 0 for no match, when the real selected-tests CLI runs, then zero is refused and positive selects one', () => {
  const positive = exec([adapter, '--cwd', scratch, '--case', file, 'present']);
  const zero = exec([adapter, '--cwd', scratch, '--case', file, 'absent']);
  writeFileSync(join(scratch, 'adapter-cli.json'), JSON.stringify({ node: process.version, positive, zero }, null, 2));
  assert.equal(positive.status, 0, positive.stderr);
  assert.equal(JSON.parse(positive.stdout).selected, 1);
  assert.equal(zero.status, 1);
  assert.match(zero.stderr, /summary mismatch|selection|plan/);
  assert.doesNotMatch(zero.stderr, /unsupported Node event protocol/);
  assert.equal(zero.stdout, '');
});

test('Given the approved source slice, when the lock is read, then only the pinned Node target changes', () => {
  const lock = JSON.parse(readFileSync(join(root, 'policy/ci-toolchain-lock.json')));
  assert.equal(lock.nodeVersion, '22.23.4');
  assert.equal(lock.npmVersion, '12.0.2');
  assert.equal(lock.nextNodeVersion, '26.9.0');
});
