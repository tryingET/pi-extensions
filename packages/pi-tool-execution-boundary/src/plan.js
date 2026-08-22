import { domainSeparatedDigest } from "./canonical-cbor.js";
import { BoundaryError } from "./errors.js";
import { normalizePolicy, policyDigest } from "./policy.js";
import { deepFreeze } from "./util.js";

export const SEMANTIC_PLAN_SCHEMA = "pi-tool-boundary-semantic-plan/v1";

const TOOL_EXECUTION = deepFreeze({
  read: { operation: "read", execution: "structured-agent-rpc", lock: "shared", durability: "D0" },
  write: { operation: "write", execution: "structured-agent-rpc", lock: "exclusive", durability: "D1" },
  edit: { operation: "edit", execution: "structured-agent-rpc", lock: "exclusive", durability: "D1" },
  ls: { operation: "list", execution: "structured-agent-rpc", lock: "shared", durability: "D0" },
  grep: { operation: "grep", execution: "fresh-read-only-cell", lock: "shared", durability: "D0" },
  find: { operation: "find", execution: "fresh-read-only-cell", lock: "shared", durability: "D0" },
  bash: { operation: "exec", execution: "fresh-read-write-cell", lock: "exclusive", durability: "D1" },
});

const REQUIRED_CAPABILITY_KEYS = Object.freeze([
  "microvm",
  "noHostFallback",
  "guestNetworkAbsent",
  "hostFilesystemAbsent",
  "immutableRoot",
  "boundedWritableBlock",
  "bootChallenge",
  "attestationBinding",
  "freshPidNamespace",
  "freshMountNamespace",
  "freshIpcNamespace",
  "freshNetworkNamespace",
  "atomicCgroupPlacement",
  "pidfdLifecycle",
  "recursiveCgroupKill",
  "descendantEmptyProof",
  "controllerChannelIsolated",
  "hostSocketReachabilityAbsent",
  "systemdUserUnit",
  "resourceReadback",
]);

export function planSemanticBody(planInput) {
  const plan = planInput.schema === SEMANTIC_PLAN_SCHEMA ? planInput : compileSemanticPlan(planInput);
  return {
    1: plan.schema,
    2: plan.profile,
    3: plan.effectivePolicyDigest,
    4: plan.tools.map((tool) => [
      tool.name,
      tool.operation,
      tool.execution,
      tool.lock,
      tool.durability,
    ]),
    5: {
      1: plan.resources.vcpus,
      2: plan.resources.memoryBytes,
      3: plan.resources.workspaceVirtualBytes,
      4: plan.resources.cellPids,
      5: plan.resources.callTimeoutMs,
      6: plan.resources.outputBytes,
      7: plan.resources.tmpBytes,
      8: plan.resources.shmBytes,
    },
    6: plan.requiredCapabilities,
    7: {
      1: plan.source.mode,
      2: plan.source.cleanGitRequired,
      3: plan.source.hostMountAllowed,
      4: plan.source.historyImported,
    },
    8: {
      1: plan.network.guestInterface,
      2: plan.network.rawSockets,
      3: plan.network.secretBrokerage,
    },
    9: {
      1: plan.persistence.workspace,
      2: plan.persistence.callTemp,
      3: plan.persistence.crossLeaseWritableCache,
    },
  };
}

export function compileSemanticPlan(policyInput) {
  const policy = normalizePolicy(policyInput);
  const tools = policy.tools.allowed.map((name) => ({ name, ...TOOL_EXECUTION[name] }));
  const plan = {
    schema: SEMANTIC_PLAN_SCHEMA,
    profile: "microvm-offline",
    effectivePolicyDigest: policyDigest(policy),
    tools,
    resources: { ...policy.resources },
    source: {
      mode: policy.source.mode,
      cleanGitRequired: true,
      hostMountAllowed: false,
      historyImported: false,
      maxFiles: policy.source.maxFiles,
      maxAggregateBytes: policy.source.maxAggregateBytes,
      maxBlobBytes: policy.source.maxBlobBytes,
      allowRelativeSymlinks: policy.source.allowRelativeSymlinks,
    },
    network: {
      guestInterface: "absent",
      rawSockets: "absent",
      secretBrokerage: "absent",
    },
    persistence: {
      workspace: "lease",
      callTemp: "call",
      crossLeaseWritableCache: false,
    },
    hostDefense: { ...policy.hostDefense },
    admission: { ...policy.admission },
    retention: { ...policy.retention },
    requiredCapabilities: [...REQUIRED_CAPABILITY_KEYS],
  };
  plan.semanticPlanDigest = domainSeparatedDigest(
    "pi-tool-boundary/semantic-plan/v1",
    planSemanticBody({ ...plan, semanticPlanDigest: undefined }),
  );
  return deepFreeze(plan);
}

export function evaluateBackendCapabilities(planInput, capabilityInput) {
  const plan = planInput.schema === SEMANTIC_PLAN_SCHEMA ? planInput : compileSemanticPlan(planInput);
  if (!capabilityInput || typeof capabilityInput !== "object") {
    throw new BoundaryError("INVALID_BACKEND_CAPABILITIES", "Backend capabilities must be an object");
  }
  const missing = [];
  const present = [];
  for (const capability of plan.requiredCapabilities) {
    if (capabilityInput[capability] === true) present.push(capability);
    else missing.push(capability);
  }
  return deepFreeze({
    schema: "pi-tool-boundary-backend-capability-proof/v1",
    semanticPlanDigest: plan.semanticPlanDigest,
    backendId: String(capabilityInput.backendId ?? "unknown"),
    backendVersion: String(capabilityInput.backendVersion ?? "unknown"),
    conforming: missing.length === 0,
    present: present.sort(),
    missing: missing.sort(),
  });
}

export function requireConformingBackend(plan, capabilities) {
  const proof = evaluateBackendCapabilities(plan, capabilities);
  if (!proof.conforming) {
    throw new BoundaryError(
      "BACKEND_CAPABILITY_GAP",
      `Backend is missing ${proof.missing.length} required capabilities`,
      { proof },
    );
  }
  return proof;
}
