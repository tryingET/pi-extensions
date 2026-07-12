// summary: "declares PTX policy configuration, load results, and resolved template decisions"
// read_when:
//   - "changing typed policy modes, configuration fields, or policy resolution APIs"

export type PtxPolicyMode = "allow" | "block";
export type PtxPolicyFallback = "passthrough" | "block";

export interface PtxTemplatePolicyOverride {
  policy?: PtxPolicyMode;
  fallback?: PtxPolicyFallback;
}

export interface PtxPolicyConfig {
  defaultPolicy: PtxPolicyMode;
  defaultFallback: PtxPolicyFallback;
  allowlist: string[];
  blocklist: string[];
  templates: Record<string, PtxTemplatePolicyOverride>;
}

export interface LoadedPtxPolicyConfig {
  configPath: string;
  searchBaseDir: string;
  loadedFromFile: boolean;
  config: PtxPolicyConfig;
  error?: unknown;
}

export interface ResolvedTemplatePolicy {
  commandName: string;
  allowed: boolean;
  fallback: PtxPolicyFallback;
  reason: string;
}

export const DEFAULT_PTX_POLICY_CONFIG: Readonly<PtxPolicyConfig>;

export function normalizePtxPolicyConfig(input: unknown): PtxPolicyConfig;
export function loadPtxPolicyConfig(args: { cwd?: string }): Promise<LoadedPtxPolicyConfig>;
export function resolveTemplatePolicy(commandName: string, configInput: unknown): ResolvedTemplatePolicy;
