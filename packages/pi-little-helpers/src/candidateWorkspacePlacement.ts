// summary: resolves candidate worktree roots without losing project ancestry or polluting enclosing repositories.
// read_when:
//   - changing candidate_peer_spawn workspace placement or ancestry-preservation policy.

import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from "node:path";

export type CandidateWorkspacePlacement = "explicit" | "state" | "preserve-ancestry";

export interface CandidateWorkspaceResolution {
  workspaceRoot: string;
  placement: CandidateWorkspacePlacement;
}

export interface CandidateWorkspaceGitResult {
  ok: boolean;
  stdout: string;
}

export type CandidateWorkspaceRunGit = (
  cwd: string,
  args: string[],
) => Promise<CandidateWorkspaceGitResult>;

function slugifyRepo(value: string): string {
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9._-]+/g, "-")
      .replace(/^[._-]+|[._-]+$/g, "")
      .replace(/-{2,}/g, "-") || "repo"
  );
}

export function candidateWorkspaceRepoKey(repoRoot: string): string {
  const repoSlug = slugifyRepo(basename(repoRoot));
  const repoHash = createHash("sha1").update(resolve(repoRoot)).digest("hex").slice(0, 8);
  return `${repoSlug}-${repoHash}`;
}

export function resolveCandidateWorkspaceRoot(options: {
  requestedWorkspaceRoot?: string;
  parentCwd: string;
  repoRoot: string;
  env: NodeJS.ProcessEnv;
}): CandidateWorkspaceResolution {
  const explicit = options.requestedWorkspaceRoot?.trim();
  if (explicit) {
    return {
      workspaceRoot: resolve(
        isAbsolute(explicit) ? explicit : resolve(options.parentCwd, explicit),
      ),
      placement: "explicit",
    };
  }

  const placement = options.env.PI_CANDIDATE_WORKSPACE_PLACEMENT?.trim().toLowerCase();
  const repoKey = candidateWorkspaceRepoKey(options.repoRoot);
  if (!placement || placement === "state") {
    const stateHome = options.env.XDG_STATE_HOME?.trim() || join(homedir(), ".local", "state");
    return {
      workspaceRoot: resolve(stateHome, "pi-quests", "worktrees", repoKey),
      placement: "state",
    };
  }
  if (placement === "preserve-ancestry") {
    return {
      workspaceRoot: join(dirname(resolve(options.repoRoot)), ".pi-candidates", repoKey),
      placement: "preserve-ancestry",
    };
  }
  throw new Error("PI_CANDIDATE_WORKSPACE_PLACEMENT must be 'state' or 'preserve-ancestry'");
}

export function candidatePathIsInside(parent: string, child: string): boolean {
  const rel = relative(resolve(parent), resolve(child));
  return Boolean(rel) && rel !== ".." && !rel.startsWith(`..${sep}`) && !isAbsolute(rel);
}

function findEnclosingGitCheckout(
  workspaceRoot: string,
  pathExists: (path: string) => boolean,
): string | undefined {
  let current = resolve(workspaceRoot);
  while (!pathExists(current)) {
    const parent = dirname(current);
    if (parent === current) break;
    current = parent;
  }
  while (true) {
    if (pathExists(join(current, ".git"))) return current;
    const parent = dirname(current);
    if (parent === current) return undefined;
    current = parent;
  }
}

function stripGitLineTerminator(value: string): string {
  if (value.endsWith("\r\n")) return value.slice(0, -2);
  if (value.endsWith("\n")) return value.slice(0, -1);
  return value;
}

export async function candidateWorkspacePollutionBlocker(options: {
  runGit: CandidateWorkspaceRunGit;
  workspaceRoot: string;
  pathExists?: (path: string) => boolean;
}): Promise<string | undefined> {
  const enclosingMarker = findEnclosingGitCheckout(
    options.workspaceRoot,
    options.pathExists ?? existsSync,
  );
  if (!enclosingMarker) return undefined;

  const enclosingResult = await options.runGit(enclosingMarker, ["rev-parse", "--show-toplevel"]);
  if (!enclosingResult.ok) {
    return `candidate workspace enclosing git checkout cannot be verified: ${enclosingMarker}`;
  }

  const reportedRoot = stripGitLineTerminator(enclosingResult.stdout);
  if (!reportedRoot || resolve(reportedRoot) !== enclosingMarker) {
    return `candidate workspace enclosing git checkout identity mismatch: ${enclosingMarker}`;
  }
  if (resolve(options.workspaceRoot) === enclosingMarker) {
    return `candidate workspace root must not equal its enclosing git checkout: ${enclosingMarker}`;
  }
  if (
    options.workspaceRoot !== enclosingMarker &&
    !candidatePathIsInside(enclosingMarker, options.workspaceRoot)
  ) {
    return `candidate workspace escaped its enclosing git checkout: ${options.workspaceRoot}`;
  }

  const relativeWorkspaceRoot = relative(enclosingMarker, options.workspaceRoot);
  const gitDirectoryPath = `${relativeWorkspaceRoot.split(sep).join("/")}/`;
  const ignoreResult = await options.runGit(enclosingMarker, [
    "check-ignore",
    "--quiet",
    "--",
    gitDirectoryPath,
  ]);
  if (ignoreResult.ok) return undefined;
  return (
    `candidate workspace root is inside enclosing git checkout ${enclosingMarker} ` +
    `but is not ignored: ${options.workspaceRoot}; ignore its candidate root there or choose a workspaceRoot outside that checkout`
  );
}
