/**
summary: "Format context packets and build compact redacted tool-result details."
read_when:
  - "You change packet Markdown output, detail projections, or redaction guarantees."
*/

import {
  compactNextToolSuggestionProjections,
  compactOmissionProjections,
} from "./compact-projection.js";
import { markdownFence, markdownInlineLabel } from "./context-intake-safety.js";
import { formatContextPlan } from "./context-plan.js";
import { DOGFOOD_OMISSION_FOLLOWUP_CLASS_GUIDANCE } from "./dogfood-followup-classes.js";
import { fitRenderedPacket } from "./packet-budget.js";

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
    item.provenance?.contentSha256
      ? `- source SHA-256: ${markdownInlineLabel(item.provenance.contentSha256)}`
      : undefined,
    item.provenance?.snapshotId
      ? `- snapshot: ${markdownInlineLabel(item.provenance.snapshotId)}`
      : undefined,
    `- rationale: ${markdownInlineLabel(item.rationale, "none")}`,
  ].filter(Boolean);
  return [heading, ...meta, "", markdownFence(item.id, item.content)].join("\n");
};

const formatUnboundedPacket = (result, diagnostics = false) => {
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
    ...(packet.requiredProviderFailures?.length
      ? [
          "Required code provider unavailable or omitted; packet is incomplete. Use Pi read/search tools.",
        ]
      : []),
    "",
    `Selected provider content: ${packet.totals.candidatesSelected} item(s), ${packet.totals.estimatedTokens} estimated tokens, ${packet.totals.bytes} bytes`,
    "Budget accounting: final rendered output is bounded; provider-content totals exclude scaffolding.",
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
    ...(diagnostics
      ? [
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
        ]
      : []),
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
    ...(diagnostics
      ? ["## Dogfood observation template", dogfoodObservationTemplate ?? "- none", ""]
      : []),
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
  ...(provenance.provider === "ripwire"
    ? {
        rank: provenance.rank,
        line: provenance.line,
        route: provenance.route,
        snapshotId: provenance.snapshotId,
        contentSha256: provenance.contentSha256,
        binarySha256: provenance.binarySha256,
      }
    : {}),
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
          estimatedTokens: textTokens(renderedMarkdownText),
          bytes: textBytes(renderedMarkdownText),
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
    providerRuns: cloneProjection(packet.providerRuns ?? {}),
    requiredProviderFailures: [...(packet.requiredProviderFailures ?? [])],
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
    omissions: compactOmissionProjections(packet.omissions),
    ownerSurfaceRecommendations: cloneProjection(packet.ownerSurfaceRecommendations),
    nextOwnerActions: cloneProjection(packet.nextOwnerActions),
    nextToolSuggestions: compactNextToolSuggestionProjections(packet.nextToolSuggestions),
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
      rawOmissionDetailsOmitted: true,
      rawNextToolSuggestionReasonsOmitted: true,
    },
    nonAuthorizations: cloneProjection(packet.nonAuthorizations),
  };
};

export const formatContextPacket = (result, env = {}) =>
  fitRenderedPacket(result, env, formatUnboundedPacket).text;

export const toolResultFromContextPacketResult = (result, env = {}) => {
  const fitted = fitRenderedPacket(result, env, formatUnboundedPacket);
  return {
    ...textResult(fitted.text, {
      ...compactContextPacketDetails(fitted.result, fitted.text),
      ok: fitted.ok,
      outputBudget: fitted.accounting,
    }),
    ...(fitted.ok ? {} : { isError: true }),
  };
};
