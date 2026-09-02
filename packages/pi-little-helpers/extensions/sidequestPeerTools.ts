// summary: registers model-callable forked, scout, and fresh clean-handoff Ghostty launch tools.
// read_when:
//   - changing fork_peer_spawn, scout_peer_spawn, or fresh_handoff_spawn launch, prompt, report-back, or tool registration behavior.

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { LITTLE_HELPERS_PEER_TOOL_NAMES } from "../src/capabilityManifest.ts";
import type { FreshHandoffExecutor } from "./sidequestCommandHandlers.ts";
import {
  type ForkPeerSpawnRequest,
  type FreshHandoffSpawnRequest,
  forkPeerSpawnParameters,
  freshHandoffSpawnParameters,
  type PiToolContext,
  type SidequestSpawnRequest,
  scoutPeerSpawnParameters,
} from "./sidequestContracts.ts";
import { launchPiQuestSession, type SidequestLaunchOptions } from "./sidequestLaunch.ts";
import {
  buildForkPeerSpawnPrompt,
  buildSidequestSpawnPrompt,
  createQuestId,
  normalizeForkPeerReportBack,
  normalizeReportBack,
  normalizeSidequestRole,
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

export function registerSidequestPeerTools({
  pi,
  options,
  defaultPiBin,
  freshHandoff,
}: {
  pi: ExtensionAPI;
  options: SidequestLaunchOptions;
  defaultPiBin: string;
  freshHandoff: FreshHandoffExecutor;
}): void {
  const [FORK_PEER_SPAWN_TOOL, SCOUT_PEER_SPAWN_TOOL, FRESH_HANDOFF_SPAWN_TOOL] =
    LITTLE_HELPERS_PEER_TOOL_NAMES;

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
      defaultPiBin,
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

  async function executeFreshHandoffSpawn(toolName: string, params: unknown, ctx: PiToolContext) {
    const request = params as FreshHandoffSpawnRequest;
    const goal = request.goal?.trim();
    const cwd = request.cwd?.trim() || ctx.cwd || process.cwd();
    const outcome = await freshHandoff(goal, ctx, cwd, false);
    if (!outcome.ok) {
      return errorToolResult(outcome.message, {
        ok: false,
        tool: toolName,
        canonicalTool: "fresh_handoff_spawn",
        sessionMode: "clean",
        cwd: outcome.cwd,
        error: outcome.error,
        effectDisposition: outcome.launch?.effectDisposition ?? "confirmed_no_effects",
      });
    }

    return successToolResult(
      `Launched a fresh clean Pi handoff in ${outcome.launch.launchMode} mode: ${outcome.launch.promptSummary}`,
      {
        ok: true,
        tool: toolName,
        canonicalTool: "fresh_handoff_spawn",
        effectDisposition: outcome.launch.effectDisposition,
        launchMode: outcome.launch.launchMode,
        sessionMode: outcome.launch.sessionMode,
        cwd: outcome.cwd,
        titleBase: outcome.launch.titleBase,
        promptSummary: outcome.launch.promptSummary,
        goal: outcome.goal,
        ...(outcome.launch.launchNote ? { launchNote: outcome.launch.launchNote } : {}),
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
      defaultPiBin,
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

  pi.registerTool({
    name: FORK_PEER_SPAWN_TOOL,
    label: "Fork Peer Spawn",
    description: "Launch a visible forked-context peer Pi session.",
    promptSnippet:
      "Use to launch a visible peer that inherits the current Pi conversation context. This is the tool equivalent of /sidequest for controller-spawned use. Unscoped child cwd receives company provenance automatically; do not pick this tool to set PI_COMPANY.",
    parameters: forkPeerSpawnParameters,
    execute: (_toolCallId, params, _signal, _onUpdate, ctx) =>
      executeForkPeerSpawn(FORK_PEER_SPAWN_TOOL, params, ctx),
  });

  pi.registerTool({
    name: SCOUT_PEER_SPAWN_TOOL,
    label: "Scout Peer Spawn",
    description: "Launch a clean visible read-only scout/review peer Pi session.",
    promptSnippet:
      "Use to launch a clean visible scout/review peer in the same workspace. It does not inherit the controller conversation and returns launch facts only. Unscoped child cwd receives company provenance automatically.",
    parameters: scoutPeerSpawnParameters,
    execute: (_toolCallId, params, _signal, _onUpdate, ctx) =>
      executeScoutPeerSpawn(SCOUT_PEER_SPAWN_TOOL, params, ctx),
  });

  pi.registerTool({
    name: FRESH_HANDOFF_SPAWN_TOOL,
    label: "Fresh Handoff Spawn",
    description:
      "Generate a self-contained handoff from the current conversation and launch it as the sole initial user message in a fresh clean Pi session.",
    promptSnippet:
      "Use only when the operator explicitly asks to transfer current work into a fresh clean Pi session. The launch is continuation transport, not task completion proof. Unscoped child cwd receives company provenance automatically; session mode is not a company switch.",
    parameters: freshHandoffSpawnParameters,
    execute: (_toolCallId, params, _signal, _onUpdate, ctx) =>
      executeFreshHandoffSpawn(FRESH_HANDOFF_SPAWN_TOOL, params, ctx),
  });
}
