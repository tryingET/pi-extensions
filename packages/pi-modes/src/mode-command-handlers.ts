import type { ExtensionAPI, ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import {
  confirmExact,
  confirmProjectModes,
  createConfirmActivation,
  type ProjectApprovalStore,
  projectApprovalsToAsk,
} from "./mode-activation-gate.ts";
import { registerModeAuthoringCommands } from "./mode-authoring-commands.ts";
import { compactCompositionSummary } from "./mode-observability.ts";
import { handlePresetCommand } from "./mode-preset-commands.ts";
import type { LoadedModePresets } from "./mode-presets.ts";
import { registerModePreviewCommand } from "./mode-preview-command.ts";
import { approvalsFor, reportFor, writeMachineOutput } from "./mode-reports.ts";
import { selectModeComposition } from "./mode-selector.ts";
import {
  type DefinitionFingerprints,
  type DriftPolicy,
  formatDiagnostic,
  formatDiagnostics,
  type LoadedModes,
  type ModeSelection,
  type ModeStateV3,
  modeSelectionsEqual,
  resolutionPolicy,
  resolveModeSelection,
  selectedKeys,
} from "./modes.ts";
import { unconfirmedProjectModes } from "./project-mode-approvals.ts";
import {
  modeArgumentCompletions,
  parseActivationFlags,
  parseDirectSelection,
  requiresReplaceFinalConfirmation,
  selectionDefinitionFingerprint,
  selectionLabel,
} from "./selection-commands.ts";

export const MODE_STATUS_ENTRY_TYPE = "pi-mode-status.v3";

export interface ModeStatusEntryData {
  summary: string;
  available: string[];
  details: string[];
  diagnostics: string[];
}

export interface ModeCommandServices extends ProjectApprovalStore {
  currentModes(ctx: ExtensionCommandContext): LoadedModes;
  currentPresets(ctx: ExtensionCommandContext): LoadedModePresets;
  replay(
    ctx: ExtensionCommandContext,
    modes: LoadedModes["modes"],
  ): {
    selection: ModeSelection;
    diagnostics: Array<{ key?: string; message: string }>;
    state?: ModeStateV3;
  };
  persist(
    selection: ModeSelection,
    ctx: ExtensionCommandContext,
    source: ModeStateV3["source"],
    message?: string,
    options?: {
      fingerprints?: DefinitionFingerprints;
      driftPolicy?: DriftPolicy;
      expectedDefinitionFingerprint?: string;
    },
  ): void;
  reapprove(ctx: ExtensionCommandContext, expectedDefinitionFingerprint: string): void;
  setPolicy(ctx: ExtensionCommandContext, policy: DriftPolicy): void;
  updateStatus(ctx: ExtensionCommandContext): void;
  globalModeDir: string;
  projectModeDir(ctx: ExtensionCommandContext): string;
  globalPresetDir: string;
  projectPresetDir(ctx: ExtensionCommandContext): string;
  cachedModes(): LoadedModes["modes"];
  activeSelection(): ModeSelection;
}

function reportError(ctx: ExtensionCommandContext, message: string): void {
  if (ctx.mode === "tui") ctx.ui.notify(message, "error");
  else throw new Error(message);
}

export function registerModeCommands(pi: ExtensionAPI, services: ModeCommandServices): void {
  const confirmActivation = createConfirmActivation(services);
  pi.registerCommand("mode", {
    description: "Compose prompt modes or manage named compositions",
    getArgumentCompletions: (prefix) =>
      [
        ...modeArgumentCompletions(prefix, services.cachedModes(), services.activeSelection()),
        ...["save ", "use ", "export ", "import ", "presets"].filter((value) =>
          value.startsWith(prefix.toLowerCase()),
        ),
      ].map((value) => ({ value, label: value })),
    handler: async (args, ctx) => {
      try {
        const trimmed = args.trim();
        const [operation = "", ...rest] = trimmed.split(/\s+/);
        if (
          await handlePresetCommand(
            operation.toLowerCase(),
            rest.join(" "),
            ctx,
            services,
            confirmActivation,
          )
        )
          return;
        const loaded = services.currentModes(ctx);
        const replayed = services.replay(ctx, loaded.modes);
        if (!trimmed) {
          if (ctx.mode !== "tui")
            throw new Error("The /mode selector requires TUI mode; use direct syntax");
          // The valid part of the selection, minus definitions that changed while blocked, which the
          // operator checks again to accept. Trust is not considered: a mode waiting for
          // confirmation stays checked. Either way, applying keeps the modes around them.
          const structural = resolveModeSelection(replayed.selection, loaded.modes);
          const drift = resolveModeSelection(
            replayed.selection,
            loaded.modes,
            resolutionPolicy(replayed.state),
          );
          const unchecked = new Set(drift.blocked ? drift.driftedKeys : []);
          const initial = {
            baseKey:
              structural.base && !unchecked.has(structural.base.key) ? structural.base.key : null,
            overlayKeys: structural.overlays
              .map((mode) => mode.key)
              .filter((key) => !unchecked.has(key)),
          };
          const draft = await selectModeComposition(ctx, loaded.modes, initial, {
            preview: (selection) => {
              const report = reportFor(ctx, selection, undefined, loaded.modes, false, "review");
              return [
                compactCompositionSummary(report),
                `Δ host: ${report.composition.hostDeltaBytes >= 0 ? "+" : ""}${report.composition.hostDeltaBytes} B`,
                ...report.diagnostics,
              ];
            },
          });
          if (!draft) return;
          const originalFingerprint = selectionDefinitionFingerprint(draft, loaded.modes);
          const fresh = services.currentModes(ctx);
          const checked = resolveModeSelection(draft, fresh.modes);
          if (
            checked.diagnostics.length > 0 ||
            checked.blocked ||
            originalFingerprint !== selectionDefinitionFingerprint(draft, fresh.modes)
          ) {
            throw new Error(
              "Mode definitions changed or the draft is invalid; reopen the selector",
            );
          }
          const confirmedFingerprint = selectionDefinitionFingerprint(draft, fresh.modes);
          // Measured against what the selector showed, so a mode checked again there is asked about.
          if (
            !(await confirmActivation(
              ctx,
              initial,
              draft,
              fresh.modes,
              { exact: false, project: false },
              replayed.state?.fingerprints,
            ))
          )
            return;
          services.persist(draft, ctx, "selector", undefined, {
            expectedDefinitionFingerprint: confirmedFingerprint,
          });
          return;
        }
        const parsed = parseDirectSelection(trimmed, loaded.modes, replayed.selection);
        if (!parsed.selection) throw new Error(parsed.error ?? "Invalid mode selection");
        const sameSelection = modeSelectionsEqual(parsed.selection, replayed.selection);
        const activeResolution = resolveModeSelection(
          replayed.selection,
          loaded.modes,
          resolutionPolicy(replayed.state),
        );
        const confirmedFingerprint = selectionDefinitionFingerprint(parsed.selection, loaded.modes);
        if (
          !(await confirmActivation(
            ctx,
            replayed.selection,
            parsed.selection,
            loaded.modes,
            { exact: parsed.confirmExact ?? false, project: parsed.confirmProject ?? false },
            replayed.state?.fingerprints,
          ))
        )
          return;
        if (!sameSelection || activeResolution.driftedKeys.length > 0) {
          services.persist(
            parsed.selection,
            ctx,
            "command",
            activeResolution.driftedKeys.length > 0
              ? "Reactivated prompt modes with current definitions"
              : undefined,
            { expectedDefinitionFingerprint: confirmedFingerprint },
          );
        } else {
          // --confirm-project may just have recorded a confirmation for the active selection; the
          // files may also have changed while its dialog was open.
          const fresh = services.currentModes(ctx);
          services.updateStatus(ctx);
          if (
            confirmedFingerprint !== selectionDefinitionFingerprint(parsed.selection, fresh.modes)
          ) {
            throw new Error(
              "Mode definitions changed after confirmation; preview and confirm the selection again",
            );
          }
          if (ctx.mode !== "tui") return;
          const now = resolveModeSelection(
            replayed.selection,
            fresh.modes,
            resolutionPolicy(
              replayed.state,
              approvalsFor(services, replayed.selection, fresh.modes),
            ),
          );
          ctx.ui.notify(
            now.blocked
              ? `Prompt modes already selected but blocked: ${formatDiagnostics(now.diagnostics)}`
              : `Prompt modes already active: ${selectionLabel(replayed.selection)}`,
            now.blocked ? "warning" : "info",
          );
        }
      } catch (error) {
        reportError(ctx, error instanceof Error ? error.message : String(error));
      }
    },
  });

  pi.registerCommand("mode-reapprove", {
    description: "Explicitly accept current definitions and refresh fingerprints",
    getArgumentCompletions: (prefix) =>
      ["--confirm-exact", "--confirm-project"]
        .filter((value) => value.startsWith(prefix.trim().toLowerCase()))
        .map((value) => ({ value, label: value })),
    handler: async (args, ctx) => {
      try {
        const flags = parseActivationFlags(args.trim().split(/\s+/).filter(Boolean));
        if (flags.error || flags.rest.length > 0) {
          throw new Error("Usage: /mode-reapprove [--confirm-exact] [--confirm-project]");
        }
        const loaded = services.currentModes(ctx);
        const replayed = services.replay(ctx, loaded.modes);
        // Refused before any question: a reapproval that cannot persist must not ask for trust.
        const structural = resolveModeSelection(replayed.selection, loaded.modes);
        if (structural.blocked || structural.diagnostics.length > 0) {
          throw new Error(
            `Cannot reapprove invalid composition: ${formatDiagnostics(structural.diagnostics)}`,
          );
        }
        const needsExactConfirmation = requiresReplaceFinalConfirmation(
          replayed.selection,
          replayed.selection,
          loaded.modes,
          replayed.state?.fingerprints,
        );
        const confirmedFingerprint = selectionDefinitionFingerprint(
          replayed.selection,
          loaded.modes,
        );
        // Reapproval is where an active project mode whose file changed gets confirmed; with
        // --confirm-project it also makes a startup acknowledgement permanent.
        const unconfirmed = unconfirmedProjectModes(
          selectedKeys(replayed.selection),
          loaded.modes,
          projectApprovalsToAsk(services, loaded.modes, flags.project),
        );
        const { driftedKeys } = resolveModeSelection(
          replayed.selection,
          loaded.modes,
          resolutionPolicy(replayed.state),
        );
        const shown = new Set([
          ...unconfirmed.map((mode) => mode.key),
          ...(needsExactConfirmation && replayed.selection.baseKey
            ? [replayed.selection.baseKey]
            : []),
        ]);
        const unshownDrift = driftedKeys.filter((key) => !shown.has(key));
        if (!(await confirmProjectModes(ctx, services, unconfirmed, flags.project))) return;
        if (
          !(await confirmExact(
            ctx,
            replayed.selection,
            replayed.selection,
            loaded.modes,
            flags.exact,
            replayed.state?.fingerprints,
          ))
        )
          return;
        // Any other change the dialogs above did not show still needs its own confirmation.
        if (
          ctx.mode === "tui" &&
          (unshownDrift.length > 0 || shown.size === 0) &&
          !(await ctx.ui.confirm(
            "Reapprove active prompt mode definitions?",
            unshownDrift.length > 0
              ? `Changed since activation: ${unshownDrift.join(", ")}. Preview first if that was unexpected.`
              : "Preview first if the drift was unexpected.",
          ))
        )
          return;
        if (unconfirmed.length > 0) services.recordProjectModeApprovals(unconfirmed);
        services.reapprove(ctx, confirmedFingerprint);
      } catch (error) {
        reportError(ctx, error instanceof Error ? error.message : String(error));
      }
    },
  });

  pi.registerCommand("mode-policy", {
    description: "Set definition drift policy: block, warn, or allow",
    getArgumentCompletions: (prefix) =>
      ["block", "warn", "allow"]
        .filter((value) => value.startsWith(prefix.trim().toLowerCase()))
        .map((value) => ({ value, label: value })),
    handler: async (args, ctx) => {
      try {
        const policy = args.trim().toLowerCase();
        if (policy !== "block" && policy !== "warn" && policy !== "allow") {
          throw new Error("Usage: /mode-policy <block|warn|allow>");
        }
        if (
          policy !== "block" &&
          ctx.mode === "tui" &&
          !(await ctx.ui.confirm(
            `Use ${policy} drift policy?`,
            "Changed prompt definitions may be applied before explicit reapproval.",
          ))
        )
          return;
        services.setPolicy(ctx, policy);
      } catch (error) {
        reportError(ctx, error instanceof Error ? error.message : String(error));
      }
    },
  });

  pi.registerCommand("mode-status", {
    description: "Show active composition, hashes, provenance, drift, and diagnostics",
    handler: async (args, ctx) => {
      const trimmed = args.trim();
      if (trimmed && trimmed !== "--json") {
        return reportError(ctx, "Usage: /mode-status [--json]");
      }
      const loaded = services.currentModes(ctx);
      const replayed = services.replay(ctx, loaded.modes);
      const report = reportFor(
        ctx,
        replayed.selection,
        replayed.state,
        loaded.modes,
        false,
        approvalsFor(services, replayed.selection, loaded.modes),
      );
      const diagnostics = [
        ...loaded.diagnostics.map((item) => `${item.path}: ${item.message}`),
        ...replayed.diagnostics.map(formatDiagnostic),
        ...report.diagnostics,
      ];
      if (ctx.mode !== "tui" || args.trim() === "--json") {
        writeMachineOutput({
          ...report,
          available: loaded.modes.map((mode) => mode.key),
          diagnostics,
        });
        return;
      }
      pi.appendEntry<ModeStatusEntryData>(MODE_STATUS_ENTRY_TYPE, {
        summary: compactCompositionSummary(report),
        available: loaded.modes.map((mode) => mode.key),
        details: [
          `selected: ${selectionLabel(replayed.selection)}`,
          `activation: ${report.activation.source ?? "legacy"} @ ${report.activation.activatedAt ?? "unknown"}`,
          `drift policy: ${report.activation.driftPolicy ?? "legacy"}`,
          ...report.components.map(
            (component, index) =>
              `${component.role} ${index + 1}: ${component.key} (${component.strategy}/${component.scope}) · ${component.path ?? "built-in"} · sha256:${component.digest.slice(0, 12)}`,
          ),
        ],
        diagnostics,
      });
    },
  });

  registerModePreviewCommand(pi, services);
  registerModeAuthoringCommands(pi, services);
}
