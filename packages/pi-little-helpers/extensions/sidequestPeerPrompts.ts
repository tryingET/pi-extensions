// summary: builds visible-peer boot, prompt, report-back, target-validation, and launch-result projections.
// read_when:
//   - changing fork, scout, or candidate peer prompts and report-back semantics.

import { randomUUID } from "node:crypto";
import type { CandidatePeerSafeNaming } from "../src/candidatePeerRegistry.ts";
import type {
  CandidatePeerReportBack,
  CandidatePeerSpawnRequest,
  ForkPeerSpawnRequest,
  SidequestReportBack,
  SidequestRole,
  SidequestSpawnRequest,
} from "./sidequestContracts.ts";
import {
  buildBootProtocolInstructions,
  buildReportBackInstructions,
} from "./sidequestPeerReportBack.ts";

export type CandidatePeerPromptWorktree = {
  parentCwd: string;
  repoRoot: string;
  worktreePath: string;
  branchName: string;
  baseRef: string;
  parentDirty: boolean;
  parentDirtyWarning?: string;
  reusedExisting: boolean;
  naming: CandidatePeerSafeNaming;
};

export function normalizeStringArray(value: string[] | undefined): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => String(item).trim()).filter(Boolean);
}

export function markdownList(items: string[] | undefined, emptyText = "None provided."): string {
  const normalized = normalizeStringArray(items);
  if (normalized.length === 0) return emptyText;
  return normalized.map((item) => `- ${item}`).join("\n");
}

export function contextLine(label: string, value: string | undefined): string | undefined {
  const normalized = value?.trim();
  return normalized ? `- ${label}: ${normalized}` : undefined;
}

export function normalizeSidequestRole(value: unknown): SidequestRole {
  return value === "reviewer" ? "reviewer" : "scout";
}

export function createQuestId(
  prefix: "sidequest" | "forkpeer" | "scoutpeer" | "candidatepeer",
): string {
  return `${prefix}-${Date.now().toString(36)}-${randomUUID().slice(0, 8)}`;
}

export function normalizeForkPeerReportBack(request: ForkPeerSpawnRequest): SidequestReportBack {
  if (
    request.reportBack === "intercom" ||
    request.reportBack === "manual" ||
    request.reportBack === "none"
  ) {
    return request.reportBack;
  }

  return request.parentPeerTarget?.trim() ? "intercom" : "manual";
}

export function normalizeReportBack(request: SidequestSpawnRequest): SidequestReportBack {
  if (
    request.reportBack === "intercom" ||
    request.reportBack === "manual" ||
    request.reportBack === "none"
  ) {
    return request.reportBack;
  }
  return "intercom";
}

export function buildForkPeerSpawnPrompt({
  objective,
  request,
  reportBack,
  questId,
}: {
  objective: string;
  request: ForkPeerSpawnRequest;
  reportBack: SidequestReportBack;
  questId: string;
}): string {
  return [
    "# Visible Fork Peer Prompt",
    "",
    "You are a visible fork peer launched from the controller's current Pi conversation/context. The inherited history is context, not identity: act as the spawned fork peer and report back according to this prompt. You are parallel cognition, not parallel authority.",
    "",
    "## BOOT PROTOCOL / FIRST ACTION REQUIRED",
    buildBootProtocolInstructions({
      reportBack,
      parentPeerTarget: request.parentPeerTarget,
      questId,
      peerLabel: "fork peer",
    }),
    "",
    "## Quest Protocol",
    `Peer run id: ${questId}`,
    "Message budget: at most PEER_ACK and PEER_FINAL unless the controller explicitly asks a clarifying question or assigns new work. Legacy QUEST_ACK / QUEST_FINAL remains controller-compatible but is not preferred.",
    "",
    "## Objective",
    objective,
    "",
    "## Report-Back Instructions",
    buildReportBackInstructions({
      reportBack,
      parentPeerTarget: request.parentPeerTarget,
      questId,
      peerLabel: "fork peer",
    }),
    "",
    "## Boundary",
    "This fork peer intentionally inherits the current Pi context. Do not treat intercom messages as durable evidence, task authority, merge authority, or completion truth unless the controller records them through the owning surface.",
  ].join("\n");
}

