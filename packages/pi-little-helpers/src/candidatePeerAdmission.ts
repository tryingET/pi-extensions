import { createHash, randomUUID } from "node:crypto";
import {
  existsSync,
  lstatSync,
  readdirSync,
  readFileSync,
  readlinkSync,
  realpathSync,
  statSync,
} from "node:fs";
import { isAbsolute, join, relative, resolve } from "node:path";
import {
  type CandidateAdmissionConfig,
  type CandidateAdmissionDecisionArtifact,
  type CandidateAdmissionPermit,
  type CandidateAdmissionPressure,
  type CandidateAdmissionReservation,
  type CandidateAdmissionWarningAcknowledgement,
  candidateAdmissionPermitPath,
  candidateObjectiveDigest,
  commitCandidateAdmissionActivation,
  getCandidateAdmissionConfigPath,
  getCandidateAdmissionRoot,
  getCandidateSpawnHoldPath,
  listCandidateAdmissionPermits,
  readAdmissionJson,
  readCandidateAdmissionConfig,
  recoverCandidateAdmissionActivation,
  withCandidateAdmissionLock,
  writeAdmissionJson,
} from "./candidatePeerAdmissionState.ts";
import { verifyCleanedCandidateTerminalRecord } from "./candidatePeerLifecycleArchive.ts";
import {
  type CandidateInventoryResource,
  type CandidateLifecycleRecord,
  digestObject,
  getCandidateLifecycleEventsPath,
  getCandidateLifecycleRecordPath,
  getCandidateLifecycleRoot,
  inventoryCandidatePeerResources,
  readLifecycleRecord,
} from "./candidatePeerLifecycleV2.ts";
import { getCandidatePeerRegistryDir } from "./candidatePeerRegistry.ts";

export {
  CANDIDATE_ADMISSION_SCHEMA_VERSION,
  type CandidateAdmissionConfig,
  type CandidateAdmissionDecisionArtifact,
  type CandidateAdmissionLimits,
  type CandidateAdmissionPermit,
  type CandidateAdmissionPressure,
  type CandidateAdmissionReservation,
  type CandidateAdmissionWarningAcknowledgement,
  getCandidateAdmissionConfigPath,
  getCandidateAdmissionRoot,
  getCandidateSpawnHoldPath,
  readCandidateAdmissionConfig,
  writeCandidateAdmissionConfig,
} from "./candidatePeerAdmissionState.ts";

const TERMINAL_STATES = new Set(["cleaned", "closed_with_retained_effects", "reconciled_missing"]);

function resourceRepository(resource: CandidateInventoryResource): string {
  return resource.repoRoots.length === 1 ? resolve(resource.repoRoots[0]) : "<ambiguous>";
}

function emptyRepoPressure() {
  return {
    unresolvedResources: 0,
    unresolvedBytes: 0,
    oldestUnresolvedAgeMs: 0,
    activeAdmissions: 0,
  };
}

function finiteTimestamp(value: string, label: string): number {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)) {
    throw new Error(`${label} must be a canonical UTC timestamp`);
  }
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp) || new Date(timestamp).toISOString() !== value) {
    throw new Error(`${label} must be a real canonical UTC timestamp`);
  }
  return timestamp;
}

function candidateResourceContentDigest(root: string): string {
  const hash = createHash("sha256");
  const stack = [{ absolute: resolve(root), relativePath: "." }];
  while (stack.length > 0) {
    const entry = stack.pop();
    if (!entry) break;
    const info = lstatSync(entry.absolute);
    const mode = info.mode & 0o7777;
    if (info.isSymbolicLink()) {
      hash.update(`L\0${entry.relativePath}\0${mode}\0${readlinkSync(entry.absolute)}\0`);
      continue;
    }
    if (info.isDirectory()) {
      hash.update(`D\0${entry.relativePath}\0${mode}\0`);
      const children = readdirSync(entry.absolute).sort().reverse();
      for (const child of children) {
        stack.push({
          absolute: join(entry.absolute, child),
          relativePath: entry.relativePath === "." ? child : join(entry.relativePath, child),
        });
      }
      continue;
    }
    if (!info.isFile())
      throw new Error(`unsupported candidate inventory file type: ${entry.absolute}`);
    hash.update(`F\0${entry.relativePath}\0${mode}\0${info.size}\0`);
    hash.update(readFileSync(entry.absolute));
    hash.update("\0");
  }
  return hash.digest("hex");
}

