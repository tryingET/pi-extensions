/**
summary: "Tests quest worktree reaping verdicts, dry-run default, and safe removal."
read_when:
  - "Changing scripts/quest-worktree-reap.mjs safety predicates or CLI shape."
*/
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readdirSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync, spawnSync } from "node:child_process";
import { describe, it } from "node:test";

const SCRIPT = new URL("./quest-worktree-reap.mjs", import.meta.url).pathname;
const HOURS_AGO = (hours) => new Date(Date.now() - hours * 3_600_000);

function git(repo, argv) {
  return execFileSync("git", ["-C", repo, ...argv], { encoding: "utf8" });
}

function backdate(dir, hours) {
  const t = HOURS_AGO(hours);
  utimesSync(dir, t, t);
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === ".git") continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) backdate(full, hours);
    else utimesSync(full, t, t);
  }
}


function reap(repo, root, extra = []) {
  const run = spawnSync(process.execPath, [SCRIPT, "--repo", repo, "--root", root, "--json", ...extra], {
    encoding: "utf8",
    timeout: 60_000,
  });
  assert.equal(run.status, 0, `reaper failed: ${run.stderr}`);
  return JSON.parse(run.stdout);
}

function setup() {
  const scratch = mkdtempSync(join(tmpdir(), "quest-reap-"));
  const repo = join(scratch, "repo");
  const root = join(scratch, "quest-root");
  mkdirSync(root, { recursive: true });
  execFileSync("git", ["init", "-q", "-b", "main", repo], { encoding: "utf8" });
  writeFileSync(join(repo, "file.txt"), "base\n");
  git(repo, ["add", "."]);
  git(repo, ["-c", "user.email=t@t", "-c", "user.name=t", "commit", "-q", "-m", "base"]);
  return { scratch, repo, root };
}

describe("quest-worktree-reap", () => {
  it("dry-run reports a converged idle worktree and removes nothing", () => {
    const { scratch, repo, root } = setup();
    try {
      git(repo, ["worktree", "add", "-q", "-b", "agent/merged", join(root, "w-merged")]);
      git(repo, ["merge", "--ff-only", "agent/merged"]);
      writeFileSync(join(root, "w-merged", "dep.txt"), "extra commit\n");
      git(join(root, "w-merged"), ["add", "."]);
      git(join(root, "w-merged"), ["-c", "user.email=t@t", "-c", "user.name=t", "commit", "-q", "-m", "extra"]);
      git(repo, ["merge", "--ff-only", "agent/merged"]);
      backdate(join(root, "w-merged"), 24);
      const report = reap(repo, root);
      assert.equal(report.reapable.length, 1);
      assert.match(report.reapable[0].reason, /converged into main/u);
      assert.ok(!report.kept.some((k) => k.path === join(root, "w-merged")));
      assert.equal(report.removed.length, 0);
      assert.ok(git(repo, ["worktree", "list"]).includes("w-merged"));
    } finally {
      git(repo, ["worktree", "prune"]).toString();
      rmSync(scratch, { recursive: true, force: true });
    }
  });

  it("--apply removes the proven worktree and deletes its merged branch", () => {
    const { scratch, repo, root } = setup();
    try {
      git(repo, ["worktree", "add", "-q", "-b", "agent/gone", join(root, "w-gone")]);
      backdate(join(root, "w-gone"), 24);
      const report = reap(repo, root, ["--apply"]);
      assert.deepEqual(report.removed, [join(root, "w-gone")]);
      assert.deepEqual(report.branchesDeleted, ["agent/gone"]);
      assert.ok(!git(repo, ["worktree", "list"]).includes("w-gone"));
      assert.equal(git(repo, ["branch", "--list", "agent/gone"]), "");
    } finally {
      git(repo, ["worktree", "prune"]).toString();
      rmSync(scratch, { recursive: true, force: true });
    }
  });

  it("keeps dirty, unmerged, recently-active, and foreign-root worktrees", () => {
    const { scratch, repo, root } = setup();
    try {
      git(repo, ["worktree", "add", "-q", "-b", "agent/dirty", join(root, "w-dirty")]);
      writeFileSync(join(root, "w-dirty", "file.txt"), "modified\n");

      git(repo, ["worktree", "add", "-q", "-b", "agent/unmerged", join(root, "w-unmerged")]);
      writeFileSync(join(root, "w-unmerged", "new.txt"), "unique work\n");
      git(join(root, "w-unmerged"), ["add", "."]);
      git(join(root, "w-unmerged"), ["-c", "user.email=t@t", "-c", "user.name=t", "commit", "-q", "-m", "unique"]);

      git(repo, ["worktree", "add", "-q", "-b", "agent/fresh", join(root, "w-fresh")]);

      git(repo, ["worktree", "add", "-q", "--detach", join(scratch, "outside-root")]);

      backdate(join(root, "w-dirty"), 24);
      backdate(join(root, "w-unmerged"), 24);
      backdate(join(scratch, "outside-root"), 24);
      const report = reap(repo, root, ["--apply"]);
      assert.equal(report.checked, 3);
      assert.equal(report.reapable.length, 0);
      assert.equal(report.removed.length, 0);
      const kept = new Map(report.kept.map((k) => [k.path, k.reason]));
      assert.match(kept.get(join(root, "w-dirty")), /dirty/u);
      assert.match(kept.get(join(root, "w-unmerged")), /not converged into main/u);
      assert.match(kept.get(join(root, "w-fresh")), /idle/u);
      assert.ok(!kept.has(join(scratch, "outside-root")));
      for (const p of ["w-dirty", "w-unmerged", "w-fresh"]) {
        assert.ok(git(repo, ["worktree", "list"]).includes(p), `${p} must survive`);
      }
    } finally {
      git(repo, ["worktree", "prune"]).toString();
      rmSync(scratch, { recursive: true, force: true });
    }
  });

  it("treats untracked node_modules as reapable but other untracked files as dirty", () => {
    const { scratch, repo, root } = setup();
    try {
      git(repo, ["worktree", "add", "-q", "-b", "agent/deps", join(root, "w-deps")]);
      mkdirSync(join(root, "w-deps", "node_modules", "some-pkg"), { recursive: true });
      writeFileSync(join(root, "w-deps", "node_modules", "some-pkg", "index.js"), "x");
      backdate(join(root, "w-deps"), 24);
      let report = reap(repo, root);
      assert.equal(report.reapable.length, 1);

      git(repo, ["worktree", "add", "-q", "-b", "agent/stray", join(root, "w-stray")]);
      writeFileSync(join(root, "w-stray", "notes.md"), "uncommitted thinking\n");
      backdate(join(root, "w-stray"), 24);
      report = reap(repo, root);
      assert.equal(report.reapable.length, 1);
      assert.match(report.kept.find((k) => k.path === join(root, "w-stray")).reason, /dirty/u);
    } finally {
      git(repo, ["worktree", "prune"]).toString();
      rmSync(scratch, { recursive: true, force: true });
    }
  });

  it("reaps a detached worktree parked at an ancestor of base without touching branches", () => {
    const { scratch, repo, root } = setup();
    try {
      git(repo, ["worktree", "add", "-q", "--detach", join(root, "w-detached"), "main"]);
      backdate(join(root, "w-detached"), 24);
      const report = reap(repo, root, ["--apply"]);
      assert.deepEqual(report.removed, [join(root, "w-detached")]);
      assert.deepEqual(report.branchesDeleted, []);
      assert.equal(report.branchKept.length, 0);
    } finally {
      git(repo, ["worktree", "prune"]).toString();
      rmSync(scratch, { recursive: true, force: true });
    }
  });
});
