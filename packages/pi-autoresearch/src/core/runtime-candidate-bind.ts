import { existsSync } from "node:fs";
import path from "node:path";

import { shellSingleQuote } from "./runtime-autoplan.ts";
import {
  filterAutoresearchLocalArtifactPaths,
  isNonEmptyString,
  nullIfEmpty,
  parseGitStatusPath,
  runGitForCandidateBind,
  splitNonEmptyLines,
  splitNonEmptyStatusLines,
  uniqueStrings,
} from "./runtime-candidate-bind-git.ts";
import { stringOrNull } from "./runtime-common.ts";
import {
  AUTORESEARCH_CANDIDATE_BIND_TOOL_NAME,
  AUTORESEARCH_CANDIDATE_DECISION_TOOL_NAME,
  AUTORESEARCH_RUN_TOOL_NAME,
} from "./runtime-constants.ts";
import type {
  AutoresearchCandidateBindInspection,
  AutoresearchCandidateBindingSource,
  AutoresearchCandidateBindPlan,
  AutoresearchCandidateBindReadiness,
  BuildAutoresearchCandidateBindInput,
} from "./runtime-model.ts";
import { buildAutoresearchRuntimeStatus } from "./runtime-status.ts";
import { formatNullableBoolean, formatTargetFiles } from "./runtime-status-format.ts";

export function buildAutoresearchCandidateBindPlan(
  input: BuildAutoresearchCandidateBindInput,
): AutoresearchCandidateBindPlan {
  const cwd = path.resolve(input.cwd);
  const candidateWorktree = path.resolve(cwd, input.candidateWorktree ?? cwd);
  const candidateSource = input.candidateSource ?? "manual";
  const inspection = inspectAutoresearchCandidateWorktree({
    cwd,
    candidateWorktree,
    candidateBranch: input.candidateBranch,
    candidateBaseRef: input.candidateBaseRef,
  });
  const description =
    stringOrNull(input.description) ??
    `Measure bound candidate ${inspection.branch ?? path.basename(candidateWorktree)}`;
  const exactNextCalls = buildAutoresearchCandidateBindNextCalls({
    cwd,
    description,
    candidateSource,
    inspection,
  });
  const plannedCommands = buildAutoresearchCandidateBindCommandPlan({ cwd, inspection });

  return {
    cwd,
    action: input.action ?? "plan_run",
    candidateSource,
    description,
    inspection,
    exactNextCalls,
    plannedCommands,
    boundaryWarnings: [...AUTORESEARCH_CANDIDATE_BIND_BOUNDARY_WARNINGS],
    status: buildAutoresearchRuntimeStatus(cwd, { persistSnapshot: false }),
  };
}

export function formatAutoresearchCandidateBindPlan(result: AutoresearchCandidateBindPlan): string {
  return [
    "# PI-AUTORESEARCH CANDIDATE BIND PLAN",
    "",
    "Read-only / plan-only candidate intake surface. It inspects a controller-verified worktree/branch and prepares the exact measurement call; it does not run benchmarks, merge, delete worktrees, reset worktrees, spawn peers, write AK/KES/evidence, or promote results.",
    "",
    `- cwd: ${result.cwd}`,
    `- action: ${result.action}`,
    `- candidate source: ${result.candidateSource}`,
    `- measurement description: ${result.description}`,
    "",
    "## Candidate inspection",
    `- candidate worktree: ${result.inspection.candidateWorktree}`,
    `- exists: ${result.inspection.exists ? "yes" : "no"}`,
    `- git worktree: ${result.inspection.isGitWorktree ? "yes" : "no"}`,
    `- same repository as cwd: ${formatNullableBoolean(result.inspection.sameRepository)}`,
    `- repository root: ${result.inspection.repositoryRoot ?? "(unknown)"}`,
    `- branch/ref: ${result.inspection.branch ?? "(unknown)"}`,
    `- head: ${result.inspection.head ?? "(unknown)"}`,
    `- base ref: ${result.inspection.baseRef ?? "(not supplied; provide candidateBaseRef for base-relative diffs and rewind plans)"}`,
    `- base ref source: ${result.inspection.baseRefSource ?? "(none)"}`,
    `- base resolved: ${result.inspection.baseResolved ? "yes" : "no"}`,
    `- files changed: ${formatTargetFiles(result.inspection.filesChanged)}`,
    `- diff summary: ${result.inspection.diffSummary}`,
    `- intake readiness: ${result.inspection.readiness}`,
    `- readiness reasons: ${result.inspection.readinessReasons.length > 0 ? result.inspection.readinessReasons.join("; ") : "none"}`,
    "",
    "## Read-only inspection commands",
    ...result.plannedCommands.map((command) => `- ${command}`),
    "",
    "## Exact next calls",
    ...result.exactNextCalls.map((call) => `- ${call}`),
    "",
    "## Warnings",
    ...(result.inspection.warnings.length > 0
      ? result.inspection.warnings.map((warning) => `- ${warning}`)
      : ["- none"]),
    "",
    "## Boundary warnings",
    ...result.boundaryWarnings.map((warning) => `- ${warning}`),
  ].join("\n");
}

