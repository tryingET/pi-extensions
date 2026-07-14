import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import type { ExtensionAPI, ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import { modeTemplate, parseScopedArguments } from "./mode-authoring.ts";
import type { ModeCommandServices } from "./mode-command-handlers.ts";
import {
  deleteMode,
  modePath,
  parseModeDefinition,
  resolveModeSelection,
  saveMode,
  selectedKeys,
} from "./modes.ts";
import { selectionLabel } from "./selection-commands.ts";

function reportError(ctx: ExtensionCommandContext, message: string): void {
  if (ctx.mode === "tui") ctx.ui.notify(message, "error");
  else throw new Error(message);
}

export function registerModeAuthoringCommands(
  pi: ExtensionAPI,
  services: ModeCommandServices,
): void {
  pi.registerCommand("mode-new", {
    description: "Create a mode without activating it",
    handler: async (args, ctx) => {
      if (ctx.mode !== "tui") return reportError(ctx, "Mode authoring requires TUI mode");
      const parsed = parseScopedArguments(args);
      const key = parsed.rest.trim().toLowerCase();
      if (!key) return reportError(ctx, "Usage: /mode-new [--project] <key>");
      if (parsed.scope === "project" && !ctx.isProjectTrusted()) {
        return reportError(ctx, "Project modes require a trusted project");
      }
      try {
        const initial = modeTemplate(key);
        const dir =
          parsed.scope === "project" ? services.projectModeDir(ctx) : services.globalModeDir;
        const edited = await ctx.ui.editor(
          `Create ${parsed.scope} prompt mode`,
          JSON.stringify(initial, null, 2),
        );
        if (!edited) return;
        const mode = parseModeDefinition(JSON.parse(edited));
        const path = modePath(dir, mode.key);
        if (existsSync(path) && !(await ctx.ui.confirm("Overwrite mode?", path))) return;
        saveMode(dir, mode);
        ctx.ui.notify(`Saved prompt mode without activating it: ${mode.key}`, "info");
      } catch (error) {
        reportError(
          ctx,
          `Mode not saved: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    },
  });

  pi.registerCommand("mode-edit", {
    description: "Edit a custom mode; active changes require explicit reapproval",
    handler: async (args, ctx) => {
      if (ctx.mode !== "tui") return reportError(ctx, "Mode authoring requires TUI mode");
      const key = args.trim().toLowerCase();
      const loaded = services.currentModes(ctx);
      const mode = loaded.modes.find((candidate) => candidate.key === key);
      if (!mode?.path || mode.scope === "builtin") {
        return reportError(ctx, "Name a global or project custom mode to edit");
      }
      const dir = mode.scope === "project" ? services.projectModeDir(ctx) : services.globalModeDir;
      if (mode.scope === "project" && resolve(dirname(mode.path)) !== resolve(dir)) {
        return ctx.ui.notify(
          "Inherited mode is read-only here; cd to its owning ancestor to edit it",
          "warning",
        );
      }
      const edited = await ctx.ui.editor(
        `Edit ${mode.scope} mode: ${mode.key}`,
        readFileSync(mode.path, "utf8"),
      );
      if (!edited) return;
      try {
        const next = parseModeDefinition(JSON.parse(edited));
        if (next.key !== mode.key) throw new Error("renaming during edit is not supported");
        saveMode(dir, next);
        const active = services.activeSelection();
        ctx.ui.notify(
          [...(active.baseKey ? [active.baseKey] : []), ...active.overlayKeys].includes(next.key)
            ? `Saved ${next.key}; active definition drift is blocked until /mode-reapprove`
            : `Saved prompt mode: ${next.key}`,
          "warning",
        );
        services.updateStatus(ctx);
      } catch (error) {
        reportError(
          ctx,
          `Mode not saved: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    },
  });

  pi.registerCommand("mode-delete", {
    description: "Delete a custom prompt mode safely",
    handler: async (args, ctx) => {
      if (ctx.mode !== "tui") return reportError(ctx, "Mode deletion requires TUI mode");
      const key = args.trim().toLowerCase();
      const loaded = services.currentModes(ctx);
      const mode = loaded.modes.find((candidate) => candidate.key === key);
      if (!mode?.path || mode.scope === "builtin") {
        return reportError(ctx, "Name a global or project custom mode to delete");
      }
      const dir = mode.scope === "project" ? services.projectModeDir(ctx) : services.globalModeDir;
      if (mode.scope === "project" && resolve(dirname(mode.path)) !== resolve(dir)) {
        return ctx.ui.notify("Inherited mode is read-only from this cwd", "warning");
      }
      const replayed = services.replay(ctx, loaded.modes);
      const current = replayed.selection;
      const wasSelected = selectedKeys(current).includes(key);
      const next = {
        baseKey: current.baseKey === key ? null : current.baseKey,
        overlayKeys: current.overlayKeys.filter((candidate) => candidate !== key),
      };
      if (
        !(await ctx.ui.confirm(
          `Delete ${mode.scope} mode?`,
          `${mode.path}\nActive composition ${
            wasSelected ? `becomes ${selectionLabel(next)}` : "remains unchanged"
          }.`,
        ))
      )
        return;
      deleteMode(mode.path, dir);
      if (!wasSelected) {
        services.updateStatus(ctx);
        ctx.ui.notify(`Deleted inactive prompt mode: ${key}`, "info");
        return;
      }
      const fresh = services.currentModes(ctx);
      const resolution = resolveModeSelection(next, fresh.modes);
      if (resolution.blocked || resolution.diagnostics.length > 0) {
        services.updateStatus(ctx);
        ctx.ui.notify(
          `Deleted ${key}; active state remains blocked: ${resolution.diagnostics
            .map((item) => item.message)
            .join("; ")}`,
          "warning",
        );
        return;
      }
      const retainedFingerprints = replayed.state
        ? Object.fromEntries(
            selectedKeys(next).flatMap((selectedKey) => {
              const fingerprint = replayed.state?.fingerprints[selectedKey];
              return fingerprint ? [[selectedKey, fingerprint] as const] : [];
            }),
          )
        : undefined;
      services.persist(
        next,
        ctx,
        "delete",
        `Deleted prompt mode: ${key}`,
        replayed.state
          ? {
              fingerprints: retainedFingerprints,
              driftPolicy: replayed.state.driftPolicy,
            }
          : undefined,
      );
    },
  });
}
