// ---
// summary: "Reads and formats compact Starship-style Git state for the runtime footer."
// read_when:
//   - "Changing footer branch, ahead/behind, or working-tree status behavior."
// ---

const DEFAULT_GIT_REFRESH_MS = 2_000;
const MAX_BRANCH_CHARACTERS = 24;

export interface GitFooterSummary {
  branch?: string;
  hasUpstream: boolean;
  ahead: number;
  behind: number;
  conflicted: number;
  stashed: number;
  deleted: number;
  renamed: number;
  modified: number;
  staged: number;
  untracked: number;
}

export interface GitFooterRefreshState {
  latest?: GitFooterSummary;
  lastProbeAt: number;
  probeInFlight?: Promise<void>;
  refreshTimer?: ReturnType<typeof setTimeout>;
  refreshPending: boolean;
  generation: number;
  disposed: boolean;
}

export type GitFooterExec = (
  command: string,
  args: string[],
  options: { cwd: string; timeout: number },
) => Promise<{ stdout: string; code: number }>;

function emptyGitFooterSummary(): GitFooterSummary {
  return {
    hasUpstream: false,
    ahead: 0,
    behind: 0,
    conflicted: 0,
    stashed: 0,
    deleted: 0,
    renamed: 0,
    modified: 0,
    staged: 0,
    untracked: 0,
  };
}

