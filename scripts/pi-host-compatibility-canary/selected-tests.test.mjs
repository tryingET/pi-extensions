import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, mkdirSync, readFileSync, symlinkSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { getEventListeners } from 'node:events';
import { test } from 'node:test';

// Only newly authored builtin fixtures execute. No network, installs, real HOME,
// caches, packages, Pi or AK. Retain all owned scratch; never recursively delete.
assert.ok(process.env.TMPDIR, 'explicit TMPDIR required');
const scratch = mkdtempSync(join(process.env.TMPDIR, 'ak5597-selection-'));
const home = join(scratch, 'home');
mkdirSync(home);
const env = { HOME: home, TMPDIR: scratch, XDG_CACHE_HOME: home,
  XDG_CONFIG_HOME: home, XDG_DATA_HOME: home, PATH: '/usr/bin:/bin' };
const adapterPath = fileURLToPath(new URL('./selected-tests.mjs', import.meta.url));
const prelude = "import { test, describe, it } from 'node:test';\n";
let serial = 0;
const fixture = (name, source) => {
  const file = join(scratch, `${++serial}-${name}`);
  writeFileSync(file, source);
  return file;
};
const adapter = () => import('./selected-tests.mjs');
const options = (cases, extra = {}) => ({ cwd: scratch, env, cases, ...extra });
const select = async (file, names = ['wanted'], extra = {}) => {
  const { runSelectedTests } = await adapter();
  return runSelectedTests(options(names.map(name => ({ file, name })), extra));
};
const rawRun = (file, pattern) => {
  const controller = fixture('raw-controller.mjs', `
    import { run } from 'node:test';
    import { writeSync } from 'node:fs';
    for await (const event of run({ files: [${JSON.stringify(file)}], concurrency: 1,
      execArgv: [], isolation: 'process', testNamePatterns: [new RegExp(${JSON.stringify(pattern)})] })) {
      writeSync(3, JSON.stringify(event) + '\\n');
    }
  `);
  const result = spawnSync(process.execPath, [controller], { cwd: scratch, env,
    encoding: 'utf8', timeout: 10000, stdio: ['ignore', 'pipe', 'pipe', 'pipe'] });
  assert.ifError(result.error);
  assert.equal(result.status, 0);
  assert.equal(result.signal, null);
  return { ...result, events: result.output[3].trim().split('\n').map(JSON.parse) };
};
const cli = args => spawnSync(process.execPath, [adapterPath, ...args], {
  cwd: home, env, encoding: 'utf8', timeout: 10000,
});
assert.ok(['v22.22.2', 'v26.8.1'].includes(process.version), 'explicit calibrated version required');
const node22 = process.version === 'v22.22.2';
const isBody = d => node22 ? !(d.name === d.file && d.line === 1 && d.column === 1) : Boolean(d.entryFile);
const fileSummary = (events, file) => events.find(e => e.type === 'test:summary' && e.data.file === file);
const bodyPasses = events => events.filter(e => e.type === 'test:pass' && isBody(e.data));

let calibrated;
test('calibration: supported protocol has five real body phases; zero selection counts only a wrapper', t => {
  t.diagnostic(`Node ${process.version}; owned fixtures/HOME retained: ${scratch}`);
  const file = fixture('calibration.mjs', prelude + "test('present', () => {});\n");
  const zero = rawRun(file, '^absent$');
  const positive = rawRun(file, '^present$');
  fixture('calibrated-events.json', JSON.stringify({ node: process.version, zero: zero.events, positive: positive.events }, null, 2));
  assert.equal(fileSummary(zero.events, file).data.counts.tests, 0);
  assert.equal(zero.events.at(-1).data.success, true);
  assert.equal(zero.events.at(-1).data.counts.tests, 1, 'global wrapper is NOT body proof');
  assert.equal(bodyPasses(zero.events).length, 0);
  assert.equal(fileSummary(positive.events, file).data.counts.tests, 1);
  assert.equal(bodyPasses(positive.events).length, 1);
  const phases = positive.events.filter(e => isBody(e.data) && e.data.name === 'present').map(e => e.type);
  assert.deepEqual(phases, ['test:enqueue', 'test:dequeue', 'test:complete', 'test:start', 'test:pass']);
  if (node22) assert.ok(positive.events.every(e => !['entryFile', 'testId', 'parentId', 'tags'].some(k => Object.hasOwn(e.data, k))));
  else assert.equal(positive.events.find(e => e.type === 'test:complete' && !isBody(e.data)).data.testId,
    positive.events.find(e => e.type === 'test:complete' && isBody(e.data)).data.testId, 'wrapper/body IDs collide');
  calibrated = { file, events: positive.events, zero: zero.events };
  t.diagnostic(`Observed ${process.version}: zero body passes=0/global tests=1; positive body passes=1.`);
});

