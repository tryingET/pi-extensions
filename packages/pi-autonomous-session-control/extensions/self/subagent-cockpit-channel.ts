import { createHash, randomUUID } from "node:crypto";
import { lstatSync, mkdirSync } from "node:fs";
import { join, resolve } from "node:path";
import {
  applyCockpitFence,
  readCockpitFence,
  writeCockpitFence,
} from "./subagent-cockpit-fence.ts";
import {
  inertText,
  literalGuidance,
  MAX_CHANNEL_BYTES,
  publishPrivateJson,
  readBoundedFile,
  readPrivateJson,
  safeDirectory,
  withChannelLock,
} from "./subagent-cockpit-io.ts";
import {
  GUIDANCE_CUSTOM_TYPE,
  readActiveTrace,
  type TraceEntry,
} from "./subagent-cockpit-trace.ts";
import {
  getProcessStartTicks,
  parseSubagentSessionStatusPayload,
  runningStatusHasLiveOwner,
  type SubagentSessionStatus,
} from "./subagent-session-status.ts";

export const COCKPIT_CHANNEL_ENV = "PI_ASC_COCKPIT_CHANNEL";
export const MAX_REQUESTS = 32;
export const REQUEST_TTL_MS = 5 * 60 * 1000;
export interface CockpitEvent {
  id: string;
  timestamp: string;
  kind: string;
  text: string;
  toolName?: string;
  detail?: string;
}
export interface CockpitReceipt {
  requestId: string;
  status: "queued" | "delivered" | "rejected" | "expired";
  message: string;
  updatedAt: string;
  reason?: string;
}
interface Request extends CockpitReceipt {
  nonce: string;
  requestedBy: string;
  expiresAt: number;
  staged?: boolean;
}
export interface CockpitBinding {
  sessionsDir: string;
  sessionName: string;
  dispatchId: string;
  attemptId: string;
  parentSessionKey: string;
  parentRepoRoot: string;
  cwd: string;
  sessionFile: string;
}
export interface CockpitChannel extends CockpitBinding {
  schema: "asc.cockpit.v1";
  nonce: string;
  parentPid: number;
  parentTicks: number;
  childPid?: number;
  childTicks?: number;
  phase: "starting" | "open" | "closing" | "closed";
  reason?: string;
  events: CockpitEvent[];
  requests: Request[];
  lastActivityAt?: number;
  latestTool?: string;
  truncated: boolean;
}

export function safeSessionName(name: string): boolean {
  return typeof name === "string" && /^[a-zA-Z0-9._-]{1,80}$/u.test(name);
}
export function channelPath(
  binding: Pick<CockpitBinding, "sessionsDir" | "sessionName" | "dispatchId" | "attemptId">,
): string {
  const key = createHash("sha256")
    .update(JSON.stringify([binding.sessionName, binding.dispatchId, binding.attemptId]))
    .digest("hex");
  return join(resolve(binding.sessionsDir), `.cockpit-${key}`);
}
export function readCockpitStatus(sessionsDir: string, name: string): SubagentSessionStatus | null {
  if (!safeSessionName(name)) return null;
  try {
    const status = parseSubagentSessionStatusPayload(
      JSON.parse(readBoundedFile(join(resolve(sessionsDir), `${name}.status.json`), 256 * 1024)),
    );
    return status?.sessionName === name && status.sessionKind === "subagent" ? status : null;
  } catch {
    return null;
  }
}

