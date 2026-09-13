/**
 * AK5597 API CAPABILITY ONLY — not runner closure or full SDK qualification.
 *
 * Contract: trusted, fresh, default-loader root process on the two exact versions
 * below. One approved ESM importer, four distinct package leaf entrypoints, one
 * resolve AND one cold load per edge. No builtins/dependency graphs in the
 * monitored sources. Static imports and delayed dynamic imports are supported
 * only during this monitor's lifetime. A second resolve for a URL is ambiguous
 * (even from the same parent), and fails. There is no cache attribution.
 *
 * Approval is caller-supplied UTF-8 source + SHA256 and package.json SHA256 /
 * identity/version / canonical root / canonical entrypoint, NOT a disk scan
 * promoted into approval. The importer is itself cold-loaded and checked.
 * Synchronous load checks the final nextLoad source, returning the SAME result,
 * without replacing bytes. Only format=module is accepted. CJS/createRequire
 * are rejected: their separate caches and evaluation paths are not qualified.
 *
 * Harness prerequisites, NOT security claims: no existing/programmatic loaders,
 * no later hooks, immutable fixture tree, no worker/subprocess/native-addon/VM,
 * no out-of-band imports or explicit process.exit(), no adversarial approved
 * source or lifecycle listeners. Node provides no hook-registry introspection;
 * loader='node-default' is a trusted execution-envelope declaration, not proof
 * that unknown hooks do not exist. Flags/env loader entrypoints are rejected.
 * The calibration transformer negative does NOT qualify custom loaders.
 * No sandbox, containment, descendant-safe barrier, provenance or authenticity
 * claim. Global process APIs can bypass hooks; this cannot police hostile code.
 *
 * The controlled harness awaits run(), permits timers/imports to drain naturally,
 * then calls finalize() in its beforeExit listener (registered after start).
 * No receipt comes from exit status, resolve-only observations or run() alone.
 * Sticky rejection survives caught exceptions and prevents later finalize().
 * Finalization is an as-of-lifetime observation, not protection against future
 * scheduling or later beforeExit listeners. Never publish it from an uncontrolled
 * host. Missing finalize/proof must be rejected by the consumer even on exit 0.
 * Runner wiring, recovery, containment and approval provenance remain unresolved.
 */
