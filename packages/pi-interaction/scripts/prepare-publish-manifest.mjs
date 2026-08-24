#!/usr/bin/env node
/**
 * summary: "exclusively owns and prepares exact dependency manifests across supported npm pack/publish lifecycles."
 * read_when:
 *   - "debugging package manifest rewriting, concurrent lifecycle ownership, npm publish support, or restoration."
 */
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const mode = process.argv[2];
const validModes = new Set(["prepack", "postpack", "postpublish", "restore"]);

if (!validModes.has(mode)) {
  console.error(
    "Usage: node ../scripts/prepare-publish-manifest.mjs <prepack|postpack|postpublish|restore>",
  );
  process.exit(1);
}

const packageDir = process.cwd();
const packageJsonPath = path.join(packageDir, "package.json");
const backupPath = path.join(packageDir, ".package.json.prepack.backup");
const ownershipPath = path.join(packageDir, ".package.json.publish-manifest.lock");
const ownershipFilePath = path.join(ownershipPath, "owner.json");
const guardPath = path.join(packageDir, ".package.json.publish-manifest.guard");
const recoveryPath = path.join(packageDir, ".package.json.publish-manifest.recovery");
const dependencyFields = ["dependencies", "optionalDependencies", "peerDependencies"];
const backupFormat = "pi-interaction-publish-manifest-v2";
const sleepArray = new Int32Array(new SharedArrayBuffer(4));

const readText = (filePath) => fs.readFileSync(filePath, "utf8");
const exists = (filePath) => fs.existsSync(filePath);
const entryExists = (filePath) => {
  try {
    fs.lstatSync(filePath);
    return true;
  } catch {
    return false;
  }
};
const sleep = (milliseconds) => Atomics.wait(sleepArray, 0, 0, milliseconds);

function atomicWrite(filePath, content) {
  const temporaryPath = `${filePath}.${process.pid}.tmp`;
  try {
    fs.writeFileSync(temporaryPath, content, "utf8");
    fs.renameSync(temporaryPath, filePath);
  } finally {
    fs.rmSync(temporaryPath, { force: true });
  }
}

function readProcessIdentity(pid) {
  try {
    const stat = readText(`/proc/${pid}/stat`);
    const fields = stat.slice(stat.lastIndexOf(") ") + 2).split(" ");
    return {
      pid,
      parentPid: Number(fields[1]),
      startTime: fields[19],
      command: fs.readFileSync(`/proc/${pid}/cmdline`).toString("utf8").replaceAll("\0", " "),
    };
  } catch {
    return null;
  }
}

function isOwnerActive(owner) {
  if (!Number.isInteger(owner.pid) || typeof owner.startTime !== "string") {
    return owner.kind === "explicit";
  }
  return readProcessIdentity(owner.pid)?.startTime === owner.startTime;
}

function findNpmOwner() {
  let pid = process.ppid;
  for (let depth = 0; depth < 12 && pid > 1; depth += 1) {
    const identity = readProcessIdentity(pid);
    if (!identity) break;
    if (identity.command.includes("npm-cli.js") || /^npm(?:\s|$)/.test(identity.command)) {
      return {
        kind: "npm",
        id: `npm:${identity.pid}:${identity.startTime}`,
        pid: identity.pid,
        startTime: identity.startTime,
      };
    }
    pid = identity.parentPid;
  }
  return null;
}

function resolveOwner() {
  const explicitOwner = process.env.PI_PUBLISH_MANIFEST_OWNER?.trim();
  if (explicitOwner) {
    if (!/^[a-zA-Z0-9._:-]{1,160}$/.test(explicitOwner)) {
      throw new Error("PI_PUBLISH_MANIFEST_OWNER contains unsupported characters");
    }
    const controllerPid = Number(process.env.PI_PUBLISH_MANIFEST_OWNER_PID);
    const controller = Number.isInteger(controllerPid) ? readProcessIdentity(controllerPid) : null;
    return {
      kind: "explicit",
      id: `explicit:${explicitOwner}`,
      ...(controller && { pid: controller.pid, startTime: controller.startTime }),
    };
  }

  const npmOwner = findNpmOwner();
  if (npmOwner) return npmOwner;

  const identity = readProcessIdentity(process.pid);
  if (!identity) {
    throw new Error("cannot establish exclusive lifecycle ownership on this platform");
  }
  return {
    kind: "process",
    id: `process:${identity.pid}:${identity.startTime}`,
    pid: identity.pid,
    startTime: identity.startTime,
  };
}

