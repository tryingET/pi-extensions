// summary: builds the exact handoff, sidequest, scoutpeer, and parallelquest command handlers over extracted launch owners.
// read_when:
//   - changing command prompts, notifications, handoff context, candidate command admission, or registry projection.

import { existsSync } from "node:fs";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import {
  generateSessionCompactionHandoffPrompt,
  type SessionCompactionHandoffGenerationContext,
} from "@tryinget/pi-session-compaction/handoff-generation";
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
import type { ExecRunner } from "./sidequestGhostty.ts";
import { launchPiQuestSession, type SidequestLaunchOptions } from "./sidequestLaunch.ts";
import { formatLaunchModeLabel, summarizePrompt } from "./sidequestLaunchResult.ts";
import {
  buildCandidatePeerSpawnPrompt,
  buildSidequestSpawnPrompt,
  createQuestId,
} from "./sidequestPeerPrompts.ts";

const DEFAULT_HANDOFF_GOAL =
  "Continue the current session's unfinished operator-directed work from the verified next legal step.";
const HANDOFF_RUNTIME_READ_TIMEOUT_MS = 6000;
const HANDOFF_RUNTIME_READ_MAX_BYTES = 12 * 1024;

type PiCommandContext = Parameters<Parameters<ExtensionAPI["registerCommand"]>[1]["handler"]>[1];
export type SidequestCommandHandlerOptions = SidequestLaunchOptions & {
  generateHandoffPrompt?: typeof generateSessionCompactionHandoffPrompt;
};

function getPrompt(args?: string): string | undefined {
  const prompt = args?.trim();
  return prompt ? prompt : undefined;
}

function boundHandoffRuntimeReadback(value: string): string {
  const bytes = Buffer.from(value, "utf8");
  if (bytes.length <= HANDOFF_RUNTIME_READ_MAX_BYTES) return value;
  return `${bytes.subarray(0, HANDOFF_RUNTIME_READ_MAX_BYTES).toString("utf8")}\n[truncated]`;
}

async function collectHandoffRuntimeContext({
  pi,
  options,
  cwd,
}: {
  pi: ExtensionAPI;
  options: SidequestCommandHandlerOptions;
  cwd: string;
}): Promise<string> {
  const execRunner: ExecRunner =
    options.exec ?? ((command, args, execOptions) => pi.exec(command, args, execOptions));
  const specs = [
    { label: "Git HEAD", command: "git", args: ["rev-parse", "HEAD"] },
    { label: "Git status", command: "git", args: ["status", "--short", "--branch"] },
    {
      label: "AK claimed tasks",
      command: "ak",
      args: ["task", "list", "--status", "claimed", "-F", "json"],
    },
    { label: "AK ready tasks", command: "ak", args: ["task", "ready", "-F", "json"] },
  ] as const;
  const results = await Promise.all(
    specs.map(async (spec) => {
      try {
        const result = await execRunner(spec.command, [...spec.args], {
          cwd,
          timeout: HANDOFF_RUNTIME_READ_TIMEOUT_MS,
        });
        if (result.code === 0 && !result.killed) {
          const output = String(result.stdout || "").trim() || "<empty>";
          return `${spec.label} (${spec.command} ${spec.args.join(" ")}):\n${boundHandoffRuntimeReadback(output)}`;
        }
        const detail = String(result.stderr || result.stdout || "no output")
          .replace(/\s+/g, " ")
          .trim();
        return `${spec.label}: unavailable (${result.killed ? "timed out" : `exit ${result.code}`}: ${detail.slice(0, 500)})`;
      } catch (error) {
        const detail = error instanceof Error ? error.message : String(error);
        return `${spec.label}: unavailable (${detail.slice(0, 500)})`;
      }
    }),
  );
  return results.join("\n\n");
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

  async function runHandoffTabCommand(args: string | undefined, ctx: PiCommandContext) {
    const goal = getPrompt(args) ?? DEFAULT_HANDOFF_GOAL;
    const cwd = ctx.cwd || process.cwd();
    const runtimeContext = await collectHandoffRuntimeContext({ pi, options, cwd });
    const generator = options.generateHandoffPrompt ?? generateSessionCompactionHandoffPrompt;
    let prompt: string;
    try {
      prompt = await generator({
        ctx: ctx as unknown as SessionCompactionHandoffGenerationContext,
        goal,
        runtimeContext,
      });
    } catch (error) {
      if (ctx.hasUI) {
        const detail = error instanceof Error ? error.message : String(error);
        ctx.ui.notify(`handoff-tab could not generate a handoff: ${detail}`, "error");
      }
      return;
    }

    const launch = await launchPiQuestSession({
      pi,
      ctx,
      options,
      defaultPiBin,
      prompt,
      titlePrompt: goal,
      titlePrefix: "Handoff",
      cwd,
    });
    if (!launch.ok) {
      if (ctx.hasUI) {
        ctx.ui.notify(`handoff-tab failed to launch Ghostty: ${launch.failure}`, "error");
      }
      return;
    }

    if (ctx.hasUI) {
      const modeLabel = formatLaunchModeLabel(launch.launchMode, launch.launchNote);
      const suffix = launch.launchNote ? ` (${launch.launchNote})` : "";
      ctx.ui.notify(
        `Opened a clean Pi session in ${modeLabel} and auto-submitted one generated handoff${suffix}`,
        "info",
      );
    }
  }

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
    handoffTab: runHandoffTabCommand,
    sidequest: (args: string | undefined, ctx: PiCommandContext) =>
      runForkPeerCommand(args, ctx, SIDEQUEST_COMMAND, "Sidequest"),
    scoutPeer: runScoutPeerCommand,
    parallelQuest: (args: string | undefined, ctx: PiCommandContext) =>
      runCandidatePeerCommand(args, ctx, PARALLELQUEST_COMMAND, "Parallelquest"),
  };
}