const AUTORESEARCH_CANDIDATE_BIND_BOUNDARY_WARNINGS = [
  "candidate bind is intake only; it prepares measurement metadata and does not execute the benchmark",
  "controller verification remains required for candidate source, base ref, diff summary, and changed files",
  "worktree lifecycle remains the keep/discard/rewind primitive; bind does not merge, delete, reset, or promote",
  "durable promotion and evidence writes remain external owner-surface actions after explicit review",
] as const;

function inspectAutoresearchCandidateWorktree(input: {
  cwd: string;
  candidateWorktree: string;
  candidateBranch?: string | null;
  candidateBaseRef?: string | null;
}): AutoresearchCandidateBindInspection {
  const warnings: string[] = [];
  const exists = existsSync(input.candidateWorktree);
  if (!exists) {
    warnings.push(
      "candidate worktree path does not exist; create/select a worktree before measurement",
    );
    return {
      candidateWorktree: input.candidateWorktree,
      exists,
      isGitWorktree: false,
      sameRepository: null,
      repositoryRoot: null,
      branch: stringOrNull(input.candidateBranch),
      head: null,
      baseRef: stringOrNull(input.candidateBaseRef),
      baseRefSource: stringOrNull(input.candidateBaseRef) ? "supplied" : null,
      baseResolved: false,
      statusShort: [],
      filesChanged: [],
      diffSummary: "candidate worktree is unavailable",
      readiness: "blocked",
      readinessReasons: ["candidate worktree path does not exist"],
      warnings,
    };
  }

  const inside = runGitForCandidateBind(input.candidateWorktree, [
    "rev-parse",
    "--is-inside-work-tree",
  ]);
  const isGitWorktree = inside.ok && inside.stdout.trim() === "true";
  if (!isGitWorktree) {
    warnings.push("candidate path exists but is not a git worktree");
  }

  const repositoryRoot = isGitWorktree
    ? nullIfEmpty(
        runGitForCandidateBind(input.candidateWorktree, ["rev-parse", "--show-toplevel"]).stdout,
      )
    : null;
  const cwdCommonDir = runGitForCandidateBind(input.cwd, ["rev-parse", "--git-common-dir"]);
  const candidateCommonDir = runGitForCandidateBind(input.candidateWorktree, [
    "rev-parse",
    "--git-common-dir",
  ]);
  const sameRepository =
    cwdCommonDir.ok && candidateCommonDir.ok
      ? path.resolve(input.cwd, cwdCommonDir.stdout.trim()) ===
        path.resolve(input.candidateWorktree, candidateCommonDir.stdout.trim())
      : null;
  if (sameRepository === false) {
    warnings.push("candidate worktree does not appear to belong to the same git repository as cwd");
  }

  const detectedBranch = isGitWorktree
    ? nullIfEmpty(
        runGitForCandidateBind(input.candidateWorktree, ["branch", "--show-current"]).stdout,
      )
    : null;
  const head = isGitWorktree
    ? nullIfEmpty(
        runGitForCandidateBind(input.candidateWorktree, ["rev-parse", "--short", "HEAD"]).stdout,
      )
    : null;
  const suppliedBaseRef = stringOrNull(input.candidateBaseRef);
  const inferredBaseRef = suppliedBaseRef
    ? null
    : inferAutoresearchCandidateBindBaseRef(input.candidateWorktree);
  const baseRef = suppliedBaseRef ?? inferredBaseRef?.baseRef ?? null;
  const baseRefSource = suppliedBaseRef ? "supplied" : (inferredBaseRef?.source ?? null);
  const baseCheck = baseRef
    ? runGitForCandidateBind(input.candidateWorktree, [
        "rev-parse",
        "--verify",
        `${baseRef}^{commit}`,
      ])
    : null;
  const baseResolved = Boolean(baseCheck?.ok);
  if (suppliedBaseRef && !baseResolved) {
    warnings.push(
      `candidateBaseRef ${JSON.stringify(suppliedBaseRef)} did not resolve in the candidate worktree`,
    );
  }
  if (!suppliedBaseRef && inferredBaseRef) {
    warnings.push(
      `candidateBaseRef was inferred from ${inferredBaseRef.source}; verify before destructive rewind planning`,
    );
  }
  if (!baseRef) {
    warnings.push(
      "candidateBaseRef was not supplied and could not be inferred; diff summary falls back to working-tree status and rewind plans cannot be complete",
    );
  }

  const statusShort = isGitWorktree
    ? splitNonEmptyStatusLines(
        runGitForCandidateBind(input.candidateWorktree, [
          "status",
          "--short",
          "--untracked-files=all",
        ]).stdout,
      )
    : [];
  const filesChanged = isGitWorktree
    ? deriveCandidateBindFilesChanged({
        worktree: input.candidateWorktree,
        baseRef,
        baseResolved,
        statusShort,
      })
    : [];
  const diffSummary = isGitWorktree
    ? deriveCandidateBindDiffSummary({
        worktree: input.candidateWorktree,
        baseRef,
        baseResolved,
        statusShort,
        filesChanged,
      })
    : "candidate path is not a git worktree";
  const branch = stringOrNull(input.candidateBranch) ?? detectedBranch;
  const readiness = deriveAutoresearchCandidateBindReadiness({
    cwd: input.cwd,
    candidateWorktree: input.candidateWorktree,
    exists,
    isGitWorktree,
    sameRepository,
    branch,
    baseResolved,
    filesChanged,
  });

  return {
    candidateWorktree: input.candidateWorktree,
    exists,
    isGitWorktree,
    sameRepository,
    repositoryRoot,
    branch,
    head,
    baseRef,
    baseRefSource,
    baseResolved,
    statusShort,
    filesChanged,
    diffSummary,
    readiness: readiness.readiness,
    readinessReasons: readiness.reasons,
    warnings,
  };
}

