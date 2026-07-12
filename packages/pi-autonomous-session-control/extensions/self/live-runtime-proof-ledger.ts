// ---
// summary: classifies and records branch-local four-tier receipts for ASC live-runtime verification.
// read_when:
//   - changing proof command recognition, source fingerprinting, invalidation, or ledger reconstruction.
// ---

/**
 * Branch-local machine receipts for ASC live-runtime proof.
 *
 * These entries are a session mirror, not durable evidence. They are deliberately
 * narrow: only exact supported commands and Pi-owned lifecycle/tool-result events
 * can advance the four-tier proof run.
 */

import { createHash } from "node:crypto";
import { existsSync, lstatSync, readdirSync, readFileSync, realpathSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { SelfState } from "./types.ts";

export const ASC_LIVE_RUNTIME_PROOF_CUSTOM_TYPE = "asc.live_runtime_proof_event.v1";
export const ASC_LIVE_RUNTIME_PROOF_KIND = "self.live_runtime_proof_event.v1";
export const ASC_LIVE_RUNTIME_PROOF_INVALIDATION_KIND = "self.live_runtime_proof_invalidation.v1";
export const ASC_RUNTIME_PACKAGE_NAME = "pi-autonomous-session-control";
export const ASC_RUNTIME_NPM_PACKAGE_NAME = "@tryinget/pi-autonomous-session-control";
export const ASC_LIVE_RUNTIME_DOGFOOD_QUERY = "dogfood self: live runtime proof probe";

export type LiveRuntimeProofTier = "packageCheck" | "install" | "reload" | "postReloadDogfood";

export type LiveRuntimeProofEventSource =
  | "pi.tool_result.bash"
  | "pi.session_start.reload"
  | "pi.tool_result.self";

export interface LiveRuntimeProofLedgerEvent {
  kind: typeof ASC_LIVE_RUNTIME_PROOF_KIND;
  schemaVersion: 1;
  runId: string;
  tier: LiveRuntimeProofTier;
  sequence: 1 | 2 | 3 | 4;
  status: "observed";
  packageName: typeof ASC_RUNTIME_PACKAGE_NAME;
  packageRoot: string;
  observedAt: number;
  source: LiveRuntimeProofEventSource;
  sourceFingerprint: string;
  toolCallId?: string;
  command?: string;
}

export interface LiveRuntimeProofInvalidationEvent {
  kind: typeof ASC_LIVE_RUNTIME_PROOF_INVALIDATION_KIND;
  schemaVersion: 1;
  packageName: typeof ASC_RUNTIME_PACKAGE_NAME;
  packageRoot: string;
  observedAt: number;
  source: "pi.tool_call.file_mutation" | "pi.session_start.non_reload";
  reason: string;
}

type LiveRuntimeProofLedgerEntry = LiveRuntimeProofLedgerEvent | LiveRuntimeProofInvalidationEvent;

interface PiEntryWriter {
  appendEntry?: (customType: string, data?: unknown) => unknown;
}

const MAX_LEDGER_EVENTS = 64;
const MAX_RUN_ID_LENGTH = 160;
const MAX_TOOL_CALL_ID_LENGTH = 160;
const MAX_COMMAND_LENGTH = 500;
const MAX_FINGERPRINT_FILES = 512;
const MAX_FINGERPRINT_FILE_BYTES = 1_000_000;
const MAX_FINGERPRINT_TOTAL_BYTES = 8_000_000;
const SHA256_PATTERN = /^[a-f0-9]{64}$/u;
const TIER_SEQUENCE: Record<LiveRuntimeProofTier, 1 | 2 | 3 | 4> = {
  packageCheck: 1,
  install: 2,
  reload: 3,
  postReloadDogfood: 4,
};
const TIER_SOURCE: Record<LiveRuntimeProofTier, LiveRuntimeProofEventSource> = {
  packageCheck: "pi.tool_result.bash",
  install: "pi.tool_result.bash",
  reload: "pi.session_start.reload",
  postReloadDogfood: "pi.tool_result.self",
};
const SIMPLE_PATH_PATTERN = /^[A-Za-z0-9_./-]+$/u;

function readPackageName(path: string): string | undefined {
  try {
    const parsed = JSON.parse(readFileSync(path, "utf8")) as { name?: unknown };
    return typeof parsed.name === "string" ? parsed.name : undefined;
  } catch {
    return undefined;
  }
}

export function resolveAscRuntimePackageRoot(moduleUrl = import.meta.url): string {
  let current = dirname(fileURLToPath(moduleUrl));
  for (let depth = 0; depth < 6; depth += 1) {
    if (readPackageName(resolve(current, "package.json")) === ASC_RUNTIME_NPM_PACKAGE_NAME) {
      return realpathSync(current);
    }
    const parent = dirname(current);
    if (parent === current) break;
    current = parent;
  }
  throw new Error(`Could not resolve ${ASC_RUNTIME_NPM_PACKAGE_NAME} package root`);
}

function canonicalDirectPath(path: string, cwd: string): string | undefined {
  if (!SIMPLE_PATH_PATTERN.test(path)) return undefined;
  const absolute = resolve(cwd, path);
  try {
    const canonical = realpathSync(absolute);
    // Reject symlink aliases. Proof must name the canonical package path directly.
    return canonical === absolute ? canonical : undefined;
  } catch {
    return undefined;
  }
}

function cwdIsCanonicalPackageRoot(cwd: string, packageRoot: string): boolean {
  return canonicalDirectPath(".", cwd) === packageRoot;
}

export function pathMayMutateRuntimePackage(
  path: unknown,
  cwd: string,
  packageRoot: string,
): boolean {
  if (typeof path !== "string" || path.length === 0 || path.length > MAX_COMMAND_LENGTH) {
    return false;
  }
  const absolute = resolve(cwd, path);
  const lexicalMatch = absolute === packageRoot || absolute.startsWith(`${packageRoot}/`);
  try {
    const canonical = realpathSync(absolute);
    return lexicalMatch || canonical === packageRoot || canonical.startsWith(`${packageRoot}/`);
  } catch {
    // New paths cannot be realpathed yet; lexical containment is the fail-closed signal.
    return lexicalMatch;
  }
}

function fingerprintPath(
  hash: ReturnType<typeof createHash>,
  path: string,
  packageRoot: string,
  budget: { files: number; bytes: number },
): boolean {
  const stat = lstatSync(path);
  if (stat.isSymbolicLink()) return false;
  if (stat.isDirectory()) {
    for (const name of readdirSync(path).sort()) {
      if (!fingerprintPath(hash, resolve(path, name), packageRoot, budget)) return false;
    }
    return true;
  }
  if (!stat.isFile() || stat.size > MAX_FINGERPRINT_FILE_BYTES) return false;
  budget.files += 1;
  budget.bytes += stat.size;
  if (budget.files > MAX_FINGERPRINT_FILES || budget.bytes > MAX_FINGERPRINT_TOTAL_BYTES) {
    return false;
  }
  hash.update(relative(packageRoot, path));
  hash.update("\0");
  hash.update(readFileSync(path));
  hash.update("\0");
  return true;
}

export function computeRuntimeSourceFingerprint(packageRoot: string): string | undefined {
  const runtimePaths = existsSync(resolve(packageRoot, "extensions"))
    ? [
        resolve(packageRoot, "package.json"),
        resolve(packageRoot, "execution.ts"),
        resolve(packageRoot, "extensions"),
      ]
    : [
        resolve(packageRoot, "package.json"),
        resolve(packageRoot, "self.ts"),
        resolve(packageRoot, "self"),
      ];
  const hash = createHash("sha256");
  const budget = { files: 0, bytes: 0 };
  try {
    for (const path of runtimePaths) {
      if (!existsSync(path)) continue;
      if (!fingerprintPath(hash, path, packageRoot, budget)) return undefined;
    }
    return budget.files > 0 ? hash.digest("hex") : undefined;
  } catch {
    return undefined;
  }
}

export function classifyLiveRuntimeProofCommand(
  command: string,
  cwd: string,
  packageRoot: string,
): "packageCheck" | "install" | undefined {
  const normalized = command.trim();
  if (
    normalized.length === 0 ||
    normalized.length > MAX_COMMAND_LENGTH ||
    normalized.includes("\n")
  ) {
    return undefined;
  }

  if (normalized === "npm run check") {
    return cwdIsCanonicalPackageRoot(cwd, packageRoot) ? "packageCheck" : undefined;
  }

  const packageCheckMatch = /^cd ([A-Za-z0-9_./-]+) && npm run check$/u.exec(normalized);
  if (packageCheckMatch) {
    return canonicalDirectPath(packageCheckMatch[1], cwd) === packageRoot
      ? "packageCheck"
      : undefined;
  }

  const installMatch = /^pi install ([A-Za-z0-9_./-]+)$/u.exec(normalized);
  if (installMatch) {
    return canonicalDirectPath(installMatch[1], cwd) === packageRoot ? "install" : undefined;
  }

  return undefined;
}

export function isLiveRuntimeDogfoodProbe(query: unknown): boolean {
  return typeof query === "string" && query.trim().toLowerCase() === ASC_LIVE_RUNTIME_DOGFOOD_QUERY;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isProofTier(value: unknown): value is LiveRuntimeProofTier {
  return (
    value === "packageCheck" ||
    value === "install" ||
    value === "reload" ||
    value === "postReloadDogfood"
  );
}

function normalizeLedgerEntry(
  value: unknown,
  packageRoot: string,
): LiveRuntimeProofLedgerEntry | undefined {
  if (!isRecord(value)) return undefined;
  if (value.kind === ASC_LIVE_RUNTIME_PROOF_INVALIDATION_KIND) {
    if (
      value.schemaVersion !== 1 ||
      value.packageName !== ASC_RUNTIME_PACKAGE_NAME ||
      value.packageRoot !== packageRoot ||
      (value.source !== "pi.tool_call.file_mutation" &&
        value.source !== "pi.session_start.non_reload") ||
      typeof value.reason !== "string" ||
      value.reason.length === 0 ||
      value.reason.length > 200 ||
      typeof value.observedAt !== "number" ||
      !Number.isFinite(value.observedAt)
    ) {
      return undefined;
    }
    return value as unknown as LiveRuntimeProofInvalidationEvent;
  }
  if (!isProofTier(value.tier)) return undefined;
  const sequence = TIER_SEQUENCE[value.tier];
  const source = TIER_SOURCE[value.tier];
  if (
    value.kind !== ASC_LIVE_RUNTIME_PROOF_KIND ||
    value.schemaVersion !== 1 ||
    value.sequence !== sequence ||
    value.status !== "observed" ||
    value.packageName !== ASC_RUNTIME_PACKAGE_NAME ||
    value.packageRoot !== packageRoot ||
    value.source !== source ||
    typeof value.sourceFingerprint !== "string" ||
    !SHA256_PATTERN.test(value.sourceFingerprint) ||
    typeof value.runId !== "string" ||
    value.runId.length === 0 ||
    value.runId.length > MAX_RUN_ID_LENGTH ||
    typeof value.observedAt !== "number" ||
    !Number.isFinite(value.observedAt)
  ) {
    return undefined;
  }
  if (
    value.toolCallId !== undefined &&
    (typeof value.toolCallId !== "string" || value.toolCallId.length > MAX_TOOL_CALL_ID_LENGTH)
  ) {
    return undefined;
  }
  if (
    value.command !== undefined &&
    (typeof value.command !== "string" || value.command.length > MAX_COMMAND_LENGTH)
  ) {
    return undefined;
  }
  return value as unknown as LiveRuntimeProofLedgerEvent;
}

export function reduceLiveRuntimeProofEvents(
  events: readonly LiveRuntimeProofLedgerEntry[],
): LiveRuntimeProofLedgerEvent[] {
  let active: LiveRuntimeProofLedgerEvent[] = [];
  for (const event of events.slice(-MAX_LEDGER_EVENTS)) {
    if (event.kind === ASC_LIVE_RUNTIME_PROOF_INVALIDATION_KIND) {
      active = [];
      continue;
    }
    if (event.tier === "packageCheck") {
      active = [event];
      continue;
    }
    if (active.length === 0) continue;
    const first = active[0];
    const expectedSequence = active.length + 1;
    if (event.runId !== first.runId) continue;
    if (event.sourceFingerprint !== first.sourceFingerprint) {
      active = [];
      continue;
    }
    if (event.sequence !== expectedSequence) {
      active = [];
      continue;
    }
    active.push(event);
  }
  return active;
}

export function reconstructLiveRuntimeProofEvents(
  state: SelfState,
  branchEntries: unknown,
  packageRoot: string,
): void {
  if (!Array.isArray(branchEntries)) {
    state.liveRuntimeProofEvents = [];
    return;
  }
  const entries = branchEntries
    .filter(
      (entry): entry is Record<string, unknown> =>
        isRecord(entry) &&
        entry.type === "custom" &&
        entry.customType === ASC_LIVE_RUNTIME_PROOF_CUSTOM_TYPE,
    )
    .slice(-MAX_LEDGER_EVENTS)
    .map((entry) => normalizeLedgerEntry(entry.data, packageRoot))
    .filter((entry): entry is LiveRuntimeProofLedgerEntry => Boolean(entry));
  state.liveRuntimeProofEvents = entries;
}

function createRunId(toolCallId: string | undefined, observedAt: number): string {
  const safeToolCallId = (toolCallId ?? "unknown").replace(/[^A-Za-z0-9_.-]/gu, "-").slice(0, 80);
  return `asc-live-${observedAt}-${safeToolCallId}`;
}

export function appendLiveRuntimeProofEvent(
  pi: PiEntryWriter,
  state: SelfState,
  packageRoot: string,
  input: {
    tier: LiveRuntimeProofTier;
    observedAt?: number;
    toolCallId?: string;
    command?: string;
  },
): LiveRuntimeProofLedgerEvent | undefined {
  const active = reduceLiveRuntimeProofEvents(state.liveRuntimeProofEvents);
  const sequence = TIER_SEQUENCE[input.tier];
  const observedAt = input.observedAt ?? Date.now();
  const sourceFingerprint = computeRuntimeSourceFingerprint(packageRoot);
  if (!sourceFingerprint) return undefined;
  if (
    input.tier !== "packageCheck" &&
    active[0] &&
    active[0].sourceFingerprint !== sourceFingerprint
  ) {
    appendLiveRuntimeProofInvalidation(pi, state, packageRoot, {
      source: "pi.tool_call.file_mutation",
      reason: "runtime source fingerprint changed after live-runtime proof began",
      observedAt,
    });
    return undefined;
  }
  const runId =
    input.tier === "packageCheck" ? createRunId(input.toolCallId, observedAt) : active[0]?.runId;
  if (!runId) return undefined;
  if (input.tier !== "packageCheck" && active.length + 1 !== sequence) return undefined;
  if (typeof pi.appendEntry !== "function") return undefined;

  const event: LiveRuntimeProofLedgerEvent = {
    kind: ASC_LIVE_RUNTIME_PROOF_KIND,
    schemaVersion: 1,
    runId,
    tier: input.tier,
    sequence,
    status: "observed",
    packageName: ASC_RUNTIME_PACKAGE_NAME,
    packageRoot,
    observedAt,
    source: TIER_SOURCE[input.tier],
    sourceFingerprint,
    ...(input.toolCallId ? { toolCallId: input.toolCallId.slice(0, MAX_TOOL_CALL_ID_LENGTH) } : {}),
    ...(input.command ? { command: input.command.slice(0, MAX_COMMAND_LENGTH) } : {}),
  };

  pi.appendEntry(ASC_LIVE_RUNTIME_PROOF_CUSTOM_TYPE, event);
  state.liveRuntimeProofEvents = [...active, event];
  return event;
}

export function appendLiveRuntimeProofInvalidation(
  pi: PiEntryWriter,
  state: SelfState,
  packageRoot: string,
  input: {
    source: LiveRuntimeProofInvalidationEvent["source"];
    reason: string;
    observedAt?: number;
  },
): LiveRuntimeProofInvalidationEvent | undefined {
  state.liveRuntimeProofEvents = [];
  if (typeof pi.appendEntry !== "function") return undefined;
  const event: LiveRuntimeProofInvalidationEvent = {
    kind: ASC_LIVE_RUNTIME_PROOF_INVALIDATION_KIND,
    schemaVersion: 1,
    packageName: ASC_RUNTIME_PACKAGE_NAME,
    packageRoot,
    observedAt: input.observedAt ?? Date.now(),
    source: input.source,
    reason: input.reason.slice(0, 200),
  };
  pi.appendEntry(ASC_LIVE_RUNTIME_PROOF_CUSTOM_TYPE, event);
  state.liveRuntimeProofEvents = [event];
  return event;
}

export function hasActiveLiveRuntimeProofRun(state: SelfState): boolean {
  return reduceLiveRuntimeProofEvents(state.liveRuntimeProofEvents).length > 0;
}

export function hasLiveRuntimeProofSourceDrift(state: SelfState): boolean {
  const first = reduceLiveRuntimeProofEvents(state.liveRuntimeProofEvents)[0];
  return Boolean(
    first && computeRuntimeSourceFingerprint(first.packageRoot) !== first.sourceFingerprint,
  );
}

export function liveRuntimeProofLedgerEvidence(state: SelfState): Array<Record<string, unknown>> {
  const active = reduceLiveRuntimeProofEvents(state.liveRuntimeProofEvents);
  if (hasLiveRuntimeProofSourceDrift(state)) {
    state.liveRuntimeProofEvents = [];
    return [];
  }
  return active.map((event) => ({
    text:
      event.tier === "packageCheck"
        ? "package check passed: npm run check"
        : event.tier === "install"
          ? `pi install completed: ${event.packageRoot}`
          : event.tier === "reload"
            ? "reload receipt completed: Pi session_start reason=reload"
            : "post-reload self dogfood passed: typed self probe tool result observed",
    source: event.source,
    origin: "session_proof_ledger",
    tier: event.tier,
    packageName: event.packageName,
    observedAt: event.observedAt,
    sequence: event.sequence,
    status: event.status,
    runId: event.runId,
  }));
}