test('adapter API exists (observed initial red was API absence)', async () => {
  assert.equal(typeof (await adapter()).runSelectedTests, 'function');
});

test('positive exact inventory: two bodies once in one file; regex metacharacters and suffixes', async () => {
  const name = 'literal [x].*+?^${}()|\\ /';
  const marker = join(scratch, 'unexpected-marker');
  const file = fixture('exact.mjs', prelude + `
    import { writeFileSync } from 'node:fs';
    test(${JSON.stringify(name)}, () => {});
    test('second', () => {});
    for (const name of ['prefix second', 'second suffix', 'literal x']) {
      test(name, () => { writeFileSync(${JSON.stringify(marker)}, name); });
    }
  `);
  const result = await select(file, [name, 'second']);
  assert.equal(result.selected, 2);
  assert.equal(result.files.length, 1);
  assert.deepEqual(result.files[0].names, [name, 'second']);
  assert.equal(existsSync(marker), false, 'unselected bodies did not execute');
});

test('Supported Node name normalization can execute an unexpected body; raw event identity rejects it', async t => {
  const file = fixture('normalized-name.mjs', prelude + "test('wanted', () => {}); test('wanted\\n', () => {});\n");
  const { exactPattern } = await adapter();
  const trace = rawRun(file, exactPattern(['wanted']));
  assert.deepEqual(bodyPasses(trace.events).map(e => e.data.name), ['wanted', 'wanted\n']);
  await assert.rejects(select(file), /identity|unexpected body/);
  t.diagnostic('Observed calibrated Node: anchored pattern selected wanted plus wanted\\n; adapter rejected extra execution.');
});

test('same name across files is independent; patterns do not leak across files', async () => {
  const marker = join(scratch, 'cross-file-marker');
  const a = fixture('a.mjs', prelude + "test('shared', () => {}); test('only-a', () => {});\n");
  const b = fixture('b.mjs', prelude + `
    import { writeFileSync } from 'node:fs';
    test('shared', () => {});
    test('only-a', () => { writeFileSync(${JSON.stringify(marker)}, 'wrong file'); });
  `);
  const { runSelectedTests } = await adapter();
  const result = await runSelectedTests(options([
    { file: a, name: 'shared' }, { file: a, name: 'only-a' }, { file: b, name: 'shared' },
  ]));
  assert.equal(result.selected, 3);
  assert.deepEqual(result.files.map(f => f.selected), [2, 1]);
  assert.equal(existsSync(marker), false);
});

test('real body can be named like its file without accepting a wrapper', async () => {
  const file = fixture('file-name.mjs', prelude + "import { fileURLToPath } from 'node:url'; test(fileURLToPath(import.meta.url), () => {});\n");
  assert.equal((await select(file, [file])).selected, 1);
  const empty = fixture('empty.mjs', 'console.log("ok 1 - wanted");\n');
  await assert.rejects(select(empty, [empty]));
});

