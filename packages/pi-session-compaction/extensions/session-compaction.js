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

  return result;
}
