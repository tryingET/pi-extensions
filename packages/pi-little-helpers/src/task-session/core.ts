import { readObservation, requestStop } from "./bridge.js";
import { classifySnapshot, producer } from "./classify.js";
import { digest, id, integer, record, refuse, text } from "./json.js";
import {
  describeInstalledProducer,
  readInstalledBaseline,
  requireInstalledProducer,
} from "./producer.js";
import { requireTaskSessionProducer } from "./producer-adapter.js";
import { preflightProfile } from "./profile.js";
import {
  accountLocator,
  assertSnapshotDomains,
  canonicalPath,
  conflicts,
  occupied,
  readSnapshot,
} from "./state.js";

export { classifyTaskSessionRequest } from "./classify.js";
export { taskSessionProfiles } from "./profiles.js";
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
const reason = (error: unknown) =>
  error instanceof Error && /^[a-z_]+$/.test(error.message)
    ? error.message
    : "producer_configuration_unavailable";
export async function taskSessionCapability() {
  let available = false,
    blockers: string[] = [],
    configuration: unknown = null;
  try {
    const locator = accountLocator(),
      snapshot = readSnapshot(locator);
    assertSnapshotDomains(snapshot);
    if (snapshot.withdrawn || !snapshot.inventoryComplete) refuse("namespace_not_admitting");
    const state = await describeInstalledProducer(locator);
    configuration = state.descriptor;
    requireTaskSessionProducer(state.descriptor, state.bindings);
    available = true;
  } catch (error) {
    blockers = [reason(error)];
  }
  return {
    schema: "pi.task-session.capability.v1",
    producer,
    operations: [
      "identity",
      "profiles",
      "plan",
      "launch",
      "inspect",
      "watch",
      "stop",
      "classify",
      "classify-installed",
    ],
    admissionAvailable: available,
    blockers,
    configuration,
    authority: false,
    profile:
      "native Codex SSE; zero retries; no OAuth refresh; literal resources; no secondary input",
    recovery:
      "Host closure, effect disposition and owner-native AK claim resolution are independent. No automatic retirement.",
  };
}
async function admissionContext(request: TaskSessionRequest) {
  const locator = accountLocator(),
    snapshot = readSnapshot(locator);
  assertSnapshotDomains(snapshot);
  if (snapshot.withdrawn || !snapshot.inventoryComplete) refuse("namespace_not_admitting");
  const domain = snapshot.domains.find(
    (d) =>
      d.akInstance === request.akInstance &&
      d.taskId === request.taskId &&
      d.checkout === request.cwd,
  );
  if (!domain) refuse("canonical_domain_missing");
  if (!snapshot.enrolled.some((d) => digest(d) === digest(domain))) refuse("not_enrolled");
  if (snapshot.attempts.some((a) => occupied(a) && conflicts(a.domain, domain)))
    refuse("domain_occupied");
  const pin = await preflightProfile(locator, request.profile);
  for (const key of ["provider", "model", "account", "reasoning"] as const)
    if (pin[key] !== request[key]) refuse("requested_profile_mismatch");
  const state = await requireInstalledProducer(locator, pin);
  return { locator, pin, state, snapshot };
}
export async function planTaskSession(input: unknown) {
  const request = taskSessionRequest(input);
  try {
    const { locator, pin, state, snapshot } = await admissionContext(request);
    const baseline = await readInstalledBaseline(
      state,
      request.taskId,
      pin.producer.databaseIdentity,
      request.cwd,
    );
    const { captureResources } = await import("./resources.js");
    captureResources(request.cwd, pin.agentDir, request.context);
    const current = readSnapshot(locator);
    assertSnapshotDomains(current);
    if (digest(current) !== digest(snapshot)) refuse("namespace_changed_during_plan");
    const checked = await preflightProfile(locator, request.profile);
    if (digest(checked) !== digest(pin)) refuse("profile_preflight_changed");
    state.assertStable();
    return {
      schema: "pi.task-session.plan.v1",
      requestDigest: digest(request),
      requestId: request.requestId,
      classification: classifySnapshot(
        {
          schema: "pi.task-session.classify-request.v1",
          requestId: request.requestId,
          akInstance: request.akInstance,
          taskIds: [request.taskId],
          cwd: request.cwd,
        },
        snapshot,
      ),
      launchable: true,
      authority: false,
      admission: "requires_native_T0_T1_T2_CLOSED",
      owner: state.bindings,
      baseline,
    };
  } catch (error) {
    return {
      schema: "pi.task-session.plan.v1",
      requestDigest: digest(request),
      requestId: request.requestId,
      launchable: false,
      authority: false,
      blockers: [reason(error)],
    };
  }
}
export async function launchTaskSession(input: unknown): Promise<unknown> {
  const request = taskSessionRequest(input);
  const existing = readSnapshot(accountLocator()).attempts.find(
    (a) => a.requestId === request.requestId,
  );
  if (existing) {
    if (existing.semanticDigest !== digest(request)) refuse("request_digest_conflict");
    return { schema: "pi.task-session.launch.v1", status: "existing", attempt: existing };
  }
  const { locator, pin, state } = await admissionContext(request);
  const { launchReserved, productionViewer, invokeSupervisor } = await import("./launch.js");
  const { encodeTaskSessionStartup } = await import("./producer-adapter.js");
  return launchReserved(request, locator, {
    plan: () =>
      readInstalledBaseline(state, request.taskId, pin.producer.databaseIdentity, request.cwd),
    beforeReserve: () => state.assertStable(),
    openViewer: async (attempt, cwd) => {
      state.assertStable();
      return productionViewer(attempt, cwd);
    },
    supervise: async (input) => {
      state.assertStable();
      await invokeSupervisor(
        state.bindings.gate_path,
        state.bindings.gate_sha256,
        encodeTaskSessionStartup(input),
        true,
      );
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