test('zero, empty, partial and cross-file partial inventories fail despite child exit 0', async () => {
  const file = fixture('partial.mjs', prelude + "test('present', () => {});\n");
  await assert.rejects(select(file), /summary mismatch|selection|body|plan/);
  await assert.rejects(select(file, ['present', 'absent']), /summary mismatch|selection|body|plan/);
  const empty = fixture('no-tests.mjs', '// no tests\n');
  await assert.rejects(select(empty));
  const { runSelectedTests } = await adapter();
  await assert.rejects(runSelectedTests(options([
    { file, name: 'present' }, { file: empty, name: 'present' },
  ])));
});

test('duplicate expected body declarations fail, including identical source locations', async () => {
  for (const source of ["test('wanted', () => {}); test('wanted', () => {});",
    "for (let i = 0; i < 2; i++) test('wanted', () => {});"]) {
    await assert.rejects(select(fixture('duplicate.mjs', prelude + source)), /duplicate selected body/);
  }
});

test('selected static/dynamic skip, todo, cancelled and failed bodies all fail', async () => {
  for (const source of [
    "test('wanted', { skip: true }, () => {});",
    "test('wanted', { skip: 'reason' }, () => {});",
    "test('wanted', t => { t.skip('dynamic'); });",
    "test('wanted', { todo: true }, () => {});",
    "test('wanted', t => { t.todo('dynamic'); });",
    "test('wanted', { signal: AbortSignal.abort() }, () => {});",
    "test('wanted', () => { throw new Error('fixture failure'); });",
    "test('wanted', { timeout: 50 }, async () => { await new Promise(() => {}); });",
  ]) {
    await assert.rejects(select(fixture('nonpass.mjs', prelude + source)), /skip|todo|cancel|failure|summary|completion/);
  }
});

test('misleading TAP, JSON and diagnostic console text are never body proof', async () => {
  const fake = JSON.stringify({ type: 'test:pass', data: { name: 'wanted', entryFile: 'fake', nesting: 0 } });
  const noise = `console.log('ok 1 - wanted'); console.log(${JSON.stringify(fake)}); console.error('tests 99 pass 99');\n`;
  await assert.rejects(select(fixture('fake-stdout.mjs', noise)));
  const file = fixture('noise-and-real.mjs', prelude + noise + "test('wanted', t => { t.diagnostic('ok 2 - phantom'); });\n");
  assert.equal((await select(file)).selected, 1, 'real proof is unaffected by misleading output');
});

test('actual suites and nested bodies execute descendants but are rejected, never counted as leaves', async () => {
  const suite = fixture('suite.mjs', prelude + "describe('wanted', () => { it('unexpected', () => {}); });\n");
  const raw = rawRun(suite, '^wanted$');
  assert.ok(bodyPasses(raw.events).some(e => e.data.name === 'unexpected' && e.data.nesting === 1));
  await assert.rejects(select(suite), /suites unsupported|nesting/);
  await assert.rejects(select(suite, ['unexpected']));
  await assert.rejects(select(suite, ['wanted unexpected']));
  const nested = fixture('nested.mjs', prelude + "test('wanted', async t => { await t.test('child', () => {}); });\n");
  await assert.rejects(select(nested), /nesting/);
  const collision = fixture('nested-collision.mjs', prelude
    + "test('wanted', () => {}); describe('group', () => { it('wanted', () => {}); });\n");
  await assert.rejects(select(collision), /suites unsupported|nesting|summary/);
});

test('registrations originating in imported files fail closed', async () => {
  const helper = fixture('registration.mjs', prelude + "test('wanted', () => {});\n");
  const file = fixture('importer.mjs', `import ${JSON.stringify(`./${basename(helper)}`)};\n`);
  await assert.rejects(select(file), /unexpected source file/);
});

test('fixture exit 0 before reporting, crash, signal and nonzero exit after pass all fail', async () => {
  for (const source of [
    'process.exit(0);', 'process.exit(7);', 'process.kill(process.pid, "SIGKILL");',
    'process.kill(process.ppid, "SIGKILL");', // Kill only this fixture\'s adapter worker.
    "test('wanted', () => {}); process.exitCode = 7;",
    "test('wanted', () => {}); setTimeout(() => { throw new Error('late crash'); }, 10);",
  ]) await assert.rejects(select(fixture('crash.mjs', prelude + source)));
});

