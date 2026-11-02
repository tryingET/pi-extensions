// summary: bounded, read-only Git and AK adapters for session-closeout receipts.
// read_when: changing proof identity, deferral contracts, or freshness checks.

import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { constants, type Stats } from "node:fs";
import { lstat, open, readlink, realpath } from "node:fs/promises";
import { isAbsolute, join, relative } from "node:path";
import { promisify } from "node:util";
import {
  type Binding,
  type BudgetProfile,
  budgetLimits,
  digest,
  type Obligation,
  type Observation,
  positive,
  text,
} from "./sessionCloseout.ts";

const exec = promisify(execFile);
export type ReadCommand = (command: string, args: string[], cwd: string) => Promise<string>;
export const readCommand: ReadCommand = async (command, args, cwd) => {
  const env = Object.fromEntries(
    Object.entries(process.env).filter(([key]) => !key.startsWith("GIT_")),
  );
  env.GIT_NO_REPLACE_OBJECTS = "1";
  env.GIT_CONFIG_NOSYSTEM = "1";
  env.GIT_CONFIG_GLOBAL = "/dev/null";
  env.GIT_OPTIONAL_LOCKS = "0";
  const result = await exec(command, args, {
    cwd,
    env,
    timeout: 15_000,
    maxBuffer: 2 * 1024 * 1024,
    encoding: "utf8",
  });
  return result.stdout;
};
export function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("Invalid owner object");
  return value as Record<string, unknown>;
}
export async function machine(
  run: ReadCommand,
  cwd: string,
  args: string[],
  surface: string,
  kind: string,
) {
  const envelope = object(JSON.parse(await run("ak", [...args, "--machine"], cwd)));
  if (
    envelope.ok !== true ||
    envelope.error !== null ||
    envelope.surface !== surface ||
    envelope.schema_version !== 1 ||
    envelope.payload_kind !== kind
  )
    throw new Error(`Unsupported AK ${surface} contract`);
  return object(envelope.payload);
}
export async function repoRoot(cwd: string, run: ReadCommand = readCommand): Promise<string> {
  return realpath((await run("git", ["rev-parse", "--show-toplevel"], cwd)).trim());
}
export async function registeredRepo(
  path: string,
  run: ReadCommand = readCommand,
): Promise<string> {
  const canonical = await realpath(path);
  const result = await machine(
    run,
    canonical,
    ["repo", "resolve", canonical],
    "repo.resolve",
    "repo_resolution",
  );
  if (
    result.registered !== true ||
    result.canonical_path !== canonical ||
    object(result.repo).path !== canonical
  )
    throw new Error("Use the exact AK-registered repository root");
  return canonical;
}
export interface GitSnapshot {
  repo: string;
  head: string;
  dirty: boolean;
  digest: string;
}
export async function gitSnapshot(
  repo: string,
  run: ReadCommand = readCommand,
  profile: BudgetProfile = "default",
): Promise<GitSnapshot> {
  const limits = budgetLimits(profile);
  const first = await captureGit(repo, run, limits);
  const second = await captureGit(repo, run, limits);
  if (first.digest !== second.digest) throw new Error("Git content changed during capture");
  return second;
}
async function captureGit(
  repo: string,
  run: ReadCommand,
  limits: ReturnType<typeof budgetLimits>,
): Promise<GitSnapshot> {
  const head = (await run("git", ["rev-parse", "HEAD"], repo)).trim();
  if (!/^[0-9a-f]{40,64}$/.test(head)) throw new Error("Missing Git HEAD");
  const before = await run("git", ["status", "--porcelain=v1", "-z", "-uall"], repo);
  const diff = await run(
    "git",
    ["diff", "--no-ext-diff", "--no-textconv", "--binary", "HEAD", "--"],
    repo,
  );
  const index = await run(
    "git",
    ["diff", "--cached", "--no-ext-diff", "--no-textconv", "--binary", "HEAD", "--"],
    repo,
  );
  const submodules = (await run("git", ["ls-files", "--stage", "-z"], repo))
    .split("\0")
    .filter((entry) => entry.startsWith("160000 "))
    .map((entry) => entry.slice(entry.indexOf("\t") + 1));
  for (const path of submodules) {
    if (before.split("\0").some((entry) => entry.slice(3) === path))
      throw new Error(`Dirty gitlink requires its own owner closeout before parent seal: ${path}`);
  }
  const names = (await run("git", ["ls-files", "--others", "--exclude-standard", "-z"], repo))
    .split("\0")
    .filter(Boolean)
    .sort();
  if (names.length > limits.maxFiles)
    throw new Error(
      `Untracked inventory exceeds ${limits.maxFiles} files in ${repo} (profile ${limits.profile})`,
    );
  let bytes = 0;
  const untracked = [];
  for (const name of names) {
    const path = join(repo, name);
    const rel = relative(repo, path);
    if (isAbsolute(rel) || rel === ".." || rel.startsWith("../"))
      throw new Error("Git path escapes repository");
    const stat = await lstat(path);
    if (!stat.isFile() && !stat.isSymbolicLink())
      throw new Error("Unsupported untracked file type");
    bytes += stat.size;
    if (stat.size > limits.maxFileBytes || bytes > limits.maxTotalBytes)
      throw new Error(
        `Untracked byte budget exceeded in ${repo}: file=${stat.size} bytes, total=${bytes} bytes; ` +
          `profile=${limits.profile}, limits=${limits.maxFileBytes} bytes/file, ${limits.maxTotalBytes} bytes total, ${limits.maxFiles} files. ` +
          "For this journal's host repo only, select session_closeout action budget with profile large-assets and rationale, or /session-closeout budget large-assets. Larger inputs require separate owner-scoped handling; do not discard WIP.",
      );
    // Do not follow symlinks when fingerprinting operator state.
    const hash = stat.isSymbolicLink()
      ? digest(await readlink(path))
      : await regularFileDigest(path, stat);
    untracked.push([name, stat.mode, hash]);
  }
  const after = await run("git", ["status", "--porcelain=v1", "-z", "-uall"], repo);
  if (before !== after || (await run("git", ["rev-parse", "HEAD"], repo)).trim() !== head)
    throw new Error("Git changed during capture");
  return {
    repo,
    head,
    dirty: before.length > 0,
    digest: digest({ head, status: before, diff, index, untracked }),
  };
}

