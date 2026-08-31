// summary: builds the exact handoff, sidequest, scoutpeer, and parallelquest command handlers over extracted launch owners.
// read_when:
//   - changing command prompts, notifications, handoff context, candidate command admission, or registry projection.

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
import { LITTLE_HELPERS_COMMAND_NAMES } from "../src/capabilityManifest.ts";
import { resolveParentPeerTarget } from "../src/visibleLoop.ts";
import {
  admissionRegistryBinding,
  prepareCandidatePeerWorktree,
  releasePreparationFailure,
  resolveCandidateRepoRoot,
} from "./sidequestCandidateWorkspace.ts";
import {
  type CandidatePeerSpawnRequest,
  classifyCandidateAdmissionFailure,
  type SidequestReportBack,
  type SidequestSpawnRequest,
} from "./sidequestContracts.ts";
import {
  createFreshHandoffExecutor,
  type SidequestCommandHandlerOptions,
} from "./sidequestFreshHandoff.ts";
import type { ExecRunner } from "./sidequestGhostty.ts";
import { launchPiQuestSession } from "./sidequestLaunch.ts";
import { formatLaunchModeLabel, summarizePrompt } from "./sidequestLaunchResult.ts";
import {
  buildCandidatePeerSpawnPrompt,
  buildSidequestSpawnPrompt,
  createQuestId,
} from "./sidequestPeerPrompts.ts";

export type {
  FreshHandoffExecutor,
  FreshHandoffOutcome,
  SidequestCommandHandlerOptions,
} from "./sidequestFreshHandoff.ts";

type PiCommandContext = Parameters<Parameters<ExtensionAPI["registerCommand"]>[1]["handler"]>[1];

function getPrompt(args?: string): string | undefined {
  const prompt = args?.trim();
  return prompt ? prompt : undefined;
}

