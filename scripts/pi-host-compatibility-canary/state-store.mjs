// ---
// summary: "Owns the per-checkout mutation lock and versioned recovery-journal lifecycle."
// read_when:
//   - "Changing canary lock acquisition, journal bindings, transitions, or durable cleanup."
// ---
import { randomBytes, randomUUID } from "node:crypto";
import {
  existsSync,
  lstatSync,
  readFileSync,
  readdirSync,
  realpathSync,
} from "node:fs";
import path from "node:path";
import { identitiesMatch, identityOf, IntegrityError } from "./integrity.mjs";
import { CANONICAL_ROOT } from "./paths.mjs";
import {
  atomicWriteStateRecord,
  createExclusiveStateRecord,
  MAX_JOURNAL_BYTES,
  MAX_LOCK_BYTES,
  processLiveness,
  readStateRecord as readRawStateRecord,
  removeStateFile,
  sha256,
} from "./state-files.mjs";
import { validateStatePayload } from "./state-schema.mjs";
import {
  acquireStateGate,
  bindingsMatch,
  ConcurrentCanaryError,
  GATE_KIND,
  LOCK_KIND,
  newOwner,
  rootBinding,
  verifyGate,
} from "./state-lock.mjs";

export {
  acquireCheckoutRecoveryLock,
  acquireStateGate,
  ConcurrentCanaryError,
  GATE_KIND,
  LOCK_KIND,
} from "./state-lock.mjs";

export const JOURNAL_KIND = "pi-host-compatibility-canary-recovery-journal";
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

function readStateRecord(filePath, expectedKind, maxBytes) {
  const record = readRawStateRecord(filePath, expectedKind, maxBytes);
  validateStatePayload(record.payload, expectedKind);
  return record;
}

export class RecoveryRequiredError extends IntegrityError {
  constructor(message) {
    super(message);
    this.name = "RecoveryRequiredError";
    this.code = "PI_HOST_COMPAT_RECOVERY_REQUIRED";
  }
}

function assertRegularMetadataFile(filePath, label, required = true) {
  const stats = lstatSync(filePath, { bigint: true, throwIfNoEntry: false });
  if (!stats) {
    if (!required) return null;
    throw new IntegrityError(`${label} is missing: ${filePath}`);
  }
  if (!stats.isFile() || stats.isSymbolicLink()) throw new IntegrityError(`${label} must be a regular file: ${filePath}`);
  const contents = readFileSync(filePath);
  return { digest: sha256(contents), size: Number(stats.size), identity: identityOf(stats), contents };
}

export function manifestStateBinding(manifest) {
  const declared = path.resolve(manifest.manifestPath);
  const stats = lstatSync(declared, { bigint: true });
  if (!stats.isFile() || stats.isSymbolicLink()) throw new IntegrityError("mutation manifest must be a regular non-symlink file");
  const canonical = realpathSync(declared);
  const relativePath = path.relative(CANONICAL_ROOT, canonical);
  if (relativePath.startsWith("..") || path.isAbsolute(relativePath)) {
    throw new IntegrityError("mutation manifest must stay inside the canonical checkout");
  }
  const metadata = assertRegularMetadataFile(canonical, "mutation manifest");
  return { relativePath, digest: metadata.digest, identity: metadata.identity };
}

export function packageMetadataBinding(packageAbs) {
  const packageJson = assertRegularMetadataFile(path.join(packageAbs, "package.json"), "package manifest");
  let parsed;
  try { parsed = JSON.parse(packageJson.contents.toString("utf8")); }
  catch { throw new IntegrityError(`package manifest is malformed: ${path.relative(CANONICAL_ROOT, packageAbs)}`); }
  const packageLock = assertRegularMetadataFile(path.join(packageAbs, "package-lock.json"), "package lock", false);
  return {
    packageJsonDigest: packageJson.digest,
    packageName: typeof parsed.name === "string" ? parsed.name : null,
    packageVersion: typeof parsed.version === "string" ? parsed.version : null,
    packageLock: packageLock ? { present: true, digest: packageLock.digest } : { present: false, digest: null },
  };
}

