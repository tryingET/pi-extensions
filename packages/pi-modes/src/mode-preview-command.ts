/**
summary: "/mode-preview: what the current files compose, shown inertly, and what the model gets now."
read_when:
  - "Changing how a composition is previewed for review before activation or confirmation."
*/
import type { ExtensionAPI, ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import type { ModeCommandServices } from "./mode-command-handlers.ts";
import { compactCompositionSummary } from "./mode-observability.ts";
import { approvalsFor, reportFor, writeMachineOutput } from "./mode-reports.ts";
import {
  formatDiagnostic,
  modeSelectionsEqual,
  resolutionPolicy,
  resolveModeSelection,
} from "./modes.ts";
import { parseDirectSelection, selectionLabel } from "./selection-commands.ts";
import { revealHidden } from "./untrusted-text.ts";

function reportError(ctx: ExtensionCommandContext, message: string): void {
  if (ctx.mode === "tui") ctx.ui.notify(message, "error");
  else throw new Error(message);
}

export function registerModePreviewCommand(pi: ExtensionAPI, services: ModeCommandServices): void {
  pi.registerCommand("mode-preview", {
    description: "Preview prompt composition; use --json for machine-readable output",
    handler: async (args, ctx) => {
      try {
        const loaded = services.currentModes(ctx);
        const replayed = services.replay(ctx, loaded.modes);
        const tokens = args.trim().split(/\s+/).filter(Boolean);
        const json = tokens.includes("--json") || ctx.mode !== "tui";
        const selectionArgs = tokens.filter((token) => token !== "--json").join(" ");
        const parsed = selectionArgs
          ? parseDirectSelection(selectionArgs, loaded.modes, replayed.selection)
          : { selection: replayed.selection };
        if (!parsed.selection) throw new Error(parsed.error ?? "Invalid preview selection");
        const state = modeSelectionsEqual(parsed.selection, replayed.selection)
          ? replayed.state
          : undefined;
        // The prompt shown is what the files compose now, so a changed or unconfirmed prompt can be
        // read before accepting it. `blocked`, `driftedKeys` and `diagnostics` say what the model
        // gets now, with the recorded drift state and confirmations applied.
        const shown = reportFor(ctx, parsed.selection, state, loaded.modes, true, "review", {
          applyDrift: false,
        });
        const now = resolveModeSelection(
          parsed.selection,
          loaded.modes,
          resolutionPolicy(state, approvalsFor(services, parsed.selection, loaded.modes)),
        );
        // The files' own problems (conflicts, exclusivity) and what blocks the model now; a trust or
        // drift block returns before the constraint checks, so both lists are needed.
        const note = shown.blocked
          ? "the files do not compose as selected; the prompt shown is the host prompt"
          : now.blocked
            ? "the model does not get this composition as things stand; the prompt shown is what the files compose"
            : undefined;
        const report = {
          ...shown,
          blocked: now.blocked || shown.blocked,
          driftedKeys: [...now.driftedKeys],
          diagnostics: [
            ...new Set([...shown.diagnostics, ...now.diagnostics.map(formatDiagnostic)]),
            ...(note ? [note] : []),
          ],
        };
        if (json) writeMachineOutput(report);
        else {
          // Diagnostics name what changed or is waiting for confirmation; their paths are safe.
          ctx.ui.notify(
            [compactCompositionSummary(report), ...report.diagnostics].join("\n"),
            report.blocked || report.diagnostics.length > 0 ? "warning" : "info",
          );
          // Repository text, shown inertly: escape sequences and invisible characters spelled out.
          const hidden = report.composition.hiddenCharacters;
          await ctx.ui.editor(
            `Preview: ${selectionLabel(report.effective)}${hidden > 0 ? ` · ${hidden} hidden character${hidden === 1 ? "" : "s"} in the whole prompt, shown as ⟨U+…⟩ or ⟨tags "…"⟩` : ""}`,
            revealHidden(report.prompt ?? ""),
          );
        }
      } catch (error) {
        reportError(ctx, error instanceof Error ? error.message : String(error));
      }
    },
  });
}
