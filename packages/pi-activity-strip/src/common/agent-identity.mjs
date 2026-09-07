// ---
// summary: "recognizes terminal-based coding agents and shapes them into activity-strip session records"
// read_when:
//   - "adding an agent CLI, changing agent card fields, or changing agent title matching"
// ---

import path from "node:path";

/**
 * Terminal-based coding agents that occupy a Ghostty tab the way Pi does. Recognition is by the
 * executable name of the process that owns the terminal, never by a window title, so a tab is
 * admitted on process evidence alone.
 * @type {ReadonlyArray<{kind: string; label: string; commands: readonly string[]}>}
 */
export const AGENT_CATALOG = Object.freeze([
  { kind: "claude", label: "Claude Code", commands: Object.freeze(["claude"]) },
  { kind: "codex", label: "Codex", commands: Object.freeze(["codex"]) },
  { kind: "gemini", label: "Gemini", commands: Object.freeze(["gemini"]) },
  { kind: "amp", label: "Amp", commands: Object.freeze(["amp"]) },
  { kind: "aider", label: "Aider", commands: Object.freeze(["aider"]) },
  { kind: "opencode", label: "opencode", commands: Object.freeze(["opencode"]) },
  { kind: "crush", label: "Crush", commands: Object.freeze(["crush"]) },
  { kind: "goose", label: "Goose", commands: Object.freeze(["goose"]) },
  { kind: "cursor", label: "Cursor Agent", commands: Object.freeze(["cursor-agent"]) },
  { kind: "zcode", label: "zcode", commands: Object.freeze(["zcode"]) },
]);

/** Pi publishes its own telemetry, so its processes are never discovered this way. */
const EXCLUDED_COMMANDS = new Set(["pi", "node", "bash", "sh", "zsh", "fish", "python3"]);
/**
 * Executables that only ever host another program. When one of these is the process name, the
 * command line names the real agent, so it is worth the extra read to look.
 */
const RUNTIME_COMMANDS = [/^node/i, /^python/i, /^(bash|sh|zsh|fish|dash|env)$/i, /^(deno|bun)$/i];

/** @param {unknown} command */
export function isRuntimeCommand(command) {
  const name = path.basename(String(command ?? "").trim());
  return name.length > 0 && RUNTIME_COMMANDS.some((pattern) => pattern.test(name));
}
export const AGENT_ACTIVE_WINDOW_MS = 45_000;

/** @param {NodeJS.ProcessEnv} [env] */
export function agentCatalogFor(env = process.env) {
  const disabled = new Set(
    String(env.PI_ACTIVITY_STRIP_AGENT_KINDS_DISABLED ?? "")
      .split(",")
      .map((value) => value.trim().toLowerCase())
      .filter(Boolean),
  );
  return AGENT_CATALOG.filter((agent) => !disabled.has(agent.kind));
}

/**
 * Classify one process by the executable it runs. `command` is the kernel's comm value, which the
 * kernel truncates to 15 characters and which names the runtime rather than the agent when the
 * agent is launched through one; the command line entries name the agent in that case.
 * @param {{command?: unknown; argv0?: unknown; argv1?: unknown; env?: NodeJS.ProcessEnv}} process
 */
export function classifyAgentProcess({ command, argv0, argv1, env = process.env } = {}) {
  const names = [command, argv0, argv1]
    .map((value) => path.basename(String(value ?? "").trim()).toLowerCase())
    .filter(Boolean);
  if (names.length === 0 || names.every((name) => EXCLUDED_COMMANDS.has(name))) return null;
  for (const agent of agentCatalogFor(env)) {
    if (agent.commands.some((candidate) => names.includes(candidate))) return agent;
  }
  return null;
}

/** @param {unknown} cwd */
export function repoLabelFor(cwd) {
  const normalized = String(cwd ?? "").trim();
  if (!normalized || normalized === "/") return "";
  return path.basename(normalized);
}

/**
 * Shape one discovered agent tab into the record the card projection consumes. The record carries a
 * terminal identity, so it groups and places exactly like a Pi terminal card, but its session id is
 * namespaced by agent kind and can never be mistaken for a Pi session id.
 * @param {{
 *   kind: string;
 *   label: string;
 *   processId: number;
 *   cwd: string;
 *   terminalKey: string;
 *   terminalFamily: string;
 *   terminalSurfaceId: string;
 *   sessionKey?: string;
 *   titleSuffix?: string;
 *   startedAt: number;
 *   lastEventAt?: number;
 *   now?: number;
 *   telemetry?: Partial<import("./claude-transcript.mjs").ClaudeTelemetry> | null;
 * }} tab
 */
export function agentSessionRecord({
  kind,
  label,
  processId,
  cwd,
  terminalKey,
  terminalFamily,
  terminalSurfaceId,
  sessionKey = "",
  titleSuffix = "",
  startedAt,
  lastEventAt = 0,
  now = Date.now(),
  telemetry = null,
}) {
  // Process start times and file modification times are fractional milliseconds, while the panel
  // protocol carries whole-millisecond integers, so every timestamp is rounded at the boundary.
  const startedAtMs = Math.round(startedAt) || 0;
  const lastEventMs = Math.round(lastEventAt) || 0;
  const nowMs = Math.round(now) || 0;
  const activity = lastEventMs > 0 ? lastEventMs : startedAtMs;
  // Reported activity decides liveness. A published state only counts while the transcript is
  // still moving; a stale "tool" record is not evidence that a tool is running right now.
  const recent = lastEventMs > 0 && nowMs - lastEventMs <= AGENT_ACTIVE_WINDOW_MS;
  const reported = String(telemetry?.state ?? "");
  // "waiting" and "error" describe a session that is stopped on purpose, so they survive the
  // liveness window: a permission prompt can sit unanswered for a long time and is still true.
  const sticky = reported === "waiting" || reported === "error";
  const busy = reported === "tool" || reported === "thinking";
  const active = sticky || (recent && (busy || !reported));
  const state = sticky ? reported : active ? (busy ? reported : "thinking") : "idle";
  const toolName = active ? String(telemetry?.toolName ?? "") : "";
  const toolTarget = active ? String(telemetry?.toolTarget ?? "") : "";
  const detail = [toolTarget, String(telemetry?.assistantPreview ?? ""), cwd].find(Boolean) ?? "";
  return {
    sessionId: `agent:${kind}:${sessionKey || processId}`,
    publisherId: `agent-scan:${processId}`,
    publisherSequence: 0,
    processId,
    agentKind: kind,
    agentSessionKey: sessionKey,
    terminalKind: "ghostty-surface",
    terminalKey,
    terminalFamily,
    terminalSurfaceId,
    titleSuffix,
    cwd,
    repoLabel: repoLabelFor(cwd),
    sessionName: "",
    agentLabel: label,
    phase: String(telemetry?.title ?? "").trim() || label,
    detail,
    assistantPreview: String(telemetry?.assistantPreview ?? ""),
    toolName,
    toolTarget,
    state,
    turnIndex: Number(telemetry?.turnIndex ?? 0) || 0,
    updatedAt: nowMs,
    lastEventAt: activity,
    startedAt: startedAtMs,
    agentStartedAt: active ? activity : null,
    agentActive: active,
    lastPromptPreview: String(telemetry?.lastPrompt ?? ""),
    errorMessage: "",
  };
}
