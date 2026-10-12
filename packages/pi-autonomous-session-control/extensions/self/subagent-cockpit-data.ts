import { randomUUID } from "node:crypto";
import { readdirSync } from "node:fs";
import { resolve } from "node:path";
import {
  type CockpitEvent,
  type CockpitReceipt,
  channelPath,
  liveChannel,
  MAX_REQUESTS,
  mutateChannel,
  publicCockpitText,
  REQUEST_TTL_MS,
  readChannel,
  readCockpitStatus,
  reconcileReceipts,
  safeSessionName,
  statusMatches,
} from "./subagent-cockpit-channel.ts";
import { applyCockpitFence, readCockpitFence } from "./subagent-cockpit-fence.ts";
import { channelIsBusy, inertText, literalGuidance, safeDirectory } from "./subagent-cockpit-io.ts";
import { readActiveTrace, readGuidanceProof, traceEvents } from "./subagent-cockpit-trace.ts";
import type { SubagentState } from "./subagent-session.ts";
import { getProcessStartTicks, runningStatusHasLiveOwner } from "./subagent-session-status.ts";

export interface SubagentCockpitSnapshot {
  sessionName: string;
  dispatchId?: string;
  attemptId?: string;
  status: string;
  objective?: string;
  profile?: string;
  model?: string;
  elapsedMs?: number;
  lastActivityAt?: number;
  latestTool?: string;
  steeringSupported: boolean;
  unavailableReason?: string;
  events: CockpitEvent[];
  receipts: CockpitReceipt[];
  truncated?: boolean;
}

export function readSubagentCockpit(
  sessionsDir: string,
  sessionName: string,
  options: { currentSessionKey?: string; currentRepoRoot?: string } = {},
): SubagentCockpitSnapshot {
  const snapshot: SubagentCockpitSnapshot = {
    sessionName: inertText(sessionName, 160),
    status: "unavailable",
    steeringSupported: false,
    events: [],
    receipts: [],
  };
  const status = readCockpitStatus(sessionsDir, sessionName);
  if (!status) return { ...snapshot, unavailableReason: "Missing or unsafe lifecycle record" };
  if (
    (options.currentSessionKey !== undefined &&
      options.currentSessionKey !== status.parentSessionKey) ||
    (options.currentRepoRoot !== undefined && options.currentRepoRoot !== status.parentRepoRoot)
  ) {
    return {
      ...snapshot,
      status: "stale",
      unavailableReason: "Different parent session or repository",
    };
  }
  snapshot.status =
    status.status === "running" && !runningStatusHasLiveOwner(status) ? "stale" : status.status;
  snapshot.dispatchId = inertText(status.dispatchId, 120) || undefined;
  snapshot.attemptId = inertText(status.attemptId, 120) || undefined;
  snapshot.objective = inertText(status.objective);
  snapshot.profile = inertText(status.profile, 120);
  snapshot.model = inertText(status.model, 200);
  const createdAt = Date.parse(status.createdAt);
  const endedAt = Date.parse(status.updatedAt);
  if (Number.isFinite(createdAt) && (status.status === "running" || Number.isFinite(endedAt))) {
    snapshot.elapsedMs = Math.max(
      0,
      (status.status === "running" ? Date.now() : endedAt) - createdAt,
    );
  }
  const legacy = () => {
    const branch = readActiveTrace(sessionsDir, sessionName, status.sessionFile);
    if (branch) snapshot.events = traceEvents(branch);
    else snapshot.truncated = true;
    snapshot.unavailableReason =
      snapshot.status === "stale"
        ? "No verified live owner; persisted active-branch history only"
        : "Legacy child or native control unavailable; persisted active-branch history only";
    return snapshot;
  };
  if (!status.dispatchId || !status.attemptId) return legacy();
  try {
    const channel = readChannel(
      channelPath({
        sessionsDir,
        sessionName,
        dispatchId: status.dispatchId,
        attemptId: status.attemptId,
      }),
    );
    if (!statusMatches(channel, status))
      return {
        ...snapshot,
        status: "stale",
        events: [],
        unavailableReason: "Control identity mismatch",
      };
    const live = liveChannel(channel);
    const identityDead =
      getProcessStartTicks(channel.parentPid) !== channel.parentTicks ||
      (channel.childPid !== undefined &&
        getProcessStartTicks(channel.childPid) !== channel.childTicks);
    const fence = readCockpitFence(channelPath(channel), channel);
    const pendingProof = channel.requests.some(
      (request) => request.staged && (request.status === "queued" || request.status === "expired"),
    );
    const proof = pendingProof
      ? readGuidanceProof(sessionsDir, sessionName, status.sessionFile)
      : undefined;
    applyCockpitFence(channel, fence);
    reconcileReceipts(
      channel,
      proof,
      status.status !== "running" || channel.phase === "closed" || identityDead,
    );
    applyCockpitFence(channel, fence);
    const publicText = (value: unknown, limit = 2048) => publicCockpitText(channel, value, limit);
    snapshot.objective = publicText(snapshot.objective);
    snapshot.profile = publicText(snapshot.profile, 120);
    snapshot.model = publicText(snapshot.model, 200);
    snapshot.events = channel.events.map((event) => ({
      id: publicText(event.id, 120),
      timestamp: publicText(event.timestamp, 80),
      kind: publicText(event.kind, 80),
      text: publicText(event.text),
      toolName: event.toolName ? publicText(event.toolName, 120) : undefined,
      detail: event.detail ? publicText(event.detail, 4096) : undefined,
    }));
    snapshot.receipts = channel.requests.map((r) => ({
      requestId: publicText(r.requestId, 120),
      status: r.status,
      message: publicText(r.message, 4096),
      updatedAt: publicText(r.updatedAt, 80),
      reason: r.reason ? publicText(r.reason, 300) : undefined,
    }));
    snapshot.lastActivityAt = Number.isFinite(channel.lastActivityAt)
      ? channel.lastActivityAt
      : undefined;
    snapshot.latestTool = channel.latestTool ? publicText(channel.latestTool, 120) : undefined;
    snapshot.truncated = channel.truncated;
    const busy = channelIsBusy(channelPath(channel));
    snapshot.steeringSupported =
      live && !busy && !!options.currentSessionKey && !!options.currentRepoRoot;
    snapshot.unavailableReason = fence
      ? publicText(fence.reason, 300)
      : snapshot.steeringSupported
        ? undefined
        : !options.currentSessionKey || !options.currentRepoRoot
          ? "Current parent session and repository identity required"
          : busy
            ? "Private control writer busy or abandoned; no lock takeover"
            : publicText(channel.reason, 300) ||
              (channel.phase === "starting"
                ? "Native child not ready"
                : "Attempt closed or no verified live child");
    if (identityDead && status.status === "running") snapshot.status = "stale";
    return snapshot;
  } catch {
    return legacy();
  }
}

