import { spawn } from 'node:child_process';
import { readFileSync, realpathSync, statSync, writeSync } from 'node:fs';
import { isAbsolute, relative, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { Socket } from 'node:net';
import { types } from 'node:util';
import { exactPattern, reconcileEvents, assertSupportedNode } from './selected-tests-protocol.mjs';
export { exactPattern, reconcileEvents, assertSupportedNode };

/**
 * Selection proof ONLY; no package/scenario/SDK qualification.
 * CLI: node selected-tests.mjs --cwd /absolute/package
 *        [--import tsx] [--import ./local-loader.mjs]
 *        --case relative/file.test.mjs 'exact top-level name' [--case file name ...]
 *
 * Each file runs once, sequentially, with its own union of escaped exact names.
 * Only top-level test() / it() bodies defined in that file are supported. Suites,
 * nesting and imported registrations are rejected, not inferred from full names.
 * Same names in different files are independent; duplicate names in one file fail.
 * File evaluation, hooks and explicitly declared imports can still have effects:
 * this is a verifier for trusted tests, NOT a sandbox or proof of assertion quality.
 *
 * Strict v22.22.2 / v22.23.3 / v26.8.1 event proof: see selected-tests-protocol.mjs.
 * Other versions are refused before execution. TS/tsx and SDK remain unqualified.
 * API cancellation: options.signal (AbortSignal). CLI SIGINT/SIGTERM abort the
 * active run and return 130/143; listeners are removed on every settled path.
 * A dedicated parent-lifetime pipe (fd 4, not inherited by test children) makes
 * adapter hard death visible to the detached worker, which kills its OWN group.
 * Requires a live, schedulable worker/event loop. This is not containment of
 * descendants that escape the group, or simultaneous adapter+worker hard death.
 * No filesystem writes or cleanup here; Linux lifetime proof, other OS unverified.
 */
const SELF = fileURLToPath(import.meta.url);
const PROTOCOL = 'ak5597-selection-v1';
const LIMIT = 8 * 1024 * 1024;
const own = (value, key) => Object.hasOwn(value, key);
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const check = (condition, message) => { if (!condition) throw new Error(message); };
const text = value => typeof value === 'string' && value.trim().length > 0 && !/[\x00-\x1f\x7f]/u.test(value);
const integer = value => Number.isSafeInteger(value) && value >= 0;

// Reporting only: these values are never read by the proof reconciler. Keep the
// error key even for undefined/hostile values: its PRESENCE is rejection proof.
const DIAGNOSTIC_LIMIT = 3072;
const FIELD_LIMIT = 384;
const safeRecord = value => {
  try {
    return object(value) && !types.isProxy(value) && (types.isNativeError(value)
      // Node 22 rehydrates test-child errors with Error.prototype but no
      // native Error internal slot. Accept that exact prototype, not arbitrary classes.
      || [Object.prototype, Error.prototype, null].includes(Object.getPrototypeOf(value)));
  } catch { return false; }
};
function field(value, key) {
  if (!safeRecord(value)) return undefined;
  try {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    return descriptor && own(descriptor, 'value') ? descriptor.value : undefined;
  } catch { return undefined; }
}
export function sanitizeDiagnostic(value) {
  if (typeof value !== 'string') return undefined;
  // Do not truncate input before redaction (a cut credential could leak). Refuse
  // oversized input altogether, bounding regex work as well as rendered output.
  if (value.length > 16384) return '[omitted: oversized field]';
  let result = value
    .replace(/\x1b\][^\x07\x1b]*(?:\x07|\x1b\\|$)/gu, '')
    .replace(/\x1b\[[0-?]*[ -/]*[@-~]/gu, '')
    .replace(/[\t\r\n]/gu, ' ')
    .replace(/[\x00-\x1f\x7f-\x9f\u061c\u200b-\u200f\u2028-\u202e\u2060-\u206f\ufeff]/gu, '');
  // Credential words do not need assignment delimiters. Never decode or parse
  // opaque/escaped payloads: omit the entire field, retaining separate plain
  // module/identity/code fields. False-positive omissions are preferable to leaks.
  // Only our exact, fixed markers are exempt from opaque bracket detection.
  if (['[omitted: oversized field]', '[omitted: credential-shaped field]',
    '[unavailable error metadata]', '[cause depth limit]'].includes(result)) return result;
  if (/[\\%{}\[\]"]/u.test(result)
    || /&#(?:\d|x)/iu.test(result)
    || /\b(?:Bearer|Basic)\b/iu.test(result)
    || /(\b[a-z][a-z0-9+.-]*:\/\/)[^\s/?#]*@/iu.test(result)
    || /[?&][^\s=&#]+=/u.test(result)
    || /-----BEGIN [A-Z ]*PRIVATE KEY-----/iu.test(result)
    || /\b(?:[a-z0-9_-]*[_-])?(?:password|passwd|pwd|(?:access[_-]?|refresh[_-]?|id[_-]?)?token|api[_ -]?key|(?:secret[_-]?)?access[_-]?key(?:[_-]?id)?|secret|client[_-]?secret|credentials?|authorization|(?:set-)?cookie|private[_ -]?key|session[_-]?(?:id|key)|signature|sig)\b/iu.test(result)) {
    return '[omitted: credential-shaped field]';
  }
  if (Buffer.byteLength(result) > FIELD_LIMIT) {
    while (Buffer.byteLength(result) > FIELD_LIMIT - 3) result = result.slice(0, -1);
    result += '...';
  }
  return result;
}
function errorMetadata(value, depth = 0, seen = new Set(), budget = { remaining: 1536 }) {
  const cleanField = raw => {
    let clean = sanitizeDiagnostic(raw);
    if (clean === undefined || budget.remaining <= 0) return undefined;
    while (Buffer.byteLength(clean) > budget.remaining) clean = clean.slice(0, -1);
    budget.remaining -= Buffer.byteLength(clean);
    return clean;
  };
  if (typeof value === 'string') return { message: cleanField(value) };
  if (!safeRecord(value) || seen.has(value)) return { message: '[unavailable error metadata]' };
  seen.add(value);
  const result = {};
  for (const key of ['name', 'code', 'failureType', 'message']) {
    let raw = field(value, key);
    // Error.name normally lives on a native prototype; never invoke a getter.
    if (key === 'name' && raw === undefined && types.isNativeError(value)) {
      try {
        let proto = Object.getPrototypeOf(value);
        for (let i = 0; proto && i < 3 && raw === undefined; i++) {
          if (types.isProxy(proto)) break;
          const descriptor = Object.getOwnPropertyDescriptor(proto, key);
          raw = descriptor && own(descriptor, 'value') ? descriptor.value : undefined;
          proto = Object.getPrototypeOf(proto);
        }
      } catch { /* optional metadata */ }
    }
    const clean = cleanField(raw);
    if (clean !== undefined) result[key] = clean;
  }
  const cause = field(value, 'cause');
  if (cause !== undefined) result.cause = depth < 2
    ? errorMetadata(cause, depth + 1, seen, budget) : { message: '[cause depth limit]' };
  return result;
}
export function serializeEvent(event) {
  // Replace Error objects BEFORE JSON.stringify can discard non-enumerable
  // message/cause or call an error's toJSON. All other proof fields are unchanged.
  const copy = source => {
    // Avoid evaluating an enumerable error getter during the copy as well.
    const result = {};
    for (const key of Object.keys(source)) if (key !== 'error') result[key] = source[key];
    return result;
  };
  const result = { ...event, data: copy(event.data) };
  if (object(event.data?.details)) result.data.details = copy(event.data.details);
  for (const [source, target] of [[event.data, result.data], [event.data?.details, result.data.details]]) {
    if (object(source) && own(source, 'error')) target.error = errorMetadata(field(source, 'error'));
  }
  return result;
}
export function failedChildDiagnostics(events) {
  try {
    const result = [];
    for (const event of events) {
      const data = field(event, 'data');
      const details = field(data, 'details');
      const type = field(event, 'type');
      if (!safeRecord(data) || !['test:complete', 'test:fail'].includes(type)) continue;
      const hasError = [data, details].some(value => safeRecord(value) && own(value, 'error'));
      if (type !== 'test:fail' && !hasError) continue;
      const entry = {};
      for (const [key, raw] of [['file', field(data, 'file')], ['testName', field(data, 'name')], ['eventType', type]]) {
        const clean = sanitizeDiagnostic(raw);
        if (clean !== undefined) entry[key] = clean;
      }
      if (hasError) entry.error = errorMetadata(safeRecord(details) && own(details, 'error')
        ? field(details, 'error') : field(data, 'error'));
      if (Buffer.byteLength(JSON.stringify([...result, entry])) > DIAGNOSTIC_LIMIT) break;
      result.push(entry);
      if (result.length === 3) break;
    }
    return result;
  } catch { return []; } // Metadata failure must never replace the original verdict.
}

function inside(cwd, input) {
  check(text(input), 'invalid file path');
  const lexical = resolve(cwd, input);
  for (const path of [lexical, realpathSync(lexical)]) {
    const rel = relative(cwd, path);
    check(rel !== '..' && !rel.startsWith(`..${sep}`) && !isAbsolute(rel), 'path escapes cwd');
  }
  const file = realpathSync(lexical);
  check(statSync(file).isFile(), 'not a regular file');
  return file;
}

export function normalizeInventory({ cwd, cases, imports = [], timeoutMs = 30000 } = {}) {
  check(text(cwd) && isAbsolute(cwd), 'explicit absolute cwd required');
  cwd = realpathSync(cwd);
  check(statSync(cwd).isDirectory(), 'cwd must be a directory');
  check(Array.isArray(cases) && cases.length > 0, 'nonempty cases required');
  check(integer(timeoutMs) && timeoutMs > 0 && timeoutMs <= 300000, 'invalid timeoutMs');
  const files = new Map();
  for (const item of cases) {
    check(object(item) && text(item.name), 'invalid selector');
    const file = inside(cwd, item.file);
    const names = files.get(file) ?? [];
    check(!names.includes(item.name), `duplicate selector: ${file} / ${item.name}`);
    names.push(item.name);
    files.set(file, names);
  }
  check(Array.isArray(imports), 'imports must be an array');
  const declared = imports.map(specifier => {
    check(text(specifier), 'invalid import');
    if (specifier.startsWith('.') || isAbsolute(specifier)) return pathToFileURL(inside(cwd, specifier)).href;
    check(/^(?:@[a-zA-Z0-9_-]+\/)?[a-zA-Z0-9_-]+(?:\/[a-zA-Z0-9_.-]+)*$/.test(specifier)
      && !specifier.split('/').some(part => part === '.' || part === '..'), 'invalid package import');
    return specifier;
  });
  check(new Set(declared).size === declared.length, 'duplicate import');
  return { cwd, files, imports: declared, timeoutMs };
}

export function decodeTranscript(wire, file) {
  assertSupportedNode();
  check(typeof wire === 'string' && wire.endsWith('\n'), 'truncated event transport');
  const frames = wire.slice(0, -1).split('\n').map(line => JSON.parse(line));
  check(frames.length >= 3 && frames.every(object), 'malformed event transport');
  const first = frames.shift();
  const last = frames.pop();
  check(first.kind === 'begin' && first.protocol === PROTOCOL && first.file === file
    && first.node === process.version, 'invalid transport header');
  check(last.kind === 'end' && last.count === frames.length, 'missing/mismatched transport end');
  return frames.map((frame, index) => {
    check(frame.kind === 'event' && frame.seq === index, 'incomplete/duplicate event transport');
    return frame.event;
  });
}

async function collect(config, env, signal) {
  check(process.platform !== 'win32', 'POSIX process groups required');
  return new Promise((resolveResult, reject) => {
    const childEnv = { ...env };
    for (const key of ['NODE_OPTIONS', 'NODE_PATH', 'NODE_TEST_CONTEXT', 'NODE_V8_COVERAGE']) delete childEnv[key];
    const child = spawn(process.execPath, [SELF, '--selection-worker'], {
      cwd: config.cwd, env: childEnv, detached: true, stdio: ['pipe', 'pipe', 'pipe', 'pipe', 'pipe'],
    });
    let failure;
    let bytes = 0;
    let wire = '';
    let killed = false;
    const kill = () => {
      if (child.pid && !killed) {
        killed = true; // Never send a delayed second group signal after exit/reaping.
        try { process.kill(-child.pid, 'SIGKILL'); }
        catch (error) { if (error.code !== 'ESRCH') failure ??= error; }
      }
    };
    const cancel = () => {
      failure ??= new Error('selection cancelled', { cause: signal.reason });
      child.stdio[4].destroy(); // EOF is also the worker-side cancellation path.
      kill();
    };
    signal?.addEventListener('abort', cancel, { once: true });
    if (signal?.aborted) cancel();
    const timer = setTimeout(() => { failure = new Error('child timeout'); kill(); }, config.timeoutMs);
    child.stdio[4].on('error', error => { failure ??= error; kill(); });
    child.on('error', error => { failure = error; });
    child.stdin.on('error', error => { failure ??= error; kill(); });
    for (const [index, stream] of child.stdio.entries()) {
      if (index === 0 || index === 4) continue;
      stream.setEncoding('utf8');
      stream.on('error', error => { failure ??= error; kill(); });
      stream.on('data', chunk => {
        bytes += Buffer.byteLength(chunk);
        if (bytes > LIMIT) { failure ??= new Error('child output limit'); kill(); return; }
        if (index === 3) wire += chunk;
      });
    }
    child.on('close', (code, exitSignal) => {
      clearTimeout(timer);
      signal?.removeEventListener('abort', cancel);
      child.stdio[4].destroy();
      kill(); // Only this invocation's process group; terminate lingering fixture descendants.
      if (failure || code !== 0 || exitSignal) reject(failure ?? new Error(`child failed: code=${code} signal=${exitSignal}`));
      else {
        try { resolveResult(decodeTranscript(wire, config.file)); }
        catch (error) { reject(error); }
      }
    });
    child.stdin.end(JSON.stringify(config));
  });
}

export async function runSelectedTests(options) {
  assertSupportedNode();
  const inventory = normalizeInventory(options);
  const signal = options.signal;
  check(signal === undefined || signal instanceof AbortSignal, 'signal must be an AbortSignal');
  const cancelled = () => { if (signal?.aborted) throw new Error('selection cancelled', { cause: signal.reason }); };
  cancelled();
  const results = [];
  for (const [file, names] of inventory.files) {
    const config = { cwd: inventory.cwd, file, names, imports: inventory.imports, timeoutMs: inventory.timeoutMs };
    cancelled();
    const events = await collect(config, options.env ?? process.env, signal);
    cancelled();
    try { results.push(reconcileEvents(events, config)); }
    catch (error) {
      error.failedChildDiagnostics = failedChildDiagnostics(events);
      throw error; // Same rejection, with optional non-authoritative context only.
    }
  }
  return { selected: results.reduce((sum, result) => sum + result.selected, 0), files: results };
}

export function parseArgs(argv) {
  const options = { cases: [], imports: [] };
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i];
    if (flag === '--cwd') {
      check(!own(options, 'cwd') && text(argv[i + 1]) && !argv[i + 1].startsWith('--'), 'invalid/duplicate --cwd');
      // Manifest commands use '.' relative to the runner-selected package cwd.
      // The API still requires an explicit absolute root after CLI resolution.
      options.cwd = resolve(argv[++i]);
    } else if (flag === '--case') {
      check(text(argv[i + 1]) && text(argv[i + 2]) && !argv[i + 1].startsWith('--'), '--case requires file and exact name');
      options.cases.push({ file: argv[++i], name: argv[++i] });
    } else if (flag === '--import') {
      check(text(argv[i + 1]) && !argv[i + 1].startsWith('--'), '--import requires specifier');
      options.imports.push(argv[++i]);
    } else throw new Error(`unknown argument: ${flag}`);
  }
  check(own(options, 'cwd') && options.cases.length > 0, 'usage: --cwd /package [--import specifier] --case file exact-name [...]');
  return options;
}

export async function runCli(argv) {
  const controller = new AbortController();
  let exitCode;
  const handlers = ['SIGINT', 'SIGTERM'].map((name, index) => {
    const handler = () => {
      exitCode ??= index === 0 ? 130 : 143;
      controller.abort(new Error(name));
    };
    process.on(name, handler);
    return [name, handler];
  });
  try { return await runSelectedTests({ ...parseArgs(argv), signal: controller.signal }); }
  catch (error) { if (exitCode) error.exitCode = exitCode; throw error; }
  finally { for (const [name, handler] of handlers) process.off(name, handler); }
}

async function worker() {
  assertSupportedNode();
  // Only collect() launches this internal mode, in a new session/group. Never
  // target the adapter's group: it can include an unrelated harness/supervisor.
  const lifetime = new Socket({ fd: 4, readable: true, writable: false });
  const parentGone = () => process.kill(-process.pid, 'SIGKILL');
  lifetime.on('end', parentGone);
  lifetime.on('error', parentGone);
  lifetime.resume();
  try {
    const config = JSON.parse(readFileSync(0, 'utf8'));
    const send = frame => writeSync(3, JSON.stringify(frame) + '\n');
    send({ kind: 'begin', protocol: PROTOCOL, node: process.version, file: config.file });
    const { run } = await import('node:test');
    let seq = 0;
    // Do not use --eval: Node 26 can replay the controller eval in the test child.
    for await (const event of run({ files: [config.file], concurrency: 1, isolation: 'process',
      execArgv: config.imports.flatMap(specifier => ['--import', specifier]),
      testNamePatterns: [new RegExp(exactPattern(config.names))] })) {
      send({ kind: 'event', seq: seq++, event: serializeEvent(event) });
    }
    send({ kind: 'end', count: seq });
  } catch (error) {
    // Parent death can surface as EPIPE on fd 3 before fd 4's EOF callback.
    // Do not disarm the lifetime guard while leaving a running test group.
    parentGone();
    throw error;
  } finally {
    lifetime.removeListener('end', parentGone);
    lifetime.removeListener('error', parentGone);
    lifetime.destroy();
  }
}

if (process.argv[1] && resolve(process.argv[1]) === SELF) {
  try {
    if (process.argv.length === 3 && process.argv[2] === '--selection-worker') await worker();
    else console.log(JSON.stringify(await runCli(process.argv.slice(2))));
  } catch (error) {
    const message = sanitizeDiagnostic(field(error, 'message')) ?? 'unavailable error message';
    const diagnostics = error.failedChildDiagnostics;
    console.error(`selection proof failed: ${message}` + (diagnostics?.length
      ? `; failed-child metadata (non-authoritative): ${JSON.stringify(diagnostics)}` : ''));
    process.exitCode = error.exitCode ?? 1;
  }
}
