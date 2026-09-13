// Real post-process reconciliation -> byte recheck -> exclusive durable evidence.
// No clearance or cleanup here. A failed publication may already be visible.
import { writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fsyncFile, fsyncDirectory } from './state-files.mjs';
import { sha, need, verifyFiles, same } from './sdk-plan.mjs';
import { reconcileGraphReceipts } from './sdk-receipts.mjs';
import { isSdkExecution } from './sdk-execution.mjs';
export function reconcileSdkCompletion(execution, expected, session) {
  need(isSdkExecution(expected), 'unbound execution plan');
  const c = execution.sdkCompletion;
  need(c && c.input === expected && c.binding.runId === session.payload.runId &&
    c.binding.scenario === session.payload.scenarioId &&
    same(session.payload.child?.identity, c.binding.supervisorIdentity), 'exact journal/receipt supervisor binding');
  const proof = reconcileGraphReceipts(c.input.plan, c.binding, c.settlement, c.wires);
  return { proof, c };
}
// The narrow durability parameter is for persistence-fault regressions only.
export function publishSdkCompletion(reconciled, execution, durability = { file: fsyncFile, directory: fsyncDirectory }) {
  const { proof, c } = reconciled;
  verifyFiles(c.input.plan); // all source, transitive metadata, local links and toolchain, not package arrays only
  const path = join(c.evidenceDirectory, `${c.binding.runId}.${c.binding.attempt}.sdk-completion.json`);
  const output = c.output ?? { stdoutBase64: Buffer.from(execution.stdout).toString('base64'),
    stderrBase64: Buffer.from(execution.stderr).toString('base64') };
  const raw = JSON.stringify({ proof, settlement: c.settlement, receipts: c.wires, output,
    exitCode: execution.exitCode, stdoutSha256: sha(Buffer.from(output.stdoutBase64, 'base64')),
    stderrSha256: sha(Buffer.from(output.stderrBase64, 'base64')) }) + '\n';
  writeFileSync(path, raw, { flag: 'wx', mode: 0o600 });
  durability.file(path); durability.directory(c.evidenceDirectory);
  need(sha(readFileSync(path)) === sha(raw), 'durable evidence readback');
  return { path, sha256: sha(raw), planSha256: c.binding.planSha256 };
}