function validateRecordBindings(payload, manifestBinding) {
  if (!bindingsMatch(payload.root, rootBinding())) throw new IntegrityError("recovery state belongs to a different checkout identity");
  if (
    payload.manifest?.relativePath !== manifestBinding.relativePath ||
    payload.manifest?.digest !== manifestBinding.digest ||
    !identitiesMatch(payload.manifest?.identity, manifestBinding.identity)
  ) throw new IntegrityError("recovery state manifest identity or checksum drifted");
  if (!UUID_PATTERN.test(payload.runId ?? "")) throw new IntegrityError("recovery state has an invalid run id");
}

function journalInventory(paths) {
  if (!existsSync(paths.journalsDir)) return [];
  const journals = [];
  for (const entry of readdirSync(paths.journalsDir, { withFileTypes: true })) {
    const candidate = /^\.([0-9a-f-]{36})\.json\.([0-9a-f-]{36})\.tmp$/.exec(entry.name);
    if (candidate && UUID_PATTERN.test(candidate[1]) && UUID_PATTERN.test(candidate[2])) {
      const candidatePath = path.join(paths.journalsDir, entry.name);
      const stats = lstatSync(candidatePath, { bigint: true });
      if (
        !entry.isFile() || entry.isSymbolicLink() ||
        typeof process.geteuid !== "function" || Number(stats.uid) !== process.geteuid() ||
        (Number(stats.mode) & 0o077) !== 0
      ) throw new IntegrityError(`unpublished recovery journal candidate is unsafe: ${entry.name}`);
      // The canonical journal remains authoritative until atomic rename publishes this candidate.
      continue;
    }
    if (!entry.isFile() || entry.isSymbolicLink() || !UUID_PATTERN.test(entry.name.replace(/\.json$/, "")) || !entry.name.endsWith(".json")) {
      throw new IntegrityError(`unexpected recovery journal entry: ${entry.name}`);
    }
    journals.push(path.join(paths.journalsDir, entry.name));
  }
  if (journals.length > 1) throw new IntegrityError("multiple recovery journals exist for this checkout");
  return journals;
}

export function readCheckoutState(paths, manifestBinding) {
  const journals = journalInventory(paths);
  const lock = existsSync(paths.lockPath)
    ? readStateRecord(paths.lockPath, LOCK_KIND, MAX_LOCK_BYTES)
    : null;
  const recoveryLock = existsSync(paths.recoveryLockPath)
    ? readStateRecord(paths.recoveryLockPath, GATE_KIND, MAX_LOCK_BYTES)
    : null;
  const journal = journals.length === 1
    ? readStateRecord(journals[0], JOURNAL_KIND, MAX_JOURNAL_BYTES)
    : null;
  if (lock) validateRecordBindings(lock.payload, manifestBinding);
  if (recoveryLock) verifyGate(recoveryLock);
  if (journal) validateRecordBindings(journal.payload, manifestBinding);
  if (lock && journal && lock.payload.runId !== journal.payload.runId) {
    throw new IntegrityError("mutation lock and recovery journal run ids differ");
  }
  if (
    lock && journal &&
    (
      lock.payload.owner?.token !== journal.payload.owner?.token ||
      JSON.stringify(lock.payload.owner?.identity) !== JSON.stringify(journal.payload.owner?.identity)
    )
  ) throw new IntegrityError("mutation lock and recovery journal owner identities differ");
  if (journal && path.basename(journal.path) !== `${journal.payload.runId}.json`) {
    throw new IntegrityError("recovery journal filename does not match its run id");
  }
  return { lock, journal, recoveryLock };
}

function initialLockPayload(runId, owner, manifestBinding, state) {
  return {
    kind: LOCK_KIND,
    runId,
    owner,
    root: rootBinding(),
    manifest: manifestBinding,
    state,
    createdAt: new Date().toISOString(),
  };
}

function initialJournalPayload(runId, owner, manifestBinding, profile) {
  const now = new Date().toISOString();
  return {
    kind: JOURNAL_KIND,
    runId,
    revision: 0,
    createdAt: now,
    updatedAt: now,
    owner,
    root: rootBinding(),
    manifest: manifestBinding,
    profile,
    phase: "ready",
    scenarioId: null,
    child: null,
    targets: [],
  };
}

function normalizedIdentity(identity) {
  return identity ? { dev: String(identity.dev), ino: String(identity.ino) } : null;
}

