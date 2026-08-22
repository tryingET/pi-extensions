import { domainSeparatedDigest } from "./canonical-cbor.js";
import { BoundaryError } from "./errors.js";
import {
  assertBoolean,
  assertEnum,
  assertInteger,
  assertPlainObject,
  deepFreeze,
  rejectUnknownFields,
  stableUtf8Compare,
} from "./util.js";

export const POLICY_SCHEMA = "pi-tool-boundary-policy/v1";
export const POLICY_PROFILE = "microvm-offline";
export const SOURCE_MODE = "committed-clean-tree/v1";
export const TOOL_NAMES = Object.freeze(["bash", "edit", "find", "grep", "ls", "read", "write"]);

const TOP_LEVEL_FIELDS = Object.freeze([
  "schema",
  "profile",
  "source",
  "resources",
  "tools",
  "admission",
  "retention",
  "hostDefense",
]);

const FIELD_NAMES = Object.freeze({
  source: Object.freeze([
    "mode",
    "requireCleanGit",
    "maxFiles",
    "maxAggregateBytes",
    "maxBlobBytes",
    "maxPathBytes",
    "maxPathSegments",
    "allowRelativeSymlinks",
  ]),
  resources: Object.freeze([
    "vcpus",
    "memoryBytes",
    "workspaceVirtualBytes",
    "cellPids",
    "callTimeoutMs",
    "outputBytes",
    "tmpBytes",
    "shmBytes",
  ]),
  tools: Object.freeze(["allowed", "userBash"]),
  admission: Object.freeze([
    "maxActiveReadWriteLeases",
    "maxStartingLeases",
    "maxAcquireQueue",
    "minimumHostFreeBytes",
    "cpuPsiSomeAvg10Max",
    "memoryPsiSomeAvg10Max",
    "ioPsiSomeAvg10Max",
    "voiceActiveBatchAdmission",
  ]),
  retention: Object.freeze([
    "retainSuccessfulWorkspace",
    "retainFailedWorkspace",
    "quarantineDays",
    "globalRetainedBytes",
    "d0AuditQueueEvents",
  ]),
  hostDefense: Object.freeze(["requireSystemdHardening", "landlock"]),
});

export const DEFAULT_POLICY = deepFreeze({
  schema: POLICY_SCHEMA,
  profile: POLICY_PROFILE,
  source: {
    mode: SOURCE_MODE,
    requireCleanGit: true,
    maxFiles: 200_000,
    maxAggregateBytes: 2_147_483_648,
    maxBlobBytes: 268_435_456,
    maxPathBytes: 4_096,
    maxPathSegments: 128,
    allowRelativeSymlinks: false,
  },
  resources: {
    vcpus: 8,
    memoryBytes: 12_884_901_888,
    workspaceVirtualBytes: 12_884_901_888,
    cellPids: 512,
    callTimeoutMs: 900_000,
    outputBytes: 33_554_432,
    tmpBytes: 1_073_741_824,
    shmBytes: 268_435_456,
  },
  tools: {
    allowed: [...TOOL_NAMES],
    userBash: true,
  },
  admission: {
    maxActiveReadWriteLeases: 1,
    maxStartingLeases: 1,
    maxAcquireQueue: 4,
    minimumHostFreeBytes: 25_769_803_776,
    cpuPsiSomeAvg10Max: 10,
    memoryPsiSomeAvg10Max: 2,
    ioPsiSomeAvg10Max: 5,
    voiceActiveBatchAdmission: "deny",
  },
  retention: {
    retainSuccessfulWorkspace: false,
    retainFailedWorkspace: true,
    quarantineDays: 7,
    globalRetainedBytes: 34_359_738_368,
    d0AuditQueueEvents: 10_000,
  },
  hostDefense: {
    requireSystemdHardening: true,
    landlock: "preferred",
  },
});

function mergeSection(source, section) {
  const supplied = source[section] ?? {};
  assertPlainObject(supplied, section);
  rejectUnknownFields(supplied, FIELD_NAMES[section], section);
  return { ...DEFAULT_POLICY[section], ...supplied };
}

