// summary: "verifies self-evolution owner artifacts, session bindings, package checks, and ordered live-runtime proof evidence"
// read_when:
//   - "changing owner-artifact safety, persisted candidate binding, or host-correlated closeout proof verification"

import {
  closeSync,
  constants,
  fstatSync,
  lstatSync,
  openSync,
  readSync,
  realpathSync,
} from "node:fs";
import { isAbsolute, relative, resolve, sep } from "node:path";
import type {
  SelfEvolutionCandidateCloseout,
  SelfEvolutionExecutionEnvelope,
  SelfEvolutionOwnerArtifact,
} from "./selfEvolutionEnvelope.ts";

const MAX_CANDIDATE_AGE_MS = 30 * 60 * 1000;
const MAX_ARTIFACT_BYTES = 256_000;
const MAX_BRANCH_SCAN = 500;
const SHA256_PATTERN = /^[a-f0-9]{64}$/u;
const SAFE_DATA_PATTERN =
  /\b(?:ignore|disregard|override)\b.{0,40}\b(?:previous|system|instructions?|membrane)\b|(?:^|\s)(?:system|assistant|developer|tool)\s*:|<\/?(?:system|assistant|developer|tool)>|\b(?:tool_call|function call|sendUserMessage)\b|(?:^|\s)\/[A-Za-z][\w-]*/iu;

export interface SelfEvolutionVerificationContext {
  branchEntries?: unknown;
  cwd?: string;
  now?: number;
  notBefore?: number;
  parentPeerTarget?: string;
}

export function validatePersistedSelfEvolutionBinding(
  envelope: SelfEvolutionExecutionEnvelope | undefined,
  context: SelfEvolutionVerificationContext,
): { ok: true } | { ok: false; error: string } {
  if (!envelope) return { ok: true };
  const now = context.now ?? Date.now();
  if (
    !Number.isFinite(now) ||
    now < envelope.issuedAt ||
    now - envelope.issuedAt > MAX_CANDIDATE_AGE_MS
  ) {
    return { ok: false, error: "self-evolution candidate is expired or has an invalid timestamp" };
  }
  const parentSessionId = normalizeParentSessionId(context.parentPeerTarget);
  if (!parentSessionId || parentSessionId !== envelope.sessionId) {
    return {
      ok: false,
      error: "self-evolution candidate source session does not match parentPeerTarget",
    };
  }
  if (!envelope.ownerArtifact || !context.cwd) {
    return { ok: false, error: "self-evolution owner artifact is not host-verified" };
  }
  const canonical = loadSelfEvolutionOwnerArtifact(envelope, context.cwd);
  if (!canonical.ok) return canonical;
  if (JSON.stringify(canonical.artifact) !== JSON.stringify(envelope.ownerArtifact)) {
    return { ok: false, error: "canonical owner artifact drifted from the launch envelope" };
  }
  return { ok: true };
}

export function loadSelfEvolutionOwnerArtifact(
  envelope: SelfEvolutionExecutionEnvelope,
  cwd: string,
): { ok: true; artifact: SelfEvolutionOwnerArtifact } | { ok: false; error: string } {
  const expectedPrefix = `packages/${envelope.owner}/`;
  if (!envelope.promotionTarget.startsWith(expectedPrefix)) {
    return { ok: false, error: `promotion target must be inside ${expectedPrefix}` };
  }
  const path = resolveSafeRegularFile(cwd, envelope.promotionTarget);
  if (!path.ok) return path;
  const loaded = readBoundedCanonicalOwnerArtifact(path.path);
  if (!loaded.ok) return loaded;
  let parsed: unknown;
  try {
    parsed = JSON.parse(loaded.text);
  } catch {
    return { ok: false, error: "owner artifact must be readable JSON" };
  }
  const artifact = parseSelfEvolutionOwnerArtifact(parsed);
  if (!artifact)
    return { ok: false, error: "owner artifact does not match self.evolution_owner_artifact.v1" };
  if (artifact.candidateId !== envelope.candidateId || artifact.owner !== envelope.owner) {
    return { ok: false, error: "owner artifact candidateId or owner does not match the envelope" };
  }
  return { ok: true, artifact };
}