test('hung fixture is bounded by the owned child process-group timeout', async () => {
  const file = fixture('hang.mjs', prelude + "test('wanted', async () => { setInterval(() => {}, 1000); await new Promise(() => {}); });\n");
  await assert.rejects(select(file, ['wanted'], { timeoutMs: 500 }), /child timeout/);
});

test('all selectors preflight before any execution; missing/outside/nonfile/symlink paths fail', async () => {
  const { runSelectedTests, normalizeInventory } = await adapter();
  const marker = join(scratch, 'preflight-marker');
  const file = fixture('preflight.mjs', prelude + `import { writeFileSync } from 'node:fs';
    test('wanted', () => { writeFileSync(${JSON.stringify(marker)}, 'executed'); });\n`);
  await assert.rejects(runSelectedTests(options([{ file, name: 'wanted' }, { file: 'missing.mjs', name: 'wanted' }])));
  assert.equal(existsSync(marker), false);
  const pkg = join(scratch, 'synthetic-package');
  mkdirSync(pkg);
  const alias = join(pkg, 'escape.mjs');
  symlinkSync(file, alias);
  for (const candidate of [file, `../${basename(file)}`, alias, pkg]) {
    assert.throws(() => normalizeInventory(options([{ file: candidate, name: 'wanted' }], { cwd: pkg })));
  }
  assert.throws(() => normalizeInventory(options([{ file, name: 'wanted' },
    { file: `./${basename(file)}`, name: 'wanted' }])), /duplicate selector/);
  const inAlias = join(scratch, 'alias.mjs');
  symlinkSync(file, inAlias);
  assert.throws(() => normalizeInventory(options([{ file, name: 'wanted' }, { file: inAlias, name: 'wanted' }])), /duplicate selector/);
});

test('invalid API inventories and CLI pairing fail closed', async () => {
  const { normalizeInventory, parseArgs, exactPattern } = await adapter();
  const file = fixture('validation.mjs', prelude + "test('wanted', () => {});\n");
  for (const bad of [undefined, {}, options([]), options([{ file, name: '' }]),
    options([{ file, name: 'a\nb' }]), options([{ file, name: 5 }]), options([null]),
    options([{ file, name: 'wanted' }], { cwd: '.' }),
    options([{ file, name: 'wanted' }], { timeoutMs: 0 }),
    options([{ file, name: 'wanted' }], { imports: ['https://invalid.example/loader'] }),
    options([{ file, name: 'wanted' }], { imports: ['tsx', 'tsx'] })]) {
    assert.throws(() => normalizeInventory(bad));
  }
  for (const args of [[], ['--case', file, 'wanted'], ['--cwd', scratch],
    ['--cwd', scratch, '--case', file], ['--cwd', scratch, '--file', file],
    ['--cwd', scratch, '--cwd', scratch, '--case', file, 'wanted'],
    ['--cwd', scratch, '--import'], ['--case']]) assert.throws(() => parseArgs(args));
  assert.throws(() => exactPattern(['wanted', 'wanted']));
  const pattern = new RegExp(exactPattern(['a.*', 'wanted']));
  assert.equal(pattern.test('a.*'), true);
  for (const name of ['abc', 'wanted\n', 'xwanted', 'wantedx']) assert.equal(pattern.test(name), false);
  assert.equal(parseArgs(['--cwd', scratch, '--import', 'tsx', '--case', file, 'wanted']).imports[0], 'tsx');
});

