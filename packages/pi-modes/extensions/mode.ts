import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import {
  CONFIG_DIR_NAME,
  type ExtensionAPI,
  type ExtensionCommandContext,
  type ExtensionContext,
  getAgentDir,
} from "@earendil-works/pi-coding-agent";
import { Box, Text } from "@earendil-works/pi-tui";
import {
  ancestorModeDirectories,
  BUILTIN_MODES,
  composeModePrompt,
  deleteMode,
  loadModes,
  MODE_SCHEMA_VERSION,
  MODE_STATE_TYPE,
  type ModeDefinition,
  type ModeScope,
  modePath,
  parseModeDefinition,
  resolveInitialModeSelection,
  saveMode,
  selectedModeFromEntries,
} from "../src/modes.ts";

const MODE_STATUS_ENTRY_TYPE = "pi-mode-status.v1";

interface ModeStatusEntryData {
  summary: string;
  available: string[];
  details: string[];
  diagnostics: string[];
}

function directories(ctx: ExtensionContext | ExtensionCommandContext) {
  return {
    globalDir: join(getAgentDir(), "modes"),
    projectDir: join(ctx.cwd, CONFIG_DIR_NAME, "modes"),
    projectDirs: ancestorModeDirectories(ctx.cwd, CONFIG_DIR_NAME),
  };
}

function parseScopedArguments(args: string): {
  scope: Exclude<ModeScope, "builtin">;
  rest: string;
} {
  const values = args.trim().split(/\s+/).filter(Boolean);
  const project = values[0] === "--project";
  if (project) values.shift();
  return { scope: project ? "project" : "global", rest: values.join(" ") };
}

function modeTemplate(key: string): ModeDefinition {
  return {
    schemaVersion: MODE_SCHEMA_VERSION,
    key,
    label: key
      .split(/[-_]/)
      .filter(Boolean)
      .map((part) => `${part[0]?.toUpperCase() ?? ""}${part.slice(1)}`)
      .join(" "),
    description: "Describe when this mode should be used.",
    promptStrategy: "replace_base",
    systemPrompt: "Define the complete static base system prompt for this mode.",
  };
}

