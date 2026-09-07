import { readObservation, requestStop } from "./bridge.js";
import { classifyTaskSessionRequest, producer } from "./classify.js";
import { digest, id, integer, record, refuse, text } from "./json.js";
import { accountLocator, canonicalPath, readSnapshot } from "./state.js";

export { classifyTaskSessionRequest } from "./classify.js";
export interface TaskSessionRequest {
  schema: "pi.task-session.request.v1";
  requestId: string;
  akInstance: string;
  taskId: number;
  cwd: string;
  provider: string;
  model: string;
  reasoning: string;
  account: string;
  profile: string;
  objective: string;
  context: string[];
  placement: "window";
}
export function taskSessionRequest(input: unknown): TaskSessionRequest {
  const r = record(input, [
    "schema",
    "requestId",
    "akInstance",
    "taskId",
    "cwd",
    "provider",
    "model",
    "reasoning",
    "account",
    "profile",
    "objective",
    "context",
    "placement",
  ]);
  if (r.schema !== "pi.task-session.request.v1") refuse("request_version_unsupported");
  id(r.requestId);
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(r.requestId)) refuse("protocol_request_id_invalid");
  id(r.akInstance);
  integer(r.taskId);
  canonicalPath(r.cwd);
  for (const k of ["provider", "model", "account", "profile"]) text(r[k], 128);
  if (
    r.provider !== "openai-codex" ||
    r.placement !== "window" ||
    !["off", "minimal", "low", "medium", "high", "xhigh", "max"].includes(r.reasoning)
  )
    refuse("unsupported_profile");
  text(r.objective);
  if (!Array.isArray(r.context) || r.context.length > 64) refuse("invalid_context");
  r.context.forEach(canonicalPath);
  if (new Set(r.context).size !== r.context.length) refuse("duplicate_context");
  return structuredClone(r) as TaskSessionRequest;
}
export function taskSessionCapability() {
  return {
    schema: "pi.task-session.capability.v1",
    producer,
    operations: [
      "identity",
      "plan",
      "launch",
      "inspect",
      "watch",
      "stop",
      "classify",
      "classify-installed",
    ],
    admissionAvailable: false,
    blockers: ["ak_producer_verification_pending", "installed_profile_and_custody_unverified"],
    profile:
      "native Codex SSE; zero retries; no OAuth refresh; literal resources; no secondary input",
    recovery:
      "Host closure, effect disposition and owner-native AK claim resolution are independent. No automatic retirement.",
  };
}
export function planTaskSession(input: unknown) {
  const r = taskSessionRequest(input);
  const classification = classifyTaskSessionRequest({
    schema: "pi.task-session.classify-request.v1",
    requestId: r.requestId,
    akInstance: r.akInstance,
    taskIds: [r.taskId],
    cwd: r.cwd,
  });
  return {
    schema: "pi.task-session.plan.v1",
    requestDigest: digest(r),
    requestId: r.requestId,
    classification,
    capability: taskSessionCapability(),
    launchable: false,
  };
}
export async function launchTaskSession(input: unknown): Promise<unknown> {
  const request = taskSessionRequest(input);
  const adapter = await import("./producer-adapter.js");
  adapter.requireTaskSessionProducer();
  const { launchReserved, productionViewer, invokeSupervisor, readNativeBaseline } = await import(
    "./launch.js"
  );
  const { loadProfile } = await import("./profile.js");
  const locator = accountLocator(),
    pin = loadProfile(locator, request.profile);
  return launchReserved(request, locator, {
    plan: (request) =>
      readNativeBaseline(pin.producer.executable, pin.producer.entrypointDigest, request),
    openViewer: productionViewer,
    supervise: async (input) => {
      const payload = adapter.encodeTaskSessionStartup(input);
      await invokeSupervisor(pin.producer.executable, pin.producer.entrypointDigest, payload);
    },
  });
}
export function inspectTaskSession(requestId?: string) {
  if (requestId !== undefined) id(requestId);
  const s = readSnapshot(accountLocator());
  return {
    schema: "pi.task-session.inspection.v1",
    namespace: s.namespace,
    generation: s.generation,
    withdrawn: s.withdrawn,
    attempts: s.attempts.filter((a) => requestId === undefined || a.requestId === requestId),
    observations: s.attempts
      .filter((a) => requestId === undefined || a.requestId === requestId)
      .map((a) => {
        try {
          return { attempt: a.attempt, observation: readObservation(accountLocator(), a.attempt) };
        } catch {
          return { attempt: a.attempt, observation: null };
        }
      }),
    snapshotDigest: digest(s),
  };
}
export async function* watchTaskSession(requestId: string, signal: AbortSignal) {
  id(requestId);
  let previous = "";
  while (!signal.aborted) {
    const observation = inspectTaskSession(requestId);
    const hash = digest(observation);
    if (hash !== previous) {
      previous = hash;
      yield observation;
    }
    await new Promise<void>((resolve) => {
      const done = () => {
        clearTimeout(timer);
        signal.removeEventListener("abort", done);
        resolve();
      };
      const timer = setTimeout(done, 250);
      signal.addEventListener("abort", done, { once: true });
    });
  }
}

export {
  classifyInstalledTaskSessionRequest,
  taskSessionInstalledIdentity,
} from "./installed-identity.js";

export function stopTaskSession(requestId: string) {
  id(requestId);
  const locator = accountLocator(),
    attempt = readSnapshot(locator).attempts.find((a) => a.requestId === requestId);
  if (!attempt) refuse("request_unknown");
  requestStop(locator, attempt.attempt);
  return {
    schema: "pi.task-session.stop-requested.v1",
    requestId,
    attempt: attempt.attempt,
    incarnation: attempt.incarnation,
    claimReleased: false,
    effectsRetired: false,
  };
}
