const ESTIMATED_BYTES_PER_TOKEN = 4;

const textTokens = (text) => Math.ceil(text.length / ESTIMATED_BYTES_PER_TOKEN);

const sectionFromItems = (provider, title, items) => ({
  id: provider,
  title,
  provider,
  authority:
    provider === "session"
      ? "Current Pi session/environment metadata; helps avoid duplicating already-loaded prompt context."
      : "Source-owned provider projection.",
  estimatedTokens: items.reduce((sum, item) => sum + item.estimatedTokens, 0),
  bytes: items.reduce((sum, item) => sum + item.bytes, 0),
  items,
});

const extractUsageTokens = (usage) => {
  if (!usage || typeof usage !== "object") return undefined;
  for (const key of ["tokens", "totalTokens", "usedTokens", "inputTokens"]) {
    const value = usage[key];
    if (typeof value === "number" && Number.isFinite(value)) return value;
  }
  return undefined;
};

const extractUsageWindow = (usage) => {
  if (!usage || typeof usage !== "object") return undefined;
  for (const key of ["windowTokens", "contextWindow", "maxTokens", "limitTokens"]) {
    const value = usage[key];
    if (typeof value === "number" && Number.isFinite(value)) return value;
  }
  return undefined;
};

export const buildSessionAwareness = (env = {}) => {
  const usage = env.contextUsage;
  const systemPrompt = typeof env.systemPrompt === "string" ? env.systemPrompt : "";
  const tokens = extractUsageTokens(usage);
  const windowTokens = extractUsageWindow(usage);
  const contextPressureRatio = tokens && windowTokens ? tokens / windowTokens : undefined;
  return {
    cwd: env.cwd,
    model: env.modelLabel,
    contextUsageKnown: Boolean(usage),
    contextUsage: usage ?? null,
    contextPressureRatio,
    highContextPressure:
      Boolean(contextPressureRatio && contextPressureRatio >= 0.8) ||
      Boolean(tokens && tokens >= 120_000),
    systemPromptEstimatedTokens: systemPrompt ? textTokens(systemPrompt) : null,
    systemPromptBytes: systemPrompt ? Buffer.byteLength(systemPrompt) : null,
    visibleSessionSection: false,
    note: "system prompt raw content intentionally omitted; metadata is used for dedupe and context-pressure measurement",
  };
};

export const shouldShowSessionSection = ({ plan, sessionAwareness }) => {
  const sessionPlan = plan.providerPlans.find(
    (providerPlan) => providerPlan.provider === "session",
  );
  return Boolean(
    sessionPlan?.reason === "provider required by caller" || sessionAwareness.highContextPressure,
  );
};

export const buildSessionSection = ({ sessionAwareness }) => {
  const content = JSON.stringify({ ...sessionAwareness, visibleSessionSection: true }, null, 2);
  return {
    section: sectionFromItems("session", "Current Pi session/environment", [
      {
        id: "session:environment",
        kind: "status",
        provenance: { provider: "session", ref: "Pi ExtensionContext" },
        rationale: "current execution environment and already-loaded prompt metadata",
        estimatedTokens: textTokens(content),
        bytes: Buffer.byteLength(content),
        content,
        contentMode: "metadata",
        freshness: "live Pi extension context",
      },
    ]),
    omissions: [],
  };
};

export const buildMeasurementReceipt = ({
  estimatedTokens,
  sections,
  omissions,
  budget,
  sessionAwareness,
}) => {
  const wiredProviders = sections.map((section) => section.provider);
  const selectedItemCount = sections.reduce((sum, section) => sum + section.items.length, 0);
  const estimatedToolCallsAvoided = sections.reduce((sum, section) => {
    const freshItems = section.items.filter((item) => !item.duplicateOf).length;
    if (section.provider === "sci") return sum + freshItems * 2;
    return sum + freshItems;
  }, 0);
  const alreadyLoadedItems = sections.reduce(
    (sum, section) => sum + section.items.filter((item) => item.duplicateOf).length,
    0,
  );
  const freshItemCount = selectedItemCount - alreadyLoadedItems;
  const duplicateTokensAvoided = sections.reduce(
    (sum, section) =>
      sum + section.items.reduce((inner, item) => inner + (item.duplicateTokensAvoided ?? 0), 0),
    0,
  );
  const packetFillRatio = budget.maxTokens > 0 ? estimatedTokens / budget.maxTokens : 0;
  const receipt = {
    estimatedToolCallsAvoided,
    packetFillRatio,
    wiredProviders,
    selectedItemCount,
    alreadyLoadedItems,
    freshItemCount,
    duplicateTokensAvoided,
    sessionAwareness,
    omittedCandidateCount: omissions.length,
    unwiredProviderOmissions: omissions
      .filter((omission) => omission.reason === "unavailable")
      .map((omission) => omission.provider),
  };
  return {
    ...receipt,
    packetUtilityRecommendation: buildPacketUtilityRecommendation(receipt),
    dogfoodFollowupReceipt: buildDogfoodFollowupReceipt(receipt),
  };
};

