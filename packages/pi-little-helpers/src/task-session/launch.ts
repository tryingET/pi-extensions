import { execFile, spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdirSync, readFileSync } from "node:fs";
import { userInfo } from "node:os";
import { join } from "node:path";
import { writeObservation } from "./bridge.js";
import type { TaskSessionRequest } from "./core.js";
import { bytesDigest, digest, parseJson, record, refuse, text } from "./json.js";
import { resolutionIdentity } from "./model-source.js";
import { interpretTaskSessionPlan } from "./producer-adapter.js";
import { preflightProfile } from "./profile.js";
import { launchRestrictedTaskSessionWindow } from "./restricted-transport.js";
import {
  type Attempt,
  assertSnapshotDomains,
  durableWrite,
  type Locator,
  privatePath,
  readSnapshot,
  reserve,
} from "./state.js";
import { assertViewerReady } from "./viewer.js";

export interface NativeBaseline {
  protocol: string;
  evaluated_at: string;
  baseline_digest: string;
  baseline: { task: { id: number; repo: string }; [key: string]: unknown };
}
export function validateBaseline(value: unknown, request: TaskSessionRequest): NativeBaseline {
  const b = record(interpretTaskSessionPlan(value), [
    "protocol",
    "evaluated_at",
    "baseline_digest",
    "baseline",
  ]);
  if (
    b.protocol !== "ak.task-session.baseline.v1" ||
    digest(b.baseline) !== b.baseline_digest ||
    b.baseline?.task?.id !== request.taskId ||
    typeof b.baseline?.task?.repo !== "string"
  )
    refuse("native_baseline_invalid");
  text(b.baseline.task.repo, 4096);
  text(b.evaluated_at, 64);
  return b as NativeBaseline;
}
export interface LaunchPorts {
  beforeReserve?(): void;
  plan(request: TaskSessionRequest): Promise<unknown>;
  openViewer(attempt: string, cwd: string): Promise<{ ok: boolean }>;
  supervise(input: {
    request: TaskSessionRequest;
    attempt: Attempt;
    intentDigest: string;
    repo: string;
    reservationDigest: string;
    baselineDigest: string;
    leaseSeconds: number;
    startupDeadline: number;
  }): Promise<void>;
}
/** Actual durable production composition, with effects behind narrow internal testable ports. */
export async function launchReserved(
  request: TaskSessionRequest,
  locator: Locator,
  ports: LaunchPorts,
) {
  const snapshot = readSnapshot(locator);
  assertSnapshotDomains(snapshot);
  const existing = snapshot.attempts.find((a) => a.requestId === request.requestId);
  if (existing) {
    if (existing.semanticDigest !== digest(request)) refuse("request_digest_conflict");
    return { schema: "pi.task-session.launch.v1", status: "existing", attempt: existing };
  }
  const pin = await preflightProfile(locator, request.profile);
  for (const k of ["provider", "model", "account", "reasoning"] as const)
    if (pin[k] !== request[k]) refuse("requested_profile_mismatch");
  const baseline = validateBaseline(await ports.plan(request), request);
  const { captureResources } = await import("./resources.js");
  const resources = captureResources(request.cwd, pin.agentDir, request.context);
  const domain = snapshot.domains.find(
    (d) =>
      d.akInstance === request.akInstance &&
      d.taskId === request.taskId &&
      d.checkout === request.cwd,
  );
  if (!domain) refuse("canonical_domain_missing");
  const parent = join(locator.root, "attempts");
  privatePath(parent, true);
  const checked = await preflightProfile(locator, request.profile); // Recheck after the asynchronous native baseline.
  if (digest(checked.resolution) !== digest(pin.resolution)) refuse("model_resolution_drift");
  ports.beforeReserve?.();
  const attempt = reserve(locator, request.requestId, digest(request), domain);
  const dir = join(parent, attempt.attempt, attempt.incarnation);
  // Exclusive directory creation is launch-effect ownership; never retry a partially started incarnation.
  try {
    mkdirSync(join(parent, attempt.attempt), { mode: 0o700 });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EEXIST")
      return { schema: "pi.task-session.launch.v1", status: "existing", attempt };
    throw error;
  }
  mkdirSync(dir, { mode: 0o700 });
  const nonce = randomBytes(32).toString("hex");
  const intent = {
    schema: "pi.task-session.intent.v2",
    request,
    attempt: attempt.attempt,
    incarnation: attempt.incarnation,
    resources,
    modelResolution: pin.resolution,
    viewNonce: nonce,
  };
  durableWrite(join(dir, "intent.json"), intent, true);
  durableWrite(join(dir, "baseline.json"), baseline, true);
  durableWrite(
    join(dir, "view.json"),
    {
      schema: "pi.task-session.view.v1",
      attempt: attempt.attempt,
      incarnation: attempt.incarnation,
      nonce,
    },
    true,
  );
  writeObservation(dir, attempt, 0, {
    identity: {
      attempt: attempt.attempt,
      cwd: request.cwd,
      ...resolutionIdentity(pin.resolution),
      reasoning: request.reasoning,
    },
    phase: "RESERVED",
    denial: null,
    events: [],
  });
  try {
    const transport = await ports.openViewer(attempt.attempt, request.cwd);
    durableWrite(
      join(dir, "transport.json"),
      { schema: "pi.task-session.transport.v1", ok: transport.ok },
      true,
    );
    if (!transport.ok) refuse("transport_effect_indeterminate");
    const deadline = Date.now() + 15000;
    for (;;) {
      try {
        assertViewerReady(dir, attempt, nonce);
        break;
      } catch {
        if (Date.now() >= deadline) refuse("viewer_startup_timeout");
        await new Promise((r) => setTimeout(r, 50));
      }
    }
    await ports.supervise({
      request,
      attempt,
      intentDigest: digest(intent),
      repo: baseline.baseline.task.repo,
      reservationDigest: digest(attempt),
      baselineDigest: baseline.baseline_digest,
      leaseSeconds: pin.runSeconds,
      startupDeadline: Date.now() + 120000,
    });
    return { schema: "pi.task-session.launch.v1", status: "supervisor_started", attempt };
  } catch (error) {
    writeObservation(dir, attempt, 1, {
      identity: {
        attempt: attempt.attempt,
        cwd: request.cwd,
        ...resolutionIdentity(pin.resolution),
      },
      phase: "UNRESOLVED",
      denial: "launch_failed_custody_retained",
      events: [],
    });
    throw error;
  }
}
export function productionViewer(attempt: string, cwd: string) {
  return launchRestrictedTaskSessionWindow(
    attempt,
    cwd,
    (command, args, options) =>
      new Promise((resolve) => {
        execFile(
          command,
          args,
          {
            cwd: options.cwd,
            timeout: options.timeout,
            maxBuffer: 65536,
            env: {
              PATH: "/usr/bin:/bin",
              HOME: userInfo().homedir,
              DISPLAY: process.env.DISPLAY,
              WAYLAND_DISPLAY: process.env.WAYLAND_DISPLAY,
              XDG_RUNTIME_DIR: process.env.XDG_RUNTIME_DIR,
              DBUS_SESSION_BUS_ADDRESS: process.env.DBUS_SESSION_BUS_ADDRESS,
            },
          },
          (error) => resolve({ code: error ? 1 : 0, killed: !!error }),
        );
      }),
  );
}

