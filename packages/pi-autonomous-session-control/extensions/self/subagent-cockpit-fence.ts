import { lstatSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import type { CockpitChannel } from "./subagent-cockpit-channel.ts";
import { inertText, readBoundedFile, safeDirectory } from "./subagent-cockpit-io.ts";

export const FINAL_LOCK_WAIT_MS = 250;
interface CockpitFence {
  reason: string;
  disposition: "rejected" | "expired";
}

// Independent, monotonic admission fence. It never takes over a writer's lock.
// This also covers a suspended enqueuer which publishes after final lock timeout.
export function writeCockpitFence(
  dir: string,
  nonce: string,
  reason: string,
  disposition: CockpitFence["disposition"] = "rejected",
): void {
  safeDirectory(dir, true);
  const raw = JSON.stringify({
    schema: "asc.cockpit-fence.v1",
    nonce,
    reason: inertText(reason, 300),
    disposition,
  });
  if (Buffer.byteLength(raw) > 4096) throw new Error("Private fence exceeds byte budget");
  try {
    writeFileSync(join(dir, "fence.json"), raw, { mode: 0o600, flag: "wx" });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
  }
}

export function readCockpitFence(dir: string, channel: CockpitChannel): CockpitFence | undefined {
  try {
    lstatSync(join(dir, "fence.json"));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    return { reason: "Private control fence unavailable", disposition: "rejected" };
  }
  try {
    const value = JSON.parse(readBoundedFile(join(dir, "fence.json"), 4096, true));
    if (
      value.schema !== "asc.cockpit-fence.v1" ||
      value.nonce !== channel.nonce ||
      typeof value.reason !== "string" ||
      value.reason.length > 300 ||
      !["rejected", "expired"].includes(value.disposition)
    )
      throw new Error("Unsafe fence");
    return { reason: inertText(value.reason, 300), disposition: value.disposition };
  } catch {
    return { reason: "Unsafe private control fence", disposition: "rejected" };
  }
}

export function applyCockpitFence(channel: CockpitChannel, fence: CockpitFence | undefined): void {
  if (!fence) return;
  for (const request of channel.requests) {
    if (request.status !== "queued") continue;
    request.status = request.staged ? "expired" : fence.disposition;
    request.reason = request.staged ? "Fenced without confirmed context delivery" : fence.reason;
    request.updatedAt = new Date().toISOString();
  }
}

export async function retryCockpitMutation<T>(action: () => T): Promise<T> {
  const deadline = performance.now() + FINAL_LOCK_WAIT_MS;
  for (let attempt = 0; ; attempt++) {
    try {
      return action();
    } catch (error) {
      if (
        (error as NodeJS.ErrnoException).code !== "EEXIST" ||
        performance.now() >= deadline ||
        attempt >= 25
      )
        throw error;
      await delay(Math.min(10, Math.max(1, deadline - performance.now())));
    }
  }
}
