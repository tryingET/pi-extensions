import { createHash, randomUUID } from "node:crypto";
import { mkdirSync, readdirSync, renameSync, unlinkSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  type BootstrapRetryOptions,
  durableJson,
  readAttachmentBootstrap,
  registerAttachmentBootstrap,
  retryAttachmentLock,
  syncDirectory,
} from "./subagent-attachment-bootstrap.ts";
import {
  type AttachmentViewerSafety as ViewerSafety,
  validAttachmentViewerSafety,
} from "./subagent-attachment-safety.ts";
import { readCockpitStatus } from "./subagent-cockpit-channel.ts";
import {
  inertText,
  readPrivateJson,
  safeDirectory,
  withChannelLock,
} from "./subagent-cockpit-io.ts";
import { getProcessStartTicks } from "./subagent-session-status.ts";

export const ATTACHMENT_EVENT = "asc:subagent-tabs:request:v1";
export const MAX_ATTACHMENT_GENERATIONS = 32;
export const VIEWER_FLAGS = [
  "--no-session",
  "--no-extensions",
  "--no-tools",
  "--no-mcp",
  "--no-skills",
  "--no-prompt-templates",
  "--no-context-files",
  "--offline",
] as const;
export interface AttachmentIdentity {
  cwd: string;
  sessionsDir: string;
  parentSessionKey: string;
  parentRepoRoot: string;
  sessionName: string;
  dispatchId: string;
  attemptId: string;
}
export interface AttachmentItem {
  key: string;
  sessionName: string;
  dispatchId: string;
  attemptId: string;
  ticketPath: string;
  viewerExtensionPath: string;
}
export interface AttachmentRead {
  status: string;
  detail?: string;
  viewerPid?: number;
  viewerStartedAt?: number;
  viewerSurfaceId?: string;
}
export interface AttachmentSettlement {
  ok: boolean;
  effectDisposition?: "settled" | "confirmed_no_effects" | "effect_indeterminate";
  detail?: string;
}
export interface AttachmentRequest {
  schema: "asc.subagent-tabs.request.v1";
  requestId: string;
  cwd: string;
  parentSessionKey: string;
  parentRepoRoot: string;
  items: AttachmentItem[];
  claim(key: string): { action: "launch" | "reuse" | "blocked"; status: string; detail?: string };
  settle(key: string, result: AttachmentSettlement): void;
  read(key: string): AttachmentRead;
  reply(result: {
    requestId: string;
    items: Array<{ key: string; status: string; detail?: string }>;
  }): void;
}
export interface AttachmentTicket extends AttachmentIdentity {
  schema: "asc.subagent-attachment.ticket.v1";
  key: string;
  generation: string;
  nonce: string;
  ownerPid: number;
  ownerStartedAt: number;
  childPid: number;
  childStartedAt?: number;
  viewerExtensionPath: string;
  ticketPath: string;
  argv: string[];
}
interface Record extends AttachmentRead {
  schema: "asc.subagent-attachment.registry.v1";
  ticket: AttachmentTicket;
  viewerArgv?: string[];
  viewerSafety?: ViewerSafety;
  detached?: boolean;
}