const SUPPORTED_PUBLISH_NPM_MAJORS = new Set(["11", "12"]);

function assertSupportedPublishLifecycle(owner) {
  if (process.env.npm_command !== "publish") return;

  const npmMajor = /^npm\/(\d+)\./.exec(process.env.npm_config_user_agent ?? "")?.[1];
  if (!SUPPORTED_PUBLISH_NPM_MAJORS.has(npmMajor)) {
    throw new Error(
      `unsupported npm publish lifecycle: expected npm 11 or 12, got ${process.env.npm_config_user_agent ?? "<missing user agent>"}`,
    );
  }
  if (mode !== "restore" && process.env.npm_lifecycle_event !== mode) {
    throw new Error(
      `unsupported npm publish lifecycle event: expected ${mode}, got ${process.env.npm_lifecycle_event ?? "<missing>"}`,
    );
  }
  if (owner.kind === "process") {
    throw new Error("unsupported npm publish lifecycle: could not identify the owning npm process");
  }
}

function readJson(filePath) {
  return JSON.parse(readText(filePath));
}

function createProcessOwner(prefix) {
  const identity = readProcessIdentity(process.pid);
  if (!identity) throw new Error(`cannot acquire ${prefix} guard on this platform`);
  return {
    kind: "process",
    id: `${prefix}:${identity.pid}:${identity.startTime}:${randomUUID()}`,
    pid: identity.pid,
    startTime: identity.startTime,
  };
}

function publishOwnedEntry(targetPath, owner) {
  try {
    fs.symlinkSync(JSON.stringify(owner), targetPath);
    return true;
  } catch (error) {
    if (error?.code !== "EEXIST") throw error;
    return false;
  }
}

function readGuardOwner(targetPath) {
  try {
    const stat = fs.lstatSync(targetPath);
    const ownerText = stat.isSymbolicLink()
      ? fs.readlinkSync(targetPath)
      : readText(path.join(targetPath, "owner.json"));
    const owner = JSON.parse(ownerText);
    return typeof owner?.id === "string" ? owner : null;
  } catch {
    return null;
  }
}

function releaseOwnedEntry(targetPath, owner) {
  const current = readGuardOwner(targetPath);
  if (current?.id !== owner.id) {
    throw new Error(`refusing to release ${targetPath}: owner token changed`);
  }
  const retiredPath = `${targetPath}.retired-${randomUUID()}`;
  fs.renameSync(targetPath, retiredPath);
  fs.rmSync(retiredPath, { recursive: true, force: true });
}

function waitForRecoveryToClear() {
  for (let attempt = 0; attempt < 400; attempt += 1) {
    let before;
    try {
      before = fs.lstatSync(recoveryPath);
    } catch {
      return;
    }
    const owner = readGuardOwner(recoveryPath);
    let after;
    try {
      after = fs.lstatSync(recoveryPath);
    } catch {
      continue;
    }
    if (before.dev !== after.dev || before.ino !== after.ino) continue;
    if (!owner) {
      throw new Error("recovery guard metadata is missing; automatic reclamation is disabled");
    }
    if (!isOwnerActive(owner)) {
      throw new Error(`recovery guard ${owner.id} is stale; automatic reclamation is disabled`);
    }
    sleep(25);
  }
  throw new Error("timed out waiting for the publish-manifest recovery guard");
}

function acquireRecoveryGuard() {
  const owner = createProcessOwner("recovery");
  for (let attempt = 0; attempt < 400; attempt += 1) {
    if (publishOwnedEntry(recoveryPath, owner)) return owner;
    waitForRecoveryToClear();
  }
  throw new Error("timed out acquiring the publish-manifest recovery guard");
}