export function captureCandidateAdmissionPressure(
  env: NodeJS.ProcessEnv = process.env,
  now = new Date().toISOString(),
): CandidateAdmissionPressure {
  const nowMs = Date.parse(now);
  if (!Number.isFinite(nowMs)) throw new Error("invalid admission pressure timestamp");
  const inventory = inventoryCandidatePeerResources({
    registryDir: getCandidatePeerRegistryDir(env),
    now,
    measureBytes: true,
  });
  const activePermits = listCandidateAdmissionPermits(env).filter(
    (permit) => permit.status === "reserved",
  );
  const unresolved = inventory.resources.filter((resource) => {
    try {
      return !TERMINAL_STATES.has(readLifecycleRecord(resource.resourceId, env).state);
    } catch {
      return true;
    }
  });
  const contentDigests = Object.fromEntries(
    unresolved
      .filter((resource) => resource.exists)
      .map((resource) => [
        resource.resourceId,
        candidateResourceContentDigest(resource.worktreePath),
      ]),
  );
  const inventoryDigest = digestObject({
    registryDir: inventory.registryDir,
    registryRecordCount: inventory.registryRecordCount,
    resources: inventory.resources,
    contentDigests,
  });
  const byRepository: CandidateAdmissionPressure["byRepository"] = {};
  let unresolvedBytes = 0;
  let oldestUnresolvedAgeMs = 0;
  for (const resource of unresolved) {
    const repoRoot = resourceRepository(resource);
    if (!byRepository[repoRoot]) byRepository[repoRoot] = emptyRepoPressure();
    const row = byRepository[repoRoot];
    const bytes = resource.sizeBytes ?? 0;
    const age = Math.max(0, nowMs - Date.parse(resource.updatedAt));
    row.unresolvedResources += 1;
    row.unresolvedBytes += bytes;
    row.oldestUnresolvedAgeMs = Math.max(row.oldestUnresolvedAgeMs, age);
    unresolvedBytes += bytes;
    oldestUnresolvedAgeMs = Math.max(oldestUnresolvedAgeMs, age);
  }
  let reservationOnlyCount = 0;
  let reservationOnlyBytes = 0;
  for (const permit of activePermits) {
    const repoRoot = resolve(permit.repoRoot);
    if (!byRepository[repoRoot]) byRepository[repoRoot] = emptyRepoPressure();
    const row = byRepository[repoRoot];
    row.activeAdmissions += 1;
    const representedResource = permit.worktreePath
      ? unresolved.find(
          (resource) => resolve(resource.worktreePath) === resolve(permit.worktreePath ?? ""),
        )
      : undefined;
    if (representedResource) {
      const reservationTopUp = Math.max(
        0,
        permit.reservationBytes - (representedResource.sizeBytes ?? 0),
      );
      row.unresolvedBytes += reservationTopUp;
      reservationOnlyBytes += reservationTopUp;
    } else {
      row.unresolvedResources += 1;
      row.unresolvedBytes += permit.reservationBytes;
      reservationOnlyCount += 1;
      reservationOnlyBytes += permit.reservationBytes;
    }
  }
  const activeAdmissionIds = activePermits.map((permit) => permit.admissionId).sort();
  return {
    capturedAt: now,
    inventoryDigest,
    unresolvedResources: unresolved.length + reservationOnlyCount,
    unresolvedBytes: unresolvedBytes + reservationOnlyBytes,
    oldestUnresolvedAgeMs,
    activeAdmissions: activePermits.length,
    byRepository,
    activeAdmissionIds,
    stateDigest: digestObject({ inventoryDigest, activeAdmissionIds }),
  };
}

