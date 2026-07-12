/**
summary: "Defines every typed outcome and input for planning a PTX prompt-template transformation."
read_when:
  - "Changing transform-plan statuses, result fields, or planner inputs."
*/
import type { ParsedRawCommand, RawCommandParseError } from "./parseRawCommand.js";
import type { TemplatePlaceholderUsage } from "./parseTemplatePlaceholders.js";
import type { PtxPolicyConfig, ResolvedTemplatePolicy } from "./ptxPolicyConfig.js";

export interface TemplateCommandLike {
  name: string;
  source: "prompt";
  description?: string;
  path?: string;
}

export interface PromptTemplateTransformBase {
  parsed: ParsedRawCommand;
}

export interface PromptTemplateTransformOk extends PromptTemplateTransformBase {
  status: "ok";
  templateCommand: TemplateCommandLike;
  policy: ResolvedTemplatePolicy;
  resolution: string;
  usage: TemplatePlaceholderUsage;
  hints: unknown;
  inferred: unknown;
  mappedArgs: string[];
  transformed: string;
}

export interface PromptTemplateTransformPolicyBlocked extends PromptTemplateTransformBase {
  status: "policy-blocked";
  templateCommand: TemplateCommandLike;
  policy: ResolvedTemplatePolicy;
  resolution: string;
}

export interface PromptTemplateTransformAmbiguous extends PromptTemplateTransformBase {
  status: "template-name-ambiguous";
  matches: unknown[];
  prefillableMatches: unknown[];
  resolution: string;
}

export interface PromptTemplateTransformMissingPath extends PromptTemplateTransformBase {
  status: "template-path-missing";
  templateCommand: TemplateCommandLike;
  policy: ResolvedTemplatePolicy;
  resolution: string;
}

export interface PromptTemplateTransformReadError extends PromptTemplateTransformBase {
  status: "template-read-error";
  templateCommand: TemplateCommandLike;
  policy: ResolvedTemplatePolicy;
  resolution: string;
  error: unknown;
}

export interface PromptTemplateTransformNonTemplate extends PromptTemplateTransformBase {
  status: "non-template-command";
}

export interface PromptTemplateTransformParseError {
  status: "parse-error";
  error: RawCommandParseError;
}

export interface PromptTemplateTransformNotSlashCommand {
  status: "not-slash-command";
}

export type PromptTemplateTransformPlan =
  | PromptTemplateTransformOk
  | PromptTemplateTransformPolicyBlocked
  | PromptTemplateTransformAmbiguous
  | PromptTemplateTransformMissingPath
  | PromptTemplateTransformReadError
  | PromptTemplateTransformNonTemplate
  | PromptTemplateTransformParseError
  | PromptTemplateTransformNotSlashCommand;

export function planPromptTemplateTransform(options: {
  pi: { getCommands(): readonly unknown[] };
  ctx: unknown;
  rawText: string;
  policyConfig: PtxPolicyConfig;
  templateCommandOverride?: TemplateCommandLike;
}): Promise<PromptTemplateTransformPlan>;
