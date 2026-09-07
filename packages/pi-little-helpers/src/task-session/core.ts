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
    operations: ["plan", "launch", "inspect", "watch", "classify"],
    admissionAvailable: false,
    blockers: [
      "ak_producer_blocked_draft_not_integration_ready",
      "installed_profile_and_custody_unverified",
    ],
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
export async function launchTaskSession(input: unknown): Promise<never> {
  planTaskSession(input);
  // Deliberately no reservation/spawn until the owner implements and freezes the startup request.
  // An early shape fixture is not permission to select ordinary show/claim/show or an invented supervisor.
  return refuse("ak_producer_blocked_draft_not_integration_ready");
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