/** SHA256(JSON.stringify(base64(bytes))), without allocating the full file/base64/JSON. */
async function regularFileDigest(path: string, expected: Stats): Promise<string> {
  const file = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  const same = (s: Stats) =>
    s.isFile() &&
    s.dev === expected.dev &&
    s.ino === expected.ino &&
    s.size === expected.size &&
    s.mode === expected.mode &&
    s.mtimeMs === expected.mtimeMs &&
    s.ctimeMs === expected.ctimeMs;
  try {
    if (!same(await file.stat())) throw new Error("Untracked file changed before read");
    const hash = createHash("sha256").update('"');
    const buffer = Buffer.allocUnsafe(64 * 1024);
    let carry = Buffer.alloc(0);
    let bytes = 0;
    for (;;) {
      const { bytesRead } = await file.read(buffer, 0, buffer.length, null);
      if (!bytesRead) break;
      bytes += bytesRead;
      // A growing file cannot consume unbounded resources after the size admission.
      if (bytes > expected.size) throw new Error("Untracked file grew during read; retry capture");
      const chunk = Buffer.concat([carry, buffer.subarray(0, bytesRead)]);
      const end = chunk.length - (chunk.length % 3);
      hash.update(chunk.subarray(0, end).toString("base64"));
      carry = Buffer.from(chunk.subarray(end));
    }
    if (bytes !== expected.size || !same(await file.stat()) || !same(await lstat(path)))
      throw new Error("Untracked file changed during read");
    hash.update(carry.toString("base64")).update('"');
    return hash.digest("hex");
  } finally {
    await file.close();
  }
}