function keyFor(identity: AttachmentIdentity): string {
  return createHash("sha256")
    .update(
      JSON.stringify([
        identity.cwd,
        identity.sessionsDir,
        identity.parentSessionKey,
        identity.parentRepoRoot,
        identity.sessionName,
        identity.dispatchId,
        identity.attemptId,
      ]),
    )
    .digest("hex");
}
function validateTicket(value: unknown, path: string): AttachmentTicket {
  const t = value as AttachmentTicket;
  if (
    !t ||
    t.schema !== "asc.subagent-attachment.ticket.v1" ||
    t.ticketPath !== path ||
    ![
      t.cwd,
      t.sessionsDir,
      t.parentSessionKey,
      t.parentRepoRoot,
      t.sessionName,
      t.dispatchId,
      t.attemptId,
      t.nonce,
      t.generation,
      t.viewerExtensionPath,
    ].every(
      (v) => typeof v === "string" && v.length > 0 && v.length <= 4096 && inertText(v, 4096) === v,
    ) ||
    t.key !== keyFor(t) ||
    !Number.isInteger(t.ownerPid) ||
    !Number.isFinite(t.ownerStartedAt) ||
    !Number.isInteger(t.childPid) ||
    (t.childStartedAt !== undefined && !Number.isFinite(t.childStartedAt)) ||
    !/^ticket-[a-f0-9-]{36}\.json$/.test(basename(path)) ||
    basename(path) !== `ticket-${t.generation}.json` ||
    !/^[a-f0-9-]{36}$/.test(t.nonce) ||
    dirname(path) !== join(resolve(t.sessionsDir), ".asc-attachments", t.key) ||
    !/^subagent-attachment-viewer\.(ts|js)$/.test(basename(t.viewerExtensionPath)) ||
    dirname(t.viewerExtensionPath) !== dirname(fileURLToPath(import.meta.url)) ||
    JSON.stringify(t.argv) !== JSON.stringify(viewerArgv(t.viewerExtensionPath, path))
  ) {
    throw new Error("Invalid private attachment ticket");
  }
  safeDirectory(dirname(path), true);
  return t;
}
export function viewerArgv(extension: string, ticketPath: string): string[] {
  return [...VIEWER_FLAGS, "-e", extension, "--asc-subagent-view-ticket", ticketPath];
}
export function readAttachmentTicket(path: string): AttachmentTicket {
  return validateTicket(readPrivateJson(path), path);
}
function readRecord(ticket: AttachmentTicket): Record {
  const r = readPrivateJson(join(dirname(ticket.ticketPath), "channel.json")) as Record;
  if (
    r?.schema !== "asc.subagent-attachment.registry.v1" ||
    JSON.stringify(r.ticket) !== JSON.stringify(ticket) ||
    typeof r.status !== "string"
  ) {
    throw new Error("Attachment generation changed or registry unavailable");
  }
  return r;
}
function publish(record: Record): void {
  const dir = dirname(record.ticket.ticketPath);
  safeDirectory(dir, true);
  const temporary = join(dir, `.publish-${randomUUID()}`);
  try {
    durableJson(temporary, record, 65536);
    renameSync(temporary, join(dir, "channel.json"));
    syncDirectory(dir);
  } finally {
    try {
      unlinkSync(temporary);
    } catch {
      /* Only this owned temporary, or already renamed. */
    }
  }
}
function exactAttempt(t: AttachmentTicket): boolean {
  const s = readCockpitStatus(t.sessionsDir, t.sessionName);
  return (
    !!s &&
    s.dispatchId === t.dispatchId &&
    s.attemptId === t.attemptId &&
    s.parentSessionKey === t.parentSessionKey &&
    s.parentRepoRoot === t.parentRepoRoot &&
    s.pid === t.childPid &&
    s.pidStartedAt === t.childStartedAt
  );
}
function ownerLive(t: AttachmentTicket): boolean {
  return getProcessStartTicks(t.ownerPid) === t.ownerStartedAt;
}
// Only ESRCH or a positively identified different process proves death. Permission,
// procfs failures and unknown launch PIDs never authorize reopening.
export function viewerProvenDead(pid: number, ticks: number): boolean {
  const current = getProcessStartTicks(pid);
  if (current !== null) return current !== ticks;
  try {
    process.kill(pid, 0);
    return false;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === "ESRCH";
  }
}
function observed(record: Record): AttachmentRead {
  const bootstrap = readAttachmentBootstrap(record.ticket);
  if (!record.viewerPid && bootstrap) {
    return viewerProvenDead(bootstrap.viewerPid, bootstrap.viewerStartedAt)
      ? {
          status: "viewer_dead",
          detail: "Registered bootstrap viewer death proven; explicit reopen allowed",
        }
      : {
          status: "bootstrapping",
          detail: "Viewer PID registered; ready ACK not published",
          viewerPid: bootstrap.viewerPid,
          viewerStartedAt: bootstrap.viewerStartedAt,
        };
  }
  if (
    record.viewerPid &&
    record.viewerStartedAt !== undefined &&
    viewerProvenDead(record.viewerPid, record.viewerStartedAt)
  ) {
    return { status: "viewer_dead", detail: "Viewer death proven; explicit reopen allowed" };
  }
  if (
    record.status === "ready" &&
    !record.detached &&
    (!record.viewerPid ||
      record.viewerStartedAt === undefined ||
      JSON.stringify(record.viewerArgv) !== JSON.stringify(record.ticket.argv) ||
      getProcessStartTicks(record.viewerPid) !== record.viewerStartedAt)
  ) {
    return {
      status: "unconfirmed",
      detail: "Viewer PID-start/argv readiness cannot be verified; no retry",
    };
  }
  return {
    status: record.detached ? "closed" : record.status,
    detail: record.detail,
    viewerPid: record.viewerPid,
    viewerStartedAt: record.viewerStartedAt,
    viewerSurfaceId: record.viewerSurfaceId,
  };
}

