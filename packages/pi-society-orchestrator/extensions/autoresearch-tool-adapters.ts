// ---
// summary: "Tool-result factories and live-identity validation for autoresearch supervision tools; extracted verbatim from extensions/society-orchestrator.ts."
// read_when:
//  - "Changing autoresearch tool result construction or live supervision identity validation."
// ---

import type {
  AutoresearchLearningKesAdapterToolDetails,
  AutoresearchLiveSupervisionAction,
  AutoresearchLiveSupervisionToolDetails,
  AutoresearchManifestCampaignSupervisionToolDetails,
  AutoresearchSelfHostingSupervisionToolDetails,
} from "../src/runtime/autoresearch-report-format.ts";

export function validateAutoresearchLiveIdentity(input: {
  action: AutoresearchLiveSupervisionAction;
  taskId?: number;
  cwd?: string;
}) {
  const hasTaskId = input.taskId !== undefined;
  const hasCwd = input.cwd !== undefined;

  if (input.action === "status" && !hasTaskId && !hasCwd) {
    return;
  }

  if (hasTaskId !== hasCwd) {
    throw new Error(
      `${input.action} requires taskId and cwd together, or neither for action=status.`,
    );
  }

  if (!hasTaskId || !hasCwd) {
    throw new Error(`${input.action} requires an exact taskId and cwd.`);
  }
}

export function createAutoresearchLiveToolResult(
  text: string,
  details: AutoresearchLiveSupervisionToolDetails,
) {
  return {
    content: [{ type: "text" as const, text }],
    details,
  };
}

export function createAutoresearchManifestCampaignToolResult(
  text: string,
  details: AutoresearchManifestCampaignSupervisionToolDetails,
) {
  return {
    content: [{ type: "text" as const, text }],
    details,
  };
}

export function createAutoresearchSelfHostingToolResult(
  text: string,
  details: AutoresearchSelfHostingSupervisionToolDetails,
) {
  return {
    content: [{ type: "text" as const, text }],
    details,
  };
}

export function createAutoresearchLearningKesAdapterToolResult(
  text: string,
  details: AutoresearchLearningKesAdapterToolDetails,
) {
  return {
    content: [{ type: "text" as const, text }],
    details,
  };
}