export function createSidequestCommandHandlers({
  pi,
  options,
  defaultPiBin,
  reserveAdmission,
  bindAdmission,
  releaseAdmission,
}: {
  pi: ExtensionAPI;
  options: SidequestCommandHandlerOptions;
  defaultPiBin: string;
  reserveAdmission: typeof reserveCandidateAdmission;
  bindAdmission: typeof bindCandidateAdmission;
  releaseAdmission: typeof releaseCandidateAdmission;
}) {
  const [SIDEQUEST_COMMAND, , PARALLELQUEST_COMMAND] = LITTLE_HELPERS_COMMAND_NAMES;

  async function runForkPeerCommand(
    args: string | undefined,
    ctx: PiCommandContext,
    commandName: string,
    titlePrefix: string,
  ) {
    const prompt = getPrompt(args);
    if (!prompt) {
      if (ctx.hasUI) {
        ctx.ui.notify(`Usage: /${commandName} "what you want to explore"`, "warning");
      }
      return;
    }

    const sessionFile = ctx.sessionManager.getSessionFile();
    if (!sessionFile) {
      if (ctx.hasUI) {
        ctx.ui.notify(
          `${commandName} needs a saved Pi session. Current session looks ephemeral/no-session.`,
          "error",
        );
      }
      return;
    }

    const launch = await launchPiQuestSession({
      pi,
      ctx,
      options,
      defaultPiBin,
      prompt,
      titlePrompt: prompt,
      titlePrefix,
      cwd: ctx.cwd,
      sourceSessionFile: sessionFile,
    });

    if (!launch.ok) {
      if (ctx.hasUI) {
        ctx.ui.notify(`${commandName} failed to launch Ghostty: ${launch.failure}`, "error");
      }
      return;
    }

    if (ctx.hasUI) {
      const modeLabel = formatLaunchModeLabel(launch.launchMode, launch.launchNote);
      const suffix = launch.launchNote ? ` (${launch.launchNote})` : "";
      ctx.ui.notify(
        `Opened ${commandName} in ${modeLabel}: ${summarizePrompt(prompt)}${suffix}`,
        "info",
      );
    }
  }

  const runFreshHandoff = createFreshHandoffExecutor({ pi, options, defaultPiBin });

  async function runScoutPeerCommand(args: string | undefined, ctx: PiCommandContext) {
    const objective = getPrompt(args);
    if (!objective) {
      if (ctx.hasUI) ctx.ui.notify('Usage: /scoutpeer "what you want inspected"', "warning");
      return;
    }

    const parentPeerTarget = resolveParentPeerTarget(ctx);
    const reportBack: SidequestReportBack = parentPeerTarget ? "intercom" : "manual";
    const request: SidequestSpawnRequest = {
      objective,
      role: "scout",
      reportBack,
      ...(parentPeerTarget ? { parentPeerTarget } : {}),
    };
    const questId = createQuestId("scoutpeer");
    const cwd = ctx.cwd || process.cwd();
    const prompt = buildSidequestSpawnPrompt({
      role: "scout",
      objective,
      cwd,
      request,
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
      titlePrefix: "Scoutpeer",
      cwd,
    });

    if (!launch.ok) {
      if (ctx.hasUI)
        ctx.ui.notify(`scoutpeer failed to launch Ghostty: ${launch.failure}`, "error");
      return;
    }

    if (ctx.hasUI) {
      const modeLabel = formatLaunchModeLabel(launch.launchMode, launch.launchNote);
      const suffix = launch.launchNote ? ` (${launch.launchNote})` : "";
      const reportBackNote =
        reportBack === "intercom"
          ? `; watch with intercom({ action: "peer_watch", peerRunId: "${questId}", waitFor: "final" })`
          : "; intercom disabled/manual because no exact parent peer target was available";
      ctx.ui.notify(
        `Opened scoutpeer in ${modeLabel}: ${summarizePrompt(objective)}${reportBackNote}${suffix}`,
        "info",
      );
    }
  }

  async function runCandidatePeerCommand(
    args: string | undefined,
    ctx: PiCommandContext,
    commandName = "candidatepeer",
    titlePrefix = "Candidatepeer",
  ) {
    const objective = getPrompt(args);
    if (!objective) {
      if (ctx.hasUI)
        ctx.ui.notify(`Usage: /${commandName} "what candidate change to try"`, "warning");
      return;
    }

    const parentCwd = ctx.cwd || process.cwd();
    const request: CandidatePeerSpawnRequest = { objective, reportBack: "manual" };
    const env = options.env ?? process.env;
    const pathExists = options.pathExists ?? existsSync;
    const execRunner: ExecRunner =
      options.exec ?? ((command, execArgs, execOptions) => pi.exec(command, execArgs, execOptions));
    const repository = await resolveCandidateRepoRoot(execRunner, parentCwd);
    if (!repository.ok) {
      if (ctx.hasUI) ctx.ui.notify(`${commandName} failed: ${repository.error}`, "error");
      return;
    }
    let admission: CandidateAdmissionReservation;
    try {
      admission = reserveAdmission({ repoRoot: repository.repoRoot, objective }, env);
    } catch (error) {
      const failure = classifyCandidateAdmissionFailure(error);
      if (ctx.hasUI) {
        ctx.ui.notify(`${commandName} admission blocked: ${failure.message}`, "error");
      }
      return;
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
      const releaseError = releasePreparationFailure(
        admission,
        worktree.error,
        env,
        releaseAdmission,
      );
      if (ctx.hasUI) {
        ctx.ui.notify(
          `${commandName} failed: ${worktree.error}${releaseError ? `; admission release failed: ${releaseError}` : ""}`,
          "error",
        );
      }
      return;
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
      if (ctx.hasUI) {
        ctx.ui.notify(
          `${commandName} created a worktree but admission binding failed closed: ${error instanceof Error ? error.message : String(error)}`,
          "error",
        );
      }
      return;
    }
    const prompt = buildCandidatePeerSpawnPrompt({
      objective,
      request,
      worktree,
      reportBack: "manual",
      questId,
    });
    const launch = await launchPiQuestSession({
      pi,
      ctx,
      options,
      defaultPiBin,
      prompt,
      titlePrompt: objective,
      titlePrefix,
      cwd: worktree.worktreePath,
    });

    if (!launch.ok) {
      const registryRecord = createCandidatePeerRegistryRecord(
        {
          peerRunId: questId,
          tool: commandName,
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
          reportBack: "manual",
          admission: admissionRegistryBinding(admission),
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
      try {
        writeCandidatePeerRegistryRecord(registryRecord, env);
      } catch {
        // Best-effort diagnostic persistence only; the UI reports the launch failure below.
      }
      if (ctx.hasUI)
        ctx.ui.notify(`${commandName} failed to launch Ghostty: ${launch.failure}`, "error");
      return;
    }

    const registryRecord = createCandidatePeerRegistryRecord(
      {
        peerRunId: questId,
        tool: commandName,
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
        reportBack: "manual",
        admission: admissionRegistryBinding(admission),
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
    let registryPath: string | undefined;
    try {
      registryPath = writeCandidatePeerRegistryRecord(registryRecord, env);
    } catch {
      // Best-effort diagnostic persistence only; the visible candidate is already launched.
    }

    if (ctx.hasUI) {
      const modeLabel = formatLaunchModeLabel(launch.launchMode, launch.launchNote);
      const suffix = launch.launchNote ? ` (${launch.launchNote})` : "";
      const registryNote = registryPath ? `; registry ${registryPath}` : "";
      ctx.ui.notify(
        `Opened ${commandName} in ${modeLabel}: ${summarizePrompt(objective)}${registryNote}${suffix}`,
        "info",
      );
    }
  }

  return {
    freshHandoff: runFreshHandoff,
    sidequest: (args: string | undefined, ctx: PiCommandContext) =>
      runForkPeerCommand(args, ctx, SIDEQUEST_COMMAND, "Sidequest"),
    scoutPeer: runScoutPeerCommand,
    parallelQuest: (args: string | undefined, ctx: PiCommandContext) =>
      runCandidatePeerCommand(args, ctx, PARALLELQUEST_COMMAND, "Parallelquest"),
  };
}
