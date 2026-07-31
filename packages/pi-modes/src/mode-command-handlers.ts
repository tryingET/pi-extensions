import type { ExtensionAPI, ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import { registerModeAuthoringCommands } from "./mode-authoring-commands.ts";
import { compactCompositionSummary, createCompositionReport } from "./mode-observability.ts";
import { handlePresetCommand } from "./mode-preset-commands.ts";
import type { LoadedModePresets } from "./mode-presets.ts";
import { selectModeComposition } from "./mode-selector.ts";
import {
  composeModeSelection,
  type DefinitionFingerprints,
  type DriftPolicy,
  type LoadedModes,
  type ModeSelection,
  type ModeStateV3,
  modeSelectionsEqual,
  resolveModeSelection,
} from "./modes.ts";
import {
  modeArgumentCompletions,
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

export interface ModeCommandServices {
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

async function confirmExact(
  ctx: ExtensionCommandContext,
  current: ModeSelection,
  next: ModeSelection,
  modes: LoadedModes["modes"],
  explicit: boolean,
  approvedFingerprints?: DefinitionFingerprints,
): Promise<boolean> {
  if (!requiresReplaceFinalConfirmation(current, next, modes, approvedFingerprints)) return true;
  const mode = modes.find((candidate) => candidate.key === next.baseKey);
  if (ctx.mode === "tui") {
    return ctx.ui.confirm(
      `Activate exact-final mode ${mode?.label ?? next.baseKey}?`,
      "This removes the host envelope, context, skills, date, cwd, and overlays for future turns.",
    );
  }
  if (explicit) return true;
  throw new Error("replace_final activation requires --confirm-exact in headless/RPC mode");
}

function reportFor(
  ctx: ExtensionCommandContext,
  selection: ModeSelection,
  state: ModeStateV3 | undefined,
  modes: LoadedModes["modes"],
  includePrompt: boolean,
) {
  const hostPrompt = ctx.getSystemPrompt();
  const composed = composeModeSelection(
    selection,
    modes,
    ctx.getSystemPromptOptions(),
    hostPrompt,
    state ? { fingerprints: state.fingerprints, driftPolicy: state.driftPolicy } : {},
  );
  return createCompositionReport({
    selection,
    resolved: composed.resolved,
    prompt: composed.prompt,
    hostPrompt,
    ...(state ? { state } : {}),
    includePrompt,
  });
}

function writeMachineOutput(value: unknown): void {
  console.log(JSON.stringify(value));
}

export function registerModeCommands(pi: ExtensionAPI, services: ModeCommandServices): void {
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
            confirmExact,
          )
        )
          return;
        const loaded = services.currentModes(ctx);
        const replayed = services.replay(ctx, loaded.modes);
        if (!trimmed) {
          if (ctx.mode !== "tui")
            throw new Error("The /mode selector requires TUI mode; use direct syntax");
          const initialResolution = resolveModeSelection(
            replayed.selection,
            loaded.modes,
            replayed.state
              ? {
                  fingerprints: replayed.state.fingerprints,
                  driftPolicy: replayed.state.driftPolicy,
                }
              : {},
          );
          const initial = {
            baseKey: initialResolution.base?.key ?? null,
            overlayKeys: initialResolution.overlays.map((mode) => mode.key),
          };
          const draft = await selectModeComposition(ctx, loaded.modes, initial, {
            preview: (selection) => {
              const report = reportFor(ctx, selection, undefined, loaded.modes, false);
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
          if (
            !(await confirmExact(
              ctx,
              replayed.selection,
              draft,
              fresh.modes,
              false,
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
          replayed.state
            ? {
                fingerprints: replayed.state.fingerprints,
                driftPolicy: replayed.state.driftPolicy,
              }
            : {},
        );
        const confirmedFingerprint = selectionDefinitionFingerprint(parsed.selection, loaded.modes);
        if (
          !(await confirmExact(
            ctx,
            replayed.selection,
            parsed.selection,
            loaded.modes,
            parsed.confirmExact ?? false,
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
        } else if (ctx.mode === "tui") {
          ctx.ui.notify(
            `Prompt modes already active: ${selectionLabel(replayed.selection)}`,
            "info",
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
      ["--confirm-exact"]
        .filter((value) => value.startsWith(prefix.trim().toLowerCase()))
        .map((value) => ({ value, label: value })),
    handler: async (args, ctx) => {
      try {
        const trimmed = args.trim().toLowerCase();
        if (trimmed && trimmed !== "--confirm-exact") {
          throw new Error("Usage: /mode-reapprove [--confirm-exact]");
        }
        const loaded = services.currentModes(ctx);
        const replayed = services.replay(ctx, loaded.modes);
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
        if (
          needsExactConfirmation &&
          !(await confirmExact(
            ctx,
            replayed.selection,
            replayed.selection,
            loaded.modes,
            trimmed === "--confirm-exact",
            replayed.state?.fingerprints,
          ))
        )
          return;
        if (
          !needsExactConfirmation &&
          ctx.mode === "tui" &&
          !(await ctx.ui.confirm(
            "Reapprove active prompt mode definitions?",
            "Preview first if the drift was unexpected.",
          ))
        )
          return;
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
      const report = reportFor(ctx, replayed.selection, replayed.state, loaded.modes, false);
      const diagnostics = [
        ...loaded.diagnostics.map((item) => `${item.path}: ${item.message}`),
        ...replayed.diagnostics.map((item) => `${item.key ? `${item.key}: ` : ""}${item.message}`),
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
        const report = reportFor(ctx, parsed.selection, state, loaded.modes, true);
        if (json) writeMachineOutput(report);
        else {
          ctx.ui.notify(compactCompositionSummary(report), report.blocked ? "warning" : "info");
          await ctx.ui.editor(`Preview: ${selectionLabel(report.effective)}`, report.prompt ?? "");
        }
      } catch (error) {
        reportError(ctx, error instanceof Error ? error.message : String(error));
      }
    },
  });

  registerModeAuthoringCommands(pi, services);
}