function deriveAutoresearchCandidateBindReadiness(input: {
  cwd: string;
  candidateWorktree: string;
  exists: boolean;
  isGitWorktree: boolean;
  sameRepository: boolean | null;
  branch: string | null;
  baseResolved: boolean;
  filesChanged: string[];
}): { readiness: AutoresearchCandidateBindReadiness; reasons: string[] } {
  const blockedReasons: string[] = [];
  const reviewReasons: string[] = [];
  if (!input.exists) blockedReasons.push("candidate worktree path does not exist");
  if (!input.isGitWorktree) blockedReasons.push("candidate path is not a git worktree");
  if (input.sameRepository === false) {
    blockedReasons.push("candidate worktree is not in the same git repository as cwd");
  }
  if (blockedReasons.length > 0) return { readiness: "blocked", reasons: blockedReasons };

  if (!input.baseResolved) {
    reviewReasons.push("base ref is missing or unresolved; verify before measurement/rewind");
  }
  if (input.filesChanged.length === 0) {
    reviewReasons.push("no candidate files were detected relative to the selected base/status");
  }
  if (input.branch === "main" || input.branch === "master") {
    reviewReasons.push(
      "candidate appears to be on a trunk branch; prefer an isolated candidate branch/worktree",
    );
  }
  if (path.resolve(input.cwd) === path.resolve(input.candidateWorktree)) {
    reviewReasons.push(
      "candidate worktree is the controller cwd; prefer an isolated candidate worktree when possible",
    );
  }
  if (input.filesChanged.length > 25) {
    reviewReasons.push("candidate touches many files; verify scope before measurement");
  }

  return reviewReasons.length > 0
    ? { readiness: "needs_review", reasons: reviewReasons }
    : { readiness: "ready", reasons: [] };
}

function buildAutoresearchCandidateBindNextCalls(input: {
  cwd: string;
  description: string;
  candidateSource: AutoresearchCandidateBindingSource;
  inspection: AutoresearchCandidateBindInspection;
}): string[] {
  const decisionStatusCall = `${AUTORESEARCH_CANDIDATE_DECISION_TOOL_NAME}({ cwd: ${JSON.stringify(input.cwd)}, action: "status" })`;
  if (input.inspection.readiness !== "ready") {
    const reviewFields = [
      `cwd: ${JSON.stringify(input.cwd)}`,
      `action: "plan_run"`,
      `candidateSource: ${JSON.stringify(input.candidateSource)}`,
      `candidateWorktree: ${JSON.stringify(input.inspection.candidateWorktree)}`,
      `description: ${JSON.stringify(input.description)}`,
    ];
    if (input.inspection.branch) {
      reviewFields.push(`candidateBranch: ${JSON.stringify(input.inspection.branch)}`);
    }
    if (input.inspection.baseRef) {
      reviewFields.push(`candidateBaseRef: ${JSON.stringify(input.inspection.baseRef)}`);
    }
    return [
      `${AUTORESEARCH_CANDIDATE_BIND_TOOL_NAME}({ ${reviewFields.join(", ")} })`,
      decisionStatusCall,
    ];
  }

  const runFields = [
    `cwd: ${JSON.stringify(input.cwd)}`,
    `description: ${JSON.stringify(input.description)}`,
    `candidateSource: ${JSON.stringify(input.candidateSource)}`,
    `candidateWorktree: ${JSON.stringify(input.inspection.candidateWorktree)}`,
    `candidateBaseRef: ${JSON.stringify(input.inspection.baseRef)}`,
    `candidateDiffSummary: ${JSON.stringify(input.inspection.diffSummary)}`,
    `candidateFilesChanged: ${JSON.stringify(input.inspection.filesChanged)}`,
  ];
  if (input.inspection.branch) {
    runFields.splice(4, 0, `candidateBranch: ${JSON.stringify(input.inspection.branch)}`);
  }
  return [`${AUTORESEARCH_RUN_TOOL_NAME}({ ${runFields.join(", ")} })`, decisionStatusCall];
}

