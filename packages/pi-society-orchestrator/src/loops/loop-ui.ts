// ---
// summary: "Loop run tree parsing, rendering, activation helpers, and operator command registration."
// read_when:
//   - "Changing loop command messages, tree UI, invocation adapters, or checkpoint inspection."
// ---

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type { ExtensionAPI, ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import { type Component, matchesKey, truncateToWidth } from "@earendil-works/pi-tui";
import type { LoopPlugin } from "./contracts.ts";
import { BUILT_IN_PLUGINS } from "./plugins.ts";
import { LoopRunCheckpointStore } from "./run-checkpoint.ts";

export type LoopTreePhaseStatus = {
  phase: string;
  status: string;
  sessionName?: string;
  statusPath?: string;
  exitCode?: number;
  elapsed?: number;
  resultPreview?: string;
  updatedAt?: string;
  createdAt?: string;
  parentRepoRoot?: string;
};

export type LoopTreeRun = {
  sessionId: string;
  loop: string;
  objective: string;
  status: "running" | "done" | "failed" | "partial";
  currentPhase?: string;
  startedAt?: string;
  updatedAt?: string;
  phases: LoopTreePhaseStatus[];
};

export type LoopTreeSnapshot = {
  generatedAt: string;
  sessionsDir: string;
  runs: LoopTreeRun[];
};

type ParsedLoopStatusRecord = LoopTreePhaseStatus & {
  loop: string;
  loopSessionId: string;
  objective: string;
  statusPath: string;
  sessionName: string;
};

function defaultLoopSessionsDir(): string {
  return path.join(os.homedir(), ".pi", "agent", "sessions", "loops");
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function stringField(record: Record<string, unknown>, key: string): string | undefined {
  const value = record[key];
  return typeof value === "string" && value.trim() ? value : undefined;
}

function numberField(record: Record<string, unknown>, key: string): number | undefined {
  const value = record[key];
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function extractLoopObjective(objective: string): string {
  const match = /(?:^|\n)## Objective\n([\s\S]*?)(?=\n## [^\n]+|$)/.exec(objective);
  return (match?.[1] || objective).trim();
}

export function parseLoopStatusRecord(
  statusPath: string,
  raw: string,
): ParsedLoopStatusRecord | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }

  const record = asRecord(parsed);
  if (!record) return null;

  const objective = stringField(record, "objective") || "";
  const loop = /(?:^|\n)# Loop:\s*([^\n]+)/i.exec(objective)?.[1]?.trim().toLowerCase();
  const phase = /(?:^|\n)## Phase:\s*([^\n]+)/i.exec(objective)?.[1]?.trim();
  const loopSessionId = /(?:^|\n)## Session:\s*([^\n]+)/i.exec(objective)?.[1]?.trim();
  if (!loop || !phase || !loopSessionId) return null;

  return {
    loop,
    phase,
    loopSessionId,
    objective: extractLoopObjective(objective),
    status: stringField(record, "status") || "unknown",
    sessionName: stringField(record, "sessionName") || path.basename(statusPath, ".status.json"),
    statusPath,
    exitCode: numberField(record, "exitCode"),
    elapsed: numberField(record, "elapsed"),
    resultPreview: stringField(record, "resultPreview"),
    updatedAt: stringField(record, "updatedAt"),
    createdAt: stringField(record, "createdAt"),
    parentRepoRoot: stringField(record, "parentRepoRoot"),
  };
}

function phaseOrderFor(loop: string, plugins: Record<string, LoopPlugin>): string[] {
  return plugins[loop]?.phases || [];
}

function compareIsoLike(a?: string, b?: string): number {
  return (Date.parse(a || "") || 0) - (Date.parse(b || "") || 0);
}

function timestampFromLoopSessionId(sessionId: string): string | undefined {
  const millis = /-(\d{11,})$/.exec(sessionId)?.[1];
  if (!millis) return undefined;
  const parsed = Number.parseInt(millis, 10);
  if (!Number.isFinite(parsed)) return undefined;
  const date = new Date(parsed);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

function firstTimestamp(records: ParsedLoopStatusRecord[]): string | undefined {
  return records
    .map((record) => record.createdAt || record.updatedAt)
    .filter((value): value is string => Boolean(value))
    .sort(compareIsoLike)[0];
}

function formatTimestamp(value?: string): string {
  const parsed = Date.parse(value || "");
  if (!Number.isFinite(parsed)) return "";
  return `${new Date(parsed).toISOString().slice(0, 19).replace("T", " ")}Z`;
}

export function buildLoopTreeSnapshotFromStatusRecords(
  records: ParsedLoopStatusRecord[],
  sessionsDir = defaultLoopSessionsDir(),
  plugins: Record<string, LoopPlugin> = BUILT_IN_PLUGINS,
): LoopTreeSnapshot {
  const grouped = new Map<string, ParsedLoopStatusRecord[]>();
  for (const record of records) {
    const key = `${record.loop}:${record.loopSessionId}`;
    const group = grouped.get(key) || [];
    group.push(record);
    grouped.set(key, group);
  }

  const runs: LoopTreeRun[] = [...grouped.values()].map((group) => {
    group.sort((a, b) => compareIsoLike(a.updatedAt || a.createdAt, b.updatedAt || b.createdAt));
    const first = group[0];
    const latestByPhase = new Map<string, ParsedLoopStatusRecord>();
    for (const record of group) {
      const previous = latestByPhase.get(record.phase);
      if (!previous || compareIsoLike(previous.updatedAt, record.updatedAt) <= 0) {
        latestByPhase.set(record.phase, record);
      }
    }

    const knownOrder = phaseOrderFor(first.loop, plugins);
    const discoveredPhases = group.map((record) => record.phase);
    const phasesInOrder = [
      ...knownOrder,
      ...discoveredPhases.filter((phase) => !knownOrder.includes(phase)),
    ].filter((phase, index, phases) => phases.indexOf(phase) === index);

    const phases: LoopTreePhaseStatus[] = phasesInOrder.map((phase) => {
      const record = latestByPhase.get(phase);
      if (record) {
        return {
          phase: record.phase,
          status: record.status,
          sessionName: record.sessionName,
          statusPath: record.statusPath,
          exitCode: record.exitCode,
          elapsed: record.elapsed,
          resultPreview: record.resultPreview,
          updatedAt: record.updatedAt,
          createdAt: record.createdAt,
          parentRepoRoot: record.parentRepoRoot,
        };
      }
      return { phase, status: "pending" };
    });

    const runningPhase = phases.find((phase) => phase.status === "running");
    const completedOrStartedPhases = phases.filter((phase) => phase.status !== "pending");
    const startedAt = firstTimestamp(group) || timestampFromLoopSessionId(first.loopSessionId);
    const latestPhase = completedOrStartedPhases.at(-1);
    const failedPhase = phases.find((phase) =>
      ["error", "timeout", "aborted"].includes(phase.status),
    );
    const status = runningPhase
      ? "running"
      : failedPhase
        ? "failed"
        : phases.length > 0 && phases.every((phase) => phase.status === "done")
          ? "done"
          : "partial";

    return {
      sessionId: first.loopSessionId,
      loop: first.loop,
      objective: first.objective,
      status,
      currentPhase: runningPhase?.phase || latestPhase?.phase || phases[0]?.phase,
      startedAt,
      updatedAt: group.at(-1)?.updatedAt || group.at(-1)?.createdAt || startedAt,
      phases,
    };
  });

  runs.sort((a, b) => compareIsoLike(b.updatedAt, a.updatedAt));
  return { generatedAt: new Date().toISOString(), sessionsDir, runs };
}

export function loadLoopTreeSnapshot(
  sessionsDir = defaultLoopSessionsDir(),
  plugins: Record<string, LoopPlugin> = BUILT_IN_PLUGINS,
): LoopTreeSnapshot {
  const records: ParsedLoopStatusRecord[] = [];
  if (fs.existsSync(sessionsDir)) {
    for (const name of fs.readdirSync(sessionsDir)) {
      if (!name.endsWith(".status.json")) continue;
      const statusPath = path.join(sessionsDir, name);
      const parsed = parseLoopStatusRecord(statusPath, fs.readFileSync(statusPath, "utf-8"));
      if (parsed) records.push(parsed);
    }
  }
  return buildLoopTreeSnapshotFromStatusRecords(records, sessionsDir, plugins);
}

export function buildLoopExecuteInvocation(loop: string, objective: string): string {
  return `loop_execute({ loop: ${JSON.stringify(loop)}, objective: ${JSON.stringify(objective)} })`;
}

export function buildVaultExecuteTemplateInvocation(
  templateName: string,
  objective: string,
): string {
  return `vault_execute_template({ template_name: ${JSON.stringify(templateName)}, objective: ${JSON.stringify(objective)} })`;
}

export interface DispatchToolActivationResult {
  ok: boolean;
  requiredTools: string[];
  missingTools: string[];
  activatedTools: string[];
  activeTools: string[];
}

export function ensureToolsActiveForDispatch(
  pi: ExtensionAPI,
  toolNames: string[],
): DispatchToolActivationResult {
  const requiredTools = [...new Set(toolNames)];
  const allToolNames = new Set(pi.getAllTools().map((tool) => tool.name));
  const missingTools = requiredTools.filter((name) => !allToolNames.has(name));
  if (missingTools.length > 0) {
    return {
      ok: false,
      requiredTools,
      missingTools,
      activatedTools: [],
      activeTools: pi.getActiveTools(),
    };
  }

  const activeTools = pi.getActiveTools();
  const activeToolNames = new Set(activeTools);
  const activatedTools = requiredTools.filter((name) => !activeToolNames.has(name));
  if (activatedTools.length === 0) {
    return { ok: true, requiredTools, missingTools: [], activatedTools, activeTools };
  }

  const nextActiveTools = [...activeTools, ...activatedTools];
  pi.setActiveTools(nextActiveTools);
  return {
    ok: true,
    requiredTools,
    missingTools: [],
    activatedTools,
    activeTools: nextActiveTools,
  };
}

interface CommandToolDispatchOptions {
  commandName: string;
  invocation: string;
  requiredTools: string[];
  notifyDispatch: string;
  notifyDispatchQueued?: string;
}

async function dispatchToolInvocationFromCommand(
  pi: ExtensionAPI,
  ctx: ExtensionCommandContext,
  options: CommandToolDispatchOptions,
): Promise<boolean> {
  const activation = ensureToolsActiveForDispatch(pi, options.requiredTools);
  if (!activation.ok) {
    ctx.ui.notify(
      `Cannot dispatch ${options.commandName}; required tool(s) are not registered: ${activation.missingTools.join(", ")}. Install/enable the owning extension and /reload.`,
      "error",
    );
    return false;
  }

  if (activation.activatedTools.length > 0) {
    ctx.ui.notify(
      `Activated required tool(s) for ${options.commandName}: ${activation.activatedTools.join(", ")}`,
      "info",
    );
  }

  const isIdle = ctx.isIdle();
  ctx.ui.notify(
    isIdle ? options.notifyDispatch : (options.notifyDispatchQueued ?? options.notifyDispatch),
    "info",
  );
  await pi.sendUserMessage(options.invocation, isIdle ? undefined : { deliverAs: "followUp" });
  return true;
}

type SessionTextEntry = {
  type?: string;
  message?: {
    role?: string;
    content?: unknown;
  };
};

type TextContentBlock = {
  type?: string;
  text?: string;
};

function extractSessionText(content: unknown): string {
  if (typeof content === "string") return content.trim();
  if (!Array.isArray(content)) return "";

  return content
    .flatMap((part) => {
      if (!part || typeof part !== "object") return [];
      const block = part as TextContentBlock;
      return block.type === "text" && typeof block.text === "string" ? [block.text] : [];
    })
    .join("\n")
    .trim();
}

const ABOVE_REFERENCE_PATTERN = /^(?:the\s+above|above|that|this|previous|last|last\s+output)$/i;
const TRANSCENDENT_ITERATION_PREVIEW_PATTERN = /^\s*\$\$\/transcendent-iteration(?:\s+(.*))?\s*$/i;
const MAX_INFERRED_OBJECTIVE_CHARS = 12_000;

export function parseTranscendentIterationPreviewInput(text: string): string | null {
  const match = TRANSCENDENT_ITERATION_PREVIEW_PATTERN.exec(text);
  if (!match) return null;
  return (match[1] || "").trim();
}

export function resolveTranscendentIterationObjective(
  args: string,
  entries: SessionTextEntry[],
): { ok: true; objective: string; inferred: boolean } | { ok: false; reason: string } {
  const trimmed = args.trim();
  if (trimmed && !ABOVE_REFERENCE_PATTERN.test(trimmed)) {
    return { ok: true, objective: trimmed, inferred: false };
  }

  for (const entry of [...entries].reverse()) {
    if (entry.type !== "message" || entry.message?.role !== "assistant") continue;
    const text = extractSessionText(entry.message.content);
    if (!text) continue;
    const boundedText =
      text.length > MAX_INFERRED_OBJECTIVE_CHARS
        ? `${text.slice(0, MAX_INFERRED_OBJECTIVE_CHARS)}\n\n[truncated: previous assistant output exceeded ${MAX_INFERRED_OBJECTIVE_CHARS} characters]`
        : text;
    return {
      ok: true,
      inferred: true,
      objective: `Apply Transcendent Iteration v4 to the immediately preceding assistant output.\n\n${boundedText}`,
    };
  }

  return { ok: false, reason: "No previous assistant output found to use as the objective." };
}

type LoopTreeDisplayRow =
  | { kind: "run"; run: LoopTreeRun; searchText: string }
  | { kind: "phase"; run: LoopTreeRun; phase: LoopTreePhaseStatus; searchText: string };

type KeybindingsLike = {
  matches?: (data: string, action: string) => boolean;
};

function summarizeObjective(value: string, maxChars = 120): string {
  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized.length > maxChars ? `${normalized.slice(0, maxChars - 1)}…` : normalized;
}

function formatElapsed(ms?: number): string {
  if (typeof ms !== "number" || !Number.isFinite(ms) || ms < 0) return "";
  const seconds = Math.round(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return `${minutes}m${remainder.toString().padStart(2, "0")}s`;
}

function phaseStatusIcon(status: string): string {
  switch (status) {
    case "done":
      return "✓";
    case "running":
      return "▶";
    case "pending":
      return "○";
    case "timeout":
      return "⏱";
    case "aborted":
      return "■";
    case "error":
      return "✗";
    default:
      return "?";
  }
}

function rowSearchText(row: LoopTreeDisplayRow): string {
  return row.kind === "run"
    ? [
        row.run.loop,
        row.run.sessionId,
        row.run.status,
        row.run.currentPhase,
        row.run.startedAt,
        row.run.updatedAt,
        row.run.objective,
      ]
        .filter(Boolean)
        .join(" ")
    : [
        row.run.loop,
        row.run.sessionId,
        row.phase.phase,
        row.phase.status,
        row.phase.sessionName,
        row.phase.resultPreview,
      ]
        .filter(Boolean)
        .join(" ");
}

function flattenLoopTreeRows(snapshot: LoopTreeSnapshot): LoopTreeDisplayRow[] {
  const rows: LoopTreeDisplayRow[] = [];
  for (const run of snapshot.runs) {
    rows.push({ kind: "run", run, searchText: "" });
    for (const phase of run.phases) rows.push({ kind: "phase", run, phase, searchText: "" });
  }
  return rows.map((row) => ({ ...row, searchText: rowSearchText(row).toLowerCase() }));
}

export function renderLoopTreeSnapshotText(snapshot: LoopTreeSnapshot): string {
  const lines = [
    "# Loop Runs",
    "",
    `generated_at: ${snapshot.generatedAt}`,
    `sessions_dir: ${snapshot.sessionsDir}`,
  ];

  if (snapshot.runs.length === 0) {
    lines.push("", "No loop runs found.");
    return lines.join("\n");
  }

  for (const run of snapshot.runs) {
    const current = run.currentPhase ? ` ${run.currentPhase}` : "";
    const started = formatTimestamp(run.startedAt);
    const updated = formatTimestamp(run.updatedAt);
    lines.push("", `## ${run.loop.toUpperCase()} ${run.sessionId} — ${run.status}${current}`);
    lines.push(
      `started: ${started || "unknown"}${updated && updated !== started ? `  updated: ${updated}` : ""}`,
    );
    const objective = summarizeObjective(run.objective, 240);
    if (objective) lines.push(`objective: ${objective}`);

    for (const phase of run.phases) {
      const elapsed = formatElapsed(phase.elapsed);
      const suffix = [phase.sessionName, elapsed].filter(Boolean).join("  ");
      lines.push(
        `- ${phaseStatusIcon(phase.status)} ${phase.phase}: ${phase.status}${suffix ? `  ${suffix}` : ""}`,
      );
    }
  }

  return lines.join("\n");
}

class LoopTreeSelectorComponent implements Component {
  private readonly loadSnapshot: () => LoopTreeSnapshot;
  private readonly maxVisibleLines: number;
  private readonly keybindings: KeybindingsLike;
  private readonly done: () => void;
  private readonly requestRender: () => void;
  private snapshot: LoopTreeSnapshot;
  private rows: LoopTreeDisplayRow[];
  private selectedIndex = 0;
  private searchQuery = "";
  private loopFilter = "all";
  private expanded = false;
  private closed = false;

  constructor(
    loadSnapshot: () => LoopTreeSnapshot,
    maxVisibleLines: number,
    keybindings: KeybindingsLike,
    done: () => void,
    requestRender: () => void = () => {},
  ) {
    this.loadSnapshot = loadSnapshot;
    this.maxVisibleLines = maxVisibleLines;
    this.keybindings = keybindings;
    this.done = done;
    this.requestRender = requestRender;
    this.snapshot = this.loadSnapshot();
    this.rows = flattenLoopTreeRows(this.snapshot);
    this.selectedIndex = this.findInitialSelection();
  }

  invalidate(): void {}

  render(width: number): string[] {
    const filteredRows = this.filteredRows();
    const lines = [
      "",
      "  Loop Tree",
      "  ↑/↓: move. Enter: details. l: loop kind. r: refresh. Backspace: edit filter. Esc/q/Ctrl-C: close.",
      `  Loop kind: ${this.loopFilter}  (${this.availableLoopKinds().join(" | ") || "none"})`,
      this.searchQuery ? `  Filter: ${this.searchQuery}` : "  Filter: (type to search)",
      "",
    ];

    if (filteredRows.length === 0) {
      lines.push("  No loop runs found.");
      lines.push(`  sessions: ${this.snapshot.sessionsDir}`);
      return lines.map((line) => truncateToWidth(line, width));
    }

    const selectedRow = filteredRows[this.selectedIndex];
    const startIndex = Math.max(
      0,
      Math.min(
        this.selectedIndex - Math.floor(this.maxVisibleLines / 2),
        filteredRows.length - this.maxVisibleLines,
      ),
    );
    const endIndex = Math.min(startIndex + this.maxVisibleLines, filteredRows.length);

    for (let index = startIndex; index < endIndex; index++) {
      const row = filteredRows[index];
      const cursor = index === this.selectedIndex ? "› " : "  ";
      lines.push(cursor + this.formatRow(row));
    }

    lines.push("");
    lines.push(
      `  (${this.selectedIndex + 1}/${filteredRows.length}) generated ${this.snapshot.generatedAt}`,
    );

    if (this.expanded && selectedRow) {
      lines.push("");
      lines.push(...this.formatDetails(selectedRow));
    }

    return lines.map((line) => truncateToWidth(line, width));
  }

  handleInput(keyData: string): void {
    if (this.closed) return;

    const filteredRows = this.filteredRows();
    let changed = true;
    if (this.isCloseKey(keyData)) {
      this.close();
      return;
    }

    if (this.keyMatches(keyData, "tui.select.up") || matchesKey(keyData, "up")) {
      this.selectedIndex = filteredRows.length
        ? (this.selectedIndex - 1 + filteredRows.length) % filteredRows.length
        : 0;
    } else if (this.keyMatches(keyData, "tui.select.down") || matchesKey(keyData, "down")) {
      this.selectedIndex = filteredRows.length ? (this.selectedIndex + 1) % filteredRows.length : 0;
    } else if (this.keyMatches(keyData, "tui.select.confirm") || matchesKey(keyData, "enter")) {
      this.expanded = !this.expanded;
    } else if (
      this.keyMatches(keyData, "tui.editor.deleteCharBackward") ||
      matchesKey(keyData, "backspace")
    ) {
      this.searchQuery = this.searchQuery.slice(0, -1);
      this.selectedIndex = 0;
    } else if (keyData === "r" || keyData === "R") {
      this.refresh();
    } else if (keyData === "l" || keyData === "L") {
      this.cycleLoopFilter();
      this.selectedIndex = this.findInitialSelection();
    } else if (this.isPrintableText(keyData)) {
      this.searchQuery += keyData;
      this.selectedIndex = 0;
    } else {
      changed = false;
    }

    if (changed) this.requestRender();
  }

  private refresh(): void {
    const selected = this.filteredRows()[this.selectedIndex];
    const selectedKey = selected ? this.rowKey(selected) : undefined;
    this.snapshot = this.loadSnapshot();
    this.rows = flattenLoopTreeRows(this.snapshot);
    const refreshedRows = this.filteredRows();
    const refreshedIndex = selectedKey
      ? refreshedRows.findIndex((row) => this.rowKey(row) === selectedKey)
      : -1;
    this.selectedIndex = refreshedIndex >= 0 ? refreshedIndex : this.findInitialSelection();
  }

  private findInitialSelection(): number {
    const rows = this.filteredRows();
    const runningIndex = rows.findIndex(
      (row) => row.kind === "phase" && row.phase.status === "running",
    );
    if (runningIndex >= 0) return runningIndex;
    return rows.length > 0 ? 0 : 0;
  }

  private filteredRows(): LoopTreeDisplayRow[] {
    const query = this.searchQuery.trim().toLowerCase();
    const tokens = query.split(/\s+/).filter(Boolean);
    return this.rows.filter((row) => {
      if (this.loopFilter !== "all" && row.run.loop !== this.loopFilter) return false;
      return tokens.every((token) => row.searchText.includes(token));
    });
  }

  private availableLoopKinds(): string[] {
    return [...new Set(this.rows.map((row) => row.run.loop))].sort();
  }

  private cycleLoopFilter(): void {
    const options = ["all", ...this.availableLoopKinds()];
    const current = options.indexOf(this.loopFilter);
    this.loopFilter = options[(current + 1) % options.length] || "all";
  }

  private keyMatches(keyData: string, action: string): boolean {
    try {
      return this.keybindings.matches?.(keyData, action) === true;
    } catch {
      return false;
    }
  }

  private isCloseKey(keyData: string): boolean {
    return (
      this.keyMatches(keyData, "tui.select.cancel") ||
      matchesKey(keyData, "escape") ||
      matchesKey(keyData, "ctrl+c") ||
      matchesKey(keyData, "ctrl+d") ||
      keyData === "q" ||
      keyData === "Q"
    );
  }

  private close(): void {
    if (this.closed) return;
    this.closed = true;
    this.done();
  }

  private isPrintableText(value: string): boolean {
    if (!value) return false;
    return [...value].every((char) => {
      const code = char.charCodeAt(0);
      return code >= 32 && code !== 127 && !(code >= 0x80 && code <= 0x9f);
    });
  }

  private rowKey(row: LoopTreeDisplayRow): string {
    return row.kind === "run"
      ? `run:${row.run.loop}:${row.run.sessionId}`
      : `phase:${row.run.loop}:${row.run.sessionId}:${row.phase.phase}`;
  }

  private formatRow(row: LoopTreeDisplayRow): string {
    if (row.kind === "run") {
      const current = row.run.currentPhase ? ` ${row.run.currentPhase}` : "";
      const started = formatTimestamp(row.run.startedAt) || "unknown date";
      return `${row.run.loop.toUpperCase()} ${started}  ${row.run.sessionId}  ${row.run.status}${current}`;
    }

    const phaseIndex = row.run.phases.findIndex((phase) => phase.phase === row.phase.phase);
    const isLast = phaseIndex === row.run.phases.length - 1;
    const connector = isLast ? "└─" : "├─";
    const elapsed = formatElapsed(row.phase.elapsed);
    const suffix = [row.phase.sessionName, elapsed].filter(Boolean).join("  ");
    return `  ${connector} ${phaseStatusIcon(row.phase.status)} ${row.phase.phase.padEnd(14)} ${row.phase.status}${suffix ? `  ${suffix}` : ""}`;
  }

  private formatDetails(row: LoopTreeDisplayRow): string[] {
    if (row.kind === "run") {
      return [
        `  run: ${row.run.loop}/${row.run.sessionId}`,
        `  status: ${row.run.status}`,
        `  current: ${row.run.currentPhase || "(none)"}`,
        `  started: ${formatTimestamp(row.run.startedAt) || "unknown"}`,
        `  updated: ${formatTimestamp(row.run.updatedAt) || "unknown"}`,
        `  objective: ${summarizeObjective(row.run.objective, 240)}`,
      ];
    }

    return [
      `  phase: ${row.phase.phase}`,
      `  status: ${row.phase.status}`,
      `  child: ${row.phase.sessionName || "(pending)"}`,
      `  elapsed: ${formatElapsed(row.phase.elapsed) || "(none)"}`,
      `  preview: ${row.phase.resultPreview || "(none)"}`,
      `  status file: ${row.phase.statusPath || "(pending)"}`,
    ];
  }
}

// ============================================================================
// COMMAND REGISTRATION
// ============================================================================

export function registerLoopCommands(
  pi: ExtensionAPI,
  plugins: Record<string, LoopPlugin> = BUILT_IN_PLUGINS,
): void {
  pi.on("input", async (event, ctx) => {
    if (event.source === "extension") return { action: "continue" };

    const previewArgs = parseTranscendentIterationPreviewInput(event.text);
    if (previewArgs === null) return { action: "continue" };

    const objectiveResult = resolveTranscendentIterationObjective(
      previewArgs,
      ctx.sessionManager.getBranch() as SessionTextEntry[],
    );
    if (!objectiveResult.ok) {
      if (ctx.hasUI) {
        ctx.ui.notify(
          `${objectiveResult.reason} Usage: $$/transcendent-iteration [objective|above]`,
          "warning",
        );
      }
      return { action: "handled" };
    }

    const invocation = buildVaultExecuteTemplateInvocation(
      "transcendent-iteration",
      objectiveResult.objective,
    );
    if (ctx.hasUI) {
      ctx.ui.setEditorText(invocation);
      ctx.ui.notify(
        objectiveResult.inferred
          ? "Prepared Transcendent Iteration v4 from the previous assistant output. Review/edit, then press Enter."
          : "Prepared Transcendent Iteration v4. Review/edit, then press Enter.",
        "info",
      );
      return { action: "handled" };
    }

    return { action: "transform", text: invocation };
  });

  pi.registerCommand("loop", {
    description: "Execute a loop: /loop <type> <objective>",
    handler: async (args, ctx) => {
      if (!ctx.hasUI) return;

      const parts = (args || "").trim().split(/\s+/);
      if (parts.length < 2) {
        ctx.ui.notify(
          `Usage: /loop <type> <objective>\n\nAvailable: ${Object.keys(plugins).join(", ")}`,
          "warning",
        );
        return;
      }

      const loopType = parts[0];
      const objective = parts.slice(1).join(" ");

      if (loopType === "mito") {
        ctx.ui.notify(
          "The `mito` loop name was retired because it collided with Prof. Binner's MITO. Use `strategic` instead.",
          "error",
        );
        ctx.ui.setEditorText(buildLoopExecuteInvocation("strategic", objective));
        return;
      }

      const plugin = plugins[loopType];
      if (!plugin) {
        ctx.ui.notify(
          `Unknown loop: ${loopType}. Available: ${Object.keys(plugins).join(", ")}`,
          "error",
        );
        return;
      }

      await dispatchToolInvocationFromCommand(pi, ctx, {
        commandName: `/loop ${loopType}`,
        invocation: buildLoopExecuteInvocation(loopType, objective),
        requiredTools: ["loop_execute"],
        notifyDispatch: `Dispatching ${loopType.toUpperCase()} loop through loop_execute...`,
        notifyDispatchQueued: `Queued ${loopType.toUpperCase()} loop through loop_execute after the current turn...`,
      });
    },
  });

  pi.registerCommand("transcendent-iteration", {
    description: "Dispatch Transcendent Iteration v4 through the governed orchestrator binding",
    handler: async (args, ctx) => {
      if (!ctx.hasUI) return;

      const objectiveResult = resolveTranscendentIterationObjective(
        args || "",
        ctx.sessionManager.getBranch() as SessionTextEntry[],
      );
      if (!objectiveResult.ok) {
        ctx.ui.notify(
          `${objectiveResult.reason} Usage: /transcendent-iteration <objective>`,
          "warning",
        );
        return;
      }
      const { objective } = objectiveResult;

      await dispatchToolInvocationFromCommand(pi, ctx, {
        commandName: "/transcendent-iteration",
        invocation: buildVaultExecuteTemplateInvocation("transcendent-iteration", objective),
        requiredTools: ["vault_execute_template", "loop_execute"],
        notifyDispatch: objectiveResult.inferred
          ? "Dispatching Transcendent Iteration v4 on the previous assistant output..."
          : "Dispatching Transcendent Iteration v4 through vault_execute_template...",
        notifyDispatchQueued: objectiveResult.inferred
          ? "Queued Transcendent Iteration v4 on the previous assistant output after the current turn..."
          : "Queued Transcendent Iteration v4 through vault_execute_template after the current turn...",
      });
    },
  });

  pi.registerCommand("loop-tree", {
    description:
      "Show loop runs in a /tree-like editor-area navigator. Use /loop-runs for a non-interactive snapshot.",
    handler: async (args, ctx) => {
      if (!ctx.hasUI) return;

      const snapshot = () => loadLoopTreeSnapshot(defaultLoopSessionsDir(), plugins);
      if (["--text", "text", "snapshot"].includes((args || "").trim().toLowerCase())) {
        await ctx.ui.editor("Loop Runs", renderLoopTreeSnapshotText(snapshot()));
        return;
      }

      ctx.ui.notify(
        "Loop Tree opened. Close with Esc, q, Ctrl-C, or Ctrl-D; use /loop-runs for a safe snapshot.",
        "info",
      );
      try {
        await ctx.ui.custom<void>((tui, _theme, keybindings, done) => {
          const maxVisibleLines = Math.max(6, Math.floor(tui.terminal.rows / 2));
          return new LoopTreeSelectorComponent(
            snapshot,
            maxVisibleLines,
            keybindings as KeybindingsLike,
            () => done(undefined),
            () => tui.requestRender(),
          );
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        ctx.ui.notify(`Loop Tree failed; opening text snapshot instead: ${message}`, "warning");
        await ctx.ui.editor("Loop Runs", renderLoopTreeSnapshotText(snapshot()));
      }
    },
  });

  pi.registerCommand("loop-runs", {
    description: "Show loop runs as a non-interactive text snapshot",
    handler: async (_args, ctx) => {
      if (!ctx.hasUI) return;
      await ctx.ui.editor(
        "Loop Runs",
        renderLoopTreeSnapshotText(loadLoopTreeSnapshot(defaultLoopSessionsDir(), plugins)),
      );
    },
  });

  pi.registerCommand("loop-checkpoints", {
    description:
      "Inspect seven-day checkpoint retention; use /loop-checkpoints prune to apply cleanup",
    handler: async (args, ctx) => {
      if (!ctx.hasUI) return;
      const apply = ["prune", "apply", "--apply"].includes((args || "").trim().toLowerCase());
      const result = new LoopRunCheckpointStore().pruneExpired({ dryRun: !apply });
      const lines = [
        `# Loop Checkpoint Retention`,
        ``,
        `Mode: ${apply ? "prune" : "dry-run"}`,
        `Rolling window: ${Math.round(result.retentionMs / (24 * 60 * 60 * 1000))} days`,
        `Cutoff: ${result.cutoff}`,
        `Directory entries examined: ${result.entriesExamined}`,
        `Checkpoints scanned: ${result.scanned}`,
        `Candidates: ${result.candidates.length}`,
        `Deleted: ${result.deleted.length}`,
        `Protected active: ${result.skippedActive.length}`,
        `Protected locked/stale: ${result.skippedLocked.length}`,
        `Skipped invalid: ${result.skippedInvalid.length}`,
        `Delete limit reached: ${result.limitReached ? "yes" : "no"}`,
        `Scan limit reached: ${result.scanLimitReached ? "yes" : "no"}`,
        ``,
        ...(result.candidates.length > 0
          ? ["## Expired candidates", ...result.candidates.map((runId) => `- ${runId}`)]
          : ["No expired checkpoint candidates."]),
      ];
      await ctx.ui.editor("Loop Checkpoint Retention", lines.join("\n"));
    },
  });

  pi.registerCommand("loops", {
    description: "List available loop types",
    handler: async (_args, ctx) => {
      if (!ctx.hasUI) return;

      const list = Object.entries(plugins)
        .map(
          ([name, plugin]) =>
            `## ${name}\n${plugin.description}\nPhases: ${plugin.phases.join(" → ")}`,
        )
        .join("\n\n");

      await ctx.ui.editor("Available Loops", list);
    },
  });
}
