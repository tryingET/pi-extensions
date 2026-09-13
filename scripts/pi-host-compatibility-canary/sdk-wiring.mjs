// Exact node:test child monitor wiring, independent of stripped NODE_OPTIONS.
import { readFileSync } from 'node:fs';
import { readPlan, sha, same, need, TS_HOLD } from './sdk-plan.mjs';
export function selectedExecArgv(config, contextDigest = process.env.PI_CANARY_SDK_CONTEXT) {
  if (!contextDigest) return config.imports.flatMap(specifier => ['--import', specifier]);
  const raw = readFileSync('/canary-input/context.json');
  need(sha(raw) === contextDigest, 'selection context digest');
  const context = JSON.parse(raw);
  const { plan } = readPlan('/canary-input/plan.json', context.planSha256);
  const realm = plan.realms.find(r => r.file === config.file);
  need(realm && same(realm.names, config.names), 'per-child exact selection');
  need(!plan.mechanisms.some(m => TS_HOLD.includes(m)), 'tsx/native-ts transform monitor not implemented; remaining HOLD');
  need(config.imports.length === 0, 'loader imports require implemented transform monitor');
  return ['--import', plan.helpers.preload];
}
