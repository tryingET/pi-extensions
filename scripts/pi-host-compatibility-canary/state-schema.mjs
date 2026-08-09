// ---
// summary: "Validates every checksummed canary gate, lock, and recovery-journal payload field."
// read_when:
//   - "Changing recovery record schemas, state enums, identities, or persisted metadata."
// ---
import path from "node:path";
import { IntegrityError } from "./integrity.mjs";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const HEX_256 = /^[0-9a-f]{64}$/;
const NPM_NAME = /^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/;
const SEMVER = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;
const TARGET_STATES = new Set([
  "baselined",
  "alignment-exposed",
  "stage-create-intent",
  "stage-created",
  "stage-promote-intent",
  "owned-node-modules",
  "alignment-intent",
  "aligned",
  "scenario-intent",
  "stage-remove-intent",
  "detach-intent",
  "quarantined",
  "quarantine-remove-intent",
  "recreate-preexisting-intent",
  "restore-command-intent",
  "restored",
  "recovery-stage-remove-intent",
  "recovery-detach-intent",
  "recovery-quarantined",
  "recovery-quarantine-remove-intent",
  "recovery-restore-command-intent",
]);
const PHASES = new Set(["ready", "clean", "pre-alignment", "restoring", ...TARGET_STATES]);
const EFFECTS = new Set(["align-host", "scenario", "restore-host", "explicit-restore-host"]);

function fail(message) {
  throw new IntegrityError(`invalid recovery state schema: ${message}`);
}

function object(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail(`${label} must be an object`);
  return value;
}

function exactKeys(value, required, optional, label) {
  object(value, label);
  const allowed = new Set([...required, ...optional]);
  for (const key of required) if (!(key in value)) fail(`${label}.${key} is required`);
  for (const key of Object.keys(value)) if (!allowed.has(key)) fail(`${label}.${key} is unexpected`);
}

function string(value, label, pattern) {
  if (typeof value !== "string" || value.length === 0 || (pattern && !pattern.test(value))) {
    fail(`${label} is invalid`);
  }
}

function integer(value, label, minimum = 0) {
  if (!Number.isSafeInteger(value) || value < minimum) fail(`${label} must be an integer >= ${minimum}`);
}

function timestamp(value, label) {
  string(value, label);
  if (!Number.isFinite(Date.parse(value))) fail(`${label} must be an ISO timestamp`);
}

function fsIdentity(value, label, nullable = false) {
  if (value === null && nullable) return;
  exactKeys(value, ["dev", "ino"], [], label);
  string(value.dev, `${label}.dev`, /^\d+$/);
  string(value.ino, `${label}.ino`, /^\d+$/);
}

function processIdentity(value, label) {
  exactKeys(
    value,
    ["platform", "uid", "pid"],
    ["machineId", "bootId", "startTimeTicks", "pidNamespace", "processGroupId"],
    label,
  );
  string(value.platform, `${label}.platform`);
  integer(value.uid, `${label}.uid`);
  integer(value.pid, `${label}.pid`, 1);
  if (value.processGroupId !== undefined) integer(value.processGroupId, `${label}.processGroupId`, 1);
  if (value.platform === "linux") {
    string(value.machineId, `${label}.machineId`, /^[0-9a-f-]{16,64}$/);
    string(value.bootId, `${label}.bootId`, UUID);
    string(value.startTimeTicks, `${label}.startTimeTicks`, /^\d+$/);
    exactKeys(value.pidNamespace, ["dev", "ino", "link"], [], `${label}.pidNamespace`);
    string(value.pidNamespace.dev, `${label}.pidNamespace.dev`, /^\d+$/);
    string(value.pidNamespace.ino, `${label}.pidNamespace.ino`, /^\d+$/);
    string(value.pidNamespace.link, `${label}.pidNamespace.link`, /^pid:\[\d+\]$/);
  } else if (
    value.machineId !== undefined || value.bootId !== undefined ||
    value.startTimeTicks !== undefined || value.pidNamespace !== undefined
  ) {
    fail(`${label} has Linux-only fields on a non-Linux identity`);
  }
}

function owner(value, label) {
  exactKeys(value, ["token", "identity"], [], label);
  string(value.token, `${label}.token`, HEX_256);
  processIdentity(value.identity, `${label}.identity`);
}

function root(value, label) {
  exactKeys(value, ["canonicalPath", "identity"], [], label);
  string(value.canonicalPath, `${label}.canonicalPath`);
  if (!path.isAbsolute(value.canonicalPath)) fail(`${label}.canonicalPath must be absolute`);
  fsIdentity(value.identity, `${label}.identity`);
}

function relativePath(value, label) {
  string(value, label);
  if (path.isAbsolute(value) || value.includes("\0")) fail(`${label} must be relative`);
  const normalized = path.normalize(value);
  if (normalized === ".." || normalized.startsWith(`..${path.sep}`)) fail(`${label} traverses its root`);
}

function manifest(value, label) {
  exactKeys(value, ["relativePath", "digest", "identity"], [], label);
  relativePath(value.relativePath, `${label}.relativePath`);
  string(value.digest, `${label}.digest`, HEX_256);
  fsIdentity(value.identity, `${label}.identity`);
}

function metadata(value, label) {
  exactKeys(
    value,
    ["packageJsonDigest", "packageName", "packageVersion", "packageLock"],
    [],
    label,
  );
  string(value.packageJsonDigest, `${label}.packageJsonDigest`, HEX_256);
  if (value.packageName !== null) string(value.packageName, `${label}.packageName`);
  if (value.packageVersion !== null) string(value.packageVersion, `${label}.packageVersion`);
  exactKeys(value.packageLock, ["present", "digest"], [], `${label}.packageLock`);
  if (typeof value.packageLock.present !== "boolean") fail(`${label}.packageLock.present must be boolean`);
  if (value.packageLock.present) string(value.packageLock.digest, `${label}.packageLock.digest`, HEX_256);
  else if (value.packageLock.digest !== null) fail(`${label}.packageLock.digest must be null when absent`);
}

