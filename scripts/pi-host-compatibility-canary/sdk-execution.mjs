// Private branch of process.mjs: no alternate public runner or approval-discovery API.
import { spawn } from 'node:child_process';
import { writeFileSync, readFileSync, readlinkSync, lstatSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readPlan, verifyFiles, sha, need, same, canonical, TS_HOLD } from './sdk-plan.mjs';
import { processIdentity, fsyncDirectory, fsyncFile } from './state-files.mjs';
import { parseArgs, normalizeInventory } from './selected-tests.mjs';
import { assertHostClosure } from './sdk-host.mjs';
import { verifySourceInventory } from './sdk-inventory.mjs';
const HERE = dirname(fileURLToPath(import.meta.url));
const privatePlans = new WeakSet();
export function prepareSdkExecution(options, selection, host, manifest) {
  if (!options.sdkPlan && !options.sdkPlanSha256) return undefined;
  need(options.sdkPlan && options.sdkPlanSha256 && selection.profile === 'upgrade' && !options.dryRun &&
    selection.scenarios.length === 1, 'one effectful upgrade scenario and exact plan seal required');
  const input = readPlan(options.sdkPlan, options.sdkPlanSha256), p = input.plan;
  const scenario = selection.scenarios[0];
  need(p.scenario.id === scenario.id && same(p.scenario.command, scenario.command) &&
    p.scenario.cwd === resolve(manifest.root ?? HERE + '/../..', scenario.cwd), 'exact scenario command/cwd');
  need(same(p.host, { version: host.version, reviewAnchor: host.reviewAnchor }), 'host binding');
  need(sha(readFileSync(manifest.manifestPath)) === p.manifestSha256, 'manifest changed');
  canonical(p.candidate.path);
  const root = lstatSync(p.candidate.path);
  need(`${root.dev}:${root.ino}` === p.candidate.identity && p.candidate.path === resolve(HERE, '../..'), 'same candidate');
  // HEAD/index bind identity only. Working-tree bytes are the independently supplied
  // inventory digest plus live verifyFiles, never HEAD/index as custody.
  need(sha(readFileSync(join(p.candidate.path, '.git/index'))) === p.candidate.indexSha256, 'candidate index changed');
  const head = readFileSync(join(p.candidate.path, '.git/HEAD'), 'utf8').trim();
  need(head === p.candidate.head, 'exact detached candidate HEAD');
  verifySourceInventory(p);
  need(p.helpers.supervisor === join(HERE, 'sdk-supervisor.py') && p.helpers.preload === join(HERE, 'sdk-preload.mjs') &&
    p.helpers.selection === join(HERE, 'selected-tests.mjs') &&
    p.helpers.mounts === join(HERE, 'sdk_mounts.py') && p.helpers.release === join(HERE, 'sdk_release.py'),
    'existing canary private helpers');
  need(scenario.command[0] === 'node' && resolve(p.scenario.cwd, scenario.command[1]) === p.helpers.selection,
    'only existing selected-tests protocol is supported; npm/compile paths refused');
  const parsed = parseArgs(scenario.command.slice(2).map((arg, i, args) => args[i - 1] === '--cwd' ? p.scenario.cwd : arg));
  need(parsed.imports.length === 0, 'loader imports require implemented transform monitor');
  need(!p.mechanisms.some(m => TS_HOLD.includes(m)),
    'tsx/native-ts transform monitor not implemented; remaining HOLD');
  const inventory = normalizeInventory(parsed);
  need(same([...inventory.files].map(([file, names]) => ({ file, names })), p.realms.map(({ file, names }) => ({ file, names }))),
    'exact per-file selected bodies');
  const handle = Object.freeze({ ...input, scenario: scenario.id });
  privatePlans.add(handle); return handle;
}
export function isSdkExecution(value) { return privatePlans.has(value); }
function supervisorStartupArgs(p) {
  const paths = [p.helpers.supervisor, p.helpers.mounts, p.helpers.release];
  need(same(paths, ['sdk-supervisor.py', 'sdk_mounts.py', 'sdk_release.py'].map(name => join(HERE, name))),
    'exact startup source root/set');
  const pins = paths.map(path => {
    const rows = p.files.filter(row => row.path === path);
    need(rows.length === 1 && typeof rows[0].sha256 === 'string' && /^[a-f0-9]{64}$/.test(rows[0].sha256) &&
      Number.isSafeInteger(rows[0].bytes) && rows[0].bytes > 0 && rows[0].bytes <= 50 * 1024 &&
      Number.isInteger(rows[0].mode) && rows[0].mode >= 0 && rows[0].mode <= 0o755 && !(rows[0].mode & ~0o755), 'startup source pin');
    return rows[0].sha256;
  });
  return [HERE, ...pins]; // reviewed plan.files pins, NEVER hashes discovered at launch
}
export function guestArgv(input, sandbox) {
  const p = input.plan;
  const startup = supervisorStartupArgs(p);
  const args = ['/usr/bin/unshare', '--user', '--map-current-user', '--mount', '--propagation', 'private', '--',
    '/usr/bin/bwrap', '--unshare-all', '--as-pid-1', '--new-session', '--die-with-parent', '--cap-drop', 'ALL',
    '--clearenv', '--info-fd', '3', '--proc', '/proc', '--remount-ro', '/proc', '--dir', '/dev',
    '--ro-bind', '/dev/null', '/dev/null'];
  for (const row of p.files) args.push('--ro-bind', row.path, row.path);
  for (const row of p.links) args.push('--symlink', row.target, row.path);
  args.push('--ro-bind', join(sandbox, 'sdk-plan.json'), '/canary-input/plan.json',
    '--ro-bind', join(sandbox, 'sdk-context.json'), '/canary-input/context.json',
    '--perms', '0700', '--size', String(128 * 1024 ** 2), '--tmpfs', '/work', '--symlink', '/work/tmp', '/tmp',
    '--chdir', '/work', '--remount-ro', '/', p.toolchain.python, '-I', '-S', '-B', p.helpers.supervisor, ...startup);
  return args;
}
export async function executeSdk(input, sandbox, options) {
  need(isSdkExecution(input), 'unbound integration branch');
  verifySourceInventory(input.plan);
  verifyFiles(input.plan);
  assertHostClosure(input.plan); // BEFORE unshare/bwrap. Empty env is not preload proof.
  const binding = { planSha256: input.digest, runId: options.runId, attempt: randomUUID(), scenario: input.scenario,
    parentNamespaces: Object.fromEntries(['pid', 'net', 'ipc', 'mnt', 'user'].map(n => [n, readlinkSync('/proc/self/ns/' + n)])) };
  need(typeof binding.runId === 'string' && binding.runId.length > 0, 'journal run binding');
  writeFileSync(join(sandbox, 'sdk-plan.json'), input.raw, { flag: 'wx', mode: 0o600 });
  writeFileSync(join(sandbox, 'sdk-context.json'), JSON.stringify(binding), { flag: 'wx', mode: 0o600 });
  const argv = guestArgv(input, sandbox);
  return await new Promise(resolveResult => {
    const child = spawn(argv[0], argv.slice(1), { cwd: '/', env: {}, detached: true,
      stdio: ['pipe', 'pipe', 'pipe', 'pipe'] });
    let wire = '', info = '', diagnostics = '', ready, identity, result, failure, releasing = false, done = false;
    let frames = 0, bytes = 0, infoEnded = false;
    const finish = value => { if (!done) { done = true; clearTimeout(timer); resolveResult(value); } };
    const fail = error => { failure ??= String(error?.message ?? error); child.stdin.destroy(); };
    const release = async () => {
      if (!ready || !infoEnded || releasing || failure) return;
      releasing = true;
      try {
        const data = JSON.parse(info);
        identity = processIdentity(data['child-pid']);
        need(identity.pidNamespace.link === ready.namespace && ready.namespace !== binding.parentNamespaces.pid, 'PID1 identity');
        verifyFiles(input.plan);
        await options.beforeRelease(identity);
        binding.supervisorNamespace = ready.namespace;
        binding.supervisorIdentity = identity;
        const witness = join(options.evidenceDirectory, `${binding.runId}.${binding.attempt}.sdk-release.json`);
        writeFileSync(witness, JSON.stringify(binding) + '\n', { flag: 'wx', mode: 0o600 });
        fsyncFile(witness); fsyncDirectory(options.evidenceDirectory);
        child.stdin.write(binding.attempt + '\n'); // framed token; keep lifetime pipe open
      } catch (error) { fail(error); }
    };
    const timer = setTimeout(() => {
      fail('outer supervisor deadline/settlement unknown');
      for (const s of child.stdio) s?.destroy(); child.unref();
      finish({ ok: false, exitCode: 125, signal: null, stdout: '', stderr: '',
        integrityFailure: true, effectMayBeActive: true, error: failure });
    }, (input.plan.limits.wallSeconds + 30) * 1000);
    child.on('error', fail); child.stdin.on('error', fail);
    child.stdio[3].on('end', () => { infoEnded = true; void release(); });
    for (const [i, stream] of child.stdio.entries()) {
      if (i === 0) continue;
      stream.setEncoding('utf8'); stream.on('error', fail);
      stream.on('data', chunk => {
        bytes += Buffer.byteLength(chunk);
        if (bytes > 32 * 1024 ** 2) { fail('outer transport bound'); return; }
        if (i === 3) { info += chunk; void release(); return; }
        if (i === 2) { diagnostics += chunk; return; }
        wire += chunk;
        while (wire.includes('\n')) {
          const n = wire.indexOf('\n'), line = wire.slice(0, n); wire = wire.slice(n + 1);
          try {
            const frame = JSON.parse(line); frames++;
            if (frame.type === 'ready' && frames === 1) { ready = frame; void release(); }
            else if (frame.type === 'result' && frames === 2 && releasing && identity) result = frame;
            else fail('duplicate/late/unexpected supervisor receipt');
          } catch (error) { fail(error); }
        }
      });
    }
    child.on('close', (code, signal) => {
      child.stdin.destroy();
      if (failure || code !== 0 || signal || frames !== 2 || wire || !result || !binding.supervisorIdentity || diagnostics) {
        finish({ ok: false, exitCode: 125, signal: signal ?? null, stdout: '', stderr: diagnostics,
          integrityFailure: true, effectMayBeActive: true, error: failure ?? 'missing/truncated/unknown supervisor completion' });
        return;
      }
      const exitCode = result.code;
      if (!Number.isInteger(exitCode) || exitCode < 0 || exitCode > 255) {
        finish({ ok: false, exitCode: 125, signal: null, stdout: '', stderr: '', integrityFailure: true,
          effectMayBeActive: true, error: 'unknown or signalled command status' }); return;
      }
      try {
        need(typeof result.stdout === 'string' && typeof result.stderr === 'string', 'output receipt type');
        const out = Buffer.from(result.stdout, 'base64'), err = Buffer.from(result.stderr, 'base64');
        need(out.toString('base64') === result.stdout && err.toString('base64') === result.stderr &&
          out.length + err.length <= input.plan.limits.outputBytes, 'malformed/oversized output receipt');
        const execution = { ok: exitCode === 0, exitCode, signal: null, stdout: out.toString('utf8'), stderr: err.toString('utf8') };
        Object.defineProperty(execution, 'sdkCompletion', { value: { input, binding, settlement: result.settlement,
          wires: result.wires, output: { stdoutBase64: result.stdout, stderrBase64: result.stderr },
          evidenceDirectory: options.evidenceDirectory } });
        finish(execution);
      } catch (error) {
        finish({ ok: false, exitCode: 125, signal: null, stdout: '', stderr: '', integrityFailure: true,
          effectMayBeActive: true, error: error.message });
      }
    });
  });
}
