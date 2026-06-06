import type { InvariantIssue } from "./edge-contract-kernel.ts";

const SUBAGENT_REQUEST_ENV_ALLOWED_PATTERN = /^PI_PROVENANCE_[A-Z0-9_]+$/u;
const SUBAGENT_REQUEST_ENV_POLICY_SUMMARY =
  "DispatchSubagentRequest.env only allows PI_PROVENANCE_* keys; control-plane environment such as PATH, NODE_OPTIONS, and PI_CODING_AGENT_DIR is inherited from the parent runtime and cannot be overridden by request env.";

export interface SubagentEnvPolicyIssue extends InvariantIssue {
  key: string;
}

export interface SubagentEnvPolicyResult {
  ok: boolean;
  env?: Record<string, string>;
  issues: SubagentEnvPolicyIssue[];
}

export class SubagentEnvPolicyError extends Error {
  readonly issues: SubagentEnvPolicyIssue[];

  constructor(issues: SubagentEnvPolicyIssue[]) {
    super(formatSubagentEnvPolicyIssues(issues));
    this.name = "SubagentEnvPolicyError";
    this.issues = issues;
  }
}

export function validateSubagentRequestEnv(
  env: Record<string, string> | undefined,
): SubagentEnvPolicyResult {
  if (!env) {
    return { ok: true, issues: [] };
  }

  const issues: SubagentEnvPolicyIssue[] = [];
  const safeEnv: Record<string, string> = {};

  for (const [key, value] of Object.entries(env)) {
    if (!SUBAGENT_REQUEST_ENV_ALLOWED_PATTERN.test(key)) {
      issues.push({
        id: "dispatch.env.key_not_allowed",
        key,
        message: `${SUBAGENT_REQUEST_ENV_POLICY_SUMMARY} Rejected request env key: ${key}.`,
        level: "error",
      });
      continue;
    }

    safeEnv[key] = value;
  }

  if (issues.length > 0) {
    return { ok: false, issues };
  }

  return {
    ok: true,
    env: Object.keys(safeEnv).length > 0 ? safeEnv : undefined,
    issues: [],
  };
}

export function formatSubagentEnvPolicyIssues(issues: SubagentEnvPolicyIssue[]): string {
  return `Invalid dispatch_subagent env: ${issues.map((issue) => `${issue.id} (${issue.message})`).join("; ")}`;
}

export function assertSafeSubagentRequestEnv(
  env: Record<string, string> | undefined,
): Record<string, string> | undefined {
  const result = validateSubagentRequestEnv(env);
  if (!result.ok) {
    throw new SubagentEnvPolicyError(result.issues);
  }
  return result.env;
}
