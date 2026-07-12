/**
summary: "Registers live session compaction hooks, guided commands, and the fresh-session handoff tool."
read_when:
  - "Changing live compaction activation, focus choices, handoff registration, or tool parameters."
*/
import { Type } from "typebox";
import {
  buildSessionCompactionHandoffToolResult,
  parseCompactHandoffArgs,
} from "./session-compaction/handoff-prompt.js";
import { createSessionCompactionExtension } from "./session-compaction/registration.js";

const LIVE_CUTOVER_PREFLIGHT = {
  enableInputTracking: true,
  enableSessionBeforeCompact: true,
  handlerTestsPassed: true,
  noDoubleCompactionPreflight: true,
  existingCompactionHandlerCount: 0,
};

const FOCUS_OPTIONS = [
  {
    label: "Continue safely",
    instructions:
      "Continue safely: preserve exact current objective, constraints, dirty files, validation already run, and the smallest next action after reload. Include ambient-context reminder: AGENTS.md should be reloaded by Pi and /society-context refresh can refresh startup context.",
  },
  {
    label: "Verify live behavior",
    instructions:
      "Verify live behavior: focus the next session on /reload, one real compaction smoke, sentinel proof in the generated summary, no-double-compaction inventory, and clear rollback if the hook misbehaves.",
  },
  {
    label: "Clean handoff",
    instructions:
      "Clean handoff: separate completed compaction work from unrelated dirty files, preserve exact commits and validation, name what must not be touched, and suggest the next owner decision after compaction.",
  },
  {
    label: "Release readiness",
    instructions:
      "Release readiness: summarize what is committed, installed, validated, and still local; list release/push prerequisites; explicitly say do not push or publish without operator approval.",
  },
];

function describeRegistration(result) {
  const input = result?.inputTracking?.ok
    ? "input tracking enabled"
    : `input tracking skipped (${result?.inputTracking?.reason ?? "unknown"})`;
  const compaction = result?.compaction?.ok
    ? "session_before_compact enabled"
    : `session_before_compact skipped (${result?.compaction?.reason ?? "unknown"})`;
  return `pi-session-compaction: ${input}; ${compaction}`;
}

function messageCount(ctx) {
  const entries = ctx?.sessionManager?.getEntries?.() ?? [];
  return entries.filter((entry) => entry?.type === "message").length;
}

async function runCompactHandoff(args, ctx) {
  const params = parseCompactHandoffArgs(args);
  const result = buildSessionCompactionHandoffToolResult(params, ctx);

  if (result.shouldPrefill && ctx.hasUI) {
    ctx.ui.setEditorText(result.prompt);
    ctx.ui.notify("Fresh-session handoff prompt prefilled", "info");
    return "Fresh-session handoff prompt prefilled by pi-session-compaction.";
  }

  return result.prompt;
}

async function runFocusMenu(ctx) {
  if (!ctx.hasUI) {
    ctx.ui?.notify?.("/compact-focus requires interactive UI", "warning");
    return;
  }

  if (messageCount(ctx) < 2) {
    ctx.ui.notify("Nothing to compact (no messages yet)", "warning");
    return;
  }

  const labels = FOCUS_OPTIONS.map((option) => option.label);
  const choice = await ctx.ui.select("Choose compaction focus", labels);
  if (!choice) {
    ctx.ui.notify("Compaction focus cancelled", "info");
    return;
  }

  const selected = FOCUS_OPTIONS.find((option) => option.label === choice);
  if (!selected) return;

  ctx.compact({ customInstructions: selected.instructions });
  ctx.ui.notify(`Compaction started: ${selected.label}`, "info");
}

