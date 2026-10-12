import { randomUUID } from "node:crypto";
import {
  closeSync,
  constants,
  existsSync,
  fsyncSync,
  openSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import type { AttachmentTicket } from "./subagent-attachment-registry.ts";
import { readPrivateJson, safeDirectory } from "./subagent-cockpit-io.ts";
import { getProcessStartTicks } from "./subagent-session-status.ts";

export function syncDirectory(dir: string): void {
  const fd = openSync(dir, constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW);
  try {
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
}
export function durableJson(path: string, value: unknown, maxBytes: number): void {
  const raw = JSON.stringify(value);
  if (Buffer.byteLength(raw) > maxBytes) throw new Error("Attachment record exceeds byte bound");
  const fd = openSync(
    path,
    constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW,
    0o600,
  );
  try {
    writeFileSync(fd, raw);
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
}
/** Complete-before-visible, first-writer publication. The separate reservation is never
 * read as a receipt; a crashed publisher stays fail-closed without exposing partial JSON. */
export function publishBootstrapReceipt(
  path: string,
  value: unknown,
  beforePublish?: () => void,
): void {
  const dir = dirname(path);
  safeDirectory(dir, true);
  const reservation = `${path}.publish-lock`;
  const fd = openSync(
    reservation,
    constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW,
    0o600,
  );
  const temporary = join(dir, `.bootstrap-${randomUUID()}`);
  try {
    if (existsSync(path)) {
      const error = new Error("Bootstrap receipt already published") as NodeJS.ErrnoException;
      error.code = "EEXIST";
      throw error;
    }
    durableJson(temporary, value, 16384);
    // Test-only seam: production never supplies a publication callback.
    beforePublish?.();
    renameSync(temporary, path);
    syncDirectory(dir);
  } finally {
    closeSync(fd);
    try {
      unlinkSync(temporary);
    } catch {
      /* Owned temporary, or already renamed. */
    }
    unlinkSync(reservation);
  }
}
interface BootstrapReceipt {
  schema: "asc.subagent-attachment.bootstrap.v1";
  key: string;
  generation: string;
  nonce: string;
  viewerPid: number;
  viewerStartedAt: number;
  argv: string[];
}
function bootstrapPath(t: AttachmentTicket): string {
  return join(dirname(t.ticketPath), `bootstrap-${t.generation}.json`);
}
export function readAttachmentBootstrap(t: AttachmentTicket): BootstrapReceipt | undefined {
  let value: unknown;
  try {
    value = readPrivateJson(bootstrapPath(t));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw error;
  }
  const r = value as BootstrapReceipt;
  if (
    r?.schema !== "asc.subagent-attachment.bootstrap.v1" ||
    r.key !== t.key ||
    r.generation !== t.generation ||
    r.nonce !== t.nonce ||
    !Number.isInteger(r.viewerPid) ||
    r.viewerPid <= 0 ||
    !Number.isFinite(r.viewerStartedAt) ||
    JSON.stringify(r.argv) !== JSON.stringify(t.argv)
  )
    throw new Error("Invalid viewer bootstrap receipt");
  return r;
}
/** Immutable per-generation PID/argv registration; no shared controller lock required.
 * This is NOT a ready ACK. It enables death proof if shared ACK publication stays contended.
 * Caller must install input handlers and validate original owner/attempt before calling. */
export function registerAttachmentBootstrap(t: AttachmentTicket): void {
  safeDirectory(dirname(t.ticketPath), true);
  const ticks = getProcessStartTicks(process.pid);
  if (
    ticks === null ||
    process.pid === t.ownerPid ||
    JSON.stringify(process.argv.slice(2)) !== JSON.stringify(t.argv)
  )
    throw new Error("Viewer bootstrap identity mismatch");
  const r: BootstrapReceipt = {
    schema: "asc.subagent-attachment.bootstrap.v1",
    key: t.key,
    generation: t.generation,
    nonce: t.nonce,
    viewerPid: process.pid,
    viewerStartedAt: ticks,
    argv: process.argv.slice(2),
  };
  try {
    publishBootstrapReceipt(bootstrapPath(t), r);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    const prior = readAttachmentBootstrap(t);
    if (JSON.stringify(prior) !== JSON.stringify(r))
      throw new Error("Viewer generation already registered by another process");
  }
}

export interface BootstrapRetryOptions {
  timeoutMs?: number;
  intervalMs?: number;
  signal?: AbortSignal;
  /** Deterministic test seam; never provided by the host event. */
  wait?: (ms: number, signal?: AbortSignal) => Promise<void>;
}
export async function retryAttachmentLock<T>(
  action: () => T,
  options: BootstrapRetryOptions = {},
): Promise<T> {
  const timeout = Math.min(3000, Math.max(0, options.timeoutMs ?? 3000));
  const interval = Math.min(100, Math.max(1, options.intervalMs ?? 25));
  const deadline = Date.now() + timeout;
  const attempts = Math.ceil(timeout / interval) + 1;
  for (let i = 0; i < attempts; i++) {
    options.signal?.throwIfAborted();
    try {
      return action();
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      if (i === attempts - 1 || Date.now() >= deadline)
        throw new Error(
          "Viewer ACK lock timeout; PID registered, no launch retry or lock takeover",
        );
      const ms = Math.min(interval, Math.max(1, deadline - Date.now()));
      if (options.wait) await options.wait(ms, options.signal);
      else {
        const { setTimeout } = await import("node:timers/promises");
        await setTimeout(ms, undefined, { signal: options.signal });
      }
    }
  }
  throw new Error("Viewer ACK attempt budget exhausted");
}
