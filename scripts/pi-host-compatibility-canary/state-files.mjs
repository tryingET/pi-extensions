// ---
// summary: "Provides owner-only durable state files and strong local process identity for canary recovery."
// read_when:
//   - "Changing recovery-state storage, checksums, fsync behavior, or stale-owner detection."
// ---
import { createHash, randomUUID } from "node:crypto";
import {
  closeSync,
  constants as fsConstants,
  existsSync,
  fstatSync,
  fsyncSync,
  lstatSync,
  linkSync,
  mkdirSync,
  openSync,
  readFileSync,
  readlinkSync,
  realpathSync,
  renameSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { homedir, tmpdir } from "node:os";
import path from "node:path";
import { identitiesMatch, identityOf, IntegrityError } from "./integrity.mjs";
import { CANONICAL_ROOT } from "./paths.mjs";

export const STATE_SCHEMA_VERSION = 1;
export const MAX_JOURNAL_BYTES = 256 * 1024;
export const MAX_LOCK_BYTES = 32 * 1024;
const STATE_DIRECTORY_NAME = "pi-host-compatibility-canary";
const PRIVATE_DIRECTORY_MODE = 0o700;
const PRIVATE_FILE_MODE = 0o600;

export function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function isWithin(parent, candidate) {
  const relative = path.relative(parent, candidate);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function stateHome(env) {
  const configured = env.XDG_STATE_HOME;
  const fallbackHome = env.HOME || homedir();
  const selected = configured || (fallbackHome ? path.join(fallbackHome, ".local", "state") : "");
  if (!selected || !path.isAbsolute(selected)) {
    throw new IntegrityError("XDG state home must be an absolute owner-controlled path");
  }
  const resolved = path.resolve(selected);
  const canonicalTmp = realpathSync(tmpdir());
  if (isWithin(CANONICAL_ROOT, resolved)) {
    throw new IntegrityError("recovery state must not be stored inside the repository");
  }
  if (isWithin(canonicalTmp, resolved)) {
    throw new IntegrityError("recovery state must not be stored under the system temporary directory");
  }
  return resolved;
}

function currentUid() {
  if (typeof process.geteuid !== "function") {
    throw new IntegrityError("owner-only recovery state requires effective-user identity support");
  }
  return process.geteuid();
}

function checkPrivateDirectory(directoryPath) {
  const stats = lstatSync(directoryPath, { bigint: true });
  if (!stats.isDirectory() || stats.isSymbolicLink()) {
    throw new IntegrityError(`recovery state path is not a real directory: ${directoryPath}`);
  }
  if (Number(stats.uid) !== currentUid()) {
    throw new IntegrityError(`recovery state directory has the wrong owner: ${directoryPath}`);
  }
  if ((Number(stats.mode) & 0o077) !== 0) {
    throw new IntegrityError(`recovery state directory is not owner-only: ${directoryPath}`);
  }
  return stats;
}

function ensurePrivateDirectory(directoryPath) {
  const existed = existsSync(directoryPath);
  mkdirSync(directoryPath, { recursive: true, mode: PRIVATE_DIRECTORY_MODE });
  checkPrivateDirectory(directoryPath);
  if (!existed) fsyncDirectory(path.dirname(directoryPath));
}

function validateCanonicalStateHome(home) {
  const canonical = realpathSync(home);
  if (isWithin(CANONICAL_ROOT, canonical) || isWithin(realpathSync(tmpdir()), canonical)) {
    throw new IntegrityError("canonical recovery state home resolves into a forbidden location");
  }
}

export function recoveryStatePaths(env = process.env, { create = false } = {}) {
  const home = stateHome(env);
  const rootKey = sha256(CANONICAL_ROOT);
  const appDir = path.join(home, STATE_DIRECTORY_NAME);
  const checkoutsDir = path.join(appDir, "checkouts");
  const checkoutDir = path.join(checkoutsDir, rootKey);
  const journalsDir = path.join(checkoutDir, "journals");
  if (create) {
    mkdirSync(home, { recursive: true });
    validateCanonicalStateHome(home);
    ensurePrivateDirectory(appDir);
    ensurePrivateDirectory(checkoutsDir);
    ensurePrivateDirectory(checkoutDir);
    ensurePrivateDirectory(journalsDir);
  } else if (existsSync(appDir)) {
    validateCanonicalStateHome(home);
    checkPrivateDirectory(appDir);
    if (existsSync(checkoutsDir)) checkPrivateDirectory(checkoutsDir);
    if (existsSync(checkoutDir)) checkPrivateDirectory(checkoutDir);
    if (existsSync(journalsDir)) checkPrivateDirectory(journalsDir);
  }
  return {
    stateHome: home,
    appDir,
    checkoutDir,
    journalsDir,
    gatePath: path.join(checkoutDir, "gate.json"),
    lockPath: path.join(CANONICAL_ROOT, ".pi-host-compatibility-canary.lock"),
    recoveryLockPath: path.join(CANONICAL_ROOT, ".pi-host-compatibility-canary.recovery-lock"),
    rootKey,
  };
}

export function fsyncDirectory(directoryPath) {
  const flags = fsConstants.O_RDONLY | (fsConstants.O_DIRECTORY ?? 0) | (fsConstants.O_NOFOLLOW ?? 0);
  const fd = openSync(directoryPath, flags);
  try { fsyncSync(fd); } finally { closeSync(fd); }
}

export function fsyncFile(filePath) {
  const flags = fsConstants.O_RDONLY | (fsConstants.O_NOFOLLOW ?? 0);
  const fd = openSync(filePath, flags);
  try { fsyncSync(fd); } finally { closeSync(fd); }
}

export function encodeStateRecord(payload) {
  const payloadJson = JSON.stringify(payload);
  return `${JSON.stringify({
    schemaVersion: STATE_SCHEMA_VERSION,
    checksumAlgorithm: "sha256",
    checksum: sha256(payloadJson),
    payload,
  }, null, 2)}\n`;
}

function validatePrivateFile(filePath, maxBytes) {
  const stats = lstatSync(filePath, { bigint: true });
  if (!stats.isFile() || stats.isSymbolicLink()) {
    throw new IntegrityError(`recovery state file is not a regular file: ${filePath}`);
  }
  if (Number(stats.uid) !== currentUid()) {
    throw new IntegrityError(`recovery state file has the wrong owner: ${filePath}`);
  }
  if ((Number(stats.mode) & 0o077) !== 0) {
    throw new IntegrityError(`recovery state file is not owner-only: ${filePath}`);
  }
  if (stats.size <= 0n || stats.size > BigInt(maxBytes)) {
    throw new IntegrityError(`recovery state file has an invalid size: ${filePath}`);
  }
  return stats;
}

export function readStateRecord(filePath, expectedKind, maxBytes = MAX_JOURNAL_BYTES) {
  const before = validatePrivateFile(filePath, maxBytes);
  const flags = fsConstants.O_RDONLY | (fsConstants.O_NOFOLLOW ?? 0);
  const fd = openSync(filePath, flags);
  let contents;
  try {
    const opened = fstatSync(fd, { bigint: true });
    if (!identitiesMatch(identityOf(before), identityOf(opened))) {
      throw new IntegrityError(`recovery state file identity changed while opening: ${filePath}`);
    }
    contents = readFileSync(fd, "utf8");
  } finally {
    closeSync(fd);
  }
  let envelope;
  try { envelope = JSON.parse(contents); }
  catch { throw new IntegrityError(`recovery state file is malformed JSON: ${filePath}`); }
  const envelopeKeys = envelope && typeof envelope === "object" && !Array.isArray(envelope)
    ? Object.keys(envelope).sort().join(",")
    : "";
  if (
    envelope?.schemaVersion !== STATE_SCHEMA_VERSION ||
    envelopeKeys !== "checksum,checksumAlgorithm,payload,schemaVersion" ||
    envelope?.checksumAlgorithm !== "sha256" ||
    typeof envelope?.checksum !== "string" || !/^[0-9a-f]{64}$/.test(envelope.checksum) ||
    !envelope?.payload || typeof envelope.payload !== "object" || Array.isArray(envelope.payload)
  ) {
    throw new IntegrityError(`recovery state file has an unsupported envelope: ${filePath}`);
  }
  if (sha256(JSON.stringify(envelope.payload)) !== envelope.checksum) {
    throw new IntegrityError(`recovery state checksum mismatch: ${filePath}`);
  }
  if (envelope.payload.kind !== expectedKind) {
    throw new IntegrityError(`unexpected recovery state record kind: ${filePath}`);
  }
  return { payload: envelope.payload, identity: identityOf(before), path: filePath };
}

function writeCandidate(directoryPath, basename, contents) {
  const candidate = path.join(directoryPath, `.${basename}.${randomUUID()}.tmp`);
  const flags = fsConstants.O_CREAT | fsConstants.O_EXCL | fsConstants.O_WRONLY | (fsConstants.O_NOFOLLOW ?? 0);
  const fd = openSync(candidate, flags, PRIVATE_FILE_MODE);
  try {
    writeFileSync(fd, contents, "utf8");
    fsyncSync(fd);
  } catch (error) {
    try { closeSync(fd); } catch {}
    try { unlinkSync(candidate); } catch {}
    throw error;
  }
  closeSync(fd);
  return candidate;
}

function checkRecordDirectory(directoryPath, privateDirectory) {
  if (privateDirectory) return checkPrivateDirectory(directoryPath);
  const stats = lstatSync(directoryPath, { bigint: true });
  if (!stats.isDirectory() || stats.isSymbolicLink() || realpathSync(directoryPath) !== CANONICAL_ROOT) {
    throw new IntegrityError("checkout lock directory identity is invalid");
  }
  return stats;
}

export function atomicWriteStateRecord(
  filePath,
  payload,
  maxBytes = MAX_JOURNAL_BYTES,
  options = {},
) {
  const directoryPath = path.dirname(filePath);
  if (options.serializedByStateGate !== true) {
    throw new IntegrityError("atomic state publication requires the cooperating canary state gate");
  }
  checkRecordDirectory(directoryPath, options.privateDirectory !== false);
  const contents = encodeStateRecord(payload);
  if (Buffer.byteLength(contents) > maxBytes) throw new IntegrityError("recovery state record exceeds its size limit");
  const existing = existsSync(filePath)
    ? readStateRecord(filePath, payload.kind, maxBytes)
    : null;
  if (options.expectedAbsent === true && existing) {
    throw new IntegrityError(`recovery state record appeared before exclusive publication: ${filePath}`);
  }
  if (
    options.expectedIdentity &&
    (!existing || !identitiesMatch(existing.identity, options.expectedIdentity))
  ) throw new IntegrityError(`recovery state file identity drifted before replacement: ${filePath}`);
  const candidate = writeCandidate(directoryPath, path.basename(filePath), contents);
  try {
    if (options.expectedIdentity) {
      const current = readStateRecord(filePath, payload.kind, maxBytes);
      if (!identitiesMatch(current.identity, options.expectedIdentity)) {
        throw new IntegrityError(`recovery state file identity drifted during replacement: ${filePath}`);
      }
    } else if (options.expectedAbsent === true && existsSync(filePath)) {
      throw new IntegrityError(`recovery state record raced exclusive publication: ${filePath}`);
    }
    // Node rename is atomic but not compare-and-swap. The required state gate serializes
    // canary writers; a same-UID writer that bypasses that gate is outside this guarantee.
    renameSync(candidate, filePath);
    fsyncDirectory(directoryPath);
    return readStateRecord(filePath, payload.kind, maxBytes);
  } catch (error) {
    try { unlinkSync(candidate); } catch {}
    throw error;
  }
}

export function createExclusiveStateRecord(
  filePath,
  payload,
  maxBytes = MAX_LOCK_BYTES,
  options = {},
) {
  const directoryPath = path.dirname(filePath);
  checkRecordDirectory(directoryPath, options.privateDirectory !== false);
  const contents = encodeStateRecord(payload);
  if (Buffer.byteLength(contents) > maxBytes) throw new IntegrityError("recovery lock record exceeds its size limit");
  const candidate = writeCandidate(directoryPath, path.basename(filePath), contents);
  try {
    try {
      // A hard link publishes a fully fsynced record without an empty exclusive-create window.
      linkSync(candidate, filePath);
    } catch (error) {
      if (error?.code === "EEXIST") return false;
      throw error;
    }
    fsyncDirectory(directoryPath);
    return true;
  } finally {
    try { unlinkSync(candidate); fsyncDirectory(directoryPath); } catch {}
  }
}

export function removeStateFile(filePath, expectedIdentity, expectedKind, maxBytes = MAX_JOURNAL_BYTES) {
  const record = readStateRecord(filePath, expectedKind, maxBytes);
  if (expectedIdentity && !identitiesMatch(record.identity, expectedIdentity)) {
    throw new IntegrityError(`recovery state file identity drifted before removal: ${filePath}`);
  }
  unlinkSync(filePath);
  fsyncDirectory(path.dirname(filePath));
}

function readLinuxBootId() {
  return readFileSync("/proc/sys/kernel/random/boot_id", "utf8").trim();
}

function readLinuxMachineId() {
  return readFileSync("/etc/machine-id", "utf8").trim();
}

function readLinuxStartTime(pid) {
  const stat = readFileSync(`/proc/${pid}/stat`, "utf8");
  const close = stat.lastIndexOf(")");
  if (close < 0) throw new Error("malformed proc stat");
  const fields = stat.slice(close + 1).trim().split(/\s+/);
  if (!fields[19]) throw new Error("missing proc start time");
  return fields[19];
}

function linuxPidNamespace(pid) {
  const stats = statSync(`/proc/${pid}/ns/pid`, { bigint: true });
  return { ...identityOf(stats), link: readlinkSync(`/proc/${pid}/ns/pid`) };
}

export function processIdentity(pid = process.pid) {
  const identity = {
    platform: process.platform,
    uid: currentUid(),
    pid,
  };
  if (process.platform === "linux") {
    identity.machineId = readLinuxMachineId();
    identity.bootId = readLinuxBootId();
    identity.startTimeTicks = readLinuxStartTime(pid);
    identity.pidNamespace = linuxPidNamespace(pid);
  }
  return identity;
}

function processGroupLiveness(identity) {
  if (!Number.isSafeInteger(identity.processGroupId) || identity.processGroupId <= 0) return "dead";
  try {
    process.kill(-identity.processGroupId, 0);
    return "active";
  } catch (error) {
    if (error?.code === "ESRCH") return "dead";
    if (error?.code === "EPERM") return "active";
    return "unknown";
  }
}

export function processLiveness(identity) {
  if (!identity || !Number.isSafeInteger(identity.pid) || identity.pid <= 0) return "unknown";
  if (identity.uid !== currentUid()) return "unknown";
  if (process.platform !== "linux" || identity.platform !== "linux") return "unknown";
  let bootId;
  let machineId;
  try {
    bootId = readLinuxBootId();
    machineId = readLinuxMachineId();
  } catch { return "unknown"; }
  if (machineId !== identity.machineId) return "unknown";
  if (bootId !== identity.bootId) return "dead";
  try {
    if (readLinuxStartTime(identity.pid) !== identity.startTimeTicks) return processGroupLiveness(identity);
    const namespace = linuxPidNamespace(identity.pid);
    if (
      namespace.dev !== identity.pidNamespace?.dev ||
      namespace.ino !== identity.pidNamespace?.ino ||
      namespace.link !== identity.pidNamespace?.link
    ) return processGroupLiveness(identity);
    process.kill(identity.pid, 0);
    return "active";
  } catch (error) {
    if (error?.code === "ENOENT" || error?.code === "ESRCH") return processGroupLiveness(identity);
    if (error?.code === "EPERM") return "active";
    return "unknown";
  }
}
