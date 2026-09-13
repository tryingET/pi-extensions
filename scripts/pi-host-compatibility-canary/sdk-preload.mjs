// Only installed via each node:test child's explicit execArgv; never NODE_OPTIONS.
import { openSync, writeSync, fsyncSync, readFileSync, readlinkSync } from 'node:fs';
import { registerHooks } from 'node:module';
import { isMainThread } from 'node:worker_threads';
import { realpathSync } from 'node:fs';
import { sha, need, readPlan, TS_HOLD } from './sdk-plan.mjs';
import { graphState } from './sdk-graph.mjs';
const rawContext = readFileSync('/canary-input/context.json');
const context = JSON.parse(rawContext);
const { plan, digest } = readPlan('/canary-input/plan.json', context.planSha256);
need(process.env.PI_CANARY_SDK_CONTEXT === sha(rawContext), 'context digest');
need(process.version === plan.nodeVersion && isMainThread && !process.env.NODE_OPTIONS && !process.env.NODE_PATH,
  'fresh supported process realm');
need(!plan.mechanisms.some(m => TS_HOLD.includes(m)), 'tsx/native-ts transform monitor not implemented; remaining HOLD');
const file = realpathSync(process.argv[1]);
const realm = plan.realms.find(r => r.file === file); need(realm, 'unexpected test child');
need(process.execArgv.filter(x => x === '--import').length === 1 &&
  process.execArgv.includes(plan.helpers.preload), 'unexpected preload chain');
const stat = readFileSync('/proc/self/stat', 'utf8');
const incarnation = { pid: process.pid, start: stat.slice(stat.lastIndexOf(')') + 2).split(' ')[19],
  namespace: readlinkSync('/proc/self/ns/pid') };
const fd = openSync('/work/receipts/' + sha(file) + '.jsonl', 'wx', 0o600);
let seq = 0;
const emit = event => {
  const bytes = Buffer.from(JSON.stringify({ ...event, seq: seq++ }) + '\n');
  let off = 0; while (off < bytes.length) off += writeSync(fd, bytes, off, bytes.length - off);
  if (event.kind === 'deny' || event.kind === 'end') fsyncSync(fd);
};
emit({ kind: 'begin', planSha256: digest, runId: context.runId, attempt: context.attempt,
  scenario: context.scenario, file, incarnation, node: process.version });
const state = graphState(plan, realm, emit);
registerHooks({ resolve: state.resolve, load: state.load });
const explicitExit = process.exit.bind(process);
process.exit = code => {
  try { state.end(false); } finally { explicitExit(code); }
};
let natural = false;
process.on('beforeExit', () => { natural = true; });
process.on('exit', () => {
  try { emit(state.end(natural)); }
  catch { process.exitCode = 125; }
});
