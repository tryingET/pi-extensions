import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

export const AUTORESEARCH_CAMPAIGN_GOAL_LEDGER_FILE = "autoresearch.goal.json" as const;

export const AUTORESEARCH_CAMPAIGN_GOAL_STATUSES = [
  "active",
  "paused",
  "budget_limited",
  "complete",
] as const;

export type AutoresearchCampaignGoalStatus = (typeof AUTORESEARCH_CAMPAIGN_GOAL_STATUSES)[number];

export interface AutoresearchCampaignGoalBudget {
  iterations: number | null;
  wallClockSeconds: number | null;
  tokenLikeUnits: number | null;
}

export interface AutoresearchCampaignGoalUsage {
  foregroundSegments: number;
  completedIterations: number;
  elapsedSeconds: number;
  tokenLikeUnits: number;
}

export interface AutoresearchCampaignGoalSegment {
  segmentIndex: number;
  startedAt: number;
  completedAt: number;
  foreground: true;
  requestedIterations: number;
  completedIterations: number;
  elapsedSeconds: number;
  stopReason: string;
  toolName: string;
  toolCall: string;
}

export interface AutoresearchCampaignGoalLedgerV1 {
  type: "campaign_goal_ledger";
  version: 1;
  goalId: string;
  objective: string;
  status: AutoresearchCampaignGoalStatus;
  createdAt: number;
  updatedAt: number;
  budget: AutoresearchCampaignGoalBudget;
  usage: AutoresearchCampaignGoalUsage;
  lastStatusReason: string;
  segments: AutoresearchCampaignGoalSegment[];
  nextContinuationCall: string | null;
  exactControlActions: Record<"pause" | "resume" | "complete", string>;
  authorityWarnings: string[];
}

export interface AutoresearchCampaignGoalStatusView {
  exists: boolean;
  path: string;
  goalId: string | null;
  objective: string | null;
  status: AutoresearchCampaignGoalStatus | "missing" | "invalid";
  budget: AutoresearchCampaignGoalBudget;
  usage: AutoresearchCampaignGoalUsage;
  remainingBudget: AutoresearchCampaignGoalBudget;
  nextContinuationCall: string | null;
  exactControlActions: Record<"pause" | "resume" | "complete", string>;
  authorityWarnings: string[];
  parseError: string | null;
}

export interface BeginAutoresearchCampaignGoalInput {
  cwd: string;
  objective: string;
  goalId?: string;
  iterationBudget?: number;
  wallClockMinutesBudget?: number;
  tokenLikeBudget?: number;
  now?: number;
}

export interface RecordAutoresearchCampaignGoalSegmentInput {
  cwd: string;
  goalId: string;
  requestedIterations: number;
  completedIterations: number;
  elapsedSeconds: number;
  stopReason: string;
  toolName: string;
  toolCall: string;
  tokenLikeUnits?: number;
  startedAt?: number;
  completedAt?: number;
}

export interface SetAutoresearchCampaignGoalControlInput {
  cwd: string;
  action: "pause" | "resume" | "complete";
  reason?: string;
  now?: number;
}

const EMPTY_BUDGET: AutoresearchCampaignGoalBudget = {
  iterations: null,
  wallClockSeconds: null,
  tokenLikeUnits: null,
};

const EMPTY_USAGE: AutoresearchCampaignGoalUsage = {
  foregroundSegments: 0,
  completedIterations: 0,
  elapsedSeconds: 0,
  tokenLikeUnits: 0,
};

const GOAL_AUTHORITY_WARNINGS = [
  "campaign_goal_ledger is package-local continuity state, not AK task/evidence authority",
  "foreground segments run only when an explicit tool call is made; no daemon or scheduler is installed",
  "AK/KES/Oracle/candidate promotion remains external to this package-local goal ledger",
] as const;

export function resolveAutoresearchCampaignGoalLedgerPath(cwd: string): string {
  return path.join(path.resolve(cwd), AUTORESEARCH_CAMPAIGN_GOAL_LEDGER_FILE);
}

export function loadAutoresearchCampaignGoalLedger(
  cwd: string,
): AutoresearchCampaignGoalLedgerV1 | null {
  const ledgerPath = resolveAutoresearchCampaignGoalLedgerPath(cwd);
  if (!existsSync(ledgerPath)) return null;
  return parseAutoresearchCampaignGoalLedger(readFileSync(ledgerPath, "utf8"));
}

