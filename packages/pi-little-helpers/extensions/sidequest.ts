// summary: "registers visible peer, candidate worktree, cleanup, and visible-loop launch surfaces backed by Ghostty"
// read_when:
//   - "changing peer launch prompts, worktree preparation, report-back policy, cleanup tools, or loop command registration"

import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
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
  bindSelfEvolutionOwnerArtifact,
  type ContinueVisibleLoopInNewSession,
  createVisibleLoopRunConfig,
  DEFAULT_NEXUS_LOOP_PROFILE,
  DEFAULT_VISIBLE_LOOP_PROFILE,
  findSelfEvolutionExecutionEnvelope,
  getVisibleLoopStatusPath,
  handleVisibleLoopAgentSettled,
  handleVisibleLoopAgentStart,
  handleVisibleLoopMessageStart,
  handleVisibleLoopToolCall,
  handleVisibleLoopToolExecutionEnd,
  handleVisibleLoopToolExecutionStart,
  handleVisibleLoopToolResult,
  listMissingVisibleLoopPromptTemplates,
  NEXUS_LOOP_COMMAND,
  parseVisibleLoopCommandArgs,
  type RunVisibleLoopGovernedPreflight,
  renderVisibleLoopChildCommand,
  resolveParentPeerTarget,
  type SelfEvolutionCandidateCloseout,
  startVisibleLoopChildCompleteRunner,
  startVisibleLoopChildRunner,
  VISIBLE_LOOP_CHILD_COMMAND,
  VISIBLE_LOOP_CHILD_COMPLETE_COMMAND,
  VISIBLE_LOOP_COMMAND,
  type VisibleLoopCommandProfile,
  validatePersistedSelfEvolutionBinding,
  writeVisibleLoopRunConfig,
} from "../src/visibleLoop.ts";
import { checkAkTaskExecutionBinding } from "../src/visibleLoopTaskBinding.ts";
import {
  type CandidatePeerCleanupRequest,
  type CandidatePeerCloseoutRequest,
  type CandidatePeerSpawnRequest,
  candidatePeerCleanupParameters,
  candidatePeerCloseoutParameters,
  candidatePeerSpawnParameters,
  classifyCandidateAdmissionFailure,
  type ForkPeerSpawnRequest,
  forkPeerSpawnParameters,
  type PiToolContext,
  type SidequestReportBack,
  type SidequestSpawnRequest,
  scoutPeerSpawnParameters,
  visibleLoopChildCompleteToolParameters,
} from "./sidequestContracts.ts";

export const SIDEQUEST_CAPABILITY_MANIFEST = LITTLE_HELPERS_CAPABILITY_MANIFEST;

const [SIDEQUEST_COMMAND, SCOUTPEER_COMMAND, PARALLELQUEST_COMMAND, HANDOFF_TAB_COMMAND] =
  LITTLE_HELPERS_COMMAND_NAMES;