/** Producer payload comes only from the actual owner adapter, never arbitrary public JSON. */
export async function invokeSupervisor(
  executable: string,
  expectedDigest: string,
  payload: unknown,
  fixedGate = false,
): Promise<void> {
  if (bytesDigest(readFileSync(executable)) !== expectedDigest) refuse("ak_binary_changed");
  const bytes = JSON.stringify(payload);
  if (Buffer.byteLength(bytes) > 65536) refuse("startup_request_too_large");
  await new Promise<void>((resolve, reject) => {
    const child = spawn(executable, [...(fixedGate ? ["--"] : []), "task-session", "supervise"], {
      detached: true,
      stdio: ["pipe", "ignore", "ignore"],
      env: { PATH: "/usr/bin:/bin", HOME: userInfo().homedir, LANG: "C.UTF-8" },
    });
    child.once("error", () => reject(new Error("supervisor_spawn_failed")));
    child.stdin.on("error", () => reject(new Error("supervisor_input_failed")));
    child.once("spawn", () => {
      child.stdin.end(bytes, () => {
        child.unref();
        resolve();
      });
    });
  });
}

export async function readNativeBaseline(
  executable: string,
  expectedDigest: string,
  request: TaskSessionRequest,
): Promise<unknown> {
  if (bytesDigest(readFileSync(executable)) !== expectedDigest) refuse("ak_entrypoint_changed");
  return new Promise((resolve, reject) => {
    const child = execFile(
      executable,
      ["task-session", "plan"],
      {
        cwd: request.cwd,
        timeout: 15000,
        maxBuffer: 1048576,
        env: { PATH: "/usr/bin:/bin", HOME: userInfo().homedir, LANG: "C.UTF-8" },
      },
      (error, stdout) => {
        if (error) return reject(new Error("native_plan_unavailable"));
        try {
          resolve(validateBaseline(parseJson(stdout), request));
        } catch {
          reject(new Error("native_baseline_invalid"));
        }
      },
    );
    child.stdin?.end(JSON.stringify({ task_id: request.taskId }));
  });
}
