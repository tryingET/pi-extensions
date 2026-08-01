// ---
// summary: "Registers the pi-autoresearch extension commands, input bridges, session hooks, dashboard lifecycle, and tool families."
// read_when:
//   - "Changing extension startup, slash or dollar-input routing, session cleanup, or registered autoresearch tools."
// ---
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { transformAutoresearchDollarInput } from "./pi-autoresearch/commandText.ts";
import { registerAutoresearchWidget } from "./pi-autoresearch/dashboardUi.ts";
import { AUTORESEARCH_COMMAND_NAME } from "./pi-autoresearch/eagerContract.ts";
import {
  cancelAutoresearchAutoContinuationFollowUp,
  scheduleAutoresearchAutoContinuationFollowUp,
} from "./pi-autoresearch/extensionAutoContinuation.ts";
import type { PiAutoresearchExtensionOptions } from "./pi-autoresearch/extensionOptions.ts";
import type { AutoresearchWidgetContext } from "./pi-autoresearch/extensionUiTypes.ts";
import {
  type AutoresearchLazyModules,
  createAutoresearchLazyModules,
} from "./pi-autoresearch/lazyModules.ts";
import {
  type AutoresearchSessionEffects,
  createAutoresearchSessionEffects,
} from "./pi-autoresearch/sessionEffects.ts";
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
  const autoContinuationGenerations = new Map<string, number>();
  let sessionEffects = createAutoresearchSessionEffects();
  const modules = createAutoresearchLazyModules(options.moduleLoaders);

  const registerLiveTriggerForSession = (effects: AutoresearchSessionEffects): void => {
    void maybeRegisterAutoresearchLiveTrigger(options.triggerSurface, modules, effects)
      .then((registration) => {
        if (!effects.isActive() || effects !== sessionEffects) {
          registration.unregister();
          return;
        }
        unregisterAutoresearchLiveTrigger = registration.unregister;
      })
      .catch(() => {
        // Optional trigger startup must not create an unhandled session-level rejection.
      });
  };

  const revokeSessionBeforeCleanup = (): void => {
    sessionEffects.revoke();
    unregisterAutoresearchLiveTrigger?.();
    unregisterAutoresearchLiveTrigger = null;
    for (const interval of dashboardExportIntervals.values()) clearInterval(interval);
    dashboardExportIntervals.clear();
    for (const timer of autoContinuationTimers.values()) clearTimeout(timer);
    autoContinuationTimers.clear();
    autoContinuationCounts.clear();
    autoContinuationGenerations.clear();
  };

  registerLiveTriggerForSession(sessionEffects);

  const maybeOn = (
    pi as unknown as { on?: (event: string, handler: (...args: unknown[]) => unknown) => void }
  ).on;
  if (typeof maybeOn === "function") {
    maybeOn.call(pi, "session_start", (_event: unknown, ctx: unknown) => {
      revokeSessionBeforeCleanup();
      sessionEffects = createAutoresearchSessionEffects();
      const effects = sessionEffects;
      registerLiveTriggerForSession(effects);
      if (process.env.PI_AUTORESEARCH_WIDGET === "0") return;
      const widgetContext = ctx as AutoresearchWidgetContext;
      void registerAutoresearchWidget(widgetContext, modules, effects).catch((error) => {
        reportAutoresearchSessionHookFailure(widgetContext, "status widget", error, effects);
      });
    });
    maybeOn.call(pi, "agent_start", (_event: unknown, ctx: unknown) => {
      cancelAutoresearchAutoContinuationFollowUp(
        (ctx as AutoresearchWidgetContext).cwd,
        autoContinuationTimers,
        autoContinuationGenerations,
      );
    });
    maybeOn.call(pi, "agent_settled", (_event: unknown, ctx: unknown) => {
      const continuationContext = ctx as AutoresearchWidgetContext;
      const effects = sessionEffects;
      void scheduleAutoresearchAutoContinuationFollowUp(
        pi,
        continuationContext,
        autoContinuationCounts,
        autoContinuationTimers,
        autoContinuationGenerations,
        modules,
        effects,
      ).catch((error) => {
        reportAutoresearchSessionHookFailure(
          continuationContext,
          "auto-continuation",
          error,
          effects,
        );
      });
    });
    maybeOn.call(pi, "session_shutdown", () => {
      revokeSessionBeforeCleanup();
    });
  }

  pi.registerCommand(AUTORESEARCH_COMMAND_NAME, {
    description: "Open the pi-autoresearch bounded-runtime overview",
    handler: async (args, ctx) => {
      await openAutoresearchShell(
        args,
        ctx,
        dashboardExportIntervals,
        options,
        modules,
        sessionEffects,
      );
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
        const handled = await executeExtensionAutoresearchBridge(
          bridgeArgs,
          ctx as ExtensionContext,
          modules,
          sessionEffects,
        );
        return { action: handled ? ("handled" as const) : ("continue" as const) };
      }
      const effects = sessionEffects;
      const transformed = await transformAutoresearchDollarInput(text, inputContext.cwd, modules);
      if (!effects.isActive()) return { action: "continue" as const };
      if (!transformed) return { action: "continue" as const };
      return { action: "transform" as const, text: transformed };
    });
  }

  registerAutoresearchPlanningTools(pi, options, modules);
  registerAutoresearchStatusControlTools({
    pi,
    options,
    autoContinuationCounts,
    modules,
  });

  registerAutoresearchRuntimeExecutionTools(pi, options, modules, () => sessionEffects);
  registerAutoresearchLoopResumeTools(pi, options, modules, () => sessionEffects);
  registerAutoresearchSelfHostingTool(pi, options, modules, () => sessionEffects);
  registerAutoresearchLlamacppTools(pi, options, modules);
}

