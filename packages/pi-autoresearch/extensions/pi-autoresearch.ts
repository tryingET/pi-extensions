import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import {
  AUTORESEARCH_COMMAND_NAME,
  executeAutoresearchCampaignStart,
  formatAutoresearchCampaignStartResult,
} from "../src/core/runtime.ts";
import { transformAutoresearchDollarInput } from "./pi-autoresearch/commandText.ts";
import { registerAutoresearchWidget } from "./pi-autoresearch/dashboardUi.ts";
import {
  cancelAutoresearchAutoContinuationFollowUp,
  scheduleAutoresearchAutoContinuationFollowUp,
} from "./pi-autoresearch/extensionAutoContinuation.ts";
import type { PiAutoresearchExtensionOptions } from "./pi-autoresearch/extensionOptions.ts";
import type { AutoresearchWidgetContext } from "./pi-autoresearch/extensionUiTypes.ts";
import { openAutoresearchShell } from "./pi-autoresearch/shellCommand.ts";
import { registerAutoresearchLlamacppTools } from "./pi-autoresearch/toolLlamacpp.ts";
import { registerAutoresearchLoopResumeTools } from "./pi-autoresearch/toolLoopResume.ts";
import { registerAutoresearchPlanningTools } from "./pi-autoresearch/toolPlanning.ts";
import { registerAutoresearchRuntimeExecutionTools } from "./pi-autoresearch/toolRuntimeExecution.ts";
import { registerAutoresearchSelfHostingTool } from "./pi-autoresearch/toolSelfHosting.ts";
import { registerAutoresearchStatusControlTools } from "./pi-autoresearch/toolStatusControl.ts";
import { maybeRegisterAutoresearchLiveTrigger } from "./pi-autoresearch/triggerPicker.ts";

export type { PiAutoresearchExtensionOptions } from "./pi-autoresearch/extensionOptions.ts";
export type { AutoresearchExtensionEffectProfile } from "./pi-autoresearch/readProfile.ts";

export function registerPiAutoresearchExtension(
  pi: ExtensionAPI,
  options: PiAutoresearchExtensionOptions = {},
): void {
  let unregisterAutoresearchLiveTrigger: (() => void) | null = null;
  const dashboardExportIntervals = new Map<string, ReturnType<typeof setInterval>>();
  const autoContinuationCounts = new Map<string, number>();
  const autoContinuationTimers = new Map<string, ReturnType<typeof setTimeout>>();
  let sessionActive = true;

  void maybeRegisterAutoresearchLiveTrigger(options.triggerSurface).then((registration) => {
    if (!sessionActive) {
      registration.unregister();
      return;
    }
    unregisterAutoresearchLiveTrigger = registration.unregister;
  });

  const maybeOn = (
    pi as unknown as { on?: (event: string, handler: (...args: unknown[]) => unknown) => void }
  ).on;
  if (typeof maybeOn === "function") {
    maybeOn.call(pi, "session_start", (_event: unknown, ctx: unknown) => {
      if (process.env.PI_AUTORESEARCH_WIDGET === "0") return;
      registerAutoresearchWidget(ctx as AutoresearchWidgetContext);
    });
    maybeOn.call(pi, "agent_start", (_event: unknown, ctx: unknown) => {
      cancelAutoresearchAutoContinuationFollowUp(
        (ctx as AutoresearchWidgetContext).cwd,
        autoContinuationTimers,
      );
    });
    maybeOn.call(pi, "agent_end", (_event: unknown, ctx: unknown) => {
      scheduleAutoresearchAutoContinuationFollowUp(
        pi,
        ctx as AutoresearchWidgetContext,
        autoContinuationCounts,
        autoContinuationTimers,
      );
    });
    maybeOn.call(pi, "session_shutdown", () => {
      sessionActive = false;
      unregisterAutoresearchLiveTrigger?.();
      unregisterAutoresearchLiveTrigger = null;
      for (const interval of dashboardExportIntervals.values()) clearInterval(interval);
      dashboardExportIntervals.clear();
      for (const timer of autoContinuationTimers.values()) clearTimeout(timer);
      autoContinuationTimers.clear();
      autoContinuationCounts.clear();
    });
  }

  pi.registerCommand(AUTORESEARCH_COMMAND_NAME, {
    description: "Open the pi-autoresearch bounded-runtime overview",
    handler: async (args, ctx) => {
      await openAutoresearchShell(args, ctx, dashboardExportIntervals, options);
    },
  });

  if (typeof maybeOn === "function") {
    maybeOn.call(pi, "input", async (event: unknown, ctx: unknown) => {
      const inputEvent = event as { source?: string; text?: unknown };
      const inputContext = ctx as { cwd: string };
      const text = String(inputEvent.text ?? "");
      const bridgeArgs = parseExtensionAutoresearchCommand(text);
      if (inputEvent.source === "extension") {
        if (bridgeArgs === undefined) return { action: "continue" as const };
        await executeExtensionAutoresearchBridge(bridgeArgs, ctx as ExtensionContext);
        return { action: "handled" as const };
      }
      const transformed = transformAutoresearchDollarInput(text, inputContext.cwd);
      if (!transformed) return { action: "continue" as const };
      return { action: "transform" as const, text: transformed };
    });
  }

  registerAutoresearchPlanningTools(pi, options);
  registerAutoresearchStatusControlTools({ pi, options, autoContinuationCounts });

  registerAutoresearchRuntimeExecutionTools(pi, options);
  registerAutoresearchLoopResumeTools(pi, options);
  registerAutoresearchSelfHostingTool(pi, options);
  registerAutoresearchLlamacppTools(pi, options);
}

const EXTENSION_AUTORESEARCH_ASC_SELF_EVOLUTION_COMMAND =
  "/autoresearch Evaluate ASC self-evolution harness: metric=operator_nudge_count lower-is-better target=0 for post-compaction continuation; guardrail_boundary_violations target=0";

async function executeExtensionAutoresearchBridge(
  objective: string,
  ctx: ExtensionContext,
): Promise<void> {
  if (!ctx.hasUI) return;
  const result = await executeAutoresearchCampaignStart({
    cwd: ctx.cwd,
    objective,
    setupMode: "autoplan",
    runMode: "plan_only",
    maxIterations: 3,
    peerMode: "plan",
    candidatePolicy: {
      mode: "worktree",
      keep: "preserve_branch",
      discard: "suggest_cleanup",
      rewind: "reset_worktree_to_base",
    },
  });
  await ctx.ui.editor(
    "Autoresearch campaign start result",
    formatAutoresearchCampaignStartResult(result),
  );
  ctx.ui.notify(
    "Executed exact ASC autoresearch bridge as a plan-only campaign start. Review result gates and next exact call.",
    "info",
  );
}

function parseExtensionAutoresearchCommand(text: string): string | undefined {
  const normalized = text.trim();
  if (normalized !== EXTENSION_AUTORESEARCH_ASC_SELF_EVOLUTION_COMMAND) return undefined;
  return normalized.replace(/^\/autoresearch\s+/u, "");
}

export default function piAutoresearchExtension(pi: ExtensionAPI): void {
  registerPiAutoresearchExtension(pi);
}
