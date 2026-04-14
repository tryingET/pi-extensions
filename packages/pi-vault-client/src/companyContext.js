const COMPANY_CONTEXT_ANCHOR_SEGMENTS = new Set(["ai-society", "work", "workspace"]);
const COMPANY_LANE_SEGMENTS = new Set(["owned", "infra", "contrib", "agents", "fork"]);
const COMPANY_PATH_SEGMENT_ALIASES = {
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
function normalizePathSegments(cwd) {
    return cwd
        .split(/[\\/]+/)
        .map((segment) => segment.trim().toLowerCase())
        .filter(Boolean);
}
function detectCompanyFromSegment(segment) {
    if (!segment)
        return null;
    return COMPANY_PATH_SEGMENT_ALIASES[segment] || null;
}
export function inferCompanyFromCwd(cwd) {
    const effectiveCwd = String(cwd || "").trim();
    if (!effectiveCwd)
        return null;
    const segments = normalizePathSegments(effectiveCwd);
    if (segments.length === 0)
        return null;
    for (let index = segments.length - 2; index >= 0; index -= 1) {
        if (!COMPANY_CONTEXT_ANCHOR_SEGMENTS.has(segments[index]))
            continue;
        const anchoredCompany = detectCompanyFromSegment(segments[index + 1]);
        if (anchoredCompany)
            return anchoredCompany;
    }
    for (let index = segments.length - 2; index >= 0; index -= 1) {
        const directCompany = detectCompanyFromSegment(segments[index]);
        if (!directCompany)
            continue;
        if (!COMPANY_LANE_SEGMENTS.has(segments[index + 1]))
            continue;
        return directCompany;
    }
    return null;
}
export function resolveCompanyContext(options) {
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