function thresholdBlockers(
  pressure: CandidateAdmissionPressure,
  repoRoot: string,
  reservationBytes: number,
  config: CandidateAdmissionConfig,
): string[] {
  const repo = pressure.byRepository[repoRoot] ?? emptyRepoPressure();
  const limits = config.repositories[repoRoot];
  if (!limits) return [`repository is not admitted by owner config: ${repoRoot}`];
  const blockers: string[] = [];
  if (pressure.unresolvedResources + 1 > config.global.maxUnresolvedResources)
    blockers.push("global unresolved resource hard limit exceeded");
  if (pressure.unresolvedBytes + reservationBytes > config.global.maxUnresolvedBytes)
    blockers.push("global unresolved byte hard limit exceeded");
  if (pressure.activeAdmissions + 1 > config.global.maxActiveAdmissions)
    blockers.push("global active admission hard limit exceeded");
  if (pressure.oldestUnresolvedAgeMs > config.global.maxUnresolvedAgeMs)
    blockers.push("global unresolved age hard limit exceeded");
  if (repo.unresolvedResources + 1 > limits.maxUnresolvedResources)
    blockers.push("repository unresolved resource hard limit exceeded");
  if (repo.unresolvedBytes + reservationBytes > limits.maxUnresolvedBytes)
    blockers.push("repository unresolved byte hard limit exceeded");
  if (repo.activeAdmissions + 1 > limits.maxActiveAdmissions)
    blockers.push("repository active admission hard limit exceeded");
  if (repo.oldestUnresolvedAgeMs > limits.maxUnresolvedAgeMs)
    blockers.push("repository unresolved age hard limit exceeded");
  return blockers;
}

function warningsFor(
  pressure: CandidateAdmissionPressure,
  repoRoot: string,
  reservationBytes: number,
  config: CandidateAdmissionConfig,
): string[] {
  const repo = pressure.byRepository[repoRoot] ?? emptyRepoPressure();
  const limits = config.repositories[repoRoot];
  if (!limits) return [];
  const warnings: string[] = [];
  if (
    config.global.warningUnresolvedResources !== undefined &&
    pressure.unresolvedResources + 1 > config.global.warningUnresolvedResources
  )
    warnings.push("global unresolved resource warning threshold crossed");
  if (
    config.global.warningUnresolvedBytes !== undefined &&
    pressure.unresolvedBytes + reservationBytes > config.global.warningUnresolvedBytes
  )
    warnings.push("global unresolved byte warning threshold crossed");
  if (
    config.global.warningUnresolvedAgeMs !== undefined &&
    pressure.oldestUnresolvedAgeMs > config.global.warningUnresolvedAgeMs
  )
    warnings.push("global unresolved age warning threshold crossed");
  if (
    config.global.warningActiveAdmissions !== undefined &&
    pressure.activeAdmissions + 1 > config.global.warningActiveAdmissions
  )
    warnings.push("global active admission warning threshold crossed");
  if (
    limits.warningUnresolvedResources !== undefined &&
    repo.unresolvedResources + 1 > limits.warningUnresolvedResources
  )
    warnings.push("repository unresolved resource warning threshold crossed");
  if (
    limits.warningUnresolvedBytes !== undefined &&
    repo.unresolvedBytes + reservationBytes > limits.warningUnresolvedBytes
  )
    warnings.push("repository unresolved byte warning threshold crossed");
  if (
    limits.warningUnresolvedAgeMs !== undefined &&
    repo.oldestUnresolvedAgeMs > limits.warningUnresolvedAgeMs
  )
    warnings.push("repository unresolved age warning threshold crossed");
  if (
    limits.warningActiveAdmissions !== undefined &&
    repo.activeAdmissions + 1 > limits.warningActiveAdmissions
  )
    warnings.push("repository active admission warning threshold crossed");
  return warnings;
}

function assertHoldCompatible(
  config: CandidateAdmissionConfig,
  permit: CandidateAdmissionPermit,
  env: NodeJS.ProcessEnv,
): void {
  const path = getCandidateSpawnHoldPath(env);
  if (!existsSync(path))
    throw new Error("candidate spawn hold artifact is missing; admission fails closed");
  const hold = readAdmissionJson<{ status?: string; supersededByDecisionRef?: string }>(path);
  if (config.mode === "canary") {
    if (hold.status !== "active" || !permit.canary)
      throw new Error("candidate canary requires the active historical hold and a canary permit");
    return;
  }
  if (
    hold.status !== "superseded_by_admission_v2" ||
    hold.supersededByDecisionRef !== config.ownerDecisionRef
  ) {
    throw new Error("candidate admission is not bound to the superseding owner decision");
  }
}

