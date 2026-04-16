export const AUTORESEARCH_COMMAND_NAME = "autoresearch";
export const AUTORESEARCH_STATUS_TOOL_NAME = "autoresearch_runtime_status";
export const AUTORESEARCH_PHASE = "package_shell" as const;

export const AUTORESEARCH_LOCAL_ARTIFACTS = [
  "autoresearch.jsonl",
  "autoresearch.md",
  "autoresearch.sh",
  "autoresearch.checks.sh",
  "autoresearch.ideas.md",
] as const;

export const READY_PROMPT_VAULT_TEMPLATES = [
  "pi-autoresearch-setup",
  "pi-autoresearch-next-hypothesis",
  "pi-autoresearch-finalize",
] as const;

export const BLOCKED_PROMPT_VAULT_TEMPLATES = ["pi-autoresearch-state-router"] as const;

export type MetricDirection = "lower" | "higher";
export type RunStatus = "baseline" | "candidate" | "keep" | "discard" | "crash" | "checks_failed";

export type MetricMap = Record<string, number>;

export interface AutoresearchConfigReceipt {
  type: "config";
  version: 1;
  name: string;
  metricName: string;
  metricUnit: string;
  direction: MetricDirection;
  createdAt: number;
}

export interface AutoresearchRunReceipt {
  type: "run";
  version: 1;
  status: RunStatus;
  metric: number;
  metrics: MetricMap;
  description: string;
  timestamp: number;
  commit?: string;
  iteration?: number;
}

export type AutoresearchReceipt = AutoresearchConfigReceipt | AutoresearchRunReceipt;

export interface AutoresearchScaffoldStatus {
  phase: typeof AUTORESEARCH_PHASE;
  cwd?: string;
  commandName: typeof AUTORESEARCH_COMMAND_NAME;
  toolNames: readonly [typeof AUTORESEARCH_STATUS_TOOL_NAME];
  localArtifacts: readonly string[];
  receiptEntryTypes: readonly ["config", "run"];
  readyPromptVaultTemplates: readonly string[];
  blockedPromptVaultTemplates: readonly string[];
  nextSlices: readonly string[];
}

export function parseMetricLines(output: string): MetricMap {
  const metrics: MetricMap = {};

  for (const rawLine of output.split(/\r?\n/)) {
    const line = rawLine.trim();
    const match = /^METRIC\s+([A-Za-z0-9_.:-]+)=(-?\d+(?:\.\d+)?)$/.exec(line);
    if (!match) continue;
    metrics[match[1]] = Number(match[2]);
  }

  return metrics;
}

export function createConfigReceipt(input: {
  name: string;
  metricName: string;
  metricUnit?: string;
  direction: MetricDirection;
  createdAt?: number;
}): AutoresearchConfigReceipt {
  return {
    type: "config",
    version: 1,
    name: input.name,
    metricName: input.metricName,
    metricUnit: input.metricUnit ?? "",
    direction: input.direction,
    createdAt: input.createdAt ?? Date.now(),
  };
}

export function createRunReceipt(input: {
  status: RunStatus;
  metric: number;
  metrics?: MetricMap;
  description: string;
  timestamp?: number;
  commit?: string;
  iteration?: number;
}): AutoresearchRunReceipt {
  return {
    type: "run",
    version: 1,
    status: input.status,
    metric: input.metric,
    metrics: { ...(input.metrics ?? {}) },
    description: input.description,
    timestamp: input.timestamp ?? Date.now(),
    commit: input.commit,
    iteration: input.iteration,
  };
}

export function serializeReceipt(entry: AutoresearchReceipt): string {
  return JSON.stringify(entry);
}

export function parseReceiptLine(line: string): AutoresearchReceipt {
  const parsed = JSON.parse(line) as unknown;
  if (!isRecord(parsed)) {
    throw new Error("Receipt line must decode to an object");
  }
  if (parsed.type === "config") {
    return parseConfigReceipt(parsed);
  }
  if (parsed.type === "run") {
    return parseRunReceipt(parsed);
  }
  throw new Error(`Unsupported receipt type: ${String(parsed.type)}`);
}

