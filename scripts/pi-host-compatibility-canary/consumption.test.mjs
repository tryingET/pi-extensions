/** Builtins only. Run directly under each exact binary, in env -i HOME=... TMPDIR=... .
 * Children are the controlled test harness, NOT subprocess coverage of the API.
 * All fixtures, expected plans, stdout/stderr and summary receipts are retained.
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, writeFileSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const names = ['pi-coding-agent', 'pi-ai', 'pi-tui', 'pi-agent-core'].map(n => `@earendil-works/${n}`);
const base = mkdtempSync(join(tmpdir(), 'consumption-tests-'));
const fixture = fileURLToPath(new URL('./consumption-fixture.mjs', import.meta.url));
const results = [];
const reasons = {
  stale: /final loaded source mismatch/, 'importer-mismatch': /final loaded source mismatch/,
  'edge-importer-mismatch': /unapproved importing module/,
  'metadata-hash': /package.json hash mismatch/, 'metadata-identity': /package identity mismatch/,
  'version-absent': /invalid approved package version/, 'version-number': /invalid approved package version/,
  'version-empty': /invalid approved package version/,
  'resolve-only': /incomplete cold resolve\/load proof/, 'resolve-then-import': /ambiguous repeated resolve/,
  'warm-root': /incomplete cold resolve\/load proof/, 'warm-edge': /incomplete cold resolve\/load proof/,
  'duplicate-parent': /unapproved edge/, 'caught-rejection': /unapproved edge/,
  incomplete: /incomplete cold resolve\/load proof/, 'missing-edge': /exact four-package edge inventory/,
  'early-finalize': /finalize requires natural completion/, builtin: /unapproved edge/,
  'late-import': /unapproved edge/, 'eval-error': /root evaluation failed/,
  cjs: /CJS\/non-ESM load unsupported/, require: /CJS\/createRequire unsupported/,
  transformed: /final loaded source mismatch/, 'approval-hash': /invalid source approval/,
  'unknown-loader': /unsupported execution envelope/, 'unknown-version': /unsupported Node version/,
};
function put(path, bytes) { mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, bytes); }
function setup(scenario) {
  const dir = join(base, scenario);
  mkdirSync(dir);
  const app = join(dir, 'app');
  const root = join(app, 'entry.mjs');
  const edges = names.map((specifier, i) => {
    const packageRoot = join(app, 'node_modules', specifier);
    const source = `export const value = ${i + 1};\n`;
    const metadata = JSON.stringify({ name: specifier, version: '1.0.0', type: 'module', exports: './index.mjs' });
    put(join(packageRoot, 'package.json'), metadata);
    put(join(packageRoot, 'index.mjs'), source);
    return { importerURL: pathToFileURL(root).href, specifier, url: pathToFileURL(join(packageRoot, 'index.mjs')).href,
      packageRoot, packageJsonSha256: hash(metadata), version: '1.0.0', source, sourceSha256: hash(source) };
  });
  const imports = names.map((n, i) => `import { value as v${i} } from ${JSON.stringify(n)};`).join('\n');
  let source = `${imports}\nglobalThis.fixtureValues = [v0,v1,v2,v3];\n`;
  if (scenario === 'delayed') source = `await new Promise(r => setTimeout(r, 25));\n` +
    `globalThis.fixtureValues = [];\n` + names.map(n => `globalThis.fixtureValues.push((await import(${JSON.stringify(n)})).value);`).join('\n');
  if (scenario === 'detached-delayed') source = `globalThis.fixtureValues = [];\nsetTimeout(async () => {\n` +
    names.map(n => `globalThis.fixtureValues.push((await import(${JSON.stringify(n)})).value);`).join('\n') + `\n}, 25);\n`;
  if (scenario === 'resolve-only') source = names.map(n => `import.meta.resolve(${JSON.stringify(n)});`).join('\n');
  if (scenario === 'resolve-then-import') source = `import.meta.resolve(${JSON.stringify(names[0])});\n` +
    names.map(n => `await import(${JSON.stringify(n)});`).join('\n');
  if (scenario === 'duplicate-parent') {
    put(join(app, 'other.mjs'), `import ${JSON.stringify(names[0])};\n`);
    source = `${imports}\nawait import('./other.mjs');\n`;
  }
  if (scenario === 'incomplete') source = `import ${JSON.stringify(names[0])};\n`;
  if (scenario === 'caught-rejection') source = `try { await import('node:fs'); } catch {}\n${source}`;
  if (scenario === 'builtin') source = `import 'node:fs';\n${source}`;
  if (scenario === 'late-import') source += `setTimeout(() => import('node:fs').catch(() => {}), 25);\n`;
  if (scenario === 'eval-error') source += `throw new Error('fixture evaluation failure');\n`;
  const plan = { schema: 1, mode: 'cold-root-esm', loader: 'node-default', realm: 'root',
    mechanisms: [], importer: { url: pathToFileURL(root).href, source, sourceSha256: hash(source) }, edges };
  put(root, source);
  // Approved bytes above are literal fixture inputs, never hashes inferred from installed files.
  if (scenario === 'stale') put(fileURLToPath(edges[0].url), 'export const value = 99;\n');
  if (scenario === 'importer-mismatch') put(root, `${source}\n// unapproved importer bytes\n`);
  if (scenario === 'metadata-hash') put(join(edges[0].packageRoot, 'package.json'), '{"name":"changed","version":"1.0.0"}');
  if (scenario === 'metadata-identity') {
    const bytes = JSON.stringify({ name: 'wrong-name', version: '1.0.0', type: 'module', exports: './index.mjs' });
    plan.edges[0].packageJsonSha256 = hash(bytes);
    put(join(edges[0].packageRoot, 'package.json'), bytes);
  }
  if (scenario.startsWith('version-')) {
    const version = scenario === 'version-number' ? 1 : scenario === 'version-empty' ? '' : undefined;
    plan.edges[0].version = version;
    const bytes = JSON.stringify({ name: edges[0].specifier, version, type: 'module', exports: './index.mjs' });
    plan.edges[0].packageJsonSha256 = hash(bytes);
    put(join(edges[0].packageRoot, 'package.json'), bytes);
  }
  for (let i = 0; i < 4; i++) {
    if (scenario === `shadow-${i}` || scenario === `symlink-${i}` || scenario === `duplicate-${i}`) {
      const edge = edges[i];
      const alternative = join(dir, 'node_modules', edge.specifier);
      const metadata = JSON.stringify({ name: edge.specifier, version: '1.0.0', type: 'module', exports: './index.mjs' });
      if (scenario.startsWith('symlink')) {
        // Alias an otherwise approved root: lexical and real roots must both agree.
        mkdirSync(dirname(alternative), { recursive: true });
        symlinkSync(edge.packageRoot, alternative, 'dir');
        edge.packageRoot = alternative;
        edge.url = pathToFileURL(join(alternative, 'index.mjs')).href;
      } else {
        put(join(alternative, 'package.json'), metadata);
        put(join(alternative, 'index.mjs'), edge.source);
        if (scenario.startsWith('shadow')) {
          edge.packageRoot = alternative;
          edge.url = pathToFileURL(join(alternative, 'index.mjs')).href;
        }
      }
    }
  }
  if (scenario === 'cjs') {
    const edge = edges[0];
    edge.url = pathToFileURL(join(edge.packageRoot, 'index.cjs')).href;
    edge.source = 'module.exports = { value: 1 };\n'; edge.sourceSha256 = hash(edge.source);
    put(fileURLToPath(edge.url), edge.source);
    const metadata = JSON.stringify({ name: edge.specifier, version: '1.0.0', exports: './index.cjs' });
    put(join(edge.packageRoot, 'package.json'), metadata); edge.packageJsonSha256 = hash(metadata);
  }
  if (scenario.startsWith('unsupported-')) plan.mechanisms = [scenario.slice('unsupported-'.length)];
  if (scenario === 'unknown-loader') plan.loader = 'unknown';
  if (scenario === 'unknown-version') plan.nodeVersion = 'v22.22.3';
  if (scenario === 'edge-importer-mismatch') plan.edges[0].importerURL = 'file:///unapproved.mjs';
  if (scenario === 'missing-edge') plan.edges.pop();
  if (scenario === 'approval-hash') plan.edges[0].sourceSha256 = '0'.repeat(64);
  put(join(dir, 'plan.json'), JSON.stringify(plan, null, 2));
  return { dir, plan };
}
const positives = ['static', 'delayed', 'detached-delayed'];
const negatives = ['stale', 'importer-mismatch', 'edge-importer-mismatch', 'metadata-hash', 'metadata-identity',
  'version-absent', 'version-number', 'version-empty',
  ...Array.from({ length: 4 }, (_, i) => [`shadow-${i}`, `symlink-${i}`, `duplicate-${i}`]).flat(),
  'resolve-only', 'resolve-then-import', 'warm-root', 'warm-edge', 'duplicate-parent',
  'caught-rejection', 'incomplete', 'missing-edge', 'missing-finalize', 'early-finalize',
  'builtin', 'late-import', 'eval-error', 'cjs', 'require', 'transformed', 'approval-hash',
  'unsupported-worker', 'unsupported-subprocess', 'unsupported-native-addon', 'unsupported-vm',
  'unknown-loader', 'unknown-version'];
for (const scenario of [...positives, ...negatives]) {
  const { dir, plan } = setup(scenario);
  const child = spawnSync(process.execPath, [fixture, dir, scenario], {
    env: { HOME: process.env.HOME, TMPDIR: process.env.TMPDIR }, encoding: 'utf8', timeout: 10000,
  });
  put(join(dir, 'stdout.log'), child.stdout ?? ''); put(join(dir, 'stderr.log'), child.stderr ?? '');
  put(join(dir, 'execution.json'), JSON.stringify({ argv: [process.execPath, fixture, dir, scenario],
    status: child.status, signal: child.signal, error: child.error?.message }, null, 2));
  try {
    assert.equal(child.error, undefined); assert.equal(child.signal, null);
    const messages = child.stdout.trim().split('\n').filter(Boolean).map(s => JSON.parse(s));
    const proofs = messages.filter(m => m.proof);
    if (positives.includes(scenario)) {
      assert.equal(child.status, 0, child.stderr + child.stdout);
      assert.equal(proofs.length, 1, 'exactly one finalized proof required');
      const proof = proofs[0].proof;
      assert.equal(proof.capability, 'cold-root-esm-consumption-api');
      assert.equal(proof.nodeVersion, process.version);
      assert.equal(proof.complete, true);
      assert.deepEqual(proof.importer, { url: plan.importer.url, sourceSha256: plan.importer.sourceSha256 });
      const expected = plan.edges.map(({ importerURL, specifier, url, packageRoot, packageJsonSha256, sourceSha256 }) =>
        ({ importerURL, specifier, url, packageRoot, packageJsonSha256, sourceSha256 }));
      assert.deepEqual(proof.edges.toSorted((a,b) => a.specifier.localeCompare(b.specifier)),
        expected.toSorted((a,b) => a.specifier.localeCompare(b.specifier)));
      assert.deepEqual(proofs[0].evaluated, [1, 2, 3, 4]);
    } else {
      assert.equal(proofs.length, 0, 'a negative must never produce complete proof');
      if (scenario === 'missing-finalize') assert.equal(child.status, 0);
      else {
        assert.ok(messages.some(m => m.rejected), `explicit rejection required: ${child.stderr}`);
        const reason = reasons[scenario] ?? (scenario.startsWith('unsupported-')
          ? /unsupported execution envelope/ : /shadow\/duplicate package root|noncanonical\/symlink path/);
        assert.ok(messages.some(m => reason.test(m.rejected)), `wrong rejection: ${child.stdout}`);
        if (scenario === 'caught-rejection') assert.equal(child.status, 0, 'caught exit0 is intentionally NOT completion');
        else assert.notEqual(child.status, 0);
      }
    }
    results.push({ scenario, passed: true });
  } catch (error) { results.push({ scenario, passed: false, error: error.message }); }
}
const receipt = { version: process.version, base, results, passed: results.every(r => r.passed) };
put(join(base, 'receipt.json'), JSON.stringify(receipt, null, 2));
console.log(JSON.stringify(receipt, null, 2));
if (!receipt.passed) process.exitCode = 1;
