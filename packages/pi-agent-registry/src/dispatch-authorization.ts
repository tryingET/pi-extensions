// ---
// summary: exact-task AK authorization reads and dispatch evidence recording through the ak CLI boundary.
// read_when:
//   - changing task authorization rules or AK evidence semantics for standing-agent dispatch.
// ---

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import {
  type AkTaskSnapshot,
  DISPATCH_EVIDENCE_CHECK_TYPE,
  DISPATCH_PHASE,
  DISPATCH_RECEIPT_SCHEMA,
} from "./dispatch-contract.ts";

const execFileAsync = promisify(execFile);

const AK_TIMEOUT_MS = 15_000;

export type AkAuthorizationFailureCode =
  | "ak_unavailable"
  | "task_not_found"
  | "task_repo_mismatch"
  | "task_not_claimed"
  | "task_lease_expired";

export class AkAuthorizationError extends Error {
  readonly code: AkAuthorizationFailureCode;

  constructor(code: AkAuthorizationFailureCode, message: string) {
    super(message);
    this.name = "AkAuthorizationError";
    this.code = code;
  }
}

/** Read one exact AK task through `ak task show <id> -F json` (read-only). */
export async function readAkTask(
  taskId: number,
  options?: { akBinary?: string },
): Promise<AkTaskSnapshot> {
  const akBinary = options?.akBinary ?? "ak";
  let stdout: string;
  try {
    const result = await execFileAsync(akBinary, ["task", "show", String(taskId), "-F", "json"], {
      timeout: AK_TIMEOUT_MS,
      maxBuffer: 1024 * 1024,
      windowsHide: true,
    });
    stdout = result.stdout;
  } catch {
    throw new AkAuthorizationError(
      "ak_unavailable",
      `AK task ${taskId} could not be read (ak task show failed); dispatch authorization is unverifiable`,
    );
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(stdout);
  } catch {
    throw new AkAuthorizationError(
      "ak_unavailable",
      `AK task ${taskId} produced unparseable output; dispatch authorization is unverifiable`,
    );
  }
  if (!parsed || typeof parsed !== "object") {
    throw new AkAuthorizationError("task_not_found", `AK task ${taskId} returned no task object`);
  }
  const row = parsed as Record<string, unknown>;
  const id = row.id;
  const repo = row.repo;
  const title = row.title;
  if (typeof id !== "number" || id !== taskId || typeof repo !== "string" || !repo) {
    throw new AkAuthorizationError(
      "task_not_found",
      `AK task ${taskId} returned an unusable task identity`,
    );
  }
  return {
    id,
    repo,
    title: typeof title === "string" ? title : "",
    status: typeof row.status === "string" ? row.status : "",
    claimed_by: typeof row.claimed_by === "string" && row.claimed_by ? row.claimed_by : null,
    lease_expires_at:
      typeof row.lease_expires_at === "string" && row.lease_expires_at
        ? row.lease_expires_at
        : null,
  };
}

/**
 * Phase-2 exact-task authorization: the task must exist, be registered to the
 * dispatch-origin repository, and carry a live claim. Readiness never becomes
 * authorization — only an in-flight claim authorizes one read-only dispatch.
 */
