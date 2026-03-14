import { existsSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import type {
  OntologyScope,
  RepoKind,
  ResolvedOntologyTarget,
  WorkspaceContext,
} from "../core/contracts.ts";
import type { ResolveTargetParams, WorkspacePort } from "../ports/workspace-port.ts";

const COMPANY_ALIASES: Record<string, string> = {
  holding: "holdingco",
  holdingco: "holdingco",
  software: "softwareco",
  softwareco: "softwareco",
  health: "healthco",
  healthco: "healthco",
};
const DEFAULT_WORKSPACE_ROOT = path.join(homedir(), "ai-society");
const DEFAULT_WORKSPACE_REF_MODE = "loose" as const;

export function createWorkspacePort(): WorkspacePort {
  return {
    async detect(cwd: string): Promise<WorkspaceContext> {
      const workspaceRoot = resolveWorkspaceRoot();
      const currentRepoPath = findRepoRoot(cwd) ?? cwd;
      const currentCompany =
        inferCompany(cwd) ??
        inferCompany(currentRepoPath) ??
        normalizeCompanyAlias(process.env.PI_COMPANY?.trim()) ??
        undefined;
      return {
        cwd: path.resolve(cwd),
        workspaceRoot,
        workspaceRefMode: resolveWorkspaceRefMode(),
        currentRepoPath,
        currentRepoHasOntology: hasOntologyManifest(currentRepoPath),
        currentRepoKind: classifyRepo(currentRepoPath, workspaceRoot, currentCompany),
        currentCompany,
      };
    },
    async resolveTarget(params: ResolveTargetParams): Promise<ResolvedOntologyTarget> {
      const context = await this.detect(params.cwd);
      return resolveOntologyTarget(context, params);
    },
  };
}

function resolveWorkspaceRoot(): string {
  return path.resolve(
    process.env.PI_ONTOLOGY_WORKSPACE_ROOT?.trim() ||
      process.env.ROCS_WORKSPACE_ROOT?.trim() ||
      DEFAULT_WORKSPACE_ROOT,
  );
}

function resolveWorkspaceRefMode(): "strict" | "loose" {
  const raw = (
    process.env.PI_ONTOLOGY_WORKSPACE_REF_MODE ||
    process.env.ROCS_WORKSPACE_REF_MODE ||
    DEFAULT_WORKSPACE_REF_MODE
  )
    .trim()
    .toLowerCase();
  return raw === "strict" ? "strict" : "loose";
}

function findRepoRoot(start: string): string | undefined {
  let current = path.resolve(start);
  while (true) {
    if (existsSync(path.join(current, ".git"))) return current;
    const parent = path.dirname(current);
    if (parent === current) return undefined;
    current = parent;
  }
}

function hasOntologyManifest(repoPath: string): boolean {
  return existsSync(path.join(repoPath, "ontology", "manifest.yaml"));
}

function inferCompany(inputPath: string): string | undefined {
  const normalized = path.resolve(inputPath);
  const parts = normalized.split(path.sep).filter(Boolean);
  for (const part of parts) {
    const alias = COMPANY_ALIASES[part];
    if (alias) return alias;
  }
  return undefined;
}

function normalizeCompanyAlias(value: string | undefined): string | undefined {
  if (!value) return undefined;
  return COMPANY_ALIASES[value] ?? value;
}

function classifyRepo(repoPath: string, workspaceRoot: string, currentCompany?: string): RepoKind {
  const normalized = path.resolve(repoPath);
  if (normalized === path.resolve(workspaceRoot, "core", "ontology-kernel")) return "core";
  if (currentCompany && normalized === path.resolve(workspaceRoot, currentCompany, "ontology"))
    return "company";
  if (hasOntologyManifest(normalized)) return "repo";
  return "none";
}

function resolveOntologyTarget(
  context: WorkspaceContext,
  params: ResolveTargetParams,
): ResolvedOntologyTarget {
  const requestedScope = params.scope ?? "auto";
  const reasons: string[] = [];

  if (params.targetRepo?.trim()) {
    const repoPath = path.resolve(params.targetRepo.trim());
    const repoKind = classifyRepo(repoPath, context.workspaceRoot, context.currentCompany);
    ensureOntologyTarget(repoPath, repoKind, requestedScope, context.currentCompany);
    reasons.push("explicit target_repo override");
    return buildResolvedTarget(
      context,
      repoPath,
      repoKind,
      requestedScope === "auto" ? inferScopeFromRepoKind(repoKind) : requestedScope,
      reasons,
    );
  }

  if (requestedScope === "repo") {
    if (!context.currentRepoHasOntology) {
      throw new Error("scope=repo requires the current repo to contain ontology/manifest.yaml");
    }
    reasons.push("explicit repo scope");
    return buildResolvedTarget(context, context.currentRepoPath, "repo", "repo", reasons);
  }

  if (requestedScope === "company") {
    const repoPath = resolveCompanyOntologyRepo(context);
    reasons.push("explicit company scope");
    return buildResolvedTarget(context, repoPath, "company", "company", reasons);
  }

  if (requestedScope === "core") {
    const repoPath = resolveCoreOntologyRepo(context);
    reasons.push("explicit core scope");
    return buildResolvedTarget(context, repoPath, "core", "core", reasons);
  }

  if (context.currentRepoKind === "company") {
    reasons.push("auto scope inherited current company ontology repo");
    return buildResolvedTarget(context, context.currentRepoPath, "company", "company", reasons);
  }

  if (context.currentRepoKind === "core") {
    reasons.push("auto scope inherited current core ontology repo");
    return buildResolvedTarget(context, context.currentRepoPath, "core", "core", reasons);
  }

  const targetId = params.targetId?.trim();
  if (targetId?.startsWith("core.")) {
    reasons.push("auto scope inferred from core.* target id");
    return buildResolvedTarget(context, resolveCoreOntologyRepo(context), "core", "core", reasons);
  }

  if (targetId?.startsWith("co.")) {
    reasons.push("auto scope inferred from co.* target id");
    return buildResolvedTarget(
      context,
      resolveCompanyOntologyRepo(context),
      "company",
      "company",
      reasons,
    );
  }

  if (params.artifactKind === "bridge" || params.artifactKind === "system4d") {
    if (context.currentRepoHasOntology) {
      reasons.push(`auto scope selected current repo for ${params.artifactKind}`);
      return buildResolvedTarget(context, context.currentRepoPath, "repo", "repo", reasons);
    }
  }

  if (context.currentRepoHasOntology) {
    reasons.push("auto scope selected current repo because ontology manifest exists");
    return buildResolvedTarget(context, context.currentRepoPath, "repo", "repo", reasons);
  }

  if (context.currentCompany) {
    reasons.push("auto scope fell back to current company overlay");
    return buildResolvedTarget(
      context,
      resolveCompanyOntologyRepo(context),
      "company",
      "company",
      reasons,
    );
  }

  throw new Error(
    "unable to auto-resolve ontology target; set scope explicitly or run from a company-scoped repo",
  );
}

function resolveCompanyOntologyRepo(context: WorkspaceContext): string {
  if (!context.currentCompany) {
    throw new Error("company scope requires PI_COMPANY or a company-scoped cwd");
  }
  const repoPath = path.resolve(context.workspaceRoot, context.currentCompany, "ontology");
  ensureOntologyTarget(repoPath, "company", "company", context.currentCompany);
  return repoPath;
}

function resolveCoreOntologyRepo(context: WorkspaceContext): string {
  const repoPath = path.resolve(context.workspaceRoot, "core", "ontology-kernel");
  ensureOntologyTarget(repoPath, "core", "core", context.currentCompany);
  return repoPath;
}

function ensureOntologyTarget(
  repoPath: string,
  repoKind: RepoKind,
  requestedScope: OntologyScope,
  currentCompany?: string,
): void {
  if (!existsSync(repoPath)) {
    throw new Error(`ontology target repo does not exist: ${repoPath}`);
  }
  if (!hasOntologyManifest(repoPath)) {
    throw new Error(`ontology target repo is missing ontology/manifest.yaml: ${repoPath}`);
  }
  if (requestedScope === "company" && repoKind !== "company") {
    throw new Error(`scope=company resolved to a non-company ontology repo: ${repoPath}`);
  }
  if (requestedScope === "core" && repoKind !== "core") {
    throw new Error(`scope=core resolved to a non-core ontology repo: ${repoPath}`);
  }
  if (requestedScope === "company" && !currentCompany) {
    throw new Error("company scope requires PI_COMPANY or a company-scoped cwd");
  }
}

function inferScopeFromRepoKind(repoKind: RepoKind): Exclude<OntologyScope, "auto"> {
  if (repoKind === "company") return "company";
  if (repoKind === "core") return "core";
  return "repo";
}

function buildResolvedTarget(
  context: WorkspaceContext,
  repoPath: string,
  repoKind: RepoKind,
  scope: Exclude<OntologyScope, "auto">,
  reasons: string[],
): ResolvedOntologyTarget {
  return {
    scope,
    repoPath,
    repoKind,
    workspaceRoot: context.workspaceRoot,
    workspaceRefMode: context.workspaceRefMode,
    currentCompany: context.currentCompany,
    reasons,
    externalToCurrentRepo: path.resolve(repoPath) !== path.resolve(context.currentRepoPath),
  };
}