function normalizeAllowedTools(value) {
  if (!Array.isArray(value) || value.length < 1 || value.length > TOOL_NAMES.length) {
    throw new BoundaryError(
      "INVALID_TOOL_SET",
      `tools.allowed must contain 1..${TOOL_NAMES.length} unique tools`,
    );
  }
  const unique = new Set();
  for (const tool of value) {
    assertEnum(tool, "tools.allowed[]", TOOL_NAMES);
    if (unique.has(tool)) {
      throw new BoundaryError("DUPLICATE_TOOL", `tools.allowed contains duplicate: ${tool}`);
    }
    unique.add(tool);
  }
  return [...unique].sort(stableUtf8Compare);
}

export function normalizePolicy(source = {}) {
  assertPlainObject(source, "policy");
  rejectUnknownFields(source, TOP_LEVEL_FIELDS, "policy");

  const schema = source.schema ?? DEFAULT_POLICY.schema;
  const profile = source.profile ?? DEFAULT_POLICY.profile;
  if (schema !== POLICY_SCHEMA) {
    throw new BoundaryError("UNSUPPORTED_POLICY_SCHEMA", `Unsupported policy schema: ${schema}`);
  }
  if (profile !== POLICY_PROFILE) {
    throw new BoundaryError("UNSUPPORTED_POLICY_PROFILE", `Unsupported policy profile: ${profile}`);
  }

  const sourcePolicy = mergeSection(source, "source");
  const resources = mergeSection(source, "resources");
  const tools = mergeSection(source, "tools");
  const admission = mergeSection(source, "admission");
  const retention = mergeSection(source, "retention");
  const hostDefense = mergeSection(source, "hostDefense");

  if (sourcePolicy.mode !== SOURCE_MODE) {
    throw new BoundaryError("UNSUPPORTED_SOURCE_MODE", `Unsupported source mode: ${sourcePolicy.mode}`);
  }
  if (sourcePolicy.requireCleanGit !== true) {
    throw new BoundaryError("CLEAN_GIT_REQUIRED", "source.requireCleanGit must be true");
  }
  if (hostDefense.requireSystemdHardening !== true) {
    throw new BoundaryError(
      "SYSTEMD_HARDENING_REQUIRED",
      "hostDefense.requireSystemdHardening must be true",
    );
  }

  const normalized = {
    schema,
    profile,
    source: {
      mode: SOURCE_MODE,
      requireCleanGit: true,
      maxFiles: assertInteger(sourcePolicy.maxFiles, "source.maxFiles", 1, 1_000_000),
      maxAggregateBytes: assertInteger(
        sourcePolicy.maxAggregateBytes,
        "source.maxAggregateBytes",
        1,
        1_099_511_627_776,
      ),
      maxBlobBytes: assertInteger(
        sourcePolicy.maxBlobBytes,
        "source.maxBlobBytes",
        1,
        17_179_869_184,
      ),
      maxPathBytes: assertInteger(sourcePolicy.maxPathBytes, "source.maxPathBytes", 1, 4_096),
      maxPathSegments: assertInteger(
        sourcePolicy.maxPathSegments,
        "source.maxPathSegments",
        1,
        256,
      ),
      allowRelativeSymlinks: assertBoolean(
        sourcePolicy.allowRelativeSymlinks,
        "source.allowRelativeSymlinks",
      ),
    },
    resources: {
      vcpus: assertInteger(resources.vcpus, "resources.vcpus", 1, 64),
      memoryBytes: assertInteger(
        resources.memoryBytes,
        "resources.memoryBytes",
        536_870_912,
        274_877_906_944,
      ),
      workspaceVirtualBytes: assertInteger(
        resources.workspaceVirtualBytes,
        "resources.workspaceVirtualBytes",
        1_073_741_824,
        1_099_511_627_776,
      ),
      cellPids: assertInteger(resources.cellPids, "resources.cellPids", 16, 32_768),
      callTimeoutMs: assertInteger(
        resources.callTimeoutMs,
        "resources.callTimeoutMs",
        100,
        86_400_000,
      ),
      outputBytes: assertInteger(
        resources.outputBytes,
        "resources.outputBytes",
        1_024,
        1_073_741_824,
      ),
      tmpBytes: assertInteger(resources.tmpBytes, "resources.tmpBytes", 1_048_576, 68_719_476_736),
      shmBytes: assertInteger(resources.shmBytes, "resources.shmBytes", 1_048_576, 17_179_869_184),
    },
    tools: {
      allowed: normalizeAllowedTools(tools.allowed),
      userBash: assertBoolean(tools.userBash, "tools.userBash"),
    },
    admission: {
      maxActiveReadWriteLeases: assertInteger(
        admission.maxActiveReadWriteLeases,
        "admission.maxActiveReadWriteLeases",
        1,
        16,
      ),
      maxStartingLeases: assertInteger(
        admission.maxStartingLeases,
        "admission.maxStartingLeases",
        1,
        4,
      ),
      maxAcquireQueue: assertInteger(
        admission.maxAcquireQueue,
        "admission.maxAcquireQueue",
        0,
        128,
      ),
      minimumHostFreeBytes: assertInteger(
        admission.minimumHostFreeBytes,
        "admission.minimumHostFreeBytes",
        1_073_741_824,
        10_995_116_277_760,
      ),
      cpuPsiSomeAvg10Max: assertInteger(
        admission.cpuPsiSomeAvg10Max,
        "admission.cpuPsiSomeAvg10Max",
        0,
        100,
      ),
      memoryPsiSomeAvg10Max: assertInteger(
        admission.memoryPsiSomeAvg10Max,
        "admission.memoryPsiSomeAvg10Max",
        0,
        100,
      ),
      ioPsiSomeAvg10Max: assertInteger(
        admission.ioPsiSomeAvg10Max,
        "admission.ioPsiSomeAvg10Max",
        0,
        100,
      ),
      voiceActiveBatchAdmission: assertEnum(
        admission.voiceActiveBatchAdmission,
        "admission.voiceActiveBatchAdmission",
        ["deny", "queue"],
      ),
    },
    retention: {
      retainSuccessfulWorkspace: assertBoolean(
        retention.retainSuccessfulWorkspace,
        "retention.retainSuccessfulWorkspace",
      ),
      retainFailedWorkspace: assertBoolean(
        retention.retainFailedWorkspace,
        "retention.retainFailedWorkspace",
      ),
      quarantineDays: assertInteger(
        retention.quarantineDays,
        "retention.quarantineDays",
        0,
        90,
      ),
      globalRetainedBytes: assertInteger(
        retention.globalRetainedBytes,
        "retention.globalRetainedBytes",
        0,
        1_099_511_627_776,
      ),
      d0AuditQueueEvents: assertInteger(
        retention.d0AuditQueueEvents,
        "retention.d0AuditQueueEvents",
        100,
        1_000_000,
      ),
    },
    hostDefense: {
      requireSystemdHardening: true,
      landlock: assertEnum(hostDefense.landlock, "hostDefense.landlock", [
        "required",
        "preferred",
        "disabled-by-operator",
      ]),
    },
  };

  if (normalized.source.maxBlobBytes > normalized.source.maxAggregateBytes) {
    throw new BoundaryError(
      "BLOB_EXCEEDS_AGGREGATE",
      "source.maxBlobBytes cannot exceed source.maxAggregateBytes",
    );
  }
  if (normalized.tools.userBash && !normalized.tools.allowed.includes("bash")) {
    throw new BoundaryError(
      "USER_BASH_WITHOUT_BASH",
      "tools.userBash requires bash in tools.allowed",
    );
  }
  return deepFreeze(normalized);
}