export function verifySelfEvolutionCloseoutEvidence(
  envelope: SelfEvolutionExecutionEnvelope,
  closeout: SelfEvolutionCandidateCloseout,
  context: SelfEvolutionVerificationContext,
): { ok: true } | { ok: false; error: string } {
  const binding = validatePersistedSelfEvolutionBinding(envelope, context);
  if (!binding.ok) return binding;
  const entries = Array.isArray(context.branchEntries) ? context.branchEntries : [];
  const cwd = context.cwd;

  if (envelope.reflectionGuard.requiredBeforeCompletion) {
    const verified = closeout.reflection.evidence.some((entry) => {
      if (entry.kind === "command" && (entry.status === "passed" || entry.status === "verified")) {
        return Boolean(
          cwd && hasSuccessfulPackageCheck(entries, entry.ref, context.notBefore, envelope, cwd),
        );
      }
      return false;
    });
    if (closeout.reflection.resolution !== "satisfied" || !verified) {
      return {
        ok: false,
        error: "reflection guard lacks a host-verified package-check command",
      };
    }
  }

  if (envelope.liveRuntimeProofGuard.requiredBeforeCompletion) {
    const verified = closeout.liveRuntimeProof.evidence.some(
      (entry) =>
        entry.kind === "receipt" &&
        entry.status === "verified" &&
        hasOrderedLiveRuntimeProof(entries, entry.ref),
    );
    if (closeout.liveRuntimeProof.resolution !== "satisfied" || !verified) {
      return {
        ok: false,
        error: "live-runtime proof guard lacks a host-observed ordered proof run",
      };
    }
  }

  if (envelope.insightPromotionCue.requiredBeforeCompletion) {
    const verified =
      closeout.insightPromotion.resolution === "satisfied" &&
      closeout.insightPromotion.evidence.some(
        (entry) =>
          entry.kind === "artifact" &&
          entry.status === "verified" &&
          Boolean(cwd) &&
          verifyBoundOwnerArtifact(envelope, cwd as string, entry.ref),
      );
    if (!verified) {
      return { ok: false, error: "insight promotion lacks a host-verified bound owner artifact" };
    }
  }

  return { ok: true };
}

function verifyBoundOwnerArtifact(
  envelope: SelfEvolutionExecutionEnvelope,
  cwd: string,
  ref: string,
): boolean {
  return ref === envelope.promotionTarget && loadSelfEvolutionOwnerArtifact(envelope, cwd).ok;
}

function hasSuccessfulPackageCheck(
  entries: unknown[],
  toolCallId: string,
  notBefore: number | undefined,
  envelope: SelfEvolutionExecutionEnvelope,
  cwd: string,
): boolean {
  const first = Math.max(0, entries.length - MAX_BRANCH_SCAN);
  let commandSeen = false;
  let resultSeen = false;
  for (let index = first; index < entries.length; index += 1) {
    const message = readMessage(entries[index]);
    if (!message || !isAtOrAfter(entries[index], message, notBefore)) continue;
    if (message.role === "assistant" && Array.isArray(message.content)) {
      commandSeen ||= message.content.some((part) => {
        if (
          !isRecord(part) ||
          part.type !== "toolCall" ||
          part.id !== toolCallId ||
          part.name !== "bash"
        ) {
          return false;
        }
        const args = isRecord(part.arguments) ? part.arguments : undefined;
        return (
          typeof args?.command === "string" &&
          isOwnerPackageCheckCommand(args.command, envelope, cwd)
        );
      });
    }
    if (
      message.role === "toolResult" &&
      message.toolName === "bash" &&
      message.toolCallId === toolCallId &&
      message.isError !== true
    ) {
      resultSeen = true;
    }
  }
  return commandSeen && resultSeen;
}

function isAtOrAfter(
  entry: unknown,
  message: Record<string, unknown>,
  notBefore: number | undefined,
): boolean {
  if (notBefore === undefined || !Number.isFinite(notBefore)) return false;
  const raw = isRecord(entry) ? entry.timestamp : undefined;
  const fallback = message.timestamp;
  const value = raw ?? fallback;
  const timestamp =
    typeof value === "number" ? value : typeof value === "string" ? Date.parse(value) : Number.NaN;
  return Number.isFinite(timestamp) && timestamp >= notBefore;
}

