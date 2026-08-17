/**
summary: "Verified read-only Git worktree provider for the stable context-provider API."
read_when:
  - "Changing live worktree verification, trusted git execution, or path disclosure."
*/
import { execFile } from "node:child_process";
import { stat } from "node:fs/promises";
import { promisify } from "node:util";
import {
  markdownInlineLabel,
  publicOmissionDetail,
  repoRelativePathSafetyIssue,
  subprocessFailureDetail,
} from "./context-intake-safety.js";

const execFileAsync = promisify(execFile);
const TRUSTED_GIT_CANDIDATES = Object.freeze(["/usr/bin/git", "/bin/git", "/usr/local/bin/git"]);
const CONFLICTED_STATUS = new Set(["DD", "AU", "UD", "UA", "DU", "AA", "UU"]);
const MAX_GIT_BUFFER = 64 * 1024;
const GIT_TIMEOUT_MS = 5_000;
const SENSITIVE_FRAGMENT_RE =
  /(?:sk-(?:proj-)?[A-Za-z0-9_-]{16,}|gh[opsu]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|(?:api[_-]?key|password|passwd|secret|token|credential)[=_-][A-Za-z0-9_-]{8,})/iu;

function containsSensitiveFragment(value) {
  return SENSITIVE_FRAGMENT_RE.test(String(value ?? ""));
}

function normalizePath(value) {
  const path = String(value ?? "").replace(/\\/gu, "/");
  return repoRelativePathSafetyIssue(path) || containsSensitiveFragment(path) ? undefined : path;
}

function normalizeBranch(value, fallback) {
  const branch = markdownInlineLabel(value, fallback);
  return containsSensitiveFragment(branch) ? "[redacted branch]" : branch;
}

export function parseGitPorcelainV1Z(value, options = {}) {
  const maxPaths = Number.isFinite(options.maxPaths)
    ? Math.max(0, Math.floor(options.maxPaths))
    : 40;
  const fields = String(value ?? "").split("\0");
  const entries = [];
  let unsafePathCount = 0;

  for (let index = 0; index < fields.length; index += 1) {
    const field = fields[index];
    if (!field || field.length < 3) continue;
    const status = field.slice(0, 2);
    if (status === "!!") continue;
    const path = normalizePath(field.slice(3));
    const renamed = /[RC]/u.test(status);
    const originalPath = renamed ? normalizePath(fields[index + 1]) : undefined;
    if (renamed) index += 1;
    if (!path) unsafePathCount += 1;
    if (renamed && !originalPath) unsafePathCount += 1;
    entries.push({
      status,
      path,
      ...(originalPath ? { originalPath } : {}),
      staged: status !== "??" && status[0] !== " " && !CONFLICTED_STATUS.has(status),
      unstaged: status !== "??" && status[1] !== " " && !CONFLICTED_STATUS.has(status),
      untracked: status === "??",
      conflicted: CONFLICTED_STATUS.has(status),
      renamed,
    });
  }

  const counts = {
    changed: entries.length,
    staged: entries.filter((entry) => entry.staged).length,
    unstaged: entries.filter((entry) => entry.unstaged).length,
    untracked: entries.filter((entry) => entry.untracked).length,
    conflicted: entries.filter((entry) => entry.conflicted).length,
    renamed: entries.filter((entry) => entry.renamed).length,
  };
  const safeEntries = entries.filter((entry) => entry.path);
  const changedPaths = safeEntries.slice(0, maxPaths).map((entry) => ({
    path: entry.path,
    status: entry.status,
    ...(entry.originalPath ? { originalPath: entry.originalPath } : {}),
  }));

  return {
    clean: entries.length === 0,
    counts,
    changedPaths,
    omittedPathCount: unsafePathCount + Math.max(0, safeEntries.length - changedPaths.length),
  };
}

async function resolveTrustedGitExecutable(options = {}) {
  if (typeof options.gitPath === "string" && options.gitPath.trim()) return options.gitPath;
  const statImpl = options.stat ?? stat;
  for (const candidate of options.gitCandidates ?? TRUSTED_GIT_CANDIDATES) {
    try {
      const candidateStat = await statImpl(candidate);
      if (candidateStat?.isFile?.()) return candidate;
    } catch {
      // Continue through fixed trusted candidates.
    }
  }
  return undefined;
}

async function runGit(gitPath, args, options) {
  options.signal?.throwIfAborted?.();
  const exec = options.execFileAsync ?? execFileAsync;
  const result = await exec(gitPath, args, {
    cwd: options.cwd,
    timeout: options.timeoutMs ?? GIT_TIMEOUT_MS,
    maxBuffer: options.maxBuffer ?? MAX_GIT_BUFFER,
    signal: options.signal,
    windowsHide: true,
    encoding: "utf8",
  });
  options.signal?.throwIfAborted?.();
  return String(result?.stdout ?? "");
}

function omission(reason, detail, retryable = false) {
  return {
    provider: "git-worktree",
    reason,
    detail: publicOmissionDetail(detail, `git-worktree ${reason} detail withheld`),
    ...(retryable ? { retryable: true } : {}),
  };
}