export function buildSidequestSpawnPrompt({
  role,
  objective,
  cwd,
  request,
  reportBack,
  questId,
}: {
  role: SidequestRole;
  objective: string;
  cwd: string;
  request: SidequestSpawnRequest;
  reportBack: SidequestReportBack;
  questId: string;
}): string {
  const context = request.context ?? {};
  const contextLines = [
    contextLine("Campaign goal", context.campaignGoal),
    contextLine("Primary metric", context.primaryMetric),
    contextLine("Current best", context.currentBest),
    contextLine("Blocker", context.blocker),
  ].filter((line): line is string => Boolean(line));
  const customDod = normalizeStringArray(request.dod);

  return [
    "# Visible Scout Peer Prompt",
    "",
    "You are a visible scout peer launched in a clean Pi session. If you are reading this prompt, you are the spawned scout peer, not the controller session. Identify as the scout peer in your visible response and report-back. You are parallel cognition, not parallel authority.",
    "",
    "## BOOT PROTOCOL / FIRST ACTION REQUIRED",
    buildBootProtocolInstructions({
      reportBack,
      parentPeerTarget: request.parentPeerTarget,
      questId,
      peerLabel: "scout peer",
    }),
    "",
    "## Role",
    role,
    "",
    "## Quest Protocol",
    `Peer run id: ${questId}`,
    "Message budget: at most PEER_ACK and PEER_FINAL unless the controller explicitly asks a clarifying question or assigns new work. Legacy QUEST_ACK / QUEST_FINAL remains controller-compatible but is not preferred.",
    "",
    "## Objective",
    objective,
    "",
    "## Workspace",
    `Controller/shared cwd: ${cwd}`,
    "",
    "## Campaign / Task Context",
    contextLines.length ? contextLines.join("\n") : "None provided.",
    "",
    "## Artifacts to Inspect",
    markdownList(context.artifactsToRead),
    "",
    "## Files in Scope",
    markdownList(context.filesInScope),
    "",
    "## Off-Limits",
    markdownList(context.offLimits),
    "",
    "## Constraints",
    markdownList(context.constraints),
    "",
    "## Current Findings",
    markdownList(context.currentFindings),
    "",
    "## Mutation Policy",
    "You are in the controller’s working tree. This scout peer is read-only for controller-spawned use. Do not edit files, run destructive commands, commit, revert, install dependencies, restart services, or change running model services. If a mutation seems necessary, report the exact proposed mutation back to the controller instead of applying it.",
    "",
    "Enforcement level: prompt_contract. This is not a hard sandbox yet.",
    "",
    "## Allowed Tools",
    "- `read` and bounded `bash` for inspection and non-destructive validation.",
    "- `dispatch_subagent` for one focused helper if it reduces risk.",
    "- `workflow_execute` for a small explicit plan if useful.",
    "- `intercom` for reporting back if available and requested below.",
    "",
    "Do not spawn more quest agents unless explicitly instructed.",
    "",
    "## Report-Back Instructions",
    buildReportBackInstructions({
      reportBack,
      parentPeerTarget: request.parentPeerTarget,
      questId,
      peerLabel: "scout peer",
    }),
    "",
    "## Definition of Done",
    "Return a concise report with:",
    "",
    "1. Answer or recommendation",
    "2. Evidence inspected — exact files, artifacts, commands",
    "3. Most likely root cause or key finding",
    "4. One concrete next experiment or controller action",
    "5. Expected impact",
    "6. Risks and rollback notes",
    "7. What not to try again",
    ...(customDod.length
      ? ["", "## Additional Request-Specific DoD", markdownList(customDod)]
      : []),
    "",
    "## Anti-Goals",
    "- Do not claim completion for the controller.",
    "- Do not mutate shared-cwd files; editable shared-cwd work belongs to manual `/sidequest`, not `scout_peer_spawn`.",
    "- Do not implement candidate changes here; isolated mutation belongs later in `candidate_peer_spawn`.",
    "- Do not mutate AK, orchestration state, intercom state, or autoresearch runtime authority.",
  ].join("\n");
}