const MAXIMUM_FIELDS = Object.freeze([
  ["source", "maxFiles"],
  ["source", "maxAggregateBytes"],
  ["source", "maxBlobBytes"],
  ["source", "maxPathBytes"],
  ["source", "maxPathSegments"],
  ["resources", "vcpus"],
  ["resources", "memoryBytes"],
  ["resources", "workspaceVirtualBytes"],
  ["resources", "cellPids"],
  ["resources", "callTimeoutMs"],
  ["resources", "outputBytes"],
  ["resources", "tmpBytes"],
  ["resources", "shmBytes"],
  ["admission", "maxActiveReadWriteLeases"],
  ["admission", "maxStartingLeases"],
  ["admission", "maxAcquireQueue"],
  ["admission", "cpuPsiSomeAvg10Max"],
  ["admission", "memoryPsiSomeAvg10Max"],
  ["admission", "ioPsiSomeAvg10Max"],
  ["retention", "quarantineDays"],
  ["retention", "globalRetainedBytes"],
  ["retention", "d0AuditQueueEvents"],
]);

const MINIMUM_FIELDS = Object.freeze([["admission", "minimumHostFreeBytes"]]);
const LANDLOCK_STRENGTH = Object.freeze({
  required: 0,
  preferred: 1,
  "disabled-by-operator": 2,
});
const VOICE_BATCH_STRENGTH = Object.freeze({ deny: 0, queue: 1 });

