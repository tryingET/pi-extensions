#!/usr/bin/env node
// summary: Reuses a recorded pre-push PASS only for the exact same clean tree and gate inputs (AK6739).
// read_when:
//   - "A push printed 'reusing verification' or 'prepush verification cache: miss'."
//   - "Changing what the pre-push full check depends on (toolchain, gate scripts, behavior env)."
//
// usage: node scripts/prepush-verified-tree.mjs check --save <file>   exit 0 = reuse (prints the record), 1 = run the full check
//        node scripts/prepush-verified-tree.mjs record --from <file>  after a passing full check
// check saves the inputs it computed before the full check starts; record writes exactly those
// inputs, and only while HEAD's tree is unchanged and clean, so a record never names a state that
// the full check did not start from (e.g. untracked artifacts the check itself left behind).
//
// The key covers everything the full check reads that the tree does not: the tree sha itself, the
// untracked files (name, type and content), the Node and npm versions, the gate scripts, and the
// environment variables that switch gate behavior. A record is trusted only when it is a regular
// 0600 file owned by this user in a 0700 directory, parses, says "pass", and its inputs hash to its
// own name and equal the current inputs. Anything else is a miss, so a failure can never become a
// pass. Records live outside the repository, where a pushed commit cannot write them.
// PI_EXT_FULL_PREPUSH=1 always runs the full check.
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const SCHEMA = 'pi-extensions-prepush-verified-tree/v1';
const COMMAND = 'bash ./scripts/quality-gate.sh pre-push -> ./scripts/ci/full.sh';
const GATE_FILES = [
  '.githooks/pre-push', 'policy/ci-toolchain-lock.json', 'scripts/ci/full.sh', 'scripts/ci/packages.sh',
  'scripts/ci/smoke.sh', 'scripts/prepush-verified-tree.mjs', 'scripts/quality-gate.sh', 'scripts/select-gate-node.sh',
];
// Variables the gate scripts read to change what the full check does (not where it writes scratch).
const BEHAVIOR_ENV = /^PI_(SKIP_|FILE_BUDGET|HOST_COMPAT|GENERATION_|GATE_NODE_)/;

const sha256 = (data) => createHash('sha256').update(data).digest('hex');
const git = (root, ...args) => execFileSync('git', ['-C', root, ...args], { encoding: 'utf8', maxBuffer: 256 << 20 });

