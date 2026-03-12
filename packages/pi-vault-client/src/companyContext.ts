import type { Company } from "./vaultTypes.js";

const COMPANY_PATH_SEGMENT_ALIASES: Record<string, Company> = {
  core: "core",
  software: "software",
  softwareco: "software",
  finance: "finance",
  house: "house",
  health: "health",
  teaching: "teaching",
  holding: "holding",
};

function normalizePathSegments(cwd: string): string[] {
  return cwd
    .split(/[\\/]+/)
    .map((segment) => segment.trim().toLowerCase())
    .filter(Boolean);
}

function detectCompanyFromSegment(segment?: string): Company | null {
  if (!segment) return null;
  return COMPANY_PATH_SEGMENT_ALIASES[segment] || null;
}

export function inferCompanyFromCwd(cwd?: string): Company | null {
  const effectiveCwd = String(cwd || "").trim();
  if (!effectiveCwd) return null;

  const segments = normalizePathSegments(effectiveCwd);
  if (segments.length === 0) return null;

  const workspaceAnchorIndex = segments.lastIndexOf("ai-society");
  if (workspaceAnchorIndex >= 0) {
    const anchoredCompany = detectCompanyFromSegment(segments[workspaceAnchorIndex + 1]);
    if (anchoredCompany) return anchoredCompany;
  }

  for (const segment of segments) {
    const company = detectCompanyFromSegment(segment);
    if (company) return company;
  }

  return null;
}

export function resolveCompanyContext(options?: {
  cwd?: string;
  defaultCompany?: string;
  env?: NodeJS.ProcessEnv;
  processCwd?: string;
}): { company: string; source: string } {
  const env = options?.env || process.env;
  const explicitPiCompany = env.PI_COMPANY?.trim();
  if (explicitPiCompany) {
    return { company: explicitPiCompany, source: "env:PI_COMPANY" };
  }

  const explicitVaultCompany = env.VAULT_CURRENT_COMPANY?.trim();
  if (explicitVaultCompany) {
    return {
      company: explicitVaultCompany,
      source: "env:VAULT_CURRENT_COMPANY",
    };
  }

  const effectiveCwd = options?.cwd?.trim() || options?.processCwd?.trim() || process.cwd();
  const inferredCompany = inferCompanyFromCwd(effectiveCwd);
  if (inferredCompany) {
    return { company: inferredCompany, source: `cwd:${effectiveCwd}` };
  }

  return {
    company: options?.defaultCompany || "core",
    source: "contract-default",
  };
}
