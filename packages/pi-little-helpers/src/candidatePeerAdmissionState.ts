import { createHash, randomUUID } from "node:crypto";
import {
  closeSync,
  existsSync,
  mkdirSync,
  openSync,
  readdirSync,
  readFileSync,
  renameSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { digestObject } from "./candidatePeerLifecycleV2.ts";

export const CANDIDATE_ADMISSION_SCHEMA_VERSION = 2 as const;

export type CandidateAdmissionLimits = {
  maxUnresolvedResources: number;
  maxUnresolvedBytes: number;
  maxUnresolvedAgeMs: number;
  maxActiveAdmissions: number;
  warningUnresolvedResources?: number;
  warningUnresolvedBytes?: number;
  warningUnresolvedAgeMs?: number;
  warningActiveAdmissions?: number;
};

export type CandidateAdmissionWarningAcknowledgement = {
  actor: string;
  inventoryDigest: string;
  warnings: string[];
  reason: string;
  expiresAt: string;
};

export type CandidateAdmissionDecisionArtifact = {
  schemaVersion: 1;
  decisionRef: string;
  status: "accepted";
  taskRef: string;
  canaryAdmissionId: string;
  terminalReceiptDigest: string;
  admissionConfigDigest: string;
  reviewedAt: string;
};

export type CandidateAdmissionConfig = {
  schemaVersion: 2;
  mode: "canary" | "active";
  ownerDecisionRef: string;
  createdAt: string;
  updatedAt: string;
  global: CandidateAdmissionLimits;
  repositories: Record<string, CandidateAdmissionLimits>;
  canaryAdmissionId?: string;
  canaryTerminalReceiptRef?: string;
  canaryTerminalReceiptDigest?: string;
  activatedAt?: string;
};

export type CandidateAdmissionPermit = {
  schemaVersion: 2;
  admissionId: string;
  status: "authorized" | "reserved" | "released";
  canary: boolean;
  actor: string;
  taskRef: string;
  repoRoot: string;
  objective: string;
  objectiveDigest: string;
  reservationBytes: number;
  authorizedAt: string;
  expiresAt: string;
  configDigest: string;
  admissionStateDigest: string;
  inventoryDigest: string;
  warningAcknowledgement?: CandidateAdmissionWarningAcknowledgement;
  reservedAt?: string;
  peerRunId?: string;
  worktreePath?: string;
  branchName?: string;
  releasedAt?: string;
  releaseOutcome?: "preparation_failed" | "terminal_cleaned" | "terminal_reconciled";
  terminalReceiptRef?: string;
  terminalReceiptDigest?: string;
};

export type CandidateAdmissionPressure = {
  capturedAt: string;
  inventoryDigest: string;
  unresolvedResources: number;
  unresolvedBytes: number;
  oldestUnresolvedAgeMs: number;
  activeAdmissions: number;
  byRepository: Record<
    string,
    {
      unresolvedResources: number;
      unresolvedBytes: number;
      oldestUnresolvedAgeMs: number;
      activeAdmissions: number;
    }
  >;
  activeAdmissionIds: string[];
  stateDigest: string;
};

export type CandidateAdmissionReservation = {
  admissionId: string;
  permitPath: string;
  pressure: CandidateAdmissionPressure;
  permit: CandidateAdmissionPermit;
};

function stateHome(env: NodeJS.ProcessEnv): string {
  return env.XDG_STATE_HOME?.trim() || join(homedir(), ".local", "state");
}

export function getCandidateAdmissionRoot(env: NodeJS.ProcessEnv = process.env): string {
  return join(stateHome(env), "pi-quests", "candidate-admission-v2");
}

export function getCandidateAdmissionConfigPath(env: NodeJS.ProcessEnv = process.env): string {
  return join(getCandidateAdmissionRoot(env), "config.json");
}

export function getCandidateSpawnHoldPath(env: NodeJS.ProcessEnv = process.env): string {
  return join(stateHome(env), "pi-quests", "candidate-spawn.HOLD.json");
}

function permitDir(env: NodeJS.ProcessEnv): string {
  return join(getCandidateAdmissionRoot(env), "permits");
}

export function candidateAdmissionPermitPath(admissionId: string, env: NodeJS.ProcessEnv): string {
  if (!/^cadm-[a-z0-9-]+$/i.test(admissionId)) throw new Error("invalid admission id");
  return join(permitDir(env), `${admissionId}.json`);
}

function assertOwnerOnlyDirectory(path: string): void {
  mkdirSync(path, { recursive: true, mode: 0o700 });
  if ((statSync(path).mode & 0o077) !== 0) {
    throw new Error(`candidate admission directory is not owner-only: ${path}`);
  }
}

export function writeAdmissionJson(path: string, value: unknown): void {
  assertOwnerOnlyDirectory(dirname(path));
  const temporary = `${path}.${process.pid}.${randomUUID()}.tmp`;
  writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600, flag: "wx" });
  renameSync(temporary, path);
}

