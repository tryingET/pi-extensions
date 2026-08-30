// summary: verifies fail-closed candidate worktree placement and ancestry-preservation policy.
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, isAbsolute, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  candidatePathIsInside,
  candidateWorkspacePollutionBlocker,
  candidateWorkspaceRepoKey,
  resolveCandidateWorkspaceRoot,
} from "../src/candidateWorkspacePlacement.ts";

const repoRoot = "/workspace/softwareco/owned/pi-extensions";
const repoHash = createHash("sha1").update(repoRoot).digest("hex").slice(0, 8);
const repoKey = `pi-extensions-${repoHash}`;
const packageRoot = dirname(dirname(fileURLToPath(import.meta.url)));

async function runRealGit(cwd, args) {
  try {
    const result = await new Promise((resolvePromise, rejectPromise) => {
      execFile("git", ["-C", cwd, ...args], { encoding: "utf8" }, (error, stdout) => {
        if (error) rejectPromise(error);
        else resolvePromise(stdout);
      });
    });
    return { ok: true, stdout: result };
  } catch {
    return { ok: false, stdout: "" };
  }
}

test("state placement remains the compatibility default", () => {
  assert.deepEqual(
    resolveCandidateWorkspaceRoot({
      parentCwd: repoRoot,
      repoRoot,
      env: { XDG_STATE_HOME: "/state" },
    }),
    {
      workspaceRoot: `/state/pi-quests/worktrees/${repoKey}`,
      placement: "state",
    },
  );
  assert.equal(candidateWorkspaceRepoKey(repoRoot), repoKey);
});

test("published package includes every newly required runtime module", () => {
  const manifest = JSON.parse(readFileSync(join(packageRoot, "package.json"), "utf8"));
  assert.equal(manifest.files.includes("src/candidateWorkspacePlacement.ts"), true);
  assert.equal(manifest.files.includes("src/candidateGitWorktreeIdentity.ts"), true);
  assert.equal(manifest.files.includes("src/visibleLoopIntercom.ts"), true);
});

test("state placement canonicalizes a malformed relative XDG state root", () => {
  const result = resolveCandidateWorkspaceRoot({
    parentCwd: repoRoot,
    repoRoot,
    env: { XDG_STATE_HOME: "relative-state" },
  });
  assert.equal(isAbsolute(result.workspaceRoot), true);
  assert.match(result.workspaceRoot, new RegExp(`/relative-state/pi-quests/worktrees/${repoKey}$`));
});

test("preserve-ancestry places candidates beside the source repository", () => {
  assert.deepEqual(
    resolveCandidateWorkspaceRoot({
      parentCwd: repoRoot,
      repoRoot,
      env: { PI_CANDIDATE_WORKSPACE_PLACEMENT: "preserve-ancestry" },
    }),
    {
      workspaceRoot: `/workspace/softwareco/owned/.pi-candidates/${repoKey}`,
      placement: "preserve-ancestry",
    },
  );
});

test("an explicit root wins without interpreting the ambient placement policy", () => {
  assert.deepEqual(
    resolveCandidateWorkspaceRoot({
      requestedWorkspaceRoot: "../explicit-candidates",
      parentCwd: repoRoot,
      repoRoot,
      env: { PI_CANDIDATE_WORKSPACE_PLACEMENT: "invalid" },
    }),
    {
      workspaceRoot: "/workspace/softwareco/owned/explicit-candidates",
      placement: "explicit",
    },
  );
});

test("unknown placement values fail closed", () => {
  assert.throws(
    () =>
      resolveCandidateWorkspaceRoot({
        parentCwd: repoRoot,
        repoRoot,
        env: { PI_CANDIDATE_WORKSPACE_PLACEMENT: "guess-company" },
      }),
    /must be 'state' or 'preserve-ancestry'/,
  );
});

test("containment treats dot-prefixed descendant names as descendants", () => {
  assert.equal(candidatePathIsInside("/workspace", "/workspace/..corp/candidate"), true);
  assert.equal(candidatePathIsInside("/workspace", "/workspace/corp../candidate"), true);
  assert.equal(candidatePathIsInside("/workspace", "/outside/candidate"), false);
  assert.equal(candidatePathIsInside("/workspace", "/workspace"), false);
});

test("an ignored enclosing checkout admits ancestry-preserving placement", async () => {
  const calls = [];
  const enclosingRoot = "/workspace/softwareco/owned";
  const blocker = await candidateWorkspacePollutionBlocker({
    workspaceRoot: `${enclosingRoot}/.pi-candidates/${repoKey}`,
    pathExists(path) {
      return path === enclosingRoot || path === `${enclosingRoot}/.git`;
    },
    async runGit(cwd, args) {
      calls.push({ cwd, args });
      return args[0] === "rev-parse"
        ? { ok: true, stdout: `${enclosingRoot}\n` }
        : { ok: true, stdout: "" };
    },
  });

  assert.equal(blocker, undefined);
  assert.deepEqual(calls.at(-1), {
    cwd: enclosingRoot,
    args: ["check-ignore", "--quiet", "--", `.pi-candidates/${repoKey}/`],
  });
});

