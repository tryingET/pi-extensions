#!/usr/bin/env node
// Install the Decision 151 Pi task-session host from a clean linked worktree (AK5480, AK7845).
//
//   node scripts/task-session-install.mjs --root DIR --bin-dir DIR [--allow-dirty]
//                                         [--cache DIR] [--no-fetch] [--lock-dir DIR]
//
// Lays out <root>/runtime/<host build digest>-<closure digest>/ in two layers: third-party and SDK
// packages from the committed task-session-runtime/runtime.lock, then own tarballs packed at this
// commit (SDK 1.4.0, --omit=dev, --ignore-scripts). One locked fetch fills a private npm cache;
// packing and installing then run with the network unshared. Finally it replaces the fixed launchers
// <root>/host-v1 and <root>/view-v1 and <bin-dir>/pi-task-session. Defaults: ~/.local/libexec/pi-task-sessions
// and ~/.local/bin. Replacing the default host is an AK D151 rebinding: pass both directories otherwise.
//
// --cache keeps the private cache in DIR; --no-fetch requires it to be complete already, so a missing
// tarball fails the install. The lock gives reproducibility, not trust: see task-session-runtime/README.md.
//
// Installation is not enrollment: nothing runs the host until AK publishes a task_session
// policy section and the owner publishes producer.json (AK6744). Earlier runtimes are kept;
// roll back by installing again from the earlier commit. Prints one JSON receipt.
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  chmodSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  assertLayerOneLock,
  assertOverridesCurrent,
  assertPackEnvironment,
  assertRuntimeManifest,
  fetchLockedClosure,
  GIT_ENV,
  headMismatches,
  installClosure,
  LOCK_DIR,
  ownClosure,
  packOwn,
  readLock,
  readRuntimeManifest,
  refuse,
  SDK_VERSION,
  treeDigest,
  verifyInstalled,
  writeClosureRecord,
} from "../task-session-runtime/closure.mjs";

const pkg = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
function option(name, fallback) {
  const at = args.indexOf(name);
  if (at === -1) return fallback;
  const value = args[at + 1];
  if (!value || value.startsWith("--")) throw new Error(`${name} needs a value`);
  args.splice(at, 2);
  return resolve(value);
}
function flag(name) {
  const at = args.indexOf(name);
  if (at !== -1) args.splice(at, 1);
  return at !== -1;
}
const root = option("--root");
const binDir = option("--bin-dir");
const sharedCache = option("--cache");
const lockDir = option("--lock-dir", LOCK_DIR);
const allowDirty = flag("--allow-dirty");
const noFetch = flag("--no-fetch");
if (args.length) throw new Error(`unknown arguments: ${args}`);
if (noFetch && !sharedCache) throw new Error("--no-fetch needs --cache");
// Each defaulted to a live path once: passing only --root still replaced the live CLI.
if (!root || !binDir) refuse("install_paths_required", "pass both --root and --bin-dir");
// Files this run writes, prepack's restored package.json among them, get the modes a checkout has.
process.umask(0o022);