function recoverOrdinaryGuard() {
  const recoveryOwner = acquireRecoveryGuard();
  try {
    if (!entryExists(guardPath)) return;
    const current = readGuardOwner(guardPath);
    if (current && isOwnerActive(current)) return;
    fs.rmSync(guardPath, { recursive: true, force: true });
  } finally {
    releaseOwnedEntry(recoveryPath, recoveryOwner);
  }
}

function acquireOrdinaryGuard() {
  const owner = createProcessOwner("guard");
  for (let attempt = 0; attempt < 400; attempt += 1) {
    waitForRecoveryToClear();
    if (publishOwnedEntry(guardPath, owner)) {
      try {
        waitForRecoveryToClear();
      } catch (error) {
        releaseOwnedEntry(guardPath, owner);
        throw error;
      }
      return owner;
    }
    const current = readGuardOwner(guardPath);
    if (current && isOwnerActive(current)) {
      sleep(25);
      continue;
    }
    recoverOrdinaryGuard();
  }
  throw new Error("timed out acquiring the publish-manifest lifecycle guard");
}

function withGuard(action) {
  const owner = acquireOrdinaryGuard();
  try {
    if (process.env.NODE_ENV === "test") {
      const holdMilliseconds = Number(process.env.PI_PUBLISH_MANIFEST_TEST_HOLD_GUARD_MS);
      if (Number.isInteger(holdMilliseconds) && holdMilliseconds > 0) sleep(holdMilliseconds);
    }
    return action();
  } finally {
    releaseOwnedEntry(guardPath, owner);
  }
}

function buildPreparedManifest(originalText) {
  const manifest = JSON.parse(originalText);
  const rewrites = [];

  for (const field of dependencyFields) {
    const deps = manifest[field];
    if (!deps || typeof deps !== "object" || Array.isArray(deps)) continue;

    for (const [dependencyName, spec] of Object.entries(deps)) {
      if (typeof spec !== "string" || !spec.startsWith("file:")) continue;
      const dependencyPackageJsonPath = path.join(
        path.resolve(packageDir, spec.slice("file:".length)),
        "package.json",
      );
      if (!exists(dependencyPackageJsonPath)) {
        throw new Error(
          `${field}.${dependencyName} points to ${spec}, but ${dependencyPackageJsonPath} does not exist`,
        );
      }
      const dependencyManifest = readJson(dependencyPackageJsonPath);
      if (dependencyManifest.name !== dependencyName) {
        throw new Error(
          `${field}.${dependencyName} points to ${spec}, but resolved package name is ${dependencyManifest.name ?? "<missing>"}`,
        );
      }
      if (
        typeof dependencyManifest.version !== "string" ||
        dependencyManifest.version.length === 0
      ) {
        throw new Error(
          `${field}.${dependencyName} points to ${spec}, but the resolved package has no version`,
        );
      }
      manifest[field][dependencyName] = dependencyManifest.version;
      rewrites.push({ field, dependencyName, from: spec, to: dependencyManifest.version });
    }
  }

  return {
    preparedText: rewrites.length === 0 ? originalText : `${JSON.stringify(manifest, null, 2)}\n`,
    rewrites,
  };
}

function readBackupState() {
  const backupText = readText(backupPath);
  try {
    const state = JSON.parse(backupText);
    if (
      [backupFormat, "pi-interaction-publish-manifest-v1"].includes(state?.format) &&
      typeof state.originalText === "string" &&
      typeof state.preparedText === "string"
    ) {
      return state;
    }
  } catch {
    // Legacy backups contain the original package.json text directly.
  }
  const { preparedText } = buildPreparedManifest(backupText);
  return { format: "legacy-plain-package-json", originalText: backupText, preparedText };
}

function restoreBackupSnapshot(reason) {
  if (!exists(backupPath)) return false;
  if (!exists(packageJsonPath)) {
    throw new Error(`cannot restore ${reason}: package.json is missing in ${packageDir}`);
  }
  const state = readBackupState();
  const currentText = readText(packageJsonPath);
  if (currentText === state.originalText) {
    fs.unlinkSync(backupPath);
    console.error(`[prepare-publish-manifest] removed stale backup during ${reason}`);
    return true;
  }
  if (currentText !== state.preparedText) {
    throw new Error(
      `refusing to restore ${reason}: package.json differs from both guarded snapshots`,
    );
  }
  atomicWrite(packageJsonPath, state.originalText);
  fs.unlinkSync(backupPath);
  console.error(`[prepare-publish-manifest] restored developer package.json during ${reason}`);
  return true;
}