export function buildAutoresearchScaffoldStatus(cwd?: string): AutoresearchScaffoldStatus {
  return {
    phase: AUTORESEARCH_PHASE,
    cwd,
    commandName: AUTORESEARCH_COMMAND_NAME,
    toolNames: [AUTORESEARCH_STATUS_TOOL_NAME],
    localArtifacts: [...AUTORESEARCH_LOCAL_ARTIFACTS],
    receiptEntryTypes: ["config", "run"],
    readyPromptVaultTemplates: [...READY_PROMPT_VAULT_TEMPLATES],
    blockedPromptVaultTemplates: [...BLOCKED_PROMPT_VAULT_TEMPLATES],
    nextSlices: [
      "bounded_runtime_kernel",
      "ak_campaign_binding",
      "safer_finalization_path",
      "shared_ux_integration",
    ],
  };
}

export function formatAutoresearchStatusText(status: AutoresearchScaffoldStatus): string {
  return [
    "# PI-AUTORESEARCH STATUS",
    "",
    `- phase: ${status.phase}`,
    `- command: /${status.commandName}`,
    `- tool: ${status.toolNames.join(", ")}`,
    status.cwd ? `- cwd: ${status.cwd}` : "- cwd: (unset)",
    `- local artifacts: ${status.localArtifacts.join(", ")}`,
    `- receipt entry types: ${status.receiptEntryTypes.join(", ")}`,
    `- ready Prompt Vault templates: ${status.readyPromptVaultTemplates.join(", ")}`,
    `- blocked Prompt Vault templates: ${status.blockedPromptVaultTemplates.join(", ")}`,
    `- next slices: ${status.nextSlices.join(", ")}`,
  ].join("\n");
}

export function buildAutoresearchHelpText(status: AutoresearchScaffoldStatus): string {
  return [
    "# /autoresearch",
    "",
    "The package shell is installed, but the bounded runtime kernel is not implemented yet.",
    "",
    "## Current shell surfaces",
    `- command: /${status.commandName}`,
    `- tool: ${status.toolNames.join(", ")}`,
    "",
    "## Local artifact plan",
    ...status.localArtifacts.map((artifact) => `- ${artifact}`),
    "",
    "## Prompt Vault alignment",
    "Ready now:",
    ...status.readyPromptVaultTemplates.map((name) => `- ${name}`),
    "",
    "Blocked until governed router vocabulary expands:",
    ...status.blockedPromptVaultTemplates.map((name) => `- ${name}`),
    "",
    "## Next bounded slices",
    ...status.nextSlices.map((slice) => `- ${slice}`),
  ].join("\n");
}

function parseConfigReceipt(value: Record<string, unknown>): AutoresearchConfigReceipt {
  if (value.version !== 1) {
    throw new Error(`Unsupported config receipt version: ${String(value.version)}`);
  }
  if (value.direction !== "lower" && value.direction !== "higher") {
    throw new Error(`Invalid metric direction: ${String(value.direction)}`);
  }
  if (typeof value.name !== "string" || typeof value.metricName !== "string") {
    throw new Error("Config receipt requires string name and metricName fields");
  }
  return {
    type: "config",
    version: 1,
    name: value.name,
    metricName: value.metricName,
    metricUnit: typeof value.metricUnit === "string" ? value.metricUnit : "",
    direction: value.direction,
    createdAt: coerceNumber(value.createdAt, "createdAt"),
  };
}

function parseRunReceipt(value: Record<string, unknown>): AutoresearchRunReceipt {
  if (value.version !== 1) {
    throw new Error(`Unsupported run receipt version: ${String(value.version)}`);
  }
  if (!isRunStatus(value.status)) {
    throw new Error(`Invalid run status: ${String(value.status)}`);
  }
  if (typeof value.description !== "string") {
    throw new Error("Run receipt requires a string description field");
  }
  return {
    type: "run",
    version: 1,
    status: value.status,
    metric: coerceNumber(value.metric, "metric"),
    metrics: parseMetricMap(value.metrics),
    description: value.description,
    timestamp: coerceNumber(value.timestamp, "timestamp"),
    commit: typeof value.commit === "string" ? value.commit : undefined,
    iteration: typeof value.iteration === "number" ? value.iteration : undefined,
  };
}

function parseMetricMap(value: unknown): MetricMap {
  if (!isRecord(value)) return {};
  const metrics: MetricMap = {};
  for (const [key, entry] of Object.entries(value)) {
    if (typeof entry === "number" && Number.isFinite(entry)) {
      metrics[key] = entry;
    }
  }
  return metrics;
}

function coerceNumber(value: unknown, field: string): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  throw new Error(`Receipt field ${field} must be a finite number`);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isRunStatus(value: unknown): value is RunStatus {
  return (
    value === "baseline" ||
    value === "candidate" ||
    value === "keep" ||
    value === "discard" ||
    value === "crash" ||
    value === "checks_failed"
  );
}
