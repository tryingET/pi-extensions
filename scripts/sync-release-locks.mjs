#!/usr/bin/env node
// summary: Regenerate the lockfile of every tracked package whose lock no longer mirrors its package.json.
// read_when:
//   - "A release PR (or any manifest bump) leaves package.json and package-lock.json disagreeing."
//
// release-please's node-workspace plugin bumps versions and peer ranges in package.json and the
// matching installed-entry versions in package-lock.json, but not the lock's root copy of
// peerDependencies. Every local gate then refuses before running a test. This runs npm itself
// (lockfile only, no install scripts) for exactly the drifted packages, then checks again.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { registryLockIdentityIssues, validateAuthoredLocks } from './validate-package-installs.mjs';

const SCRIPT = fileURLToPath(import.meta.url);
const DEFAULT_ROOT = path.resolve(path.dirname(SCRIPT), '..');
export const NPM_LOCK_ONLY = ['install', '--package-lock-only', '--ignore-scripts', '--no-audit', '--no-fund'];

function runNpm(args, cwd) {
  const result = spawnSync('npm', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  if (result.status !== 0) throw new Error(`npm ${args.join(' ')} failed in ${cwd}: ${result.stderr || result.stdout}`);
}

/**
 * @param {string} [repoRoot]
 * @param {{run?: (args: string[], cwd: string) => void}} [options]
 * @returns {{synced: string[]; ok: boolean; remaining: Array<{package: string; message: string}>}}
 */
export function syncReleaseLocks(repoRoot = DEFAULT_ROOT, { run = runNpm } = {}) {
  const root = fs.realpathSync(repoRoot);
  const drifted = [...new Set(validateAuthoredLocks(root).issues.map((issue) => issue.package))];
  const originals = new Map();
  try {
    for (const label of drifted) {
      const cwd = path.join(root, label);
      const lockPath = path.join(cwd, 'package-lock.json');
      const bytes = fs.readFileSync(lockPath);
      originals.set(lockPath, bytes);
      const lock = JSON.parse(bytes);
      const invalidKeys = Object.entries(lock.packages)
        .filter(([key, entry]) => registryLockIdentityIssues({ packages: { [key]: entry } }).length)
        .map(([key]) => key);
      // npm otherwise trusts the misleading installed-entry version and preserves old bytes.
      // Evict the entire affected subtree; npm alone must supply replacement URL and SRI.
      if (invalidKeys.length) {
        for (const key of Object.keys(lock.packages)) {
          if (invalidKeys.some(invalid => key === invalid || key.startsWith(`${invalid}/`))) delete lock.packages[key];
        }
        fs.writeFileSync(lockPath, `${JSON.stringify(lock, null, 2)}\n`);
      }
      run(NPM_LOCK_ONLY, cwd);
      if (invalidKeys.length) {
        const regenerated = JSON.parse(fs.readFileSync(lockPath, 'utf8'));
        for (const key of invalidKeys) {
          if (!regenerated.packages?.[key]) throw new Error(`npm did not re-resolve ${label}: ${key}`);
        }
      }
    }
    const after = validateAuthoredLocks(root);
    if (!after.ok) for (const [file, bytes] of originals) fs.writeFileSync(file, bytes);
    return { synced: drifted, ok: after.ok, remaining: after.issues };
  } catch (error) {
    // An unpublished dependency must fail closed, not leave a fabricated or partial lock.
    for (const [file, bytes] of originals) fs.writeFileSync(file, bytes);
    throw error;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === SCRIPT) {
  try {
    const args = process.argv.slice(2);
    if (args.length && (args.length !== 2 || args[0] !== '--repo-root')) throw new Error('Usage: sync-release-locks.mjs [--repo-root PATH]');
    const result = syncReleaseLocks(path.resolve(args[1] ?? DEFAULT_ROOT));
    if (result.synced.length === 0) console.log('release-locks: every lock already mirrors its package.json');
    else console.log(`release-locks: regenerated ${result.synced.join(', ')}`);
    if (!result.ok) {
      console.error('release-locks: still disagreeing after npm regenerated them:');
      for (const issue of result.remaining) console.error(`- ${issue.package}: ${issue.message}`);
      process.exitCode = 1;
    }
  } catch (error) {
    console.error(`release-locks: ${error.message}`);
    process.exitCode = 1;
  }
}