export const buildDogfoodFollowupReceipt = (receipt) => ({
  status: "observation_pending",
  expectedLowLevelCallsAvoided: receipt.estimatedToolCallsAvoided,
  actualLowLevelReadSearchStatusCalls: null,
  duplicateReadsObserved: null,
  omissionFollowupsUsed: [],
  recommendationMatchedOutcome: null,
  notes:
    "Fill externally after the work if maintaining dogfood evidence; context-packer does not persist or validate this receipt.",
  nonAuthorization:
    "packet-local follow-up scaffold only; no AK evidence, FCOS update, session memory, or source-owner mutation was recorded",
});

export const buildPacketUtilityRecommendation = (receipt) => {
  const hasOmissions = receipt.omittedCandidateCount > 0;
  const hasFreshContent = receipt.freshItemCount > 0;
  const allSelectedAlreadyLoaded =
    receipt.selectedItemCount > 0 && receipt.alreadyLoadedItems === receipt.selectedItemCount;

  if (hasFreshContent) {
    return {
      status: hasOmissions ? "use_packet_review_omissions" : "use_packet",
      reason: hasOmissions
        ? "packet contains fresh selected context, but omissions may require owner-surface follow-up"
        : "packet contains fresh selected context not already detected in the active prompt",
      nextAction: hasOmissions
        ? "Use the selected packet content, then review omissions before assuming coverage is complete."
        : "Use the selected packet content as read-only source-owned context for the next step.",
      nonAuthorization: "advisory packet-local recommendation only; no owner surface was executed",
    };
  }

  if (allSelectedAlreadyLoaded) {
    return {
      status: hasOmissions ? "skip_packet_review_omissions" : "no_packet_needed",
      reason: hasOmissions
        ? "all selected packet content is already loaded, but omissions still need review"
        : "all selected packet content is already represented in the active prompt/session",
      nextAction: hasOmissions
        ? "Do not spend context on duplicate packet content; review omissions or use owning surfaces if coverage matters."
        : "Skip loading duplicate packet content and proceed with the already-loaded context.",
      nonAuthorization:
        "advisory packet-local recommendation only; it does not prove task readiness or completion",
    };
  }

  if (hasOmissions) {
    return {
      status: "review_omissions",
      reason:
        "no fresh packet content was selected and one or more candidates/providers were omitted",
      nextAction:
        "Review omissions and use the owning surface directly when live authority or governed retrieval is required.",
      nonAuthorization:
        "advisory packet-local recommendation only; omissions are not owner-surface execution",
    };
  }

  return {
    status: "no_packet_needed",
    reason: "no fresh packet content was selected",
    nextAction:
      "Skip packet loading unless the objective changes or additional safe seeds are available.",
    nonAuthorization:
      "advisory packet-local recommendation only; it does not prove task readiness or completion",
  };
};

export const buildMeasurementHints = (receipt, budget) => [
  {
    metric: "tool_calls_avoided",
    note: `${receipt.estimatedToolCallsAvoided} estimated low-level read/search/status calls avoided by this packet`,
  },
  {
    metric: "packet_fill",
    note: `${Math.round(receipt.packetFillRatio * 100)}% of ${budget.maxTokens} estimated packet tokens selected`,
  },
  {
    metric: "already_loaded_dedupe",
    note: `${receipt.alreadyLoadedItems} item(s) represented as metadata because content is already loaded; ${receipt.duplicateTokensAvoided} duplicate tokens avoided`,
  },
  {
    metric: "session_awareness",
    note: receipt.sessionAwareness?.highContextPressure
      ? "high context pressure detected; visible session metadata included or recommended"
      : "session/system-prompt metadata used internally for dedupe and measurement",
  },
  {
    metric: "provider_gap",
    note: `${receipt.omittedCandidateCount} candidate/provider omissions recorded`,
  },
  {
    metric: "dogfood_followup",
    note: `After the task, compare actual low-level read/search/status calls against ${receipt.dogfoodFollowupReceipt?.expectedLowLevelCallsAvoided ?? receipt.estimatedToolCallsAvoided} estimated calls avoided if recording packet usefulness externally`,
  },
];
