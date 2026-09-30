import { join } from "node:path";
import {
  CONFIG_DIR_NAME,
  type ExtensionAPI,
  type ExtensionCommandContext,
  type ExtensionContext,
  getAgentDir,
} from "@earendil-works/pi-coding-agent";
import { Box, Text } from "@earendil-works/pi-tui";
import {
  MODE_STATUS_ENTRY_TYPE,
  type ModeCommandServices,
  type ModeStatusEntryData,
  registerModeCommands,
} from "../src/mode-command-handlers.ts";
import { ancestorPresetDirectories, loadModePresets } from "../src/mode-presets.ts";
import { selectedKeys } from "../src/mode-state.ts";
import {
  ancestorModeDirectories,
  BUILTIN_MODES,
  cloneModeSelection,
  composeModeSelection,
  createModeState,
  EMPTY_MODE_SELECTION,
  formatDiagnostics,
  type LoadedModes,
  loadModes,
  MODE_STATE_TYPE_V3,
  type ModeSelection,
  type ModeStateV3,
  type ResolvedMode,
  resolutionPolicy,
  resolveInitialSelection,
  resolveModeSelection,
  type SelectionDiagnostic,
  selectionFromEntries,
} from "../src/modes.ts";
import {
  describeProjectModes,
  displaySafe,
  PROJECT_MODE_APPROVALS_FILE,
  projectApprovalDigest,
  readProjectModeApprovals,
  recordProjectModeApprovals,
  unconfirmedProjectModes,
} from "../src/project-mode-approvals.ts";
import { PI_HOST_COMPATIBILITY } from "../src/prompt-composition.ts";
export { PI_HOST_COMPATIBILITY };

import { selectionDefinitionFingerprint, selectionLabel } from "../src/selection-commands.ts";

type AnyContext = ExtensionContext | ExtensionCommandContext;

// Project definitions accepted with PI_MODE_CONFIRM_PROJECT=1 at startup: kept for the process only
// (never recorded), and on globalThis so /reload, which re-imports this module, keeps them.
const SESSION_ACKNOWLEDGEMENTS = Symbol.for("tryinget.pi.modes.project-acknowledgements.v1");
function acknowledgedForProcess(): Map<string, string> {
  const store = globalThis as { [SESSION_ACKNOWLEDGEMENTS]?: Map<string, string> };
  store[SESSION_ACKNOWLEDGEMENTS] ??= new Map();
  return store[SESSION_ACKNOWLEDGEMENTS];
}

// Outside modes/, which is read as mode definitions.
function approvalsPath(): string {
  return join(getAgentDir(), PROJECT_MODE_APPROVALS_FILE);
}

function directories(ctx: AnyContext) {
  return {
    globalModeDir: join(getAgentDir(), "modes"),
    projectModeDir: join(ctx.cwd, CONFIG_DIR_NAME, "modes"),
    projectModeDirs: ancestorModeDirectories(ctx.cwd, CONFIG_DIR_NAME),
    globalPresetDir: join(getAgentDir(), "mode-presets"),
    projectPresetDir: join(ctx.cwd, CONFIG_DIR_NAME, "mode-presets"),
    projectPresetDirs: ancestorPresetDirectories(ctx.cwd, CONFIG_DIR_NAME),
  };
}