function buildAutoresearchCandidateBindCommandPlan(input: {
  cwd: string;
  inspection: AutoresearchCandidateBindInspection;
}): string[] {
  const worktree = input.inspection.candidateWorktree;
  const commands = [
    `git -C ${shellSingleQuote(worktree)} status --short --untracked-files=all # read-only candidate preflight`,
  ];
  if (input.inspection.baseRef) {
    commands.push(
      `git -C ${shellSingleQuote(worktree)} diff --stat --compact-summary ${shellSingleQuote(input.inspection.baseRef)}...HEAD # read-only base-relative summary`,
    );
    commands.push(
      `git -C ${shellSingleQuote(worktree)} diff --name-only ${shellSingleQuote(input.inspection.baseRef)}...HEAD # read-only candidate files`,
    );
  } else {
    commands.push(
      `git -C ${shellSingleQuote(input.cwd)} worktree list --porcelain # read-only; choose candidate worktree and base ref`,
    );
  }
  return commands;
}

function inferAutoresearchCandidateBindBaseRef(
  worktree: string,
): { baseRef: string; source: string } | null {
  const upstream = nullIfEmpty(
    runGitForCandidateBind(worktree, [
      "rev-parse",
      "--abbrev-ref",
      "--symbolic-full-name",
      "@{upstream}",
    ]).stdout,
  );
  const candidates = uniqueStrings(
    [upstream, "origin/main", "main", "origin/master", "master"].filter(isNonEmptyString),
  );
  for (const candidate of candidates) {
    const refCheck = runGitForCandidateBind(worktree, [
      "rev-parse",
      "--verify",
      `${candidate}^{commit}`,
    ]);
    if (!refCheck.ok) continue;
    const mergeBase = nullIfEmpty(
      runGitForCandidateBind(worktree, ["merge-base", "HEAD", candidate]).stdout,
    );
    if (mergeBase) return { baseRef: mergeBase, source: `merge-base(HEAD, ${candidate})` };
  }
  return null;
}

function deriveCandidateBindFilesChanged(input: {
  worktree: string;
  baseRef: string | null;
  baseResolved: boolean;
  statusShort: string[];
}): string[] {
  if (input.baseRef && input.baseResolved) {
    const baseFiles = splitNonEmptyLines(
      runGitForCandidateBind(input.worktree, ["diff", "--name-only", `${input.baseRef}...HEAD`])
        .stdout,
    );
    const statusFiles = input.statusShort.map(parseGitStatusPath).filter(isNonEmptyString);
    return filterAutoresearchLocalArtifactPaths(uniqueStrings([...baseFiles, ...statusFiles]));
  }
  return filterAutoresearchLocalArtifactPaths(
    uniqueStrings(input.statusShort.map(parseGitStatusPath).filter(isNonEmptyString)),
  );
}

function deriveCandidateBindDiffSummary(input: {
  worktree: string;
  baseRef: string | null;
  baseResolved: boolean;
  statusShort: string[];
  filesChanged: string[];
}): string {
  if (input.baseRef && input.baseResolved) {
    const summary = splitNonEmptyLines(
      runGitForCandidateBind(input.worktree, [
        "diff",
        "--stat",
        "--compact-summary",
        `${input.baseRef}...HEAD`,
      ]).stdout,
    ).join("; ");
    return (
      summary ||
      `base-relative diff is empty; ${input.statusShort.length} working-tree status line(s)`
    );
  }
  return `${input.filesChanged.length} changed path(s) from working-tree status; provide candidateBaseRef for base-relative diff summary`;
}
