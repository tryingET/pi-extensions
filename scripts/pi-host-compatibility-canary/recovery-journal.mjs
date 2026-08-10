// ---
// summary: "Owns fenced mutation sessions and durable versioned recovery-journal transitions."
// read_when:
//   - "Changing canary journal creation, ownership fencing, transitions, or finalization."
// ---
import { randomBytes, randomUUID } from "node:crypto";
import path from "node:path";
import { identitiesMatch, IntegrityError } from "./integrity.mjs";
import {
  atomicWriteStateRecord,
  createExclusiveStateRecord,
  MAX_JOURNAL_BYTES,
  MAX_LOCK_BYTES,
  readStateRecord as readRawStateRecord,
  removeStateFile,
  sha256,
} from "./state-files.mjs";
import { validateStatePayload } from "./state-schema.mjs";
import {
  acquireStateGate,
  ConcurrentCanaryError,
  LOCK_KIND,
  newOwner,
  ownersMatch,
  rootBinding,
} from "./state-lock.mjs";
import {
  JOURNAL_KIND,
  manifestStateBinding,
  packageMetadataBinding,
  readCheckoutState,
  validateTargetMetadata,
} from "./state-store.mjs";

export class RecoveryRequiredError extends IntegrityError {
  constructor(message) {
    super(message);
    this.name = "RecoveryRequiredError";
    this.code = "PI_HOST_COMPAT_RECOVERY_REQUIRED";
  }
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

function assertJournalOwner(record, expectedRecord, expectedPayload) {
  if (!identitiesMatch(record.identity, expectedRecord.identity)) {
    throw new ConcurrentCanaryError("recovery journal file identity changed");
  }
  if (
    record.payload.runId !== expectedPayload.runId ||
    !ownersMatch(record.payload.owner, expectedPayload.owner) ||
    record.payload.revision !== expectedRecord.payload.revision
  ) throw new ConcurrentCanaryError("recovery journal ownership or revision changed");
}

export function persistRecoveredJournal(journalRecord, payload) {
  validateStatePayload(payload, JOURNAL_KIND);
  const current = readRawStateRecord(journalRecord.path, JOURNAL_KIND, MAX_JOURNAL_BYTES);
  validateStatePayload(current.payload, JOURNAL_KIND);
  assertJournalOwner(current, journalRecord, payload);
  payload.revision = current.payload.revision + 1;
  payload.updatedAt = new Date().toISOString();
  validateStatePayload(payload, JOURNAL_KIND);
  const published = atomicWriteStateRecord(
    journalRecord.path,
    payload,
    MAX_JOURNAL_BYTES,
    { expectedIdentity: current.identity },
  );
  validateStatePayload(published.payload, JOURNAL_KIND);
  if (
    published.payload.runId !== current.payload.runId ||
    !ownersMatch(published.payload.owner, current.payload.owner) ||
    published.payload.revision !== payload.revision ||
    sha256(JSON.stringify(published.payload)) !== sha256(JSON.stringify(payload))
  ) throw new ConcurrentCanaryError("recovery journal publication lost its ownership fence");
  return { ...published, payload };
}

export class MutationSession {
  constructor({ paths, env, owner, manifestBinding, lockRecord, journalRecord }) {
    this.paths = paths;
    this.env = { XDG_STATE_HOME: env.XDG_STATE_HOME, HOME: env.HOME };
    this.owner = owner;
    this.manifestBinding = manifestBinding;
    this.lockRecord = lockRecord;
    this.journalRecord = journalRecord;
    this.payload = journalRecord.payload;
    this.lockDigest = sha256(JSON.stringify(lockRecord.payload));
    this.journalDigest = sha256(JSON.stringify(journalRecord.payload));
    this.entryIndexes = new WeakMap();
    this.closed = false;
  }

  verifyStaticFence(state) {
    if (!state.lock || !state.journal) {
      throw new ConcurrentCanaryError("mutation lock or recovery journal disappeared");
    }
    if (state.recoveryLock) throw new ConcurrentCanaryError("checkout recovery appeared during mutation");
    if (
      !identitiesMatch(state.lock.identity, this.lockRecord.identity) ||
      state.lock.payload.runId !== this.payload.runId ||
      state.lock.payload.state !== "journal-ready" ||
      !ownersMatch(state.lock.payload.owner, this.owner) ||
      sha256(JSON.stringify(state.lock.payload)) !== this.lockDigest
    ) throw new ConcurrentCanaryError("mutation checkout-lock ownership changed");
  }

  verifyFence(state) {
    this.verifyStaticFence(state);
    if (
      state.journal.path !== this.journalRecord.path ||
      !identitiesMatch(state.journal.identity, this.journalRecord.identity) ||
      state.journal.payload.revision !== this.journalRecord.payload.revision ||
      state.journal.payload.runId !== this.payload.runId ||
      !ownersMatch(state.journal.payload.owner, this.owner) ||
      sha256(JSON.stringify(state.journal.payload)) !== this.journalDigest
    ) throw new ConcurrentCanaryError("mutation recovery-journal ownership changed");
  }

  withFence(operation) {
    if (this.closed) throw new ConcurrentCanaryError("mutation session is already closed");
    const gate = acquireStateGate(this.env);
    try {
      if (gate.paths.checkoutDir !== this.paths.checkoutDir) {
        throw new IntegrityError("mutation state-home binding changed");
      }
      const state = readCheckoutState(gate.paths, this.manifestBinding);
      this.verifyFence(state);
      gate.assertOwned();
      return operation?.(state, gate);
    } finally {
      gate.release();
    }
  }

  assertOwned() {
    this.withFence();
  }

