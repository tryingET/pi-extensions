// summary: executes and registers owner-authorized candidate peer spawn with exact worktree and registry projection semantics.
// read_when:
//   - changing candidate_peer_spawn admission, worktree, launch, registry, or tool output behavior.

import { existsSync } from "node:fs";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import type {
  bindCandidateAdmission,
  CandidateAdmissionReservation,
  releaseCandidateAdmission,
  reserveCandidateAdmission,
} from "../src/candidatePeerAdmission.ts";
import {
  createCandidatePeerRegistryRecord,
  writeCandidatePeerRegistryRecord,
} from "../src/candidatePeerRegistry.ts";
import { LITTLE_HELPERS_PEER_TOOL_NAMES } from "../src/capabilityManifest.ts";
import {
  admissionRegistryBinding,
  prepareCandidatePeerWorktree,
  releasePreparationFailure,
  resolveCandidateRepoRoot,
} from "./sidequestCandidateWorkspace.ts";
import {
  type CandidatePeerSpawnRequest,
  candidatePeerSpawnParameters,
  classifyCandidateAdmissionFailure,
  type PiToolContext,
} from "./sidequestContracts.ts";
import type { ExecRunner } from "./sidequestGhostty.ts";
import { launchPiQuestSession, type SidequestLaunchOptions } from "./sidequestLaunch.ts";
import {
  buildCandidatePeerSpawnPrompt,
  createQuestId,
  normalizeCandidatePeerReportBack,
  normalizeStringArray,
} from "./sidequestPeerPrompts.ts";
import {
  errorToolResult,
  expectedPeerMessages,
  parentPeerTargetFailureResult,
  peerLaunchResultMessage,
  reportBackNextStep,
  successToolResult,
  validateParentPeerTarget,
} from "./sidequestPeerReportBack.ts";

