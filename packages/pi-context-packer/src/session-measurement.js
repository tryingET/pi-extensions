import { compactOmissionProjections } from "./compact-projection.js";
import {
  DOGFOOD_OMISSION_FOLLOWUP_CLASS_GUIDANCE,
  DOGFOOD_USER_OMISSION_FOLLOWUP_CLASSES,
} from "./dogfood-followup-classes.js";
import { isPlannedUnwiredContextPackProvider } from "./provider-capabilities.js";
import { compactSessionContextUsage } from "./session-context.js";

const ESTIMATED_BYTES_PER_TOKEN = 4;
const DOGFOOD_TEMPLATE_ITEM_LIMIT = 20;
const DOGFOOD_RUNTIME_CONTEXT_OPTIONS = Object.freeze([
  "source_local",
  "installed_artifact",
  "live_pi_reloaded",
  "unknown",
]);
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

export const buildSessionAwareness = (env = {}) => {
  const usage = env.contextUsage;
  const systemPrompt = typeof env.systemPrompt === "string" ? env.systemPrompt : "";
  const contextUsage = compactSessionContextUsage(usage);
  const { tokens, contextPressureRatio } = contextUsage;
  return {
    cwdRef: env.cwd ? "ExtensionContext.cwd" : undefined,
    cwdOmitted: Boolean(env.cwd),
    model: env.modelLabel,
    contextUsageKnown: Boolean(usage),
    contextUsage,
    contextPressureRatio: contextPressureRatio ?? undefined,
    highContextPressure:
      Boolean(contextPressureRatio && contextPressureRatio >= 0.8) ||
      Boolean(tokens && tokens >= 120_000),
    systemPromptEstimatedTokens: systemPrompt ? textTokens(systemPrompt) : null,
    systemPromptBytes: systemPrompt ? Buffer.byteLength(systemPrompt) : null,
    visibleSessionSection: false,
    note: "system prompt raw content and raw context-usage object intentionally omitted; compact numeric metadata is used for dedupe and context-pressure measurement",
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
      .filter(
        (omission) =>
          omission.reason === "unavailable" &&
          isPlannedUnwiredContextPackProvider(omission.provider),
      )
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
  activityType: null,
  runtimeContext: "unknown",
  runtimeContextOptions: [...DOGFOOD_RUNTIME_CONTEXT_OPTIONS],
  actualLowLevelReadSearchStatusCalls: null,
  validationCommandsRun: null,
  duplicateReadsObserved: null,
  omissionFollowupsUsed: [],
  recommendationMatchedOutcome: null,
  notes:
    "Fill externally after the work if maintaining dogfood evidence; context-packer does not persist or validate this receipt.",
  nonAuthorization:
    "packet-local follow-up scaffold only; activity labels, runtime labels, and validation counts are calibration metadata, not task-completion proof; no AK evidence, FCOS update, session memory, or source-owner mutation was recorded",
});

const compactSelectedItems = (sections) =>
  sections
    .flatMap((section, sectionIndex) =>
      section.items.map((item, itemIndex) => ({
        ref: `packet.sections[${sectionIndex}].items[${itemIndex}]`,
        provider: section.provider,
        kind: item.kind,
        contentMode: item.contentMode,
        estimatedTokens: item.estimatedTokens,
        bytes: item.bytes,
        duplicateOf: item.duplicateOf,
        duplicateTokensAvoided: item.duplicateTokensAvoided ?? 0,
      })),
    )
    .slice(0, DOGFOOD_TEMPLATE_ITEM_LIMIT);

const compactOmissions = (omissions) =>
  compactOmissionProjections(omissions, { includeRef: true }).slice(0, DOGFOOD_TEMPLATE_ITEM_LIMIT);

const seedRouteKind = (seed) => {
  if (seed?.kind === "symbol") return "symbol";
  if (seed?.kind === "task") return "task";
  if (seed?.kind === "ak") return "ak";
  if (seed?.kind === "fcos") return "fcos";
  if (seed?.kind === "prompt") return "prompt";
  if (seed?.kind === "free_text") return "free_text";
  if (seed?.kind === "path") return /\.md$/iu.test(seed.value ?? "") ? "markdown" : "code";
  return "other";
};

const providerRouteRole = (posture) => {
  if (posture === "selected") return "selected";
  if (posture === "optional") return "followup";
  return "skipped";
};