function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((k) => `${JSON.stringify(k)}:${canonical(value[k])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}
export const computeKey = (inputs) => sha256(canonical({ schema: SCHEMA, ...inputs }));

function fileDigest(file) {
  try {
    const info = fs.lstatSync(file);
    if (info.isSymbolicLink()) return `link:${fs.readlinkSync(file)}`;
    if (info.isFile()) return `file:${sha256(fs.readFileSync(file))}`;
    return `other:${info.mode}`;
  } catch {
    return 'absent';
  }
}

function untrackedDigest(root) {
  const names = git(root, 'ls-files', '--others', '--exclude-standard', '-z').split('\0').filter(Boolean).sort();
  return sha256(names.map((name) => `${name}\0${fileDigest(path.join(root, name))}\n`).join(''));
}

export function gateInputs(root, env = process.env) {
  const dirty = git(root, 'status', '--porcelain=v1', '--untracked-files=no').trim();
  if (dirty) return { clean: false, reason: 'the working tree has tracked changes' };
  const behavior = Object.fromEntries(Object.keys(env).filter((k) => BEHAVIOR_ENV.test(k)).sort().map((k) => [k, env[k]]));
  return {
    clean: true,
    key: {
      tree: git(root, 'rev-parse', 'HEAD^{tree}').trim(),
      untracked: untrackedDigest(root),
      node: process.version,
      platform: `${process.platform}-${process.arch}`,
      npm: execFileSync('npm', ['--version'], { encoding: 'utf8', env }).trim(),
      command: COMMAND,
      gate: Object.fromEntries(GATE_FILES.map((rel) => [rel, fileDigest(path.join(root, rel))])),
      env: behavior,
    },
  };
}

function storeDir(env) {
  const base = env.XDG_STATE_HOME || path.join(env.HOME || os.homedir(), '.local', 'state');
  return path.join(base, 'pi-extensions', 'verified-trees');
}
const privateOwned = (info, mask) => info.uid === process.getuid() && (info.mode & mask) === 0;

function readRecord(file, key, inputs) {
  const dir = fs.lstatSync(path.dirname(file));
  if (!dir.isDirectory() || !privateOwned(dir, 0o077)) return 'the record directory is not private to this user';
  const info = fs.lstatSync(file, { throwIfNoEntry: false });
  if (!info) return 'no recorded pass for these inputs';
  if (!info.isFile() || !privateOwned(info, 0o177)) return 'the record is not a private regular file';
  let record;
  try { record = JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return 'the record does not parse'; }
  if (record?.schema !== SCHEMA || record.result !== 'pass' || record.key !== key) return 'the record is not a pass for this key';
  if (computeKey(record.inputs ?? {}) !== key || canonical(record.inputs) !== canonical(inputs)) return 'the record inputs do not match';
  return null;
}

function check(root, env, save) {
  const inputs = gateInputs(root, env);
  if (!inputs.clean) return { reuse: false, reason: inputs.reason };
  if (save) fs.writeFileSync(save, `${JSON.stringify(inputs.key)}\n`, { mode: 0o600 });
  if (env.PI_EXT_FULL_PREPUSH === '1') return { reuse: false, reason: 'PI_EXT_FULL_PREPUSH=1' };
  const key = computeKey(inputs.key);
  const file = path.join(storeDir(env), `${key}.json`);
  if (!fs.existsSync(path.dirname(file))) return { reuse: false, reason: 'no recorded pass yet' };
  const problem = readRecord(file, key, inputs.key);
  return problem ? { reuse: false, reason: problem } : { reuse: true, file };
}

function record(root, env, from) {
  let started;
  try { started = JSON.parse(fs.readFileSync(from, 'utf8')); } catch { return { recorded: false, reason: 'no clean starting inputs were saved' }; }
  const now = gateInputs(root, env);
  if (!now.clean) return { recorded: false, reason: 'the full check left tracked changes' };
  if (now.key.tree !== started.tree) return { recorded: false, reason: 'HEAD moved during the full check' };
  const inputs = { key: started };
  const key = computeKey(inputs.key);
  const dir = storeDir(env);
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  fs.chmodSync(dir, 0o700);
  const body = {
    schema: SCHEMA, key, result: 'pass', exit_code: 0, inputs: inputs.key,
    head: git(root, 'rev-parse', 'HEAD').trim(), checkout: root, recorded_at: new Date().toISOString(),
  };
  const temp = path.join(dir, `.${key}.${process.pid}.tmp`);
  fs.writeFileSync(temp, `${JSON.stringify(body, null, 1)}\n`, { mode: 0o600, flag: 'wx' });
  fs.renameSync(temp, path.join(dir, `${key}.json`));
  return { recorded: true, file: path.join(dir, `${key}.json`) };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const root = git(process.cwd(), 'rev-parse', '--show-toplevel').trim();
  const mode = process.argv[2];
  try {
    const option = (name) => { const i = process.argv.indexOf(name); return i > 0 ? process.argv[i + 1] : undefined; };
    if (mode === 'check') {
      const result = check(root, process.env, option('--save'));
      if (result.reuse) {
        console.log(`prepush: reusing verification ${result.file} (same tree and gate inputs already passed)`);
        process.exit(0);
      }
      console.log(`prepush verification cache: miss (${result.reason}); running the full check`);
      process.exit(1);
    } else if (mode === 'record') {
      const result = record(root, process.env, option('--from'));
      console.log(result.recorded ? `prepush: recorded pass ${result.file}` : `prepush: pass not recorded (${result.reason})`);
    } else {
      console.error('usage: node scripts/prepush-verified-tree.mjs check|record');
      process.exit(2);
    }
  } catch (error) {
    // Never fail a push here: a broken cache only means the full check runs (check) or nothing is kept (record).
    console.log(`prepush verification cache: unavailable (${error.message})`);
    process.exit(mode === 'check' ? 1 : 0);
  }
}
