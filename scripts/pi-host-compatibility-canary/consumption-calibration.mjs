/** Node-only feasibility experiment, NOT an approved custom-loader mode.
 * Establishes synchronous LIFO hooks, final transformed ESM source, resolve-only
 * and warm-cache no-load behavior. CJS bytes being visible here does not qualify
 * CJS caches/evaluation; the consumption API deliberately rejects that mode.
 * Run directly with each exact binary and a synthetic HOME/TMPDIR in env -i.
 */
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createRequire, registerHooks } from 'node:module';
import { createHash } from 'node:crypto';

assert.ok(['v22.22.2', 'v26.8.1'].includes(process.version), 'uncalibrated Node');
const directory = mkdtempSync(join(tmpdir(), 'consumption-calibration-'));
const esm = pathToFileURL(join(directory, 'leaf.mjs')).href;
const cjs = pathToFileURL(join(directory, 'leaf.cjs')).href;
const original = 'export const value = 1;\n';
const transformed = 'export const value = 2;\n';
writeFileSync(new URL(esm), original);
writeFileSync(new URL(cjs), 'module.exports = 3;\n');
const events = [];
let finalResult;
registerHooks({
  resolve(specifier, context, next) {
    events.push({ hook: 'inner-resolve', specifier, parentURL: context.parentURL, conditions: context.conditions });
    return next(specifier, context);
  },
  load(url, context, next) {
    const result = next(url, context);
    events.push({ hook: 'inner-load', url, format: result.format, representation: result.source?.constructor.name });
    if (url === esm) {
      assert.ok(Buffer.isBuffer(result.source));
      assert.equal(result.source.toString(), original);
      finalResult = { ...result, source: transformed };
      return finalResult;
    }
    return result;
  },
});
registerHooks({
  resolve(specifier, context, next) {
    events.push({ hook: 'outer-resolve', specifier, parentURL: context.parentURL });
    return next(specifier, context);
  },
  load(url, context, next) {
    const result = next(url, context);
    events.push({ hook: 'outer-load', url, format: result.format, representation: result.source?.constructor.name,
      sha256: createHash('sha256').update(result.source).digest('hex') });
    if (url === esm) {
      // Node22 normalizes the returned metadata object; Node26 preserves it.
      // Both preserve the final source value. Do not conflate object and bytes.
      assert.equal(result === finalResult, process.version === 'v26.8.1');
      events.at(-1).sameInnerResultObject = result === finalResult;
      assert.equal(result.source, transformed);
    }
    return result;
  },
});
assert.equal(import.meta.resolve(esm), esm);
assert.equal(events.filter(e => e.hook.endsWith('-load')).length, 0, 'resolve is NOT consumption');
assert.equal((await import(esm)).value, 2, 'outer hook source is the ESM source evaluated');
assert.equal((await import(esm)).value, 2);
assert.equal(events.filter(e => e.hook === 'inner-load' && e.url === esm).length, 1, 'warm import has no cold load');
assert.equal(events.filter(e => e.hook === 'outer-resolve' && e.specifier === esm).length, 3);
assert.deepEqual(events.map(e => e.hook), ['outer-resolve', 'inner-resolve',
  'outer-resolve', 'inner-resolve', 'inner-load', 'outer-load', 'outer-resolve', 'inner-resolve']);
assert.equal(createRequire(import.meta.url)(new URL(cjs).pathname), 3);
assert.ok(events.some(e => e.hook === 'inner-resolve' && e.conditions.includes('require')));
assert.ok(events.some(e => e.url === cjs && e.hook === 'outer-load' && e.format === 'commonjs' && e.representation === 'String'));
const receipt = { capability: 'hook-ordering-calibration-only', version: process.version, directory, passed: true, events,
  conclusion: 'ESM final-source observation feasible in trusted outermost hook; resolve-only/warm cache not consumption; CJS not qualified' };
writeFileSync(join(directory, 'receipt.json'), JSON.stringify(receipt, null, 2));
console.log(JSON.stringify(receipt, null, 2));