/** Explicit operator request only. Never invoked by polling or settlement retries. */
export function prepareAttachment(
  identity: AttachmentIdentity,
  viewerExtensionPath: string,
): AttachmentItem {
  const ownerStartedAt = getProcessStartTicks(process.pid);
  if (ownerStartedAt === null) throw new Error("Verified controller process identity required");
  const key = keyFor(identity);
  safeDirectory(identity.sessionsDir);
  const root = join(identity.sessionsDir, ".asc-attachments");
  try {
    mkdirSync(root, { mode: 0o700 });
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== "EEXIST") throw e;
  }
  safeDirectory(root, true);
  syncDirectory(identity.sessionsDir);
  const dir = join(root, key);
  try {
    mkdirSync(dir, { mode: 0o700 });
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== "EEXIST") throw e;
  }
  syncDirectory(root);
  return withChannelLock(dir, () => {
    let prior: Record | undefined;
    try {
      prior = readPrivateJson(join(dir, "channel.json")) as Record;
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
    }
    if (prior) {
      validateTicket(prior.ticket, prior.ticket.ticketPath);
      if (
        prior.ticket.key !== key ||
        prior.ticket.ownerPid !== process.pid ||
        prior.ticket.ownerStartedAt !== ownerStartedAt
      )
        throw new Error("Different original controller owner");
    }
    let ticket = prior?.ticket;
    if (
      !prior ||
      observed(prior).status === "viewer_dead" ||
      (prior.status === "confirmed_no_effects" && !readAttachmentBootstrap(prior.ticket))
    ) {
      const count = readdirSync(dir).filter((name) => name.startsWith("ticket-")).length;
      if (count >= MAX_ATTACHMENT_GENERATIONS)
        throw new Error(
          `Attachment generation limit (${MAX_ATTACHMENT_GENERATIONS}) reached; retained files require owner investigation, nothing deleted`,
        );
      const generation = randomUUID();
      const ticketPath = join(dir, `ticket-${generation}.json`);
      const child = readCockpitStatus(identity.sessionsDir, identity.sessionName);
      if (
        !child ||
        (child.status === "running" &&
          (child.pidStartedAt === undefined ||
            getProcessStartTicks(child.pid) !== child.pidStartedAt))
      ) {
        throw new Error("Original child PID-start identity unavailable");
      }
      ticket = {
        ...identity,
        schema: "asc.subagent-attachment.ticket.v1",
        key,
        generation,
        nonce: randomUUID(),
        ownerPid: process.pid,
        ownerStartedAt,
        childPid: child.pid,
        childStartedAt: child.pidStartedAt,
        viewerExtensionPath,
        ticketPath,
        argv: viewerArgv(viewerExtensionPath, ticketPath),
      };
      validateTicket(ticket, ticketPath);
      if (!exactAttempt(ticket)) throw new Error("Exact original attempt no longer owned");
      durableJson(ticketPath, ticket, 16384);
      publish({ schema: "asc.subagent-attachment.registry.v1", ticket, status: "prepared" });
    }
    if (!ticket) throw new Error("Attachment ticket unavailable");
    return {
      key,
      sessionName: ticket.sessionName,
      dispatchId: ticket.dispatchId,
      attemptId: ticket.attemptId,
      ticketPath: ticket.ticketPath,
      viewerExtensionPath: ticket.viewerExtensionPath,
    };
  });
}
export function readAttachment(item: AttachmentItem): AttachmentRead {
  try {
    const t = readAttachmentTicket(item.ticketPath);
    const r = readRecord(t);
    if (!ownerLive(t) || !exactAttempt(t))
      return { status: "stale", detail: "Original owner/attempt changed" };
    return observed(r);
  } catch {
    return { status: "blocked", detail: "Private attachment unavailable or generation changed" };
  }
}
export function claimAttachment(item: AttachmentItem): ReturnType<AttachmentRequest["claim"]> {
  try {
    const t = readAttachmentTicket(item.ticketPath);
    return withChannelLock(dirname(t.ticketPath), () => {
      const r = readRecord(t);
      if (!ownerLive(t) || t.ownerPid !== process.pid || !exactAttempt(t)) {
        return { action: "blocked", status: "stale", detail: "Original owner/attempt changed" };
      }
      const view = observed(r);
      if (view.status === "ready") {
        return { action: "reuse", status: view.status, detail: view.detail };
      }
      if (r.status !== "prepared")
        return { action: "blocked", status: view.status, detail: view.detail };
      r.status = "claimed";
      r.detail = "Launch claimed durably; no automatic retry";
      publish(r);
      return { action: "launch", status: r.status };
    });
  } catch {
    return { action: "blocked", status: "blocked", detail: "Attachment claim unavailable" };
  }
}
export function settleAttachment(item: AttachmentItem, result: AttachmentSettlement): void {
  const t = readAttachmentTicket(item.ticketPath);
  withChannelLock(dirname(t.ticketPath), () => {
    const r = readRecord(t);
    // Late/duplicate consumers cannot downgrade readiness or release another claim.
    if (r.status !== "claimed") return;
    r.status =
      result.effectDisposition === "confirmed_no_effects"
        ? "confirmed_no_effects"
        : result.ok && result.effectDisposition === "settled"
          ? "awaiting_ready"
          : "effect_indeterminate";
    r.detail =
      inertText(result.detail, 500) ||
      "Transport result is not viewer readiness or placement proof";
    publish(r);
  });
}