export function buildAutoresearchCampaignGoalStatus(
  cwd: string,
): AutoresearchCampaignGoalStatusView {
  const ledgerPath = resolveAutoresearchCampaignGoalLedgerPath(cwd);
  if (!existsSync(ledgerPath)) {
    return missingGoalStatus(ledgerPath);
  }

  try {
    const ledger = parseAutoresearchCampaignGoalLedger(readFileSync(ledgerPath, "utf8"));
    return statusViewFromLedger(ledger, ledgerPath);
  } catch (error) {
    return {
      ...missingGoalStatus(ledgerPath),
      exists: true,
      status: "invalid",
      parseError: error instanceof Error ? error.message : String(error),
    };
  }
}

export function beginAutoresearchCampaignGoal(
  input: BeginAutoresearchCampaignGoalInput,
): AutoresearchCampaignGoalLedgerV1 {
  const cwd = path.resolve(input.cwd);
  const objective = input.objective.trim();
  if (!objective) throw new Error("campaign goal objective is required");

  const now = input.now ?? Date.now();
  const ledgerPath = resolveAutoresearchCampaignGoalLedgerPath(cwd);
  const existing = safeLoadGoalLedger(cwd);
  const requestedGoalId =
    input.goalId?.trim() || existing?.goalId || createCampaignGoalId(objective);
  const shouldContinueExisting = existing?.goalId === requestedGoalId;
  const previous = shouldContinueExisting ? existing : null;

  if (previous?.status === "complete") {
    throw new Error("campaign goal is already complete; start a new goal id to continue");
  }

  const budget = mergeGoalBudget(previous?.budget ?? EMPTY_BUDGET, input);
  const usage = previous?.usage ?? { ...EMPTY_USAGE };
  assertGoalBudgetAvailable({ budget, usage, requestedIterations: 0 });

  const ledger: AutoresearchCampaignGoalLedgerV1 = {
    type: "campaign_goal_ledger",
    version: 1,
    goalId: requestedGoalId,
    objective,
    status: "active",
    createdAt: previous?.createdAt ?? now,
    updatedAt: now,
    budget,
    usage,
    lastStatusReason: previous ? "foreground continuation started" : "campaign goal created",
    segments: previous?.segments ?? [],
    nextContinuationCall: buildGoalContinuationCall({
      cwd,
      objective,
      goalId: requestedGoalId,
      budget,
      usage,
    }),
    exactControlActions: buildGoalControlActions(cwd),
    authorityWarnings: [...GOAL_AUTHORITY_WARNINGS],
  };

  writeGoalLedger(ledgerPath, ledger);
  return ledger;
}

export function recordAutoresearchCampaignGoalSegment(
  input: RecordAutoresearchCampaignGoalSegmentInput,
): AutoresearchCampaignGoalLedgerV1 {
  const cwd = path.resolve(input.cwd);
  const ledgerPath = resolveAutoresearchCampaignGoalLedgerPath(cwd);
  const previous = loadAutoresearchCampaignGoalLedger(cwd);
  if (!previous) throw new Error("campaign goal ledger does not exist");
  if (previous.goalId !== input.goalId) throw new Error("campaign goal id does not match ledger");
  if (previous.status === "complete") throw new Error("campaign goal is already complete");

  const startedAt = input.startedAt ?? Date.now() - Math.round(input.elapsedSeconds * 1000);
  const completedAt = input.completedAt ?? Date.now();
  const segment: AutoresearchCampaignGoalSegment = {
    segmentIndex: previous.segments.length + 1,
    startedAt,
    completedAt,
    foreground: true,
    requestedIterations: normalizeNonnegativeInteger(
      input.requestedIterations,
      "requestedIterations",
    ),
    completedIterations: normalizeNonnegativeInteger(
      input.completedIterations,
      "completedIterations",
    ),
    elapsedSeconds: normalizeNonnegativeNumber(input.elapsedSeconds, "elapsedSeconds"),
    stopReason: input.stopReason,
    toolName: input.toolName,
    toolCall: input.toolCall,
  };

  const usage: AutoresearchCampaignGoalUsage = {
    foregroundSegments: previous.usage.foregroundSegments + 1,
    completedIterations: previous.usage.completedIterations + segment.completedIterations,
    elapsedSeconds: previous.usage.elapsedSeconds + segment.elapsedSeconds,
    tokenLikeUnits: previous.usage.tokenLikeUnits + (input.tokenLikeUnits ?? 0),
  };
  const budgetStatus = classifyBudgetStatus(previous.budget, usage);
  const status: AutoresearchCampaignGoalStatus =
    budgetStatus === "budget_limited" ? "budget_limited" : "paused";
  const ledger: AutoresearchCampaignGoalLedgerV1 = {
    ...previous,
    status,
    updatedAt: completedAt,
    usage,
    lastStatusReason:
      status === "budget_limited"
        ? budgetLimitReason(previous.budget, usage)
        : "foreground segment completed; explicit continuation required",
    segments: [...previous.segments, segment],
    nextContinuationCall:
      status === "budget_limited"
        ? null
        : buildGoalContinuationCall({
            cwd,
            objective: previous.objective,
            goalId: previous.goalId,
            budget: previous.budget,
            usage,
          }),
    exactControlActions: buildGoalControlActions(cwd),
    authorityWarnings: [...GOAL_AUTHORITY_WARNINGS],
  };

  writeGoalLedger(ledgerPath, ledger);
  return ledger;
}

