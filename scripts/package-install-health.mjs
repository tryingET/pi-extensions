#!/usr/bin/env node
// summary: Shared read-only install health for Git warnings and doctor; never repairs live installations.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validatePackageInstalls } from './validate-package-installs.mjs';

const SCRIPT = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(SCRIPT), '..');
const EVENTS = new Set(['post-checkout', 'post-merge', 'post-rewrite']);
const quote = text => `'${text.replaceAll("'", "'\\''")}'`;

export function packageInstallHealth(root = ROOT) {
  try { return validatePackageInstalls(root); }
  catch (error) {
    return { ok: false, packageCount: null, issues: [{ package: '.', message: `check unavailable: ${error.message}` }] };
  }
}
export function formatInstallHealth(result) {
  if (result.ok) return [`consistent (${result.packageCount} package(s); metadata/versions, not code integrity)`];
  const lines = ['stale/inconsistent installs or unavailable check; no installs/builds performed.'];
  for (const label of new Set(result.issues.map(issue => issue.package))) {
    const issues = result.issues.filter(issue => issue.package === label);
    lines.push(`- ${label}: ${issues.length} issue(s)`);
    for (const issue of issues.slice(0, 8)) lines.push(`  ${issue.message}`);
    if (issues.length > 8) lines.push(`  ... ${issues.length - 8} more`);
    lines.push(`  After reconciling authored locks and coordinating with live readers: npm ci --prefix ${quote(label)}`);
  }
  lines.push('Run repairs from this checkout with the pinned toolchain; npm ci removes node_modules and may rebuild dist.');
  lines.push('Reload/restart affected Pi sessions after an explicitly coordinated sync. See docs/project/pre-push-inputs.md.');
  return lines;
}
if (process.argv[1] && path.resolve(process.argv[1]) === SCRIPT) {
  const args = process.argv.slice(2);
  const hook = args.length === 2 && args[0] === '--hook' && EVENTS.has(args[1]);
  if (args.length && !hook) {
    console.error('Usage: package-install-health.mjs [--hook post-checkout|post-merge|post-rewrite]');
    process.exitCode = 2;
  } else {
    const result = packageInstallHealth();
    if (hook) {
      if (!result.ok) console.error(`package-install-health (${args[1]}): WARNING\n${formatInstallHealth(result).join('\n')}\nExisting drift may predate this Git operation; Git was not blocked.`);
    } else {
      console.log(`package-install-health: ${formatInstallHealth(result).join('\n')}`);
      process.exitCode = result.ok ? 0 : 1;
    }
  }
}