test('CLI uses explicit package cwd, repeated paired cases and declared builtin-only preload', async () => {
  const preload = fixture('preload.mjs', 'globalThis.ak5597Preload = process.cwd();\n');
  const file = fixture('cwd.mjs', prelude + `import assert from 'node:assert/strict';
    test('wanted', () => {
      assert.equal(process.cwd(), ${JSON.stringify(scratch)});
      assert.equal(process.env.HOME, ${JSON.stringify(home)});
      assert.equal(globalThis.ak5597Preload, process.cwd());
    }); test('second', () => {});\n`);
  const argv = ['--cwd', scratch, '--import', `./${basename(preload)}`,
    '--case', basename(file), 'wanted', '--case', basename(file), 'second'];
  const result = cli(argv);
  assert.ifError(result.error);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(JSON.parse(result.stdout).selected, 2);
  await assert.rejects(select(file), /failure|error/);
  await assert.rejects(select(file, ['wanted'], { imports: ['ak5597-deliberately-missing-loader'] }));
  assert.notEqual(cli(['--cwd', scratch, '--case', basename(file), 'absent']).status, 0);
  assert.notEqual(cli(['--case', basename(file), 'wanted']).status, 0);
});

test('real fixture can corrupt its runner channel, but cannot turn malformed events into proof', async () => {
  const file = fixture('corrupt-channel.mjs', prelude
    + "import { writeSync } from 'node:fs'; writeSync(3, Buffer.from('not-node-test-protocol')); test('wanted', () => {});\n");
  await assert.rejects(select(file));
});

test('reconciler rejects missing/duplicate lifecycle, wrappers, summaries, plans and malformed events', async () => {
  const { reconcileEvents } = await adapter();
  const { file, events, zero } = calibrated;
  const inventory = { file, names: ['present'] };
  assert.equal(reconcileEvents(events, inventory).selected, 1);
  assert.throws(() => reconcileEvents(zero, inventory));
  for (const version of ['v22.22.1', 'v26.8.0', 'v99.0.0', node22 ? 'v26.8.1' : 'v22.22.2']) {
    assert.throws(() => reconcileEvents(events, inventory, version), 'unknown or mismatched dialect');
  }
  for (let index = 0; index < events.length; index++) {
    if (events[index].type === 'test:diagnostic') continue;
    assert.throws(() => reconcileEvents(events.filter((_, i) => i !== index), inventory), `missing ${events[index].type}`);
    const duplicate = structuredClone(events);
    duplicate.splice(index, 0, duplicate[index]);
    assert.throws(() => reconcileEvents(duplicate, inventory), `duplicate ${events[index].type}`);
  }
  const mutate = fn => { const copy = structuredClone(events); fn(copy); assert.throws(() => reconcileEvents(copy, inventory)); };
  for (const [key, value] of [['entryFile', '/wrong'], ['file', '/wrong'], ['name', 'unexpected'],
    ['testId', 99], ['parentId', 1], ['nesting', 1], ['line', 0], ['column', '1'], ['skip', true], ['todo', true]]) {
    mutate(copy => { copy.find(e => e.type === 'test:pass' && isBody(e.data)).data[key] = value; });
  }
  mutate(copy => { copy.find(e => e.type === 'test:complete' && isBody(e.data)).data.details.passed = false; });
  mutate(copy => { copy.find(e => e.type === 'test:pass' && isBody(e.data)).data.details.type = 'suite'; });
  mutate(copy => { copy.find(e => e.type === 'test:pass' && isBody(e.data)).data.details.passed = false; });
  mutate(copy => { copy.find(e => e.type === 'test:complete' && !isBody(e.data)).data.testNumber = 2; });
  mutate(copy => { copy.find(e => e.type === 'test:complete' && isBody(e.data)).data.testNumber = 2; });
  mutate(copy => {
    const d = copy.find(e => e.type === 'test:pass' && isBody(e.data)).data;
    if (node22) Object.assign(d, { entryFile: file, testId: 1, parentId: 0, tags: [] });
    else for (const k of ['entryFile', 'testId', 'parentId', 'tags']) delete d[k];
  });
  mutate(copy => { copy.at(-1).data.counts.cancelled = 1; });
  mutate(copy => { copy.at(-1).data.counts.tests = '1'; });
  mutate(copy => { copy.at(-1).data.success = false; });
  mutate(copy => { copy.unshift({ type: 'test:watch:drained', data: {} }); });
  mutate(copy => { copy.unshift({ type: 'test:stdout', data: {} }); });
  mutate(copy => { copy.push({ type: 'test:diagnostic', data: { message: 'late' } }); });
  for (const bad of [[], [null], [{ type: 'test:pass' }], [{ type: 'test:pass', data: [] }]]) {
    assert.throws(() => reconcileEvents(bad, inventory));
  }
});