export function authorizeCandidateAdmission(
  input: {
    repoRoot: string;
    objective: string;
    actor: string;
    taskRef: string;
    reservationBytes: number;
    expiresAt: string;
    warningAcknowledgement?: CandidateAdmissionWarningAcknowledgement;
  },
  env: NodeJS.ProcessEnv = process.env,
  now = new Date().toISOString(),
): CandidateAdmissionPermit {
  return withCandidateAdmissionLock(env, () => {
    const config = readCandidateAdmissionConfig(env);
    const repoRoot = resolve(input.repoRoot);
    const pressure = captureCandidateAdmissionPressure(env, now);
    const blockers = thresholdBlockers(pressure, repoRoot, input.reservationBytes, config);
    if (blockers.length > 0) throw new Error(`candidate admission blocked: ${blockers.join("; ")}`);
    const warnings = warningsFor(pressure, repoRoot, input.reservationBytes, config);
    const nowMs = finiteTimestamp(now, "candidate admission authorization time");
    const permitExpiresAt = finiteTimestamp(input.expiresAt, "candidate admission expiry");
    const acknowledgement = input.warningAcknowledgement;
    if (warnings.length > 0) {
      if (
        !acknowledgement ||
        acknowledgement.actor !== input.actor.trim() ||
        acknowledgement.inventoryDigest !== pressure.inventoryDigest ||
        digestObject(acknowledgement.warnings) !== digestObject(warnings) ||
        !acknowledgement.reason.trim() ||
        finiteTimestamp(
          acknowledgement.expiresAt,
          "candidate admission warning acknowledgement expiry",
        ) <= nowMs ||
        finiteTimestamp(
          acknowledgement.expiresAt,
          "candidate admission warning acknowledgement expiry",
        ) < permitExpiresAt
      ) {
        throw new Error(
          `candidate admission warning acknowledgement must bind actor, inventory, warnings, reason, and expiry: ${warnings.join("; ")}`,
        );
      }
    } else if (acknowledgement) {
      throw new Error(
        "candidate admission warning acknowledgement supplied without active warnings",
      );
    }
    if (!input.actor.trim() || !input.taskRef.trim() || !input.objective.trim())
      throw new Error("candidate admission requires actor, taskRef, and objective");
    if (!Number.isSafeInteger(input.reservationBytes) || input.reservationBytes < 1)
      throw new Error("reservationBytes must be a positive safe integer");
    if (permitExpiresAt <= nowMs)
      throw new Error("candidate admission expiry must be in the future");
    const admissionId = `cadm-${randomUUID()}`;
    const permit: CandidateAdmissionPermit = {
      schemaVersion: 2,
      admissionId,
      status: "authorized",
      canary: config.mode === "canary",
      actor: input.actor.trim(),
      taskRef: input.taskRef.trim(),
      repoRoot,
      objective: input.objective.trim(),
      objectiveDigest: candidateObjectiveDigest(input.objective),
      reservationBytes: input.reservationBytes,
      authorizedAt: now,
      expiresAt: input.expiresAt,
      configDigest: digestObject(config),
      admissionStateDigest: pressure.stateDigest,
      inventoryDigest: pressure.inventoryDigest,
      ...(acknowledgement ? { warningAcknowledgement: acknowledgement } : {}),
    };
    writeAdmissionJson(candidateAdmissionPermitPath(admissionId, env), permit);
    return permit;
  });
}

export function expireCandidateAdmission(
  input: { admissionId: string },
  env: NodeJS.ProcessEnv = process.env,
  now = new Date().toISOString(),
): CandidateAdmissionPermit {
  return withCandidateAdmissionLock(env, () => {
    const path = candidateAdmissionPermitPath(input.admissionId, env);
    const permit = readAdmissionJson<CandidateAdmissionPermit>(path);
    if (permit.status === "expired") throw new Error("candidate admission is already expired");
    if (permit.status === "released") throw new Error("released candidate admission cannot expire");
    if (permit.status === "reserved") {
      if (permit.peerRunId || permit.worktreePath || permit.branchName)
        throw new Error("bound candidate admission cannot expire");
      throw new Error("reserved candidate admission cannot expire");
    }
    if (permit.status !== "authorized")
      throw new Error(`candidate admission has unsupported status: ${String(permit.status)}`);
    if (
      [permit.reservedAt, permit.peerRunId, permit.worktreePath, permit.branchName].some(
        (value) => value !== undefined,
      )
    ) {
      throw new Error("candidate admission with reservation or binding fields cannot expire");
    }
    const expiryTime = finiteTimestamp(now, "candidate admission expiry transition time");
    const permitExpiresAt = finiteTimestamp(permit.expiresAt, "candidate admission permit expiry");
    if (expiryTime < permitExpiresAt)
      throw new Error("unexpired candidate admission cannot expire");
    const expired: CandidateAdmissionPermit = { ...permit, status: "expired", expiredAt: now };
    writeAdmissionJson(path, expired);
    return expired;
  });
}

