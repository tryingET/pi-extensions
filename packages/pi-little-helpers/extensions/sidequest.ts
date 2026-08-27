// summary: "registers visible peer, candidate worktree, cleanup, and visible-loop launch surfaces backed by Ghostty"
// read_when:
//   - "changing peer launch prompts, worktree preparation, report-back policy, cleanup tools, or loop command registration"

import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import {
  generateSessionCompactionHandoffPrompt,
  type SessionCompactionHandoffGenerationContext,
} from "@tryinget/pi-session-compaction/handoff-generation";
import {
  ASC_EXECUTION_OBSERVATION_EVENT,
  type AscExecutionObserverController,
  createAscExecutionObserverController,
} from "../src/ascExecutionObserver.ts";
import {
  bindCandidateAdmission,
  type CandidateAdmissionReservation,
  releaseCandidateAdmission,
  reserveCandidateAdmission,
} from "../src/candidatePeerAdmission.ts";
import {
  executeCandidatePeerCloseout as executeLifecycleCandidatePeerCloseout,
  projectCandidatePeerCloseout,
} from "../src/candidatePeerCloseout.ts";
import { runCandidatePeerJanitor } from "../src/candidatePeerJanitor.ts";
import {
  createCandidatePeerRegistryRecord,
  writeCandidatePeerRegistryRecord,
} from "../src/candidatePeerRegistry.ts";
import {
  LITTLE_HELPERS_CAPABILITY_MANIFEST,
  LITTLE_HELPERS_COMMAND_NAMES,
} from "../src/capabilityManifest.ts";
import {
  type RunVisibleLoopGovernedPreflight,
  resolveParentPeerTarget,
} from "../src/visibleLoop.ts";
import {
  type CandidatePeerSpawnRequest,
  classifyCandidateAdmissionFailure,
  type SidequestReportBack,
} from "./sidequestContracts.ts";

export const SIDEQUEST_CAPABILITY_MANIFEST = LITTLE_HELPERS_CAPABILITY_MANIFEST;

const [SIDEQUEST_COMMAND, , PARALLELQUEST_COMMAND] = LITTLE_HELPERS_COMMAND_NAMES;

const DEFAULT_PI_BIN = process.env.PI_SIDEQUEST_PI_BIN || "pi";
const DEFAULT_HANDOFF_GOAL =
  "Continue the current session's unfinished operator-directed work from the verified next legal step.";
const HANDOFF_RUNTIME_READ_TIMEOUT_MS = 6000;
const HANDOFF_RUNTIME_READ_MAX_BYTES = 12 * 1024;

import { registerCandidateCloseoutTools } from "./sidequestCandidateCloseoutTools.ts";
import { registerCandidatePeerSpawnTool } from "./sidequestCandidateSpawnTool.ts";
import {
  admissionRegistryBinding,
  prepareCandidatePeerWorktree,
  releasePreparationFailure,
  resolveCandidateRepoRoot,
} from "./sidequestCandidateWorkspace.ts";
import { registerSidequestCommands } from "./sidequestCommands.ts";
import type { ExecRunner } from "./sidequestGhostty.ts";
import {
  launchAscExecutionObserverSession,
  launchPiQuestSession,
  type SidequestLaunchOptions,
} from "./sidequestLaunch.ts";
import { formatLaunchModeLabel, summarizePrompt } from "./sidequestLaunchResult.ts";
import {
  buildCandidatePeerSpawnPrompt,
  buildSidequestSpawnPrompt,
  createQuestId,
} from "./sidequestPeerPrompts.ts";
import { registerSidequestPeerTools } from "./sidequestPeerTools.ts";
import { createSidequestVisibleLoopAdapter } from "./sidequestVisibleLoopAdapter.ts";

export type { GhosttyAncestor } from "./sidequestGhostty.ts";
export {
  findGhosttyAncestor,
  findGhosttyAncestorBin,
  getGhosttySurfaceId,
  ghosttyVersionSupportsSurfaceId,
  resolveControllerGhosttyDbusTarget,
  resolveGhosttyBin,
} from "./sidequestGhostty.ts";

const ASC_EXECUTION_OBSERVER_SCRIPT = fileURLToPath(
  new URL("../scripts/asc-execution-observer.mjs", import.meta.url),
);

