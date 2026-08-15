// ---
// summary: canonical send-policy kernel for extension-originated pi.sendUserMessage follow-ups (text scans, self-driving budget, dedup cooldown, mode gate, owner-bridge registry).
// read_when:
//   - changing follow-up send gating, the self-driving budget, dedup cooldown, autonomy-mode binding, or the owner-bridge allowlist.
// ---

/**
 * Shared policy for every extension-originated pi.sendUserMessage follow-up in ASC.
 *
 * Posture:
 * - operator notifications: default-open with denylist scans (secrets, slash tokens, action directives);
 * - continuation/drive sends: fail-closed; the action line must match an affirmative
 *   low-risk local-validation command allowlist, everything else degrades to editor prefill;
 * - all sends are bounded by a consecutive-follow-up budget that resets only when an
 *   operator-authored user message arrives;
 * - identical follow-up text inside the dedup cooldown is suppressed to prefill;
 * - a runtime mode gate binds these classes to the documented autonomy ladder.
 */

import { createEdgeMonotonicId } from "./edge-contract-kernel.ts";
import type { SelfState } from "./types.ts";

// ============================================================================
// MODES (autonomy-ladder runtime binding)
// ============================================================================

export type SelfFollowUpMode = "notifications_only" | "bounded_continuation" | "owner_bridge";

/**
 * Cumulative autonomy ladder for extension-originated follow-up sends:
 * notifications_only < bounded_continuation < owner_bridge (default ceiling,
 * which preserves the established allowlisted /visible-loop owner-bridge route).
 */
export const DEFAULT_SELF_FOLLOW_UP_MODE: SelfFollowUpMode = "owner_bridge";

export function resolveSelfFollowUpMode(env: NodeJS.ProcessEnv = process.env): SelfFollowUpMode {
  const value = env.PI_SELF_SEND_USER_MESSAGE_MODE?.trim();
  if (
    value === "notifications_only" ||
    value === "bounded_continuation" ||
    value === "owner_bridge"
  ) {
    return value;
  }
  return DEFAULT_SELF_FOLLOW_UP_MODE;
}

export type SelfFollowUpClass = "notification" | "continuation" | "owner_bridge";

export function classifyFollowUpDispatchMode(dispatchMode: string | undefined): SelfFollowUpClass {
  if (dispatchMode === "agent_continuation" || dispatchMode === "diagnostic_continuation") {
    return "continuation";
  }
  if (dispatchMode === "owner_bridge_send_user_message") {
    return "owner_bridge";
  }
  return "notification";
}

export function modeAllowsFollowUpClass(
  mode: SelfFollowUpMode,
  followUpClass: SelfFollowUpClass,
): boolean {
  if (followUpClass === "notification") return true;
  if (mode === "notifications_only") return false;
  if (followUpClass === "continuation")
    return mode === "bounded_continuation" || mode === "owner_bridge";
  return mode === "owner_bridge";
}

// ============================================================================
// BUDGET / DEDUP LIMITS
// ============================================================================

export const SELF_FOLLOW_UP_MAX_CONSECUTIVE_CONTINUATIONS = 3;
export const SELF_FOLLOW_UP_MAX_CONSECUTIVE_NOTIFICATIONS = 8;
export const SELF_FOLLOW_UP_DEDUP_COOLDOWN_MS = 10 * 60 * 1000;
const RECENT_SEND_HISTORY_LIMIT = 8;

export function resolveMaxConsecutiveContinuations(env: NodeJS.ProcessEnv = process.env): number {
  return resolveCountEnv(
    env.PI_SELF_MAX_CONSECUTIVE_FOLLOW_UPS,
    SELF_FOLLOW_UP_MAX_CONSECUTIVE_CONTINUATIONS,
  );
}

export function resolveMaxConsecutiveNotifications(env: NodeJS.ProcessEnv = process.env): number {
  return resolveCountEnv(
    env.PI_SELF_MAX_CONSECUTIVE_NOTIFICATIONS,
    SELF_FOLLOW_UP_MAX_CONSECUTIVE_NOTIFICATIONS,
  );
}

function resolveCountEnv(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 1 ? Math.floor(parsed) : fallback;
}

// ============================================================================
// TEXT SCANS (denylist layer shared by every send route)
// ============================================================================

export function messageLooksSensitive(text: string): boolean {
  return /-----BEGIN [A-Z ]*PRIVATE KEY-----|\b(?:AKIA|ASIA)[A-Z0-9]{16}\b|\bgh[pousr]_[A-Za-z0-9_]{20,}\b|\bsk-[A-Za-z0-9]{20,}\b/u.test(
    text,
  );
}