export async function observeObligation(
  item: Obligation,
  binding: Binding | undefined,
  git: GitSnapshot,
  run: ReadCommand = readCommand,
  clock: () => number = Date.now,
): Promise<Observation> {
  if (!binding)
    return {
      id: item.id,
      disposition: "open",
      valid: false,
      reason: "No disposition proposed",
      facts: null,
    };
  try {
    if (binding.disposition === "retained") {
      if (item.kind !== "retained") throw new Error("Work cannot be reclassified as retained");
      return {
        id: item.id,
        disposition: "retained",
        valid: true,
        reason: "Requires operator acceptance of retained state",
        facts: { rationale: binding.rationale, git },
      };
    }
    if (!positive(binding.taskId)) throw new Error("Exact task ID required");
    const payload = await machine(
      run,
      item.repo,
      ["task", "show", String(binding.taskId)],
      "task.show",
      "task_detail",
    );
    const task = object(payload.task);
    if (task.id !== binding.taskId || task.repo !== item.repo || !positive(task.entity_version))
      throw new Error("Task identity/repository/version mismatch");
    const collection = await machine(
      run,
      item.repo,
      ["evidence", "task", String(binding.taskId)],
      "evidence.task",
      "evidence_collection",
    );
    if (
      collection.task_id !== binding.taskId ||
      !Array.isArray(collection.evidence) ||
      collection.count !== collection.evidence.length
    )
      throw new Error("Incomplete evidence collection");
    const evidence = collection.evidence.map(object);
    const evidenceDigest = digest(collection);
    const evidenceIndex = evidence.map((e) => ({
      id: e.id,
      result: e.result,
      check_type: e.check_type,
      checked_at: e.checked_at,
    }));
    if (
      new Set(evidence.map((e) => e.id)).size !== evidence.length ||
      evidence.some((e) => !positive(e.id) || e.task_id !== task.id || e.repo !== item.repo)
    )
      throw new Error("Evidence identity mismatch");
    if (binding.disposition === "resolved") {
      if (task.status !== "done" || task.active_deferral || payload.active_deferral)
        throw new Error("Task is not terminal done without deferral");
      const proof = evidence.find((e) => e.id === binding.evidenceId);
      if (!proof || proof.result !== "pass") throw new Error("Exact passing evidence missing");
      const details = object(proof.details);
      // Code proof is deliberately stricter than a generic passing AK row.
      // Non-code evidence must explicitly bind this current inventory's acceptance instead.
      const commit = details.commit ?? details.commit_sha ?? details.head_sha;
      if (commit !== undefined) {
        if (commit !== git.head)
          throw new Error("Evidence commit is not current HEAD; obtain fresh proof");
        if (git.dirty && details.closeout_git_digest !== git.digest)
          throw new Error("Dirty inputs are not bound by evidence closeout_git_digest");
      } else {
        const acceptance = object(details.closeout);
        if (
          acceptance.obligation_id !== item.id ||
          acceptance.acceptance_sha256 !== digest(item.acceptance) ||
          acceptance.git_digest !== git.digest
        )
          throw new Error("Non-code proof lacks exact obligation/acceptance/Git binding");
      }
      return {
        id: item.id,
        disposition: "resolved",
        valid: true,
        reason: "Owner-recorded proof; operator must independently assess acceptance",
        facts: { task, proof, evidenceDigest, evidenceIndex, git },
      };
    }
    if (task.status !== "pending" || task.claimed_by || task.lease_expires_at)
      throw new Error("Deferred work must be pending without a claim/lease");
    const deferral = object(payload.active_deferral ?? task.active_deferral);
    if (deferral.task_id !== task.id || deferral.state !== "active" || !positive(deferral.id))
      throw new Error("Active first-class deferral missing");
    const contract = object(object(deferral.trigger_json).closeout);
    if (contract.schema !== "pi.closeout-handoff.v1")
      throw new Error("Missing structured closeout handoff in deferral trigger_json.closeout");
    for (const key of ["owner", "blocker", "trigger", "next_action", "blast_radius", "rationale"])
      text(contract[key], `handoff ${key}`);
    if (contract.acceptance !== item.acceptance)
      throw new Error("Deferral weakened/changed acceptance criteria");
    const deadline = Date.parse(text(contract.deadline, "handoff deadline"));
    const review = Date.parse(text(deferral.review_at, "deferral review_at"));
    const now = clock();
    if (
      !Number.isFinite(deadline) ||
      deadline <= now ||
      !Number.isFinite(review) ||
      review <= now ||
      review > deadline
    )
      throw new Error("Deferral deadline/review is missing, expired, or inconsistent");
    if (
      !Array.isArray(contract.evidence_ids) ||
      contract.evidence_ids.length === 0 ||
      contract.evidence_ids.some((id) => !positive(id) || !evidence.some((e) => e.id === id))
    )
      throw new Error("Continuation evidence IDs are not bound to this task");
    return {
      id: item.id,
      disposition: "deferred",
      valid: true,
      validUntil: Math.min(deadline, review),
      reason: "Operator acceptance still required; task creation is not owner acceptance",
      facts: {
        task,
        deferral,
        evidenceDigest,
        evidenceIndex,
        continuationEvidence: evidence.filter(
          (e) => positive(e.id) && (contract.evidence_ids as number[]).includes(e.id),
        ),
        git,
      },
    };
  } catch (error) {
    return {
      id: item.id,
      disposition: binding.disposition,
      valid: false,
      reason: error instanceof Error ? error.message : "Owner readback unavailable",
      facts: null,
    };
  }
}
