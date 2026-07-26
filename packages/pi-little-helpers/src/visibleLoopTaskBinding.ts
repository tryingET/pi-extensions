// summary: validates AK task execution bindings before visible-loop or nexus-loop launch.
// read_when:
//   - changing task-bound visible-loop admission, readiness checks, or repo containment.

import { isAbsolute, relative, resolve, sep } from "node:path";

export interface VisibleLoopTaskBindingExecResult {
  code: number;
  stdout?: string;
  stderr?: string;
  killed?: boolean;
}

export type VisibleLoopTaskBindingExec = (
  command: string,
  args: string[],
  options?: { cwd?: string; timeout?: number },
) => Promise<VisibleLoopTaskBindingExecResult>;

export async function checkAkTaskExecutionBinding(
  execRunner: VisibleLoopTaskBindingExec,
  cwd: string,
  taskId: number,
): Promise<string | undefined> {
  if (!Number.isSafeInteger(taskId) || taskId < 1) return "AK task id is invalid";

  let taskResult: VisibleLoopTaskBindingExecResult;
  try {
    taskResult = await execRunner("ak", ["task", "show", String(taskId), "--json"], {
      cwd,
      timeout: 10_000,
    });
  } catch {
    return `AK task #${taskId} could not be read`;
  }
  if (taskResult.code !== 0 || taskResult.killed) return `AK task #${taskId} could not be read`;

  let task: Record<string, unknown>;
  try {
    const parsed = JSON.parse(taskResult.stdout ?? "") as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return `AK task #${taskId} returned an invalid record`;
    }
    task = parsed as Record<string, unknown>;
  } catch {
    return `AK task #${taskId} returned invalid JSON`;
  }

  if (task.id !== taskId) return `AK task #${taskId} identity did not match the readback`;
  const taskRepo = typeof task.repo === "string" ? task.repo.trim() : "";
  if (!taskRepo || (resolve(taskRepo) !== resolve(cwd) && !isPathInside(taskRepo, cwd))) {
    return `AK task #${taskId} belongs to another repository`;
  }
  if (task.active_deferral) return `AK task #${taskId} is actively deferred`;

  if (task.status === "claimed") {
    const leaseExpiresAt = typeof task.lease_expires_at === "string" ? task.lease_expires_at : "";
    if (!leaseExpiresAt) return `AK task #${taskId} has no claim lease`;
    const leaseExpiry = Date.parse(leaseExpiresAt);
    if (!Number.isFinite(leaseExpiry) || leaseExpiry <= Date.now()) {
      return `AK task #${taskId} has an invalid or expired claim lease`;
    }
    return undefined;
  }
  if (task.status !== "pending") {
    return `AK task #${taskId} is not pending or claimed`;
  }

  let readyResult: VisibleLoopTaskBindingExecResult;
  try {
    readyResult = await execRunner("ak", ["task", "ready", "-r", taskRepo, "--json"], {
      cwd,
      timeout: 10_000,
    });
  } catch {
    return `AK task #${taskId} readiness could not be verified`;
  }
  if (readyResult.code !== 0 || readyResult.killed) {
    return `AK task #${taskId} readiness could not be verified`;
  }
  try {
    const ready = JSON.parse(readyResult.stdout ?? "") as unknown;
    if (
      !Array.isArray(ready) ||
      !ready.some(
        (item) =>
          item !== null &&
          typeof item === "object" &&
          !Array.isArray(item) &&
          (item as Record<string, unknown>).id === taskId,
      )
    ) {
      return `AK task #${taskId} is not ready`;
    }
  } catch {
    return `AK task #${taskId} readiness returned invalid JSON`;
  }
  return undefined;
}

function isPathInside(parent: string, child: string): boolean {
  const rel = relative(resolve(parent), resolve(child));
  return Boolean(rel) && !rel.startsWith("..") && !rel.includes(`..${sep}`) && !isAbsolute(rel);
}