export function messageLooksSlashCommand(text: string): boolean {
  const slashTokenPattern = /(^|[\s`'">(*_[-])\/([A-Za-z][\w-]*)(?=\s|$)/gu;
  for (const match of text.matchAll(slashTokenPattern)) {
    const commandName = match[2]?.toLowerCase();
    if (commandName && !COMMON_ABSOLUTE_PATH_ROOTS.has(commandName)) {
      return true;
    }
  }
  return false;
}

export function messageLooksWholeSlashCommand(text: string): boolean {
  const match = text.trim().match(/^\/([A-Za-z][\w-]*)(?=\s|$)/u);
  if (!match) return false;
  const commandName = match[1]?.toLowerCase();
  return Boolean(commandName && !COMMON_ABSOLUTE_PATH_ROOTS.has(commandName));
}

export function messageLooksActionDirective(text: string): boolean {
  return /(^|\n)\s*[!$]{1,2}\S|\b(?:run|execute|spawn|launch|commit|merge|delete|remove|reset|record|publish|promote)\b|(^|\n)\s*(?:(?:please|kindly)\s+|(?:can|could|would)\s+you\s+)?compact\b|\b(?:run|execute|start|trigger|perform)\s+(?:a\s+)?(?:compact|compaction)\b|\b(?:ak\s+task|agent_vent|scout_peer_spawn|candidate_peer_spawn|fork_peer_spawn|dispatch_subagent|toolbox\(|evidence_record|write\s+AK|write\s+KES|peer review|durable record)\b/iu.test(
    text,
  );
}

export const COMMON_ABSOLUTE_PATH_ROOTS = new Set([
  "bin",
  "dev",
  "etc",
  "home",
  "lib",
  "lib64",
  "media",
  "mnt",
  "opt",
  "proc",
  "root",
  "run",
  "sbin",
  "srv",
  "sys",
  "tmp",
  "usr",
  "var",
  "workspace",
]);

// ============================================================================
// AFFIRMATIVE LOW-RISK CONTINUATION ALLOWLIST (fail-closed drive posture)
// ============================================================================

const LOW_RISK_CONTINUATION_COMMAND_PATTERNS: readonly RegExp[] = [
  /^(?:cd\s+[^\s&|;]+\s+&&\s+)?(?:npm|pnpm|yarn|bun)\s+(?:--prefix\s+\S+\s+)?(?:--workspace\s+\S+\s+)?(?:run\s+)?(?:test|check|lint|build|typecheck|type-check|verify|ci)(?:\s|$)/u,
  /^(?:cd\s+[^\s&|;]+\s+&&\s+)?(?:npm|pnpm|yarn|bun)\s+(?:--prefix\s+\S+\s+)?(?:--workspace\s+\S+\s+)?run\s+(?:test|check|lint|build|typecheck|type-check|verify|ci)(?:\s|$)/u,
  /^just\s+(?:test|check|lint|fmt|build|ci)(?:\s|$)/u,
  /^(?:npx|pnpm\s+dlx|yarn\s+dlx)\s+tsc(?:\s|--|$)/u,
  /^node\s+\S+\.test\.[cm]?[jt]s(?:\s|$)/u,
  /^node\s+--test(?:\s|$)/u,
];

/**
 * Continuation-class sends require the action line to affirmatively look like a
 * narrow local validation command. Anything else fails closed to editor prefill.
 */
export function isAffirmativelyLowRiskContinuationCommand(text: string): boolean {
  const trimmed = text.trim();
  if (trimmed.length === 0 || trimmed.length > 400 || trimmed.includes("\n")) return false;
  return LOW_RISK_CONTINUATION_COMMAND_PATTERNS.some((pattern) => pattern.test(trimmed));
}

// ============================================================================
// OWNER-BRIDGE REGISTRY (explicit allowlist for whole-slash-command sends)
// ============================================================================

export interface OwnerBridgeAllowlistEntry {
  registryVersion: 1;
  ownerBridge: string;
  routeKind: string;
  commandName: string;
  commandPattern: RegExp;
}

export const OWNER_BRIDGE_SEND_ALLOWLIST: readonly OwnerBridgeAllowlistEntry[] = [
  {
    registryVersion: 1,
    ownerBridge: "pi-little-helpers extension-originated /visible-loop bridge",
    routeKind: "visible_loop_self_evolution",
    commandName: "visible-loop",
    commandPattern:
      /^\/visible-loop --count 1 --delegate-commit --candidate evolution-[A-Za-z0-9._-]+$/u,
  },
];

export function isAllowedOwnerBridgeSendUserMessage(actionData: {
  text?: unknown;
  dispatchMode?: unknown;
  ownerBridge?: unknown;
  routeKind?: unknown;
}): boolean {
  if (typeof actionData.text !== "string" || !messageLooksWholeSlashCommand(actionData.text)) {
    return true;
  }

  if (actionData.dispatchMode !== "owner_bridge_send_user_message") {
    return false;
  }

  const text = actionData.text.trim();
  return OWNER_BRIDGE_SEND_ALLOWLIST.some(
    (entry) =>
      actionData.ownerBridge === entry.ownerBridge &&
      actionData.routeKind === entry.routeKind &&
      entry.commandPattern.test(text),
  );
}

// ============================================================================
// SEND EVALUATION (mode gate + budget + dedup)
// ============================================================================

export type FollowUpBlockedReason = "mode_gate" | "budget_exhausted" | "dedup_suppressed";

export interface FollowUpSendEvaluation {
  allowed: boolean;
  blockedReason?: FollowUpBlockedReason;
  followUpClass: SelfFollowUpClass;
  mode: SelfFollowUpMode;
  maxConsecutive: number;
  consecutive: number;
  dedupMatchedSendId?: string;
}

export function evaluateFollowUpSend(
  state: SelfState,
  input: { text: string; dispatchMode: string | undefined },
  now = Date.now(),
  env: NodeJS.ProcessEnv = process.env,
): FollowUpSendEvaluation {
  const mode = resolveSelfFollowUpMode(env);
  const followUpClass = classifyFollowUpDispatchMode(input.dispatchMode);
  const policy = state.followUpPolicy;

  if (!modeAllowsFollowUpClass(mode, followUpClass)) {
    return {
      allowed: false,
      blockedReason: "mode_gate",
      followUpClass,
      mode,
      maxConsecutive: 0,
      consecutive: 0,
    };
  }

  const maxConsecutive =
    followUpClass === "notification"
      ? resolveMaxConsecutiveNotifications(env)
      : resolveMaxConsecutiveContinuations(env);
  const consecutive =
    followUpClass === "notification"
      ? policy.consecutiveNotificationSends
      : policy.consecutiveContinuationSends;

  if (consecutive >= maxConsecutive) {
    return {
      allowed: false,
      blockedReason: "budget_exhausted",
      followUpClass,
      mode,
      maxConsecutive,
      consecutive,
    };
  }

  const textHash = hashFollowUpText(input.text);
  const duplicate = [...policy.recentSends]
    .reverse()
    .find(
      (send) =>
        send.delivered &&
        send.textHash === textHash &&
        now - send.sentAt < SELF_FOLLOW_UP_DEDUP_COOLDOWN_MS,
    );
  if (duplicate) {
    return {
      allowed: false,
      blockedReason: "dedup_suppressed",
      followUpClass,
      mode,
      maxConsecutive,
      consecutive,
      dedupMatchedSendId: duplicate.id,
    };
  }

  return { allowed: true, followUpClass, mode, maxConsecutive, consecutive };
}

// ============================================================================
// OUTCOME RECORDING (telemetry + candidate consumption linkage)
// ============================================================================

export interface FollowUpSendRecord {
  kind: "self.follow_up_send.v1";
  id: string;
  textHash: string;
  dispatchMode: string;
  followUpClass: SelfFollowUpClass;
  delivered: boolean;
  sentAt: number;
  blockedReason?: FollowUpBlockedReason;
  sendFailed?: boolean;
  continuationCandidateId?: string;
}

export function recordFollowUpSendOutcome(
  state: SelfState,
  input: {
    text: string;
    dispatchMode: string | undefined;
    delivered: boolean;
    blockedReason?: FollowUpBlockedReason;
    sendFailed?: boolean;
    continuationCandidateId?: string;
  },
  now = Date.now(),
): FollowUpSendRecord {
  const policy = state.followUpPolicy;
  const followUpClass = classifyFollowUpDispatchMode(input.dispatchMode);
  const record: FollowUpSendRecord = {
    kind: "self.follow_up_send.v1",
    id: createEdgeMonotonicId("follow-up"),
    textHash: hashFollowUpText(input.text),
    dispatchMode: input.dispatchMode ?? "unknown",
    followUpClass,
    delivered: input.delivered,
    sentAt: now,
    ...(input.blockedReason ? { blockedReason: input.blockedReason } : {}),
    ...(input.sendFailed ? { sendFailed: true } : {}),
    ...(input.continuationCandidateId
      ? { continuationCandidateId: input.continuationCandidateId }
      : {}),
  };

  policy.recentSends = [...policy.recentSends, record].slice(-RECENT_SEND_HISTORY_LIMIT);
  policy.totalAttempts += 1;

  if (input.delivered) {
    policy.totalSent += 1;
    if (followUpClass === "notification") {
      policy.consecutiveNotificationSends += 1;
    } else {
      policy.consecutiveContinuationSends += 1;
    }
    registerPendingSelfOriginatedTextHash(state, record.textHash);
  } else if (input.sendFailed) {
    policy.sendFailedCount += 1;
  } else if (input.blockedReason === "budget_exhausted") {
    policy.budgetExhaustedCount += 1;
  } else if (input.blockedReason === "dedup_suppressed") {
    policy.dedupSuppressedCount += 1;
  } else if (input.blockedReason === "mode_gate") {
    policy.modeGateCount += 1;
  }

  return record;
}

export function recordFollowUpPrefill(state: SelfState): void {
  state.followUpPolicy.totalPrefilled += 1;
}

/**
 * Called when a user message arrives: if it is not one of our own pending
 * follow-up texts, the operator is present again, so consecutive budgets reset.
 */
export function noteUserMessageArrived(state: SelfState, text: string): void {
  const policy = state.followUpPolicy;
  const textHash = hashFollowUpText(text);
  const pendingIndex = policy.pendingSelfOriginatedTextHashes.indexOf(textHash);
  if (pendingIndex >= 0) {
    policy.pendingSelfOriginatedTextHashes.splice(pendingIndex, 1);
    return;
  }
  policy.consecutiveContinuationSends = 0;
  policy.consecutiveNotificationSends = 0;
  policy.lastOperatorMessageAt = Date.now();
}

function registerPendingSelfOriginatedTextHash(state: SelfState, textHash: string): void {
  const policy = state.followUpPolicy;
  policy.pendingSelfOriginatedTextHashes = [
    ...policy.pendingSelfOriginatedTextHashes.filter((existing) => existing !== textHash),
    textHash,
  ].slice(-RECENT_SEND_HISTORY_LIMIT);
}

export interface FollowUpPolicyTelemetry {
  mode: SelfFollowUpMode;
  totalAttempts: number;
  totalSent: number;
  totalBlocked: number;
  totalPrefilled: number;
  sendFailedCount: number;
  budgetExhaustedCount: number;
  dedupSuppressedCount: number;
  modeGateCount: number;
  consecutiveContinuationSends: number;
  consecutiveNotificationSends: number;
  maxConsecutiveContinuations: number;
  maxConsecutiveNotifications: number;
  lastOperatorMessageAt: number | null;
  recentSends: Array<
    Pick<
      FollowUpSendRecord,
      | "id"
      | "dispatchMode"
      | "followUpClass"
      | "delivered"
      | "sentAt"
      | "blockedReason"
      | "continuationCandidateId"
    >
  >;
}

export function followUpPolicyTelemetry(
  state: SelfState,
  env: NodeJS.ProcessEnv = process.env,
): FollowUpPolicyTelemetry {
  const policy = state.followUpPolicy;
  return {
    mode: resolveSelfFollowUpMode(env),
    totalAttempts: policy.totalAttempts,
    totalSent: policy.totalSent,
    totalBlocked: policy.budgetExhaustedCount + policy.dedupSuppressedCount + policy.modeGateCount,
    totalPrefilled: policy.totalPrefilled,
    sendFailedCount: policy.sendFailedCount,
    budgetExhaustedCount: policy.budgetExhaustedCount,
    dedupSuppressedCount: policy.dedupSuppressedCount,
    modeGateCount: policy.modeGateCount,
    consecutiveContinuationSends: policy.consecutiveContinuationSends,
    consecutiveNotificationSends: policy.consecutiveNotificationSends,
    maxConsecutiveContinuations: resolveMaxConsecutiveContinuations(env),
    maxConsecutiveNotifications: resolveMaxConsecutiveNotifications(env),
    lastOperatorMessageAt: policy.lastOperatorMessageAt ?? null,
    recentSends: policy.recentSends.map((send) => ({
      id: send.id,
      dispatchMode: send.dispatchMode,
      followUpClass: send.followUpClass,
      delivered: send.delivered,
      sentAt: send.sentAt,
      ...(send.blockedReason ? { blockedReason: send.blockedReason } : {}),
      ...(send.continuationCandidateId
        ? { continuationCandidateId: send.continuationCandidateId }
        : {}),
    })),
  };
}

// ============================================================================
// HELPERS
// ============================================================================

function hashFollowUpText(text: string): string {
  let hash = 0x811c9dc5;
  const normalized = text.trim();
  for (let index = 0; index < normalized.length; index += 1) {
    hash ^= normalized.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}