function parseCount(value: string | undefined): number {
  const parsed = Number.parseInt(value || "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

export function parseGitStatusPorcelainV2(output: string): GitFooterSummary {
  const summary = emptyGitFooterSummary();

  for (const line of output.split("\n")) {
    if (line.startsWith("# branch.head ")) {
      const branch = line.slice("# branch.head ".length).trim();
      summary.branch = branch === "(detached)" ? "detached" : branch;
      continue;
    }
    if (line.startsWith("# branch.upstream ")) {
      summary.hasUpstream = true;
      continue;
    }
    if (line.startsWith("# branch.ab ")) {
      const match = line.match(/^# branch\.ab \+(\d+) -(\d+)$/);
      if (match) {
        summary.ahead = parseCount(match[1]);
        summary.behind = parseCount(match[2]);
      }
      continue;
    }
    if (line.startsWith("# stash ")) {
      summary.stashed = parseCount(line.slice("# stash ".length));
      continue;
    }
    if (line.startsWith("u ")) {
      summary.conflicted += 1;
      continue;
    }
    if (line.startsWith("? ")) {
      summary.untracked += 1;
      continue;
    }
    if (!(line.startsWith("1 ") || line.startsWith("2 "))) {
      continue;
    }

    const indexStatus = line[2] || ".";
    const worktreeStatus = line[3] || ".";
    if (indexStatus === "D" || worktreeStatus === "D") summary.deleted += 1;
    if ("RC".includes(indexStatus) || "RC".includes(worktreeStatus)) summary.renamed += 1;
    if ("MT".includes(worktreeStatus)) summary.modified += 1;
    if ("AMT".includes(indexStatus)) summary.staged += 1;
  }

  return summary;
}

function hasWorkingTreeStatus(summary: GitFooterSummary): boolean {
  return (
    summary.conflicted > 0 ||
    summary.stashed > 0 ||
    summary.deleted > 0 ||
    summary.renamed > 0 ||
    summary.modified > 0 ||
    summary.staged > 0 ||
    summary.untracked > 0
  );
}

export function formatGitStatusSymbols(summary?: GitFooterSummary): string {
  if (!summary) return "";

  const symbols: string[] = [];
  if (summary.conflicted > 0) symbols.push("🏳");
  if (summary.stashed > 0) symbols.push("📦");
  if (summary.deleted > 0) symbols.push("🗑");
  if (summary.renamed > 0) symbols.push("👅");
  if (summary.modified > 0) symbols.push("📝");
  if (summary.staged > 0) symbols.push(`++(${summary.staged})`);
  if (summary.untracked > 0) symbols.push("🤷");

  if (
    !hasWorkingTreeStatus(summary) &&
    summary.hasUpstream &&
    summary.ahead === 0 &&
    summary.behind === 0
  ) {
    symbols.push("✓");
  }

  if (summary.ahead > 0 && summary.behind > 0) {
    symbols.push(`⇕⇡${summary.ahead}⇣${summary.behind}`);
  } else if (summary.ahead > 0) {
    symbols.push(`⇡${summary.ahead}`);
  } else if (summary.behind > 0) {
    symbols.push(`⇣${summary.behind}`);
  }

  return symbols.join("");
}

function compactBranch(branch: string): string {
  const characters = Array.from(branch.trim());
  if (characters.length <= MAX_BRANCH_CHARACTERS) return characters.join("");
  return `${characters.slice(0, MAX_BRANCH_CHARACTERS - 3).join("")}...`;
}

export function formatGitFooterStatus(
  branch: string | null | undefined,
  summary?: GitFooterSummary,
): string | undefined {
  const resolvedBranch = branch || summary?.branch;
  const branchText = resolvedBranch ? `🌱 ${compactBranch(resolvedBranch)}` : "";
  const statusText = formatGitStatusSymbols(summary);
  const text = [branchText, statusText].filter(Boolean).join(" ");
  return text || undefined;
}

function summarySignature(summary?: GitFooterSummary): string {
  return summary ? JSON.stringify(summary) : "";
}

function clearGitFooterRefreshTimer(state: GitFooterRefreshState): void {
  if (state.refreshTimer) {
    clearTimeout(state.refreshTimer);
    state.refreshTimer = undefined;
  }
}

function scheduleGitFooterRefreshWake(
  state: GitFooterRefreshState,
  delayMs: number,
  onChange?: () => void,
): void {
  if (state.refreshTimer || !onChange) return;
  state.refreshTimer = setTimeout(
    () => {
      state.refreshTimer = undefined;
      if (!state.disposed) onChange();
    },
    Math.max(1, delayMs),
  );
  state.refreshTimer.unref?.();
}

export function createGitFooterRefreshState(): GitFooterRefreshState {
  return {
    latest: undefined,
    lastProbeAt: 0,
    probeInFlight: undefined,
    refreshTimer: undefined,
    refreshPending: false,
    generation: 0,
    disposed: false,
  };
}

export function invalidateGitFooterRefresh(state: GitFooterRefreshState): void {
  state.generation += 1;
  state.latest = undefined;
  state.lastProbeAt = 0;
  clearGitFooterRefreshTimer(state);
}

export function disposeGitFooterRefresh(state: GitFooterRefreshState): void {
  state.disposed = true;
  state.generation += 1;
  state.refreshPending = false;
  clearGitFooterRefreshTimer(state);
}

export function refreshGitFooterStatus(
  state: GitFooterRefreshState,
  options: {
    cwd: string;
    exec?: GitFooterExec;
    onChange?: () => void;
    now?: number;
    refreshMs?: number;
  },
): void {
  const exec = options.exec;
  if (state.disposed || !exec) return;
  if (state.probeInFlight) {
    state.refreshPending = true;
    return;
  }

  const now = options.now ?? Date.now();
  const refreshMs =
    typeof options.refreshMs === "number" && Number.isFinite(options.refreshMs)
      ? Math.max(0, options.refreshMs)
      : DEFAULT_GIT_REFRESH_MS;
  const elapsed = now - state.lastProbeAt;
  if (state.lastProbeAt !== 0 && elapsed < refreshMs) {
    scheduleGitFooterRefreshWake(state, refreshMs - elapsed, options.onChange);
    return;
  }

  clearGitFooterRefreshTimer(state);
  const generation = state.generation;
  const previousSignature = summarySignature(state.latest);
  state.lastProbeAt = now;
  state.probeInFlight = (async () => {
    let next: GitFooterSummary | undefined;
    try {
      const result = await exec(
        "git",
        ["status", "--porcelain=v2", "--branch", "--show-stash", "--untracked-files=normal"],
        { cwd: options.cwd, timeout: DEFAULT_GIT_REFRESH_MS },
      );
      next = result.code === 0 ? parseGitStatusPorcelainV2(result.stdout) : undefined;
    } catch {
      next = undefined;
    }

    const invalidated = generation !== state.generation;
    const changed = !invalidated && summarySignature(next) !== previousSignature;
    if (!invalidated) state.latest = next;

    const refreshWasRequested = state.refreshPending;
    state.refreshPending = false;
    state.probeInFlight = undefined;
    if (state.disposed) return;

    if (invalidated) {
      state.lastProbeAt = 0;
      options.onChange?.();
      return;
    }
    if (refreshWasRequested) {
      scheduleGitFooterRefreshWake(
        state,
        refreshMs - (Date.now() - state.lastProbeAt),
        options.onChange,
      );
    }
    if (changed) options.onChange?.();
  })();
}
