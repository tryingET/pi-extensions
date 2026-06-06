/**
 * Self-contained handoff prompt action helpers.
 *
 * ASC can provide mirror-only handoff cues, but pi-session-compaction remains
 * the canonical owner for compaction summaries and fresh-session handoff shape.
 */

import { normalizeInput, normalizeString, normalizeStringArray } from "../edge-contract-kernel.ts";
import { analyzePatterns, queryHandoffSummary } from "../perception.ts";
import type { SelfQuery, SelfResponse, SelfState } from "../types.ts";

export function handleSelfContainedHandoffPrompt(query: SelfQuery, state: SelfState): SelfResponse {
  analyzePatterns(state.operations, state.patterns);
  const handoff = queryHandoffSummary(state.operations, state.patterns);
  const text = buildSelfContainedHandoffPrompt(query, handoff);
  const prefill = !isShowOnlyHandoffPromptQuery(query.query.toLowerCase());
  const answer = prefill
    ? `Editor prefill suggested for a self-contained handoff prompt. Copy/paste text:\n\n${text}`
    : `Self-contained handoff prompt (not prefilled):\n\n${text}`;

  return {
    understood: true,
    intent: "action",
    answer,
    data: {
      text,
      prefill,
      sendUserMessage: false,
      dispatchMode: prefill ? "operator_review_required" : "show_only",
      authority: "mirror_only",
      handoff,
    },
  };
}

function buildSelfContainedHandoffPrompt(
  query: SelfQuery,
  handoff: ReturnType<typeof queryHandoffSummary>,
): string {
  const context = normalizeInput(query.context);
  const cwd = normalizeString(context.cwd) || process.cwd();
  const gitStatus = normalizeString(context.gitStatusSummary) || normalizeString(context.gitStatus);
  const taskIds = collectKnownTaskIds(
    context,
    handoff.commands.map((command) => command.rawCommand),
  );
  const touchedPackages = collectTouchedPackages(handoff.files.map((file) => file.path));
  const sparseEvidence =
    handoff.files.length === 0 && handoff.commands.length === 0 && handoff.errors.length === 0;
  const nextMove = handoff.nextMove;

  return [
    "You are a fresh, stateless Pi coding session.",
    "",
    "Work in:",
    `\`${cwd}\``,
    "",
    "Follow all AGENTS.md instructions. Start by reading repo/package AGENTS.md and README files before editing.",
    "",
    "Current handoff (ASC self mirror-only; canonical prompt owner is pi-session-compaction)",
    `- Evidence posture: ${sparseEvidence ? "ASC mirror evidence is sparse; this can happen after reload/compaction. Read git log, AK task show/list, and session JSONL if needed before trusting absence of evidence." : "ASC mirror has session-local tracked files/commands/errors below; verify against git and AK before acting."}`,
    `- Context pressure: ${handoff.contextPressure.summary}`,
    "- Exact token/context-window telemetry: unavailable; do not invent remaining context budget.",
    `- Git status: ${gitStatus || gitStatusFallback(handoff.commands.map((command) => command.rawCommand))}`,
    `- Known AK task ids: ${taskIds.length > 0 ? taskIds.join(", ") : "none visible to ASC; run ak task ready/list/show as needed."}`,
    `- Recent touched files: ${formatTouchedFiles(handoff.files)}`,
    `- Recent commands: ${formatRecentCommands(handoff.commands)}`,
    `- Recent visible errors: ${formatErrors(handoff.errors)}`,
    `- Validation/install/reload reminders: ${buildValidationReminder(
      touchedPackages,
      handoff.commands.map((command) => command.rawCommand),
    )}`,
    `- Next suggested slice: ${nextMove ? `${nextMove.slice} via ${nextMove.owner} — ${nextMove.reason}. Suggested action: ${nextMove.prefillText}` : "none from ASC mirror; inspect git/AK/task state and choose the smallest truthful next step."}`,
    "",
    "Authority boundaries",
    "- AK + society DB remain canonical for tasks/evidence/decisions; ASC/self is a mirror only.",
    "- Git status/diff/log are code-state truth; verify before committing or closing work.",
    "- pi-session-compaction owns compaction summaries and canonical fresh-session handoff prompt shape; ASC may provide mirror-only cues but must not become the canonical compaction engine.",
    "- Prompt Vault, ROCS/ontology, agent_vent, and FCOS/control-board state must stay on their owning surfaces.",
    "- Do not treat stale candidate packets, autoresearch artifacts, or session mirror data as live worktrees/branches without owner-surface verification.",
    "",
    "Suggested startup commands",
    "```bash",
    "git status --short",
    taskIds.length > 0 ? `ak task show ${taskIds[0]}` : "ak task ready",
    "ak task list --status pending",
    "```",
  ].join("\n");
}