function normalizedSnapshot(snapshot) {
  return (snapshot ?? []).map((entry) => ({
    packageName: entry.packageName,
    installedVersion: entry.installedVersion ?? null,
  }));
}

export class MutationSession {
  constructor(paths, lockToken, journalPath, payload) {
    this.paths = paths;
    this.lockToken = lockToken;
    this.journalPath = journalPath;
    this.payload = payload;
    this.entryIndexes = new WeakMap();
  }

  persist() {
    validateStatePayload(this.payload, JOURNAL_KIND);
    this.payload.revision += 1;
    this.payload.updatedAt = new Date().toISOString();
    atomicWriteStateRecord(this.journalPath, this.payload, MAX_JOURNAL_BYTES);
  }

  bindScenario(scenario, host, entries) {
    this.payload.phase = "pre-alignment";
    this.payload.scenarioId = scenario.id;
    this.payload.host = {
      packageName: host.packageName,
      companionPackages: [...host.companionPackages],
      version: host.version,
    };
    this.payload.child = null;
    this.payload.targets = entries.map((entry, index) => {
      this.entryIndexes.set(entry, index);
      const metadata = packageMetadataBinding(entry.packageAbs);
      return {
        index,
        declaredPath: entry.declaredPath,
        canonicalPackagePath: entry.canonicalPackagePath,
        packageIdentity: normalizedIdentity(entry.packageIdentity),
        metadata,
        initialNodeModules: {
          kind: entry.nodeModulesBefore.kind,
          identity: normalizedIdentity(entry.nodeModulesBefore.identity),
        },
        restoreSnapshot: normalizedSnapshot(entry.restoreSnapshot),
        state: "baselined",
        artifactToken: randomBytes(32).toString("hex"),
        stageIdentity: null,
        ownedNodeModulesIdentity: null,
        quarantineIdentity: null,
      };
    });
    this.persist();
  }

  target(entry) {
    const index = this.entryIndexes.get(entry);
    if (!Number.isInteger(index) || !this.payload.targets[index]) {
      throw new IntegrityError("target is not bound to the active recovery journal");
    }
    return this.payload.targets[index];
  }

  artifactNames(entry) {
    const target = this.target(entry);
    const prefix = `.node_modules.pi-host-compat-${this.payload.runId}-${target.index}`;
    return { stage: `${prefix}.stage`, quarantine: `${prefix}.quarantine` };
  }

  artifactToken(entry) {
    return this.target(entry).artifactToken;
  }

  validateEntryMetadata(entry) {
    return validateTargetMetadata(this.target(entry), entry.packageAbs);
  }

  transition(entry, state, details = {}) {
    const target = this.target(entry);
    target.state = state;
    for (const name of ["stageIdentity", "ownedNodeModulesIdentity", "quarantineIdentity"]) {
      if (name in details) target[name] = normalizedIdentity(details[name]);
    }
    this.payload.phase = details.phase ?? state;
    this.persist();
  }

  recordChild(entry, effect, identity) {
    const target = this.target(entry);
    this.payload.child = { effect, targetIndex: target.index, identity };
    this.persist();
  }

  recordAlignmentEffectsIntent() {
    for (const target of this.payload.targets) {
      if (target.state === "baselined") target.state = "alignment-exposed";
    }
    this.payload.phase = "alignment-exposed";
    this.persist();
  }

  recordScenarioIntent() {
    for (const target of this.payload.targets) target.state = "scenario-intent";
    this.payload.phase = "scenario-intent";
    this.persist();
  }

  recordScenarioChild(identity) {
    this.payload.child = { effect: "scenario", targetIndex: null, identity };
    this.persist();
  }

  clearChild() {
    if (!this.payload.child) return;
    this.payload.child = null;
    this.persist();
  }

  hasRecordedChild() {
    return Boolean(this.payload.child);
  }

  markTargetRestored(entry) {
    this.transition(entry, "restored", { phase: "restoring" });
  }

  completeScenario() {
    if (this.payload.targets.some((target) => !["baselined", "restored"].includes(target.state))) {
      throw new IntegrityError("cannot close a scenario with unresolved target effects");
    }
    this.payload.phase = "ready";
    this.payload.scenarioId = null;
    this.payload.child = null;
    this.payload.targets = [];
    delete this.payload.host;
    this.persist();
    this.entryIndexes = new WeakMap();
  }