function snapshot(value, label) {
  if (!Array.isArray(value)) fail(`${label} must be an array`);
  for (const [index, entry] of value.entries()) {
    exactKeys(entry, ["packageName", "installedVersion"], [], `${label}[${index}]`);
    string(entry.packageName, `${label}[${index}].packageName`, NPM_NAME);
    if (entry.installedVersion !== null) {
      string(entry.installedVersion, `${label}[${index}].installedVersion`, SEMVER);
    }
  }
}

function target(value, index) {
  const label = `journal.targets[${index}]`;
  exactKeys(value, [
    "index", "declaredPath", "canonicalPackagePath", "packageIdentity", "metadata",
    "initialNodeModules", "restoreSnapshot", "state", "artifactToken", "stageIdentity",
    "ownedNodeModulesIdentity", "quarantineIdentity",
  ], [], label);
  if (value.index !== index) fail(`${label}.index must equal its array index`);
  relativePath(value.declaredPath, `${label}.declaredPath`);
  relativePath(value.canonicalPackagePath, `${label}.canonicalPackagePath`);
  fsIdentity(value.packageIdentity, `${label}.packageIdentity`);
  metadata(value.metadata, `${label}.metadata`);
  exactKeys(value.initialNodeModules, ["kind", "identity"], [], `${label}.initialNodeModules`);
  if (!new Set(["absent", "directory"]).has(value.initialNodeModules.kind)) {
    fail(`${label}.initialNodeModules.kind is invalid`);
  }
  fsIdentity(
    value.initialNodeModules.identity,
    `${label}.initialNodeModules.identity`,
    value.initialNodeModules.kind === "absent",
  );
  if (value.initialNodeModules.kind === "directory" && value.initialNodeModules.identity === null) {
    fail(`${label}.initialNodeModules.identity is required for a directory`);
  }
  snapshot(value.restoreSnapshot, `${label}.restoreSnapshot`);
  if (!TARGET_STATES.has(value.state)) fail(`${label}.state is unknown`);
  string(value.artifactToken, `${label}.artifactToken`, HEX_256);
  fsIdentity(value.stageIdentity, `${label}.stageIdentity`, true);
  fsIdentity(value.ownedNodeModulesIdentity, `${label}.ownedNodeModulesIdentity`, true);
  fsIdentity(value.quarantineIdentity, `${label}.quarantineIdentity`, true);
}

function host(value, label) {
  exactKeys(value, ["packageName", "companionPackages", "version"], [], label);
  string(value.packageName, `${label}.packageName`, NPM_NAME);
  if (!Array.isArray(value.companionPackages)) fail(`${label}.companionPackages must be an array`);
  value.companionPackages.forEach((name, index) => string(name, `${label}.companionPackages[${index}]`, NPM_NAME));
  string(value.version, `${label}.version`, SEMVER);
}

function child(value, label) {
  if (value === null) return;
  exactKeys(value, ["effect", "targetIndex", "identity"], [], label);
  if (!EFFECTS.has(value.effect)) fail(`${label}.effect is unknown`);
  if (value.targetIndex !== null) integer(value.targetIndex, `${label}.targetIndex`);
  processIdentity(value.identity, `${label}.identity`);
}

function common(value, label, extraRequired, extraOptional = []) {
  exactKeys(
    value,
    ["kind", "runId", "owner", "root", "createdAt", ...extraRequired],
    extraOptional,
    label,
  );
  string(value.runId, `${label}.runId`, UUID);
  owner(value.owner, `${label}.owner`);
  root(value.root, `${label}.root`);
  timestamp(value.createdAt, `${label}.createdAt`);
}

export function validateStatePayload(value, expectedKind) {
  object(value, "payload");
  if (value.kind !== expectedKind) fail("payload kind does not match its file role");
  if (expectedKind === "pi-host-compatibility-canary-state-gate") {
    common(value, "gate", []);
    return value;
  }
  if (expectedKind === "pi-host-compatibility-canary-mutation-lock") {
    common(value, "lock", ["manifest", "state"], []);
    manifest(value.manifest, "lock.manifest");
    if (!new Set(["initializing", "journal-ready"]).has(value.state)) fail("lock.state is unknown");
    return value;
  }
  if (expectedKind !== "pi-host-compatibility-canary-recovery-journal") {
    fail("record kind is unsupported");
  }
  common(
    value,
    "journal",
    ["revision", "updatedAt", "manifest", "profile", "phase", "scenarioId", "child", "targets"],
    ["host", "recoveryOwner"],
  );
  integer(value.revision, "journal.revision");
  timestamp(value.updatedAt, "journal.updatedAt");
  manifest(value.manifest, "journal.manifest");
  string(value.profile, "journal.profile");
  if (!PHASES.has(value.phase)) fail("journal.phase is unknown");
  if (value.scenarioId !== null) string(value.scenarioId, "journal.scenarioId");
  child(value.child, "journal.child");
  if (!Array.isArray(value.targets) || value.targets.length > 128) fail("journal.targets is invalid");
  value.targets.forEach(target);
  if (value.host !== undefined) host(value.host, "journal.host");
  if (value.recoveryOwner !== undefined) owner(value.recoveryOwner, "journal.recoveryOwner");
  if (value.targets.length > 0 && (!value.host || value.scenarioId === null)) {
    fail("journal targets require host and scenario bindings");
  }
  return value;
}