export default function modeExtension(pi: ExtensionAPI) {
  let activeSelection = cloneModeSelection(EMPTY_MODE_SELECTION);
  let cachedModes: ResolvedMode[] = BUILTIN_MODES.map((mode) => ({
    ...mode,
    scope: "builtin" as const,
  }));
  const warnedDiagnostics = new Set<string>();

  // Recorded confirmations, plus this process's startup acknowledgements where they still match the
  // current definition: a stale acknowledgement must not hide a newer recorded confirmation.
  function projectApprovals(modes: readonly ResolvedMode[]): Map<string, string> {
    const approvals = readProjectModeApprovals(approvalsPath());
    const acknowledged = acknowledgedForProcess();
    for (const mode of modes) {
      if (!mode.path || !acknowledged.has(mode.path)) continue;
      const digest = projectApprovalDigest(mode);
      if (acknowledged.get(mode.path) === digest) approvals.set(mode.path, digest);
    }
    return approvals;
  }

  pi.registerEntryRenderer<ModeStatusEntryData>(
    MODE_STATUS_ENTRY_TYPE,
    (entry, { expanded }, theme) => {
      const data = entry.data ?? {
        summary: "status unavailable",
        available: [],
        details: [],
        diagnostics: [],
      };
      const lines = [
        `${theme.fg("accent", "[mode]")} ${data.summary}`,
        theme.fg(
          "dim",
          `${data.available.length} available · ${data.diagnostics.length} diagnostic(s)`,
        ),
      ];
      if (expanded) {
        lines.push(...data.details.map((line) => theme.fg("muted", line)));
        if (data.available.length > 0)
          lines.push(theme.fg("dim", `available: ${data.available.join(", ")}`));
        lines.push(...data.diagnostics.map((line) => theme.fg("warning", `warning: ${line}`)));
        lines.push(theme.fg("dim", `supported Pi host: ${PI_HOST_COMPATIBILITY}`));
      }
      const box = new Box(1, 1, (text) => theme.bg("customMessageBg", text));
      box.addChild(new Text(lines.join("\n"), 0, 0));
      return box;
    },
  );

  function currentModes(ctx: AnyContext): LoadedModes {
    const dirs = directories(ctx);
    const loaded = loadModes({
      globalDir: dirs.globalModeDir,
      projectDir: dirs.projectModeDir,
      projectDirs: dirs.projectModeDirs,
      projectTrusted: ctx.isProjectTrusted(),
    });
    cachedModes = loaded.modes;
    return loaded;
  }

  function replay(ctx: AnyContext, modes = currentModes(ctx).modes) {
    return selectionFromEntries(ctx.sessionManager.getBranch(), modes);
  }

  // Callers that already loaded the modes, replayed the branch or read the approvals pass them in.
  function updateStatus(
    ctx: AnyContext,
    known: {
      loaded?: LoadedModes;
      replayed?: ReturnType<typeof replay>;
      approvals?: ReadonlyMap<string, string>;
    } = {},
  ): void {
    if (!ctx.hasUI) return;
    const loaded = known.loaded ?? currentModes(ctx);
    const replayed = known.replayed ?? replay(ctx, loaded.modes);
    activeSelection = replayed.selection;
    if (!activeSelection.baseKey && activeSelection.overlayKeys.length === 0) {
      ctx.ui.setStatus("pi-modes", undefined);
      return;
    }
    const resolved = resolveModeSelection(
      replayed.selection,
      loaded.modes,
      resolutionPolicy(replayed.state, known.approvals ?? projectApprovals(loaded.modes)),
    );
    const effective: ModeSelection = {
      baseKey: resolved.base?.key ?? null,
      overlayKeys: resolved.overlays.map((mode) => mode.key),
    };
    const warning = resolved.blocked || resolved.diagnostics.length > 0;
    ctx.ui.setStatus(
      "pi-modes",
      ctx.ui.theme.fg(
        warning ? "warning" : "accent",
        `mode:${selectionLabel(effective)}${warning ? " !" : ""}`,
      ),
    );
  }

  function persistSelection(
    selection: ModeSelection,
    ctx: AnyContext,
    source: ModeStateV3["source"],
    message?: string,
    options: {
      fingerprints?: ModeStateV3["fingerprints"];
      driftPolicy?: ModeStateV3["driftPolicy"];
      expectedDefinitionFingerprint?: string;
    } = {},
  ): void {
    const loaded = currentModes(ctx);
    if (
      options.expectedDefinitionFingerprint !== undefined &&
      options.expectedDefinitionFingerprint !==
        selectionDefinitionFingerprint(selection, loaded.modes)
    ) {
      throw new Error(
        "Mode definitions changed after confirmation; preview and confirm the selection again",
      );
    }
    const resolution = resolveModeSelection(selection, loaded.modes);
    if (resolution.blocked || resolution.diagnostics.length > 0) {
      throw new Error(`Invalid mode composition: ${formatDiagnostics(resolution.diagnostics)}`);
    }
    const state = createModeState(selection, loaded.modes, source, {
      ...(options.fingerprints ? { fingerprints: options.fingerprints } : {}),
      ...(options.driftPolicy ? { driftPolicy: options.driftPolicy } : {}),
    });
    pi.appendEntry(MODE_STATE_TYPE_V3, state);
    activeSelection = cloneModeSelection(selection);
    const approvals = projectApprovals(loaded.modes);
    updateStatus(ctx, { loaded, approvals });
    if (!ctx.hasUI) return;
    const done = message ?? `Prompt modes activated: ${selectionLabel(selection)}`;
    // Recorded, but a project mode waiting for confirmation still keeps the composition blocked.
    const unconfirmed = unconfirmedProjectModes(selectedKeys(selection), loaded.modes, approvals);
    if (unconfirmed.length === 0) ctx.ui.notify(done, "info");
    else
      ctx.ui.notify(
        `${done}, but not used until confirmed: ${describeProjectModes(unconfirmed)}. Review with /mode-preview, then run /mode-reapprove`,
        "warning",
      );
  }

  // /mode-reapprove validated the composition before asking; persistSelection checks it again.
  function reapprove(ctx: AnyContext, expectedDefinitionFingerprint: string): void {
    const replayed = replay(ctx);
    persistSelection(
      replayed.selection,
      ctx,
      "reapprove",
      "Reapproved active prompt mode definitions",
      {
        expectedDefinitionFingerprint,
        ...(replayed.state ? { driftPolicy: replayed.state.driftPolicy } : {}),
      },
    );
  }

  function setPolicy(ctx: AnyContext, policy: ModeStateV3["driftPolicy"]): void {
    const loaded = currentModes(ctx);
    const replayed = replay(ctx, loaded.modes);
    const resolution = resolveModeSelection(replayed.selection, loaded.modes);
    if (resolution.blocked || resolution.diagnostics.length > 0) {
      throw new Error(
        `Cannot set drift policy for an invalid composition: ${formatDiagnostics(resolution.diagnostics)}`,
      );
    }
    const state = createModeState(replayed.selection, loaded.modes, "policy", {
      driftPolicy: policy,
      ...(replayed.state ? { fingerprints: replayed.state.fingerprints } : {}),
    });
    pi.appendEntry(MODE_STATE_TYPE_V3, state);
    activeSelection = cloneModeSelection(replayed.selection);
    updateStatus(ctx);
    if (ctx.hasUI) ctx.ui.notify(`Prompt definition drift policy: ${policy}`, "info");
  }

  const services: ModeCommandServices = {
    currentModes: (ctx) => currentModes(ctx),
    currentPresets: (ctx) => {
      const dirs = directories(ctx);
      return loadModePresets({
        globalDir: dirs.globalPresetDir,
        projectDirs: dirs.projectPresetDirs,
        projectTrusted: ctx.isProjectTrusted(),
      });
    },
    replay: (ctx, modes) => replay(ctx, modes),
    persist: (selection, ctx, source, message, options) =>
      persistSelection(selection, ctx, source, message, options),
    reapprove: (ctx, expectedDefinitionFingerprint) =>
      reapprove(ctx, expectedDefinitionFingerprint),
    setPolicy: (ctx, policy) => setPolicy(ctx, policy),
    updateStatus: (ctx) => updateStatus(ctx),
    globalModeDir: join(getAgentDir(), "modes"),
    projectModeDir: (ctx) => directories(ctx).projectModeDir,
    globalPresetDir: join(getAgentDir(), "mode-presets"),
    projectPresetDir: (ctx) => directories(ctx).projectPresetDir,
    cachedModes: () => cachedModes,
    activeSelection: () => cloneModeSelection(activeSelection),
    projectModeApprovals: (modes) => projectApprovals(modes),
    recordProjectModeApprovals: (modes) => recordProjectModeApprovals(approvalsPath(), modes),
  };
  registerModeCommands(pi, services);

  pi.on("session_start", async (event, ctx) => {
    warnedDiagnostics.clear();
    if (typeof ctx.getSystemPrompt !== "function") {
      const warning = `pi-modes requires Pi ${PI_HOST_COMPATIBILITY}; prompt composition APIs are unavailable`;
      if (ctx.hasUI) ctx.ui.notify(warning, "error");
      else console.error(warning);
      return;
    }
    const loaded = currentModes(ctx);
    const replayed = replay(ctx, loaded.modes);
    const initial = resolveInitialSelection({
      applyEnvironment: event.reason === "startup",
      environmentValue: process.env.PI_MODE,
      compositionEnvironmentValue: process.env.PI_MODES,
      sessionSelection: replayed.selection,
      modes: loaded.modes,
    });
    activeSelection = initial.selection;

    if (initial.source === "environment") {
      const resolution = resolveModeSelection(initial.selection, loaded.modes);
      const exactConfirmationMissing =
        resolution.base?.promptStrategy === "replace_final" &&
        process.env.PI_MODE_CONFIRM_EXACT !== "1";
      // A startup key can resolve to a project file that shadows the mode the operator meant.
      const unconfirmedProject = unconfirmedProjectModes(
        selectedKeys(initial.selection),
        loaded.modes,
        projectApprovals(loaded.modes),
      );
      const projectAcknowledged = process.env.PI_MODE_CONFIRM_PROJECT === "1";
      const projectConfirmationMissing = unconfirmedProject.length > 0 && !projectAcknowledged;
      const fallback =
        resolution.blocked ||
        resolution.diagnostics.length > 0 ||
        exactConfirmationMissing ||
        projectConfirmationMissing;
      if (!fallback) {
        // Acknowledged for this run only: a blanket flag must not approve files for later sessions.
        for (const mode of unconfirmedProject) {
          if (mode.path) acknowledgedForProcess().set(mode.path, projectApprovalDigest(mode));
        }
      }
      const safeSelection = fallback ? cloneModeSelection(EMPTY_MODE_SELECTION) : initial.selection;
      // Every reason at once, so confirming a mode does not uncover a composition error only then.
      const reasons = [
        ...(resolution.blocked || resolution.diagnostics.length > 0
          ? [`Startup composition is invalid: ${formatDiagnostics(resolution.diagnostics)}`]
          : []),
        ...(exactConfirmationMissing
          ? ["Startup replace_final activation requires PI_MODE_CONFIRM_EXACT=1"]
          : []),
        ...(projectConfirmationMissing
          ? [
              `Startup project mode(s) not confirmed: ${describeProjectModes(unconfirmedProject)}; confirm once with /mode, or set PI_MODE_CONFIRM_PROJECT=1 to accept them for this run`,
            ]
          : []),
      ];
      const startupError = initial.error ?? (reasons.length > 0 ? reasons.join("; ") : undefined);
      pi.appendEntry(MODE_STATE_TYPE_V3, createModeState(safeSelection, loaded.modes, "startup"));
      activeSelection = safeSelection;
      const startupMessage = startupError
        ? `${startupError}; using native SYSTEM.md/host base`
        : `Startup prompt modes: ${selectionLabel(safeSelection)}`;
      if (ctx.hasUI) ctx.ui.notify(startupMessage, startupError ? "warning" : "info");
      else if (startupError) console.warn(startupMessage);
    } else if (replayed.stateVersion === "v1" || replayed.stateVersion === "v2") {
      const resolution = resolveModeSelection(replayed.selection, loaded.modes);
      const safeSelection =
        resolution.blocked || resolution.diagnostics.length > 0
          ? cloneModeSelection(EMPTY_MODE_SELECTION)
          : replayed.selection;
      pi.appendEntry(MODE_STATE_TYPE_V3, createModeState(safeSelection, loaded.modes, "migration"));
      activeSelection = safeSelection;
      const warning =
        safeSelection === replayed.selection
          ? `Migrated legacy prompt mode state to fingerprinted v3: ${selectionLabel(safeSelection)}`
          : "Legacy prompt mode state was invalid and migrated to native host";
      if (ctx.hasUI) ctx.ui.notify(warning, resolution.diagnostics.length > 0 ? "warning" : "info");
      else console.warn(warning);
    }
    updateStatus(ctx);
    if (ctx.hasUI && loaded.diagnostics.length > 0) {
      ctx.ui.notify(
        `pi-modes skipped ${loaded.diagnostics.length} invalid mode file(s); run /mode-status`,
        "warning",
      );
    }
  });

  pi.on("before_agent_start", async (event, ctx) => {
    const loaded = currentModes(ctx);
    const replayed = replay(ctx, loaded.modes);
    // Enforced here, where prompt text reaches the model: activation commands only record
    // confirmations, so no path (drift policy, migration, resume, older sessions) bypasses it. The
    // record is read only when a selected mode is project-scoped.
    const projectSelected = selectedKeys(replayed.selection).some(
      (key) => loaded.modes.find((mode) => mode.key === key)?.scope === "project",
    );
    const approvals = projectSelected ? projectApprovals(loaded.modes) : new Map<string, string>();
    activeSelection = replayed.selection;
    updateStatus(ctx, { loaded, replayed, approvals });
    const composed = composeModeSelection(
      replayed.selection,
      loaded.modes,
      event.systemPromptOptions,
      event.systemPrompt,
      approvals,
      resolutionPolicy(replayed.state),
    );
    const diagnostics: SelectionDiagnostic[] = [
      ...loaded.diagnostics.map((item) => ({
        message: displaySafe(`${item.path}: ${item.message}`),
      })),
      ...replayed.diagnostics,
      ...composed.resolved.diagnostics,
    ];
    for (const diagnostic of diagnostics) {
      const signature = `${diagnostic.key ?? "selection"}:${diagnostic.message}`;
      if (!warnedDiagnostics.has(signature)) {
        warnedDiagnostics.add(signature);
        const warning = `Prompt mode warning${diagnostic.key ? ` (${diagnostic.key})` : ""}: ${diagnostic.message}`;
        if (ctx.hasUI) ctx.ui.notify(warning, "warning");
        else console.warn(warning);
      }
    }
    if (!replayed.selection.baseKey && replayed.selection.overlayKeys.length === 0) return;
    return { systemPrompt: composed.prompt };
  });
}