export function authorizeExactTask(
  task: AkTaskSnapshot,
  expectedRepoRoot: string,
): { ok: true } | { ok: false; code: AkAuthorizationFailureCode; message: string } {
  if (normalizeRepoPath(task.repo) !== normalizeRepoPath(expectedRepoRoot)) {
    return {
      ok: false,
      code: "task_repo_mismatch",
      message: `AK task ${task.id} belongs to repo ${task.repo}; dispatch origin is ${expectedRepoRoot}`,
    };
  }
  if (task.status !== "claimed") {
    return {
      ok: false,
      code: "task_not_claimed",
      message: `AK task ${task.id} status is "${task.status}"; only a claimed task authorizes one read-only standing-agent dispatch`,
    };
  }
  if (!task.claimed_by) {
    return {
      ok: false,
      code: "task_not_claimed",
      message: `AK task ${task.id} is claimed without a claimant; authorization is unverifiable`,
    };
  }
  if (task.lease_expires_at) {
    const expiry = Date.parse(task.lease_expires_at);
    if (!Number.isFinite(expiry) || expiry <= Date.now()) {
      return {
        ok: false,
        code: "task_lease_expired",
        message: `AK task ${task.id} claim lease is expired or unparseable; re-claim before dispatch`,
      };
    }
  } else {
    return {
      ok: false,
      code: "task_lease_expired",
      message: `AK task ${task.id} carries no lease expiry; authorization is unverifiable`,
    };
  }
  return { ok: true };
}

function normalizeRepoPath(value: string): string {
  return value.replace(/\/+$/u, "");
}

/** Typed AK evidence details for one settled Phase-2 dispatch. */
export function buildDispatchEvidenceDetails(facts: {
  agent: string;
  agentRepoCommit: string;
  manifestSha256: string;
  task: number;
  attemptIndex: number;
  dispatchId: string;
  attemptId: string;
  sessionName: string;
  effectDisposition: string;
  effectCorrelationId: string;
  effectCorrelationEchoVerified: boolean;
  noMutationObserved: boolean;
  outputSha256: string;
  receiptSha256: string;
  receiptName?: string;
}): Record<string, unknown> {
  return {
    schema: DISPATCH_RECEIPT_SCHEMA,
    phase: DISPATCH_PHASE,
    agent: facts.agent,
    agentRepoCommit: facts.agentRepoCommit,
    manifestSha256: facts.manifestSha256,
    task: facts.task,
    attemptIndex: facts.attemptIndex,
    dispatchId: facts.dispatchId,
    attemptId: facts.attemptId,
    sessionName: facts.sessionName,
    effectDisposition: facts.effectDisposition,
    effectCorrelationId: facts.effectCorrelationId,
    effectCorrelationEchoVerified: facts.effectCorrelationEchoVerified,
    noMutationObserved: facts.noMutationObserved,
    outputSha256: facts.outputSha256,
    receiptSha256: facts.receiptSha256,
    ...(facts.receiptName ? { receiptName: facts.receiptName } : {}),
  };
}

export interface AkEvidenceRecordResult {
  evidenceId: number;
}

export interface AkEvidenceRecordFailure {
  error: Error;
}

/**
 * Append one typed AK evidence row for a completed dispatch. Evidence is
 * recorded only for a settled, no-mutation-observed dispatch; failures keep
 * the immutable receipt as truth and leave AK recording to the parent task.
 */
export async function recordDispatchEvidence(
  params: {
    taskId: number;
    details: Record<string, unknown>;
  },
  options?: { akBinary?: string },
): Promise<AkEvidenceRecordResult> {
  const akBinary = options?.akBinary ?? "ak";
  const detailsJson = JSON.stringify(params.details);
  let stdout: string;
  try {
    const result = await execFileAsync(
      akBinary,
      [
        "evidence",
        "record",
        "--task",
        String(params.taskId),
        "--check-type",
        DISPATCH_EVIDENCE_CHECK_TYPE,
        "--result",
        "pass",
        "--details",
        detailsJson,
      ],
      { timeout: AK_TIMEOUT_MS, maxBuffer: 1024 * 1024, windowsHide: true },
    );
    stdout = result.stdout;
  } catch (error) {
    throw new Error(
      `AK evidence recording failed: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  const id = Number(
    /Recorded evidence\s+#?(\d+)/iu.exec(stdout)?.[1] ?? /#(\d+)/u.exec(stdout)?.[1],
  );
  if (!Number.isInteger(id) || id <= 0) {
    throw new Error(`AK evidence recording returned no evidence id (output: ${stdout.trim()})`);
  }
  return { evidenceId: id };
}