function readOwnership() {
  return exists(ownershipFilePath) ? readJson(ownershipFilePath) : null;
}

function beginOwnership(owner) {
  withGuard(() => {
    const current = readOwnership();
    if (current) {
      if (current.id === owner.id) {
        throw new Error(`lifecycle owner ${owner.id} already has an active operation`);
      }
      if (isOwnerActive(current)) {
        throw new Error(`active lifecycle owner ${current.id} cannot be replaced by ${owner.id}`);
      }
      restoreBackupSnapshot("stale owner recovery");
      fs.rmSync(ownershipPath, { recursive: true, force: true });
    } else {
      if (exists(backupPath)) restoreBackupSnapshot("legacy stale backup recovery");
      fs.rmSync(ownershipPath, { recursive: true, force: true });
    }
    fs.mkdirSync(ownershipPath);
    atomicWrite(ownershipFilePath, `${JSON.stringify(owner, null, 2)}\n`);
  });
}

function finishOwnership(owner, reason, { allowInactiveOwner = false } = {}) {
  return withGuard(() => {
    const current = readOwnership();
    if (!current) {
      if (exists(backupPath) && !allowInactiveOwner) {
        throw new Error(`cannot ${reason}: lifecycle owner record is missing`);
      }
      const restored = restoreBackupSnapshot(reason);
      if (allowInactiveOwner) fs.rmSync(ownershipPath, { recursive: true, force: true });
      return restored;
    }
    if (current.id !== owner.id && !(allowInactiveOwner && !isOwnerActive(current))) {
      throw new Error(`cannot ${reason}: active lifecycle owner is ${current.id}, not ${owner.id}`);
    }
    restoreBackupSnapshot(reason);
    fs.rmSync(ownershipPath, { recursive: true, force: true });
    return true;
  });
}

function prepareManifest(owner) {
  if (!exists(packageJsonPath)) throw new Error(`missing package.json in ${packageDir}`);
  beginOwnership(owner);
  try {
    const originalText = readText(packageJsonPath);
    const { preparedText, rewrites } = buildPreparedManifest(originalText);
    if (rewrites.length === 0) {
      finishOwnership(owner, "no-op prepack");
      return;
    }
    const backupState = { format: backupFormat, ownerId: owner.id, originalText, preparedText };
    atomicWrite(backupPath, `${JSON.stringify(backupState, null, 2)}\n`);
    atomicWrite(packageJsonPath, preparedText);
    for (const rewrite of rewrites) {
      console.error(
        `[prepare-publish-manifest] ${rewrite.field}.${rewrite.dependencyName}: ${rewrite.from} -> ${rewrite.to}`,
      );
    }
  } catch (error) {
    try {
      finishOwnership(owner, "failed prepack cleanup");
    } catch (cleanupError) {
      throw new AggregateError([error, cleanupError], "prepack failed and cleanup was refused");
    }
    throw error;
  }
}

try {
  const owner = resolveOwner();
  assertSupportedPublishLifecycle(owner);
  if (mode === "prepack") {
    prepareManifest(owner);
  } else if (mode === "postpack" && process.env.npm_command === "publish") {
    const current = readOwnership();
    if ((current || exists(backupPath)) && current?.id !== owner.id) {
      throw new Error(
        `cannot retain publish-ready manifest: active owner is ${current?.id ?? "missing"}`,
      );
    }
    if (exists(backupPath)) {
      console.error(
        "[prepare-publish-manifest] retained publish-ready package.json for npm 11's manifest reread",
      );
    }
  } else if (mode === "restore") {
    finishOwnership(owner, mode, { allowInactiveOwner: true });
  } else {
    finishOwnership(owner, mode);
  }
} catch (error) {
  const message =
    error instanceof AggregateError
      ? `${error.message}: ${error.errors.map((item) => item?.message ?? String(item)).join("; ")}`
      : error instanceof Error
        ? error.message
        : String(error);
  console.error(`[prepare-publish-manifest] ${message}`);
  process.exit(1);
}