export function setAutoresearchCampaignGoalControl(
  input: SetAutoresearchCampaignGoalControlInput,
): AutoresearchCampaignGoalLedgerV1 {
  const cwd = path.resolve(input.cwd);
  const ledgerPath = resolveAutoresearchCampaignGoalLedgerPath(cwd);
  const previous = loadAutoresearchCampaignGoalLedger(cwd);
  if (!previous) throw new Error("campaign goal ledger does not exist");
  const now = input.now ?? Date.now();
  const status: AutoresearchCampaignGoalStatus =
    input.action === "complete" ? "complete" : input.action === "resume" ? "active" : "paused";
  if (previous.status === "complete" && input.action !== "complete") {
    throw new Error("campaign goal is complete; start a new goal id to resume");
  }
  const budgetStatus = classifyBudgetStatus(previous.budget, previous.usage);
  if (input.action === "resume" && budgetStatus === "budget_limited") {
    throw new Error("campaign goal budget is exhausted; cannot resume without a new goal/budget");
  }
  const ledger: AutoresearchCampaignGoalLedgerV1 = {
    ...previous,
    status: status === "active" && budgetStatus === "budget_limited" ? "budget_limited" : status,
    updatedAt: now,
    lastStatusReason: input.reason?.trim() || `operator control action: ${input.action}`,
    nextContinuationCall:
      status === "complete" || budgetStatus === "budget_limited"
        ? null
        : buildGoalContinuationCall({
            cwd,
            objective: previous.objective,
            goalId: previous.goalId,
            budget: previous.budget,
            usage: previous.usage,
          }),
    exactControlActions: buildGoalControlActions(cwd),
  };
  writeGoalLedger(ledgerPath, ledger);
  return ledger;
}

export function formatAutoresearchCampaignGoalStatus(
  status: AutoresearchCampaignGoalStatusView,
): string {
  return [
    "# PI-AUTORESEARCH CAMPAIGN GOAL",
    "",
    `- path: ${status.path}`,
    `- exists: ${status.exists ? "yes" : "no"}`,
    `- goal id: ${status.goalId ?? "(none)"}`,
    `- objective: ${status.objective ?? "(none)"}`,
    `- status: ${status.status}`,
    `- budget iterations: ${formatNullableNumber(status.budget.iterations)}`,
    `- usage iterations: ${status.usage.completedIterations}`,
    `- remaining iterations: ${formatNullableNumber(status.remainingBudget.iterations)}`,
    `- budget wall clock seconds: ${formatNullableNumber(status.budget.wallClockSeconds)}`,
    `- usage wall clock seconds: ${status.usage.elapsedSeconds.toFixed(2)}`,
    `- remaining wall clock seconds: ${formatNullableNumber(status.remainingBudget.wallClockSeconds)}`,
    `- budget token-like units: ${formatNullableNumber(status.budget.tokenLikeUnits)}`,
    `- usage token-like units: ${status.usage.tokenLikeUnits}`,
    `- foreground segments: ${status.usage.foregroundSegments}`,
    `- next continuation: ${status.nextContinuationCall ?? "(none)"}`,
    `- parse error: ${status.parseError ?? "(none)"}`,
    "",
    "## Explicit control actions",
    `- pause: ${status.exactControlActions.pause}`,
    `- resume: ${status.exactControlActions.resume}`,
    `- complete: ${status.exactControlActions.complete}`,
    "",
    "## Authority warnings",
    ...status.authorityWarnings.map((warning) => `- ${warning}`),
  ].join("\n");
}