function isOwnerPackageCheckCommand(
  command: string,
  envelope: SelfEvolutionExecutionEnvelope,
  cwd: string,
): boolean {
  const normalized = command.trim();
  const match = normalized.match(/^(?:cd ([A-Za-z0-9_./-]+) && )?npm run check$/u);
  if (!match || !envelope.ownerArtifact) return false;
  const validation = envelope.ownerArtifact.validation.map((entry) => entry.trim());
  if (!validation.includes("npm run check") && !validation.includes(normalized)) return false;
  try {
    const root = realpathSync(cwd);
    const ownerRoot = realpathSync(resolve(root, "packages", envelope.owner));
    const commandRoot = realpathSync(match[1] ? resolve(root, match[1]) : root);
    return commandRoot === ownerRoot;
  } catch {
    return false;
  }
}

function hasOrderedLiveRuntimeProof(entries: unknown[], runId: string): boolean {
  if (!/^asc-live-[A-Za-z0-9._-]+$/u.test(runId)) return false;
  const relevant = entries
    .slice(-MAX_BRANCH_SCAN)
    .filter((entry) => isRecord(entry) && entry.type === "custom")
    .map((entry) => (isRecord(entry) ? entry : {}));
  let proof: Record<string, unknown>[] = [];
  for (const entry of relevant) {
    if (entry.customType !== "asc.live_runtime_proof_event.v1" || !isRecord(entry.data)) continue;
    const data = entry.data;
    if (data.kind === "self.live_runtime_proof_invalidation.v1") {
      proof = [];
      continue;
    }
    if (data.kind !== "self.live_runtime_proof_event.v1" || data.runId !== runId) continue;
    proof.push(data);
  }
  if (proof.length !== 4) return false;
  const tiers = ["packageCheck", "install", "reload", "postReloadDogfood"];
  const sources = [
    "pi.tool_result.bash",
    "pi.tool_result.bash",
    "pi.session_start.reload",
    "pi.tool_result.self",
  ];
  const fingerprint = proof[0]?.sourceFingerprint;
  return proof.every(
    (event, index) =>
      event.schemaVersion === 1 &&
      event.sequence === index + 1 &&
      event.tier === tiers[index] &&
      event.source === sources[index] &&
      event.status === "observed" &&
      event.packageName === "pi-autonomous-session-control" &&
      event.sourceFingerprint === fingerprint &&
      typeof fingerprint === "string" &&
      SHA256_PATTERN.test(fingerprint),
  );
}

export function parseSelfEvolutionOwnerArtifact(
  value: unknown,
): SelfEvolutionOwnerArtifact | undefined {
  if (
    !isRecord(value) ||
    value.kind !== "self.evolution_owner_artifact.v1" ||
    value.schemaVersion !== 1
  ) {
    return undefined;
  }
  const candidateId = safeText(value.candidateId, 160);
  const owner = safeText(value.owner, 160);
  const hypothesis = safeText(value.hypothesis, 2_000);
  const metric = safeText(value.metric, 2_000);
  const falsifier = safeText(value.falsifier, 2_000);
  const scope = safeStringArray(value.scope, 32, 300, true);
  const validation = safeStringArray(value.validation, 16, 500, false);
  if (!candidateId || !owner || !hypothesis || !metric || !falsifier || !scope || !validation) {
    return undefined;
  }
  return {
    kind: "self.evolution_owner_artifact.v1",
    schemaVersion: 1,
    candidateId,
    owner,
    hypothesis,
    metric,
    falsifier,
    scope,
    validation,
  };
}

function safeStringArray(
  value: unknown,
  maxItems: number,
  maxLength: number,
  pathsOnly: boolean,
): string[] | undefined {
  if (!Array.isArray(value) || value.length === 0 || value.length > maxItems) return undefined;
  const result = value.map((entry) => safeText(entry, maxLength));
  if (!result.every((entry): entry is string => Boolean(entry))) return undefined;
  if (
    pathsOnly &&
    !result.every(
      (entry) =>
        !entry.startsWith("/") &&
        !entry.split("/").includes("..") &&
        /^[A-Za-z0-9_.*/-]+$/u.test(entry),
    )
  ) {
    return undefined;
  }
  return result;
}

