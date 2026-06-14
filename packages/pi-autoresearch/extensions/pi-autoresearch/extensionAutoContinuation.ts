import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import {
  type AutoresearchAutoContinuationDecision,
  buildAutoresearchAutoContinuationSessionGateFromEnv,
  formatAutoresearchAutoContinuationDecision,
} from "../../src/core/autoContinuation.ts";
import { buildAutoresearchRuntimeStatus } from "../../src/core/runtime.ts";
import type { AutoresearchWidgetContext } from "./extensionUiTypes.ts";

export function scheduleAutoresearchAutoContinuationFollowUp(
  pi: ExtensionAPI,
  ctx: AutoresearchWidgetContext,
  autoContinuationCounts: Map<string, number>,
  autoContinuationTimers: Map<string, ReturnType<typeof setTimeout>>,
): void {
  const cwd = ctx.cwd;
  if (!cwd) return;
  cancelAutoresearchAutoContinuationFollowUp(cwd, autoContinuationTimers);

  const initialDecision = buildAutoresearchAutoContinuationDecisionForCwd(
    cwd,
    autoContinuationCounts,
  );
  if (!initialDecision.eligible) return;

  const timer = setTimeout(() => {
    autoContinuationTimers.delete(cwd);
    const decision = buildAutoresearchAutoContinuationDecisionForCwd(cwd, autoContinuationCounts);
    if (!decision.eligible || !decision.visibleFollowUpMessage) return;

    autoContinuationCounts.set(cwd, (autoContinuationCounts.get(cwd) ?? 0) + 1);
    const sendUserMessage = (pi as unknown as { sendUserMessage?: ExtensionAPI["sendUserMessage"] })
      .sendUserMessage;
    if (typeof sendUserMessage === "function") {
      sendUserMessage.call(pi, decision.visibleFollowUpMessage, { deliverAs: "followUp" });
      return;
    }

    ctx.ui?.notify?.(formatAutoresearchAutoContinuationDecision(decision), "info");
  }, getAutoresearchAutoContinuationSettleDelayMs());
  timer.unref?.();
  autoContinuationTimers.set(cwd, timer);
}

export function cancelAutoresearchAutoContinuationFollowUp(
  cwd: string | undefined,
  autoContinuationTimers: Map<string, ReturnType<typeof setTimeout>>,
): void {
  if (!cwd) return;
  const timer = autoContinuationTimers.get(cwd);
  if (!timer) return;
  clearTimeout(timer);
  autoContinuationTimers.delete(cwd);
}

function buildAutoresearchAutoContinuationDecisionForCwd(
  cwd: string,
  autoContinuationCounts: Map<string, number>,
): AutoresearchAutoContinuationDecision {
  return buildAutoresearchRuntimeStatus(cwd, {
    persistSnapshot: false,
    autoContinuationSession: buildAutoresearchAutoContinuationSessionGateForCwd(
      cwd,
      autoContinuationCounts,
    ),
  }).autoContinuation;
}

export function buildAutoresearchAutoContinuationSessionGateForCwd(
  cwd: string,
  autoContinuationCounts: Map<string, number>,
) {
  return buildAutoresearchAutoContinuationSessionGateFromEnv({
    autoContinueCount: autoContinuationCounts.get(cwd) ?? 0,
  });
}

function getAutoresearchAutoContinuationSettleDelayMs(): number {
  const parsed = Number(process.env.PI_AUTORESEARCH_AUTO_CONTINUE_SETTLE_MS ?? "1500");
  return Number.isFinite(parsed) && parsed >= 0 ? Math.floor(parsed) : 1500;
}
