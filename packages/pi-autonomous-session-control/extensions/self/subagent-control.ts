import { createHash, randomUUID } from "node:crypto";
import { closeSync, existsSync, openSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  listSubagentSessionStatuses,
  readLifecycleOwnedSessionStatus,
  runningStatusHasLiveOwner,
  type SubagentState,
} from "./subagent-session.ts";

interface SubagentCancelRequest {
  kind: "asc.subagent_cancel_request.v1";
  token: string;
  dispatchId: string;
  attemptId: string;
  sessionName: string;
  requestedAt: string;
  requestedBy: string;
  reason?: string;
}

export type SubagentCancelResult =
  | { ok: true; status: "cancel_requested"; dispatchId: string; sessionName: string }
  | { ok: true; status: "already_terminal"; dispatchId: string; sessionName: string }
  | { ok: false; status: "not_found" | "ambiguous" | "not_live"; error: string };

export function getSubagentCancelRequestPath(
  sessionsDir: string,
  sessionName: string,
  attemptId: string,
): string {
  const attemptKey = createHash("sha256").update(attemptId).digest("hex").slice(0, 20);
  return join(sessionsDir, `${sessionName}.${attemptKey}.cancel.json`);
}

export function readSubagentCancelRequest(
  sessionsDir: string,
  sessionName: string,
  attemptId: string,
): SubagentCancelRequest | undefined {
  const path = getSubagentCancelRequestPath(sessionsDir, sessionName, attemptId);
  if (!existsSync(path)) return undefined;
  try {
    const parsed = JSON.parse(readFileSync(path, "utf8")) as Partial<SubagentCancelRequest>;
    return parsed.kind === "asc.subagent_cancel_request.v1" &&
      typeof parsed.token === "string" &&
      parsed.token.length > 0 &&
      typeof parsed.dispatchId === "string" &&
      typeof parsed.attemptId === "string" &&
      typeof parsed.sessionName === "string" &&
      typeof parsed.requestedAt === "string" &&
      Number.isFinite(Date.parse(parsed.requestedAt)) &&
      typeof parsed.requestedBy === "string" &&
      (parsed.reason === undefined || typeof parsed.reason === "string")
      ? (parsed as SubagentCancelRequest)
      : undefined;
  } catch {
    return undefined;
  }
}

export function getMatchingSubagentCancelRequest(params: {
  sessionsDir: string;
  sessionName: string;
  dispatchId?: string;
  attemptId?: string;
}): SubagentCancelRequest | undefined {
  if (!params.attemptId) return undefined;
  const request = readSubagentCancelRequest(
    params.sessionsDir,
    params.sessionName,
    params.attemptId,
  );
  return request &&
    request.sessionName === params.sessionName &&
    request.dispatchId === params.dispatchId &&
    request.attemptId === params.attemptId
    ? request
    : undefined;
}

export function removeMatchingSubagentCancelRequest(params: {
  sessionsDir: string;
  sessionName: string;
  attemptId?: string;
  token?: string;
}): void {
  if (!params.attemptId || !params.token) return;
  removeCancelRequestIfOwned(
    getSubagentCancelRequestPath(params.sessionsDir, params.sessionName, params.attemptId),
    params.token,
  );
}