export default function sessionCompactionExtension(pi) {
  const extension = createSessionCompactionExtension(LIVE_CUTOVER_PREFLIGHT);
  const result = extension(pi);
  const message = describeRegistration(result);

  if (!result.compaction?.ok) {
    console.warn(message);
  }

  pi.on("session_start", async (_event, ctx) => {
    ctx?.ui?.notify?.(message, result.compaction?.ok ? "info" : "warning");
    return { action: "continue" };
  });

  pi.registerCommand("compact-focus", {
    description: "Choose a guided compaction focus and compact the current session",
    handler: async (_args, ctx) => {
      await runFocusMenu(ctx);
    },
  });

  pi.registerCommand("compact-handoff", {
    description: "Prepare an operator-pasteable fresh-session handoff prompt",
    handler: async (args, ctx) => runCompactHandoff(args, ctx),
  });

  pi.registerTool({
    name: "session_compaction_handoff",
    label: "Session Compaction Handoff Prompt",
    description:
      "Build a pi-session-compaction-owned fresh-session handoff prompt for proactive compaction/reload continuation.",
    promptSnippet:
      "Prepare an operator-pasteable fresh-session handoff prompt owned by pi-session-compaction.",
    promptGuidelines: [
      "Use session_compaction_handoff when context pressure is visible and the operator needs a copyable fresh-session prompt before compaction or reload.",
      "Keep the prompt truthful: do not invent token telemetry, git status, AK task ids, validation, or candidate posture that was not supplied or verified.",
      "Use pi-autoresearch owner surfaces for candidate lifecycle review; this handoff prompt must not promote, finalize, discard, or mutate candidates.",
    ],
    parameters: Type.Object({
      mode: Type.Optional(
        Type.Union([Type.Literal("prefill"), Type.Literal("show")], {
          description:
            "Whether to prefill the editor when UI is available or only show the prompt.",
        }),
      ),
      cwd: Type.Optional(Type.String({ description: "Working directory for the fresh session." })),
      note: Type.Optional(Type.String({ description: "Optional operator/task note to include." })),
      gitStatusSummary: Type.Optional(
        Type.String({ description: "Verified git status summary, if known." }),
      ),
      akTaskIds: Type.Optional(Type.Array(Type.String(), { description: "Known AK task ids." })),
      touchedFiles: Type.Optional(
        Type.Array(Type.String(), { description: "Recent touched files, if verified." }),
      ),
      recentCommands: Type.Optional(
        Type.Array(Type.String(), { description: "Recent commands, if verified." }),
      ),
      validationReminder: Type.Optional(
        Type.String({ description: "Validation/install/reload reminders, if known." }),
      ),
      nextSuggestedSlice: Type.Optional(
        Type.String({ description: "Smallest truthful next slice, if known." }),
      ),
      evidencePosture: Type.Optional(
        Type.String({ description: "Truthfulness caveat about the evidence source." }),
      ),
      openQuestions: Type.Optional(
        Type.Array(Type.String(), {
          description: "Open questions the fresh session should resolve.",
        }),
      ),
      discoveryRecords: Type.Optional(
        Type.Array(
          Type.Object({
            discovery: Type.Optional(Type.String()),
            source: Type.Optional(Type.String()),
            ownerSurface: Type.Optional(Type.String()),
            promotionStatus: Type.Optional(Type.String()),
            nextPromotionAction: Type.Optional(Type.String()),
            metric: Type.Optional(Type.String()),
            falsifier: Type.Optional(Type.String()),
            nonAuthorization: Type.Optional(Type.String()),
          }),
          {
            description:
              "Structured discovery records that keep each insight linked to its source, owner, promotion status, metric, falsifier, and non-authorization.",
          },
        ),
      ),
      valuableDiscoveries: Type.Optional(
        Type.Array(Type.String(), {
          description:
            "Legacy/convenience list of strategic session-only insights that should survive reload, such as subagent findings, deep-review conclusions, operator corrections, owner routes, or many-of-the-greats lenses.",
        }),
      ),
      promotionStatus: Type.Optional(
        Type.Array(Type.String(), {
          description:
            "Whether supplied discoveries were promoted to owner surfaces, intentionally deferred, or still need exact promotion action.",
        }),
      ),
      ownerSurfaces: Type.Optional(
        Type.Array(Type.String(), {
          description:
            "Owner surfaces for the discoveries, for example ASC/self, pi-session-compaction, Prompt Vault, ROCS, AK, or package docs.",
        }),
      ),
      metrics: Type.Optional(
        Type.Array(Type.String(), {
          description: "Metrics that would make the handoff's next action measurable.",
        }),
      ),
      falsifiers: Type.Optional(
        Type.Array(Type.String(), {
          description:
            "Conditions that would prove the suggested continuation or discovery interpretation wrong.",
        }),
      ),
      nonAuthorizations: Type.Optional(
        Type.Array(Type.String(), {
          description:
            "Actions this handoff explicitly does not authorize, such as AK/KES/evidence writes, candidate promotion, ontology changes, or commits.",
        }),
      ),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const handoff = buildSessionCompactionHandoffToolResult(params, ctx);
      const didPrefill = handoff.shouldPrefill && ctx.hasUI;
      if (didPrefill) {
        ctx.ui.setEditorText(handoff.prompt);
      }
      return {
        content: [
          {
            type: "text",
            text: didPrefill
              ? "Fresh-session handoff prompt prefilled by pi-session-compaction."
              : handoff.prompt,
          },
        ],
        details: {
          ...handoff,
          prefill: didPrefill,
        },
      };
    },
  });

  return result;
}