type PiCommandContext = Parameters<Parameters<ExtensionAPI["registerCommand"]>[1]["handler"]>[1];
type SidequestOptions = SidequestLaunchOptions & {
  registerCommands?: boolean;
  registerTools?: boolean;
  generateHandoffPrompt?: typeof generateSessionCompactionHandoffPrompt;
  governedDeepReviewPreflight?: RunVisibleLoopGovernedPreflight;
  ascExecutionObserver?: AscExecutionObserverController;
  ascObserverStateRoot?: string;
  candidateAdmission?: {
    reserve: typeof reserveCandidateAdmission;
    bind: typeof bindCandidateAdmission;
    release: typeof releaseCandidateAdmission;
  };
  candidateCloseout?: {
    project: typeof projectCandidatePeerCloseout;
    execute: typeof executeLifecycleCandidatePeerCloseout;
    janitor: typeof runCandidatePeerJanitor;
  };
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
  options: SidequestOptions;
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

export function createSidequestExtension(options: SidequestOptions = {}) {
  return function sidequestExtension(pi: ExtensionAPI) {
    const registerCommands = options.registerCommands ?? true;
    const registerTools = options.registerTools ?? true;
    const reserveAdmission = options.candidateAdmission?.reserve ?? reserveCandidateAdmission;
    const bindAdmission = options.candidateAdmission?.bind ?? bindCandidateAdmission;
    const releaseAdmission = options.candidateAdmission?.release ?? releaseCandidateAdmission;
    const projectCloseout = options.candidateCloseout?.project ?? projectCandidatePeerCloseout;
    const executeCloseout =
      options.candidateCloseout?.execute ?? executeLifecycleCandidatePeerCloseout;
    const runCloseoutJanitor = options.candidateCloseout?.janitor ?? runCandidatePeerJanitor;
    let currentObserverContext: PiCommandContext | undefined;
    let stopAscObservation: (() => void) | undefined;
    const ascExecutionObserver =
      options.ascExecutionObserver ??
      createAscExecutionObserverController({
        env: options.env ?? process.env,
        processId: options.processId ?? process.pid,
        stateRoot: options.ascObserverStateRoot,
        launch: (request) =>
          launchAscExecutionObserverSession(
            pi,
            options,
            request,
            DEFAULT_PI_BIN,
            ASC_EXECUTION_OBSERVER_SCRIPT,
          ),
        onLaunchFailure: (message) => {
          if (currentObserverContext?.mode === "tui" && currentObserverContext.hasUI) {
            currentObserverContext.ui.notify(message, "warning");
          }
        },
      });

    if (registerCommands) {
      stopAscObservation = pi.events?.on?.(ASC_EXECUTION_OBSERVATION_EVENT, (event) => {
        ascExecutionObserver.handle(event);
      });
      pi.on?.("session_start", async (_event, ctx) => {
        currentObserverContext = ctx as PiCommandContext;
        ascExecutionObserver.setHostContext({
          mode: ctx.mode,
          hasUI: ctx.hasUI,
          cwd: ctx.cwd,
          sessionId: ctx.sessionManager.getSessionId?.(),
        });
      });
      pi.on?.("session_shutdown", async () => {
        stopAscObservation?.();
        stopAscObservation = undefined;
        currentObserverContext = undefined;
        await ascExecutionObserver.dispose();
      });
    }

    const visibleLoopAdapter = createSidequestVisibleLoopAdapter({
      pi,
      options,
      defaultPiBin: DEFAULT_PI_BIN,
    });

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
        defaultPiBin: DEFAULT_PI_BIN,
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
        defaultPiBin: DEFAULT_PI_BIN,
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
        defaultPiBin: DEFAULT_PI_BIN,
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
        options.exec ??
        ((command, execArgs, execOptions) => pi.exec(command, execArgs, execOptions));
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
        defaultPiBin: DEFAULT_PI_BIN,
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

    if (registerCommands) {
      registerSidequestCommands(pi, {
        handoffTab: runHandoffTabCommand,
        sidequest: (args, ctx) => runForkPeerCommand(args, ctx, SIDEQUEST_COMMAND, "Sidequest"),
        scoutPeer: runScoutPeerCommand,
        parallelQuest: (args, ctx) =>
          runCandidatePeerCommand(args, ctx, PARALLELQUEST_COMMAND, "Parallelquest"),
        visibleLoop: visibleLoopAdapter.commandHandlers.visibleLoop,
        nexusLoop: visibleLoopAdapter.commandHandlers.nexusLoop,
        visibleLoopChild: visibleLoopAdapter.commandHandlers.visibleLoopChild,
        visibleLoopChildComplete: visibleLoopAdapter.commandHandlers.visibleLoopChildComplete,
      });
      visibleLoopAdapter.registerCommandInput();
    }

    visibleLoopAdapter.registerLifecycleEvents();

    if (!registerTools) return;

    if (registerCommands) visibleLoopAdapter.registerCompletionTool();

    registerSidequestPeerTools({ pi, options, defaultPiBin: DEFAULT_PI_BIN });

    registerCandidatePeerSpawnTool({
      pi,
      options,
      defaultPiBin: DEFAULT_PI_BIN,
      reserveAdmission,
      bindAdmission,
      releaseAdmission,
    });
    registerCandidateCloseoutTools({
      pi,
      env: options.env ?? process.env,
      projectCloseout,
      executeCloseout,
      runCloseoutJanitor,
    });
  };
}

export default createSidequestExtension();
