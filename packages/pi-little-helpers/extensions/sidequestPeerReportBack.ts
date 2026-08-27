// summary: builds peer report-back instructions, validates exact targets, and projects launch tool results.
// read_when:
//   - changing intercom ACK/final policy, parent target validation, or peer launch result messages.

import type { SidequestReportBack } from "./sidequestContracts.ts";
import type { LaunchMode } from "./sidequestGhostty.ts";

export function buildReportBackInstructions({
  reportBack,
  parentPeerTarget,
  questId,
  peerLabel = "sidequest",
}: {
  reportBack: SidequestReportBack;
  parentPeerTarget?: string;
  questId: string;
  peerLabel?: string;
}): string {
  const target = parentPeerTarget?.trim();
  if (reportBack === "intercom" && target) {
    return [
      "Use intercom for report-back if the tool is available.",
      `Report to the exact parent target: ${target}`,
      `Peer run id: ${questId}`,
      "",
      "## Intercom Message Budget",
      "Send at most two intercom messages unless the controller explicitly asks a clarifying question or assigns new work:",
      "",
      `1. \`PEER_ACK peer_run_id=${questId}: ...\` — send once as your first action, identifying yourself as the spawned ${peerLabel}.`,
      `2. \`PEER_FINAL peer_run_id=${questId}: ...\` — send once as your final DoD report.`,
      "",
      "Do not send both a final report and a separate final DoD report. `PEER_FINAL` is the final DoD report.",
      "After sending `PEER_FINAL`, stop. Do not reply to controller acknowledgements such as received, accepted, or no further action needed unless the controller explicitly asks a new question or assigns new work.",
      `Use the literal target in tool calls, for example: \`intercom({ action: "send", to: "${target}", message: "PEER_ACK peer_run_id=${questId}: ..." })\`.`,
      `For the final message, use: \`intercom({ action: "send", to: "${target}", message: "PEER_FINAL peer_run_id=${questId}: ..." })\`.`,
      "Intercom is communication only; it is not durable evidence or completion authority.",
    ].join("\n");
  }

  if (reportBack === "intercom") {
    return [
      "Use intercom for report-back if the tool is available.",
      "No exact parent target was supplied. This should not happen for controller-spawned quest tools; report-back may be ambiguous without the controller's exact session id.",
      "Intercom is communication only; it is not durable evidence or completion authority.",
    ].join("\n");
  }

  if (reportBack === "none") {
    return `No automatic report-back is requested. Do not claim that a report was delivered; leave findings visible in this ${peerLabel} session unless the controller gives further instructions.`;
  }

  return `Manual report-back is requested. Do not over-promise delivery; leave a concise visible report in this ${peerLabel} session for the controller/operator to inspect.`;
}

export function buildBootProtocolInstructions({
  reportBack,
  parentPeerTarget,
  questId,
  peerLabel,
}: {
  reportBack: SidequestReportBack;
  parentPeerTarget?: string;
  questId: string;
  peerLabel: string;
}): string {
  const target = parentPeerTarget?.trim();
  if (reportBack !== "intercom") {
    return `No intercom boot ACK is required because reportBack is ${reportBack}. Follow the report-back mode below.`;
  }

  if (!target) {
    return "Intercom boot ACK requires an exact parentPeerTarget. This prompt should not have been launched without one.";
  }

  return [
    "Before reading task context, inspecting files, or doing any other work, send the ACK below.",
    "Only allowed pre-ACK tool: `intercom`.",
    `Literal ACK call: \`intercom({ action: "send", to: "${target}", message: "PEER_ACK peer_run_id=${questId}: spawned ${peerLabel} started" })\``,
    "If the ACK send fails or intercom is unavailable, visibly report `ACK_FAILED` in this session and stop; do not continue task work silently.",
    "After ACK succeeds, continue with the objective and send exactly one `PEER_FINAL` as the final DoD report. After `PEER_FINAL`, stop unless the controller explicitly asks a new question or assigns new work.",
  ].join("\n");
}

export function errorToolResult(message: string, details: Record<string, unknown>) {
  return {
    content: [{ type: "text" as const, text: message }],
    details,
    isError: true,
  };
}

export function successToolResult(message: string, details: Record<string, unknown>) {
  return {
    content: [{ type: "text" as const, text: message }],
    details,
  };
}

const AMBIGUOUS_PARENT_PEER_TARGETS = new Set([
  "active",
  "controller",
  "current",
  "here",
  "me",
  "parent",
  "self",
  "this",
]);