export function reserveCandidateAdmission(
  input: { repoRoot: string; objective: string },
  env: NodeJS.ProcessEnv = process.env,
  now = new Date().toISOString(),
): CandidateAdmissionReservation {
  return withCandidateAdmissionLock(env, () => {
    const config = readCandidateAdmissionConfig(env);
    const repoRoot = resolve(input.repoRoot);
    const matches = listCandidateAdmissionPermits(env).filter(
      (permit) =>
        permit.status === "authorized" &&
        permit.repoRoot === repoRoot &&
        permit.objectiveDigest === candidateObjectiveDigest(input.objective),
    );
    if (matches.length !== 1)
      throw new Error(
        `candidate spawn requires exactly one matching authorized permit; found ${matches.length}`,
      );
    const permit = matches[0];
    const reservationTime = finiteTimestamp(now, "candidate admission reservation time");
    if (finiteTimestamp(permit.expiresAt, "candidate admission permit expiry") <= reservationTime)
      throw new Error("candidate admission permit expired");
    if (
      permit.warningAcknowledgement &&
      finiteTimestamp(
        permit.warningAcknowledgement.expiresAt,
        "candidate admission warning acknowledgement expiry",
      ) <= reservationTime
    ) {
      throw new Error("candidate admission warning acknowledgement expired");
    }
    if (permit.configDigest !== digestObject(config))
      throw new Error("candidate admission config drifted after authorization");
    assertHoldCompatible(config, permit, env);
    const pressure = captureCandidateAdmissionPressure(env, now);
    if (
      pressure.stateDigest !== permit.admissionStateDigest ||
      pressure.inventoryDigest !== permit.inventoryDigest
    ) {
      throw new Error("candidate admission state drifted after authorization");
    }
    const blockers = thresholdBlockers(pressure, repoRoot, permit.reservationBytes, config);
    if (blockers.length > 0) throw new Error(`candidate admission blocked: ${blockers.join("; ")}`);
    if (permit.canary && pressure.activeAdmissions !== 0)
      throw new Error("candidate canary requires zero active admissions");
    const reserved: CandidateAdmissionPermit = { ...permit, status: "reserved", reservedAt: now };
    const path = candidateAdmissionPermitPath(permit.admissionId, env);
    writeAdmissionJson(path, reserved);
    return { admissionId: permit.admissionId, permitPath: path, pressure, permit: reserved };
  });
}

export function bindCandidateAdmission(
  input: { admissionId: string; peerRunId: string; worktreePath: string; branchName: string },
  env: NodeJS.ProcessEnv = process.env,
): CandidateAdmissionPermit {
  return withCandidateAdmissionLock(env, () => {
    const path = candidateAdmissionPermitPath(input.admissionId, env);
    const permit = readAdmissionJson<CandidateAdmissionPermit>(path);
    if (permit.status !== "reserved" || permit.peerRunId)
      throw new Error("candidate admission is not an unbound reservation");
    const bound = {
      ...permit,
      peerRunId: input.peerRunId,
      worktreePath: resolve(input.worktreePath),
      branchName: input.branchName,
    };
    writeAdmissionJson(path, bound);
    return bound;
  });
}

function readVerifiedOwnerArtifact<T>(path: string, root: string): { value: T; digest: string } {
  if (!isAbsolute(path)) throw new Error("owner artifact path must be absolute");
  const resolvedRoot = realpathSync(root);
  const resolvedPath = resolve(path);
  const relation = relative(resolvedRoot, resolvedPath);
  if (!relation || relation.startsWith("..") || isAbsolute(relation)) {
    throw new Error("owner artifact must be a descendant of its owner root");
  }
  const info = lstatSync(resolvedPath);
  if (!info.isFile() || info.isSymbolicLink() || (statSync(resolvedPath).mode & 0o077) !== 0) {
    throw new Error("owner artifact must be an owner-only regular file without symlinks");
  }
  if (realpathSync(resolvedPath) !== resolvedPath) {
    throw new Error("owner artifact path changed through a symlink");
  }
  const value = JSON.parse(readFileSync(resolvedPath, "utf8")) as T;
  return { value, digest: digestObject(value) };
}

