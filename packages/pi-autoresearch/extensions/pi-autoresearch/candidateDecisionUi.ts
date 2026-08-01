// ---
// summary: "Builds the interactive candidate-decision review overlay and ranks status, keep, discard, or rewind choices."
// read_when:
//   - "Changing candidate lifecycle review choices, recommendation badges, keyboard handling, or fallback editor behavior."
// ---
import type {
  AutoresearchCandidateDecisionReviewParsedInput,
  AutoresearchCandidateDecisionTriggerAction,
} from "./commandText.ts";
import { buildAutoresearchCandidateDecisionEditorCall } from "./commandTextCandidates.ts";
import type {
  AutoresearchOverlayComponent,
  AutoresearchWidgetContext,
  AutoresearchWidgetTui,
} from "./extensionUiTypes.ts";
import type { AutoresearchLazyModules, AutoresearchRuntimeModule } from "./lazyModules.ts";
import type { AutoresearchSessionEffects } from "./sessionEffects.ts";
import { borderedLine, borderLine, truncatePlainLine } from "./tuiFormat.ts";

export type AutoresearchCandidateDecisionTriggerCandidate = {
  id: string;
  label: string;
  detail: string;
  action: AutoresearchCandidateDecisionTriggerAction;
};

type AutoresearchCandidateDecisionReviewComponent = AutoresearchOverlayComponent;

export const AUTORESEARCH_CANDIDATE_DECISION_TRIGGER_CANDIDATES: AutoresearchCandidateDecisionTriggerCandidate[] =
  [
    {
      id: "status",
      label: "Candidate status",
      detail:
        "Inspect current candidate posture and recommended lifecycle decision without planning a worktree command.",
      action: "status",
    },
    {
      id: "keep",
      label: "Plan keep",
      detail:
        "Plan a safe keep/review path; no merge, branch materialization, evidence write, or promotion is automatic.",
      action: "plan_keep",
    },
    {
      id: "discard",
      label: "Plan discard",
      detail:
        "Plan cleanup guidance only; worktree removal and branch deletion require explicit operator confirmation.",
      action: "plan_discard",
    },
    {
      id: "rewind",
      label: "Plan rewind",
      detail:
        "Plan reset/recreate guidance only; no destructive worktree command is applied by pi-autoresearch.",
      action: "plan_rewind",
    },
  ];

export async function openAutoresearchCandidateDecisionReview(
  ctx: AutoresearchWidgetContext,
  parsed: AutoresearchCandidateDecisionReviewParsedInput,
  modules: AutoresearchLazyModules,
  effects: AutoresearchSessionEffects,
): Promise<void> {
  if (!effects.isActive()) return;
  const runtimeModule = await modules.runtime();
  if (!effects.isActive()) return;
  const candidates = buildAutoresearchCandidateDecisionTriggerCandidates({
    cwd: ctx.cwd,
    directAction: parsed.directAction,
    runtimeModule,
  });
  const fallbackAction = candidates[0]?.action ?? parsed.directAction ?? "status";
  if (!ctx.hasUI || typeof ctx.ui.custom !== "function") {
    const editor = await effects.commitAsync(() =>
      ctx.ui.editor?.(
        "Review autoresearch candidate decision",
        buildAutoresearchCandidateDecisionEditorCall(ctx.cwd, fallbackAction, runtimeModule),
      ),
    );
    if (!editor.committed) return;
    effects.commit(() =>
      ctx.ui.notify?.(
        "Candidate decision review overlay unavailable; opened the plan-only confirmation in the editor.",
        "warning",
      ),
    );
    return;
  }

  const selection = await effects.commitAsync(() =>
    ctx.ui.custom?.<AutoresearchCandidateDecisionTriggerAction | null>(
      (tui, _theme, _keybindings, done) =>
        createAutoresearchCandidateDecisionReviewOverlay({
          cwd: ctx.cwd,
          candidates,
          tui,
          done,
          effects,
        }),
      {
        overlay: true,
        overlayOptions: {
          anchor: "center",
          width: "82%",
          maxHeight: "75%",
          margin: 1,
          visible: (termWidth: number, termHeight: number) => termWidth >= 70 && termHeight >= 16,
        },
      },
    ),
  );

  if (!selection.committed) return;
  const selectedAction = selection.value;
  if (!selectedAction) {
    effects.commit(() =>
      ctx.ui.notify?.(
        "Canceled autoresearch candidate decision review; no action was applied.",
        "info",
      ),
    );
    return;
  }

  const editor = await effects.commitAsync(() =>
    ctx.ui.editor?.(
      "Review autoresearch candidate decision",
      buildAutoresearchCandidateDecisionEditorCall(ctx.cwd, selectedAction, runtimeModule),
    ),
  );
  if (!editor.committed) return;
  effects.commit(() =>
    ctx.ui.notify?.(
      `Prepared autoresearch_candidate_decision ${selectedAction} confirmation. Review the checklist before any external worktree action.`,
      "info",
    ),
  );
}