function validString(value: unknown, max = 4096): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= max;
}
export function readChannel(dir: string): CockpitChannel {
  safeDirectory(dir, true);
  const data = readPrivateJson(join(dir, "channel.json")) as CockpitChannel;
  if (
    !data ||
    data.schema !== "asc.cockpit.v1" ||
    ![
      "sessionsDir",
      "sessionName",
      "dispatchId",
      "attemptId",
      "parentSessionKey",
      "parentRepoRoot",
      "cwd",
      "sessionFile",
      "nonce",
    ].every((key) => validString(data[key as keyof CockpitChannel])) ||
    !safeSessionName(data.sessionName) ||
    channelPath(data) !== resolve(dir) ||
    data.sessionFile !== join(resolve(data.sessionsDir), `${data.sessionName}.jsonl`) ||
    (data.reason !== undefined && (typeof data.reason !== "string" || data.reason.length > 300)) ||
    typeof data.truncated !== "boolean" ||
    (data.lastActivityAt !== undefined && !Number.isFinite(data.lastActivityAt)) ||
    (data.latestTool !== undefined && !validString(data.latestTool, 120)) ||
    !Number.isSafeInteger(data.parentPid) ||
    !Number.isSafeInteger(data.parentTicks) ||
    !["starting", "open", "closing", "closed"].includes(data.phase) ||
    (data.childPid !== undefined &&
      (!Number.isSafeInteger(data.childPid) || !Number.isSafeInteger(data.childTicks))) ||
    !Array.isArray(data.events) ||
    data.events.length > 80 ||
    !Array.isArray(data.requests) ||
    data.requests.length > MAX_REQUESTS ||
    !data.requests.every(
      (r) =>
        validString(r.requestId, 120) &&
        literalGuidance(r.message) &&
        r.nonce === data.nonce &&
        validString(r.requestedBy, 120) &&
        Number.isFinite(r.expiresAt) &&
        ["queued", "delivered", "rejected", "expired"].includes(r.status) &&
        validString(r.updatedAt, 80) &&
        (r.staged === undefined || typeof r.staged === "boolean"),
    ) ||
    new Set(data.requests.map((r) => r.requestId)).size !== data.requests.length ||
    !data.events.every(
      (e) =>
        validString(e.id, 120) &&
        validString(e.timestamp, 80) &&
        validString(e.kind, 80) &&
        typeof e.text === "string" &&
        e.text.length <= 2048 &&
        (e.detail === undefined || (typeof e.detail === "string" && e.detail.length <= 4096)) &&
        (e.toolName === undefined || validString(e.toolName, 120)),
    )
  )
    throw new Error("Invalid channel");
  return data;
}

export function createCockpitChannel(binding: CockpitBinding): string | undefined {
  if (
    !safeSessionName(binding.sessionName) ||
    !binding.parentSessionKey ||
    !binding.parentRepoRoot ||
    !binding.dispatchId ||
    !binding.attemptId
  )
    return undefined;
  const parentTicks = getProcessStartTicks(process.pid);
  if (parentTicks === null) return undefined;
  const dir = channelPath(binding);
  safeDirectory(resolve(binding.sessionsDir));
  safeDirectory(resolve(binding.cwd));
  safeDirectory(binding.parentRepoRoot);
  if (
    resolve(binding.sessionFile) !==
    join(resolve(binding.sessionsDir), `${binding.sessionName}.jsonl`)
  )
    return undefined;
  try {
    const stat = lstatSync(binding.sessionFile);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1) return undefined;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  mkdirSync(dir, { mode: 0o700 }); // Exclusive generation: never reuse/resurrect an old channel.
  const channel: CockpitChannel = {
    ...binding,
    sessionsDir: resolve(binding.sessionsDir),
    cwd: resolve(binding.cwd),
    sessionFile: resolve(binding.sessionFile),
    schema: "asc.cockpit.v1",
    nonce: randomUUID(),
    parentPid: process.pid,
    parentTicks,
    phase: "starting",
    events: [],
    requests: [],
    truncated: false,
  };
  fitCockpitBudget(channel);
  publishPrivateJson(dir, channel);
  return dir;
}

export function statusMatches(
  channel: CockpitChannel,
  status: SubagentSessionStatus | null,
): boolean {
  return (
    !!status &&
    status.sessionName === channel.sessionName &&
    status.dispatchId === channel.dispatchId &&
    status.attemptId === channel.attemptId &&
    status.parentSessionKey === channel.parentSessionKey &&
    status.parentRepoRoot === channel.parentRepoRoot &&
    resolve(status.sessionFile ?? "") === channel.sessionFile
  );
}
export function attemptIdentityLive(channel: CockpitChannel): boolean {
  const status = readCockpitStatus(channel.sessionsDir, channel.sessionName);
  return (
    statusMatches(channel, status) &&
    status?.status === "running" &&
    runningStatusHasLiveOwner(status) &&
    getProcessStartTicks(channel.parentPid) === channel.parentTicks &&
    typeof channel.childPid === "number" &&
    getProcessStartTicks(channel.childPid) === channel.childTicks
  );
}

export function liveChannel(channel: CockpitChannel): boolean {
  return (
    channel.phase === "open" &&
    !readCockpitFence(channelPath(channel), channel) &&
    attemptIdentityLive(channel)
  );
}

