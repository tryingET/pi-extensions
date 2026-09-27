#!/usr/bin/env node
// summary: Pre-commit guard for the canonical checkout, which live Pi sessions load extensions from: a staged package manifest or lock must be satisfied by this checkout's installs.
// Why (2026-09-27, AK6069): a TypeScript 7 bump reached this tree without its install and every Pi start
// failed for ~25 min. Design: softwareco/infra/workstation docs/project/2026-09-27-live-runtime-promotion-design.md.
// Linked worktrees are not the runtime and are exempt; drift in packages the commit does not touch is
// the warning-only post-hook's business (AK5790), not this guard's.
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validatePackageInstalls } from './validate-package-installs.mjs';

const SCRIPT = fileURLToPath(import.meta.url);
const MANIFEST = /^(?:(package\.json|package-lock\.json)|(packages\/[^/]+(?:\/[^/]+)?)\/(?:package\.json|package-lock\.json))$/;

function git(root, args) {
  const result = spawnSync('git', args, { cwd: root, encoding: 'utf8' });
  if (result.status !== 0) throw new Error(`git ${args.join(' ')}: ${result.stderr.trim()}`);
  return result.stdout.trim();
}

/** The canonical checkout is the main worktree: its git dir is the common dir. */
export function isCanonicalCheckout(root) {
  const gitDir = path.resolve(root, git(root, ['rev-parse', '--git-dir']));
  const common = path.resolve(root, git(root, ['rev-parse', '--git-common-dir']));
  return gitDir === common;
}

/** Package labels (as validatePackageInstalls names them) whose manifest or lock is staged. */
export function stagedPackages(root) {
  const staged = git(root, ['diff', '--cached', '--name-only', '--diff-filter=ACMR']).split('\n').filter(Boolean);
  const labels = new Set();
  for (const file of staged) {
    const match = MANIFEST.exec(file);
    if (match) labels.add(match[1] ? '.' : match[2]);
  }
  return labels;
}

export function commitInstallGuard(root) {
  if (!isCanonicalCheckout(root)) return { ok: true, skipped: 'linked worktree' };
  const packages = stagedPackages(root);
  if (packages.size === 0) return { ok: true, skipped: 'no staged package manifest or lock' };
  const { issues } = validatePackageInstalls(root);
  const relevant = issues.filter(issue => packages.has(issue.package));
  return { ok: relevant.length === 0, packages: [...packages].sort(), issues: relevant };
}

if (process.argv[1] && path.resolve(process.argv[1]) === SCRIPT) {
  const root = git(process.cwd(), ['rev-parse', '--show-toplevel']);
  let result;
  try { result = commitInstallGuard(root); }
  catch (error) { result = { ok: false, packages: [], issues: [{ package: '.', message: `guard unavailable: ${error.message}` }] }; }
  if (!result.ok) {
    console.error('commit-install-guard: this checkout is the live Pi runtime, and its installs do not satisfy the staged package manifest(s):');
    for (const issue of result.issues) console.error(`- ${issue.package}: ${issue.message}`);
    for (const pkg of new Set(result.issues.map(issue => issue.package))) {
      console.error(`  then: npm ci --prefix '${pkg}' (pinned toolchain, see docs/project/pre-push-inputs.md)`);
    }
    console.error('Or develop in a linked worktree and land with scripts/land-canonical.sh.');
    process.exitCode = 1;
  }
}
