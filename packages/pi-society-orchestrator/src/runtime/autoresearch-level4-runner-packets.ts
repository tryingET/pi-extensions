// ---
// summary: "Read-only, fail-closed Level-4 measured packet validation over the autoresearch owner contract."
// read_when:
//   - "Classifying Level-4 candidate packet inventory or changing packet-verification tests."
// ---

import * as fs from "node:fs";
import * as path from "node:path";
import { isDeepStrictEqual } from "node:util";
import { validateAutoresearchAdapterPacket } from "@tryinget/pi-autoresearch/src/runtime.ts";
import type { AutoresearchLevel3CandidateLifecycleBindingInput } from "./autoresearch-level3-planning-types.ts";

export interface VerifyLevel4MeasuredPacketInput {
  /** Controller/measurement cwd, not the candidate worktree. */
  cwd: string;
  /** Expected lane export, relative to cwd or absolute inside cwd/.autoresearch. */
  packetPath: string;
  /** Exact hypothesisId emitted by the matrix measurement call (cell-scoped lane ID). */
  laneId: string;
  /** Caller must resolve the controller binding unambiguously before invoking this helper. */
  binding?: AutoresearchLevel3CandidateLifecycleBindingInput;
  metricName: string;
  direction: "lower" | "higher";
}

export interface Level4MeasuredPacketVerification {
  verified: boolean;
  issues: string[];
}

const MAX_PACKET_BYTES = 8 * 1024 * 1024;
const MEASURED_STATUSES = new Set(["candidate", "keep", "discard", "checks_failed"]);
const MEASURED_DECISIONS = new Set([
  "checks_failed",
  "insufficient_samples",
  "possible_noise",
  "candidate_improvement",
  "candidate_regression",
  "candidate_neutral",
  "threshold_satisfied",
  "threshold_preserved",
  "threshold_regressed",
  "threshold_not_met",
  "baseline_drift",
]);

function object(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function concrete(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.trim().length > 0 &&
    !/[<>]/u.test(value) &&
    !value.includes("\0")
  );
}

function inside(root: string, file: string): boolean {
  const relative = path.relative(root, file);
  return (
    relative !== "" &&
    relative !== ".." &&
    !relative.startsWith(`..${path.sep}`) &&
    !path.isAbsolute(relative)
  );
}

function fileSet(value: unknown): string[] | null {
  if (!Array.isArray(value) || value.length === 0) return null;
  if (
    value.some(
      (item) => !concrete(item) || path.isAbsolute(item) || item.split(/[\\/]/u).includes(".."),
    )
  )
    return null;
  return [...new Set(value as string[])].sort();
}

function readPacket(input: VerifyLevel4MeasuredPacketInput): unknown {
  if (!concrete(input.packetPath)) throw new Error("expected a concrete file path");
  const cwd = path.resolve(input.cwd);
  const requested = path.resolve(cwd, input.packetPath);
  if (!inside(path.join(cwd, ".autoresearch"), requested)) {
    throw new Error("must stay inside cwd/.autoresearch");
  }
  const canonicalCwd = fs.realpathSync(cwd);
  const canonicalFile = fs.realpathSync(requested);
  if (!inside(path.join(canonicalCwd, ".autoresearch"), canonicalFile)) {
    throw new Error("symlink target escapes cwd/.autoresearch");
  }
  // NONBLOCK prevents a substituted FIFO from hanging; NOFOLLOW rejects a final-link race.
  const fd = fs.openSync(
    canonicalFile,
    fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW | fs.constants.O_NONBLOCK,
  );
  try {
    const stat = fs.fstatSync(fd);
    if (!stat.isFile()) throw new Error("must be a regular file");
    if (stat.size > MAX_PACKET_BYTES) throw new Error("exceeds 8 MiB packet limit");
    const bytes = Buffer.alloc(Math.min(stat.size + 1, MAX_PACKET_BYTES + 1));
    let size = 0;
    while (size < bytes.length) {
      const count = fs.readSync(fd, bytes, size, bytes.length - size, null);
      if (count === 0) break;
      size += count;
    }
    if (size !== stat.size) throw new Error("packet size changed during read");
    return JSON.parse(bytes.subarray(0, size).toString("utf8"));
  } finally {
    fs.closeSync(fd);
  }
}

/**
 * Verifies a packet snapshot for measured inventory, not selection or durable authority.
 * No writes, runtime execution, git inspection, receipt replay, or promotion occur here.
 * V1 has no immutable measured-tree attestation: internally consistent stale/forged packets
 * cannot be authenticated by this helper. Controller bindings remain a required trust input.
 */