export function requestSubagentSteering(params: {
  state: SubagentState;
  dispatchId: string;
  attemptId: string;
  parentSessionKey: string;
  parentRepoRoot: string;
  requestedBy: string;
  message: string;
}): { ok: boolean; status: string; requestId?: string; error?: string } {
  const rejected = (error: string) => ({ ok: false as const, status: "rejected", error });
  if (!literalGuidance(params.message))
    return rejected(
      "Guidance must be nonempty literal text, at most 4096 bytes, without terminal controls",
    );
  if (
    !params.dispatchId ||
    !params.attemptId ||
    !params.parentSessionKey ||
    !params.parentRepoRoot ||
    !params.requestedBy?.trim() ||
    params.requestedBy.length > 120 ||
    inertText(params.requestedBy, 120) !== params.requestedBy
  ) {
    return rejected("Exact attempt, parent, repository and requester identity required");
  }
  try {
    safeDirectory(resolve(params.state.sessionsDir));
    const names = readdirSync(params.state.sessionsDir);
    if (names.length > 4096) return rejected("Session directory exceeds control lookup bound");
    const matches = names
      .filter((name) => name.endsWith(".status.json"))
      .map((name) => name.slice(0, -".status.json".length))
      .filter(safeSessionName)
      .map((name) => readCockpitStatus(params.state.sessionsDir, name))
      .filter((status) => status?.dispatchId === params.dispatchId);
    if (matches.length !== 1 || !matches[0]) return rejected("Dispatch missing or ambiguous");
    const status = matches[0];
    if (
      status.attemptId !== params.attemptId ||
      status.parentSessionKey !== params.parentSessionKey ||
      status.parentRepoRoot !== params.parentRepoRoot ||
      status.status !== "running"
    )
      return rejected("Stale, terminal or foreign attempt");
    const dir = channelPath({
      sessionsDir: params.state.sessionsDir,
      sessionName: status.sessionName,
      dispatchId: params.dispatchId,
      attemptId: params.attemptId,
    });
    const result = mutateChannel(dir, (channel) => {
      if (!statusMatches(channel, status) || !liveChannel(channel))
        return rejected("Native exact-attempt control is not live");
      reconcileReceipts(channel, undefined);
      if (
        channel.requests.length >= MAX_REQUESTS ||
        channel.requests.filter((r) => r.status === "queued").length >= 8
      ) {
        return rejected("Private steering queue is full (32 total, 8 pending per attempt)");
      }
      const requestId = randomUUID();
      channel.requests.push({
        requestId,
        status: "queued",
        message: params.message,
        requestedBy: params.requestedBy,
        nonce: channel.nonce,
        updatedAt: new Date().toISOString(),
        expiresAt: Date.now() + REQUEST_TTL_MS,
      });
      // Queue acknowledgement is not delivery. The child independently checks
      // lifecycle identity at its native boundary and proves a committed entry.
      return { ok: true as const, status: "queued", requestId };
    });
    if (result.ok) {
      const fence = readCockpitFence(dir, readChannel(dir));
      if (fence) return { ...rejected(fence.reason), requestId: result.requestId };
    }
    return result;
  } catch {
    return rejected("Private native control unavailable, unsafe or busy");
  }
}
