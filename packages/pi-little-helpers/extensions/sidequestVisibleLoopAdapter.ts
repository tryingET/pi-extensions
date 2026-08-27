// summary: adapts the visible-loop runtime into sidequest commands, lifecycle hooks, continuation launch, and completion tool registration.
// read_when:
//   - changing visible-loop command bridging, lifecycle semantics, continuation, or completion-tool behavior.

import { homedir } from "node:os";
import { join } from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
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
  type VISIBLE_LOOP_COMMAND,
  type VisibleLoopCommandProfile,
  validatePersistedSelfEvolutionBinding,
  writeVisibleLoopRunConfig,
} from "../src/visibleLoop.ts";
import { checkAkTaskExecutionBinding } from "../src/visibleLoopTaskBinding.ts";
import { visibleLoopChildCompleteToolParameters } from "./sidequestContracts.ts";
import type { ExecRunner } from "./sidequestGhostty.ts";
import { launchPiQuestSession, type SidequestLaunchOptions } from "./sidequestLaunch.ts";
import { formatLaunchModeLabel } from "./sidequestLaunchResult.ts";
import { successToolResult } from "./sidequestPeerReportBack.ts";

type PiCommandContext = Parameters<Parameters<ExtensionAPI["registerCommand"]>[1]["handler"]>[1];
export type SidequestVisibleLoopOptions = SidequestLaunchOptions & {
  governedDeepReviewPreflight?: RunVisibleLoopGovernedPreflight;
};

export function createSidequestVisibleLoopAdapter({
  pi,
  options,
  defaultPiBin,
}: {
  pi: ExtensionAPI;
  options: SidequestVisibleLoopOptions;
  defaultPiBin: string;
}) {
  function createVisibleLoopContinuation(ctx: PiCommandContext): ContinueVisibleLoopInNewSession {
    return async ({ config, configPath, nextIteration, claimToken }) => {
      const titlePrefix = config.title ?? "Visible loop";
      const launch = await launchPiQuestSession({
        pi,
        ctx,
        options,
        defaultPiBin,
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
        ctx.ui.notify(`/${commandName} cannot persist its private run config: ${reason}`, "error");
      }
      return;
    }
    const childPrompt = renderVisibleLoopChildCommand(configPath);
    const launch = await launchPiQuestSession({
      pi,
      ctx,
      options,
      defaultPiBin,
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

  const commandHandlers = {
    visibleLoop: runVisibleLoopCommand,
    nexusLoop: (args: string | undefined, ctx: PiCommandContext) =>
      runVisibleLoopCommand(args, ctx, DEFAULT_NEXUS_LOOP_PROFILE),
    visibleLoopChild: (args: string | undefined, ctx: PiCommandContext) =>
      startVisibleLoopChildRunner(args, pi, ctx, options.env ?? process.env, {
        continueInNewSession: createVisibleLoopContinuation(ctx),
        governedDeepReviewPreflight: options.governedDeepReviewPreflight,
      }),
    visibleLoopChildComplete: async (args: string | undefined, ctx: PiCommandContext) => {
      await startVisibleLoopChildCompleteRunner(args, pi, ctx, options.env ?? process.env, {
        continueInNewSession: createVisibleLoopContinuation(ctx),
      });
    },
  };

  function registerCommandInput(): void {
    pi.on?.("input", async (event, ctx) => {
      if (event.source !== "extension") return { action: "continue" };
      const command = parseExtensionVisibleLoopCommand(event.text);
      if (!command) return { action: "continue" };
      await runVisibleLoopCommand(command.args, ctx as PiCommandContext, command.profile);
      return { action: "handled" };
    });
  }

  function registerLifecycleEvents(): void {
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
  }

  function registerCompletionTool(): void {
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

  return { commandHandlers, registerCommandInput, registerLifecycleEvents, registerCompletionTool };
}