export function normalizeCandidatePeerReportBack(
  request: CandidatePeerSpawnRequest,
): CandidatePeerReportBack {
  if (
    request.reportBack === "intercom" ||
    request.reportBack === "manual" ||
    request.reportBack === "none"
  ) {
    return request.reportBack;
  }
  return "intercom";
}

export function buildCandidatePeerSpawnPrompt({
  objective,
  request,
  worktree,
  reportBack,
  questId,
}: {
  objective: string;
  request: CandidatePeerSpawnRequest;
  worktree: CandidatePeerPromptWorktree;
  reportBack: CandidatePeerReportBack;
  questId: string;
}): string {
  return [
    "# Visible Candidate Peer Prompt",
    "",
    "You are a visible candidate peer launched in a clean Pi session. If you are reading this prompt, you are the spawned candidate peer, not the controller session. Identify as the candidate peer in your visible response and report-back. You are parallel cognition, not parallel authority.",
    "",
    "## BOOT PROTOCOL / FIRST ACTION REQUIRED",
    buildBootProtocolInstructions({
      reportBack,
      parentPeerTarget: request.parentPeerTarget,
      questId,
      peerLabel: "candidate peer",
    }),
    "",
    "## Quest Protocol",
    `Peer run id: ${questId}`,
    "Message budget: at most PEER_ACK and PEER_FINAL unless the controller explicitly asks a clarifying question or assigns new work. Legacy QUEST_ACK / QUEST_FINAL remains controller-compatible but is not preferred.",
    "",
    "## Objective",
    objective,
    "",
    "## Workspace Boundary",
    "You are working in an isolated git worktree.",
    "",
    `- Parent/controller cwd: ${worktree.parentCwd}`,
    `- Your worktree cwd: ${worktree.worktreePath}`,
    `- Branch: ${worktree.branchName}`,
    `- Base: ${worktree.baseRef}`,
    worktree.parentDirtyWarning ? `- Dirty-parent warning: ${worktree.parentDirtyWarning}` : "",
    "",
    "All mutations must stay inside your worktree. Do not modify the parent checkout.",
    "The controller records peer registry metadata and an archive-before-cleanup command packet for this candidate lane; treat that as cleanup guidance, not promotion authority.",
    "",
    "## Mutation Policy",
    "You may inspect, edit, and validate only inside your isolated worktree. Do not merge, push, open PRs, mutate AK, mutate controller runtime state, or claim promotion. If a required action is outside the worktree boundary, report the exact proposed controller action instead of applying it.",
    "",
    "## Files in Scope",
    markdownList(request.filesInScope),
    "",
    "## Off-Limits",
    markdownList(request.offLimits),
    "",
    "## Constraints",
    markdownList(request.constraints),
    "",
    "## Allowed Tools",
    "- `read`, `edit`, `write`, and bounded `bash` only within the worktree boundary and stated scope.",
    "- `dispatch_subagent` for one focused helper if it reduces risk.",
    "- `workflow_execute` for a small explicit plan if useful.",
    "- `intercom` for reporting back if available and requested below.",
    "",
    "Do not spawn more quest agents unless explicitly instructed.",
    "",
    "## Report-Back Instructions",
    buildReportBackInstructions({
      reportBack,
      parentPeerTarget: request.parentPeerTarget,
      questId,
      peerLabel: "candidate peer",
    }),
    "",
    "## Definition of Done",
    "Return a concise report with:",
    "",
    "1. Branch name",
    "2. Worktree path",
    "3. Files changed",
    "4. Commands run and results",
    "5. Metric/check result if applicable",
    "6. Patch summary",
    "7. Risks and rollback notes",
    "8. Recommended controller action: ignore, inspect, cherry-pick, or merge after review",
    ...(normalizeStringArray(request.dod).length
      ? ["", "## Additional Request-Specific DoD", markdownList(request.dod)]
      : []),
    "",
    "## Anti-Goals",
    "- Do not mutate the parent checkout.",
    "- Do not merge, push, open PRs, mutate AK, or claim completion/promotion authority.",
    "- Do not treat intercom or visible launch as durable evidence.",
  ].join("\n");
}
