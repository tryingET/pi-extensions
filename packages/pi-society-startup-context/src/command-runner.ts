// Bounded no-shell transport. Promise completion is NOT an owned-resource settlement receipt.
import { type ChildProcessByStdio, spawn } from "node:child_process";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { performance } from "node:perf_hooks";
import type { Readable } from "node:stream";
import { StringDecoder } from "node:string_decoder";

export type FailureReason =
  | "timeout"
  | "cancelled"
  | "refresh_timeout"
  | "nonzero_exit"
  | "launch_failure"
  | "output_limit"
  | "output_incomplete"
  | "cleanup_failure";
export interface OwnedResource {
  description: string;
  isSettled: () => boolean;
}
export class OwnedReaders {
  private readonly unresolved = new Set<OwnedResource>();
  constructor(private readonly retention?: { retain: () => void; release: () => void }) {}
  retain(resource: OwnedResource): void {
    this.unresolved.add(resource);
    this.retention?.retain();
  }
  // Demand-only observations: no retry/cleanup polling and no unsafe re-signalling.
  blocked(): boolean {
    for (const resource of this.unresolved) {
      try {
        if (resource.isSettled()) this.unresolved.delete(resource);
      } catch {
        /* proof unavailable: retain ownership */
      }
    }
    if (this.unresolved.size === 0) this.retention?.release();
    return this.unresolved.size > 0;
  }
}
interface ReaderRegistry {
  owners: WeakMap<object, Map<string, OwnedReaders>>;
  pinned: Set<object>;
}
// Same process/realm, same source module owner, same host SessionManager object.
// No cwd/config/session-id keys: unrelated SDK sessions must never share a barrier.
// Only ownership receipts live here, not lifecycle flights, packets or authority facts.
const registryKey = Symbol.for("@tryinget/pi-society-startup-context/owned-readers/v1");
const sourceOwner = new URL(import.meta.url);
sourceOwner.search = "";
sourceOwner.hash = "";
const moduleOwner = sourceOwner.href;
export function reloadStableReaders(owner: object): OwnedReaders {
  const globals = globalThis as typeof globalThis & { [key: symbol]: ReaderRegistry | undefined };
  const registry = globals[registryKey] || { owners: new WeakMap(), pinned: new Set() };
  globals[registryKey] = registry;
  let modules = registry.owners.get(owner);
  if (!modules) {
    modules = new Map();
    registry.owners.set(owner, modules);
  }
  let readers = modules.get(moduleOwner);
  if (!readers) {
    // Pin the owner as well as its receipts while unresolved; even owner GC is not settlement.
    const record: { owner: object; readers?: OwnedReaders } = { owner };
    readers = new OwnedReaders({
      retain: () => registry.pinned.add(record),
      release: () => registry.pinned.delete(record),
    });
    record.readers = readers;
    modules.set(moduleOwner, readers);
  }
  return readers;
}
export type CommandResult = {
  ok: boolean;
  stdout: string;
  stderr: string;
  error?: string;
  reason?: FailureReason;
  cause?: FailureReason;
  timedOut?: boolean;
  code?: number | null;
  elapsedMs: number;
  cleanup: "settled" | "not_started" | "failed";
  unresolvedResource?: OwnedResource;
};
export interface ProcMember {
  pid: number;
  group: number;
  session: number;
  start: string;
  state: string;
  uid: number;
}
export function readProcMember(pid: number): ProcMember | undefined {
  try {
    const stat = readFileSync(`/proc/${pid}/stat`, "utf8");
    const fields = stat.slice(stat.lastIndexOf(")") + 2).split(" ");
    return {
      pid,
      state: fields[0],
      group: Number(fields[2]),
      session: Number(fields[3]),
      start: fields[19],
      uid: statSync(`/proc/${pid}`).uid,
    };
  } catch (error) {
    if (["ENOENT", "ESRCH"].includes((error as NodeJS.ErrnoException).code || "")) return undefined;
    throw error;
  }
}
export function scanOwnedGroup(
  group: number,
  leaderStart?: string,
  includeZombies = false,
): ProcMember[] {
  const guardLeader = () => {
    const leader = readProcMember(group);
    if (leader && leaderStart && leader.start !== leaderStart)
      throw new Error("owned group leader PID reused");
  };
  guardLeader();
  const members: ProcMember[] = [];
  for (const entry of readdirSync("/proc")) {
    if (!/^\d+$/.test(entry)) continue;
    const member = readProcMember(Number(entry));
    if (!member || member.group !== group) continue;
    if (member.pid === group && leaderStart && member.start !== leaderStart)
      throw new Error("owned leader PID reused during scan");
    if (member.session !== group || member.uid !== process.getuid?.())
      throw new Error("group ownership not established");
    if (includeZombies || !["Z", "X"].includes(member.state)) members.push(member);
  }
  guardLeader();
  return members;
}
export function atomicGroupExists(group: number): boolean {
  try {
    process.kill(-group, 0);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ESRCH") return false;
    throw error;
  }
}
export function cancellationReason(signal?: AbortSignal): FailureReason {
  return signal?.reason === "refresh_timeout" ? "refresh_timeout" : "cancelled";
}
export interface CommandOptions {
  cwd?: string;
  timeoutMs?: number;
  env?: NodeJS.ProcessEnv;
  signal?: AbortSignal;
  resources?: OwnedReaders;
  scanGroup?: typeof scanOwnedGroup;
  probeGroup?: typeof atomicGroupExists;
  drainTimeoutMs?: number;
}
const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
const zombies = (members: ProcMember[]) =>
  members.length > 0 && members.every((member) => ["Z", "X"].includes(member.state));
