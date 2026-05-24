import { markdownFence, markdownInlineLabel } from "./context-intake-safety.js";
import { formatContextPlan } from "./context-plan.js";
import { DOGFOOD_OMISSION_FOLLOWUP_CLASS_GUIDANCE } from "./dogfood-followup-classes.js";

export const textResult = (text, details = {}) => ({ content: [{ type: "text", text }], details });

const formatPacketItem = (item) => {
  const displayId = markdownInlineLabel(item.id, "packet item");
  const heading = `### ${displayId}`;
  const meta = [
    `- kind: ${markdownInlineLabel(item.kind, "unknown")}`,
    `- mode: ${markdownInlineLabel(item.contentMode, "unknown")}`,
    item.provenance?.path
      ? `- path: ${markdownInlineLabel(item.provenance.path, "unknown")}`
      : undefined,
    item.provenance?.command
      ? `- command: ${markdownInlineLabel(item.provenance.command, "unknown")}`
      : undefined,
    `- rationale: ${markdownInlineLabel(item.rationale, "none")}`,
  ].filter(Boolean);
  return [heading, ...meta, "", markdownFence(item.id, item.content)].join("\n");
};

export const formatContextPacket = (result) => {
  if (!result.ok) return formatContextPlan(result.plan);
  const { packet } = result;
  const sectionSummaries = packet.sections.map(
    (section) =>
      `- ${section.provider}: ${section.items.length} item(s), ${section.estimatedTokens} tokens`,
  );
  const bodySections = packet.sections.map((section) =>
    [
      `## ${section.title}`,
      `Provider: ${section.provider}`,
      `Authority: ${section.authority}`,
      "",
      ...section.items.map(formatPacketItem),
    ].join("\n"),
  );
  const omissions = packet.omissions.map(
    (omission) =>
      `- ${markdownInlineLabel(omission.provider, "provider")}/${markdownInlineLabel(omission.reason, "reason")}: ${markdownInlineLabel(omission.detail, "detail omitted")}`,
  );
  const ownerRouting = (packet.ownerSurfaceRecommendations ?? []).map(
    (recommendation) =>
      `- ${markdownInlineLabel(recommendation.surface, "surface")}: ${markdownInlineLabel(recommendation.nextAction, "next action")} (${markdownInlineLabel(recommendation.nonAuthorization, "non-authorization")})`,
  );
  const utility = packet.measurementReceipt.packetUtilityRecommendation;
  const dogfoodFollowup = packet.measurementReceipt.dogfoodFollowupReceipt;
  const dogfoodObservationTemplate = packet.dogfoodObservationTemplate
    ? markdownFence(
        "dogfood-observation-template.json",
        JSON.stringify(packet.dogfoodObservationTemplate, null, 2),
      )
    : undefined;
  return [
    `# Context packet: ${markdownInlineLabel(packet.objective, "objective")}`,
    "",
    `Selected provider content: ${packet.totals.candidatesSelected} item(s), ${packet.totals.estimatedTokens} estimated tokens, ${packet.totals.bytes} bytes`,
    "Budget accounting: packet totals count selected provider content only; rendered scaffolding is reported separately in tool details.",
    `Estimated tool calls avoided: ${packet.measurementReceipt.estimatedToolCallsAvoided}`,
    "",
    "## Packet utility",
    utility
      ? [
          `- status: ${utility.status}`,
          `- reason: ${utility.reason}`,
          `- next: ${utility.nextAction}`,
          `- non-authorization: ${utility.nonAuthorization}`,
        ].join("\n")
      : "- none",
    "",
    "## Dogfood follow-up",
    dogfoodFollowup
      ? [
          `- status: ${dogfoodFollowup.status}`,
          `- expected low-level calls avoided: ${dogfoodFollowup.expectedLowLevelCallsAvoided}`,
          "- activity type: optionally fill activityType as implementation, review, validation, planning, or other",
          "- runtime context: optionally fill runtimeContext as source_local, installed_artifact, live_pi_reloaded, or unknown",
          "- actual low-level read/search/status calls: fill externally after work if useful",
          "- validation commands run: fill validationCommandsRun separately from context probes if recording dogfood",
          `- omission follow-ups: ${DOGFOOD_OMISSION_FOLLOWUP_CLASS_GUIDANCE}`,
          `- non-authorization: ${dogfoodFollowup.nonAuthorization}`,
        ].join("\n")
      : "- none",
    "",
    "## Section summary",
    sectionSummaries.length ? sectionSummaries.join("\n") : "- none",
    "",
    ...bodySections,
    "",
    "## Omissions",
    omissions.length ? omissions.join("\n") : "- none",
    "",
    "## Owner-surface routing",
    ownerRouting.length ? ownerRouting.join("\n") : "- none",
    "",
    "## Dogfood observation template",
    dogfoodObservationTemplate ?? "- none",
    "",
    "## Non-authorizations",
    ...packet.nonAuthorizations.map((item) => `- ${item}`),
  ].join("\n");
};