const EXTENSION_AUTORESEARCH_ASC_SELF_EVOLUTION_COMMAND =
  "/autoresearch Evaluate ASC self-evolution harness: metric=operator_nudge_count lower-is-better target=0 for post-compaction continuation; guardrail_boundary_violations target=0";

async function executeExtensionAutoresearchBridge(
  objective: string,
  ctx: ExtensionContext,
  modules: AutoresearchLazyModules,
  effects: AutoresearchSessionEffects,
): Promise<boolean> {
  // Headless input must remain available to the host/agent. Without an editor there is
  // no truthful way to present this bridge's plan-only result, so do not consume it.
  if (!ctx.hasUI || !effects.isActive()) return false;
  const { executeAutoresearchCampaignStart, formatAutoresearchCampaignStartResult } =
    await modules.runtime();
  if (!effects.isActive()) return false;
  const result = await executeAutoresearchCampaignStart({
    cwd: ctx.cwd,
    objective,
    setupMode: "autoplan",
    runMode: "plan_only",
    maxIterations: 3,
    peerMode: "plan",
    signal: effects.signal,
    candidatePolicy: {
      mode: "worktree",
      keep: "preserve_branch",
      discard: "suggest_cleanup",
      rewind: "reset_worktree_to_base",
    },
  });
  if (!effects.isActive()) return false;
  const editor = await effects.commitAsync(() =>
    ctx.ui.editor(
      "Autoresearch campaign start result",
      formatAutoresearchCampaignStartResult(result),
    ),
  );
  if (!editor.committed) return false;
  effects.commit(() =>
    ctx.ui.notify(
      "Executed exact ASC autoresearch bridge as a plan-only campaign start. Review result gates and next exact call.",
      "info",
    ),
  );
  return effects.isActive();
}

function parseExtensionAutoresearchCommand(text: string): string | undefined {
  const normalized = text.trim();
  if (normalized !== EXTENSION_AUTORESEARCH_ASC_SELF_EVOLUTION_COMMAND) return undefined;
  return normalized.replace(/^\/autoresearch\s+/u, "");
}

function reportAutoresearchSessionHookFailure(
  ctx: AutoresearchWidgetContext,
  surface: string,
  error: unknown,
  effects: AutoresearchSessionEffects,
): void {
  if (!effects.isActive()) return;
  try {
    effects.commit(() =>
      ctx.ui?.notify?.(
        `Pi-autoresearch ${surface} unavailable: ${error instanceof Error ? error.message : String(error)}`,
        "warning",
      ),
    );
  } catch {
    // Error reporting must not recreate the unhandled rejection it consumes.
  }
}

export default function piAutoresearchExtension(pi: ExtensionAPI): void {
  registerPiAutoresearchExtension(pi);
}