function parseAutoresearchCampaignGoalLedger(raw: string): AutoresearchCampaignGoalLedgerV1 {
  const parsed = JSON.parse(raw) as unknown;
  if (!isRecord(parsed)) throw new Error("campaign goal ledger must be an object");
  if (parsed.type !== "campaign_goal_ledger") throw new Error("unsupported campaign goal type");
  if (parsed.version !== 1) throw new Error("unsupported campaign goal version");
  const status = parseGoalStatus(parsed.status);
  const objective = requireString(parsed.objective, "objective");
  const goalId = requireString(parsed.goalId, "goalId");
  const budget = parseBudget(parsed.budget);
  const usage = parseUsage(parsed.usage);
  const segments = Array.isArray(parsed.segments) ? parsed.segments.map(parseSegment) : [];
  return {
    type: "campaign_goal_ledger",
    version: 1,
    goalId,
    objective,
    status,
    createdAt: requireNumber(parsed.createdAt, "createdAt"),
    updatedAt: requireNumber(parsed.updatedAt, "updatedAt"),
    budget,
    usage,
    lastStatusReason: typeof parsed.lastStatusReason === "string" ? parsed.lastStatusReason : "",
    segments,
    nextContinuationCall:
      typeof parsed.nextContinuationCall === "string" ? parsed.nextContinuationCall : null,
    exactControlActions: buildGoalControlActions("<cwd>"),
    authorityWarnings: [...GOAL_AUTHORITY_WARNINGS],
  };
}

function statusViewFromLedger(
  ledger: AutoresearchCampaignGoalLedgerV1,
  ledgerPath: string,
): AutoresearchCampaignGoalStatusView {
  const cwd = path.dirname(ledgerPath);
  const remainingBudget = computeRemainingBudget(ledger.budget, ledger.usage);
  return {
    exists: true,
    path: ledgerPath,
    goalId: ledger.goalId,
    objective: ledger.objective,
    status: ledger.status,
    budget: ledger.budget,
    usage: ledger.usage,
    remainingBudget,
    nextContinuationCall: ledger.nextContinuationCall,
    exactControlActions: buildGoalControlActions(cwd),
    authorityWarnings: [...GOAL_AUTHORITY_WARNINGS],
    parseError: null,
  };
}

function missingGoalStatus(ledgerPath: string): AutoresearchCampaignGoalStatusView {
  return {
    exists: false,
    path: ledgerPath,
    goalId: null,
    objective: null,
    status: "missing",
    budget: { ...EMPTY_BUDGET },
    usage: { ...EMPTY_USAGE },
    remainingBudget: { ...EMPTY_BUDGET },
    nextContinuationCall: null,
    exactControlActions: buildGoalControlActions(path.dirname(ledgerPath)),
    authorityWarnings: [...GOAL_AUTHORITY_WARNINGS],
    parseError: null,
  };
}

function safeLoadGoalLedger(cwd: string): AutoresearchCampaignGoalLedgerV1 | null {
  try {
    return loadAutoresearchCampaignGoalLedger(cwd);
  } catch {
    return null;
  }
}

function writeGoalLedger(ledgerPath: string, ledger: AutoresearchCampaignGoalLedgerV1): void {
  mkdirSync(path.dirname(ledgerPath), { recursive: true });
  writeFileSync(ledgerPath, `${JSON.stringify(ledger, null, 2)}\n`, "utf8");
}