export function isSelfContainedHandoffPromptQuery(lower: string): boolean {
  return (
    lower.includes("compaction handoff prompt") ||
    lower.includes("fresh session handoff prompt") ||
    lower.includes("fresh-session handoff prompt") ||
    lower.includes("self-contained handoff prompt") ||
    /(?:create|prefill|show)\b[\s\S]{0,60}\bhandoff prompt\b/.test(lower)
  );
}

function isShowOnlyHandoffPromptQuery(lower: string): boolean {
  return lower.includes("show") || lower.includes("no prefill") || lower.includes("do not prefill");
}

function collectKnownTaskIds(context: Record<string, unknown>, commands: string[]): string[] {
  const ids = new Set<string>();
  for (const key of ["taskId", "currentTaskId", "akTaskId"]) {
    const value = normalizeString(context[key]);
    if (value) ids.add(stripTaskPrefix(value));
  }
  for (const value of normalizeStringArray(context.taskIds) ?? []) {
    ids.add(stripTaskPrefix(value));
  }
  for (const command of commands) {
    const taskMatch = command.match(
      /\bak\s+task\s+(?:show|claim|complete|close|done|finish|update|reopen|start)\s+(?:AK-|#)?(\d{2,})\b/i,
    );
    if (taskMatch?.[1]) ids.add(taskMatch[1]);

    const evidenceMatch = command.match(
      /\bak\s+evidence\s+record\b[\s\S]*?--task\s+(?:AK-|#)?(\d{2,})\b/i,
    );
    if (evidenceMatch?.[1]) ids.add(evidenceMatch[1]);
  }
  return [...ids].filter((id) => /^\d+$/.test(id));
}

function stripTaskPrefix(value: string): string {
  return value.replace(/^AK-/i, "").replace(/^#/, "").trim();
}

function collectTouchedPackages(paths: string[]): string[] {
  const packages = new Set<string>();
  for (const filePath of paths) {
    const match = filePath.match(/^packages\/([^/]+)/);
    if (match?.[1]) packages.add(match[1]);
  }
  return [...packages];
}

function gitStatusFallback(commands: string[]): string {
  return commands.some((command) => /^git\s+status\b/i.test(command.trim()))
    ? "git status was run, but ASC does not store stdout; rerun git status --short in the fresh session."
    : "unknown to ASC; run git status --short.";
}

function formatTouchedFiles(files: ReturnType<typeof queryHandoffSummary>["files"]): string {
  if (files.length === 0) return "none tracked by ASC mirror";
  return files
    .slice(0, 10)
    .map(
      (file) =>
        `${file.path} (${file.lastOp}, ${file.ops} op${file.ops === 1 ? "" : "s"}, Δ${file.netLinesDelta})`,
    )
    .join("; ");
}

function formatRecentCommands(
  commands: ReturnType<typeof queryHandoffSummary>["commands"],
): string {
  if (commands.length === 0) return "none tracked by ASC mirror";
  return commands
    .map((command) => `${command.success ? "ok" : "failed"}: ${command.rawCommand}`)
    .join("; ");
}

function formatErrors(errors: ReturnType<typeof queryHandoffSummary>["errors"]): string {
  if (errors.length === 0) return "none tracked by ASC mirror";
  return errors
    .map(
      (error) =>
        `${error.tool}:${error.signature} (${error.activeCount} active/${error.count} total)`,
    )
    .join("; ");
}

function buildValidationReminder(touchedPackages: string[], commands: string[]): string {
  const reminders: string[] = [];
  const successfulChecks = commands.filter((command) =>
    /\bnpm\b[\s\S]*\brun\s+(?:check|docs:list)\b/i.test(command),
  );
  for (const packageName of touchedPackages) {
    reminders.push(`run npm --prefix packages/${packageName} run check`);
    reminders.push(
      `run npm --prefix packages/${packageName} run docs:list if package docs changed`,
    );
    reminders.push(
      `if live Pi behavior changed, pi install /absolute/path/to/packages/${packageName} and ask operator to /reload`,
    );
  }
  if (successfulChecks.length > 0) {
    reminders.push(`recent package check/docs command(s) visible: ${successfulChecks.join("; ")}`);
  }
  if (commands.some((command) => /^pi\s+install\b/i.test(command.trim()))) {
    reminders.push(
      "pi install command visible; verify operator /reload happened before relying on live behavior",
    );
  }
  reminders.push("run git diff --check before commit");
  return reminders.join("; ");
}