function safeText(value: unknown, maxLength: number): string | undefined {
  if (typeof value !== "string") return undefined;
  const normalized = value.trim();
  if (!normalized || normalized.length > maxLength || SAFE_DATA_PATTERN.test(normalized))
    return undefined;
  for (const character of normalized) {
    const codePoint = character.codePointAt(0) ?? 0;
    if (
      codePoint < 32 ||
      (codePoint >= 127 && codePoint <= 159) ||
      codePoint === 0x2028 ||
      codePoint === 0x2029 ||
      (codePoint >= 0x202a && codePoint <= 0x202e) ||
      (codePoint >= 0x2066 && codePoint <= 0x2069) ||
      codePoint === 0xfeff
    ) {
      return undefined;
    }
  }
  return normalized;
}

function readBoundedCanonicalOwnerArtifact(
  path: string,
  afterOpen?: () => void,
): { ok: true; text: string } | { ok: false; error: string } {
  let descriptor: number | undefined;
  try {
    descriptor = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW);
    const before = fstatSync(descriptor, { bigint: true });
    if (!before.isFile()) {
      return { ok: false, error: "owner artifact must be a direct regular file, not a symlink" };
    }
    if (before.size > BigInt(MAX_ARTIFACT_BYTES)) {
      return { ok: false, error: "owner artifact exceeds the size limit" };
    }
    afterOpen?.();
    const expectedBytes = Number(before.size);
    const buffer = Buffer.allocUnsafe(expectedBytes + 1);
    let bytesRead = 0;
    while (bytesRead < buffer.length) {
      const count = readSync(descriptor, buffer, bytesRead, buffer.length - bytesRead, bytesRead);
      if (count === 0) break;
      bytesRead += count;
    }
    const after = fstatSync(descriptor, { bigint: true });
    const currentPath = lstatSync(path, { bigint: true });
    const openedFileChanged =
      after.size !== before.size ||
      after.mtimeNs !== before.mtimeNs ||
      after.ctimeNs !== before.ctimeNs ||
      bytesRead !== expectedBytes;
    const pathChanged =
      currentPath.isSymbolicLink() ||
      currentPath.dev !== before.dev ||
      currentPath.ino !== before.ino;
    if (openedFileChanged || pathChanged) {
      return { ok: false, error: "owner artifact changed while reading" };
    }
    return { ok: true, text: buffer.subarray(0, bytesRead).toString("utf8") };
  } catch {
    return { ok: false, error: "owner artifact must be readable JSON" };
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
  }
}

export const _selfEvolutionVerificationTest = {
  readBoundedCanonicalOwnerArtifact,
};

function resolveSafeRegularFile(
  cwd: string,
  target: string,
): { ok: true; path: string } | { ok: false; error: string } {
  if (!target || isAbsolute(target) || target.split("/").includes("..")) {
    return { ok: false, error: "owner artifact path must be safe and repo-relative" };
  }
  try {
    const root = realpathSync(cwd);
    const absolute = resolve(root, target);
    const rel = relative(root, absolute);
    if (!rel || rel.startsWith("..") || rel.includes(`..${sep}`) || isAbsolute(rel)) {
      return { ok: false, error: "owner artifact path escapes cwd" };
    }
    if (realpathSync(absolute) !== absolute || !lstatSync(absolute).isFile()) {
      return { ok: false, error: "owner artifact must be a direct regular file, not a symlink" };
    }
    return { ok: true, path: absolute };
  } catch {
    return { ok: false, error: "owner artifact does not exist or cannot be canonicalized" };
  }
}

function normalizeParentSessionId(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const normalized = value.trim().replace(/^session-/u, "");
  return /^[A-Za-z0-9._-]+$/u.test(normalized) ? normalized : undefined;
}

function readMessage(entry: unknown): Record<string, unknown> | undefined {
  return isRecord(entry) && entry.type === "message" && isRecord(entry.message)
    ? entry.message
    : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