test("real Git honors ignore policy for a nonexistent ancestry-preserving root", async () => {
  const enclosingRoot = await mkdtemp(`${tmpdir()}/candidate-workspace-git-`);
  try {
    await runRealGit(enclosingRoot, ["init", "--quiet"]);
    await writeFile(`${enclosingRoot}/.gitignore`, ".pi-candidates/\n", "utf8");
    const workspaceRoot = `${enclosingRoot}/.pi-candidates/${repoKey}`;
    const admitted = await candidateWorkspacePollutionBlocker({
      workspaceRoot,
      runGit: runRealGit,
    });
    assert.equal(admitted, undefined);

    await writeFile(`${enclosingRoot}/.gitignore`, "", "utf8");
    const blocked = await candidateWorkspacePollutionBlocker({
      workspaceRoot,
      runGit: runRealGit,
    });
    assert.match(blocked ?? "", /is not ignored/);
    await mkdir(`${enclosingRoot}/unrelated`, { recursive: true });
  } finally {
    await rm(enclosingRoot, { recursive: true, force: true });
  }
});

test("real Git honors an exact directory-only rule for the selected nonexistent root", async () => {
  const enclosingRoot = await mkdtemp(`${tmpdir()}/candidate-explicit-root-git-`);
  try {
    await runRealGit(enclosingRoot, ["init", "--quiet"]);
    await writeFile(`${enclosingRoot}/.gitignore`, "explicit-candidates/\n", "utf8");
    const workspaceRoot = `${enclosingRoot}/explicit-candidates`;
    const admitted = await candidateWorkspacePollutionBlocker({
      workspaceRoot,
      runGit: runRealGit,
    });
    assert.equal(admitted, undefined);

    await writeFile(`${enclosingRoot}/.gitignore`, "", "utf8");
    const blocked = await candidateWorkspacePollutionBlocker({
      workspaceRoot,
      runGit: runRealGit,
    });
    assert.match(blocked ?? "", /is not ignored/);
  } finally {
    await rm(enclosingRoot, { recursive: true, force: true });
  }
});

test("an enclosing checkout cannot be selected as the workspace root", async () => {
  const enclosingRoot = "/workspace/other-repo";
  const blocker = await candidateWorkspacePollutionBlocker({
    workspaceRoot: enclosingRoot,
    pathExists(path) {
      return path === enclosingRoot || path === `${enclosingRoot}/.git`;
    },
    async runGit() {
      return { ok: true, stdout: `${enclosingRoot}\n` };
    },
  });
  assert.match(blocker ?? "", /must not equal its enclosing git checkout/);
});

test("an unignored explicit root inside another checkout is also blocked", async () => {
  const enclosingRoot = "/workspace/other-repo";
  const blocker = await candidateWorkspacePollutionBlocker({
    workspaceRoot: `${enclosingRoot}/candidates/explicit`,
    pathExists(path) {
      return path === enclosingRoot || path === `${enclosingRoot}/.git`;
    },
    async runGit(_cwd, args) {
      return args[0] === "rev-parse"
        ? { ok: true, stdout: `${enclosingRoot}\n` }
        : { ok: false, stdout: "" };
    },
  });

  assert.match(blocker ?? "", /inside enclosing git checkout/);
  assert.match(blocker ?? "", /is not ignored/);
});

test("a known enclosing marker with an indeterminate Git result fails closed", async () => {
  const enclosingRoot = "/workspace/softwareco/owned";
  const blocker = await candidateWorkspacePollutionBlocker({
    workspaceRoot: `${enclosingRoot}/.pi-candidates/${repoKey}`,
    pathExists(path) {
      return path === enclosingRoot || path === `${enclosingRoot}/.git`;
    },
    async runGit() {
      return { ok: false, stdout: "" };
    },
  });

  assert.match(blocker ?? "", /cannot be verified/);
});

test("descendant names beginning or ending with dots do not bypass ignore verification", async () => {
  const enclosingRoot = "/workspace";
  for (const workspaceRoot of [
    "/workspace/..corp/.pi-candidates/candidate",
    "/workspace/corp../.pi-candidates/candidate",
  ]) {
    let ignoreChecked = false;
    const blocker = await candidateWorkspacePollutionBlocker({
      workspaceRoot,
      pathExists(path) {
        return path === enclosingRoot || path === `${enclosingRoot}/.git`;
      },
      async runGit(_cwd, args) {
        if (args[0] === "rev-parse") return { ok: true, stdout: `${enclosingRoot}\n` };
        ignoreChecked = true;
        return { ok: false, stdout: "" };
      },
    });
    assert.equal(ignoreChecked, true);
    assert.match(blocker ?? "", /is not ignored/);
  }
});

test("a path with no enclosing Git marker needs no ignore policy", async () => {
  let calls = 0;
  const blocker = await candidateWorkspacePollutionBlocker({
    workspaceRoot: `/workspace/softwareco/owned/.pi-candidates/${repoKey}`,
    pathExists() {
      return false;
    },
    async runGit() {
      calls += 1;
      return { ok: false, stdout: "" };
    },
  });

  assert.equal(blocker, undefined);
  assert.equal(calls, 0);
});