test('transport requires structured header, ordered events, terminal count and complete framing', async () => {
  const { decodeTranscript, reconcileEvents } = await adapter();
  const { file, events } = calibrated;
  const frames = [
    { kind: 'begin', protocol: 'ak5597-selection-v1', node: process.version, file },
    ...events.map((event, seq) => ({ kind: 'event', seq, event })),
    { kind: 'end', count: events.length },
  ];
  const encode = value => value.map(frame => JSON.stringify(frame)).join('\n') + '\n';
  const wire = encode(frames);
  assert.equal(reconcileEvents(decodeTranscript(wire, file), { file, names: ['present'] }).selected, 1);
  for (const bad of ['', 'ok 1 - present\n', wire.slice(0, -1), encode(frames.slice(1)),
    encode(frames.slice(0, -1)), encode([...frames, frames.at(-1)]), wire + '\n']) {
    assert.throws(() => decodeTranscript(bad, file));
  }
  for (const edit of [copy => { copy[1].seq = 1; }, copy => { copy.at(-1).count++; },
    copy => { copy[0].file = '/wrong'; }, copy => { copy[0].protocol = 'unknown'; },
    copy => { copy[0].node = 'unverified'; },
    copy => { copy.splice(2, 1); }]) {
    const copy = structuredClone(frames);
    edit(copy);
    assert.throws(() => decodeTranscript(encode(copy), file));
  }
});

// Linux process identity evidence, not kill(pid, 0), which also reports zombies.
function identity(pid) {
  try {
    const raw = readFileSync(`/proc/${pid}/stat`, 'utf8');
    const fields = raw.slice(raw.lastIndexOf(')') + 2).trim().split(/\s+/);
    return { pid, state: fields[0], ppid: +fields[1], group: +fields[2], session: +fields[3], start: fields[19] };
  } catch (error) { if (error.code === 'ENOENT' || error.code === 'ESRCH') return null; throw error; }
}
const alive = saved => {
  const now = saved && identity(saved.pid);
  return now && now.start === saved.start && !['Z', 'X'].includes(now.state);
};
const gone = saved => {
  const now = saved && identity(saved.pid);
  return !now || now.start !== saved.start;
};
const waitUntil = async (predicate, ms = 3000) => {
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) {
    if (predicate()) return true;
    await new Promise(r => setTimeout(r, 20));
  }
  return Boolean(predicate());
};
function terminateOwned(saved, group = false) {
  if (!alive(saved)) return;
  if (group) assert.equal(saved.group, saved.session, 'only new detached session groups');
  try { process.kill(group ? -saved.group : saved.pid, 'SIGKILL'); }
  catch (error) { if (error.code !== 'ESRCH') throw error; }
}

