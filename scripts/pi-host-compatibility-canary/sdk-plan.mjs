// Private v2 plan: approval is a separately reviewed digest, never a discovered inventory.
import { createHash } from 'node:crypto';
import { lstatSync, readFileSync, realpathSync, readlinkSync } from 'node:fs';
import { isAbsolute, resolve, dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { inventoryDigest } from './sdk-inventory.mjs';
import { REQUIRED_HOST_ROLES } from './sdk-host.mjs';
export const sha = bytes => createHash('sha256').update(bytes).digest('hex');
export const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
export const need = (ok, message) => { if (!ok) throw new Error(`SDK plan: ${message}`); };
export const OWNERS = ['pi-coding-agent', 'pi-ai', 'pi-tui', 'pi-agent-core'].map(x => '@earendil-works/' + x);
export const SCHEMA = 'root-canary-sdk-integration-v2';
export const IMPLEMENTED = Object.freeze(['esm', 'dynamic-import', 'node-test-process', 'cjs', 'child_process', 'execFile', 'detached']);
export const TS_HOLD = Object.freeze(['tsx', 'native-ts', 'ts']);
export const REFUSED_MECHANISMS = Object.freeze(['worker', 'vm', 'native-addon', 'async-loader']);
export const CHILD_MECHANISMS = Object.freeze(['child_process', 'execFile', 'detached']);
export function freeze(value) {
  if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); }
  return value;
}
export function canonical(path) {
  need(typeof path === 'string' && isAbsolute(path) && resolve(path) === path &&
    realpathSync(path) === path, `noncanonical path ${path}`);
  return path;
}
export function urlPath(url) {
  const u = new URL(url);
  need(u.protocol === 'file:' && !u.search && !u.hash, 'only canonical file URLs');
  const path = canonical(fileURLToPath(u));
  need(pathToFileURL(path).href === url, 'noncanonical URL spelling');
  return path;
}
const hash = value => need(typeof value === 'string' && /^[a-f0-9]{64}$/.test(value), 'sha256 required');
export function verifyFiles(plan) {
  for (const row of plan.files) {
    canonical(row.path);
    const st = lstatSync(row.path);
    need(st.isFile() && (st.mode & 0o7777) === row.mode && st.size === row.bytes, `file metadata ${row.path}`);
    need(sha(readFileSync(row.path)) === row.sha256, `file digest ${row.path}`);
  }
  for (const row of plan.links) need(lstatSync(row.path).isSymbolicLink() &&
    readlinkSync(row.path) === row.target && realpathSync(row.path) === row.canonical, 'local link changed');
  for (const pkg of plan.packages) verifyPackage(plan, pkg.root);
  for (const realm of plan.realms ?? []) for (const edge of realm.edges) packageEdge(plan, edge);
}
export function verifyPackage(plan, root) {
  const pkg = plan.packages.find(p => p.root === root); need(pkg, 'unapproved module owner');
  canonical(root); const path = canonical(join(root, 'package.json'));
  const bytes = readFileSync(path);
  need(sha(bytes) === pkg.manifestSha256, 'package manifest changed during load');
  const m = JSON.parse(bytes);
  need(m.name === pkg.name && m.version === pkg.version, `package identity ${pkg.name}`);
}
export function packageEdge(plan, edge) {
  if (!edge.packageRoot || edge.specifier.startsWith('.') || edge.specifier.startsWith('file:')) return;
  const pkg = plan.packages.find(p => p.root === edge.packageRoot);
  need(pkg && (edge.specifier === pkg.name || edge.specifier.startsWith(pkg.name + '/')), 'package edge identity');
  let dir = dirname(fileURLToPath(edge.parent));
  const found = [];
  while (true) {
    const candidate = join(dir, 'node_modules', pkg.name);
    if (lstatSync(candidate, { throwIfNoEntry: false })) {
      if (realpathSync(candidate) !== candidate) need(plan.links.some(l => l.path === candidate &&
        l.canonical === pkg.root && readlinkSync(candidate) === l.target), 'unapproved local link');
      found.push(realpathSync(candidate));
    }
    const next = dirname(dir); if (next === dir) break; dir = next;
  }
  need(found.length === 1 && found[0] === pkg.root, `shadow/duplicate root ${pkg.name}`);
}
function validateMechanisms(p) {
  need(Array.isArray(p.mechanisms) && p.mechanisms.length > 0 &&
    new Set(p.mechanisms).size === p.mechanisms.length, 'mechanisms');
  for (const m of p.mechanisms) {
    need(!REFUSED_MECHANISMS.includes(m), `refused mechanism ${m}`);
    need(IMPLEMENTED.includes(m) || TS_HOLD.includes(m), `unknown mechanism ${m}`);
  }
  need(p.mechanisms.includes('esm') && p.mechanisms.includes('node-test-process'), 'selected-tests ESM process required');
  const child = p.mechanisms.some(m => CHILD_MECHANISMS.includes(m));
  need(Array.isArray(p.children) && p.children.length <= 32, 'children');
  need(child ? p.children.length > 0 : p.children.length === 0, 'child mechanism/receipt contract');
  for (const c of p.children) {
    need(typeof c.id === 'string' && c.id.length > 0 && Array.isArray(c.argv) && c.argv.length > 0, 'child argv');
    need(c.env && typeof c.env === 'object' && !Array.isArray(c.env), 'child env');
    need(isAbsolute(c.cwd) && isAbsolute(c.executable), 'child cwd/executable');
    hash(c.executableSha256);
  }
  if (p.mechanisms.some(m => TS_HOLD.includes(m))) {
    need(Array.isArray(p.loaderExecArgv) && p.loaderExecArgv.length > 0 &&
      p.loaderExecArgv.every(x => typeof x === 'string' && x.length > 0), 'exact loader execArgv required for TS/tsx');
  } else need(!p.loaderExecArgv, 'loader execArgv only with TS/tsx hold mechanism');
}
function validateOwners(p) {
  need(Array.isArray(p.campaignOwners) && p.campaignOwners.length > 0 &&
    new Set(p.campaignOwners).size === p.campaignOwners.length, 'campaign owners');
  need(Array.isArray(p.scenario.requiredOwners) &&
    new Set(p.scenario.requiredOwners).size === p.scenario.requiredOwners.length, 'scenario requiredOwners');
  for (const o of p.campaignOwners) need(OWNERS.includes(o), `campaign owner ${o}`);
  for (const o of p.scenario.requiredOwners) need(p.campaignOwners.includes(o), `requiredOwner not in campaign ${o}`);
}
function validateHostPins(p, files) {
  need(Array.isArray(p.hostPins) && p.hostPins.length === REQUIRED_HOST_ROLES.length, 'hostPins');
  const seen = new Set();
  for (const pin of p.hostPins) {
    need(REQUIRED_HOST_ROLES.includes(pin.role) && !seen.has(pin.role), 'host pin role');
    seen.add(pin.role);
    need(isAbsolute(pin.path) && isAbsolute(pin.resolved), 'host pin path');
    hash(pin.sha256);
    need(Number.isSafeInteger(pin.bytes) && pin.bytes >= 0 && Number.isInteger(pin.mode), 'host pin meta');
    need(Number.isInteger(pin.uid) && Number.isInteger(pin.gid), 'host pin ownership');
    need(files.has(pin.path) || files.has(pin.resolved), `host pin bytes ${pin.role}`);
  }
}
export function validatePlan(input) {
  const p = structuredClone(input);
  need(p.schema === SCHEMA && p.envelope === 'trusted-reviewed-readonly-source', 'schema/envelope');
  need(['v22.22.2', 'v26.8.1'].includes(p.nodeVersion), 'unqualified Node version');
  need(p.protocol === 'selected-tests-v1', 'protocol');
  validateMechanisms(p);
  need(p.uncertainties?.length === 0 && p.noResolveOnly === true, 'unresolved closure / resolve-only source');
  hash(p.sourceInventorySha256); hash(p.manifestSha256); hash(p.candidate?.indexSha256);
  need(p.candidate && typeof p.candidate.path === 'string' && /^\d+:\d+$/.test(p.candidate.identity) &&
    /^[a-f0-9]{40}$/.test(p.candidate.head), 'candidate binding');
  need(typeof p.review === 'string' && p.review.length > 0, 'independent approval reference');
  need(p.scenario && typeof p.scenario.id === 'string' && Array.isArray(p.scenario.command), 'scenario binding');
  validateOwners(p);
  need(Array.isArray(p.files) && p.files.length > 0 && p.files.length <= 8192 &&
    new Set(p.files.map(f => f.path)).size === p.files.length, 'bounded unique approved files');
  for (const f of p.files) {
    need(isAbsolute(f.path) && resolve(f.path) === f.path && !/[\x00-\x20]/.test(f.path), 'file spelling');
    need(!/^\/(proc|dev|work|canary-input)(\/|$)/.test(f.path) &&
      !/(^|\/)(\.git|\.ssh|\.gnupg|\.aws|\.env[^/]*|auth\.json|credentials[^/]*|[^/]*\.db)(\/|$)/.test(f.path), 'forbidden mount');
    hash(f.sha256);
    need(Number.isSafeInteger(f.bytes) && f.bytes >= 0 && f.bytes <= 256 * 1024 ** 2 &&
      Number.isInteger(f.mode) && !(f.mode & ~0o755), 'file size/mode');
  }
  need(inventoryDigest(p.files) === p.sourceInventorySha256, 'inventory digest mismatch');
  for (const c of p.children) need(p.files.some(f => f.path === c.executable && f.sha256 === c.executableSha256),
    'child executable bytes');
  need(Array.isArray(p.links) && p.links.length <= 128, 'link inventory');
  for (const l of p.links) need(isAbsolute(l.path) && !p.files.some(f => f.path === l.path) &&
    !p.links.some(x => x !== l && x.path === l.path) && typeof l.target === 'string' && isAbsolute(l.canonical), 'link binding');
  need(Array.isArray(p.packages) && p.packages.length > 0, 'approved package closure');
  const files = new Map(p.files.map(f => [f.path, f]));
  need(new Set(p.packages.map(x => x.root)).size === p.packages.length, 'duplicate package root');
  for (const pkg of p.packages) {
    const metadata = files.get(join(pkg.root, 'package.json'));
    need(metadata && metadata.sha256 === pkg.manifestSha256, 'approved manifest bytes');
    need(typeof pkg.name === 'string' && typeof pkg.version === 'string', 'package name/version');
  }
  for (const owner of OWNERS) need(p.packages.filter(x => x.name === owner && x.version === p.host.version).length === 1 &&
    p.packages.filter(x => x.name === owner).length === 1, `exact single SDK root ${owner}`);
  need(Array.isArray(p.realms) && p.realms.length > 0 && p.realms.length <= 32 &&
    new Set(p.realms.map(r => r.file)).size === p.realms.length, 'exact child inventory');
  const allowCjs = p.mechanisms.includes('cjs');
  const allowChild = p.mechanisms.some(m => CHILD_MECHANISMS.includes(m));
  const tsHold = p.mechanisms.some(m => TS_HOLD.includes(m));
  for (const realm of p.realms) {
    need(files.has(realm.file) && Array.isArray(realm.names) && realm.names.length > 0 &&
      new Set(realm.names).size === realm.names.length, 'body/file bindings');
    need(Array.isArray(realm.nodes) && realm.nodes.length > 0 && realm.nodes.length <= 4096, 'bounded module graph');
    need(new Set(realm.nodes.map(n => n.url)).size === realm.nodes.length, 'duplicate URL');
    for (const n of realm.nodes) {
      need(pathToFileURL(fileURLToPath(n.url)).href === n.url && !new URL(n.url).search && !new URL(n.url).hash,
        'canonical module URL spelling');
      const f = files.get(fileURLToPath(n.url));
      need(f, 'approved module file');
      const ts = /\.[cm]?tsx?$/.test(f.path);
      if (ts) {
        need(tsHold, 'TS path without TS/tsx mechanism');
        need(n.sourceSha256 !== f.sha256, 'raw TS equality is invalid');
        need(n.format === 'module' || (n.format === 'commonjs' && allowCjs), 'transformed TS format');
      } else {
        need(n.sourceSha256 === f.sha256, 'approved final bytes');
        need(n.format === 'module' || (n.format === 'commonjs' && allowCjs), 'approved final format');
      }
      need(p.packages.some(pkg => pkg.root === n.packageRoot && n.url.startsWith(pathToFileURL(pkg.root + '/').href)),
        'every module requires its approved canonical package owner/manifest');
    }
    need(Array.isArray(realm.edges) && realm.edges.length > 0 && realm.edges.length <= 16384, 'bounded edge graph');
    const keys = realm.edges.map(e => JSON.stringify([e.parent, e.specifier, e.conditions]));
    need(new Set(keys).size === keys.length, 'duplicate approved edge');
    for (const edge of realm.edges) {
      need(typeof edge.parent === 'string' && typeof edge.specifier === 'string' && Array.isArray(edge.conditions) &&
        same([...new Set(edge.conditions)].sort(), edge.conditions), 'exact sorted conditions');
      if (edge.url === 'node:child_process') need(allowChild, 'unmonitored child_process');
      if (edge.url === 'node:module') need(allowCjs, 'unmonitored createRequire');
      need(!['node:worker_threads', 'node:vm'].includes(edge.url), 'unmonitored mechanism');
      need(edge.url.startsWith('node:') || realm.nodes.some(n => n.url === edge.url), 'edge target');
      if (!edge.url.startsWith('node:')) need(realm.nodes.some(n => n.url === edge.url && n.packageRoot === edge.packageRoot),
        'every nonbuiltin edge requires its canonical package root/entrypoint');
    }
  }
  for (const path of [p.toolchain.node, p.toolchain.python, p.toolchain.bwrap, p.toolchain.unshare,
    p.helpers.supervisor, p.helpers.selection, p.helpers.preload, p.helpers.mounts, p.helpers.release]) {
    need(files.has(path), 'tool/helper byte approval');
  }
  need(p.toolchain.bwrap === '/usr/bin/bwrap' && p.toolchain.unshare === '/usr/bin/unshare', 'fixed host launcher');
  validateHostPins(p, files);
  need(p.limits && Number.isInteger(p.limits.wallSeconds) && p.limits.wallSeconds > 0 && p.limits.wallSeconds <= 300 &&
    Number.isInteger(p.limits.outputBytes) && p.limits.outputBytes >= 1024 && p.limits.outputBytes <= 8 * 1024 ** 2 &&
    Number.isInteger(p.limits.releaseMax) && p.limits.releaseMax >= 8 && p.limits.releaseMax <= 256,
    'bounded resource configuration');
  return freeze(p);
}
export function readPlan(path, digest) {
  hash(digest); canonical(path);
  need(lstatSync(path).size <= 8 * 1024 ** 2, 'plan byte bound');
  const raw = readFileSync(path); need(sha(raw) === digest, 'reviewed plan digest');
  const plan = validatePlan(JSON.parse(raw)); verifyFiles(plan);
  return Object.freeze({ plan, raw, digest });
}
export function requireSdkReadonlyTargets(entries, snapshotsMatch) {
  need(entries.every(e => e.alignment.aligned && e.nodeModulesBefore.kind === 'directory' &&
    snapshotsMatch(e.beforeSnapshot, e.restoreSnapshot)), 'v2 requires prealigned trees; npm restoration is not isolated');
}