function fieldProof(field, relation, proposed, granted) {
  return deepFreeze({ field, relation, proposed, granted });
}

export function comparePolicy(proposalInput, grantInput) {
  const proposal = normalizePolicy(proposalInput);
  const grant = normalizePolicy(grantInput);
  const fieldProofs = [];
  let hasBroader = false;
  let hasNarrower = false;
  let hasIncomparable = false;

  const record = (field, relation, proposed, granted) => {
    fieldProofs.push(fieldProof(field, relation, proposed, granted));
    if (relation === "broader") hasBroader = true;
    else if (relation === "narrower") hasNarrower = true;
    else if (relation === "incomparable") hasIncomparable = true;
  };

  record("schema", proposal.schema === grant.schema ? "equal" : "incomparable", proposal.schema, grant.schema);
  record("profile", proposal.profile === grant.profile ? "equal" : "incomparable", proposal.profile, grant.profile);
  record(
    "source.mode",
    proposal.source.mode === grant.source.mode ? "equal" : "incomparable",
    proposal.source.mode,
    grant.source.mode,
  );

  for (const [section, key] of MAXIMUM_FIELDS) {
    const proposed = proposal[section][key];
    const granted = grant[section][key];
    record(
      `${section}.${key}`,
      proposed === granted ? "equal" : proposed < granted ? "narrower" : "broader",
      proposed,
      granted,
    );
  }
  for (const [section, key] of MINIMUM_FIELDS) {
    const proposed = proposal[section][key];
    const granted = grant[section][key];
    record(
      `${section}.${key}`,
      proposed === granted ? "equal" : proposed > granted ? "narrower" : "broader",
      proposed,
      granted,
    );
  }

  const grantTools = new Set(grant.tools.allowed);
  const proposalIsSubset = proposal.tools.allowed.every((tool) => grantTools.has(tool));
  record(
    "tools.allowed",
    !proposalIsSubset
      ? "broader"
      : proposal.tools.allowed.length === grant.tools.allowed.length
        ? "equal"
        : "narrower",
    proposal.tools.allowed,
    grant.tools.allowed,
  );

  for (const [field, proposed, granted, broaderWhenTrue] of [
    [
      "tools.userBash",
      proposal.tools.userBash,
      grant.tools.userBash,
      true,
    ],
    [
      "source.allowRelativeSymlinks",
      proposal.source.allowRelativeSymlinks,
      grant.source.allowRelativeSymlinks,
      true,
    ],
    [
      "retention.retainSuccessfulWorkspace",
      proposal.retention.retainSuccessfulWorkspace,
      grant.retention.retainSuccessfulWorkspace,
      true,
    ],
    [
      "retention.retainFailedWorkspace",
      proposal.retention.retainFailedWorkspace,
      grant.retention.retainFailedWorkspace,
      true,
    ],
  ]) {
    const relation =
      proposed === granted ? "equal" : proposed === broaderWhenTrue ? "broader" : "narrower";
    record(field, relation, proposed, granted);
  }

  const proposedLandlock = LANDLOCK_STRENGTH[proposal.hostDefense.landlock];
  const grantedLandlock = LANDLOCK_STRENGTH[grant.hostDefense.landlock];
  record(
    "hostDefense.landlock",
    proposedLandlock === grantedLandlock
      ? "equal"
      : proposedLandlock < grantedLandlock
        ? "narrower"
        : "broader",
    proposal.hostDefense.landlock,
    grant.hostDefense.landlock,
  );

  const proposedVoice = VOICE_BATCH_STRENGTH[proposal.admission.voiceActiveBatchAdmission];
  const grantedVoice = VOICE_BATCH_STRENGTH[grant.admission.voiceActiveBatchAdmission];
  record(
    "admission.voiceActiveBatchAdmission",
    proposedVoice === grantedVoice ? "equal" : proposedVoice < grantedVoice ? "narrower" : "broader",
    proposal.admission.voiceActiveBatchAdmission,
    grant.admission.voiceActiveBatchAdmission,
  );

  const relation = hasIncomparable
    ? "incomparable"
    : hasBroader
      ? "broader"
      : hasNarrower
        ? "narrower"
        : "equal";

  const proofBody = {
    1: relation,
    2: fieldProofs.map((proof) => [proof.field, proof.relation]),
    3: policySemanticBody(proposal),
    4: policySemanticBody(grant),
  };

  return deepFreeze({
    schema: "pi-tool-boundary-policy-proof/v1",
    relation,
    fieldProofs,
    proposal,
    grant,
    proposalDigest: policyDigest(proposal),
    grantDigest: policyDigest(grant),
    proofDigest: domainSeparatedDigest("pi-tool-boundary/policy-subset-proof/v1", proofBody),
  });
}

