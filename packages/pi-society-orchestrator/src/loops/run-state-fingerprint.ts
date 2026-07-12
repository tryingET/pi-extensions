// ---
// summary: "Hashes Git repository state, diffs, index contents, and bounded untracked files for safe loop continuation."
// read_when:
//   - "Changing how loop resume detects repository drift or handles unverifiable and oversized state."
// ---

import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";
import { LoopResumeError } from "./run-checkpoint.ts";

const MAX_GIT_OUTPUT_BYTES = 64 * 1024 * 1024;
const MAX_UNTRACKED_FINGERPRINT_BYTES = 50 * 1024 * 1024;

export function captureLoopStateFingerprint(cwd: string): string {
  const realCwd = fs.realpathSync(cwd);
  const gitRoot = gitText(realCwd, ["rev-parse", "--show-toplevel"]);
  if (!gitRoot) {
    return `unverifiable:${createHash("sha256").update(realCwd).digest("hex")}`;
  }

  const head = gitText(realCwd, ["rev-parse", "HEAD"]);
  if (!head) {
    return `unverifiable:${createHash("sha256").update(`${realCwd}\0no-head`).digest("hex")}`;
  }

  const realGitRoot = fs.realpathSync(gitRoot);
  const hash = createHash("sha256");
  hash.update(`root\0${realGitRoot}\0cwd\0${realCwd}\0head\0${head}\0`);
  hash.update(gitBuffer(realGitRoot, ["status", "--porcelain=v1", "-z", "--untracked-files=all"]));
  hash.update(gitBuffer(realGitRoot, ["diff", "--binary", "HEAD"]));
  hash.update(gitBuffer(realGitRoot, ["diff", "--cached", "--binary", "HEAD"]));

  const untracked = gitBuffer(realGitRoot, [
    "ls-files",
    "--others",
    "--exclude-standard",
    "--full-name",
    "-z",
  ])
    .toString("utf8")
    .split("\0")
    .filter(Boolean)
    .sort();
  let untrackedBytes = 0;
  for (const relativePath of untracked) {
    const candidate = path.resolve(realGitRoot, relativePath);
    if (candidate !== realGitRoot && !candidate.startsWith(`${realGitRoot}${path.sep}`)) {
      throw new LoopResumeError(
        "loop_resume_state_unverifiable",
        `Untracked path escapes the loop repository: ${relativePath}.`,
      );
    }
    const stat = fs.lstatSync(candidate);
    hash.update(`untracked\0${relativePath}\0${stat.mode}\0${stat.size}\0`);
    if (stat.isSymbolicLink()) {
      hash.update(fs.readlinkSync(candidate));
      continue;
    }
    if (!stat.isFile()) continue;
    untrackedBytes += stat.size;
    if (untrackedBytes > MAX_UNTRACKED_FINGERPRINT_BYTES) {
      throw new LoopResumeError(
        "loop_resume_state_unverifiable",
        `Untracked loop state exceeds ${MAX_UNTRACKED_FINGERPRINT_BYTES} bytes; continuation cannot be validated safely.`,
      );
    }
    hash.update(fs.readFileSync(candidate));
  }

  return `sha256:${hash.digest("hex")}`;
}

function gitText(cwd: string, args: string[]): string | undefined {
  const result = spawnSync("git", args, {
    cwd,
    encoding: "utf8",
    maxBuffer: MAX_GIT_OUTPUT_BYTES,
  });
  return result.status === 0 ? String(result.stdout).trim() : undefined;
}

function gitBuffer(cwd: string, args: string[]): Buffer {
  const result = spawnSync("git", args, {
    cwd,
    encoding: "buffer",
    maxBuffer: MAX_GIT_OUTPUT_BYTES,
  });
  if (result.status !== 0) {
    throw new LoopResumeError(
      "loop_resume_state_unverifiable",
      `Failed to fingerprint loop state with git ${args.join(" ")}.`,
    );
  }
  return Buffer.isBuffer(result.stdout) ? result.stdout : Buffer.from(result.stdout || "");
}