  canFinalize() {
    return this.payload.phase === "ready" && this.payload.targets.length === 0 && !this.payload.child;
  }

  finalize() {
    if (!this.canFinalize()) return false;
    this.payload.phase = "clean";
    this.persist();
    const gate = acquireStateGate();
    try {
      const binding = this.payload.manifest;
      const state = readCheckoutState(gate.paths, binding, { cleanupCandidates: true });
      if (!state.lock || !state.journal) throw new IntegrityError("mutation state disappeared before finalization");
      if (state.lock.payload.owner?.token !== this.lockToken || state.lock.payload.runId !== this.payload.runId) {
        throw new ConcurrentCanaryError("mutation lock ownership changed before finalization");
      }
      removeStateFile(gate.paths.lockPath, state.lock.identity, LOCK_KIND, MAX_LOCK_BYTES);
      removeStateFile(this.journalPath, state.journal.identity, JOURNAL_KIND, MAX_JOURNAL_BYTES);
      return true;
    } finally {
      gate.release();
    }
  }
}

export function beginMutationSession(manifest, profile, env = process.env) {
  const manifestBinding = manifestStateBinding(manifest);
  const gate = acquireStateGate(env);
  try {
    const existing = readCheckoutState(gate.paths, manifestBinding);
    if (existing.recoveryLock) {
      const liveness = processLiveness(existing.recoveryLock.payload.owner.identity);
      if (liveness === "active") throw new ConcurrentCanaryError("checkout recovery is active");
      throw new IntegrityError("stale checkout recovery claim blocks mutation");
    }
    if (existing.lock || existing.journal) throw new RecoveryRequiredError("unresolved canary mutation state blocks a new run");
    gate.assertOwned();
    const runId = randomUUID();
    const owner = newOwner();
    const initializing = initialLockPayload(runId, owner, manifestBinding, "initializing");
    if (!createExclusiveStateRecord(
      gate.paths.lockPath,
      initializing,
      MAX_LOCK_BYTES,
      { privateDirectory: false },
    )) {
      throw new ConcurrentCanaryError("another canary mutation run acquired the checkout lock");
    }
    const journalPath = path.join(gate.paths.journalsDir, `${runId}.json`);
    try {
      const journal = initialJournalPayload(runId, owner, manifestBinding, profile);
      atomicWriteStateRecord(journalPath, journal, MAX_JOURNAL_BYTES);
      atomicWriteStateRecord(
        gate.paths.lockPath,
        initialLockPayload(runId, owner, manifestBinding, "journal-ready"),
        MAX_LOCK_BYTES,
        { privateDirectory: false },
      );
      return new MutationSession(gate.paths, owner.token, journalPath, journal);
    } catch (error) {
      const lock = readStateRecord(gate.paths.lockPath, LOCK_KIND, MAX_LOCK_BYTES);
      if (lock.payload.state === "initializing") {
        removeStateFile(gate.paths.lockPath, lock.identity, LOCK_KIND, MAX_LOCK_BYTES);
      }
      throw error;
    }
  } finally {
    gate.release();
  }
}

export function validateTargetMetadata(target, packageAbs) {
  const current = packageMetadataBinding(packageAbs);
  if (
    current.packageJsonDigest !== target.metadata?.packageJsonDigest ||
    current.packageName !== target.metadata?.packageName ||
    current.packageVersion !== target.metadata?.packageVersion ||
    current.packageLock.present !== target.metadata?.packageLock?.present ||
    current.packageLock.digest !== target.metadata?.packageLock?.digest
  ) throw new IntegrityError(`package metadata drifted for ${target.declaredPath}`);
  return current;
}

export function persistRecoveredJournal(journalRecord, payload) {
  validateStatePayload(payload, JOURNAL_KIND);
  payload.revision += 1;
  payload.updatedAt = new Date().toISOString();
  atomicWriteStateRecord(journalRecord.path, payload, MAX_JOURNAL_BYTES);
  return readStateRecord(journalRecord.path, JOURNAL_KIND, MAX_JOURNAL_BYTES);
}

export function recordLiveness(record) {
  return record ? processLiveness(record.payload.owner?.identity) : null;
}

export function childLiveness(journal) {
  return journal?.payload.child ? processLiveness(journal.payload.child.identity) : null;
}
