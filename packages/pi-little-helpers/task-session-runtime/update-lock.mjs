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
import { copyFileSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  assertLayerOneLock,
  assertOverridesCurrent,
  assertRuntimeManifest,
  LOCK_DIR,
} from "./closure.mjs";

const entries = (lock) =>
  new Map(
    Object.entries(lock.packages)
      .filter(([path]) => path !== "")
      .map(([path, entry]) => [path, entry.version]),
  );
const read = (path) => JSON.parse(readFileSync(path, "utf8"));
// Refuse an alias, range or path before npm resolves anything over the network.
assertRuntimeManifest(read(join(LOCK_DIR, "runtime-package.json")));
const scratch = mkdtempSync(join(tmpdir(), "task-session-lock-"));
try {
  copyFileSync(join(LOCK_DIR, "runtime-package.json"), join(scratch, "package.json"));
  copyFileSync(join(LOCK_DIR, "../package-lock.json"), join(scratch, "package-lock.json"));
  execFileSync(
    "npm",
    ["install", "--package-lock-only", "--ignore-scripts", "--no-audit", "--no-fund"],
    { cwd: scratch, stdio: ["ignore", "pipe", "inherit"] },
  );
  const next = read(join(scratch, "package-lock.json"));
  assertLayerOneLock(next);
  assertOverridesCurrent(next, read(join(LOCK_DIR, "runtime-package.json")));
  const before = entries(read(join(LOCK_DIR, "runtime.lock")));
  const after = entries(next);
  copyFileSync(join(scratch, "package-lock.json"), join(LOCK_DIR, "runtime.lock"));
  const changes = [...new Set([...before.keys(), ...after.keys()])]
    .filter((path) => before.get(path) !== after.get(path))
    .map((path) => `${path}: ${before.get(path) ?? "absent"} -> ${after.get(path) ?? "absent"}`);
  process.stdout.write(`${JSON.stringify({ packages: after.size, changes }, null, 2)}\n`);
} finally {
  rmSync(scratch, { recursive: true, force: true });
}