  persist() {
    const next = structuredClone(this.payload);
    next.revision = this.journalRecord.payload.revision + 1;
    next.updatedAt = new Date().toISOString();
    validateStatePayload(next, JOURNAL_KIND);
    this.withFence((state, gate) => {
      const published = atomicWriteStateRecord(
        this.journalRecord.path,
        next,
        MAX_JOURNAL_BYTES,
        { expectedIdentity: state.journal.identity },
      );
      validateStatePayload(published.payload, JOURNAL_KIND);
      gate.assertOwned();
      const after = readCheckoutState(gate.paths, this.manifestBinding);
      this.verifyStaticFence(after);
      if (
        !identitiesMatch(after.journal?.identity, published.identity) ||
        after.journal?.payload.revision !== next.revision ||
        !ownersMatch(after.journal?.payload.owner, this.owner) ||
        sha256(JSON.stringify(after.journal?.payload)) !== sha256(JSON.stringify(next))
      ) throw new ConcurrentCanaryError("published recovery journal failed its ownership fence");
      this.journalRecord = after.journal;
      this.payload = after.journal.payload;
      this.journalDigest = sha256(JSON.stringify(after.journal.payload));
    });
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
      return {
        index,
        declaredPath: entry.declaredPath,
        canonicalPackagePath: entry.canonicalPackagePath,
        packageIdentity: normalizedIdentity(entry.packageIdentity),
        metadata: packageMetadataBinding(entry.packageAbs),
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
    const gate = acquireStateGate(this.env);
    try {
      const state = readCheckoutState(gate.paths, this.manifestBinding);
      this.verifyFence(state);
      gate.assertOwned();
      removeStateFile(gate.paths.lockPath, state.lock.identity, LOCK_KIND, MAX_LOCK_BYTES);
      gate.assertOwned();
      removeStateFile(state.journal.path, state.journal.identity, JOURNAL_KIND, MAX_JOURNAL_BYTES);
      this.closed = true;
      return true;
    } finally {
      gate.release();
    }
  }
}

export function beginMutationSession(manifest, profile, env = process.env) {
  const manifestBinding = manifestStateBinding(manifest);
  const gate = acquireStateGate(env);
  let runId;
  let owner;
  try {
    const existing = readCheckoutState(gate.paths, manifestBinding);
    if (existing.recoveryLock) {
      throw new ConcurrentCanaryError("checkout recovery is active or unresolved");
    }
    if (existing.lock || existing.journal) {
      throw new RecoveryRequiredError("unresolved canary mutation state blocks a new run");
    }
    gate.assertOwned();
    runId = randomUUID();
    owner = newOwner();
    if (!createExclusiveStateRecord(
      gate.paths.lockPath,
      initialLockPayload(runId, owner, manifestBinding, "initializing"),
      MAX_LOCK_BYTES,
      { privateDirectory: false },
    )) throw new ConcurrentCanaryError("another canary mutation run acquired the checkout lock");
    let state = readCheckoutState(gate.paths, manifestBinding);
    if (!state.lock || state.journal || !ownersMatch(state.lock.payload.owner, owner)) {
      throw new ConcurrentCanaryError("initial mutation lock publication lost ownership");
    }
    const initialLockIdentity = state.lock.identity;
    const journalPath = path.join(gate.paths.journalsDir, `${runId}.json`);
    gate.assertOwned();
    atomicWriteStateRecord(
      journalPath,
      initialJournalPayload(runId, owner, manifestBinding, profile),
      MAX_JOURNAL_BYTES,
      { expectedAbsent: true },
    );
    state = readCheckoutState(gate.paths, manifestBinding);
    if (
      !state.lock || !state.journal ||
      !identitiesMatch(state.lock.identity, initialLockIdentity) ||
      !ownersMatch(state.lock.payload.owner, owner) ||
      !ownersMatch(state.journal.payload.owner, owner)
    ) throw new ConcurrentCanaryError("initial recovery journal publication lost ownership");
    gate.assertOwned();
    atomicWriteStateRecord(
      gate.paths.lockPath,
      initialLockPayload(runId, owner, manifestBinding, "journal-ready"),
      MAX_LOCK_BYTES,
      { privateDirectory: false, expectedIdentity: state.lock.identity },
    );
    const ready = readCheckoutState(gate.paths, manifestBinding);
    if (
      !ready.lock || !ready.journal || ready.lock.payload.state !== "journal-ready" ||
      !ownersMatch(ready.lock.payload.owner, owner) || !ownersMatch(ready.journal.payload.owner, owner)
    ) throw new ConcurrentCanaryError("mutation session publication failed its ownership barrier");
    return new MutationSession({
      paths: gate.paths,
      env,
      owner,
      manifestBinding,
      lockRecord: ready.lock,
      journalRecord: ready.journal,
    });
  } catch (error) {
    try {
      const state = readCheckoutState(gate.paths, manifestBinding);
      const ownsLock = state.lock?.payload.runId === runId && ownersMatch(state.lock.payload.owner, owner);
      const ownsJournal = state.journal?.payload.runId === runId && ownersMatch(state.journal.payload.owner, owner);
      const safeJournal = ownsJournal && state.journal.payload.phase === "ready" && state.journal.payload.targets.length === 0;
      if (safeJournal) {
        gate.assertOwned();
        removeStateFile(state.journal.path, state.journal.identity, JOURNAL_KIND, MAX_JOURNAL_BYTES);
      }
      if (ownsLock && (state.lock.payload.state === "initializing" || safeJournal)) {
        gate.assertOwned();
        removeStateFile(gate.paths.lockPath, state.lock.identity, LOCK_KIND, MAX_LOCK_BYTES);
      }
    } catch {}
    throw error;
  } finally {
    gate.release();
  }
}