function mergeGoalBudget(
  previous: AutoresearchCampaignGoalBudget,
  input: BeginAutoresearchCampaignGoalInput,
): AutoresearchCampaignGoalBudget {
  return {
    iterations:
      normalizeOptionalPositiveInteger(input.iterationBudget, "iterationBudget") ??
      previous.iterations,
    wallClockSeconds:
      input.wallClockMinutesBudget === undefined
        ? previous.wallClockSeconds
        : normalizeOptionalPositiveNumber(input.wallClockMinutesBudget, "wallClockMinutesBudget") *
          60,
    tokenLikeUnits:
      normalizeOptionalPositiveInteger(input.tokenLikeBudget, "tokenLikeBudget") ??
      previous.tokenLikeUnits,
  };
}

function assertGoalBudgetAvailable(input: {
  budget: AutoresearchCampaignGoalBudget;
  usage: AutoresearchCampaignGoalUsage;
  requestedIterations: number;
}): void {
  if (
    input.budget.iterations !== null &&
    input.usage.completedIterations + input.requestedIterations > input.budget.iterations
  ) {
    throw new Error("campaign goal iteration budget would be exceeded");
  }
  if (classifyBudgetStatus(input.budget, input.usage) === "budget_limited") {
    throw new Error("campaign goal budget is exhausted");
  }
}

function classifyBudgetStatus(
  budget: AutoresearchCampaignGoalBudget,
  usage: AutoresearchCampaignGoalUsage,
): "available" | "budget_limited" {
  if (budget.iterations !== null && usage.completedIterations >= budget.iterations) {
    return "budget_limited";
  }
  if (budget.wallClockSeconds !== null && usage.elapsedSeconds >= budget.wallClockSeconds) {
    return "budget_limited";
  }
  if (budget.tokenLikeUnits !== null && usage.tokenLikeUnits >= budget.tokenLikeUnits) {
    return "budget_limited";
  }
  return "available";
}

function budgetLimitReason(
  budget: AutoresearchCampaignGoalBudget,
  usage: AutoresearchCampaignGoalUsage,
): string {
  if (budget.iterations !== null && usage.completedIterations >= budget.iterations) {
    return "campaign goal iteration budget reached";
  }
  if (budget.wallClockSeconds !== null && usage.elapsedSeconds >= budget.wallClockSeconds) {
    return "campaign goal wall-clock budget reached";
  }
  if (budget.tokenLikeUnits !== null && usage.tokenLikeUnits >= budget.tokenLikeUnits) {
    return "campaign goal token-like budget reached";
  }
  return "campaign goal budget reached";
}

function computeRemainingBudget(
  budget: AutoresearchCampaignGoalBudget,
  usage: AutoresearchCampaignGoalUsage,
): AutoresearchCampaignGoalBudget {
  return {
    iterations:
      budget.iterations === null
        ? null
        : Math.max(0, budget.iterations - usage.completedIterations),
    wallClockSeconds:
      budget.wallClockSeconds === null
        ? null
        : Math.max(0, budget.wallClockSeconds - usage.elapsedSeconds),
    tokenLikeUnits:
      budget.tokenLikeUnits === null
        ? null
        : Math.max(0, budget.tokenLikeUnits - usage.tokenLikeUnits),
  };
}

function buildGoalContinuationCall(input: {
  cwd: string;
  objective: string;
  goalId: string;
  budget: AutoresearchCampaignGoalBudget;
  usage: AutoresearchCampaignGoalUsage;
}): string | null {
  const remaining = computeRemainingBudget(input.budget, input.usage);
  if (classifyBudgetStatus(input.budget, input.usage) === "budget_limited") return null;
  const nextIterations =
    remaining.iterations === null ? 1 : Math.max(1, Math.min(1, remaining.iterations));
  const wallClockField =
    remaining.wallClockSeconds === null
      ? ""
      : `, maxWallClockMinutes: ${Math.max(0.01, remaining.wallClockSeconds / 60)}`;
  const iterationBudgetField =
    input.budget.iterations === null
      ? ""
      : `, campaignGoalIterationBudget: ${input.budget.iterations}`;
  const wallClockBudgetField =
    input.budget.wallClockSeconds === null
      ? ""
      : `, campaignGoalWallClockMinutesBudget: ${input.budget.wallClockSeconds / 60}`;
  const tokenBudgetField =
    input.budget.tokenLikeUnits === null
      ? ""
      : `, campaignGoalTokenBudget: ${input.budget.tokenLikeUnits}`;
  return `autoresearch_runtime_loop({ cwd: ${JSON.stringify(input.cwd)}, goal: ${JSON.stringify(input.objective)}, maxIterations: ${nextIterations}${wallClockField}, campaignGoalId: ${JSON.stringify(input.goalId)}${iterationBudgetField}${wallClockBudgetField}${tokenBudgetField}, peerMode: "off" })`;
}