for (const signal of ['SIGINT', 'SIGTERM', 'SIGKILL', 'GROUP_TERM', 'GROUP_KILL', 'SIGKILL_NOISY', 'ABORT']) {
  test(`real interruption ${signal}: worker and hanging grandchild terminate without collateral kills`, async t => {
    assert.equal(process.platform, 'linux', 'lifetime proof requires Linux /proc');
    const dir = mkdtempSync(join(scratch, 'lifetime-'));
    const testReceipt = join(dir, 'test.json');
    const leafReceipt = join(dir, 'leaf.json');
    const leaf = fixture('lifetime-leaf.mjs', `import { writeFileSync } from 'node:fs';
      writeFileSync(${JSON.stringify(leafReceipt)}, JSON.stringify({ pid: process.pid }));
      setInterval(() => {}, 1000);`);
    const file = fixture('lifetime-test.mjs', prelude + `import { spawn } from 'node:child_process';
      import { writeFileSync } from 'node:fs';
      test('wanted', async () => {
        writeFileSync(${JSON.stringify(testReceipt)}, JSON.stringify({ pid: process.pid, worker: process.ppid }));
        spawn(process.execPath, [${JSON.stringify(leaf)}], { stdio: 'ignore' });
        ${signal === 'SIGKILL_NOISY' ? "setInterval(() => console.log('x'.repeat(1024)), 1);" : ''}
        setInterval(() => {}, 1000); await new Promise(() => {});
      });`);
    const sentinelFile = fixture('sentinel.mjs', 'setInterval(() => {}, 1000);');
    const sentinel = spawn(process.execPath, [sentinelFile], { cwd: dir, env, detached: true, stdio: 'ignore' });
    const sentinelId = identity(sentinel.pid);
    const apiDriver = signal === 'ABORT' && fixture('api-cancel.mjs', `
      import assert from 'node:assert/strict';
      import { getEventListeners } from 'node:events';
      import { runSelectedTests } from ${JSON.stringify(pathToFileURL(adapterPath).href)};
      const controller = new AbortController();
      process.once('SIGUSR1', () => controller.abort());
      await assert.rejects(runSelectedTests({ cwd: ${JSON.stringify(scratch)},
        cases: [{ file: ${JSON.stringify(file)}, name: 'wanted' }], signal: controller.signal }), /cancelled/);
      assert.equal(getEventListeners(controller.signal, 'abort').length, 0);
    `);
    const args = apiDriver ? [apiDriver] : [adapterPath, '--cwd', scratch, '--case', file, 'wanted'];
    const child = spawn(process.execPath, args,
      { cwd: dir, env, detached: true, stdio: ['ignore', 'ignore', 'pipe'] });
    child.stderr.resume();
    let exit;
    child.on('exit', (code, sig) => { exit = { code, signal: sig }; });
    const cliId = identity(child.pid);
    let ids = [];
    let receipt;
    try {
      assert.equal(await waitUntil(() => existsSync(testReceipt) && existsSync(leafReceipt)), true, 'fixture readiness');
      receipt = JSON.parse(readFileSync(testReceipt, 'utf8'));
      const leafPid = JSON.parse(readFileSync(leafReceipt, 'utf8')).pid;
      ids = [identity(receipt.worker), identity(receipt.pid), identity(leafPid)];
      assert.ok(ids.every(Boolean));
      assert.equal(ids[0].ppid, child.pid);
      assert.equal(ids[1].ppid, ids[0].pid);
      assert.equal(ids[2].ppid, ids[1].pid);
      for (const id of ids) assert.equal(id.group, ids[0].pid);
      assert.notEqual(sentinelId.group, ids[0].group);
      const delivered = signal === 'ABORT' ? 'SIGUSR1' : signal === 'GROUP_TERM' ? 'SIGTERM'
        : ['GROUP_KILL', 'SIGKILL_NOISY'].includes(signal) ? 'SIGKILL' : signal;
      assert.equal(cliId.group, cliId.pid, 'synthetic supervisor group is independent');
      assert.notEqual(cliId.group, ids[0].group);
      process.kill(signal.startsWith('GROUP_') ? -child.pid : child.pid, delivered);
      assert.equal(await waitUntil(() => exit), true, 'CLI interruption bounded');
      const stopped = await waitUntil(() => ids.every(id => !alive(id)), 1500);
      const reaped = stopped && await waitUntil(() => ids.every(gone), 1500);
      const evidence = { signal, cli: cliId, before: ids, exit, stopped, reaped,
        after: ids.map(id => identity(id.pid)), sentinelAlive: Boolean(alive(sentinelId)) };
      writeFileSync(join(dir, 'interruption.json'), JSON.stringify(evidence, null, 2));
      t.diagnostic(JSON.stringify(evidence));
      assert.equal(stopped, true, 'interrupted adapter left its worker/test/grandchild alive');
      assert.deepEqual(exit, delivered === 'SIGKILL' ? { code: null, signal: delivered } :
        { code: signal === 'ABORT' ? 0 : signal === 'SIGINT' ? 130 : 143, signal: null });
      assert.equal(reaped, true, 'no leftover fixture zombies');
      assert.ok(alive(sentinelId), 'unrelated sentinel survived');
    } finally {
      // Red regression must not abandon its new processes. Recover only direct
      // worker children of this still-identified CLI if readiness failed.
      if (ids.length === 0 && alive(cliId)) {
        const children = readFileSync(`/proc/${child.pid}/task/${child.pid}/children`, 'utf8').trim();
        ids = children ? children.split(/\s+/).map(pid => identity(+pid)).filter(Boolean) : [];
      }
      const member = ids.find(alive);
      if (member) terminateOwned(member, true);
      terminateOwned(cliId);
      terminateOwned(sentinelId);
      assert.equal(await waitUntil(() => [...ids, cliId, sentinelId].every(gone)), true,
        'test-owned process teardown bounded');
      writeFileSync(join(dir, 'teardown.json'), JSON.stringify([...ids, cliId, sentinelId].map(id => identity(id.pid))));
    }
  });
}

