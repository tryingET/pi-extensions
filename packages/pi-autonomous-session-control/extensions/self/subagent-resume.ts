import { basename } from "node:path";
import {
  listSubagentSessionStatuses,
  resolveContainedSessionPath,
  runningStatusHasLiveOwner,
  type SubagentSessionStatus,
} from "./subagent-session.ts";

export interface ResolvedSubagentResume {
  dispatchId: string;
  sessionName: string;
  sessionFile: string;
  previousAttemptId?: string;
  status: SubagentSessionStatus;
}

export function resolveSubagentResume(params: {
  sessionsDir: string;
  dispatchId: string;
  parentSessionKey?: string;
  parentRepoRoot?: string;
}): { ok: true; value: ResolvedSubagentResume } | { ok: false; error: string } {
  const dispatchId = params.dispatchId.trim();
  // The exact persisted status match plus repository/session ownership checks below
  // are the authority boundary. Keep the token printable and bounded, but do not
  // require the current `dispatch-` prefix: older ASC releases emitted other
  // opaque dispatch-id formats that remain safe to resume when ownership proves.
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/u.test(dispatchId)) {
    return { ok: false, error: "resumeDispatchId must be an exact ASC dispatch id token" };
  }
  const matches = listSubagentSessionStatuses(params.sessionsDir).filter(
    (status) => status.dispatchId === dispatchId,
  );
  if (matches.length !== 1) {
    return {
      ok: false,
      error:
        matches.length === 0
          ? `No owned subagent dispatch found for ${dispatchId}`
          : `Dispatch id ${dispatchId} is ambiguous`,
    };
  }
  const status = matches[0];
  if (status.status === "running" && runningStatusHasLiveOwner(status)) {
    return { ok: false, error: `Dispatch ${dispatchId} is still running` };
  }
  if (!status.parentRepoRoot || !params.parentRepoRoot) {
    return { ok: false, error: `Dispatch ${dispatchId} lacks verifiable repository ownership` };
  }
  if (status.parentRepoRoot !== params.parentRepoRoot) {
    return { ok: false, error: `Dispatch ${dispatchId} belongs to a different repository` };
  }
  if (!status.parentSessionKey || !params.parentSessionKey) {
    return { ok: false, error: `Dispatch ${dispatchId} lacks verifiable parent session ownership` };
  }
  if (status.parentSessionKey !== params.parentSessionKey) {
    return { ok: false, error: `Dispatch ${dispatchId} belongs to a different parent session` };
  }
  const sessionFile = resolveContainedSessionPath(params.sessionsDir, status.sessionFile, {
    requireExisting: true,
  });
  if (!sessionFile || basename(sessionFile) !== `${status.sessionName}.jsonl`) {
    return { ok: false, error: `Dispatch ${dispatchId} has no canonical resumable JSONL session` };
  }
  return {
    ok: true,
    value: {
      dispatchId,
      sessionName: status.sessionName,
      sessionFile,
      previousAttemptId: status.attemptId,
      status,
    },
  };
}