function verifyTerminalReceipt(
  permit: CandidateAdmissionPermit,
  outcome: CandidateAdmissionPermit["releaseOutcome"],
  ref: string,
  env: NodeJS.ProcessEnv,
): string {
  if (outcome === "preparation_failed") {
    if (
      permit.peerRunId ||
      permit.worktreePath ||
      !/^candidate-preparation-failed:[a-f0-9]{64}$/.test(ref)
    ) {
      throw new Error("preparation failure release does not match an unbound admission receipt");
    }
    return createHash("sha256").update(ref).digest("hex");
  }
  if (!permit.peerRunId || !permit.worktreePath) {
    throw new Error("terminal candidate release requires a bound peer and worktree");
  }
  const artifact = readVerifiedOwnerArtifact<CandidateLifecycleRecord>(
    ref,
    getCandidateLifecycleRoot(env),
  );
  const record = artifact.value;
  if (resolve(ref) !== resolve(getCandidateLifecycleRecordPath(record.resourceId, env))) {
    throw new Error("terminal receipt path is not the canonical lifecycle record path");
  }
  const expectedState = outcome === "terminal_cleaned" ? "cleaned" : "reconciled_missing";
  if (
    record.schemaVersion !== 2 ||
    record.state !== expectedState ||
    !record.terminalReceipt ||
    resolve(record.worktreePath) !== resolve(permit.worktreePath) ||
    !record.aliases.includes(permit.peerRunId) ||
    !record.repoRoots.map((repoRoot) => resolve(repoRoot)).includes(resolve(permit.repoRoot))
  ) {
    throw new Error("terminal lifecycle record does not bind the admitted resource and outcome");
  }
  if (outcome === "terminal_cleaned") {
    return verifyCleanedCandidateTerminalRecord(record, env);
  }
  const receipt = record.terminalReceipt as Record<string, unknown>;
  const unsignedReceipt = {
    actor: receipt.actor,
    recoverable: receipt.recoverable,
    lost: receipt.lost,
    evidence: receipt.evidence,
    worktreePath: receipt.worktreePath,
  };
  if (
    receipt.type !== "reconciled_missing" ||
    receipt.receiptDigest !== digestObject(unsignedReceipt) ||
    existsSync(record.worktreePath)
  ) {
    throw new Error("reconciled-missing terminal receipt schema or digest mismatch");
  }
  const events = readFileSync(getCandidateLifecycleEventsPath(record.resourceId, env), "utf8")
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line) as Record<string, unknown>);
  const finalEvent = events.at(-1);
  if (
    finalEvent?.event !== "reconciled_missing" ||
    digestObject(finalEvent.record) !== digestObject(record)
  ) {
    throw new Error("reconciled-missing record is not the final lifecycle event");
  }
  return artifact.digest;
}

export function releaseCandidateAdmission(
  input: {
    admissionId: string;
    outcome: CandidateAdmissionPermit["releaseOutcome"];
    terminalReceiptRef: string;
  },
  env: NodeJS.ProcessEnv = process.env,
  now = new Date().toISOString(),
): CandidateAdmissionPermit {
  return withCandidateAdmissionLock(env, () => {
    const path = candidateAdmissionPermitPath(input.admissionId, env);
    const permit = readAdmissionJson<CandidateAdmissionPermit>(path);
    if (permit.status !== "reserved") throw new Error("candidate admission is not reserved");
    if (!input.outcome || !input.terminalReceiptRef.trim())
      throw new Error("candidate admission release requires outcome and terminal receipt");
    const terminalReceiptDigest = verifyTerminalReceipt(
      permit,
      input.outcome,
      input.terminalReceiptRef.trim(),
      env,
    );
    const released: CandidateAdmissionPermit = {
      ...permit,
      status: "released",
      releasedAt: now,
      releaseOutcome: input.outcome,
      terminalReceiptRef: input.terminalReceiptRef.trim(),
      terminalReceiptDigest,
    };
    writeAdmissionJson(path, released);
    return released;
  });
}