/** ACK proves only validated bootstrap and installed input handlers, not pixels/effects. */
export function acknowledgeAttachment(path: string): AttachmentTicket {
  const argv = process.argv.slice(2);
  const t = readAttachmentTicket(path);
  const ticks = getProcessStartTicks(process.pid);
  if (
    ticks === null ||
    process.pid === t.ownerPid ||
    !ownerLive(t) ||
    !exactAttempt(t) ||
    resolve(process.cwd()) !== t.cwd ||
    JSON.stringify(argv) !== JSON.stringify(t.argv)
  ) {
    throw new Error("Viewer bootstrap/owner/attempt mismatch");
  }
  // Register a PID independently before contending for the shared controller lock.
  // A failed/timed-out ACK can therefore be reopened only after this viewer's proven death.
  const prior = readRecord(t);
  if (!["claimed", "awaiting_ready", "effect_indeterminate"].includes(prior.status))
    throw new Error("Viewer generation already acknowledged or not claimed");
  registerAttachmentBootstrap(t);
  withChannelLock(dirname(path), () => {
    const r = readRecord(t);
    if (!ownerLive(t) || !exactAttempt(t))
      throw new Error("Original owner/attempt changed during bootstrap");
    if (!["claimed", "awaiting_ready", "effect_indeterminate"].includes(r.status)) {
      throw new Error("Viewer generation already acknowledged or not claimed");
    }
    r.status = "ready";
    r.detail = "Native input handlers ready; placement/pixels/effects unverified";
    r.viewerPid = process.pid;
    r.viewerStartedAt = ticks;
    r.viewerArgv = argv;
    // Surface metadata is diagnostic only, never placement proof.
    r.viewerSurfaceId = inertText(process.env.GHOSTTY_SURFACE_ID, 200) || undefined;
    publish(r);
  });
  return t;
}
export async function acknowledgeAttachmentWithRetry(
  path: string,
  options: BootstrapRetryOptions = {},
): Promise<AttachmentTicket> {
  return retryAttachmentLock(() => acknowledgeAttachment(path), options);
}
export function attachmentViewerStillBound(t: AttachmentTicket): boolean {
  try {
    const r = readRecord(t);
    return (
      ownerLive(t) &&
      exactAttempt(t) &&
      r.viewerPid === process.pid &&
      r.viewerStartedAt === getProcessStartTicks(process.pid) &&
      r.status === "ready" &&
      !r.detached
    );
  } catch {
    return false;
  }
}
/** Private per-generation observation only; callbacks/public read remain content-free.
 * Exact native viewer identity is rechecked under the shared lock, including on shutdown. */
export function publishAttachmentViewerSafety(t: AttachmentTicket, value: ViewerSafety): boolean {
  try {
    if (!validAttachmentViewerSafety(value)) return false;
    const snapshot = JSON.parse(JSON.stringify(value)) as ViewerSafety;
    return withChannelLock(dirname(t.ticketPath), () => {
      const r = readRecord(t);
      if (
        !ownerLive(t) ||
        !exactAttempt(t) ||
        r.status !== "ready" ||
        r.viewerPid !== process.pid ||
        r.viewerStartedAt !== getProcessStartTicks(process.pid) ||
        JSON.stringify(r.viewerArgv) !== JSON.stringify(t.argv) ||
        (r.viewerSafety && snapshot.revision <= r.viewerSafety.revision)
      )
        return false;
      r.viewerSafety = snapshot;
      publish(r);
      return true;
    });
  } catch {
    return false;
  } // No takeover or effects on child/guard behavior.
}
export function detachAttachment(t: AttachmentTicket): void {
  withChannelLock(dirname(t.ticketPath), () => {
    const r = readRecord(t);
    if (r.viewerPid !== process.pid || r.viewerStartedAt !== getProcessStartTicks(process.pid))
      return;
    r.detached = true;
    r.detail = "Viewer detached; child unchanged. Reopen requires proven viewer death.";
    publish(r);
  });
}
