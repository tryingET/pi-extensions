#!/usr/bin/env node
// Reap converged quest worktrees under the pi-quests state tree.
//
// POLICY: quest sessions create git worktrees under ~/.local/state/pi-quests/
// (workspaceRoot default or TMPDIR-driven scratch). When a session's content
// reaches main through another path, nothing removes the leftover worktree, so
// zombies accumulate. This tool removes a worktree ONLY when git facts prove it
// is fully converged; anything unproven is kept and reported. It never executes
// serialized peer-state cleanup packets (AK decision 59) and never rm -rf's:
// removal goes exclusively through `git worktree remove`.
//
// A worktree is reapable only when ALL hold:
//   1. path is under a managed quest root (never the main checkout);
//   2. registered in `git worktree list` of the target repo;
//   3. no tracked changes and no untracked files except node_modules/;
//   4. HEAD (branch or detached) is an ancestor of the base ref (default main);
//   5. no live process has its cwd inside the worktree;
//   6. newest mtime (excluding node_modules/.git) is older than the idle window.
//
// Modes:
//   (default)            dry-run: report verdicts, change nothing
//   --apply              remove proven worktrees (+ merged branches via safe -d)
//   --repo PATH          target checkout (default: this repository)
//   --root PATH          managed quest root (default: ~/.local/state/pi-quests)
//   --base REF           convergence base (default: main)
//   --idle-hours HOURS   idle window (default: 12, minimum: 1)
//   --json               machine-readable report
//
// Exit codes: 0 ok (report only, with or without reapables), 2 tool failure.

import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, readlinkSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const args = process.argv.slice(2);
const asJson = args.includes("--json");
const apply = args.includes("--apply");
const flag = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const DEFAULT_REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repo = resolve(flag("--repo") ?? DEFAULT_REPO);
const managedRoot = resolve(flag("--root") ?? join(homedir(), ".local/state/pi-quests"));
const base = flag("--base") ?? "main";
const idleHours = Number(flag("--idle-hours") ?? 12);

if (!existsSync(join(repo, ".git"))) {
  fail(`--repo is not a git checkout: ${repo}`);
}
if (!Number.isFinite(idleHours) || idleHours < 1) {
  fail("--idle-hours must be >= 1");
}

function fail(message) {
  console.error(`quest-worktree-reap: ${message}`);
  process.exit(2);
}

function git(workdir, argv, options = {}) {
  const run = spawnSync("git", ["-C", workdir, ...argv], {
    encoding: "utf8",
    timeout: 30_000,
    ...options,
  });
  if (run.error) fail(`git ${argv[0]} failed: ${run.error.message}`);
  return run;
}

function gitText(workdir, argv) {
  const run = git(workdir, argv);
  return run.status === 0 ? run.stdout.trim() : "";
}

function parseWorktrees(repoRoot) {
  const out = gitText(repoRoot, ["worktree", "list", "--porcelain"]);
  const worktrees = [];
  let entry = null;
  for (const line of out.split("\n")) {
    if (line.startsWith("worktree ")) {
      if (entry) worktrees.push(entry);
      entry = { path: line.slice("worktree ".length), head: null, branch: null, bare: false };
    } else if (!entry) continue;
    else if (line.startsWith("HEAD ")) entry.head = line.slice(5);
    else if (line.startsWith("branch ")) entry.branch = line.slice("branch ".length);
    else if (line === "bare") entry.bare = true;
    else if (line === "detached") entry.detached = true;
  }
  if (entry) worktrees.push(entry);
  return worktrees;
}

function trackedDirty(worktreePath) {
  const lines = gitText(worktreePath, ["status", "--porcelain"]).split("\n").filter(Boolean);
  // Untracked node_modules are reproducible dependency installs, never source.
  return lines.filter((line) => !(line.startsWith("?? ") && line.slice(3).replace(/\/$/, "").endsWith("node_modules")));
}

function convergedIntoBase(repoRoot, head) {
  if (!head) return false;
  return git(repoRoot, ["merge-base", "--is-ancestor", head, base]).status === 0;
}

function occupiedByProcess(worktreePath) {
  const prefix = `${worktreePath}/`;
  try {
    for (const entry of readdirSync("/proc")) {
      if (!/^\d+$/.test(entry)) continue;
      try {
        const cwd = readlinkSync(join("/proc", entry, "cwd"));
        if (cwd === worktreePath || cwd.startsWith(prefix)) return true;
      } catch {
        // Process exited or not ours; absence is consistent with unoccupied.
      }
    }
  } catch {
    return true; // /proc unreadable: cannot prove unoccupied, keep the tree.
  }
  return false;
}

