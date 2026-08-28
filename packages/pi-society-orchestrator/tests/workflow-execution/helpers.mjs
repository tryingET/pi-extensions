/**
 * summary: "Workflow execution coverage (shared fixtures); split from workflow-execution.test.mjs."
 * read_when:
 *   - "changing shared fixtures workflow executor behavior."
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export function createFakeDispatchResult({
  status = "done",
  output,
  exitCode = status === "done" ? 0 : 1,
  elapsed = 25,
  failureKind,
}) {
  return {
    ok: status === "done",
    text: `[custom] ${status}`,
    details: {
      status,
      fullOutput: output,
      displayOutput: output,
      exitCode,
      elapsed,
      failureKind,
      timedOut: status === "timed_out",
      aborted: status === "aborted",
    },
  };
}

export function git(cwd, args) {
  const result = spawnSync("git", ["-C", cwd, ...args], { encoding: "utf-8" });
  if (result.status !== 0) {
    throw new Error(result.stderr.trim() || result.stdout.trim() || `git ${args.join(" ")} failed`);
  }
  return result.stdout.trim();
}

export function createRepo(prefix) {
  const repoDir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  git(repoDir, ["init"]);
  git(repoDir, ["config", "user.email", "tests@example.com"]);
  git(repoDir, ["config", "user.name", "Workflow Tests"]);
  fs.writeFileSync(path.join(repoDir, "tracked.txt"), "initial\n", "utf-8");
  git(repoDir, ["add", "tracked.txt"]);
  git(repoDir, ["commit", "-m", "initial commit"]);
  return repoDir;
}

export function cleanupRepo(repoDir) {
  try {
    fs.rmSync(repoDir, { recursive: true, force: true });
  } catch {
    // Best-effort test cleanup.
  }
}

export async function waitFor(predicate, timeoutMs = 1_000) {
  const deadline = Date.now() + timeoutMs;
  while (!predicate()) {
    if (Date.now() >= deadline) {
      throw new Error("Timed out waiting for workflow test condition");
    }
    await new Promise((resolve) => setTimeout(resolve, 1));
  }
}
