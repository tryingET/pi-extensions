// ---
// summary: "Verifies selected package inventory, hashes, generated-output bounds, entrypoint containment, and read-only modes."
// read_when:
//   - "Changing package materialization or provenance reconstruction checks."
// ---
import { lstat, readFile, realpath, readdir } from "node:fs/promises";
import path from "node:path";
import { fail, isWithin, lstatMaybe, sha256, walk } from "./common.mjs";

export async function verifyReadOnlyTree(root) {
  async function visit(directory) {
    const directoryInfo = await lstat(directory);
    if (!directoryInfo.isDirectory() || directoryInfo.isSymbolicLink() || (directoryInfo.mode & 0o222) !== 0) {
      fail(`published directory is not read-only: ${directory}`);
    }
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const target = path.join(directory, entry.name);
      if (entry.isDirectory()) await visit(target);
      else if (!entry.isSymbolicLink()) {
        const info = await lstat(target);
        if (!info.isFile() || (info.mode & 0o222) !== 0) fail(`published file is not read-only: ${target}`);
      }
    }
  }
  await visit(root);
}

export async function verifyPackageInventory(repoDir, plan, { allowNodeModules = true, requireReadOnly = false } = {}) {
  const packageDir = path.join(repoDir, plan.selection.packageRoot);
  const packageInfo = await lstat(packageDir).catch(() => null);
  if (!packageInfo?.isDirectory() || packageInfo.isSymbolicLink()) fail("selected package directory is missing or is a symlink");
  const nodeModules = await lstatMaybe(path.join(packageDir, "node_modules"));
  if (!allowNodeModules && nodeModules) fail("node_modules must be absent for a no-install generation");
  const canonicalRepo = await realpath(repoDir);
  const canonicalPackage = await realpath(packageDir);
  if (!isWithin(canonicalRepo, canonicalPackage)) fail("selected package escapes the generation repository");

  const expected = new Map(plan.selection.packageFiles.map((item) => [item.path.slice(`${plan.selection.packageRoot}/`.length), item]));
  const observed = await walk(packageDir, {
    skip(relative, entry) {
      return allowNodeModules && relative === "node_modules" && entry.isDirectory();
    },
  });
  const seen = new Set();
  for (const item of observed) {
    const expectation = expected.get(item.relative);
    if (!expectation) fail(`unexpected generated package output: ${item.relative}`);
    if (!item.entry.isFile() || item.entry.isSymbolicLink()) fail(`tracked package input is not a regular file: ${item.relative}`);
    const actualDigest = sha256(await readFile(item.absolute));
    if (actualDigest !== expectation.sha256) fail(`tracked package input hash mismatch: ${item.relative}`);
    const info = await lstat(item.absolute);
    if (requireReadOnly && (info.mode & 0o222) !== 0) fail(`published package input has write bits: ${item.relative}`);
    const executable = (info.mode & 0o111) !== 0;
    if (executable !== (expectation.mode === "100755")) fail(`tracked package input mode mismatch: ${item.relative}`);
    seen.add(item.relative);
  }
  for (const relative of expected.keys()) if (!seen.has(relative)) fail(`tracked package input is missing: ${relative}`);

  const entrypoints = [];
  for (const entrypoint of plan.selection.entrypoints) {
    const absolute = path.join(repoDir, entrypoint.path);
    const info = await lstat(absolute).catch(() => null);
    if (!info?.isFile() || info.isSymbolicLink()) fail(`extension entrypoint is not a regular file: ${entrypoint.path}`);
    if (requireReadOnly && (info.mode & 0o222) !== 0) fail(`extension entrypoint has write bits: ${entrypoint.path}`);
    const canonicalEntrypoint = await realpath(absolute);
    if (!isWithin(canonicalPackage, canonicalEntrypoint)) fail(`extension entrypoint escapes selected package: ${entrypoint.path}`);
    const digest = sha256(await readFile(absolute));
    if (digest !== entrypoint.sha256) fail(`extension entrypoint hash mismatch: ${entrypoint.path}`);
    entrypoints.push({ ...entrypoint, absolutePath: absolute, baseDir: packageDir });
  }
  return { packageDir, packageDigest: plan.selection.packageDigest, entrypoints };
}