const compactProviderRoutes = (providerPlans = []) =>
  providerPlans
    .map((providerPlan) => {
      const seeds = (providerPlan.proposedQueries ?? []).flatMap((query) => query.seeds ?? []);
      const seedCounts = {};
      for (const seed of seeds) {
        const routeKind = seedRouteKind(seed);
        seedCounts[routeKind] = (seedCounts[routeKind] ?? 0) + 1;
      }
      const rawQueryCount = providerPlan.proposedQueries?.length ?? 0;
      const routeRole = providerRouteRole(providerPlan.posture);
      const selectedQueryCount = routeRole === "selected" ? rawQueryCount : 0;
      const followupQueryCount = routeRole === "followup" ? rawQueryCount : 0;
      return {
        provider: providerPlan.provider,
        posture: providerPlan.posture,
        routeRole,
        queryCount: rawQueryCount,
        totalQueryCount: rawQueryCount,
        selectedQueryCount,
        followupQueryCount,
        seedCount: seeds.length,
        seedCounts,
      };
    })
    .slice(0, DOGFOOD_TEMPLATE_ITEM_LIMIT);

export const buildDogfoodObservationTemplate = ({
  objective,
  generatedAt,
  totals,
  sections,
  omissions,
  measurementReceipt,
  providerPlans = [],
}) => ({
  kind: "context_pack_dogfood_observation_v1",
  status: "observation_pending",
  packet: {
    objectiveRef: "packet.objective",
    objectiveEstimatedTokens: textTokens(typeof objective === "string" ? objective : ""),
    objectiveBytes: Buffer.byteLength(typeof objective === "string" ? objective : ""),
    generatedAt,
    selectedItemCount: measurementReceipt.selectedItemCount,
    omittedCandidateCount: measurementReceipt.omittedCandidateCount,
    candidatesSelected: totals.candidatesSelected,
    candidatesOmitted: totals.candidatesOmitted,
    selectedItems: compactSelectedItems(sections),
    selectedItemsTruncated: Math.max(
      0,
      measurementReceipt.selectedItemCount - DOGFOOD_TEMPLATE_ITEM_LIMIT,
    ),
    omissions: compactOmissions(omissions),
    omissionsTruncated: Math.max(0, omissions.length - DOGFOOD_TEMPLATE_ITEM_LIMIT),
    providerRoutes: compactProviderRoutes(providerPlans),
    providerRoutesTruncated: Math.max(0, providerPlans.length - DOGFOOD_TEMPLATE_ITEM_LIMIT),
  },
  prediction: {
    expectedLowLevelCallsAvoided: measurementReceipt.estimatedToolCallsAvoided,
    packetUtilityRecommendationStatus:
      measurementReceipt.packetUtilityRecommendation?.status ?? "unknown",
    alreadyLoadedItems: measurementReceipt.alreadyLoadedItems,
    freshItemCount: measurementReceipt.freshItemCount,
    duplicateTokensAvoided: measurementReceipt.duplicateTokensAvoided,
    unwiredProviderOmissions: measurementReceipt.unwiredProviderOmissions,
  },
  observation: {
    activityType: null,
    runtimeContext: "unknown",
    runtimeContextOptions: [...DOGFOOD_RUNTIME_CONTEXT_OPTIONS],
    actualLowLevelReadSearchStatusCalls: null,
    actualLowLevelCallsAvoided: null,
    validationCommandsRun: null,
    duplicateReadsObserved: null,
    omissionFollowupsUsed: [],
    omissionFollowupClassOptions: DOGFOOD_USER_OMISSION_FOLLOWUP_CLASSES,
    recommendationMatchedOutcome: null,
    notes: "",
  },
  countingRule: `Count ad-hoc read/search/list/status probes that the packet should have avoided; optionally fill actualLowLevelCallsAvoided when a baseline is known; record validationCommandsRun separately from context probes; optionally set activityType to implementation, review, validation, planning, or other; set runtimeContext to source_local, installed_artifact, live_pi_reloaded, or unknown based on the observer's actual execution surface; for omissionFollowupsUsed, ${DOGFOOD_OMISSION_FOLLOWUP_CLASS_GUIDANCE}; do not treat counts, runtime labels, or activity labels as completion proof.`,
  instructions:
    "After the work, paste this template into the owning dogfood evidence surface only if useful, fill observation fields, and keep any sensitive task content out of notes.",
  nonAuthorization:
    "copy-ready packet-local observation template only; context-packer did not persist evidence, update AK/FCOS, write session memory, mutate files, or validate observed counts",
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