const [
  FORK_PEER_SPAWN_TOOL,
  SCOUT_PEER_SPAWN_TOOL,
  CANDIDATE_PEER_SPAWN_TOOL,
  CANDIDATE_PEER_CLEANUP_TOOL,
  CANDIDATE_PEER_CLOSEOUT_TOOL,
] = LITTLE_HELPERS_PEER_TOOL_NAMES;

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
import type { ExecRunner } from "./sidequestGhostty.ts";
import {
  launchAscExecutionObserverSession,
  launchPiQuestSession,
  type SidequestLaunchOptions,
} from "./sidequestLaunch.ts";
import { formatLaunchModeLabel, summarizePrompt } from "./sidequestLaunchResult.ts";
import {
  buildCandidatePeerSpawnPrompt,
  buildForkPeerSpawnPrompt,
  buildSidequestSpawnPrompt,
  createQuestId,
  normalizeCandidatePeerReportBack,
  normalizeForkPeerReportBack,
  normalizeReportBack,
  normalizeSidequestRole,
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

    function createVisibleLoopContinuation(ctx: PiCommandContext): ContinueVisibleLoopInNewSession {
      return async ({ config, configPath, nextIteration, claimToken }) => {
        const titlePrefix = config.title ?? "Visible loop";
        const launch = await launchPiQuestSession({
          pi,
          ctx,
          options,
          defaultPiBin: DEFAULT_PI_BIN,
          prompt: renderVisibleLoopChildCommand(configPath, claimToken),
          titlePrompt: `${titlePrefix.toLowerCase()} ${nextIteration}/${config.loopCount}`,
          titlePrefix,
          cwd: config.cwd || ctx.cwd || process.cwd(),
        });
        if (!launch.ok) {
          throw new Error(launch.failure);
        }
        if (ctx.hasUI) {
          const modeLabel = formatLaunchModeLabel(launch.launchMode, launch.launchNote);
          const suffix = launch.launchNote ? ` (${launch.launchNote})` : "";
          ctx.ui.notify(
            `Opened ${titlePrefix.toLowerCase()} iteration ${nextIteration}/${config.loopCount} in ${modeLabel}${suffix}`,
            "info",
          );
        }
      };
    }

    function parseExtensionVisibleLoopCommand(text: string):
      | {
          commandName: typeof VISIBLE_LOOP_COMMAND;
          args: string;
          profile: VisibleLoopCommandProfile;
        }
      | { commandName: typeof NEXUS_LOOP_COMMAND; args: string; profile: VisibleLoopCommandProfile }
      | undefined {
      const match = text.match(/^\/(visible-loop|nexus-loop)(?:\s+([\s\S]*))?$/u);
      if (!match) return undefined;
      const commandName = match[1] as typeof VISIBLE_LOOP_COMMAND | typeof NEXUS_LOOP_COMMAND;
      const args = match[2] ?? "";
      return commandName === NEXUS_LOOP_COMMAND
        ? { commandName, args, profile: DEFAULT_NEXUS_LOOP_PROFILE }
        : { commandName, args, profile: DEFAULT_VISIBLE_LOOP_PROFILE };
    }

    async function runVisibleLoopCommand(
      args: string | undefined,
      ctx: PiCommandContext,
      profile: VisibleLoopCommandProfile = DEFAULT_VISIBLE_LOOP_PROFILE,
    ) {
      const { commandName, titlePrefix, prompts } = profile;
      const parsed = parseVisibleLoopCommandArgs(args, commandName);
      if (!parsed.ok) {
        if (ctx.hasUI) ctx.ui.notify(`${parsed.error}\n${parsed.usage}`, "warning");
        return;
      }

      const cwd = ctx.cwd || process.cwd();
      if (parsed.taskId !== undefined) {
        const execRunner: ExecRunner =
          options.exec ??
          ((command, execArgs, execOptions) => pi.exec(command, execArgs, execOptions));
        const taskBindingError = await checkAkTaskExecutionBinding(execRunner, cwd, parsed.taskId);
        if (taskBindingError) {
          if (ctx.hasUI) {
            ctx.ui.notify(
              `/${commandName} cannot launch: ${taskBindingError}. Re-run direction-to-execution or choose a current owner-authorized binding.`,
              "error",
            );
          }
          return;
        }
      }
      const resolvedSelfEvolutionEnvelope = parsed.candidateId
        ? findSelfEvolutionExecutionEnvelope(ctx.sessionManager.getBranch(), parsed.candidateId, {
            sessionId: ctx.sessionManager.getSessionId(),
          })
        : undefined;
      if (parsed.candidateId && !resolvedSelfEvolutionEnvelope) {
        if (ctx.hasUI) {
          ctx.ui.notify(
            `/${commandName} cannot launch: candidate ${parsed.candidateId} was not found as a valid self.evolution_candidate.v1 in this Pi session branch. Run self({ query: "self-evolution" }) and route the returned candidate id without editing it.`,
            "error",
          );
        }
        return;
      }
      const boundEnvelope = resolvedSelfEvolutionEnvelope
        ? bindSelfEvolutionOwnerArtifact(resolvedSelfEvolutionEnvelope, cwd)
        : undefined;
      if (boundEnvelope && !boundEnvelope.ok) {
        if (ctx.hasUI) {
          ctx.ui.notify(
            `/${commandName} cannot launch: ${boundEnvelope.error}. The promotion target must be a canonical typed owner artifact bound to this candidate.`,
            "error",
          );
        }
        return;
      }
      const selfEvolutionEnvelope = boundEnvelope?.envelope;
      const parentPeerTarget = parsed.parentPeerTarget ?? resolveParentPeerTarget(ctx);
      const candidateBinding = validatePersistedSelfEvolutionBinding(selfEvolutionEnvelope, {
        cwd,
        parentPeerTarget,
      });
      if (!candidateBinding.ok) {
        if (ctx.hasUI) {
          ctx.ui.notify(`/${commandName} cannot launch: ${candidateBinding.error}.`, "error");
        }
        return;
      }
      const reportBack =
        parsed.reportBack === "intercom" && !parentPeerTarget ? "manual" : parsed.reportBack;
      const missingPromptTemplates = listMissingVisibleLoopPromptTemplates(prompts, cwd);
      if (missingPromptTemplates.length > 0) {
        if (ctx.hasUI) {
          ctx.ui.notify(
            `/${commandName} cannot launch: missing required prompt template(s): ${missingPromptTemplates
              .map((name) => `/${name}`)
              .join(", ")}. Add them under ${join(cwd, ".pi", "prompts")} or ${join(
              homedir(),
              ".pi",
              "agent",
              "prompts",
            )}. Extension-originated visible loops can expand project/global prompt templates only; Pi package/settings/CLI prompt templates are not exposed to extensions.`,
            "error",
          );
        }
        return;
      }
      const shouldDelegateCommit =
        profile.delegateCommitByDefault === true || parsed.delegateCommit === true;
      const executionBinding =
        parsed.taskId !== undefined
          ? ({ mode: "ak_task", taskId: parsed.taskId } as const)
          : parsed.objective
            ? ({ mode: "operator_objective", objective: parsed.objective } as const)
            : parsed.candidateId
              ? ({
                  mode: "self_evolution_candidate",
                  candidateId: parsed.candidateId,
                } as const)
              : undefined;
      if (!executionBinding) {
        if (ctx.hasUI) {
          ctx.ui.notify(
            `/${commandName} cannot launch without an explicit execution binding. Run direction-to-execution or choose an owner-authorized task, then use --objective, --task, or --candidate.`,
            "error",
          );
        }
        return;
      }
      const config = createVisibleLoopRunConfig({
        loopCount: parsed.loopCount,
        cwd,
        reportBack,
        parentPeerTarget,
        commandName,
        prompts,
        executionBinding,
        ...(shouldDelegateCommit
          ? { commitDelegation: { mode: "dispatch_subagent", promptTemplate: "commit" } as const }
          : {}),
        ...(selfEvolutionEnvelope ? { selfEvolutionEnvelope } : {}),
        runIdPrefix: commandName,
        title: titlePrefix,
      });
      let configPath: string;
      try {
        configPath = writeVisibleLoopRunConfig(config, options.env ?? process.env);
      } catch (error) {
        if (ctx.hasUI) {
          const reason = error instanceof Error ? error.message : String(error);
          ctx.ui.notify(
            `/${commandName} cannot persist its private run config: ${reason}`,
            "error",
          );
        }
        return;
      }
      const childPrompt = renderVisibleLoopChildCommand(configPath);
      const launch = await launchPiQuestSession({
        pi,
        ctx,
        options,
        defaultPiBin: DEFAULT_PI_BIN,
        prompt: childPrompt,
        titlePrompt: `${titlePrefix.toLowerCase()} x${parsed.loopCount}`,
        titlePrefix,
        cwd,
      });

      if (!launch.ok) {
        if (ctx.hasUI) {
          ctx.ui.notify(`/${commandName} failed to launch Ghostty: ${launch.failure}`, "error");
        }
        return;
      }

      if (ctx.hasUI) {
        const modeLabel = formatLaunchModeLabel(launch.launchMode, launch.launchNote);
        const suffix = launch.launchNote ? ` (${launch.launchNote})` : "";
        const reportBackNote =
          reportBack === "intercom"
            ? `; watch with intercom({ action: "peer_watch", peerRunId: "${config.runId}", waitFor: "final" })`
            : "; intercom disabled/manual because no exact parent peer target was available";
        const statusPath = getVisibleLoopStatusPath(config, options.env ?? process.env);
        ctx.ui.notify(
          `Opened ${commandName} in ${modeLabel}: ${parsed.loopCount} iteration(s)${reportBackNote}; status ${statusPath}${suffix}`,
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

    async function executeForkPeerSpawn(toolName: string, params: unknown, ctx: PiToolContext) {
      const request = params as ForkPeerSpawnRequest;
      const objective = request.objective?.trim() ?? "";
      const reportBack = normalizeForkPeerReportBack(request);
      const cwd = request.cwd?.trim() || ctx.cwd || process.cwd();

      if (!objective) {
        return errorToolResult(`${toolName} requires a non-empty objective.`, {
          ok: false,
          tool: toolName,
          canonicalTool: "fork_peer_spawn",
          sessionMode: "fork",
          reportBack,
          error: "blank_objective",
        });
      }

      if (reportBack === "intercom") {
        const parentPeerTarget = validateParentPeerTarget(request.parentPeerTarget);
        if (!parentPeerTarget.ok) return parentPeerTargetFailureResult(toolName, parentPeerTarget);
      }

      const sessionFile = ctx.sessionManager.getSessionFile();
      if (!sessionFile) {
        return errorToolResult(
          `${toolName} needs a saved Pi session because fork peers inherit the current conversation context.`,
          {
            ok: false,
            tool: toolName,
            canonicalTool: "fork_peer_spawn",
            sessionMode: "fork",
            reportBack,
            cwd,
            error: "missing_session_file",
          },
        );
      }

      const questId = createQuestId("forkpeer");
      const prompt =
        reportBack === "manual" && !request.reportBack && !request.parentPeerTarget?.trim()
          ? objective
          : buildForkPeerSpawnPrompt({
              objective,
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
        titlePrefix: "Forkpeer",
        cwd,
        sourceSessionFile: sessionFile,
      });

      if (!launch.ok) {
        return errorToolResult(`${toolName} failed to launch Ghostty: ${launch.failure}`, {
          ok: false,
          tool: toolName,
          canonicalTool: "fork_peer_spawn",
          launchMode: launch.launchMode,
          sessionMode: launch.sessionMode,
          cwd: launch.cwd,
          sourceSessionFile: launch.sourceSessionFile,
          titleBase: launch.titleBase,
          promptSummary: launch.promptSummary,
          launchNote: launch.launchNote,
          reportBack,
          effectDisposition: launch.effectDisposition,
          parentPeerTarget: request.parentPeerTarget?.trim(),
          peerRunId: questId,
          expectedMessages: expectedPeerMessages(reportBack),
          error:
            launch.effectDisposition === "effect_indeterminate"
              ? "launch_indeterminate"
              : "launch_failed",
        });
      }

      return successToolResult(
        peerLaunchResultMessage({
          toolName,
          launchMode: launch.launchMode,
          promptSummary: launch.promptSummary,
          peerRunId: questId,
          reportBack,
          peerLabel: "fork peer",
          manualAction: "watch the visible fork peer tab/window",
        }),
        {
          ok: true,
          tool: toolName,
          canonicalTool: "fork_peer_spawn",
          effectDisposition: launch.effectDisposition,
          launchMode: launch.launchMode,
          sessionMode: launch.sessionMode,
          cwd: launch.cwd,
          sourceSessionFile: launch.sourceSessionFile,
          titleBase: launch.titleBase,
          promptSummary: launch.promptSummary,
          reportBack,
          parentPeerTarget: request.parentPeerTarget?.trim(),
          peerRunId: questId,
          expectedMessages: expectedPeerMessages(reportBack),
          nextStep: reportBackNextStep({
            reportBack,
            peerRunId: questId,
            peerLabel: "fork peer",
            manualAction: "watch the visible fork peer tab/window",
          }),
          ...(launch.launchNote ? { launchNote: launch.launchNote } : {}),
        },
      );
    }

    async function executeScoutPeerSpawn(toolName: string, params: unknown, ctx: PiToolContext) {
      const request = params as SidequestSpawnRequest;
      const objective = request.objective?.trim() ?? "";
      const role = normalizeSidequestRole(request.role);
      const reportBack = normalizeReportBack(request);
      const cwd = request.cwd?.trim() || ctx.cwd || process.cwd();

      if (!objective) {
        return errorToolResult(`${toolName} requires a non-empty objective.`, {
          ok: false,
          tool: toolName,
          canonicalTool: "scout_peer_spawn",
          role,
          reportBack,
          enforcement: "prompt_contract",
          error: "blank_objective",
        });
      }

      if (reportBack === "intercom") {
        const parentPeerTarget = validateParentPeerTarget(request.parentPeerTarget);
        if (!parentPeerTarget.ok) return parentPeerTargetFailureResult(toolName, parentPeerTarget);
      }

      const questId = createQuestId("scoutpeer");
      const prompt = buildSidequestSpawnPrompt({
        role,
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
        return errorToolResult(`${toolName} failed to launch Ghostty: ${launch.failure}`, {
          ok: false,
          tool: toolName,
          canonicalTool: "scout_peer_spawn",
          launchMode: launch.launchMode,
          sessionMode: launch.sessionMode,
          cwd: launch.cwd,
          sourceSessionFile: launch.sourceSessionFile,
          titleBase: launch.titleBase,
          role,
          enforcement: "prompt_contract",
          promptSummary: launch.promptSummary,
          reportBack,
          peerRunId: questId,
          questId,
          expectedMessages: expectedPeerMessages(reportBack),
          launchNote: launch.launchNote,
          error:
            launch.effectDisposition === "effect_indeterminate"
              ? "launch_indeterminate"
              : "launch_failed",
          effectDisposition: launch.effectDisposition,
        });
      }

      const details = {
        ok: true,
        tool: toolName,
        canonicalTool: "scout_peer_spawn",
        effectDisposition: launch.effectDisposition,
        launchMode: launch.launchMode,
        sessionMode: launch.sessionMode,
        cwd: launch.cwd,
        sourceSessionFile: launch.sourceSessionFile,
        titleBase: launch.titleBase,
        role,
        enforcement: "prompt_contract",
        promptSummary: launch.promptSummary,
        reportBack,
        peerRunId: questId,
        questId,
        expectedMessages: expectedPeerMessages(reportBack),
        nextStep: reportBackNextStep({
          reportBack,
          peerRunId: questId,
          peerLabel: "scout peer",
          manualAction: "Watch the visible scout peer tab/window manually",
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
          peerLabel: "scout peer",
          manualAction: "Watch the visible scout peer tab/window manually",
        }),
        details,
      );
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
      pi.registerCommand(HANDOFF_TAB_COMMAND, {
        description:
          "Generate a self-contained handoff and auto-submit it in a clean Ghostty Pi tab",
        handler: runHandoffTabCommand,
      });

      pi.registerCommand(SIDEQUEST_COMMAND, {
        description: "Fork the current Pi session into a visible Ghostty peer",
        handler: (args, ctx) => runForkPeerCommand(args, ctx, SIDEQUEST_COMMAND, "Sidequest"),
      });

      pi.registerCommand(SCOUTPEER_COMMAND, {
        description: "Launch a clean visible read-only scout/review peer in the current workspace",
        handler: runScoutPeerCommand,
      });

      pi.registerCommand(PARALLELQUEST_COMMAND, {
        description:
          "Launch a one-shot candidate peer only after owner authorization for the exact repository and objective; blocked admission must not be retried unchanged",
        handler: (args, ctx) =>
          runCandidatePeerCommand(args, ctx, PARALLELQUEST_COMMAND, "Parallelquest"),
      });

      pi.registerCommand(VISIBLE_LOOP_COMMAND, {
        description:
          "Launch a visible Ghostty Pi tab that runs the default prompt sequence for N iterations",
        handler: runVisibleLoopCommand,
      });

      pi.registerCommand(NEXUS_LOOP_COMMAND, {
        description:
          "Launch a visible Ghostty Pi tab that loops deep-review, nexus implementation, atomic-completion, and commit",
        handler: (args, ctx) => runVisibleLoopCommand(args, ctx, DEFAULT_NEXUS_LOOP_PROFILE),
      });

      pi.registerCommand(VISIBLE_LOOP_CHILD_COMMAND, {
        description: "Internal helper for visible-loop launched child sessions",
        handler: (args, ctx) =>
          startVisibleLoopChildRunner(args, pi, ctx, options.env ?? process.env, {
            continueInNewSession: createVisibleLoopContinuation(ctx),
            governedDeepReviewPreflight: options.governedDeepReviewPreflight,
          }),
      });

      pi.registerCommand(VISIBLE_LOOP_CHILD_COMPLETE_COMMAND, {
        description: "Internal helper that advances a visible-loop child iteration",
        handler: async (args, ctx) => {
          await startVisibleLoopChildCompleteRunner(args, pi, ctx, options.env ?? process.env, {
            continueInNewSession: createVisibleLoopContinuation(ctx),
          });
        },
      });

      pi.on?.("input", async (event, ctx) => {
        if (event.source !== "extension") return { action: "continue" };
        const command = parseExtensionVisibleLoopCommand(event.text);
        if (!command) return { action: "continue" };
        await runVisibleLoopCommand(command.args, ctx as PiCommandContext, command.profile);
        return { action: "handled" };
      });
    }

    pi.on?.("agent_start", async (_event, ctx) => {
      const commandCtx = ctx ?? {};
      handleVisibleLoopAgentStart(pi, commandCtx, options.env ?? process.env, {
        continueInNewSession: createVisibleLoopContinuation(commandCtx as PiCommandContext),
        governedDeepReviewPreflight: options.governedDeepReviewPreflight,
      });
    });

    pi.on?.("message_start", async (event, ctx) => {
      const commandCtx = ctx ?? {};
      handleVisibleLoopMessageStart(event, pi, commandCtx, options.env ?? process.env, {
        continueInNewSession: createVisibleLoopContinuation(commandCtx as PiCommandContext),
        governedDeepReviewPreflight: options.governedDeepReviewPreflight,
      });
    });

    pi.on?.("tool_execution_start", async (event, ctx) => {
      const commandCtx = ctx ?? {};
      handleVisibleLoopToolExecutionStart(event, pi, commandCtx, options.env ?? process.env, {
        continueInNewSession: createVisibleLoopContinuation(commandCtx as PiCommandContext),
        governedDeepReviewPreflight: options.governedDeepReviewPreflight,
      });
    });

    pi.on?.("tool_call", async (event, ctx) => {
      const commandCtx = ctx ?? {};
      return handleVisibleLoopToolCall(event, pi, commandCtx, options.env ?? process.env, {
        continueInNewSession: createVisibleLoopContinuation(commandCtx as PiCommandContext),
        governedDeepReviewPreflight: options.governedDeepReviewPreflight,
      });
    });

    pi.on?.("tool_result", async (event, ctx) => {
      const commandCtx = ctx ?? {};
      handleVisibleLoopToolResult(event, pi, commandCtx, options.env ?? process.env, {
        continueInNewSession: createVisibleLoopContinuation(commandCtx as PiCommandContext),
        governedDeepReviewPreflight: options.governedDeepReviewPreflight,
      });
    });

    pi.on?.("tool_execution_end", async (event, ctx) => {
      const commandCtx = ctx ?? {};
      handleVisibleLoopToolExecutionEnd(event, pi, commandCtx, options.env ?? process.env, {
        continueInNewSession: createVisibleLoopContinuation(commandCtx as PiCommandContext),
        governedDeepReviewPreflight: options.governedDeepReviewPreflight,
      });
    });

    pi.on?.("agent_settled", async (_event, ctx) => {
      const commandCtx = ctx ?? {};
      handleVisibleLoopAgentSettled(pi, commandCtx, options.env ?? process.env, {
        continueInNewSession: createVisibleLoopContinuation(commandCtx as PiCommandContext),
        governedDeepReviewPreflight: options.governedDeepReviewPreflight,
      });
    });

    if (!registerTools) return;

    if (registerCommands) {
      pi.registerTool({
        name: "visible_loop_child_complete",
        label: "Visible Loop Child Complete",
        description:
          "Internal checkpoint tool for visible-loop child sessions to mark an iteration complete after the queued prompt sequence and completion gate have succeeded; do not call from ordinary work.",
        promptSnippet:
          "Internal visible-loop completion fallback tool. Use only when explicitly asked to mark visible-loop completion with configPath and iteration.",
        parameters: visibleLoopChildCompleteToolParameters,
        execute: async (_toolCallId, params, _signal, _onUpdate, ctx) => {
          const request = params as {
            configPath?: string;
            iteration?: number;
            candidateCloseout?: SelfEvolutionCandidateCloseout;
          };
          const configPath = typeof request.configPath === "string" ? request.configPath : "";
          const iteration = Number(request.iteration);
          const outcome = await startVisibleLoopChildCompleteRunner(
            `${configPath} --iteration ${iteration}`,
            pi,
            ctx,
            options.env ?? process.env,
            {
              continueInNewSession: createVisibleLoopContinuation(ctx as PiCommandContext),
              candidateCloseout: request.candidateCloseout,
            },
          );
          return successToolResult(
            outcome.accepted
              ? "visible-loop completion accepted"
              : `visible-loop completion rejected: ${outcome.reason}`,
            {
              ...outcome,
              configPath,
              iteration,
              note: "typed outcome mirrors the completion gate; status sidecar/intercom remain diagnostic",
            },
          );
        },
      });
    }

    pi.registerTool({
      name: FORK_PEER_SPAWN_TOOL,
      label: "Fork Peer Spawn",
      description: "Launch a visible forked-context peer Pi session.",
      promptSnippet:
        "Use to launch a visible peer that inherits the current Pi conversation context. This is the tool equivalent of /sidequest for controller-spawned use.",
      parameters: forkPeerSpawnParameters,
      execute: (_toolCallId, params, _signal, _onUpdate, ctx) =>
        executeForkPeerSpawn(FORK_PEER_SPAWN_TOOL, params, ctx),
    });

    pi.registerTool({
      name: SCOUT_PEER_SPAWN_TOOL,
      label: "Scout Peer Spawn",
      description: "Launch a clean visible read-only scout/review peer Pi session.",
      promptSnippet:
        "Use to launch a clean visible scout/review peer in the same workspace. It does not inherit the controller conversation and returns launch facts only.",
      parameters: scoutPeerSpawnParameters,
      execute: (_toolCallId, params, _signal, _onUpdate, ctx) =>
        executeScoutPeerSpawn(SCOUT_PEER_SPAWN_TOOL, params, ctx),
    });

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
