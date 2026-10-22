#!/usr/bin/env node
// summary: Read-only admission for explicit sibling source-test prerequisites, separate from npm/release edges.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validatePackageInstalls } from './validate-package-installs.mjs';
import { trackedFiles } from './tracked-files.mjs';

const SCRIPT = fileURLToPath(import.meta.url);
const DEFAULT_ROOT = path.resolve(path.dirname(SCRIPT), '..');
const POLICY = 'policy/test-source-dependencies.json';
const inside = (root, target) => {
  const relative = path.relative(root, target);
  return relative === '' || (!relative.startsWith('../') && relative !== '..' && !path.isAbsolute(relative));
};

export function validateTestSourceDependencies({ repoRoot = DEFAULT_ROOT, packageRoot } = {}) {
  const root = fs.realpathSync(repoRoot);
  const consumer = fs.realpathSync(path.resolve(root, packageRoot));
  if (!inside(root, consumer)) throw new Error('consumer is outside the selected checkout');
  const policyPath = path.join(consumer, POLICY);
  let text;
  try { text = fs.readFileSync(policyPath, 'utf8'); }
  catch (error) {
    if (error.code === 'ENOENT') {
      if (trackedFiles(root).includes(policyPath)) throw new Error(`tracked ${POLICY} is missing`);
      return { ok: true, packageCount: 0, issues: [], consumer: path.relative(root, consumer) };
    }
    throw error;
  }
  if (!inside(root, fs.realpathSync(policyPath))) throw new Error('test-source policy is outside the selected checkout');
  const policy = JSON.parse(text);
  if (!policy || policy.version !== 1 || !Array.isArray(policy.packages)) throw new Error(`invalid ${POLICY}: expected version 1 and packages array`);
  const packages = new Set();
  for (const entry of policy.packages) {
    if (!entry || typeof entry.path !== 'string' || !entry.path.startsWith('packages/') ||
        entry.path.split('/').some(part => !part || part === '..' || part === '.') ||
        entry.path.includes('\\') || typeof entry.reason !== 'string' || !entry.reason.trim() || packages.has(entry.path)) {
      throw new Error(`invalid ${POLICY} entry: unique repo-relative package path and reason required`);
    }
    packages.add(entry.path);
  }
  const result = validatePackageInstalls(root, { packageRoots: [...packages] });
  return { ...result, consumer: path.relative(root, consumer) };
}

function main() {
  const args = process.argv.slice(2);
  let repoRoot = DEFAULT_ROOT, packageRoot;
  for (let index = 0; index < args.length; index += 2) {
    if (args[index] === '--repo-root' && args[index + 1]) repoRoot = args[index + 1];
    else if (args[index] === '--package' && args[index + 1]) packageRoot = args[index + 1];
    else throw new Error('Usage: validate-test-source-dependencies.mjs [--repo-root PATH] --package PATH');
  }
  if (!packageRoot) throw new Error('--package is required');
  const result = validateTestSourceDependencies({ repoRoot, packageRoot });
  if (result.ok) {
    console.log(`test-source-dependencies: ok (${result.packageCount} source package(s); locked installation metadata, not code integrity)`);
    return;
  }
  console.error('test-source-dependencies: missing/stale test prerequisites; read-only, no installs/builds/tests started');
  for (const owner of new Set(result.issues.map(issue => issue.package))) {
    console.error(`- ${result.consumer} -> ${owner}`);
    const issues = result.issues.filter(issue => issue.package === owner);
    for (const issue of issues.slice(0, 8)) console.error(`  ${issue.message}`);
    if (issues.some(issue => /outside|tracked package|explicitly selected/.test(issue.message))) {
      console.error('  Restore checkout-local tracked source paths and complete the explicit owner selection before installing.');
      continue;
    }
    // Shell-quoted display only: the checker never executes package or policy content.
    const quoted = `'${owner.replaceAll("'", "'\\''")}'`;
    console.error(`  After reconciling locks and coordinating readers, from this checkout: npm ci --prefix ${quoted}`);
  }
  process.exitCode = 1;
}
if (process.argv[1] && path.resolve(process.argv[1]) === SCRIPT) {
  try { main(); }
  catch (error) { console.error(`test-source-dependencies: ${error.message}`); process.exitCode = 1; }
}