const run = (cmd, argv, cwd) =>
  execFileSync(cmd, argv, {
    cwd,
    env: GIT_ENV,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
const sha256 = (path) => createHash("sha256").update(readFileSync(path)).digest("hex");
// Launchers name this exact Node, checked against the toolchain pin, so moving the pin needs a reinstall.
const node = process.execPath;
const shellQuote = (value) => `'${value.replaceAll("'", "'\\''")}'`;

assertPackEnvironment(pkg);
const repo = run("git", ["rev-parse", "--show-toplevel"], pkg).trim();

// Refuse a bad lock before anything is fetched or packed.
const lock = readLock(lockDir);
assertLayerOneLock(lock);
const runtimeManifest = readRuntimeManifest(lockDir);
assertRuntimeManifest(runtimeManifest);

// Installed artifacts come from committed source, never from a dirty tree (D151 rollout G1).
const closure = ownClosure(dirname(pkg));
assertOverridesCurrent(
  lock,
  runtimeManifest,
  closure.map(({ name, manifest }) => [name, manifest]),
);
const commit = run("git", ["rev-parse", "HEAD"], repo).trim();
// The closure holds this package's lock and scripts; prepack also runs pi-interaction's shared script.
const sourcePaths = [
  ...closure.map(({ dir }) => relative(repo, dir)),
  relative(repo, join(dirname(pkg), "pi-interaction/scripts")),
];
const sourceStatus = () => run("git", ["status", "--porcelain", "--", ...sourcePaths], repo).trim();
const lockOutsideCommit = resolve(lockDir) !== resolve(LOCK_DIR) ? `lock from ${lockDir}` : "";
// Status trusts the index; an edit hidden by --assume-unchanged or --skip-worktree only shows in the bytes.
const differsFromHead = () =>
  headMismatches(repo, sourcePaths).map((path) => `differs from HEAD: ${path}`);
const dirty = [sourceStatus(), lockOutsideCommit, ...differsFromHead()].filter(Boolean).join("\n");
if (dirty && !allowDirty) throw new Error(`source not clean; commit first:\n${dirty}`);

mkdirSync(join(root, "runtime"), { recursive: true, mode: 0o755 });
const staging = mkdtempSync(join(root, "runtime", ".staging-"));
const work = mkdtempSync(join(root, "runtime", ".work-"));
// Where a replaced tree was set aside; never deleted, even if that is the staging path.
let damaged = null;
try {
  const cache = sharedCache ?? join(work, "cache");
  mkdirSync(cache, { recursive: true, mode: 0o700 });
  if (!noFetch) fetchLockedClosure({ lockDir, directory: work, cache });

  const packed = packOwn(closure, staging, cache);
  const installed = installClosure({ lockDir, staging, cache, packed });
  const verified = verifyInstalled(installed, lock, packed);
  // prepack must leave nothing behind, or the tarballs are not what the commit says.
  if (!dirty) {
    const after = [sourceStatus(), ...differsFromHead()].filter(Boolean).join("\n");
    if (after) throw new Error(`packing dirtied the source:\n${after}`);
  }
  if (run("git", ["rev-parse", "HEAD"], repo).trim() !== commit)
    refuse("source_moved_during_install", commit);

  // The host checks both itself at every start; check them before anything points here.
  const hostBuild = (directory) => {
    const dist = join(directory, "node_modules/@tryinget/pi-little-helpers/dist/task-session");
    return run(
      node,
      [
        "--input-type=module",
        "-e",
        `import { installedHostBuild } from ${JSON.stringify(join(dist, "build-identity.js"))};
         import { assertSdkIdentity } from ${JSON.stringify(join(dist, "identity.js"))};
         assertSdkIdentity(); process.stdout.write(installedHostBuild());`,
      ],
      directory,
    ).trim();
  };
  const buildDigest = hostBuild(staging);
  if (!/^[0-9a-f]{64}$/.test(buildDigest)) throw new Error("host build digest unavailable");
  // What reuse compares against: the bytes this install puts on disk, after the last code ran here.
  const tree = treeDigest(join(staging, "node_modules"));

  // The build digest covers only pi-little-helpers dist/task-session, so the closure must key the
  // directory too: a dependency-only change gets its own runtime instead of being dropped (AK7824).
  const record = {
    schema: "pi.task-session.closure.v1",
    commit,
    dirty: Boolean(dirty),
    sdk: SDK_VERSION,
    lock_sha256: sha256(join(lockDir, "runtime.lock")),
    closure_digest: verified.digest,
    tree_sha256: tree,
    packages: verified.packages,
    own: packed.map(({ name, version, integrity }) => ({ name, version, integrity })),
  };
  const runtime = join(root, "runtime", `${buildDigest}-${verified.digest.slice(0, 16)}`);
  // Reuse only the exact tree this install built, checked on disk, not from recorded digests (F2).
  const present = (() => {
    try {
      return Boolean(lstatSync(runtime));
    } catch {
      return false;
    }
  })();
  let reused = false;
  if (present) {
    let kept;
    try {
      kept = JSON.parse(readFileSync(join(runtime, "closure.json"), "utf8"));
    } catch {}
    // Same directory name, other closure: a key collision, and that runtime is someone else's.
    if (kept?.closure_digest && kept.closure_digest !== verified.digest)
      refuse("runtime_closure_mismatch", runtime);
    const onDisk = (() => {
      try {
        return treeDigest(join(runtime, "node_modules"));
      } catch {
        return null;
      }
    })();
    const hostIntact = () => {
      try {
        return hostBuild(runtime) === buildDigest;
      } catch {
        return false;
      }
    };
    reused = Boolean(kept) && onDisk === tree && hostIntact();
  }
  if (!reused) {
    writeClosureRecord(staging, record);
    if (!present) renameSync(staging, runtime);
    else {
      // One RENAME_EXCHANGE: whatever points at the key sees the damaged tree or the verified one, never
      // neither, and the key stays where the next install of this closure looks.
      try {
        run("exch", ["--", staging, runtime]);
      } catch (error) {
        // If the runtime already holds the verified tree, the swap happened and staging holds the old
        // one: keep it, and say where.
        const swapped = (() => {
          try {
            return treeDigest(join(runtime, "node_modules")) === tree;
          } catch {
            return false;
          }
        })();
        if (swapped) damaged = staging;
        const detail = String(error.stderr || error.message).trim();
        refuse(
          "runtime_exchange_failed",
          swapped ? `${detail}; old tree kept at ${staging}` : detail,
        );
      }
      // Set aside, never deleted. If even the rename fails, it stays at the staging path, kept.
      damaged = `${runtime}.damaged-${Date.now()}`;
      try {
        renameSync(staging, damaged);
      } catch {
        damaged = staging;
      }
    }
  }
  const entry = join(runtime, "node_modules/@tryinget/pi-little-helpers/dist/task-session");

  const launcher = (path, script, passArgs) => {
    const temporary = `${path}.${process.pid}.tmp`;
    writeFileSync(
      temporary,
      `#!/bin/sh\n# Decision 151 Pi task-session ${script}, build ${buildDigest}, ${commit}\n` +
        `exec ${shellQuote(node)} ${shellQuote(join(entry, script))}${passArgs ? ' "$@"' : ""}\n`,
      { mode: 0o755 },
    );
    chmodSync(temporary, 0o755);
    renameSync(temporary, path);
    return sha256(path);
  };
  mkdirSync(binDir, { recursive: true });
  const receipt = {
    schema: "pi.task-session.install.v2",
    commit,
    dirty: Boolean(dirty),
    sdk: SDK_VERSION,
    node: { version: process.versions.node, path: node },
    runtime,
    reused,
    replaced_damaged_runtime: damaged,
    host_build_digest: buildDigest,
    closure_digest: verified.digest,
    lock_sha256: record.lock_sha256,
    packages: verified.packages,
    host: {
      path: join(root, "host-v1"),
      sha256: launcher(join(root, "host-v1"), "host-v1", false),
    },
    view: { path: join(root, "view-v1"), sha256: launcher(join(root, "view-v1"), "view-v1", true) },
    cli: {
      path: join(binDir, "pi-task-session"),
      sha256: launcher(join(binDir, "pi-task-session"), "bin.js", true),
    },
  };
  process.stdout.write(`${JSON.stringify(receipt, null, 2)}\n`);
} finally {
  if (damaged !== staging) rmSync(staging, { recursive: true, force: true });
  rmSync(work, { recursive: true, force: true });
}