test('local declared imports preserve # and ? as URL-encoded filename characters', async () => {
  const file = fixture('url-test.mjs', prelude + "import assert from 'node:assert/strict'; test('wanted', () => assert.equal(globalThis.urlPreload, true));");
  for (const name of ['hash#loader.mjs', 'query?loader.mjs']) {
    const preload = fixture(name, 'globalThis.urlPreload = true;');
    assert.equal((await select(file, ['wanted'], { imports: [preload] })).selected, 1);
  }
});

test('pre-abort prevents execution; API abort listeners and CLI signal listeners are removed', async () => {
  const { runSelectedTests, runCli } = await adapter();
  const file = fixture('listeners.mjs', prelude + "test('wanted', () => {});");
  const before = ['SIGINT', 'SIGTERM'].map(name => process.listeners(name));
  const controller = new AbortController();
  for (const names of [['wanted'], ['missing']]) {
    const work = select(file, names, { signal: controller.signal });
    if (names[0] === 'wanted') await work; else await assert.rejects(work);
    assert.equal(getEventListeners(controller.signal, 'abort').length, 0);
  }
  await runCli(['--cwd', scratch, '--case', file, 'wanted']);
  await assert.rejects(runCli(['--cwd', scratch, '--case', file, 'missing']));
  await assert.rejects(runCli([]));
  assert.deepEqual(['SIGINT', 'SIGTERM'].map(name => process.listeners(name)), before);
  const marker = join(scratch, 'must-not-run');
  const forbidden = fixture('pre-abort.mjs', `import { writeFileSync } from 'node:fs'; writeFileSync(${JSON.stringify(marker)}, 'bad');`);
  controller.abort();
  await assert.rejects(runSelectedTests(options([{ file: forbidden, name: 'wanted' }], { signal: controller.signal })), /cancelled/);
  assert.equal(existsSync(marker), false);
  assert.equal(getEventListeners(controller.signal, 'abort').length, 0);
});

test('wrapper-tuple body collision is refused on 22, explicitly scoped on 26', async () => {
  // Node-specific ambiguity is refused rather than used as body evidence.
  const loader = fixture('global-test.mjs', "import { test } from 'node:test'; globalThis.test = test;");
  const file = fixture('wrapper-collision.mjs', '');
  writeFileSync(file, `test(${JSON.stringify(file)}, () => {});`);
  const work = select(file, [file], { imports: [loader] });
  if (node22) await assert.rejects(work, /duplicate wrapper/);
  else assert.equal((await work).selected, 1);
});

test('CLI resolves an explicit relative cwd against invocation cwd', () => {
  const file = fixture('relative-root.mjs', prelude + "test('wanted', () => {});");
  // cli() invokes from scratch/home, so '..' is the explicit package analogue.
  const result = cli(['--cwd', '..', '--case', basename(file), 'wanted']);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(JSON.parse(result.stdout).selected, 1);
});

