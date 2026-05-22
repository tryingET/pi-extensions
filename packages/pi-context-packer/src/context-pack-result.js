import { markdownFence } from "./context-intake-safety.js";
import { formatContextPlan } from "./context-plan.js";

export const textResult = (text, details = {}) => ({ content: [{ type: "text", text }], details });

const formatPacketItem = (item) => {
  const heading = `### ${item.id}`;
  const meta = [
    `- kind: ${item.kind}`,
    `- mode: ${item.contentMode}`,
    item.provenance?.path ? `- path: ${item.provenance.path}` : undefined,
    item.provenance?.command ? `- command: ${item.provenance.command}` : undefined,
    `- rationale: ${item.rationale}`,
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
    (omission) => `- ${omission.provider}/${omission.reason}: ${omission.detail}`,
  );
  const ownerRouting = (packet.ownerSurfaceRecommendations ?? []).map(
    (recommendation) =>
      `- ${recommendation.surface}: ${recommendation.nextAction} (${recommendation.nonAuthorization})`,
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
    `# Context packet: ${packet.objective}`,
    "",
    `Selected: ${packet.totals.candidatesSelected} item(s), ${packet.totals.estimatedTokens} estimated tokens, ${packet.totals.bytes} bytes`,
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
          "- actual low-level read/search/status calls: fill externally after work if useful",
          `- non-authorization: ${dogfoodFollowup.nonAuthorization}`,
        ].join("\n")
      : "- none",
    "",
    "## Dogfood observation template",
    dogfoodObservationTemplate ?? "- none",
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
    "## Non-authorizations",
    ...packet.nonAuthorizations.map((item) => `- ${item}`),
  ].join("\n");
};

export const compactContextPacketDetails = (result) => {
  if (!result.ok) return { ok: false, errors: result.errors ?? [], plan: result.plan };
  const { packet } = result;
  return {
    ok: true,
    objective: packet.objective,
    generatedAt: packet.generatedAt,
    cwd: packet.cwd,
    repoRoot: packet.repoRoot,
    budget: packet.budget,
    totals: packet.totals,
    sections: packet.sections.map((section) => ({
      id: section.id,
      provider: section.provider,
      title: section.title,
      estimatedTokens: section.estimatedTokens,
      bytes: section.bytes,
      itemCount: section.items.length,
      items: section.items.map((item) => ({
        id: item.id,
        kind: item.kind,
        contentMode: item.contentMode,
        provenance: item.provenance,
        estimatedTokens: item.estimatedTokens,
        bytes: item.bytes,
        duplicateOf: item.duplicateOf,
        duplicateTokensAvoided: item.duplicateTokensAvoided,
      })),
    })),
    omissions: packet.omissions,
    ownerSurfaceRecommendations: packet.ownerSurfaceRecommendations,
    nextOwnerActions: packet.nextOwnerActions,
    nextToolSuggestions: packet.nextToolSuggestions,
    measurementReceipt: packet.measurementReceipt,
    packetUtilityRecommendation: packet.measurementReceipt.packetUtilityRecommendation,
    dogfoodFollowupReceipt: packet.measurementReceipt.dogfoodFollowupReceipt,
    dogfoodObservationTemplate: packet.dogfoodObservationTemplate,
    measurementHints: packet.measurementHints,
    nonAuthorizations: packet.nonAuthorizations,
  };
};

export const toolResultFromContextPacketResult = (result) =>
  textResult(formatContextPacket(result), compactContextPacketDetails(result));