function verifyAdmissionDecisionArtifact(
  input: {
    decisionRef: string;
    decisionArtifactPath: string;
    decisionArtifactDigest: string;
  },
  config: CandidateAdmissionConfig,
  canary: CandidateAdmissionPermit,
  env: NodeJS.ProcessEnv,
  expectedAdmissionConfigDigest = digestObject(config),
): void {
  const artifact = readVerifiedOwnerArtifact<CandidateAdmissionDecisionArtifact>(
    input.decisionArtifactPath,
    getCandidateAdmissionRoot(env),
  );
  const decision = artifact.value;
  const reviewedAt = finiteTimestamp(decision.reviewedAt, "owner decision review time");
  const releasedAt = finiteTimestamp(canary.releasedAt ?? "", "candidate canary release time");
  if (
    artifact.digest !== input.decisionArtifactDigest ||
    decision.schemaVersion !== 1 ||
    decision.status !== "accepted" ||
    decision.decisionRef !== input.decisionRef ||
    decision.decisionRef !== config.ownerDecisionRef ||
    decision.taskRef !== canary.taskRef ||
    decision.canaryAdmissionId !== canary.admissionId ||
    decision.terminalReceiptDigest !== canary.terminalReceiptDigest ||
    decision.admissionConfigDigest !== expectedAdmissionConfigDigest ||
    reviewedAt < releasedAt
  ) {
    throw new Error(
      "owner decision artifact does not bind the accepted canary and admission config",
    );
  }
}

export function activateCandidateAdmission(
  input: {
    decisionRef: string;
    canaryAdmissionId: string;
    terminalReceiptRef: string;
    decisionArtifactPath: string;
    decisionArtifactDigest: string;
  },
  env: NodeJS.ProcessEnv = process.env,
  now = new Date().toISOString(),
): { config: CandidateAdmissionConfig; holdPath: string } {
  return withCandidateAdmissionLock(env, () => {
    if (!/^AK decision \d+$/.test(input.decisionRef))
      throw new Error("activation requires an exact AK decision reference");
    const requestDigest = digestObject(input);
    const recovery = recoverCandidateAdmissionActivation(requestDigest, env);
    if (recovery.status === "completed") {
      return { config: recovery.config, holdPath: recovery.holdPath };
    }
    const config = readCandidateAdmissionConfig(env);
    const canary = readAdmissionJson<CandidateAdmissionPermit>(
      candidateAdmissionPermitPath(input.canaryAdmissionId, env),
    );
    if (
      !canary.canary ||
      canary.status !== "released" ||
      canary.releaseOutcome !== "terminal_cleaned" ||
      canary.terminalReceiptRef !== input.terminalReceiptRef
    ) {
      throw new Error("candidate admission canary lacks exact successful terminal evidence");
    }
    const holdPath = getCandidateSpawnHoldPath(env);
    const hold = readAdmissionJson<Record<string, unknown>>(holdPath);
    if (config.mode === "active") {
      if (
        config.ownerDecisionRef !== input.decisionRef ||
        config.canaryAdmissionId !== input.canaryAdmissionId ||
        config.canaryTerminalReceiptRef !== input.terminalReceiptRef ||
        config.canaryTerminalReceiptDigest !== canary.terminalReceiptDigest ||
        config.canaryConfigDigest !== canary.configDigest ||
        hold.status !== "superseded_by_admission_v2" ||
        hold.supersededByDecisionRef !== input.decisionRef ||
        hold.admissionConfigDigest !== digestObject(config)
      ) {
        throw new Error("active candidate admission does not match the requested activation");
      }
      verifyAdmissionDecisionArtifact(input, config, canary, env, config.canaryConfigDigest);
      return { config, holdPath };
    }
    if (config.mode !== "canary") throw new Error("candidate admission is not in canary mode");
    verifyAdmissionDecisionArtifact(input, config, canary, env);
    if (hold.status !== "active") throw new Error("historical candidate spawn hold is not active");
    const active: CandidateAdmissionConfig = {
      ...config,
      mode: "active",
      ownerDecisionRef: input.decisionRef,
      updatedAt: now,
      activatedAt: now,
      canaryAdmissionId: input.canaryAdmissionId,
      canaryTerminalReceiptRef: input.terminalReceiptRef,
      canaryTerminalReceiptDigest: canary.terminalReceiptDigest,
      canaryConfigDigest: digestObject(config),
    };
    return commitCandidateAdmissionActivation(
      {
        requestDigest,
        activeConfig: active,
        activeHold: {
          ...hold,
          status: "superseded_by_admission_v2",
          supersededAt: now,
          supersededByDecisionRef: input.decisionRef,
          admissionConfigPath: getCandidateAdmissionConfigPath(env),
          admissionConfigDigest: digestObject(active),
          preservedBoundary: "Historical v1 cleanup remains permanently non-executable.",
        },
      },
      env,
    );
  });
}