function buildGoalControlActions(cwd: string): Record<"pause" | "resume" | "complete", string> {
  return {
    pause: `autoresearch_runtime_control({ cwd: ${JSON.stringify(cwd)}, action: "goal_pause" })`,
    resume: `autoresearch_runtime_control({ cwd: ${JSON.stringify(cwd)}, action: "goal_resume" })`,
    complete: `autoresearch_runtime_control({ cwd: ${JSON.stringify(cwd)}, action: "goal_complete" })`,
  };
}

function createCampaignGoalId(objective: string): string {
  return `goal-${createHash("sha256").update(objective).digest("hex").slice(0, 12)}`;
}

function parseGoalStatus(value: unknown): AutoresearchCampaignGoalStatus {
  if (AUTORESEARCH_CAMPAIGN_GOAL_STATUSES.includes(value as AutoresearchCampaignGoalStatus)) {
    return value as AutoresearchCampaignGoalStatus;
  }
  throw new Error(`unsupported campaign goal status: ${String(value)}`);
}

function parseBudget(value: unknown): AutoresearchCampaignGoalBudget {
  if (!isRecord(value)) return { ...EMPTY_BUDGET };
  return {
    iterations: parseNullableNumber(value.iterations),
    wallClockSeconds: parseNullableNumber(value.wallClockSeconds),
    tokenLikeUnits: parseNullableNumber(value.tokenLikeUnits),
  };
}

function parseUsage(value: unknown): AutoresearchCampaignGoalUsage {
  if (!isRecord(value)) return { ...EMPTY_USAGE };
  return {
    foregroundSegments: parseNullableNumber(value.foregroundSegments) ?? 0,
    completedIterations: parseNullableNumber(value.completedIterations) ?? 0,
    elapsedSeconds: parseNullableNumber(value.elapsedSeconds) ?? 0,
    tokenLikeUnits: parseNullableNumber(value.tokenLikeUnits) ?? 0,
  };
}

function parseSegment(value: unknown): AutoresearchCampaignGoalSegment {
  if (!isRecord(value)) throw new Error("campaign goal segment must be an object");
  return {
    segmentIndex: requireNumber(value.segmentIndex, "segmentIndex"),
    startedAt: requireNumber(value.startedAt, "startedAt"),
    completedAt: requireNumber(value.completedAt, "completedAt"),
    foreground: true,
    requestedIterations: requireNumber(value.requestedIterations, "requestedIterations"),
    completedIterations: requireNumber(value.completedIterations, "completedIterations"),
    elapsedSeconds: requireNumber(value.elapsedSeconds, "elapsedSeconds"),
    stopReason: requireString(value.stopReason, "stopReason"),
    toolName: requireString(value.toolName, "toolName"),
    toolCall: requireString(value.toolCall, "toolCall"),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requireString(value: unknown, field: string): string {
  if (typeof value !== "string") throw new Error(`${field} must be a string`);
  return value;
}

function requireNumber(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`${field} must be a finite number`);
  }
  return value;
}

function parseNullableNumber(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return value;
}

function normalizeOptionalPositiveInteger(value: number | undefined, field: string): number | null {
  if (value === undefined) return null;
  if (!Number.isInteger(value) || value < 1) throw new Error(`${field} must be a positive integer`);
  return value;
}

function normalizeOptionalPositiveNumber(value: number | undefined, field: string): number {
  if (value === undefined) throw new Error(`${field} is required`);
  if (!Number.isFinite(value) || value <= 0) throw new Error(`${field} must be positive`);
  return value;
}

function normalizeNonnegativeInteger(value: number, field: string): number {
  if (!Number.isInteger(value) || value < 0)
    throw new Error(`${field} must be a nonnegative integer`);
  return value;
}

function normalizeNonnegativeNumber(value: number, field: string): number {
  if (!Number.isFinite(value) || value < 0)
    throw new Error(`${field} must be a nonnegative number`);
  return value;
}

function formatNullableNumber(value: number | null): string {
  return value === null ? "(unbounded)" : String(value);
}