export function readAdmissionJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, "utf8")) as T;
}

export function candidateObjectiveDigest(objective: string): string {
  return createHash("sha256").update(objective.trim()).digest("hex");
}

function normalizeLimits(
  limits: CandidateAdmissionLimits,
  label: string,
): CandidateAdmissionLimits {
  for (const key of [
    "maxUnresolvedResources",
    "maxUnresolvedBytes",
    "maxUnresolvedAgeMs",
    "maxActiveAdmissions",
  ] as const) {
    if (!Number.isSafeInteger(limits[key]) || limits[key] < 1) {
      throw new Error(`${label}.${key} must be a positive safe integer`);
    }
  }
  for (const key of [
    "warningUnresolvedResources",
    "warningUnresolvedBytes",
    "warningUnresolvedAgeMs",
    "warningActiveAdmissions",
  ] as const) {
    const value = limits[key];
    if (value !== undefined && (!Number.isSafeInteger(value) || value < 0)) {
      throw new Error(`${label}.${key} must be a non-negative safe integer`);
    }
  }
  return { ...limits };
}

function normalizeConfig(config: CandidateAdmissionConfig): CandidateAdmissionConfig {
  if (config.schemaVersion !== CANDIDATE_ADMISSION_SCHEMA_VERSION) {
    throw new Error("unsupported candidate admission config schema");
  }
  if (config.mode !== "canary" && config.mode !== "active") {
    throw new Error("candidate admission config mode must be canary or active");
  }
  if (!/^AK decision \d+$/.test(config.ownerDecisionRef)) {
    throw new Error("candidate admission config requires an exact AK decision reference");
  }
  const repositories = Object.fromEntries(
    Object.entries(config.repositories).map(([repoRoot, limits]) => [
      resolve(repoRoot),
      normalizeLimits(limits, `repositories.${repoRoot}`),
    ]),
  );
  if (Object.keys(repositories).length === 0) {
    throw new Error("candidate admission config requires repository limits");
  }
  return { ...config, global: normalizeLimits(config.global, "global"), repositories };
}

export function readCandidateAdmissionConfig(
  env: NodeJS.ProcessEnv = process.env,
): CandidateAdmissionConfig {
  return normalizeConfig(
    readAdmissionJson<CandidateAdmissionConfig>(getCandidateAdmissionConfigPath(env)),
  );
}

export function writeCandidateAdmissionConfig(
  config: CandidateAdmissionConfig,
  env: NodeJS.ProcessEnv = process.env,
  expectedDigest?: string,
): { path: string; digest: string } {
  const normalized = normalizeConfig(config);
  const path = getCandidateAdmissionConfigPath(env);
  if (
    existsSync(path) &&
    expectedDigest &&
    digestObject(readAdmissionJson(path)) !== expectedDigest
  ) {
    throw new Error("candidate admission config compare-and-swap mismatch");
  }
  writeAdmissionJson(path, normalized);
  return { path, digest: digestObject(normalized) };
}

export function listCandidateAdmissionPermits(env: NodeJS.ProcessEnv): CandidateAdmissionPermit[] {
  const dir = permitDir(env);
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((name) => name.endsWith(".json"))
    .sort()
    .map((name) => readAdmissionJson<CandidateAdmissionPermit>(join(dir, name)));
}

export function withCandidateAdmissionLock<T>(env: NodeJS.ProcessEnv, action: () => T): T {
  const root = getCandidateAdmissionRoot(env);
  assertOwnerOnlyDirectory(root);
  const lockPath = join(root, "admission.lock");
  let descriptor: number;
  try {
    descriptor = openSync(lockPath, "wx", 0o600);
    writeFileSync(
      descriptor,
      `${JSON.stringify({ pid: process.pid, createdAt: new Date().toISOString() })}\n`,
    );
  } catch {
    throw new Error(`candidate admission lock is held or stale: ${lockPath}`);
  }
  try {
    return action();
  } finally {
    closeSync(descriptor);
    unlinkSync(lockPath);
  }
}
