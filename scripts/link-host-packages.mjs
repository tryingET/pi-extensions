#!/usr/bin/env node
// summary: Point the host-provided packages installed in the canonical checkout at the active Pi's own copies (AK6828).
// read_when:
//   - "Pi loads a second pi-coding-agent, pi-ai, pi-tui or typebox from a package's node_modules."
//   - "Changing how land-canonical.sh installs the live runtime."
//
// Pi maps the host-provided packages (docs/packages.md: pi-ai, pi-agent-core, pi-coding-agent, pi-tui,
// typebox) only for modules its loader transforms. Compiled ESM that one package imports from another
// (file: dependencies, dist/) loads natively, and Node resolves its host imports to the dev-installed copy
// in that package's node_modules: a second SDK, with its own classes and registries, in the same process.
// Linking each installed host package to the active Pi's copy gives every module the host's instance.
// Only physical installs of host packages are replaced; anything else in node_modules stays as npm left it.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { HOST_PACKAGES, trackedPackageDirs } from './validate-package-installs.mjs';

const SCRIPT = fileURLToPath(import.meta.url);
const DEFAULT_ROOT = path.resolve(path.dirname(SCRIPT), '..');
const read = file => JSON.parse(fs.readFileSync(file, 'utf8'));

function findInstalled(from, name) {
  for (let dir = from; ; dir = path.dirname(dir)) {
    const candidate = path.join(dir, 'node_modules', ...name.split('/'));
    if (fs.existsSync(path.join(candidate, 'package.json'))) return fs.realpathSync(candidate);
    if (path.dirname(dir) === dir) throw new Error(`the Pi host does not resolve ${name}`);
  }
}

/** The active Pi's package roots, found from its executable: the coding agent and what it resolves. */
export function hostPackageRoots(piBin) {
  let dir = path.dirname(fs.realpathSync(piBin));
  for (;;) {
    const manifest = path.join(dir, 'package.json');
    if (fs.existsSync(manifest) && read(manifest).name === '@earendil-works/pi-coding-agent') break;
    if (path.dirname(dir) === dir) throw new Error(`${piBin} is not a Pi coding agent executable`);
    dir = path.dirname(dir);
  }
  return Object.fromEntries(
    HOST_PACKAGES.map(name => [name, name === '@earendil-works/pi-coding-agent' ? dir : findInstalled(dir, name)]),
  );
}

/** Replace physical installs of host packages under every tracked package with links to the host's roots. */
export function linkHostPackages(repoRoot, roots) {
  const root = fs.realpathSync(repoRoot);
  const linked = [];
  for (const dir of trackedPackageDirs(root)) {
    for (const [name, target] of Object.entries(roots)) {
      const installed = path.join(dir, 'node_modules', ...name.split('/'));
      let stat;
      try { stat = fs.lstatSync(installed); } catch (error) { if (error.code === 'ENOENT') continue; throw error; }
      if (stat.isSymbolicLink()) {
        if (fs.realpathSync(installed) === target) continue;
      } else if (!stat.isDirectory()) continue;
      const before = stat.isSymbolicLink() ? 'link' : read(path.join(installed, 'package.json')).version;
      // Move the copy aside first: a directory cannot be replaced by a rename, and the path is never empty
      // for longer than one rename and one symlink.
      const aside = `${installed}.host-copy-${process.pid}`;
      fs.renameSync(installed, aside);
      fs.symlinkSync(target, installed, 'dir');
      fs.rmSync(aside, { recursive: true, force: true });
      linked.push({ package: path.relative(root, dir) || '.', name, before, host: read(path.join(target, 'package.json')).version });
    }
  }
  return linked;
}

function activePi() {
  if (process.env.PI_HOST_BIN !== undefined) return process.env.PI_HOST_BIN;
  try { return execFileSync('bash', ['-c', 'command -v pi'], { encoding: 'utf8' }).trim(); } catch { return ''; }
}

if (process.argv[1] && path.resolve(process.argv[1]) === SCRIPT) {
  const piBin = activePi();
  if (!piBin || !fs.existsSync(piBin)) {
    console.error('link-host-packages: no Pi executable found; host packages stay as installed');
  } else {
    const roots = hostPackageRoots(piBin);
    const linked = linkHostPackages(process.argv[2] ?? DEFAULT_ROOT, roots);
    console.error(`link-host-packages: ${linked.length} install(s) linked to ${roots['@earendil-works/pi-coding-agent']}`);
    for (const entry of linked) console.error(`  ${entry.package}: ${entry.name} ${entry.before} -> host ${entry.host}`);
  }
}
