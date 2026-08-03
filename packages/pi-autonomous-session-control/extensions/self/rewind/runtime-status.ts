import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import type { ResolvedRewindRetentionConfig } from "./runtime-retention.ts";
import type { RewindRuntimeState } from "./runtime-state.ts";

export function registerRewindStatusCommand(
  pi: ExtensionAPI,
  state: RewindRuntimeState,
  retentionConfig: ResolvedRewindRetentionConfig,
): void {
  pi.registerCommand("asc-rewind-status", {
    description: "Show ASC rewind runtime status for /tree and /fork restore diagnostics",
    handler: async (_args, ctx) => {
      const uniqueSnapshots = new Set(state.entryToCommit.values()).size;
      const retentionCountLabel =
        state.retention.status === "failed" ? "retention last successful" : "retention";
      const lines = [
        `ASC rewind: ${state.isGitRepo && state.git ? "available" : "unavailable"}`,
        `cwd: ${ctx.cwd}`,
        `git initialized: ${state.isGitRepo && state.git ? "yes" : "no"}`,
        `rewind points: ${state.entryToCommit.size}`,
        `snapshots: ${uniqueSnapshots}`,
        `current snapshot: ${state.currentCommitSha ?? "none"}`,
        `undo snapshot: ${state.undoCommitSha ?? "none"}`,
        `pending tree state: ${state.pendingTreeState ? "yes" : "no"}`,
        `retention: ${state.retention.status}`,
        `${retentionCountLabel} live snapshots: ${state.retention.liveSnapshots}`,
        `${retentionCountLabel} pinned snapshots: ${state.retention.pinnedSnapshots}`,
        `${retentionCountLabel} ordinary snapshots: ${state.retention.retainedOrdinarySnapshots}`,
        `retention active sessions: ${state.retention.activeSessions}`,
        `retention store head: ${state.retention.storeHead ?? "none"}`,
        `retention last run: ${state.retention.lastRunAt ?? "never"}`,
        ...(state.retention.error ? [`retention error: ${state.retention.error}`] : []),
        `retention policy: maxSnapshots=${retentionConfig.maxSnapshots}, maxAgeDays=${retentionConfig.maxAgeDays}`,
        "hint: /tree must select a non-active node before Pi emits session_before_tree",
      ];
      if (ctx.hasUI) {
        ctx.ui.notify(lines.join("\n"), state.isGitRepo && state.git ? "info" : "warning");
      }
    },
  });
}
