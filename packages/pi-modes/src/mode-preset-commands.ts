import { existsSync } from "node:fs";
import type { ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import { parseScopedArguments } from "./mode-authoring.ts";
import type { ModeCommandServices } from "./mode-command-handlers.ts";
import {
  decodePreset,
  encodePreset,
  type ModePreset,
  parseModePreset,
  presetExportText,
  presetPath,
  saveModePreset,
} from "./mode-presets.ts";
import {
  cloneModeSelection,
  type DefinitionFingerprints,
  type LoadedModes,
  type ModeSelection,
  resolveModeSelection,
} from "./modes.ts";
import { selectionDefinitionFingerprint } from "./selection-commands.ts";

export type ConfirmExact = (
  ctx: ExtensionCommandContext,
  current: ModeSelection,
  next: ModeSelection,
  modes: LoadedModes["modes"],
  explicit: boolean,
  approvedFingerprints?: DefinitionFingerprints,
) => Promise<boolean>;

function writeMachineOutput(value: unknown): void {
  console.log(JSON.stringify(value));
}

export async function handlePresetCommand(
  operation: string,
  rest: string,
  ctx: ExtensionCommandContext,
  services: ModeCommandServices,
  confirmExact: ConfirmExact,
): Promise<boolean> {
  if (!["save", "use", "export", "import", "presets"].includes(operation)) return false;
  const loaded = services.currentModes(ctx);
  const replayed = services.replay(ctx, loaded.modes);
  const presets = services.currentPresets(ctx);
  if (operation === "presets") {
    if (rest.trim()) throw new Error("Usage: /mode presets");
    const payload = {
      schemaVersion: 1,
      presets: presets.presets.map((preset) => ({
        key: preset.key,
        label: preset.label,
        scope: preset.scope,
        path: preset.path,
        selection: preset.selection,
      })),
      diagnostics: presets.diagnostics,
    };
    if (ctx.mode === "tui") {
      await ctx.ui.editor("Prompt mode presets", JSON.stringify(payload, null, 2));
    } else writeMachineOutput(payload);
    return true;
  }
  const scoped = parseScopedArguments(rest);
  const tokens = scoped.rest.split(/\s+/).filter(Boolean);
  const key = tokens[0]?.toLowerCase() ?? "";
  if (!key) throw new Error(`Usage: /mode ${operation} [--project] <preset-key>`);

  if (operation === "save") {
    if (tokens.length !== 1) throw new Error("Usage: /mode save [--project] <preset-key>");
    const resolution = resolveModeSelection(
      replayed.selection,
      loaded.modes,
      replayed.state
        ? { fingerprints: replayed.state.fingerprints, driftPolicy: replayed.state.driftPolicy }
        : {},
    );
    if (resolution.blocked || resolution.diagnostics.length > 0) {
      throw new Error(
        `Cannot save invalid composition: ${resolution.diagnostics.map((item) => item.message).join("; ")}`,
      );
    }
    if (scoped.scope === "project" && !ctx.isProjectTrusted()) {
      throw new Error("Project presets require a trusted project");
    }
    const dir =
      scoped.scope === "project" ? services.projectPresetDir(ctx) : services.globalPresetDir;
    const preset: ModePreset = {
      schemaVersion: 1,
      key,
      label: key
        .split(/[-_]/)
        .map((part) => `${part[0]?.toUpperCase() ?? ""}${part.slice(1)}`)
        .join(" "),
      description: "Saved pi-modes composition.",
      selection: cloneModeSelection(replayed.selection),
    };
    const target = presetPath(dir, key);
    if (
      existsSync(target) &&
      ctx.mode === "tui" &&
      !(await ctx.ui.confirm("Overwrite preset?", target))
    )
      return true;
    if (existsSync(target) && ctx.mode !== "tui") {
      throw new Error("Preset exists; use the TUI to confirm overwrite");
    }
    saveModePreset(dir, preset);
    if (ctx.mode === "tui") ctx.ui.notify(`Saved composition preset: ${key}`, "info");
    else writeMachineOutput({ ok: true, operation: "save", key, path: target });
    return true;
  }

  if (operation === "use") {
    if (
      scoped.scope !== "global" ||
      tokens.length > 2 ||
      (tokens.length === 2 && tokens[1] !== "--confirm-exact")
    ) {
      throw new Error("Usage: /mode use <preset-key> [--confirm-exact]");
    }
    const preset = presets.presets.find((candidate) => candidate.key === key);
    if (!preset) throw new Error(`Unknown composition preset: ${key}`);
    const resolution = resolveModeSelection(preset.selection, loaded.modes);
    if (resolution.blocked || resolution.diagnostics.length > 0) {
      throw new Error(
        `Preset is not currently valid: ${resolution.diagnostics.map((item) => item.message).join("; ")}`,
      );
    }
    const confirmedFingerprint = selectionDefinitionFingerprint(preset.selection, loaded.modes);
    if (
      !(await confirmExact(
        ctx,
        replayed.selection,
        preset.selection,
        loaded.modes,
        tokens.includes("--confirm-exact"),
        replayed.state?.fingerprints,
      ))
    )
      return true;
    services.persist(preset.selection, ctx, "preset", `Activated composition preset: ${key}`, {
      expectedDefinitionFingerprint: confirmedFingerprint,
    });
    return true;
  }

  if (operation === "export") {
    if (scoped.scope !== "global" || tokens.length !== 1) {
      throw new Error("Usage: /mode export <preset-key>");
    }
    const preset = presets.presets.find((candidate) => candidate.key === key);
    if (!preset) throw new Error(`Unknown composition preset: ${key}`);
    const portable = JSON.parse(presetExportText(preset)) as ModePreset;
    const payload = { preset: portable, encoded: encodePreset(portable) };
    if (ctx.mode === "tui") {
      await ctx.ui.editor(
        `Export preset: ${key}`,
        `${presetExportText(portable)}\n\n# base64url\n${payload.encoded}`,
      );
    } else writeMachineOutput(payload);
    return true;
  }

  if (scoped.scope === "project" && !ctx.isProjectTrusted()) {
    throw new Error("Project presets require a trusted project");
  }
  const dataIndex = tokens.indexOf("--data");
  if (
    !(tokens.length === 1 || (tokens.length === 3 && dataIndex === 1 && tokens[2] !== undefined))
  ) {
    throw new Error("Usage: /mode import [--project] <preset-key> [--data <base64url>]");
  }
  let preset: ModePreset;
  if (dataIndex >= 0 && tokens[dataIndex + 1]) {
    preset = decodePreset(tokens[dataIndex + 1] ?? "");
  } else {
    if (ctx.mode !== "tui") throw new Error("Headless import requires --data <base64url>");
    const template: ModePreset = {
      schemaVersion: 1,
      key,
      label: key,
      description: "Imported pi-modes composition.",
      selection: cloneModeSelection(replayed.selection),
    };
    const edited = await ctx.ui.editor(`Import preset: ${key}`, presetExportText(template));
    if (!edited) return true;
    preset = parseModePreset(JSON.parse(edited));
  }
  if (preset.key !== key) throw new Error("Imported preset key must match the command key");
  const resolution = resolveModeSelection(preset.selection, loaded.modes);
  if (resolution.blocked || resolution.diagnostics.length > 0) {
    throw new Error(
      `Imported preset is not currently valid: ${resolution.diagnostics.map((item) => item.message).join("; ")}`,
    );
  }
  const dir =
    scoped.scope === "project" ? services.projectPresetDir(ctx) : services.globalPresetDir;
  const target = presetPath(dir, key);
  if (
    existsSync(target) &&
    ctx.mode === "tui" &&
    !(await ctx.ui.confirm("Overwrite preset?", target))
  )
    return true;
  if (existsSync(target) && ctx.mode !== "tui") {
    throw new Error("Preset exists; use the TUI to confirm overwrite");
  }
  saveModePreset(dir, preset);
  if (ctx.mode === "tui") ctx.ui.notify(`Imported composition preset: ${key}`, "info");
  else writeMachineOutput({ ok: true, operation: "import", key, path: target });
  return true;
}
