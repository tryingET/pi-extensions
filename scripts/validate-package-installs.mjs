#!/usr/bin/env node
// summary: Read-only tracked-package lock/installed-manifest consistency admission, not installed-code integrity proof.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { isDeepStrictEqual } from 'node:util';
import { trackedFiles } from './tracked-files.mjs';

const SCRIPT = fileURLToPath(import.meta.url);
const DEFAULT_ROOT = path.resolve(path.dirname(SCRIPT), '..');
const FIELDS = ['dependencies', 'devDependencies', 'optionalDependencies', 'peerDependencies'];
const read = file => JSON.parse(fs.readFileSync(file, 'utf8'));
// Pi supplies these to extensions (Pi docs/packages.md). land-canonical.sh links their installs to the
// active Pi's own copies (link-host-packages.mjs); a linked one belongs to the host, not to this lock.
export const HOST_PACKAGES = Object.freeze([
  '@earendil-works/pi-ai', '@earendil-works/pi-agent-core', '@earendil-works/pi-coding-agent', '@earendil-works/pi-tui', 'typebox',
]);
const inside = (root, target) => { const rel = path.relative(root, target); return rel === '' || (!rel.startsWith('../') && rel !== '..' && !path.isAbsolute(rel)); };

function requiredNames(entry, isRoot) {
  const required = new Set(Object.keys(entry.dependencies ?? {}));
  if (isRoot) for (const name of Object.keys(entry.devDependencies ?? {})) required.add(name);
  for (const name of Object.keys(entry.peerDependencies ?? {})) {
    if (!entry.peerDependenciesMeta?.[name]?.optional) required.add(name);
  }
  for (const name of Object.keys(entry.optionalDependencies ?? {})) required.delete(name);
  return required;
}
function checkRequiredGraph(lock, key, entry, report) {
  for (const name of requiredNames(entry, key === '')) {
    let scope = key, found = false;
    while (true) {
      if (Object.hasOwn(lock.packages, `${scope ? `${scope}/` : ''}node_modules/${name}`)) { found = true; break; }
      if (!scope) break;
      const parent = scope.lastIndexOf('/node_modules/');
      scope = parent === -1 ? '' : scope.slice(0, parent);
    }
    if (!found) report(`${key || 'root'}: required dependency ${name} missing from lock graph`);
  }
}
function absent(file) {
  try { fs.lstatSync(file); return false; }
  catch (error) { if (error.code === 'ENOENT') return true; throw error; }
}

/**
 * Differences between a package.json and its lock's root copy of it. These are authored-file
 * facts, independent of any install, so CI can check them without node_modules.
 */
export function authoredLockIssues(manifest, lock) {
  if (lock.lockfileVersion !== 3 || !lock.packages || !lock.packages['']) throw new Error('package-lock.json must be a v3 packages lock');
  return [...FIELDS, 'peerDependenciesMeta']
    .filter(field => !isDeepStrictEqual(manifest[field] ?? {}, lock.packages[''][field] ?? {}))
    .map(field => `package.json ${field} differs from package-lock.json; reconcile the authored lock before npm ci`);
}

// Match the owned install topology, not generated dist manifests or test fixtures.
function trackedManifests(root, tracked) {
  return [...tracked].filter(file => /^(?:package\.json|packages\/[^/]+\/(?:package\.json|[^/]+\/package\.json))$/.test(path.relative(root, file))).sort();
}

/** Directories of the tracked packages that install from a tracked lock. */
export function trackedPackageDirs(repoRoot = DEFAULT_ROOT) {
  const root = fs.realpathSync(repoRoot);
  const tracked = new Set(trackedFiles(root));
  return trackedManifests(root, tracked).map(file => path.dirname(file)).filter(dir => tracked.has(path.join(dir, 'package-lock.json')));
}

// The host package a lock key installs at or under, when that install is a link out of this repo.
function linkedHostPackage(root, dir, key) {
  const name = HOST_PACKAGES.find(host => key === `node_modules/${host}` || key.startsWith(`node_modules/${host}/`));
  if (!name) return undefined;
  const installed = path.join(dir, 'node_modules', ...name.split('/'));
  try {
    return fs.lstatSync(installed).isSymbolicLink() && !inside(root, fs.realpathSync(installed)) ? name : undefined;
  } catch { return undefined; }
}

/** Authored manifest/lock agreement for every tracked package; reads no node_modules. */
export function validateAuthoredLocks(repoRoot = DEFAULT_ROOT) {
  const root = fs.realpathSync(repoRoot);
  const tracked = new Set(trackedFiles(root));
  const issues = [];
  let packageCount = 0;
  for (const manifestPath of trackedManifests(root, tracked)) {
    const dir = path.dirname(manifestPath), label = path.relative(root, dir) || '.';
    const lockPath = path.join(dir, 'package-lock.json');
    if (!tracked.has(lockPath)) continue;
    packageCount++;
    for (const message of authoredLockIssues(read(manifestPath), read(lockPath))) issues.push({ package: label, message });
  }
  return { ok: issues.length === 0, packageCount, issues };
}

