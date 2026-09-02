// summary: carries explicit company provenance into visible Pi children whose isolated cwd lost ancestry.
// read_when:
//   - changing visible peer launch environment or worktree company-context routing.

const ANCHORS = new Set(["ai-society", "work", "workspace"]);
const COMPANY_ALIASES: Readonly<Record<string, string>> = {
  core: "core",
  software: "software",
  softwareco: "software",
  finance: "finance",
  financeco: "finance",
  house: "house",
  houseco: "house",
  health: "health",
  healthco: "health",
  teaching: "teaching",
  teachingco: "teaching",
  holding: "holding",
  holdingco: "holding",
};
const SAFE_COMPANY = /^[a-z][a-z0-9_-]{0,63}$/u;

export interface CompanyContextProvenance {
  company: string;
  source: "environment" | "target_cwd" | "parent_cwd";
  sourceCwd?: string;
}

export function inferKnownCompanyFromCwd(cwd: string | undefined): string | undefined {
  if (!cwd) return undefined;
  const segments = cwd
    .split(/[\\/]+/u)
    .map((segment) => segment.trim().toLowerCase())
    .filter(Boolean);
  for (let index = segments.length - 2; index >= 0; index -= 1) {
    if (!ANCHORS.has(segments[index] ?? "")) continue;
    const company = COMPANY_ALIASES[segments[index + 1] ?? ""];
    if (company) return company;
  }
  return undefined;
}

export function resolveChildCompanyContext(options: {
  env: NodeJS.ProcessEnv;
  targetCwd: string;
  parentCwd?: string;
}): CompanyContextProvenance | undefined {
  const explicit = options.env.PI_COMPANY?.trim().toLowerCase();
  if (explicit) {
    if (!SAFE_COMPANY.test(explicit)) return undefined;
    return { company: explicit, source: "environment" };
  }

  const targetCompany = inferKnownCompanyFromCwd(options.targetCwd);
  if (targetCompany) {
    return { company: targetCompany, source: "target_cwd", sourceCwd: options.targetCwd };
  }

  const parentCompany = inferKnownCompanyFromCwd(options.parentCwd);
  if (!parentCompany || !options.parentCwd) return undefined;
  return { company: parentCompany, source: "parent_cwd", sourceCwd: options.parentCwd };
}

export function prefixPiArgsWithCompanyContext(
  piArgs: string[],
  provenance: CompanyContextProvenance | undefined,
): string[] {
  if (!provenance) return piArgs;
  return [
    "env",
    `PI_COMPANY=${provenance.company}`,
    `PI_COMPANY_PROVENANCE=${provenance.source}`,
    ...(provenance.sourceCwd ? [`PI_COMPANY_SOURCE_CWD=${provenance.sourceCwd}`] : []),
    ...piArgs,
  ];
}
