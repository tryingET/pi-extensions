// summary: executes and registers historical candidate cleanup projection and lifecycle-v2 closeout tools.
// read_when:
//   - changing candidate cleanup quarantine, lifecycle closeout, janitor, or exact sidecar projection behavior.

import { readFileSync } from "node:fs";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import type {
  executeCandidatePeerCloseout as executeLifecycleCandidatePeerCloseout,
  projectCandidatePeerCloseout,
} from "../src/candidatePeerCloseout.ts";
import type { runCandidatePeerJanitor } from "../src/candidatePeerJanitor.ts";
import {
  type CandidatePeerRegistryRecord,
  getCandidatePeerRegistryPath,
} from "../src/candidatePeerRegistry.ts";
import { LITTLE_HELPERS_PEER_TOOL_NAMES } from "../src/capabilityManifest.ts";
import {
  type CandidatePeerCleanupRequest,
  type CandidatePeerCloseoutRequest,
  candidatePeerCleanupParameters,
  candidatePeerCloseoutParameters,
  type PiToolContext,
} from "./sidequestContracts.ts";
import { successToolResult } from "./sidequestPeerReportBack.ts";

export function registerCandidateCloseoutTools({
  pi,
  env,
  projectCloseout,
  executeCloseout,
  runCloseoutJanitor,
}: {
  pi: ExtensionAPI;
  env: NodeJS.ProcessEnv;
  projectCloseout: typeof projectCandidatePeerCloseout;
  executeCloseout: typeof executeLifecycleCandidatePeerCloseout;
  runCloseoutJanitor: typeof runCandidatePeerJanitor;
}): void {
  const [, , , , CANDIDATE_PEER_CLEANUP_TOOL, CANDIDATE_PEER_CLOSEOUT_TOOL] =
    LITTLE_HELPERS_PEER_TOOL_NAMES;
  const options = { env };

  async function executeCandidatePeerCleanup(
    _toolName: string,
    params: unknown,
    _ctx: PiToolContext,
  ) {
    const request = params as CandidatePeerCleanupRequest;
    const peerRunIds = (request.peerRunIds ?? []).map((id) => id.trim()).filter(Boolean);
    const execute = request.execute === true;
    const closeVisibleResources = request.closeVisibleResources === true;
    const env = options.env ?? process.env;

    if (peerRunIds.length === 0) {
      throw new Error("candidate_peer_cleanup requires at least one exact peerRunId.");
    }
    if (execute) {
      return successToolResult("candidate peer cleanup blocked", {
        ok: false,
        execution: "blocked_permanent_v1_quarantine",
        peerRunIds,
        blockers: [
          "Serialized v1 cleanup packets are permanently non-executable under AK decision 59.",
          "Use candidate-lifecycle-v2 review, disposition, integration proof, restoration-verified archive, authorization, and cleanup for the exact resource generation.",
        ],
      });
    }

    const lanes = peerRunIds.map((peerRunId) => {
      const registryPath = getCandidatePeerRegistryPath(peerRunId, env);
      const record = JSON.parse(readFileSync(registryPath, "utf8")) as CandidatePeerRegistryRecord;
      return {
        peerRunId,
        registryPath,
        repoRoot: record.repoRoot,
        worktreePath: record.worktreePath,
        branchName: record.branchName,
        archiveDir: record.archiveDir,
        cleanupPacket: record.cleanupPacket,
        tabOrSessionHint: record.launch.titleBase ?? peerRunId,
        processHint: `sidequest-pi process containing exact worktree path ${record.worktreePath}`,
        visibleResourceCommands: [
          {
            id: "terminate-exact-sidequest-process",
            description:
              "Terminate only sidequest/Pi processes whose command line contains the exact registered worktree path; closing that process closes the visible peer tab/session when the tab is owned by the launched process.",
            command: "sh",
            args: [
              "-c",
              [
                "set -eu",
                "worktree_path=$1",
                "pids=$(ps -eo pid=,args= | grep -F \"$worktree_path\" | grep -E 'sidequest-pi pi| pi ' | grep -v grep | awk '{print $1}' || true)",
                'test -n "$pids" || exit 0',
                "kill $pids 2>/dev/null || true",
                "sleep 1",
                "pids=$(ps -eo pid=,args= | grep -F \"$worktree_path\" | grep -E 'sidequest-pi pi| pi ' | grep -v grep | awk '{print $1}' || true)",
                'test -z "$pids" || kill -9 $pids 2>/dev/null || true',
              ].join("; "),
              "candidate-peer-close-visible-resource",
              record.worktreePath,
            ],
            cwd: record.repoRoot,
            destructive: true,
          },
        ],
      };
    });

    return successToolResult("candidate peer cleanup dry run", {
      ok: true,
      execution: "dry_run_plan_only",
      closeVisibleResources,
      laneCount: lanes.length,
      lanes,
      commandResults: [],
      boundary:
        "Registry-v1 cleanup is permanently non-executable. This result projects exact historical sidecar commands for inspection only; lifecycle-v2 owner tooling is the sole executable cleanup path.",
    });
  }

  async function executeCandidatePeerCloseout(
    toolName: string,
    params: unknown,
    _ctx: PiToolContext,
  ) {
    const request = params as CandidatePeerCloseoutRequest;
    const action = request.action;
    const env = options.env ?? process.env;
    const planningContext = {
      taskId: request.taskId,
      integrationCloseout: request.integrationCloseout,
      cleanupTrigger: request.cleanupTrigger,
      nonAuthorizing: true,
    };
    if (action === "status" || action === "plan") {
      const result = projectCloseout({
        action,
        peerRunIds: request.peerRunIds ?? [],
        env,
      });
      return successToolResult(`${toolName} ${action}`, {
        ok: true,
        ...result,
        planningContext,
      });
    }
    if (action === "execute_authorized") {
      const result = executeCloseout({ peerRunIds: request.peerRunIds ?? [], env });
      return successToolResult(`${toolName} ${result.execution}`, {
        ok: result.execution === "completed",
        ...result,
        planningContext,
      });
    }
    if (action === "janitor_status" || action === "janitor_execute_authorized") {
      const repoRoot = request.repoRoot?.trim() ?? "";
      if (!repoRoot) throw new Error(`${toolName} ${action} requires an exact repoRoot`);
      const result = runCloseoutJanitor({
        action: action === "janitor_status" ? "status" : "execute_authorized",
        repoRoot,
        ...(request.overdueAfterMs === undefined ? {} : { overdueAfterMs: request.overdueAfterMs }),
        env,
      });
      return successToolResult(`${toolName} ${action} ${result.execution}`, {
        ok: ["not_requested", "completed"].includes(result.execution),
        ...result,
        toolAction: action,
        planningContext,
      });
    }
    throw new Error(`${toolName} requires a supported lifecycle-v2 action`);
  }

  pi.registerTool({
    name: CANDIDATE_PEER_CLEANUP_TOOL,
    label: "Candidate Peer Cleanup",
    description:
      "Inspect historical candidate registry-v1 cleanup projections without executing them.",
    promptSnippet:
      "Use for read-only inspection of exact registry-v1 sidecars. execute=true is permanently blocked by Decision 59; use lifecycle-v2 owner tooling for cleanup.",
    parameters: candidatePeerCleanupParameters,
    execute: (_toolCallId, params, _signal, _onUpdate, ctx) =>
      executeCandidatePeerCleanup(CANDIDATE_PEER_CLEANUP_TOOL, params, ctx),
  });

  pi.registerTool({
    name: CANDIDATE_PEER_CLOSEOUT_TOOL,
    label: "Candidate Peer Closeout",
    description:
      "Resolve exact peer aliases to lifecycle-v2 generations, plan closeout, execute existing cleanup authorization, or run a repository-bounded janitor.",
    promptSnippet:
      "Use status/plan for read-only lifecycle-v2 resolution. execute_authorized and janitor_execute_authorized may act only on existing exact cleanup authorization; peer final reports, integration status, and age never authorize cleanup.",
    parameters: candidatePeerCloseoutParameters,
    execute: (_toolCallId, params, _signal, _onUpdate, ctx) =>
      executeCandidatePeerCloseout(CANDIDATE_PEER_CLOSEOUT_TOOL, params, ctx),
  });
}
