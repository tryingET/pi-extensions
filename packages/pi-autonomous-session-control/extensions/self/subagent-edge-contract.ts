import {
  assertInvariants,
  type InvariantReport,
  normalizeInput,
  normalizeNumber,
  normalizeString,
  normalizeStringArray,
} from "./edge-contract-kernel.ts";
import type { SubagentState } from "./subagent-session.ts";

export interface NormalizedDispatchParams {
  profile: string;
  objective?: string;
  tools?: string;
  systemPrompt?: string;
  name?: string;
  timeout?: number;
  extensions?: string[];
  prompt_name?: string;
  prompt_content?: string;
  prompt_tags?: string[];
  prompt_source?: string;
  rawTimeout: unknown;
}

export function normalizeDispatchParams(params: unknown): NormalizedDispatchParams {
  const normalized = normalizeInput(params);

  return {
    profile: normalizeString(normalized.profile) || "",
    objective: normalizeString(normalized.objective),
    tools: normalizeString(normalized.tools),
    systemPrompt: normalizeString(normalized.systemPrompt, {
      allowEmpty: true,
    }),
    name: normalizeString(normalized.name),
    timeout: normalizeNumber(normalized.timeout, { min: 0 }),
    extensions: normalizeStringArray(normalized.extensions),
    prompt_name: normalizeString(normalized.prompt_name),
    prompt_content: normalizeString(normalized.prompt_content, {
      allowEmpty: true,
    }),
    prompt_tags: normalizeStringArray(normalized.prompt_tags),
    prompt_source: normalizeString(normalized.prompt_source),
    rawTimeout: normalized.timeout,
  };
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
      check: typeof params.objective === "string" && params.objective.length > 0,
      message: "objective must be a non-empty string.",
    },
    {
      id: "dispatch.timeout.non_negative",
      check: params.rawTimeout === undefined || params.timeout !== undefined,
      message: "timeout must be a finite number greater than or equal to 0.",
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