export function validatePackageInstalls(repoRoot = DEFAULT_ROOT) {
  const root = fs.realpathSync(repoRoot);
  const tracked = new Set(trackedFiles(root));
  const manifests = trackedManifests(root, tracked);
  const issues = [];
  let packageCount = 0;
  for (const manifestPath of manifests) {
    const dir = path.dirname(manifestPath), label = path.relative(root, dir) || '.';
    const report = text => issues.push({ package: label, message: text });
    try {
      const manifest = read(manifestPath), lockPath = path.join(dir, 'package-lock.json');
      const hasDeps = FIELDS.some(field => Object.keys(manifest[field] ?? {}).length);
      if (!tracked.has(lockPath)) {
        if (hasDeps) report('dependency-bearing package requires a tracked package-lock.json');
        continue;
      }
      packageCount++;
      const lock = read(lockPath);
      for (const message of authoredLockIssues(manifest, lock)) report(message);
      const hidden = read(path.join(dir, 'node_modules/.package-lock.json'));
      checkRequiredGraph(lock, '', lock.packages[''], report);
      if (hidden.lockfileVersion !== 3 || !hidden.packages) throw new Error('node_modules/.package-lock.json must be a v3 packages lock');
      for (const [key, expected] of Object.entries(lock.packages)) {
        // External file: target snapshots are not authority over that package's install.
        // Its own tracked lock is checked separately; link structure is checked below.
        if (!key.startsWith('node_modules/')) continue;
        if (key.split('/').some(part => part === '..' || part === '.') || key.includes('\\')) throw new Error(`invalid lock path: ${key}`);
        if (linkedHostPackage(root, dir, key)) continue;
        const installedPath = path.join(dir, key);
        // npm records a linked dependency's optional flag on its target snapshot.
        const optional = expected.optional || (expected.link && lock.packages[expected.resolved]?.optional);
        if (optional && absent(installedPath)) continue;
        if (expected.link) {
          const target = path.resolve(dir, expected.resolved);
          if (!inside(root, target) || !inside(root, fs.realpathSync(target))) report(`${key}: link target is outside this repo`);
          else if (fs.realpathSync(installedPath) !== fs.realpathSync(target)) report(`${key}: installed link differs from locked target ${expected.resolved}`);
          continue;
        }
        let actual;
        try { actual = read(path.join(installedPath, 'package.json')); }
        catch (error) {
          // npm may omit optional dependencies on unsupported platforms or installation failure.
          // An existing but unreadable/malformed package is not an optional absence.
          report(`${key}: installed package missing/unreadable (${error.message})`);
          continue;
        }
        const expectedName = expected.name ?? key.split('node_modules/').at(-1);
        checkRequiredGraph(lock, key, expected, report);
        if (actual.name !== expectedName) report(`${key}: name ${actual.name}; expected ${expectedName}`);
        if (actual.version !== expected.version) report(`${key}: installed ${actual.version}; expected ${expected.version}`);
        const metadata = hidden.packages[key];
        if (!metadata) report(`${key}: missing installed lock metadata`);
        else for (const field of ['version', 'resolved', 'integrity']) {
          if (expected[field] !== metadata[field]) report(`${key}: installed lock ${field} differs from package-lock.json`);
        }
      }
      for (const key of Object.keys(hidden.packages)) {
        if (key.startsWith('node_modules/') && !Object.hasOwn(lock.packages, key)) report(`${key}: installed lock entry absent from package-lock.json`);
      }
    } catch (error) { report(error.message); }
  }
  return { ok: issues.length === 0, packageCount, issues };
}
if (process.argv[1] && path.resolve(process.argv[1]) === SCRIPT) {
  try {
    const args = process.argv.slice(2);
    const authoredOnly = args[0] === '--authored-only';
    if (authoredOnly) args.shift();
    if (args.length && (args.length !== 2 || args[0] !== '--repo-root')) throw new Error('Usage: validate-package-installs.mjs [--authored-only] [--repo-root PATH]');
    const repoRoot = path.resolve(args[1] ?? DEFAULT_ROOT);
    const result = authoredOnly ? validateAuthoredLocks(repoRoot) : validatePackageInstalls(repoRoot);
    if (result.ok) console.log(authoredOnly
      ? `package-locks: ok (${result.packageCount} package(s); every lock mirrors its package.json)`
      : `package-installs: ok (${result.packageCount} package(s); lock metadata and installed versions, not code integrity)`);
    else {
      console.error(authoredOnly
        ? 'package-locks: package.json and package-lock.json disagree:'
        : 'package-installs: stale/inconsistent installs; no tests/builds started:');
      for (const label of new Set(result.issues.map(issue => issue.package))) {
        const selected = result.issues.filter(issue => issue.package === label);
        console.error(`- ${label}: ${selected.length} issue(s)`);
        for (const issue of selected.slice(0, 8)) console.error(`  ${issue.message}`);
        if (selected.length > 8) console.error(`  ... ${selected.length - 8} more`);
        console.error(authoredOnly
          ? `  Repair: npm install --package-lock-only --ignore-scripts --prefix ${JSON.stringify(label)}`
          : `  Repair after coordinating with live sessions: npm ci --prefix ${JSON.stringify(label)}`);
      }
      process.exitCode = 1;
    }
  } catch (error) { console.error(`package-installs: ${error.message}`); process.exitCode = 1; }
}