export function policySemanticBody(policyInput) {
  const policy = normalizePolicy(policyInput);
  return {
    1: policy.schema,
    2: policy.profile,
    3: {
      1: policy.source.mode,
      2: policy.source.requireCleanGit,
      3: policy.source.maxFiles,
      4: policy.source.maxAggregateBytes,
      5: policy.source.maxBlobBytes,
      6: policy.source.maxPathBytes,
      7: policy.source.maxPathSegments,
      8: policy.source.allowRelativeSymlinks,
    },
    4: {
      1: policy.resources.vcpus,
      2: policy.resources.memoryBytes,
      3: policy.resources.workspaceVirtualBytes,
      4: policy.resources.cellPids,
      5: policy.resources.callTimeoutMs,
      6: policy.resources.outputBytes,
      7: policy.resources.tmpBytes,
      8: policy.resources.shmBytes,
    },
    5: { 1: policy.tools.allowed, 2: policy.tools.userBash },
    6: {
      1: policy.admission.maxActiveReadWriteLeases,
      2: policy.admission.maxStartingLeases,
      3: policy.admission.maxAcquireQueue,
      4: policy.admission.minimumHostFreeBytes,
      5: policy.admission.cpuPsiSomeAvg10Max,
      6: policy.admission.memoryPsiSomeAvg10Max,
      7: policy.admission.ioPsiSomeAvg10Max,
      8: policy.admission.voiceActiveBatchAdmission,
    },
    7: {
      1: policy.retention.retainSuccessfulWorkspace,
      2: policy.retention.retainFailedWorkspace,
      3: policy.retention.quarantineDays,
      4: policy.retention.globalRetainedBytes,
      5: policy.retention.d0AuditQueueEvents,
    },
    8: { 1: policy.hostDefense.requireSystemdHardening, 2: policy.hostDefense.landlock },
  };
}

export function policyDigest(policyInput) {
  return domainSeparatedDigest("pi-tool-boundary/effective-policy/v1", policySemanticBody(policyInput));
}

export function compileEffectivePolicy(proposal, operatorGrant) {
  const proof = comparePolicy(proposal, operatorGrant);
  if (proof.relation !== "equal" && proof.relation !== "narrower") {
    throw new BoundaryError(
      "POLICY_NOT_NO_BROADER",
      `Project policy is ${proof.relation} than the operator grant`,
      { proof },
    );
  }
  return deepFreeze({
    schema: "pi-tool-boundary-effective-policy/v1",
    policy: proof.proposal,
    policyDigest: proof.proposalDigest,
    operatorGrantDigest: proof.grantDigest,
    subsetProof: proof,
  });
}