// JSON bytes, not JS character counts. Preserve every control/receipt record;
// telemetry loses oldest events first. The final serializer also checks the cap.
export function fitCockpitBudget(channel: CockpitChannel): void {
  const base = Buffer.byteLength(JSON.stringify({ ...channel, events: [] }));
  const sizes = channel.events.map((event) => Buffer.byteLength(JSON.stringify(event)));
  let total = base + sizes.reduce((sum, size) => sum + size, 0) + Math.max(0, sizes.length - 1);
  while (total > MAX_CHANNEL_BYTES && channel.events.length > 0) {
    channel.events.shift();
    total -= (sizes.shift() ?? 0) + (channel.events.length > 0 ? 1 : 0);
    channel.truncated = true;
  }
  if (total > MAX_CHANNEL_BYTES) throw new Error("Control records exceed private channel budget");
}

export function mutateChannel<T>(dir: string, action: (channel: CockpitChannel) => T): T {
  return withChannelLock(dir, () => {
    const channel = readChannel(dir);
    applyCockpitFence(channel, readCockpitFence(dir, channel));
    const result = action(channel);
    applyCockpitFence(channel, readCockpitFence(dir, channel));
    fitCockpitBudget(channel);
    publishPrivateJson(dir, channel);
    return result;
  });
}

export function reconcileReceipts(
  channel: CockpitChannel,
  branch: readonly TraceEntry[] | undefined,
  final = false,
): void {
  const committed = new Set(
    (branch ?? [])
      .filter(
        (entry) =>
          entry.type === "custom_message" &&
          entry.customType === GUIDANCE_CUSTOM_TYPE &&
          entry.details?.dispatchId === channel.dispatchId &&
          entry.details?.attemptId === channel.attemptId,
      )
      .map((entry) => entry.details?.requestId),
  );
  for (const request of channel.requests) {
    // Closure can race the SDK's synchronous commit after our proposal was
    // returned. Late persisted proof corrects an unconfirmed expiry, but never
    // schedules work or reopens the channel.
    if (
      request.status !== "queued" &&
      !(request.status === "expired" && request.staged && committed.has(request.requestId))
    )
      continue;
    if (request.staged && committed.has(request.requestId)) {
      request.status = "delivered";
      request.reason = "Literal guidance committed to child context; compliance is not implied";
      appendCockpitEvent(channel, {
        id: `guidance-${request.requestId}`,
        kind: "guidance",
        text: request.message,
      });
    } else if (final || (!request.staged && Date.now() >= request.expiresAt)) {
      request.status = "expired";
      request.reason = request.staged
        ? "Attempt closed without confirmed context delivery"
        : "No native boundary before expiry/closure";
    } else continue;
    request.updatedAt = new Date().toISOString();
  }
}

export function closeCockpitChannel(dir: string | undefined, reason: string): void {
  if (!dir) return;
  try {
    const current = readChannel(dir);
    writeCockpitFence(dir, current.nonce, reason, "expired");
    mutateChannel(dir, (channel) => {
      reconcileReceipts(
        channel,
        readActiveTrace(channel.sessionsDir, channel.sessionName, channel.sessionFile),
        true,
      );
      channel.phase = "closed";
      channel.reason = inertText(reason, 300);
    });
  } catch {
    /* Stale lock/unsafe channel stays fail-closed; terminal lifecycle is independently authoritative. */
  }
}

export function publicCockpitText(channel: CockpitChannel, value: unknown, limit = 2048): string {
  return inertText(value, limit)
    .replaceAll(channel.nonce, "[private control token]")
    .slice(0, limit);
}

export function appendCockpitEvent(
  channel: CockpitChannel,
  event: Omit<CockpitEvent, "timestamp">,
): void {
  const now = Date.now();
  const clean: CockpitEvent = {
    id: inertText(event.id, 120),
    timestamp: new Date(now).toISOString(),
    kind: inertText(event.kind, 80),
    text: publicCockpitText(channel, event.text),
    ...(event.toolName ? { toolName: inertText(event.toolName, 120) } : {}),
    ...(event.detail ? { detail: publicCockpitText(channel, event.detail, 4096) } : {}),
  };
  const previous = channel.events.findIndex((item) => item.id === clean.id);
  if (previous >= 0) channel.events[previous] = clean;
  else channel.events.push(clean);
  if (channel.events.length > 80) {
    channel.events.shift();
    channel.truncated = true;
  }
  channel.truncated ||= event.text.length > 2048 || (event.detail?.length ?? 0) > 4096;
  channel.lastActivityAt = now;
  if (clean.toolName) channel.latestTool = clean.toolName;
}
