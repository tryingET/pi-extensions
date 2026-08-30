// summary: proves existing candidate paths belong to the admitted repository before reuse.
import assert from "node:assert/strict";
import { execFile, execFileSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  renameSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { prepareCandidatePeerWorktree } from "../extensions/sidequestCandidateWorkspace.ts";
import { verifyCandidateWorktreeIdentity } from "../src/candidateGitWorktreeIdentity.ts";

const scratchRoot = process.env.TMPDIR || tmpdir();

function withScratch(t, run) {
  const root = mkdtempSync(join(scratchRoot, "candidate-worktree-identity-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  return run(root);
}

function git(cwd, ...args) {
  return execFileSync("git", ["-C", cwd, ...args], { encoding: "utf8" });
}

function initializeRepo(repoRoot, branchName) {
  mkdirSync(repoRoot, { recursive: true });
  execFileSync("git", ["init", "--quiet", "--initial-branch", branchName, repoRoot], {
    encoding: "utf8",
  });
  git(repoRoot, "config", "user.name", "Candidate Identity Test");
  git(repoRoot, "config", "user.email", "candidate-identity@example.invalid");
  writeFileSync(join(repoRoot, "README.md"), `${branchName}\n`, "utf8");
  git(repoRoot, "add", "README.md");
  git(repoRoot, "commit", "--quiet", "-m", "test fixture");
}

function execRunner(command, args, options = {}) {
  return new Promise((resolvePromise) => {
    execFile(
      command,
      args,
      {
        cwd: options.cwd,
        timeout: options.timeout,
        encoding: "utf8",
        maxBuffer: 4 * 1024 * 1024,
      },
      (error, stdout, stderr) => {
        resolvePromise({
          code: error ? (typeof error.code === "number" ? error.code : 1) : 0,
          stdout,
          stderr,
          killed: Boolean(error?.killed),
        });
      },
    );
  });
}

async function runGitRead(cwd, args) {
  const result = await execRunner("git", ["-C", cwd, ...args], { cwd });
  return { ok: result.code === 0, stdout: result.stdout };
}

function createLinkedFixture(root, branchName = "candidatepeer/reuse-registered") {
  const parentRepo = join(root, "parent");
  const workspaceRoot = join(root, "candidates");
  const workspaceName = "registered-worktree";
  const worktreePath = join(workspaceRoot, workspaceName);
  initializeRepo(parentRepo, "main");
  mkdirSync(workspaceRoot, { recursive: true });
  git(parentRepo, "worktree", "add", "--quiet", "-b", branchName, worktreePath, "HEAD");
  return { parentRepo, workspaceRoot, workspaceName, worktreePath, branchName };
}

function prepareExisting({ parentRepo, workspaceRoot, workspaceName, branchName }) {
  return prepareCandidatePeerWorktree({
    execRunner,
    pathExists: existsSync,
    env: {},
    request: {
      objective: "Reuse exact candidate",
      workspaceRoot,
      workspaceName,
      branchName,
      reuseExisting: true,
    },
    parentCwd: parentRepo,
    objective: "Reuse exact candidate",
    admittedRepoRoot: parentRepo,
  });
}

test("identity verification rejects a linked path omitted from the parent worktree list", async (t) => {
  await withScratch(t, async (root) => {
    const fixture = createLinkedFixture(root);
    const parentHead = git(fixture.parentRepo, "rev-parse", "HEAD").trim();
    const calls = [];
    const result = await verifyCandidateWorktreeIdentity({
      repoRoot: fixture.parentRepo,
      worktreePath: fixture.worktreePath,
      branchName: fixture.branchName,
      async runGit(cwd, args) {
        calls.push({ cwd, args });
        if (args[0] === "worktree") {
          return {
            ok: true,
            stdout: `worktree ${fixture.parentRepo}\0HEAD ${parentHead}\0branch refs/heads/main\0\0`,
          };
        }
        return runGitRead(cwd, args);
      },
    });

    assert.deepEqual(result, { ok: false, reason: "candidate_not_registered_by_parent" });
    assert.deepEqual(calls.at(-1), {
      cwd: fixture.parentRepo,
      args: ["worktree", "list", "--porcelain", "-z"],
    });
  });
});

test("identity verification rejects malformed and mismatched parent records", async (t) => {
  await withScratch(t, async (root) => {
    const fixture = createLinkedFixture(root);
    const actualList = (
      await runGitRead(fixture.parentRepo, ["worktree", "list", "--porcelain", "-z"])
    ).stdout;

    const malformed = await verifyCandidateWorktreeIdentity({
      repoRoot: fixture.parentRepo,
      worktreePath: fixture.worktreePath,
      branchName: fixture.branchName,
      runGit: (cwd, args) =>
        args[0] === "worktree"
          ? Promise.resolve({ ok: true, stdout: actualList.slice(0, -1) })
          : runGitRead(cwd, args),
    });
    assert.deepEqual(malformed, { ok: false, reason: "parent_worktree_list_malformed" });

    const wrongBranch = await verifyCandidateWorktreeIdentity({
      repoRoot: fixture.parentRepo,
      worktreePath: fixture.worktreePath,
      branchName: fixture.branchName,
      runGit: (cwd, args) =>
        args[0] === "worktree"
          ? Promise.resolve({
              ok: true,
              stdout: actualList.replace(
                `branch refs/heads/${fixture.branchName}`,
                "branch refs/heads/candidatepeer/wrong",
              ),
            })
          : runGitRead(cwd, args),
    });
    assert.deepEqual(wrongBranch, {
      ok: false,
      reason: "candidate_worktree_record_mismatch",
    });
  });
});

test("identity verification fails closed when Git identity or membership queries fail", async (t) => {
  await withScratch(t, async (root) => {
    const fixture = createLinkedFixture(root);
    const scenarios = [
      {
        reason: "parent_common_directory_unverifiable",
        reject: (cwd, args) => cwd === fixture.parentRepo && args.includes("--git-common-dir"),
      },
      {
        reason: "candidate_common_directory_unverifiable",
        reject: (cwd, args) => cwd === fixture.worktreePath && args.includes("--git-common-dir"),
      },
      {
        reason: "parent_worktree_list_unverifiable",
        reject: (_cwd, args) => args[0] === "worktree",
      },
    ];
    for (const scenario of scenarios) {
      const result = await verifyCandidateWorktreeIdentity({
        repoRoot: fixture.parentRepo,
        worktreePath: fixture.worktreePath,
        branchName: fixture.branchName,
        runGit: (cwd, args) =>
          scenario.reject(cwd, args)
            ? Promise.resolve({ ok: false, stdout: "" })
            : runGitRead(cwd, args),
      });
      assert.deepEqual(result, { ok: false, reason: scenario.reason });
    }
  });
});

test("reuseExisting rejects an unrelated repository even when its branch and top-level path match", async (t) => {
  await withScratch(t, async (root) => {
    const parentRepo = join(root, "parent");
    const workspaceRoot = join(root, "candidates");
    const workspaceName = "foreign-repo";
    const worktreePath = join(workspaceRoot, workspaceName);
    const branchName = "candidatepeer/reuse-foreign";
    initializeRepo(parentRepo, "main");
    initializeRepo(worktreePath, branchName);

    const result = await prepareExisting({
      parentRepo,
      workspaceRoot,
      workspaceName,
      branchName,
    });

    assert.equal(result.ok, false);
    assert.match(result.error, /common_directory_mismatch/);
    assert.equal(result.worktreePath, worktreePath);
  });
});

test("reuseExisting rejects a linked worktree whose .git entry is a symlink", async (t) => {
  await withScratch(t, async (root) => {
    const fixture = createLinkedFixture(root);
    const dotGit = join(fixture.worktreePath, ".git");
    const backing = join(fixture.worktreePath, ".git.backing");
    const original = readFileSync(dotGit, "utf8");
    renameSync(dotGit, backing);
    symlinkSync(backing, dotGit);
    assert.equal(readFileSync(dotGit, "utf8"), original);

    const result = await prepareExisting(fixture);

    assert.equal(result.ok, false);
    assert.match(result.error, /candidate_dot_git_not_linked_file|path_or_branch_mismatch/);
  });
});

test("reuseExisting accepts one exact linked worktree registered by the admitted parent", async (t) => {
  await withScratch(t, async (root) => {
    const fixture = createLinkedFixture(root);
    const result = await prepareExisting(fixture);

    assert.equal(result.ok, true);
    assert.equal(result.reusedExisting, true);
    assert.equal(result.repoRoot, fixture.parentRepo);
    assert.equal(result.worktreePath, fixture.worktreePath);
    assert.equal(result.branchName, fixture.branchName);
  });
});