function newestMtime(dir, budget = { count: 0 }) {
  let newest = 0;
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return 0;
  }
  for (const entry of entries) {
    if (entry.name === "node_modules" || entry.name === ".git") continue;
    if (++budget.count > 5_000) return newest;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      newest = Math.max(newest, newestMtime(full, budget));
    } else if (entry.isFile() || entry.isSymbolicLink()) {
      try {
        newest = Math.max(newest, statSync(full).mtimeMs);
      } catch {
        // Vanished mid-walk; ignore.
      }
    }
  }
  return newest;
}

const isManaged = (p) => {
  const rel = relative(managedRoot, p);
  return isAbsolute(rel) ? false : rel !== "" && !rel.startsWith("..");
};

const report = { repo, managedRoot, base, idleHours, checked: 0, reapable: [], kept: [], removed: [], branchesDeleted: [], branchKept: [] };
const idleMs = idleHours * 3_600_000;
const mainCheckout = resolve(gitText(repo, ["rev-parse", "--show-toplevel"]) || repo);

for (const entry of parseWorktrees(repo)) {
  if (entry.bare || entry.path === mainCheckout) continue;
  if (!isManaged(entry.path)) continue;
  report.checked += 1;
  const reasons = [];
  if (!existsSync(entry.path)) reasons.push("worktree directory missing (prune candidate)");
  if (reasons.length === 0 && trackedDirty(entry.path).length > 0) reasons.push("dirty (tracked changes or non-node_modules untracked files)");
  if (reasons.length === 0 && !convergedIntoBase(repo, entry.head)) reasons.push(`HEAD ${entry.head?.slice(0, 10) ?? "?"} not converged into ${base}`);
  if (reasons.length === 0 && occupiedByProcess(entry.path)) reasons.push("a live process has cwd inside the worktree");
  const ageMs = reasons.length === 0 ? Date.now() - newestMtime(entry.path) : Number.POSITIVE_INFINITY;
  if (reasons.length === 0 && ageMs < idleMs) reasons.push(`idle for only ${Math.floor(ageMs / 3_600_000)}h (< ${idleHours}h window)`);
  const branch = entry.branch?.replace(/^refs\/heads\//, "");
  if (reasons.length > 0) {
    report.kept.push({ path: entry.path, branch: branch ?? null, reason: reasons.join("; ") });
    continue;
  }
  report.reapable.push({ path: entry.path, branch: branch ?? null, reason: `clean, converged into ${base}, unoccupied, idle >= ${idleHours}h` });
  if (!apply) continue;
  const removed = git(repo, ["worktree", "remove", "--force", entry.path]).status === 0;
  if (!removed) {
    report.kept.push({ path: entry.path, branch: branch ?? null, reason: "git worktree remove failed" });
    continue;
  }
  report.removed.push(entry.path);
  if (branch) {
    if (git(repo, ["branch", "-d", branch]).status === 0) report.branchesDeleted.push(branch);
    else report.branchKept.push({ branch, reason: "not fully merged into base; branch kept" });
  }
}

if (apply) git(repo, ["worktree", "prune"]);

if (asJson) {
  console.log(JSON.stringify(report, null, 2));
} else {
  console.log(`quest-worktree-reap: checked ${report.checked} managed worktree(s) under ${managedRoot} (base ${base}, idle >= ${idleHours}h)`);
  for (const item of report.reapable) console.log(`  reapable: ${item.path}${item.branch ? ` [${item.branch}]` : ""} — ${item.reason}`);
  for (const item of report.kept) console.log(`  keep:     ${item.path}${item.branch ? ` [${item.branch}]` : ""} — ${item.reason}`);
  if (apply) {
    for (const p of report.removed) console.log(`  removed:  ${p}`);
    for (const b of report.branchesDeleted) console.log(`  branch -d: ${b}`);
    for (const b of report.branchKept) console.log(`  branch kept: ${b.branch} — ${b.reason}`);
  } else if (report.reapable.length > 0) {
    console.log(`dry-run: ${report.reapable.length} worktree(s) proven converged; rerun with --apply to remove them`);
  }
}