function createAutoresearchCandidateDecisionReviewOverlay(input: {
  cwd: string;
  candidates: readonly AutoresearchCandidateDecisionTriggerCandidate[];
  tui: AutoresearchWidgetTui;
  done: (result: AutoresearchCandidateDecisionTriggerAction | null) => void;
  effects: AutoresearchSessionEffects;
}): AutoresearchCandidateDecisionReviewComponent {
  if (!input.effects.isActive()) {
    return { render: () => [], handleInput() {}, invalidate() {}, dispose() {} };
  }
  const candidates = input.candidates.length > 0 ? [...input.candidates] : [];
  let selectedIndex = 0;
  let closed = false;
  const close = (result: AutoresearchCandidateDecisionTriggerAction | null) => {
    if (closed) return;
    closed = true;
    input.effects.signal.removeEventListener("abort", abort);
    input.done(result);
  };
  const abort = () => close(null);
  input.effects.signal.addEventListener("abort", abort, { once: true });
  const move = (delta: number) => {
    if (candidates.length === 0) return;
    selectedIndex = (selectedIndex + delta + candidates.length) % candidates.length;
    input.effects.commit(() => input.tui.requestRender?.());
  };

  return {
    render(width: number): string[] {
      if (!input.effects.isActive()) return [];
      return formatAutoresearchCandidateDecisionReviewOverlayLines({
        cwd: input.cwd,
        candidates,
        selectedIndex,
        width: Math.max(40, width),
      });
    },
    handleInput(data: string): void {
      if (data === "q" || data === "Q" || data === "\u001b" || data === "\u0003") {
        close(null);
        return;
      }
      if (data === "j" || data === "\u001b[B") {
        move(1);
        return;
      }
      if (data === "k" || data === "\u001b[A") {
        move(-1);
        return;
      }
      const digit = /^[1-4]$/u.exec(data)?.[0];
      if (digit) {
        const index = Number(digit) - 1;
        if (candidates[index]) {
          selectedIndex = index;
          close(candidates[index].action);
        }
        return;
      }
      if (data === "\r" || data === "\n") {
        close(candidates[selectedIndex]?.action ?? null);
      }
    },
    invalidate(): void {},
    dispose(): void {
      input.effects.signal.removeEventListener("abort", abort);
    },
  };
}

function formatAutoresearchCandidateDecisionReviewOverlayLines(input: {
  cwd: string;
  candidates: readonly AutoresearchCandidateDecisionTriggerCandidate[];
  selectedIndex: number;
  width: number;
}): string[] {
  const innerWidth = Math.max(20, input.width - 2);
  const rows = input.candidates.map((candidate, index) => {
    const pointer = index === input.selectedIndex ? "▶" : " ";
    const number = `${index + 1}.`;
    const badges = [
      candidate.detail.includes("direct") ? "direct" : null,
      candidate.detail.includes("recommended") ? "recommended" : null,
    ].filter(Boolean);
    const label = badges.length > 0 ? `${candidate.label} [${badges.join(", ")}]` : candidate.label;
    const line = `${pointer} ${number} ${label} — ${candidate.detail}`;
    return borderedLine(truncatePlainLine(line, innerWidth), innerWidth);
  });
  const body = [
    borderLine("┌", "─", "┐", innerWidth),
    borderedLine("🔬 Review autoresearch candidate decision", innerWidth),
    borderedLine(
      "final owner decision after complete packet inventory • Enter choose • q/Esc cancel",
      innerWidth,
    ),
    borderLine("├", "─", "┤", innerWidth),
    borderedLine(`cwd: ${input.cwd}`, innerWidth),
    borderedLine(
      "No worktree, AK/KES/evidence, peer, merge, or promotion action is applied here.",
      innerWidth,
    ),
    borderLine("├", "─", "┤", innerWidth),
    ...rows,
    borderLine("└", "─", "┘", innerWidth),
  ];
  return body.map((line) => truncatePlainLine(line, input.width));
}

export function buildAutoresearchCandidateDecisionTriggerCandidates(input: {
  cwd: string;
  directAction: AutoresearchCandidateDecisionTriggerAction | null;
  runtimeModule: AutoresearchRuntimeModule;
}): AutoresearchCandidateDecisionTriggerCandidate[] {
  let recommendation: ReturnType<
    AutoresearchRuntimeModule["buildAutoresearchCandidateDecisionWorkbench"]
  > | null = null;
  try {
    recommendation = input.runtimeModule.buildAutoresearchCandidateDecisionWorkbench({
      cwd: input.cwd,
    });
  } catch {
    recommendation = null;
  }

  const decorated = AUTORESEARCH_CANDIDATE_DECISION_TRIGGER_CANDIDATES.map((candidate) => {
    const badges: string[] = [];
    if (input.directAction === candidate.action) badges.push("direct");
    if (
      recommendation &&
      candidateActionMatchesLifecycleDecision(candidate.action, recommendation.recommendedDecision)
    ) {
      badges.push("recommended");
    }
    return {
      ...candidate,
      detail: badges.length > 0 ? `${candidate.detail} (${badges.join(", ")})` : candidate.detail,
    };
  });

  return decorated.sort((left, right) => {
    const leftDirect = input.directAction === left.action ? 1 : 0;
    const rightDirect = input.directAction === right.action ? 1 : 0;
    if (leftDirect !== rightDirect) return rightDirect - leftDirect;
    const leftRecommended =
      recommendation &&
      candidateActionMatchesLifecycleDecision(left.action, recommendation.recommendedDecision)
        ? 1
        : 0;
    const rightRecommended =
      recommendation &&
      candidateActionMatchesLifecycleDecision(right.action, recommendation.recommendedDecision)
        ? 1
        : 0;
    return rightRecommended - leftRecommended;
  });
}

function candidateActionMatchesLifecycleDecision(
  action: AutoresearchCandidateDecisionTriggerAction,
  decision: string,
): boolean {
  return (
    (action === "status" && decision === "no_candidate_bound_yet") ||
    (action === "plan_keep" && (decision === "keep" || decision === "finalize")) ||
    (action === "plan_discard" && decision === "discard") ||
    (action === "plan_rewind" && decision === "rewind")
  );
}