export function verifyLevel4MeasuredPacket(
  input: VerifyLevel4MeasuredPacketInput,
): Level4MeasuredPacketVerification {
  const issues: string[] = [];
  const check = (condition: boolean, issue: string): void => {
    if (!condition) issues.push(issue);
  };
  const result = (): Level4MeasuredPacketVerification => ({
    verified: issues.length === 0,
    issues,
  });
  check(concrete(input.cwd), "cwd: expected controller cwd");
  check(concrete(input.laneId), "laneId: expected exact cell-scoped lane ID");
  check(concrete(input.metricName), "metricName: expected measurement metric");
  check(
    input.direction === "lower" || input.direction === "higher",
    "direction: expected lower or higher",
  );
  const binding = input.binding;
  if (!object(binding)) {
    issues.push("binding: missing controller-verified candidate binding");
    return result();
  }
  check(binding.laneId === input.laneId, "binding.laneId: must match expected laneId");
  for (const field of [
    "candidateWorktree",
    "candidateBranch",
    "candidateBaseRef",
    "candidateDiffSummary",
  ] as const) {
    check(concrete(binding[field]), `binding.${field}: expected concrete controller lineage`);
  }
  const expectedFiles = fileSet(binding.candidateFilesChanged);
  check(
    expectedFiles !== null,
    "binding.candidateFilesChanged: expected non-empty relative changed-file set",
  );
  if (issues.length > 0 || !concrete(binding.candidateWorktree)) return result();
  const cwd = path.resolve(input.cwd);
  const worktree = path.resolve(cwd, binding.candidateWorktree);
  check(worktree !== cwd, "binding.candidateWorktree: must be isolated from controller cwd");
  if (issues.length > 0) return result();

  let packet: unknown;
  try {
    packet = readPacket(input);
  } catch (error) {
    issues.push(`packetPath: ${error instanceof Error ? error.message : String(error)}`);
    return result();
  }
  if (!object(packet)) {
    issues.push("packet: expected candidate-result object");
    return result();
  }
  check(
    packet.packetKind === "autoresearch.candidate_result.v1",
    "packetKind: expected autoresearch.candidate_result.v1",
  );
  check(packet.adapterContractVersion === 1, "adapterContractVersion: expected 1");
  const owner = validateAutoresearchAdapterPacket(packet);
  check(owner.valid, "owner validation: packet rejected by pi-autoresearch");
  issues.push(...owner.issues.map((issue) => `${issue.path}: ${issue.message}`));
  if (issues.length > 0) return result();

  const candidate = packet.candidate;
  const run = packet.candidateRun;
  const closeout = packet.closeout;
  if (!object(candidate) || !object(run) || !object(closeout)) {
    issues.push(
      "candidate/candidateRun/closeout: non-null objects required for measured inventory",
    );
    return result();
  }
  const matchesCwd = (value: unknown): boolean =>
    concrete(value) && path.isAbsolute(value) && path.resolve(value) === cwd;
  check(matchesCwd(packet.cwd), "cwd: packet must match expected controller cwd");
  check(matchesCwd(closeout.cwd), "closeout.cwd: must match expected controller cwd");
  check(
    concrete(packet.campaign) && packet.campaign === closeout.campaign,
    "campaign: packet and closeout must identify the same configured campaign",
  );
  check(
    closeout.metricName === input.metricName,
    "closeout.metricName: must match expected metricName",
  );
  check(
    closeout.direction === input.direction,
    "closeout.direction: must match expected direction",
  );
  check(
    candidate.source === "candidate_peer_spawn",
    "candidate.source: expected candidate_peer_spawn",
  );
  check(
    concrete(candidate.worktreePath) &&
      path.isAbsolute(candidate.worktreePath) &&
      path.resolve(candidate.worktreePath) === worktree,
    "candidate.worktreePath: must match controller binding",
  );
  for (const [field, expected] of [
    ["branch", binding.candidateBranch],
    ["baseRef", binding.candidateBaseRef],
    ["diffSummary", binding.candidateDiffSummary],
  ] as const) {
    check(candidate[field] === expected, `candidate.${field}: must match controller binding`);
  }
  check(
    isDeepStrictEqual(fileSet(candidate.filesChanged), expectedFiles),
    "candidate.filesChanged: must match controller changed-file set",
  );
  check(
    typeof run.metric === "number" && Number.isFinite(run.metric),
    "candidateRun.metric: finite measurement required",
  );
  check(
    typeof run.status === "string" && MEASURED_STATUSES.has(run.status),
    "candidateRun.status: completed candidate measurement required (not baseline/crash)",
  );
  check(
    run.runKind === "ordinary",
    "candidateRun.runKind: expected ordinary candidate measurement",
  );
  check(
    typeof run.empiricalDecisionClass === "string" &&
      MEASURED_DECISIONS.has(run.empiricalDecisionClass),
    "candidateRun.empiricalDecisionClass: recognized measured outcome required",
  );
  check(
    typeof run.timestamp === "number" && Number.isFinite(run.timestamp) && run.timestamp > 0,
    "candidateRun.timestamp: positive finite timestamp required",
  );
  check(
    run.iteration === null || (Number.isInteger(run.iteration) && Number(run.iteration) >= 0),
    "candidateRun.iteration: expected null or non-negative integer",
  );
  const experiment = run.experiment;
  check(
    object(experiment) && isDeepStrictEqual(experiment.candidate, candidate),
    "candidateRun.experiment.candidate: must match packet candidate",
  );
  check(
    object(experiment) && experiment.hypothesisId === input.laneId,
    "candidateRun.experiment.hypothesisId: must match expected laneId",
  );
  const runs = closeout.runs;
  if (!Array.isArray(runs) || !runs.every(object)) {
    issues.push("closeout.runs: expected run objects");
    return result();
  }
  check(
    Number.isInteger(closeout.runCount) && closeout.runCount === runs.length && runs.length > 0,
    "closeout.runCount: must match non-empty run inventory",
  );
  check(
    Number.isInteger(closeout.successfulRunCount) &&
      Number(closeout.successfulRunCount) >= 0 &&
      Number(closeout.successfulRunCount) <= runs.length,
    "closeout.successfulRunCount: must be within run inventory bounds",
  );
  const latest = [...runs]
    .reverse()
    .find((item) => object(item.experiment) && object(item.experiment.candidate));
  check(
    isDeepStrictEqual(latest, run),
    "closeout.runs: candidateRun must equal latest candidate-bearing run",
  );
  check(
    Array.isArray(closeout.candidateBindings) &&
      closeout.candidateBindings.some((item) => isDeepStrictEqual(item, candidate)),
    "closeout.candidateBindings: must contain packet candidate",
  );
  return result();
}
