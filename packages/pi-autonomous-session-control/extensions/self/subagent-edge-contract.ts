import {
  assertInvariants,
  type InvariantReport,
  normalizeEnum,
  normalizeInput,
  normalizeNumber,
  normalizeString,
  normalizeStringArray,
  normalizeStringRecord,
} from "./edge-contract-kernel.ts";
import type { DispatchMutationPolicy, DispatchThinkingLevel } from "./subagent-runtime-types.ts";
import type { SubagentState } from "./subagent-session.ts";

const THINKING_LEVELS = ["off", "minimal", "low", "medium", "high", "xhigh", "max"] as const;
const MUTATION_POLICIES = ["read_only", "bounded_mutation"] as const;
export const DISPATCH_SUBAGENT_OBJECTIVE_MAX_LENGTH = 16_000;
const MAX_CONTRACT_ITEMS = 32;
const MAX_CONTRACT_ITEM_LENGTH = 1_000;

export interface NormalizedDispatchParams {
  profile: string;
  objective?: string;
  tools?: string;
  resumeDispatchId?: string;
  thinking?: DispatchThinkingLevel;
  startupTimeout?: number;
  allowUnlimited: boolean;
  deliverable?: string;
  acceptanceCriteria?: string[];
  constraints?: string[];
  evidenceRequired?: string[];
  mutationPolicy?: DispatchMutationPolicy;
  stopConditions?: string[];
  allowedPaths?: string[];
  forbiddenPaths?: string[];
  systemPrompt?: string;
  name?: string;
  timeout?: number;
  extensions?: string[];
  env?: Record<string, string>;
  skillProfile?: string;
  noSkills?: boolean;
  skills?: string[];
  prompt_name?: string;
  prompt_content?: string;
  prompt_tags?: string[];
  prompt_source?: string;
  effectCorrelationId?: string;
  rawObjective: unknown;
  rawTimeout: unknown;
  rawStartupTimeout: unknown;
  rawThinking: unknown;
  rawMutationPolicy: unknown;
  contractArraysValid: boolean;
}

export function normalizeDispatchParams(params: unknown): NormalizedDispatchParams {
  const normalized = normalizeInput(params);
  const contractArrayKeys = [
    "acceptanceCriteria",
    "constraints",
    "evidenceRequired",
    "stopConditions",
    "allowedPaths",
    "forbiddenPaths",
  ] as const;

  return {
    profile: normalizeString(normalized.profile, { maxLength: 40 }) || "",
    objective: normalizeString(normalized.objective, {
      maxLength: DISPATCH_SUBAGENT_OBJECTIVE_MAX_LENGTH,
    }),
    tools: normalizeString(normalized.tools, { maxLength: 500 }),
    resumeDispatchId: normalizeString(normalized.resumeDispatchId, { maxLength: 200 }),
    thinking: normalizeEnum(normalized.thinking, THINKING_LEVELS),
    startupTimeout: normalizeNumber(normalized.startupTimeout, { min: 1, max: 300 }),
    allowUnlimited: normalized.allowUnlimited === true,
    deliverable: normalizeString(normalized.deliverable, { maxLength: 2_000 }),
    acceptanceCriteria: normalizeStringArray(normalized.acceptanceCriteria),
    constraints: normalizeStringArray(normalized.constraints),
    evidenceRequired: normalizeStringArray(normalized.evidenceRequired),
    mutationPolicy: normalizeEnum(normalized.mutationPolicy, MUTATION_POLICIES),
    stopConditions: normalizeStringArray(normalized.stopConditions),
    allowedPaths: normalizeStringArray(normalized.allowedPaths),
    forbiddenPaths: normalizeStringArray(normalized.forbiddenPaths),
    systemPrompt: normalizeString(normalized.systemPrompt, {
      allowEmpty: true,
    }),
    name: normalizeString(normalized.name),
    timeout: normalizeNumber(normalized.timeout, { min: 0, max: 86_400 }),
    extensions: normalizeStringArray(normalized.extensions),
    env: normalizeStringRecord(normalized.env),
    skillProfile: normalizeString(normalized.skillProfile),
    noSkills: typeof normalized.noSkills === "boolean" ? normalized.noSkills : undefined,
    skills: normalizeStringArray(normalized.skills),
    prompt_name: normalizeString(normalized.prompt_name),
    prompt_content: normalizeString(normalized.prompt_content, {
      allowEmpty: true,
    }),
    prompt_tags: normalizeStringArray(normalized.prompt_tags),
    prompt_source: normalizeString(normalized.prompt_source),
    effectCorrelationId: normalizeString(normalized.effectCorrelationId, { maxLength: 200 }),
    rawObjective: normalized.objective,
    rawTimeout: normalized.timeout,
    rawStartupTimeout: normalized.startupTimeout,
    rawThinking: normalized.thinking,
    rawMutationPolicy: normalized.mutationPolicy,
    contractArraysValid: contractArrayKeys.every((key) => isValidContractArray(normalized[key])),
  };
}

