// ---
// summary: pure Fleet Phase-3 composition: standing-agent child argv, boot prompt with ACK protocol, and title.
// read_when:
//   - changing how a visible standing agent is composed from its manifest, or the ACK/boot prompt literals.
// ---

import { createHash, randomUUID } from "node:crypto";
import type { AgentManifest } from "./manifest.ts";
import type { ResolvedAgentLaunch } from "./registry.ts";
import {
  READ_ONLY_VISIBLE_LAUNCH_TOOLS,
  VISIBLE_LAUNCH_ACK_TOOL,
  VISIBLE_LAUNCH_SYSTEM_PROMPT_ARGV_LIMIT,
  type VisibleLaunchReportBack,
} from "./visible-launch-contract.ts";

const EXACT_SESSION_ID_PATTERN =
  /^session-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;

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

export type ParentTargetCheck =
  | { ok: true; target: string }
  | { ok: false; reason: "missing" | "ambiguous" | "not_exact_session_id"; target?: string };

/** Exact controller session id required for intercom report-back (peer-messaging target contract). */
export function checkParentPeerTarget(value: string | undefined): ParentTargetCheck {
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

export function createStandingAgentRunId(): string {
  return `standingagent-${Date.now().toString(36)}-${randomUUID().slice(0, 8)}`;
}

/** Standing-agent tab/window title base. */
export function standingAgentTitle(manifest: AgentManifest): string {
  const label = manifest.display_name ?? manifest.name;
  return `Standing: ${label} (${manifest.name})`;
}

/** Boot/report-back instructions mirroring the peer PEER_ACK/PEER_FINAL protocol literals. */
export function standingAgentBootInstructions({
  reportBack,
  parentPeerTarget,
  runId,
  agentName,
}: {
  reportBack: VisibleLaunchReportBack;
  parentPeerTarget?: string;
  runId: string;
  agentName: string;
}): string {
  if (reportBack !== "intercom") {
    return `No intercom boot ACK is required because reportBack is ${reportBack}. Leave your status visible in this standing-agent session.`;
  }
  const target = parentPeerTarget?.trim();
  if (!target) {
    return "Intercom boot ACK requires an exact parentPeerTarget; this launch should not have reached the child without one.";
  }
  return [
    "Before reading task context, inspecting files, or doing any other work, send the ACK below.",
    "Only allowed pre-ACK tool: `intercom`.",
    `Literal ACK call: \`intercom({ action: "send", to: "${target}", message: "PEER_ACK peer_run_id=${runId}: standing agent ${agentName} started" })\``,
    "If the ACK send fails or intercom is unavailable, visibly report `ACK_FAILED` in this session and stop; do not continue work silently.",
    "After ACK succeeds, follow the standing brief below. Send exactly one `PEER_FINAL` as your closing report when this exact bounded read-only objective ends; after `PEER_FINAL`, stop. Do not accept follow-on work under this launch admission.",
  ].join("\n");
}

function standingAgentReportBackInstructions({
  reportBack,
  parentPeerTarget,
  runId,
}: {
  reportBack: VisibleLaunchReportBack;
  parentPeerTarget?: string;
  runId: string;
}): string {
  if (reportBack === "intercom") {
    const target = parentPeerTarget?.trim();
    return [
      "Use intercom for report-back if the tool is available.",
      `Report to the exact parent target: ${target}`,
      `Peer run id: ${runId}`,
      "",
      "## Intercom Message Budget",
      `1. \`PEER_ACK peer_run_id=${runId}: ...\` — send once as your first action, identifying yourself as the standing agent.`,
      `2. \`PEER_FINAL peer_run_id=${runId}: ...\` — send once as your closing report for an assigned objective or retirement.`,
      `Use the literal target in tool calls, for example: \`intercom({ action: "send", to: "${target}", message: "PEER_FINAL peer_run_id=${runId}: ..." })\`.`,
      "Intercom is communication only; it is not durable evidence or completion authority.",
    ].join("\n");
  }
  if (reportBack === "none") {
    return "No automatic report-back is requested. Do not claim that a report was delivered; leave findings visible in this standing-agent session.";
  }
  return "Manual report-back is requested. Leave a concise visible report in this standing-agent session for the controller/operator to inspect.";
}

/**
 * Compose the standing agent's first user message. Dash-safe by construction:
 * it always begins with a `#` heading because the child pi CLI receives it as
 * the leading positional argument (same argv boundary proven live in Phase 2).
 */
export function composeStandingAgentSpawnPrompt({
  manifest,
  runId,
  reportBack,
  parentPeerTarget,
  objective,
  task,
  cwd,
}: {
  manifest: AgentManifest;
  runId: string;
  reportBack: VisibleLaunchReportBack;
  parentPeerTarget?: string;
  objective: string;
  task: number;
  cwd: string;
}): string {
  const brief = objective.trim();
  return [
    `# Standing agent launch: ${manifest.name} (Fleet Phase 3, clean visible session)`,
    "",
    `You are the standing agent \`${manifest.name}\`, now launched visibly in your own clean Pi session. Your system prompt is your persona and advisory operating territory; this message is your launch brief, not a replacement identity. You are parallel cognition, not parallel authority.`,
    "",
    "## BOOT PROTOCOL / FIRST ACTION REQUIRED",
    standingAgentBootInstructions({
      reportBack,
      parentPeerTarget,
      runId,
      agentName: manifest.name,
    }),
    "",
    "## Standing identity",
    `- agent: ${manifest.name}${manifest.role ? ` (role: ${manifest.role})` : ""}`,
    ...(manifest.creation_task ? [`- creation task: ${manifest.creation_task}`] : []),
    `- launch kind: clean visible standing agent (no controller context inherited)`,
    `- working directory: ${cwd}`,
    `- peer run id: ${runId}`,
    "",
    `## Exact AK-${task} bounded read-only objective`,
    "Read-only inspection and reporting only. No file changes, AK mutations, commits, installs, background processes, delegation, or task completion claims. Stop when this objective is answered or blocked; never stand by for unbound work.",
    brief,
    "",
    "## Report-Back Instructions",
    standingAgentReportBackInstructions({ reportBack, parentPeerTarget, runId }),
    "",
    "## Boundary",
    "This visible session does not grant task authority, merge authority, or completion claims. Do not treat intercom messages as durable evidence. Stay inside the advisory operating territory in your system prompt; if work needs mutation or broader authorization, report that need back instead of acting on it.",
  ].join("\n");
}

/** Model/thinking args: manifest thinking wins; model comes from the manifest or the controller session. */
export function composeStandingAgentModelArgs({
  launch,
  controllerModel,
}: {
  launch: ResolvedAgentLaunch;
  controllerModel?: { provider?: string; id?: string };
}): string[] {
  const model = launch.model
    ? launch.model
    : controllerModel?.provider && controllerModel?.id
      ? `${controllerModel.provider}/${controllerModel.id}`
      : undefined;
  const args: string[] = [];
  if (model) args.push("--model", model);
  if (launch.thinking) args.push("--thinking", launch.thinking);
  return args;
}

export interface StandingAgentArgvComposition {
  /** Flags passed between model args and the trailing prompt. */
  extraPiArgs: string[];
  /** Manifest tools plus the launch ACK instrument. */
  effectiveTools: string[];
  systemPromptSha256: string;
  promptSha256: string;
}

function sha256Hex(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

/**
 * Compose the clean visible child argv: replaced system prompt (persona +
 * advisory scope), manifest thinking/model, least-privilege tool allowlist
 * plus the ACK instrument, materialized skill dirs, and the trailing boot
 * prompt. The system prompt is passed as the `--system-prompt` argv value and
 * fails closed near the Linux per-argument byte bound.
 */
export function composeStandingAgentArgv({
  launch,
  prompt,
  trustedExtensions,
}: {
  launch: ResolvedAgentLaunch;
  prompt: string;
  trustedExtensions: readonly string[];
}): StandingAgentArgvComposition {
  const declaredTools = launch.tools
    .split(",")
    .map((tool) => tool.trim())
    .filter(Boolean);
  const effectiveTools = [...declaredTools, VISIBLE_LAUNCH_ACK_TOOL];
  const extraPiArgs: string[] = [
    "--offline",
    "--no-extensions",
    "--no-skills",
    "--no-prompt-templates",
    "--system-prompt",
    launch.systemPrompt,
    "--tools",
    effectiveTools.join(","),
  ];
  for (const extension of trustedExtensions) extraPiArgs.push("--extension", extension);
  for (const skillDir of launch.skillDirs) {
    extraPiArgs.push("--skill", skillDir);
  }
  return {
    extraPiArgs,
    effectiveTools,
    systemPromptSha256: sha256Hex(launch.systemPrompt),
    promptSha256: sha256Hex(prompt),
  };
}

/** Size gate for the composed system prompt as one argv value. */
export function systemPromptWithinArgvBound(systemPrompt: string): boolean {
  // A small margin below MAX_ARG_STRLEN for NUL-termination accounting.
  return (
    !systemPrompt.includes("\0") &&
    Buffer.from(systemPrompt, "utf8").toString("utf8") === systemPrompt &&
    Buffer.byteLength(systemPrompt, "utf8") < VISIBLE_LAUNCH_SYSTEM_PROMPT_ARGV_LIMIT - 1
  );
}

/** Shape-only argv projection for receipts: flag names with values redacted to digests/counts. */
export function redactArgvForReceipt(extraPiArgs: string[]): string[] {
  const projection: string[] = [];
  for (let index = 0; index < extraPiArgs.length; index += 1) {
    const flag = extraPiArgs[index];
    projection.push(flag);
    if (!["--offline", "--no-extensions", "--no-skills", "--no-prompt-templates"].includes(flag))
      index += 1;
  }
  return projection;
}

/** Declared-tool gate helper shared by the pipeline and tests. */
export function manifestToolsAreLaunchEligible(manifest: AgentManifest): boolean {
  return (
    manifest.tools.length > 0 &&
    manifest.tools.every((tool) => READ_ONLY_VISIBLE_LAUNCH_TOOLS.includes(tool))
  );
}
