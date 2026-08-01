// ---
// summary: "Schedules gated post-settlement autoresearch follow-ups and cancels pending continuation timers when agent activity resumes."
// read_when:
//   - "Changing session auto-continuation eligibility, follow-up delivery, timer cleanup, or settle-delay configuration."
// ---
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import type {
  AutoresearchAutoContinuationDecision,
  AutoresearchAutoContinuationSessionGate,
} from "../../src/core/autoContinuation.ts";
import type { AutoresearchWidgetContext } from "./extensionUiTypes.ts";
import type { AutoresearchLazyModules } from "./lazyModules.ts";
import type { AutoresearchSessionEffects } from "./sessionEffects.ts";

const AUTORESEARCH_AUTO_CONTINUATION_DEFAULT_MAX = 1;

export async function scheduleAutoresearchAutoContinuationFollowUp(
  pi: ExtensionAPI,
  ctx: AutoresearchWidgetContext,
  autoContinuationCounts: Map<string, number>,
  autoContinuationTimers: Map<string, ReturnType<typeof setTimeout>>,
  autoContinuationGenerations: Map<string, number>,
  modules: AutoresearchLazyModules,
  effects: AutoresearchSessionEffects,
): Promise<void> {
  const cwd = ctx.cwd;
  if (!cwd || !effects.isActive()) return;
  cancelAutoresearchAutoContinuationFollowUp(cwd, autoContinuationTimers);
  const generation = (autoContinuationGenerations.get(cwd) ?? 0) + 1;
  autoContinuationGenerations.set(cwd, generation);

  const sessionGate = buildAutoresearchAutoContinuationSessionGateForCwd(
    cwd,
    autoContinuationCounts,
  );
  if (
    !sessionGate.enabled ||
    sessionGate.autoContinueCount >= (sessionGate.maxAutoContinueCount ?? 1)
  ) {
    return;
  }

  const [runtimeModule, autoContinuationModule] = await Promise.all([
    modules.runtime(),
    modules.autoContinuation(),
  ]);
  if (!effects.isActive() || autoContinuationGenerations.get(cwd) !== generation) return;

  const buildDecision = (): AutoresearchAutoContinuationDecision =>
    runtimeModule.buildAutoresearchRuntimeStatus(cwd, {
      persistSnapshot: false,
      autoContinuationSession: buildAutoresearchAutoContinuationSessionGateForCwd(
        cwd,
        autoContinuationCounts,
      ),
    }).autoContinuation;

  const initialDecision = buildDecision();
  if (!initialDecision.eligible) return;

  const timer = setTimeout(
    effects.guard(() => {
      autoContinuationTimers.delete(cwd);
      if (autoContinuationGenerations.get(cwd) !== generation) return;
      const decision = buildDecision();
      const visibleFollowUpMessage = decision.visibleFollowUpMessage;
      if (!decision.eligible || !visibleFollowUpMessage) return;

      effects.commit(() => {
        autoContinuationCounts.set(cwd, (autoContinuationCounts.get(cwd) ?? 0) + 1);
        const sendUserMessage = (
          pi as unknown as { sendUserMessage?: ExtensionAPI["sendUserMessage"] }
        ).sendUserMessage;
        if (typeof sendUserMessage === "function") {
          sendUserMessage.call(pi, visibleFollowUpMessage, { deliverAs: "followUp" });
          return;
        }

        ctx.ui?.notify?.(
          autoContinuationModule.formatAutoresearchAutoContinuationDecision(decision),
          "info",
        );
      });
    }),
    getAutoresearchAutoContinuationSettleDelayMs(),
  );
  timer.unref?.();
  autoContinuationTimers.set(cwd, timer);
}

export function cancelAutoresearchAutoContinuationFollowUp(
  cwd: string | undefined,
  autoContinuationTimers: Map<string, ReturnType<typeof setTimeout>>,
  autoContinuationGenerations?: Map<string, number>,
): void {
  if (!cwd) return;
  if (autoContinuationGenerations) {
    autoContinuationGenerations.set(cwd, (autoContinuationGenerations.get(cwd) ?? 0) + 1);
  }
  const timer = autoContinuationTimers.get(cwd);
  if (!timer) return;
  clearTimeout(timer);
  autoContinuationTimers.delete(cwd);
}

export function buildAutoresearchAutoContinuationSessionGateForCwd(
  cwd: string,
  autoContinuationCounts: Map<string, number>,
): AutoresearchAutoContinuationSessionGate {
  void cwd;
  const envValue = process.env.PI_AUTORESEARCH_AUTO_CONTINUE ?? null;
  const parsedMax = Number(
    process.env.PI_AUTORESEARCH_AUTO_CONTINUE_MAX ??
      String(AUTORESEARCH_AUTO_CONTINUATION_DEFAULT_MAX),
  );
  const maxAutoContinueCount =
    Number.isFinite(parsedMax) && parsedMax >= 0
      ? Math.floor(parsedMax)
      : AUTORESEARCH_AUTO_CONTINUATION_DEFAULT_MAX;
  return {
    enabled: envValue === "1",
    envValue,
    autoContinueCount: autoContinuationCounts.get(cwd) ?? 0,
    maxAutoContinueCount,
  };
}

function getAutoresearchAutoContinuationSettleDelayMs(): number {
  const parsed = Number(process.env.PI_AUTORESEARCH_AUTO_CONTINUE_SETTLE_MS ?? "1500");
  return Number.isFinite(parsed) && parsed >= 0 ? Math.floor(parsed) : 1500;
}
