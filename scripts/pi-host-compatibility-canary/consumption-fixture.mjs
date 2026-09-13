/** Trusted, disposable ESM-only fixture harness; not a production runner. */
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire, registerHooks } from 'node:module';
import { startConsumption } from './consumption.mjs';

const [directory, scenario] = process.argv.slice(2);
const plan = JSON.parse(readFileSync(`${directory}/plan.json`, 'utf8'));
const importer = plan.importer.url;
// Warm modules are intentionally loaded before installing the monitor.
if (scenario === 'warm-root') await import(importer);
if (scenario === 'warm-edge') await import(plan.edges[0].url);
// Calibration-only injected transformer. It is NOT an approved loader mode.
// The negative establishes that checking disk bytes rather than load bytes fails.
if (scenario === 'transformed') registerHooks({ load(url, context, next) {
  const result = next(url, context);
  return url === plan.edges[0].url ? { ...result, source: 'export const value = 999;\n' } : result;
} });
let api;
try {
  api = startConsumption(plan);
  if (scenario === 'early-finalize') api.finalize();
  if (scenario === 'missing-finalize') { await api.run(); }
  else {
    process.once('beforeExit', () => {
      try {
        const proof = api.finalize();
        // Evaluation is a fixture-specific assertion, separate from source-load proof.
        assert.deepEqual(globalThis.fixtureValues, [1, 2, 3, 4]);
        console.log(JSON.stringify({ proof, evaluated: globalThis.fixtureValues }));
      } catch (error) {
        console.log(JSON.stringify({ rejected: error.message }));
        if (scenario !== 'caught-rejection') process.exitCode = 1;
      }
    });
    const run = api.run();
    if (scenario === 'require') {
      run.catch(() => {}); // The sticky hook failure may also reject the root import.
      createRequire(importer)(plan.edges[0].specifier);
    }
    await run;
  }
} catch (error) {
  console.log(JSON.stringify({ rejected: error.message }));
  if (scenario !== 'caught-rejection') process.exitCode = 1;
}
// Import plan/output are retained by the parent. No deletion or external service.
writeFileSync(`${directory}/harness-ended.json`, JSON.stringify({ scenario, version: process.version }));