export default function modeExtension(pi: ExtensionAPI) {
  let activeKey: string | null = null;
  let cachedModeKeys = BUILTIN_MODES.map((mode) => mode.key);
  const warnedUnavailableKeys = new Set<string>();

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
        if (data.available.length > 0) {
          lines.push(theme.fg("dim", `available: ${data.available.join(", ")}`));
        }
        lines.push(...data.diagnostics.map((line) => theme.fg("warning", `warning: ${line}`)));
      }
      const box = new Box(1, 1, (text) => theme.bg("customMessageBg", text));
      box.addChild(new Text(lines.join("\n"), 0, 0));
      return box;
    },
  );

  function currentModes(ctx: ExtensionContext | ExtensionCommandContext) {
    const dirs = directories(ctx);
    const loaded = loadModes({
      ...dirs,
      projectTrusted: ctx.isProjectTrusted(),
    });
    cachedModeKeys = loaded.modes.map((mode) => mode.key);
    return loaded;
  }

  function updateStatus(ctx: ExtensionContext | ExtensionCommandContext) {
    if (!ctx.hasUI) return;
    if (!activeKey) {
      ctx.ui.setStatus("pi-modes", undefined);
      return;
    }
    const mode = currentModes(ctx).modes.find((candidate) => candidate.key === activeKey);
    const label = mode?.label ?? `${activeKey} (unavailable)`;
    ctx.ui.setStatus("pi-modes", ctx.ui.theme.fg(mode ? "accent" : "warning", `mode:${label}`));
  }

  function activate(key: string | null, ctx: ExtensionCommandContext): void {
    activeKey = key;
    pi.appendEntry(MODE_STATE_TYPE, { key });
    updateStatus(ctx);
    if (ctx.hasUI) {
      ctx.ui.notify(
        key ? `Prompt mode activated: ${key}` : "Prompt mode cleared; using host prompt",
        "info",
      );
    }
  }

  pi.registerCommand("mode", {
    description: "Select a prompt mode, or use /mode off to restore the host prompt",
    getArgumentCompletions: (prefix) => {
      const normalized = prefix.trim().toLowerCase();
      return ["off", ...currentModeKeys()]
        .filter((key) => key.startsWith(normalized))
        .map((key) => ({ value: key, label: key }));
    },
    handler: async (args, ctx) => {
      const loaded = currentModes(ctx);
      let key = args.trim().toLowerCase();
      if (!key) {
        if (!ctx.hasUI) return;
        const options = [
          "off — Host default",
          ...loaded.modes.map(
            (mode) => `${mode.key} — ${mode.label} [${mode.promptStrategy}/${mode.scope}]`,
          ),
        ];
        const selected = await ctx.ui.select("Select prompt mode", options);
        if (!selected) return;
        key = selected.split(" — ", 1)[0] ?? "";
      }
      if (key === "off" || key === "default" || key === "none") {
        activate(null, ctx);
        return;
      }
      if (!loaded.modes.some((mode) => mode.key === key)) {
        if (ctx.hasUI) ctx.ui.notify(`Unknown prompt mode: ${key}`, "error");
        return;
      }
      activate(key, ctx);
    },
  });

  function currentModeKeys(): string[] {
    return cachedModeKeys;
  }

  pi.registerCommand("mode-status", {
    description: "Show a durable active-mode status card and discovery diagnostics",
    handler: async (_args, ctx) => {
      if (!ctx.hasUI) return;
      const loaded = currentModes(ctx);
      const mode = loaded.modes.find((candidate) => candidate.key === activeKey);
      const summary = mode
        ? `${mode.key} — ${mode.label} (${mode.promptStrategy}, ${mode.scope})`
        : activeKey
          ? `${activeKey} unavailable — native SYSTEM.md / host base active`
          : "native SYSTEM.md / host base (no named mode)";
      const details = mode
        ? [
            `strategy: ${mode.promptStrategy}`,
            `scope: ${mode.scope}`,
            `source: ${mode.path ?? "built-in"}`,
            ...(mode.description ? [`description: ${mode.description}`] : []),
          ]
        : [
            "Pi resolves project .pi/SYSTEM.md, global ~/.pi/agent/SYSTEM.md, or its built-in base.",
          ];
      pi.appendEntry<ModeStatusEntryData>(MODE_STATUS_ENTRY_TYPE, {
        summary,
        available: loaded.modes.map((candidate) => candidate.key),
        details,
        diagnostics: loaded.diagnostics.map(
          (diagnostic) => `${diagnostic.path}: ${diagnostic.message}`,
        ),
      });
    },
  });

  pi.registerCommand("mode-preview", {
    description: "Preview the final prompt for a mode without activating it",
    getArgumentCompletions: (prefix) => {
      const normalized = prefix.trim().toLowerCase();
      return currentModeKeys()
        .filter((key) => key.startsWith(normalized))
        .map((key) => ({ value: key, label: key }));
    },
    handler: async (args, ctx) => {
      const loaded = currentModes(ctx);
      let key = args.trim().toLowerCase();
      if (!key) {
        if (!ctx.hasUI) return;
        const options = loaded.modes.map(
          (mode) => `${mode.key} — ${mode.label} [${mode.promptStrategy}/${mode.scope}]`,
        );
        const selected = await ctx.ui.select("Select mode to preview", options);
        if (!selected) return;
        key = selected.split(" — ", 1)[0] ?? "";
      }
      const mode = loaded.modes.find((candidate) => candidate.key === key);
      if (!mode) {
        if (ctx.hasUI) ctx.ui.notify("Select or name a valid mode to preview", "error");
        return;
      }
      const preview = composeModePrompt(mode, ctx.getSystemPromptOptions(), ctx.getSystemPrompt());
      if (ctx.hasUI)
        await ctx.ui.editor(`Preview: ${mode.label} (${mode.promptStrategy})`, preview);
    },
  });

  pi.registerCommand("mode-new", {
    description: "Create a global mode, or use /mode-new --project <key>",
    handler: async (args, ctx) => {
      if (!ctx.hasUI) return;
      const parsed = parseScopedArguments(args);
      const key = parsed.rest.trim().toLowerCase();
      if (!key) {
        ctx.ui.notify("Usage: /mode-new [--project] <key>", "error");
        return;
      }
      if (parsed.scope === "project" && !ctx.isProjectTrusted()) {
        ctx.ui.notify("Project modes require a trusted project", "error");
        return;
      }
      const dirs = directories(ctx);
      const dir = parsed.scope === "project" ? dirs.projectDir : dirs.globalDir;
      let initial: ModeDefinition;
      try {
        initial = modeTemplate(key);
        modePath(dir, key);
      } catch (error) {
        ctx.ui.notify(error instanceof Error ? error.message : String(error), "error");
        return;
      }
      const edited = await ctx.ui.editor(
        `Create ${parsed.scope} prompt mode`,
        JSON.stringify(initial, null, 2),
      );
      if (!edited) return;
      try {
        const mode = parseModeDefinition(JSON.parse(edited));
        const path = modePath(dir, mode.key);
        if (existsSync(path) && !(await ctx.ui.confirm("Overwrite mode?", path))) return;
        saveMode(dir, mode);
        activate(mode.key, ctx);
      } catch (error) {
        ctx.ui.notify(
          `Mode not saved: ${error instanceof Error ? error.message : String(error)}`,
          "error",
        );
      }
    },
  });

  pi.registerCommand("mode-edit", {
    description: "Edit a custom prompt mode safely",
    handler: async (args, ctx) => {
      if (!ctx.hasUI) return;
      const key = args.trim().toLowerCase();
      const loaded = currentModes(ctx);
      const mode = loaded.modes.find((candidate) => candidate.key === key);
      if (!mode?.path || mode.scope === "builtin") {
        ctx.ui.notify("Name a global or project custom mode to edit", "error");
        return;
      }
      const dirs = directories(ctx);
      if (mode.scope === "project" && resolve(dirname(mode.path)) !== resolve(dirs.projectDir)) {
        const ownerDir = dirname(dirname(dirname(mode.path)));
        ctx.ui.notify(`Inherited mode is read-only here; cd to ${ownerDir} to edit it`, "warning");
        return;
      }
      const edited = await ctx.ui.editor(
        `Edit ${mode.scope} mode: ${mode.key}`,
        readFileSync(mode.path, "utf8"),
      );
      if (!edited) return;
      try {
        const next = parseModeDefinition(JSON.parse(edited));
        if (next.key !== mode.key)
          throw new Error(
            "renaming a mode during edit is not supported; create a new mode instead",
          );
        saveMode(mode.scope === "project" ? dirs.projectDir : dirs.globalDir, next);
        ctx.ui.notify(`Saved prompt mode: ${next.key}`, "info");
      } catch (error) {
        ctx.ui.notify(
          `Mode not saved: ${error instanceof Error ? error.message : String(error)}`,
          "error",
        );
      }
    },
  });

  pi.registerCommand("mode-delete", {
    description: "Delete a custom prompt mode safely",
    handler: async (args, ctx) => {
      if (!ctx.hasUI) return;
      const key = args.trim().toLowerCase();
      const loaded = currentModes(ctx);
      const mode = loaded.modes.find((candidate) => candidate.key === key);
      if (!mode?.path || mode.scope === "builtin") {
        ctx.ui.notify("Name a global or project custom mode to delete", "error");
        return;
      }
      const dirs = directories(ctx);
      if (mode.scope === "project" && resolve(dirname(mode.path)) !== resolve(dirs.projectDir)) {
        const ownerDir = dirname(dirname(dirname(mode.path)));
        ctx.ui.notify(
          `Inherited mode is read-only here; cd to ${ownerDir} to delete it`,
          "warning",
        );
        return;
      }
      if (!(await ctx.ui.confirm(`Delete ${mode.scope} mode?`, mode.path))) return;
      try {
        const dir = mode.scope === "project" ? dirs.projectDir : dirs.globalDir;
        deleteMode(mode.path, dir);
        if (activeKey === mode.key) activate(null, ctx);
        ctx.ui.notify(`Deleted prompt mode: ${mode.key}`, "info");
      } catch (error) {
        ctx.ui.notify(error instanceof Error ? error.message : String(error), "error");
      }
    },
  });

  pi.on("session_start", async (event, ctx) => {
    const sessionKey = selectedModeFromEntries(ctx.sessionManager.getBranch()).key;
    activeKey = sessionKey;
    const loaded = currentModes(ctx);
    const initial = resolveInitialModeSelection({
      applyEnvironment: event.reason === "startup",
      environmentValue: process.env.PI_MODE,
      sessionKey,
      availableKeys: loaded.modes.map((mode) => mode.key),
    });

    if (initial.source === "environment") {
      activeKey = initial.key;
      if (sessionKey !== initial.key) pi.appendEntry(MODE_STATE_TYPE, { key: initial.key });
      if (ctx.hasUI) {
        if (initial.error) {
          ctx.ui.notify(`${initial.error}; using the native SYSTEM.md/host base`, "warning");
        } else {
          ctx.ui.notify(
            initial.key
              ? `Startup prompt mode from PI_MODE: ${initial.key}`
              : "PI_MODE=off; using the native SYSTEM.md/host base",
            "info",
          );
        }
      }
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
    activeKey = selectedModeFromEntries(ctx.sessionManager.getBranch()).key;
    updateStatus(ctx);
    if (!activeKey) return;
    const mode = currentModes(ctx).modes.find((candidate) => candidate.key === activeKey);
    if (!mode) {
      if (ctx.hasUI && !warnedUnavailableKeys.has(activeKey)) {
        warnedUnavailableKeys.add(activeKey);
        ctx.ui.notify(
          `Selected prompt mode is unavailable: ${activeKey}; using host prompt`,
          "warning",
        );
      }
      return;
    }
    warnedUnavailableKeys.delete(activeKey);
    return { systemPrompt: composeModePrompt(mode, event.systemPromptOptions, event.systemPrompt) };
  });
}
