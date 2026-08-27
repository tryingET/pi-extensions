// summary: "registers visible peer, candidate worktree, cleanup, and visible-loop launch surfaces backed by Ghostty"
// read_when:
//   - "changing peer launch prompts, worktree preparation, report-back policy, cleanup tools, or loop command registration"

import { existsSync, readFileSync } from "node:fs";
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
  type CandidatePeerRegistryRecord,
  createCandidatePeerRegistryRecord,
  getCandidatePeerRegistryPath,
  writeCandidatePeerRegistryRecord,
} from "../src/candidatePeerRegistry.ts";
import {
  LITTLE_HELPERS_CAPABILITY_MANIFEST,
  LITTLE_HELPERS_COMMAND_NAMES,
  LITTLE_HELPERS_PEER_TOOL_NAMES,
} from "../src/capabilityManifest.ts";
import {
  type RunVisibleLoopGovernedPreflight,
  resolveParentPeerTarget,
} from "../src/visibleLoop.ts";
import {
  type CandidatePeerCleanupRequest,
  type CandidatePeerCloseoutRequest,
  type CandidatePeerSpawnRequest,
  candidatePeerCleanupParameters,
  candidatePeerCloseoutParameters,
  candidatePeerSpawnParameters,
  classifyCandidateAdmissionFailure,
  type PiToolContext,
  type SidequestReportBack,
} from "./sidequestContracts.ts";

export const SIDEQUEST_CAPABILITY_MANIFEST = LITTLE_HELPERS_CAPABILITY_MANIFEST;

const [SIDEQUEST_COMMAND, , PARALLELQUEST_COMMAND] = LITTLE_HELPERS_COMMAND_NAMES;
const [, , CANDIDATE_PEER_SPAWN_TOOL, CANDIDATE_PEER_CLEANUP_TOOL, CANDIDATE_PEER_CLOSEOUT_TOOL] =
  LITTLE_HELPERS_PEER_TOOL_NAMES;

const DEFAULT_PI_BIN = process.env.PI_SIDEQUEST_PI_BIN || "pi";
const DEFAULT_HANDOFF_GOAL =
  "Continue the current session's unfinished operator-directed work from the verified next legal step.";
const HANDOFF_RUNTIME_READ_TIMEOUT_MS = 6000;
const HANDOFF_RUNTIME_READ_MAX_BYTES = 12 * 1024;

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
        const record = JSON.parse(
          readFileSync(registryPath, "utf8"),
        ) as CandidatePeerRegistryRecord;
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
          ...(request.overdueAfterMs === undefined
            ? {}
            : { overdueAfterMs: request.overdueAfterMs }),
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

    async function executeCandidatePeerSpawn(
      toolName: string,
      params: unknown,
      ctx: PiToolContext,
    ) {
      const request = params as CandidatePeerSpawnRequest;
      const objective = request.objective?.trim() ?? "";
      const reportBack = normalizeCandidatePeerReportBack(request);
      const parentCwd = request.cwd?.trim() || ctx.cwd || process.cwd();
      const env = options.env ?? process.env;
      const pathExists = options.pathExists ?? existsSync;
      const execRunner: ExecRunner =
        options.exec ??
        ((command, execArgs, execOptions) => pi.exec(command, execArgs, execOptions));

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
        defaultPiBin: DEFAULT_PI_BIN,
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

    pi.registerTool({
      name: CANDIDATE_PEER_SPAWN_TOOL,
      label: "Candidate Peer Spawn",
      description:
        "One-shot owner-authorized candidate launch. Requires exactly one pre-existing lifecycle-v2 permit matching the resolved repository and exact trimmed objective before it creates an isolated git worktree or launches a visible mutation peer; this tool cannot create or broaden that authority.",
      promptSnippet:
        "Call only after the owner/controller confirms exactly one lifecycle-v2 permit is authorized for the resolved repository and this exact objective. This is not a permit probe. If admission is blocked, stop and do not repeat the same call; retry only after confirmed owner admission-state change. It does not merge, push, open PRs, mutate AK, or claim promotion.",
      parameters: candidatePeerSpawnParameters,
      execute: (_toolCallId, params, _signal, _onUpdate, ctx) =>
        executeCandidatePeerSpawn(CANDIDATE_PEER_SPAWN_TOOL, params, ctx),
    });

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
  };
}

export default createSidequestExtension();