function isValidContractArray(value: unknown): boolean {
  return (
    value === undefined ||
    (Array.isArray(value) &&
      value.length <= MAX_CONTRACT_ITEMS &&
      value.every(
        (entry) =>
          typeof entry === "string" &&
          entry.trim().length > 0 &&
          entry.trim().length <= MAX_CONTRACT_ITEM_LENGTH,
      ))
  );
}

export function validateDispatchParams(params: NormalizedDispatchParams): InvariantReport {
  return assertInvariants([
    {
      id: "dispatch.profile.required",
      check: params.profile.length > 0,
      message: "profile must be a non-empty string.",
    },
    {
      id: "dispatch.objective.required",
      check:
        typeof params.objective === "string" &&
        params.objective.length > 0 &&
        typeof params.rawObjective === "string" &&
        params.rawObjective.trim().length <= DISPATCH_SUBAGENT_OBJECTIVE_MAX_LENGTH,
      message: `objective must be a non-empty string no longer than ${DISPATCH_SUBAGENT_OBJECTIVE_MAX_LENGTH} characters.`,
    },
    {
      id: "dispatch.timeout.bounded",
      check: params.rawTimeout === undefined || params.timeout !== undefined,
      message: "timeout must be a finite number from 0 through 86400 seconds.",
    },
    {
      id: "dispatch.timeout.unlimited_explicit",
      check: params.timeout !== 0 || params.allowUnlimited,
      message: "timeout=0 requires allowUnlimited=true and runtime policy opt-in.",
    },
    {
      id: "dispatch.startup_timeout.bounded",
      check: params.rawStartupTimeout === undefined || params.startupTimeout !== undefined,
      message: "startupTimeout must be a finite number from 1 through 300 seconds.",
    },
    {
      id: "dispatch.thinking.allowed",
      check: params.rawThinking === undefined || params.thinking !== undefined,
      message: `thinking must be one of: ${THINKING_LEVELS.join(", ")}.`,
    },
    {
      id: "dispatch.mutation_policy.allowed",
      check: params.rawMutationPolicy === undefined || params.mutationPolicy !== undefined,
      message: `mutationPolicy must be one of: ${MUTATION_POLICIES.join(", ")}.`,
    },
    {
      id: "dispatch.task_contract.arrays_bounded",
      check: params.contractArraysValid,
      message: `task contract arrays must contain at most ${MAX_CONTRACT_ITEMS} non-empty strings of at most ${MAX_CONTRACT_ITEM_LENGTH} characters each.`,
    },
  ]);
}

export function validateSubagentLifecycle(state: SubagentState): InvariantReport {
  return assertInvariants([
    {
      id: "dispatch.lifecycle.activeCount.non_negative",
      check: state.activeCount >= 0,
      message: "activeCount must remain non-negative.",
    },
    {
      id: "dispatch.lifecycle.activeCount.within_limit",
      check: state.activeCount <= state.maxConcurrent,
      message: "activeCount must not exceed maxConcurrent.",
    },
  ]);
}

export function formatInvariantIssues(prefix: string, report: InvariantReport): string {
  return `${prefix}: ${report.issues.map((issue) => `${issue.id} (${issue.message})`).join("; ")}`;
}