import { createHash } from 'node:crypto';
import { lstatSync, readFileSync, realpathSync, statSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { registerHooks } from 'node:module';
import { isMainThread } from 'node:worker_threads';
import { fileURLToPath, pathToFileURL } from 'node:url';

const versions = new Set(['v22.22.2', 'v26.8.1']);
const identities = ['pi-coding-agent', 'pi-ai', 'pi-tui', 'pi-agent-core']
  .map(name => `@earendil-works/${name}`);
const digest = source => createHash('sha256').update(source).digest('hex');
let installed = false;

export function assertSupportedConsumptionVersion(version) {
  if (!versions.has(version)) throw new Error(`unsupported Node version: ${version}`);
}

/** Installs a single-use process-wide monitor. Do not reuse this realm. */
export function startConsumption(input) {
  // No fixture import or hook installation before version/envelope validation.
  assertSupportedConsumptionVersion(process.version);
  if (!isMainThread) throw new Error('unsupported non-root worker realm');
  if (input.nodeVersion !== undefined) {
    assertSupportedConsumptionVersion(input.nodeVersion);
    if (input.nodeVersion !== process.version) throw new Error('Node version mismatch');
  }
  if (installed) throw new Error('consumption monitor is single-use per realm');
  if (process.execArgv.length || process.env.NODE_OPTIONS || process.env.NODE_PATH)
    throw new Error('unsupported launch flags/environment');
  if (input.schema !== 1 || input.mode !== 'cold-root-esm' || input.realm !== 'root' ||
      input.loader !== 'node-default' || !Array.isArray(input.mechanisms) || input.mechanisms.length)
    throw new Error('unsupported execution envelope/mechanism/loader');
  // Copy prevents callers from changing approvals while the monitor is running.
  const plan = structuredClone(input);
  let rejection;
  let running = false;
  let runDone = false;
  let natural = false;
  let closed = false;
  const resolved = new Set();
  const loaded = new Map();
  const pending = new Map();
  const reject = message => {
    rejection ??= `consumption rejected: ${message}`;
    throw new Error(rejection);
  };
  const guard = operation => {
    if (rejection) throw new Error(rejection);
    try { return operation(); } catch (error) { return reject(error.message); }
  };
  function canonicalPath(path, directory) {
    if (typeof path !== 'string' || !isAbsolute(path) || resolve(path) !== path || realpathSync(path) !== path)
      reject(`noncanonical/symlink path: ${path}`);
    if (directory ? !statSync(path).isDirectory() : !statSync(path).isFile()) reject(`wrong path kind: ${path}`);
    return path;
  }
  function canonicalURL(url) {
    const parsed = new URL(url);
    if (parsed.protocol !== 'file:' || parsed.search || parsed.hash) reject(`noncanonical URL: ${url}`);
    const path = canonicalPath(fileURLToPath(parsed), false);
    if (pathToFileURL(path).href !== url) reject(`noncanonical URL spelling: ${url}`);
    return path;
  }
  function approvedSource(record) {
    if (typeof record.source !== 'string' || !/^[a-f0-9]{64}$/.test(record.sourceSha256) ||
        digest(record.source) !== record.sourceSha256) reject('invalid source approval hash/bytes');
  }
  function packageIdentity(edge) {
    if (typeof edge.version !== 'string' || !edge.version.trim() || edge.version.trim() !== edge.version)
      reject('invalid approved package version');
    canonicalPath(edge.packageRoot, true);
    const entry = canonicalURL(edge.url);
    const inside = relative(edge.packageRoot, entry);
    if (!inside || inside.startsWith('..') || isAbsolute(inside)) reject('entrypoint outside package root');
    const metadataPath = canonicalPath(join(edge.packageRoot, 'package.json'), false);
    const bytes = readFileSync(metadataPath);
    if (digest(bytes) !== edge.packageJsonSha256) reject(`package.json hash mismatch: ${edge.specifier}`);
    const metadata = JSON.parse(bytes);
    if (metadata.name !== edge.specifier || metadata.version !== edge.version) reject(`package identity mismatch: ${edge.specifier}`);
    // Reject aliases, local shadows and ancestor duplicates even with identical bytes.
    // Only the four bare package names are supported; no custom conditions/paths.
    const candidates = [];
    let parent = dirname(fileURLToPath(plan.importer.url));
    while (true) {
      const candidate = join(parent, 'node_modules', edge.specifier);
      if (lstatSync(candidate, { throwIfNoEntry: false })) {
        canonicalPath(candidate, true);
        candidates.push(candidate);
      }
      const next = dirname(parent);
      if (parent === next) break;
      parent = next;
    }
    if (candidates.length !== 1 || candidates[0] !== edge.packageRoot)
      reject(`shadow/duplicate package root: ${edge.specifier}`);
  }
  guard(() => {
    approvedSource(plan.importer);
    canonicalURL(plan.importer.url);
    if (!Array.isArray(plan.edges) || plan.edges.length !== 4 ||
        new Set(plan.edges.map(edge => edge.specifier)).size !== 4 ||
        identities.some(name => !plan.edges.some(edge => edge.specifier === name)))
      reject('exact four-package edge inventory required');
    const urls = new Set([plan.importer.url]);
    for (const edge of plan.edges) {
      if (edge.importerURL !== plan.importer.url) reject('unapproved importing module');
      if (urls.has(edge.url)) reject('ambiguous multiple-parent/duplicate target');
      urls.add(edge.url);
      approvedSource(edge);
      packageIdentity(edge);
    }
  });
  const bySpecifier = new Map(plan.edges.map(edge => [edge.specifier, edge]));
  installed = true;
  // Last registered hook is outermost. In the supported envelope next is Node's
  // default loader. Keep the hooks installed after finalization: do not silently
  // turn later imports into monitored observations or permit another run.
  registerHooks({
    resolve(specifier, context, nextResolve) {
      return guard(() => {
        if (!running || closed) reject('import outside monitored lifetime');
        if (context.conditions.includes('require')) reject('CJS/createRequire unsupported');
        if (Object.keys(context.importAttributes ?? {}).length) reject('import attributes unsupported');
        let record;
        if (specifier === plan.importer.url && context.parentURL === import.meta.url) record = plan.importer;
        else {
          if (context.parentURL !== plan.importer.url || !loaded.has(plan.importer.url))
            reject('unapproved importing module/ambiguous parent');
          record = bySpecifier.get(specifier);
          if (!record) reject(`unapproved edge/mechanism: ${specifier}`);
          packageIdentity(record);
        }
        if (resolved.has(record.url)) reject(`ambiguous repeated resolve/cache attribution: ${record.url}`);
        const result = nextResolve(specifier, context);
        canonicalURL(result.url);
        if (result.url !== record.url) reject(`resolved entrypoint mismatch: ${specifier}`);
        resolved.add(record.url);
        pending.set(record.url, record);
        return result;
      });
    },
    load(url, context, nextLoad) {
      return guard(() => {
        if (!running || closed) reject('load outside monitored lifetime');
        const record = pending.get(url);
        if (!record || loaded.has(url)) reject(`unattributed/non-cold load: ${url}`);
        canonicalURL(url);
        if (record !== plan.importer) packageIdentity(record);
        const result = nextLoad(url, context);
        if (result.format !== 'module') reject(`CJS/non-ESM load unsupported: ${result.format}`);
        if (typeof result.source !== 'string' && !(result.source instanceof Uint8Array))
          reject('unsupported final load source representation');
        const sourceSha256 = digest(result.source);
        if (sourceSha256 !== record.sourceSha256) reject(`final loaded source mismatch: ${url}`);
        loaded.set(url, sourceSha256);
        pending.delete(url);
        return result; // Deliberately return the exact object and source unchanged.
      });
    },
  });
  process.once('beforeExit', () => { natural = true; });
  return Object.freeze({
    async run() {
      return guard(() => {
        if (running || closed) reject('run is single-use');
        running = true;
        return import(plan.importer.url).then(
          () => { runDone = true; },
          error => { runDone = true; return reject(`root evaluation failed: ${error.message}`); },
        );
      });
    },
    finalize() {
      return guard(() => {
        if (closed) reject('already finalized');
        if (!natural || !runDone) reject('finalize requires natural completion in controlled harness');
        if (pending.size || loaded.size !== 5 || resolved.size !== 5 ||
            !loaded.has(plan.importer.url) || plan.edges.some(edge => !loaded.has(edge.url)))
          reject('incomplete cold resolve/load proof (warm cache or resolve-only is not consumption)');
        closed = true;
        return {
          capability: 'cold-root-esm-consumption-api', complete: true, nodeVersion: process.version,
          importer: { url: plan.importer.url, sourceSha256: loaded.get(plan.importer.url) },
          edges: plan.edges.map(edge => ({ importerURL: edge.importerURL, specifier: edge.specifier,
            url: edge.url, packageRoot: edge.packageRoot, packageJsonSha256: edge.packageJsonSha256,
            sourceSha256: loaded.get(edge.url) })),
          limits: ['trusted default-loader root realm', 'single importer/four unique cold ESM leaves',
            'no cache attribution or CJS/createRequire', 'no worker/subprocess/native-addon/VM/unknown loader',
            'monitored lifetime only; not a descendant-safe barrier', 'not a sandbox or SDK/runner qualification',
            'runner wiring/recovery/containment/approval provenance unresolved'],
        };
      });
    },
  });
}