const identities = (members: ProcMember[]) =>
  members
    .map((member) => `${member.pid}:${member.start}`)
    .sort()
    .join(",");

export async function runCommand(
  command: string,
  args: string[],
  options: CommandOptions = {},
): Promise<CommandResult> {
  const started = performance.now();
  const result = (fields: Partial<CommandResult>): CommandResult => ({
    ok: false,
    stdout: "",
    stderr: "",
    elapsedMs: performance.now() - started,
    cleanup: "not_started",
    ...fields,
  });
  if (options.signal?.aborted)
    return result({
      reason: cancellationReason(options.signal),
      error: `${cancellationReason(options.signal)} (${String(options.signal.reason)})`,
    });
  if ((options.timeoutMs ?? 45_000) <= 0)
    return result({ reason: "timeout", timedOut: true, error: "timeout before launch" });
  let child: ChildProcessByStdio<null, Readable, Readable>;
  try {
    child = spawn(command, args, {
      cwd: options.cwd,
      env: options.env,
      detached: process.platform !== "win32",
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch (error) {
    return result({ reason: "launch_failure", error: String(error) });
  }
  let stdout = "";
  let stderr = "";
  const outDecoder = new StringDecoder("utf8");
  const errDecoder = new StringDecoder("utf8");
  let finishLaunch: () => void = () => {};
  const launchOutcome = new Promise<void>((resolve) => {
    finishLaunch = resolve;
  });
  let bytes = 0;
  let code: number | null = null;
  let directSettled = false;
  let launched = false;
  let leaderStart: string | undefined;
  let failure: FailureReason | undefined;
  let errorText: string | undefined;
  let stopping: Promise<boolean> | undefined;
  let interruptDrain: (() => void) | undefined;
  let wake: () => void = () => {};
  const outcome = new Promise<void>((resolve) => {
    wake = resolve;
  });
  const group = child.pid;
  // Cache absence ONLY after an atomic kernel group-existence check, never an empty proc census.
  let retired = false;
  let killDelivered = false;
  const groupExists = (): boolean => {
    if (retired || !group || !launched) return false;
    if (process.platform === "win32") return !directSettled;
    const leader = process.platform === "linux" ? readProcMember(group) : undefined;
    if (leader && leaderStart && leader.start !== leaderStart)
      throw new Error("owned group PID reused");
    const exists = (options.probeGroup || atomicGroupExists)(group);
    if (!exists) retired = true;
    return exists;
  };
  const census = () => {
    if (!group) throw new Error("owned group unavailable");
    return (options.scanGroup || scanOwnedGroup)(group, leaderStart, true);
  };
  const groupSettled = (): boolean => {
    if (!groupExists()) return true;
    if (process.platform !== "linux") return false;
    if (!leaderStart) throw new Error("owned leader identity unavailable");
    // Matching zombie subsets cannot establish census completeness before escalation.
    if (!killDelivered) return false;
    const first = census();
    if (!groupExists()) return true;
    // Only after ownership-guarded SIGKILL may stable zombie-only observations settle.
    // Empty non-atomic observations remain unknown even after escalation.
    if (!zombies(first)) return false;
    const second = census();
    return !groupExists() || (zombies(second) && identities(first) === identities(second));
  };
  const isSettled = () => directSettled && groupSettled();
  const signalOwned = (signal: NodeJS.Signals) => {
    if (!group || !groupExists()) return;
    if (process.platform === "linux") {
      if (!leaderStart) throw new Error("owned leader identity unavailable");
      census(); // Ownership/PID guards, but an empty census does NOT suppress the owned-group signal.
      if (!groupExists()) return;
    }
    try {
      if (process.platform === "win32") {
        if (child.kill(signal) && signal === "SIGKILL") killDelivered = true;
      } else {
        process.kill(-group, signal);
        if (signal === "SIGKILL") killDelivered = true;
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ESRCH") throw error;
    }
  };
  const stop = (): Promise<boolean> => {
    if (stopping) return stopping;
    stopping = (async () => {
      try {
        signalOwned("SIGTERM");
      } catch {
        /* no inferred settlement */
      }
      await sleep(250);
      try {
        signalOwned("SIGKILL");
      } catch {
        /* no ownership/permission assumption */
      }
      const deadline = performance.now() + 2_000;
      do {
        try {
          if (isSettled()) return true;
        } catch {
          /* retain if proof stays unavailable */
        }
        await sleep(20);
      } while (performance.now() < deadline);
      return false;
    })();
    return stopping;
  };
  const fail = (reason: FailureReason, error: string = reason) => {
    failure ??= reason;
    errorText ??= error;
    if (launched) void stop();
    interruptDrain?.();
    wake();
  };
  child.once("spawn", () => {
    launched = true;
    finishLaunch();
    try {
      if (process.platform === "linux" && group) leaderStart = readProcMember(group)?.start;
    } catch (error) {
      fail("cleanup_failure", String(error));
    }
    if (failure || options.signal?.aborted) fail(failure || cancellationReason(options.signal));
  });
  child.once("error", (error) => {
    finishLaunch();
    directSettled = true;
    fail("launch_failure", error.message);
  });
  child.once("exit", (exitCode, signal) => {
    directSettled = true;
    code = exitCode;
    if (exitCode !== 0) {
      failure ??= "nonzero_exit";
      errorText ??= `exited with code ${exitCode}${signal ? ` (${signal})` : ""}`;
    }
    wake();
  });
  const append = (data: Buffer, target: "stdout" | "stderr") => {
    bytes += data.length;
    if (bytes > 1024 * 1024) {
      fail("output_limit");
      return;
    }
    if (target === "stdout") stdout += outDecoder.write(data);
    else stderr += errDecoder.write(data);
  };
  child.stdout.on("data", (data: Buffer) => append(data, "stdout"));
  child.stderr.on("data", (data: Buffer) => append(data, "stderr"));
  const complete = (stream: Readable) =>
    new Promise<boolean>((resolve) => {
      stream.once("end", () => resolve(true));
      stream.once("close", () => resolve(stream.readableEnded));
      stream.once("error", () => {
        fail("output_incomplete");
        resolve(false);
      });
    });
  const streamsComplete = Promise.all([complete(child.stdout), complete(child.stderr)]);
  const abort = () =>
    fail(
      cancellationReason(options.signal),
      `${cancellationReason(options.signal)} (${String(options.signal?.reason)})`,
    );
  options.signal?.addEventListener("abort", abort, { once: true });
  if (options.signal?.aborted) abort();
  const timer = setTimeout(() => fail("timeout"), options.timeoutMs ?? 45_000);
  await outcome;
  await launchOutcome;
  let settled = !launched;
  if (launched) {
    try {
      settled = isSettled();
    } catch {
      settled = false;
    }
    if (failure || !settled) settled = await stop();
    if (settled && !failure) {
      let drainTimer: ReturnType<typeof setTimeout> | undefined;
      const ended = await Promise.race([
        streamsComplete.then((ends) => ends.every(Boolean)),
        new Promise<boolean>((resolve) => {
          interruptDrain = () => resolve(false);
        }),
        new Promise<boolean>((resolve) => {
          drainTimer = setTimeout(() => resolve(false), options.drainTimeoutMs ?? 2_000);
        }),
      ]);
      clearTimeout(drainTimer);
      interruptDrain = undefined;
      if (!ended) {
        failure ??= "output_incomplete";
        errorText ??= "output streams did not complete within drain budget";
      }
    }
  }
  clearTimeout(timer);
  options.signal?.removeEventListener("abort", abort);
  child.stdout.destroy();
  child.stderr.destroy();
  stdout += outDecoder.end();
  stderr += errDecoder.end();
  if (!settled) {
    const resource = { description: `reader ${group}: ${command}`, isSettled };
    options.resources?.retain(resource);
    child.unref(); // Does not terminate/release ownership; the explicit blocked-cleanup receipt retains it.
    return result({
      stdout,
      stderr,
      code,
      reason: "cleanup_failure",
      cause: failure,
      error: "cleanup_failure: direct child and owned group not proven settled",
      cleanup: "failed",
      unresolvedResource: resource,
    });
  }
  return result({
    ok: !failure,
    stdout,
    stderr,
    code,
    reason: failure,
    error: errorText,
    timedOut: failure === "timeout",
    cleanup: launched ? "settled" : "not_started",
  });
}