export function registerCandidatePeerSpawnTool({
  pi,
  options,
  defaultPiBin,
  reserveAdmission,
  bindAdmission,
  releaseAdmission,
}: {
  pi: ExtensionAPI;
  options: SidequestLaunchOptions;
  defaultPiBin: string;
  reserveAdmission: typeof reserveCandidateAdmission;
  bindAdmission: typeof bindCandidateAdmission;
  releaseAdmission: typeof releaseCandidateAdmission;
}): void {
  const [, , , CANDIDATE_PEER_SPAWN_TOOL] = LITTLE_HELPERS_PEER_TOOL_NAMES;

  async function executeCandidatePeerSpawn(toolName: string, params: unknown, ctx: PiToolContext) {
    const request = params as CandidatePeerSpawnRequest;
    const objective = request.objective?.trim() ?? "";
    const reportBack = normalizeCandidatePeerReportBack(request);
    const parentCwd = request.cwd?.trim() || ctx.cwd || process.cwd();
    const env = options.env ?? process.env;
    const pathExists = options.pathExists ?? existsSync;
    const execRunner: ExecRunner =
      options.exec ?? ((command, execArgs, execOptions) => pi.exec(command, execArgs, execOptions));

    if (!objective) {
      return errorToolResult(`${toolName} requires a non-empty objective.`, {
        ok: false,
        tool: toolName,
        canonicalTool: "candidate_peer_spawn",
        reportBack,
        error: "blank_objective",
      });
    }

    if (reportBack === "intercom") {
      const parentPeerTarget = validateParentPeerTarget(request.parentPeerTarget);
      if (!parentPeerTarget.ok) return parentPeerTargetFailureResult(toolName, parentPeerTarget);
    }

    const repository = await resolveCandidateRepoRoot(execRunner, parentCwd);
    if (!repository.ok) {
      return errorToolResult(`${toolName} failed: ${repository.error}`, {
        ok: false,
        tool: toolName,
        canonicalTool: "candidate_peer_spawn",
        reportBack,
        parentCwd,
        error: "candidate_repo_resolution_failed",
      });
    }
    let admission: CandidateAdmissionReservation;
    try {
      admission = reserveAdmission({ repoRoot: repository.repoRoot, objective }, env);
    } catch (error) {
      const failure = classifyCandidateAdmissionFailure(error);
      return errorToolResult(`${toolName} admission blocked: ${failure.message}`, {
        ok: false,
        tool: toolName,
        canonicalTool: "candidate_peer_spawn",
        reportBack,
        parentCwd,
        repoRoot: repository.repoRoot,
        error: "candidate_admission_blocked",
        ...failure.details,
      });
    }

    const worktree = await prepareCandidatePeerWorktree({
      execRunner,
      pathExists,
      env,
      request,
      parentCwd,
      objective,
      admittedRepoRoot: repository.repoRoot,
    });

    if (!worktree.ok) {
      const admissionReleaseError = releasePreparationFailure(
        admission,
        worktree.error,
        env,
        releaseAdmission,
      );
      return errorToolResult(`${toolName} failed: ${worktree.error}`, {
        ok: false,
        tool: toolName,
        canonicalTool: "candidate_peer_spawn",
        reportBack,
        parentCwd: worktree.parentCwd,
        repoRoot: worktree.repoRoot,
        worktreePath: worktree.worktreePath,
        branchName: worktree.branchName,
        baseRef: worktree.baseRef,
        parentDirty: worktree.parentDirty,
        parentDirtyWarning: worktree.parentDirtyWarning,
        naming: worktree.naming,
        admissionId: admission.admissionId,
        admissionReleaseError,
        error: "worktree_prepare_failed",
        reason: worktree.error,
      });
    }

    const questId = createQuestId("candidatepeer");
    try {
      bindAdmission(
        {
          admissionId: admission.admissionId,
          peerRunId: questId,
          worktreePath: worktree.worktreePath,
          branchName: worktree.branchName,
        },
        env,
      );
    } catch (error) {
      return errorToolResult(
        `${toolName} created a worktree but admission binding failed closed: ${error instanceof Error ? error.message : String(error)}`,
        {
          ok: false,
          tool: toolName,
          canonicalTool: "candidate_peer_spawn",
          reportBack,
          repoRoot: worktree.repoRoot,
          worktreePath: worktree.worktreePath,
          branchName: worktree.branchName,
          admissionId: admission.admissionId,
          error: "candidate_admission_binding_failed",
        },
      );
    }
    const prompt = buildCandidatePeerSpawnPrompt({
      objective,
      request,
      worktree,
      reportBack,
      questId,
    });
    const launch = await launchPiQuestSession({
      pi,
      ctx,
      options,
      defaultPiBin,
      prompt,
      titlePrompt: objective,
      titlePrefix: "Candidatepeer",
      cwd: worktree.worktreePath,
    });

    if (!launch.ok) {
      const registryRecord = createCandidatePeerRegistryRecord(
        {
          peerRunId: questId,
          tool: toolName,
          canonicalTool: "candidate_peer_spawn",
          parentCwd: worktree.parentCwd,
          repoRoot: worktree.repoRoot,
          worktreePath: worktree.worktreePath,
          branchName: worktree.branchName,
          baseRef: worktree.baseRef,
          parentDirty: worktree.parentDirty,
          parentDirtyWarning: worktree.parentDirtyWarning,
          reusedExisting: worktree.reusedExisting,
          naming: worktree.naming,
          reportBack,
          admission: admissionRegistryBinding(admission),
          parentPeerTarget: request.parentPeerTarget?.trim(),
          filesInScope: normalizeStringArray(request.filesInScope),
          offLimits: normalizeStringArray(request.offLimits),
          constraints: normalizeStringArray(request.constraints),
          dod: normalizeStringArray(request.dod),
          launch: {
            status:
              launch.effectDisposition === "effect_indeterminate"
                ? "launch_indeterminate"
                : "launch_failed",
            launchMode: launch.launchMode,
            sessionMode: launch.sessionMode,
            cwd: launch.cwd,
            sourceSessionFile: launch.sourceSessionFile,
            titleBase: launch.titleBase,
            promptSummary: launch.promptSummary,
            launchNote: launch.launchNote,
            failure: launch.failure,
            effectDisposition: launch.effectDisposition,
          },
          controllerSession: {
            id: ctx.sessionManager.getSessionId?.(),
            name: ctx.sessionManager.getSessionName?.(),
            cwd: ctx.sessionManager.getCwd?.(),
            sessionFile: ctx.sessionManager.getSessionFile?.(),
          },
          processHints: { controllerPid: options.processId ?? process.pid },
        },
        env,
      );
      let registryWriteError: string | undefined;
      try {
        writeCandidatePeerRegistryRecord(registryRecord, env);
      } catch (error) {
        registryWriteError = error instanceof Error ? error.message : String(error);
      }

      return errorToolResult(`${toolName} failed to launch Ghostty: ${launch.failure}`, {
        ok: false,
        tool: toolName,
        canonicalTool: "candidate_peer_spawn",
        launchMode: launch.launchMode,
        parentCwd: worktree.parentCwd,
        repoRoot: worktree.repoRoot,
        worktreePath: worktree.worktreePath,
        branchName: worktree.branchName,
        baseRef: worktree.baseRef,
        parentDirty: worktree.parentDirty,
        parentDirtyWarning: worktree.parentDirtyWarning,
        reusedExisting: worktree.reusedExisting,
        naming: worktree.naming,
        sessionMode: launch.sessionMode,
        sourceSessionFile: launch.sourceSessionFile,
        titleBase: launch.titleBase,
        promptSummary: launch.promptSummary,
        reportBack,
        peerRunId: questId,
        questId,
        expectedMessages: expectedPeerMessages(reportBack),
        registryPath: registryRecord.registryPath,
        archiveDir: registryRecord.archiveDir,
        cleanupPacket: registryRecord.cleanupPacket,
        registryWriteError,
        launchNote: launch.launchNote,
        error:
          launch.effectDisposition === "effect_indeterminate"
            ? "launch_indeterminate"
            : "launch_failed",
        effectDisposition: launch.effectDisposition,
      });
    }

    const registryRecord = createCandidatePeerRegistryRecord(
      {
        peerRunId: questId,
        tool: toolName,
        canonicalTool: "candidate_peer_spawn",
        parentCwd: worktree.parentCwd,
        repoRoot: worktree.repoRoot,
        worktreePath: worktree.worktreePath,
        branchName: worktree.branchName,
        baseRef: worktree.baseRef,
        parentDirty: worktree.parentDirty,
        parentDirtyWarning: worktree.parentDirtyWarning,
        reusedExisting: worktree.reusedExisting,
        naming: worktree.naming,
        reportBack,
        admission: admissionRegistryBinding(admission),
        parentPeerTarget: request.parentPeerTarget?.trim(),
        filesInScope: normalizeStringArray(request.filesInScope),
        offLimits: normalizeStringArray(request.offLimits),
        constraints: normalizeStringArray(request.constraints),
        dod: normalizeStringArray(request.dod),
        launch: {
          status: "launched",
          launchMode: launch.launchMode,
          sessionMode: launch.sessionMode,
          cwd: launch.cwd,
          sourceSessionFile: launch.sourceSessionFile,
          titleBase: launch.titleBase,
          promptSummary: launch.promptSummary,
          launchNote: launch.launchNote,
          effectDisposition: launch.effectDisposition,
        },
        controllerSession: {
          id: ctx.sessionManager.getSessionId?.(),
          name: ctx.sessionManager.getSessionName?.(),
          cwd: ctx.sessionManager.getCwd?.(),
          sessionFile: ctx.sessionManager.getSessionFile?.(),
        },
        processHints: { controllerPid: options.processId ?? process.pid },
      },
      env,
    );
    let registryWriteError: string | undefined;
    try {
      writeCandidatePeerRegistryRecord(registryRecord, env);
    } catch (error) {
      registryWriteError = error instanceof Error ? error.message : String(error);
    }

    const details = {
      ok: true,
      tool: toolName,
      canonicalTool: "candidate_peer_spawn",
      effectDisposition: launch.effectDisposition,
      launchMode: launch.launchMode,
      parentCwd: worktree.parentCwd,
      repoRoot: worktree.repoRoot,
      worktreePath: worktree.worktreePath,
      branchName: worktree.branchName,
      baseRef: worktree.baseRef,
      parentDirty: worktree.parentDirty,
      ...(worktree.parentDirtyWarning ? { parentDirtyWarning: worktree.parentDirtyWarning } : {}),
      reusedExisting: worktree.reusedExisting,
      naming: worktree.naming,
      sessionMode: launch.sessionMode,
      admission: admissionRegistryBinding(admission),
      sourceSessionFile: launch.sourceSessionFile,
      titleBase: launch.titleBase,
      promptSummary: launch.promptSummary,
      reportBack,
      peerRunId: questId,
      questId,
      expectedMessages: expectedPeerMessages(reportBack),
      registryPath: registryRecord.registryPath,
      archiveDir: registryRecord.archiveDir,
      cleanupPacket: registryRecord.cleanupPacket,
      ...(registryWriteError ? { registryWriteError } : {}),
      nextStep: reportBackNextStep({
        reportBack,
        peerRunId: questId,
        peerLabel: "candidate peer",
        manualAction:
          "Inspect the reported branch/worktree, registry metadata, cleanup packet, and visible candidate peer session manually",
      }),
      ...(launch.launchNote ? { launchNote: launch.launchNote } : {}),
    };

    return successToolResult(
      peerLaunchResultMessage({
        toolName,
        launchMode: launch.launchMode,
        promptSummary: launch.promptSummary,
        peerRunId: questId,
        reportBack,
        peerLabel: "candidate peer",
        manualAction:
          "Inspect the reported branch/worktree, registry metadata, cleanup packet, and visible candidate peer session manually",
      }),
      details,
    );
  }

  pi.registerTool({
    name: CANDIDATE_PEER_SPAWN_TOOL,
    label: "Candidate Peer Spawn",
    description:
      "One-shot owner-authorized candidate launch. Requires exactly one pre-existing lifecycle-v2 permit matching the resolved repository and exact trimmed objective before it creates an isolated git worktree or launches a visible mutation peer; this tool cannot create or broaden that authority.",
    promptSnippet:
      "Call only after the owner/controller confirms exactly one lifecycle-v2 permit is authorized for the resolved repository and this exact objective. This is not a permit probe. If admission is blocked, stop and do not repeat the same call; retry only after confirmed owner admission-state change. It does not merge, push, open PRs, mutate AK, or claim promotion. Isolated worktrees are unscoped and receive controller company provenance automatically.",
    parameters: candidatePeerSpawnParameters,
    execute: (_toolCallId, params, _signal, _onUpdate, ctx) =>
      executeCandidatePeerSpawn(CANDIDATE_PEER_SPAWN_TOOL, params, ctx),
  });
}