const textBytes = (value) => Buffer.byteLength(typeof value === "string" ? value : "");
const textTokens = (value) => Math.ceil(textBytes(value) / 4);
const cloneProjection = (value) => (value === undefined ? undefined : structuredClone(value));

const compactProvenance = (provenance = {}) => ({
  provider: provenance.provider,
  ...(provenance.path ? { pathRef: "packet Markdown item metadata", pathOmitted: true } : {}),
  ...(provenance.command
    ? { commandRef: "packet Markdown item metadata", commandOmitted: true }
    : {}),
  ...(provenance.ref ? { ref: provenance.ref } : {}),
});

const compactMeasurementReceipt = (receipt) => ({
  ...receipt,
  sessionAwareness: receipt.sessionAwareness
    ? {
        ...receipt.sessionAwareness,
        cwd: undefined,
        cwdRef: receipt.sessionAwareness.cwd ? "packet.workspace.cwd" : undefined,
        cwdOmitted: Boolean(receipt.sessionAwareness.cwd),
      }
    : receipt.sessionAwareness,
});

export const compactContextPacketDetails = (result, renderedMarkdownText) => {
  if (!result.ok) return { ok: false, errors: result.errors ?? [], plan: result.plan };
  const { packet } = result;
  const measurementReceipt = compactMeasurementReceipt(packet.measurementReceipt);
  const renderedMarkdown =
    typeof renderedMarkdownText === "string"
      ? {
          estimatedTokens: Math.ceil(renderedMarkdownText.length / 4),
          bytes: Buffer.byteLength(renderedMarkdownText),
          budgetAccounting:
            "rendered Markdown includes packet scaffolding; packet.totals and measurementReceipt count selected provider content only",
        }
      : undefined;
  return {
    ok: true,
    objectiveRef: "packet Markdown title",
    objectiveEstimatedTokens: textTokens(packet.objective),
    objectiveBytes: textBytes(packet.objective),
    generatedAt: packet.generatedAt,
    workspace: {
      cwdRef: "packet.cwd",
      repoRootRef: "packet.repoRoot",
      absolutePathsOmitted: true,
    },
    budget: cloneProjection(packet.budget),
    totals: cloneProjection(packet.totals),
    ...(renderedMarkdown ? { renderedMarkdown } : {}),
    sections: packet.sections.map((section, sectionIndex) => ({
      id: section.id,
      provider: section.provider,
      title: section.title,
      estimatedTokens: section.estimatedTokens,
      bytes: section.bytes,
      itemCount: section.items.length,
      items: section.items.map((item, itemIndex) => ({
        ref: `packet.sections[${sectionIndex}].items[${itemIndex}]`,
        idRef: "packet Markdown item heading",
        idOmitted: true,
        kind: item.kind,
        contentMode: item.contentMode,
        provenance: compactProvenance(item.provenance),
        estimatedTokens: item.estimatedTokens,
        bytes: item.bytes,
        duplicateOf: item.duplicateOf,
        duplicateTokensAvoided: item.duplicateTokensAvoided,
      })),
    })),
    omissions: cloneProjection(packet.omissions),
    ownerSurfaceRecommendations: cloneProjection(packet.ownerSurfaceRecommendations),
    nextOwnerActions: cloneProjection(packet.nextOwnerActions),
    nextToolSuggestions: cloneProjection(packet.nextToolSuggestions),
    measurementReceipt: cloneProjection(measurementReceipt),
    packetUtilityRecommendation: cloneProjection(measurementReceipt.packetUtilityRecommendation),
    dogfoodFollowupReceipt: cloneProjection(measurementReceipt.dogfoodFollowupReceipt),
    dogfoodObservationTemplate: cloneProjection(packet.dogfoodObservationTemplate),
    measurementHints: cloneProjection(packet.measurementHints),
    redaction: {
      rawObjectiveOmitted: true,
      absoluteWorkspacePathsOmitted: true,
      rawSelectedItemPathsOmitted: true,
      rawItemContentOmitted: true,
    },
    nonAuthorizations: cloneProjection(packet.nonAuthorizations),
  };
};

export const toolResultFromContextPacketResult = (result) => {
  const text = formatContextPacket(result);
  return textResult(text, compactContextPacketDetails(result, text));
};
