import fs from "node:fs";
import path from "node:path";
import { loadCurrentHostVersion } from "./host-contract.mjs";

function contained(root, target) {
  const relative = path.relative(root, target);
  if (relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new Error(`package path must stay within repository root: ${target}`);
  }
  return target;
}
function exists(name) {
  try { fs.lstatSync(name); return true; } catch (error) {
    if (error.code === "ENOENT") return false;
    throw error;
  }
}
function walk(dir, found) {
  if (!exists(dir)) return;
  if (fs.lstatSync(dir).isSymbolicLink()) throw new Error(`${dir}: symlink package directory`);
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name === "node_modules" || entry.name.startsWith(".")) continue;
    const next = path.join(dir, entry.name);
    const manifest = path.join(next, "package.json");
    if (exists(manifest)) found.push(manifest);
    walk(next, found);
  }
}
export function loadWorktree({ repoRoot, manifestPath, packageRoots }) {
  const expected = loadCurrentHostVersion(manifestPath);
  if (!packageRoots.length && !exists(repoRoot)) {
    throw new Error(`Pi host contract drift check found no package manifests under ${repoRoot}/packages; refusing to pass vacuously.`);
  }
  const root = fs.realpathSync(repoRoot);
  const found = [];
  if (packageRoots.length) {
    for (const declared of packageRoots) {
      const dir = contained(root, fs.realpathSync(contained(root, path.resolve(root, declared))));
      if (!fs.statSync(dir).isDirectory()) throw new Error(`not a package root: ${declared}`);
      const manifest = path.join(dir, "package.json");
      if (!exists(manifest)) throw new Error(`missing package.json at package root: ${declared}`);
      found.push(manifest);
    }
  } else walk(path.join(root, "packages"), found);
  return {
    source: { kind: "worktree", repoRoot: root, manifestPath },
    scope: { kind: packageRoots.length ? "explicit" : "fleet", reason: "worktree" },
    expected, offenders: [], skip: false,
    packageManifests: [...new Set(found.map(name => path.relative(root, name)))].sort(),
    exists: name => exists(path.join(root, name)),
    readJson(name) {
      const target = path.join(root, name);
      const stat = fs.lstatSync(target);
      if (stat.isSymbolicLink()) throw new Error(`${name}: symlink manifest/lock`);
      if (!stat.isFile()) throw new Error(`${name}: not a regular file`);
      contained(root, fs.realpathSync(target));
      return JSON.parse(fs.readFileSync(target, "utf8"));
    },
  };
}