export async function collectVerifiedGitWorktreeState(input = {}, options = {}) {
  const cwd = String(input.cwd ?? options.cwd ?? "").trim();
  const maxPaths = Number.isFinite(input.maxPaths) ? Math.max(0, Math.floor(input.maxPaths)) : 40;
  if (!cwd) {
    return {
      ok: false,
      verified: false,
      omissions: [omission("blocked", "cwd was not supplied")],
    };
  }

  const gitPath = await resolveTrustedGitExecutable(options);
  if (!gitPath) {
    return {
      ok: false,
      verified: false,
      omissions: [omission("unavailable", "trusted git executable unavailable", true)],
    };
  }

  try {
    const repoRoot = (
      await runGit(gitPath, ["rev-parse", "--show-toplevel"], {
        ...options,
        cwd,
      })
    ).trim();
    if (!repoRoot) {
      return {
        ok: false,
        verified: false,
        omissions: [omission("not_repository", "git did not return a worktree root")],
      };
    }

    let branch;
    let detached = false;
    try {
      branch = (
        await runGit(gitPath, ["symbolic-ref", "--quiet", "--short", "HEAD"], {
          ...options,
          cwd: repoRoot,
        })
      ).trim();
    } catch (error) {
      options.signal?.throwIfAborted?.();
      detached = true;
      branch = (
        await runGit(gitPath, ["rev-parse", "--short", "HEAD"], {
          ...options,
          cwd: repoRoot,
        })
      ).trim();
      void error;
    }

    const porcelain = await runGit(
      gitPath,
      ["status", "--porcelain=v1", "-z", "--untracked-files=normal"],
      { ...options, cwd: repoRoot },
    );
    const parsed = parseGitPorcelainV1Z(porcelain, { maxPaths });
    let cwdRelative = "";
    try {
      cwdRelative = (
        await runGit(gitPath, ["rev-parse", "--show-prefix"], {
          ...options,
          cwd,
        })
      ).trim();
    } catch {
      // The snapshot remains verified without this convenience field.
    }

    return {
      ok: true,
      verified: true,
      provider: "git-worktree",
      providerVersion: "v1",
      authority: "Live read-only git metadata for the current worktree.",
      generatedAt: new Date().toISOString(),
      state: {
        verified: true,
        branch: normalizeBranch(branch, detached ? "detached" : "unknown"),
        detached,
        clean: parsed.clean,
        counts: parsed.counts,
        changedPaths: parsed.changedPaths,
        omittedPathCount: parsed.omittedPathCount,
        ...(cwdRelative && !repoRelativePathSafetyIssue(cwdRelative.replace(/\/$/u, ""))
          ? { cwdRelative: cwdRelative.replace(/\/$/u, "") }
          : {}),
      },
      omissions:
        parsed.omittedPathCount > 0
          ? [
              omission(
                "budget",
                `${parsed.omittedPathCount} changed path(s) omitted by safety or result bounds`,
              ),
            ]
          : [],
      nonAuthorization:
        "The provider executed read-only git inspection only; it did not stage, reset, commit, checkout, or mutate the worktree.",
    };
  } catch (error) {
    options.signal?.throwIfAborted?.();
    return {
      ok: false,
      verified: false,
      provider: "git-worktree",
      providerVersion: "v1",
      authority: "Live read-only git metadata for the current worktree.",
      omissions: [
        omission(
          "unavailable",
          subprocessFailureDetail("git worktree inspection", error, "read"),
          true,
        ),
      ],
      nonAuthorization:
        "The failed provider attempt did not stage, reset, commit, checkout, or mutate the worktree.",
    };
  }
}

export function createGitWorktreeProvider(deps = {}) {
  return Object.freeze({
    apiVersion: 1,
    id: "git-worktree",
    version: "v1",
    authority: "Live read-only git metadata for the current worktree.",
    async collect(input = {}, options = {}) {
      const result = await collectVerifiedGitWorktreeState(input, { ...deps, ...options });
      if (!result.ok)
        return { ok: false, items: [], omissions: result.omissions, state: result.state };
      const state = result.state;
      const content = [
        `branch=${state.branch}${state.detached ? " (detached)" : ""}`,
        `clean=${state.clean}`,
        `staged=${state.counts.staged}`,
        `unstaged=${state.counts.unstaged}`,
        `untracked=${state.counts.untracked}`,
        `conflicted=${state.counts.conflicted}`,
        ...(state.changedPaths.length > 0
          ? [
              `paths=${state.changedPaths.map((entry) => `${entry.status} ${entry.path}`).join(", ")}`,
            ]
          : []),
      ].join("\n");
      return {
        ok: true,
        state,
        items: [
          {
            id: "git-worktree:status",
            kind: "status",
            content,
            provenance: { provider: "git-worktree", commandClass: "read-only-status" },
            authority: result.authority,
            rationale: "verified current worktree posture for bounded continuation context",
            freshness: "live git command",
          },
        ],
        omissions: result.omissions,
      };
    },
  });
}
