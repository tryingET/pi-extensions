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
    measurementHints: packet.measurementHints,
    nonAuthorizations: packet.nonAuthorizations,
  };
};

export const toolResultFromContextPacketResult = (result) =>
  textResult(formatContextPacket(result), compactContextPacketDetails(result));