const EXACT_SESSION_ID_PATTERN =
  /^session-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type ParentPeerTargetValidation =
  | { ok: true; target: string }
  | { ok: false; reason: "missing" | "ambiguous" | "not_exact_session_id"; target?: string };

export function validateParentPeerTarget(value: string | undefined): ParentPeerTargetValidation {
  const target = value?.trim();
  if (!target) return { ok: false, reason: "missing" };
  if (AMBIGUOUS_PARENT_PEER_TARGETS.has(target.toLowerCase())) {
    return { ok: false, reason: "ambiguous", target };
  }
  if (!EXACT_SESSION_ID_PATTERN.test(target)) {
    return { ok: false, reason: "not_exact_session_id", target };
  }
  return { ok: true, target };
}

export function parentPeerTargetFailureResult(
  tool: string,
  validation: Exclude<ParentPeerTargetValidation, { ok: true }>,
) {
  if (validation.reason === "ambiguous") {
    return errorToolResult(
      `${tool} defaults to intercom report-back and requires an exact parentPeerTarget. "${validation.target}" is an ambiguous alias, not a deliverable intercom target. Call intercom({ action: "status" }) or intercom({ action: "list" }) first, then pass the exact Session ID as parentPeerTarget; or explicitly set reportBack to "manual" or "none".`,
      {
        ok: false,
        tool,
        reportBack: "intercom",
        parentPeerTarget: validation.target,
        error: "invalid_parent_peer_target",
        reason: "ambiguous_parent_peer_target",
        nextStep:
          'Call intercom({ action: "status" }) in the controller session and retry with parentPeerTarget set to the exact Session ID.',
      },
    );
  }

  const reason =
    validation.reason === "not_exact_session_id"
      ? "not_exact_session_id"
      : "missing_parent_peer_target";
  return errorToolResult(
    `${tool} defaults to intercom report-back and requires parentPeerTarget so the peer can report to the exact controller session. Call intercom({ action: "status" }) or intercom({ action: "list" }) first, then pass the exact Session ID as parentPeerTarget; or explicitly set reportBack to "manual" or "none".`,
    {
      ok: false,
      tool,
      reportBack: "intercom",
      parentPeerTarget: validation.target,
      error:
        validation.reason === "not_exact_session_id"
          ? "invalid_parent_peer_target"
          : "missing_parent_peer_target",
      reason,
      nextStep:
        'Call intercom({ action: "status" }) in the controller session and retry with parentPeerTarget set to the exact Session ID.',
    },
  );
}

export function expectedPeerMessages(reportBack: SidequestReportBack): string[] {
  return reportBack === "intercom" ? ["PEER_ACK", "PEER_FINAL"] : [];
}

export function reportBackNextStep({
  reportBack,
  peerRunId,
  peerLabel,
  manualAction,
}: {
  reportBack: SidequestReportBack;
  peerRunId: string;
  peerLabel: string;
  manualAction: string;
}): string {
  if (reportBack === "intercom") {
    return `Next supervision step: intercom({ action: "peer_watch", peerRunId: "${peerRunId}", waitFor: "ack", timeoutMs: 10000 }). Also ${manualAction} if the peer does not report promptly.`;
  }

  return `Intercom report-back is disabled because reportBack is "${reportBack}"; no PEER_ACK/PEER_FINAL will be emitted, and peer_watch will have nothing to watch. Next supervision step: ${manualAction} in the visible ${peerLabel} session.`;
}

export function peerLaunchResultMessage({
  toolName,
  launchMode,
  promptSummary,
  peerRunId,
  reportBack,
  peerLabel,
  manualAction,
}: {
  toolName: string;
  launchMode: LaunchMode;
  promptSummary: string;
  peerRunId: string;
  reportBack: SidequestReportBack;
  peerLabel: string;
  manualAction: string;
}): string {
  const lines = [
    `Launched ${toolName} in ${launchMode}: ${promptSummary}`,
    `Peer run id: ${peerRunId}`,
  ];

  if (reportBack === "intercom") {
    lines.push("Expected intercom messages: PEER_ACK, PEER_FINAL");
  } else {
    lines.push(
      `Expected intercom messages: none (reportBack=${reportBack}; PEER_ACK/PEER_FINAL disabled)`,
    );
  }

  lines.push(
    reportBackNextStep({
      reportBack,
      peerRunId,
      peerLabel,
      manualAction,
    }),
  );

  return lines.join("\n");
}