export function cancelSubagentDispatch(params: {
  state: SubagentState;
  dispatchId: string;
  requestedBy: string;
  reason?: string;
  parentRepoRoot?: string;
}): SubagentCancelResult {
  const dispatchId = params.dispatchId.trim();
  const matches = listSubagentSessionStatuses(params.state.sessionsDir).filter(
    (status) => status.dispatchId === dispatchId,
  );
  if (matches.length === 0) {
    return { ok: false, status: "not_found", error: `Unknown dispatch id ${dispatchId}` };
  }
  if (matches.length !== 1) {
    return { ok: false, status: "ambiguous", error: `Ambiguous dispatch id ${dispatchId}` };
  }
  const status = matches[0];
  if (params.parentRepoRoot && status.parentRepoRoot !== params.parentRepoRoot) {
    return {
      ok: false,
      status: "not_found",
      error: `Dispatch ${dispatchId} belongs to a different repository`,
    };
  }
  if (status.status !== "running") {
    return {
      ok: true,
      status: "already_terminal",
      dispatchId,
      sessionName: status.sessionName,
    };
  }
  if (status.cancelSupported !== true) {
    return {
      ok: false,
      status: "not_live",
      error: `Dispatch ${dispatchId} does not expose a signal-safe child process owner`,
    };
  }
  if (!runningStatusHasLiveOwner(status)) {
    return {
      ok: false,
      status: "not_live",
      error: `Dispatch ${dispatchId} has no verified live process owner`,
    };
  }
  if (!status.attemptId) {
    return {
      ok: false,
      status: "not_live",
      error: `Dispatch ${dispatchId} has no exact attempt identity`,
    };
  }

  const request: SubagentCancelRequest = {
    kind: "asc.subagent_cancel_request.v1",
    token: randomUUID(),
    dispatchId,
    attemptId: status.attemptId,
    sessionName: status.sessionName,
    requestedAt: new Date().toISOString(),
    requestedBy: params.requestedBy.slice(0, 120),
    reason: params.reason?.trim().slice(0, 300),
  };
  const requestPath = getSubagentCancelRequestPath(
    params.state.sessionsDir,
    status.sessionName,
    status.attemptId,
  );
  let activeRequest = request;
  if (!writeCancelRequestExclusive(requestPath, request)) {
    const existing = getMatchingSubagentCancelRequest({
      sessionsDir: params.state.sessionsDir,
      sessionName: status.sessionName,
      dispatchId,
      attemptId: status.attemptId,
    });
    if (!existing) {
      return {
        ok: false,
        status: "ambiguous",
        error: `Dispatch ${dispatchId} has a conflicting cancellation request`,
      };
    }
    activeRequest = existing;
  }

  // Reconcile lifecycle and PID identity after publishing intent but immediately before signal.
  const current = readLifecycleOwnedSessionStatus(params.state.sessionsDir, status.sessionName);
  if (
    current?.status !== "running" ||
    current.dispatchId !== dispatchId ||
    current.attemptId !== status.attemptId ||
    !runningStatusHasLiveOwner(current)
  ) {
    removeCancelRequestIfOwned(requestPath, activeRequest.token);
    return current && current.status !== "running"
      ? { ok: true, status: "already_terminal", dispatchId, sessionName: status.sessionName }
      : {
          ok: false,
          status: "not_live",
          error: `Dispatch ${dispatchId} no longer has the verified running attempt`,
        };
  }

  try {
    process.kill(status.pid, "SIGTERM");
  } catch (error) {
    removeCancelRequestIfOwned(requestPath, activeRequest.token);
    return {
      ok: false,
      status: "not_live",
      error: `Failed to signal dispatch ${dispatchId}: ${
        error instanceof Error ? error.message : String(error)
      }`,
    };
  }
  return { ok: true, status: "cancel_requested", dispatchId, sessionName: status.sessionName };
}

function writeCancelRequestExclusive(path: string, request: SubagentCancelRequest): boolean {
  let fd: number;
  try {
    fd = openSync(path, "wx");
  } catch (error) {
    const code =
      error && typeof error === "object" && "code" in error
        ? String((error as NodeJS.ErrnoException).code ?? "")
        : "";
    if (code === "EEXIST") return false;
    throw error;
  }
  try {
    writeFileSync(fd, JSON.stringify(request), "utf8");
  } finally {
    closeSync(fd);
  }
  return true;
}

function removeCancelRequestIfOwned(path: string, token: string): void {
  const current = (() => {
    try {
      return JSON.parse(readFileSync(path, "utf8")) as { token?: unknown };
    } catch {
      return undefined;
    }
  })();
  if (current?.token !== token) return;
  try {
    unlinkSync(path);
  } catch {
    // Best effort rollback; mismatched or malformed request files remain fail-closed.
  }
}
