// summary: infer and resolve the active company from environment variables and workspace paths.
// read_when:
//   - debugging company-scoped visibility context or cwd inference precedence.
import { internalCompany } from "./companyRegister.js";
const COMPANY_CONTEXT_ANCHOR_SEGMENTS = new Set(["ai-society", "work", "workspace"]);
const COMPANY_LANE_SEGMENTS = new Set(["owned", "infra", "contrib", "agents", "fork"]);
function normalizePathSegments(cwd) {
    return cwd
        .split(/[\\/]+/)
        .map((segment) => segment.trim().toLowerCase())
        .filter(Boolean);
}
function detectCompanyFromSegment(segment) {
    if (!segment || segment === "none")
        return null;
    return internalCompany(segment);
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
    // One name for every harness: VAULT_CURRENT_COMPANY. PI_COMPANY is not read.
    // A register name or old alias maps to the client's internal name; "none" is no company;
    // a retired or unknown name is passed on unchanged so callers refuse it.
    const explicitVaultCompany = env.VAULT_CURRENT_COMPANY?.trim();
    if (explicitVaultCompany) {
        return {
            company: internalCompany(explicitVaultCompany) ?? explicitVaultCompany,
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
