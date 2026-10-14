// Runs the real installed JS seam with an injected deterministic spawner; no Pi/LLM launch.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

export function verifyInstalledAscExecution(consumerRoot) {
  assert(process.env.TMPDIR, 'Owned TMPDIR required for installed execution proof');
  const sessions = fs.mkdtempSync(path.join(process.env.TMPDIR, 'asc-candidate-execution-'));
  try {
    const output = execFileSync(process.execPath, ['--input-type=module', '-e', `
      import assert from 'node:assert/strict';
      import { createRequire } from 'node:module';
      const require = createRequire(process.argv[1]);
      const seam = require('@tryinget/pi-autonomous-session-control/execution');
      let calls = 0;
      const runtime = seam.createAscExecutionRuntime({
        sessionsDir: process.argv[2], modelProvider: () => 'test/model',
        customSpawnerCapacityOwnership: 'parent_owned',
        spawner: async () => { calls++; return { output: 'retained artifact execution', exitCode: 0, elapsed: 1, status: 'done' }; },
      });
      const result = await runtime.execute({ profile: 'reviewer', objective: 'Retained candidate dispatch proof' },
        { cwd: process.argv[3], sessionKey: 'candidate-artifact-proof' });
      assert.equal(calls, 1);
      assert.equal(result.ok, true);
      assert.equal(result.details.status, 'done');
      assert.equal(seam.getDispatchSubagentDisplayOutput(result), 'retained artifact execution');
      const observation = seam.projectAscExecutionResult(result, { producer: 'dispatch_subagent', cwd: process.argv[3],
        group: { id: 'candidate-artifact-proof', kind: 'dispatch', label: 'Candidate qualification' } });
      assert.equal(observation.schema, 'asc.execution_observation.v1');
      assert.equal(observation.terminal.ok, true);
      assert.equal(observation.terminal.status, 'done');
      assert.equal(runtime.state.activeCount, 0);
      console.log('Installed artifact dispatch/observation execution passed (deterministic injected spawner; no model call).');
    `, path.join(consumerRoot, 'package.json'), sessions, consumerRoot], {
      encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 4 * 1024 * 1024,
    });
    process.stdout.write(output);
  } finally { fs.rmSync(sessions, { recursive: true, force: true }); }
}
