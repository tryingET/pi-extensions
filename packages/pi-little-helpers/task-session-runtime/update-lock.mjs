#!/usr/bin/env node
// summary: Regenerate task-session-runtime/runtime.lock from the tracked package lock as a reviewed step.
// read_when:
//   - "Moving the task-session SDK, or refreshing the third-party closure the installer pins."
//
//   node task-session-runtime/update-lock.mjs
//
// This is the only place the closure is resolved. The installer never resolves anything: it installs
// what this wrote and a person committed. Seeding from the tracked lock keeps versions the package
// already tests against, except where `overrides` in runtime-package.json moves one on purpose; npm
// drops what the runtime does not need and adds what it does.
import { execFileSync } from "node:child_process";
import { copyFileSync, mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  assertLayerOneLock,
  assertOverridesCurrent,
  assertRuntimeManifest,
  isolatedNpm,
  LOCK_DIR,
  nodeRefusal,
  ownClosure,
  refuse,
  seedLockForRuntime,
} from "./closure.mjs";

const entries = (lock) =>
  new Map(
    Object.entries(lock.packages)
      .filter(([path]) => path !== "")
      .map(([path, entry]) => [path, entry.version]),
  );
const read = (path) => JSON.parse(readFileSync(path, "utf8"));
// Resolution depends on the npm client: npm 10 kept the seed's file-dependency entries (AK8895).
// Hold the generator to the same pinned toolchain as the installer, before anything resolves.
const toolchain = read(join(LOCK_DIR, "../../../policy/ci-toolchain-lock.json"));
const toolchainRefusal = nodeRefusal({
  pinned: toolchain.nodeVersion,
  running: process.versions.node,
  onPath: execFileSync("node", ["--version"], { encoding: "utf8" }).trim(),
  pinnedNpm: toolchain.npmVersion,
  npm: execFileSync("npm", ["--version"], { encoding: "utf8" }).trim(),
});
if (toolchainRefusal) refuse(toolchainRefusal.replace(/^install_/u, "update_lock_"));
// Refuse an alias, range or path before npm resolves anything over the network.
assertRuntimeManifest(read(join(LOCK_DIR, "runtime-package.json")));
// The published lock gets the mode a checkout writes, whatever the caller's umask.
process.umask(0o022);
const scratch = mkdtempSync(join(tmpdir(), "task-session-lock-"));
const temporary = join(LOCK_DIR, `.runtime.lock.${process.pid}.tmp`);
try {
  copyFileSync(join(LOCK_DIR, "runtime-package.json"), join(scratch, "package.json"));
  writeFileSync(
    join(scratch, "package-lock.json"),
    JSON.stringify(seedLockForRuntime(read(join(LOCK_DIR, "../package-lock.json"))), null, 2),
  );
  const npm = isolatedNpm(
    ["install", "--package-lock-only", "--ignore-scripts", "--no-audit", "--no-fund"],
    { online: true },
  );
  execFileSync("npm", npm.args, {
    cwd: scratch,
    env: npm.env,
    stdio: ["ignore", "pipe", "inherit"],
  });
  const next = read(join(scratch, "package-lock.json"));
  assertLayerOneLock(next);
  const own = ownClosure(join(LOCK_DIR, "../..")).map(({ name, manifest }) => [name, manifest]);
  assertOverridesCurrent(next, read(join(LOCK_DIR, "runtime-package.json")), own);
  const before = entries(read(join(LOCK_DIR, "runtime.lock")));
  const after = entries(next);
  // Published by rename, so an interrupted write leaves the reviewed lock whole.
  copyFileSync(join(scratch, "package-lock.json"), temporary);
  renameSync(temporary, join(LOCK_DIR, "runtime.lock"));
  const changes = [...new Set([...before.keys(), ...after.keys()])]
    .filter((path) => before.get(path) !== after.get(path))
    .map((path) => `${path}: ${before.get(path) ?? "absent"} -> ${after.get(path) ?? "absent"}`);
  process.stdout.write(`${JSON.stringify({ packages: after.size, changes }, null, 2)}\n`);
} finally {
  rmSync(temporary, { force: true });
  rmSync(scratch, { recursive: true, force: true });
}
