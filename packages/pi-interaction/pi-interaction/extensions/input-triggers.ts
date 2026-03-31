/**
 * Pi Interaction - Cooperative runtime for live editor interactions.
 *
 * This extension owns editor-level live keystroke handling and exposes reusable
 * helpers for fuzzy interaction flows that other extensions can register.
 */

import type { CustomEditor, ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { createEditorRegistry, TriggerEditor } from "@tryinget/pi-editor-registry";
import {
  rankCandidatesFallback,
  rankCandidatesWithFzf,
  runFzfProbe,
  selectFuzzyCandidate,
} from "@tryinget/pi-interaction-kit";
import {
  getBroker,
  registerPickerInteraction,
  resetBroker,
  splitQueryAndContext,
} from "@tryinget/pi-trigger-adapter";

export {
  getBroker,
  rankCandidatesFallback,
  rankCandidatesWithFzf,
  registerPickerInteraction,
  resetBroker,
  runFzfProbe,
  selectFuzzyCandidate,
  splitQueryAndContext,
};

const ENABLED_ENV = "PI_INTERACTION_ENABLED";
const ENABLED_ENV_LEGACY = "PI_INPUT_TRIGGERS_ENABLED";
const LEGACY_MODE_ENV = "PI_INTERACTION_LEGACY_MODE";
const LEGACY_MODE_ENV_LEGACY = "PI_INPUT_TRIGGERS_LEGACY_MODE";
const EXAMPLES_ENV = "PI_INTERACTION_EXAMPLES";
const EXAMPLES_ENV_LEGACY = "PI_INPUT_TRIGGERS_EXAMPLES";
const EXAMPLE_TRIGGER_IDS = ["bash-command-picker", "file-picker"];

type TriggerDiagnosticsView = {
  id: string;
  description: string;
  priority: number;
  matchType: string;
  fireCount: number;
  lastFired?: Date;
  lastError?: string;
  enabled: boolean;
};

type TriggerPickerEntry = {
  id: string;
  showInPicker?: boolean;
  pickerLabel?: string;
  pickerDetail?: string;
};

function getEnv(...names: string[]): string | undefined {
  for (const name of names) {
    const value = process.env[name];
    if (value !== undefined) return value;
  }
  return undefined;
}

function unregisterExampleTriggers(broker: ReturnType<typeof getBroker>): void {
  for (const id of EXAMPLE_TRIGGER_IDS) {
    broker.unregister(id);
  }
}

/**
 * Register demo triggers that showcase the helper API.
 *
 * Note: product-owned trigger surfaces (for example PTX's `$$ /...`) are not
 * registered here. Owning extensions should register those interactions through
 * registerPickerInteraction.
 */
function registerExampleTriggers(broker: ReturnType<typeof getBroker>, _pi: ExtensionAPI): void {
  broker.register(
    {
      id: "bash-command-picker",
      description: "Show common bash commands when typing !! /",
      priority: 90,
      match: /^!!\s*\/$/,
      requireCursorAtEnd: true,
      debounceMs: 150,
      showInPicker: true,
      pickerLabel: "!! / picker",
      pickerDetail: "Common bash commands",
      handler: async (
        match: { matchedText: string },
        _context: unknown,
        api: {
          select: (title: string, options: string[]) => Promise<string | null | undefined>;
          setText: (text: string) => void;
        },
      ) => {
        const commands = [
          "git status",
          "git log --oneline -10",
          "npm test",
          "npm run build",
          "docker ps",
          "docker compose up -d",
        ];

        const selected = await api.select("Pick a command", commands);
        if (selected) {
          api.setText(`!! ${selected}`);
        } else {
          api.setText(match.matchedText);
        }
      },
    },
    { replaceIfExists: true },
  );

  broker.register(
    {
      id: "file-picker",
      description: "Show file picker when typing !! .",
      priority: 80,
      match: /^!!\s*\.$/,
      requireCursorAtEnd: true,
      debounceMs: 150,
      showInPicker: true,
      pickerLabel: "!! . picker",
      pickerDetail: "File picker",
      handler: async (
        match: { matchedText: string },
        _context: unknown,
        api: {
          select: (title: string, options: string[]) => Promise<string | null | undefined>;
          setText: (text: string) => void;
        },
      ) => {
        const files = ["package.json", "README.md", "src/index.ts"];
        const selected = await api.select("Pick a file", files);

        if (selected) {
          api.setText(`!! cat ${selected}`);
        } else {
          api.setText(match.matchedText);
        }
      },
    },
    { replaceIfExists: true },
  );
}

export default function (pi: ExtensionAPI) {
  const enabledValue = getEnv(ENABLED_ENV, ENABLED_ENV_LEGACY);
  const enabled =
    enabledValue === undefined ? true : enabledValue !== "0" && enabledValue !== "false";

  const legacyModeValue = getEnv(LEGACY_MODE_ENV, LEGACY_MODE_ENV_LEGACY);
  const legacyMode = legacyModeValue === "1" || legacyModeValue === "true";

  const examplesValue = getEnv(EXAMPLES_ENV, EXAMPLES_ENV_LEGACY);
  const examplesEnabled = examplesValue !== "0";

  if (!enabled) {
    pi.on("session_start", () => {
      console.log("[pi-interaction] Disabled via environment variable");
    });
    return;
  }

  const broker = getBroker();
  const editorRegistry = createEditorRegistry({ ownerId: "@tryinget/pi-interaction" });

  // Refresh bundled demo triggers without clobbering externally registered ones.
  unregisterExampleTriggers(broker);
  if (examplesEnabled) {
    registerExampleTriggers(broker, pi);
  }

  // Session start: install custom editor.
  pi.on("session_start", (_event, ctx) => {
    if (!ctx.hasUI) return;

    if (legacyMode) {
      ctx.ui.notify("Interaction runtime loaded (legacy mode - no editor override)", "info");
      return;
    }

    editorRegistry.mount({
      ctx,
      notifyMessage: "Interaction runtime enabled",
      factory: (tui: unknown, theme: unknown, keybindings: unknown) => {
        return new TriggerEditor(tui, theme, keybindings, pi, ctx.ui, {
          cwd: ctx.cwd,
        }) as unknown as CustomEditor;
      },
    });
  });

  // Command: list triggers.
  pi.registerCommand("triggers", {
    description: "List registered input triggers",
    handler: async (_args, ctx) => {
      if (!ctx.hasUI) return;

      const diagnostics = broker.diagnostics() as TriggerDiagnosticsView[];
      const lines = [
        "# Input Triggers",
        "",
        `Total: ${diagnostics.length}`,
        "",
        ...diagnostics.map((d: TriggerDiagnosticsView) => {
          const status = d.enabled ? "✓" : "✗";
          const fires = d.fireCount > 0 ? ` (${d.fireCount} fires)` : "";
          return `- ${status} **${d.id}** (${d.matchType}, priority: ${d.priority})${fires}\n  ${d.description}`;
        }),
      ];

      await ctx.ui.editor("Input Triggers", lines.join("\n"));
    },
  });

  pi.registerCommand("trigger-enable", {
    description: "Enable a trigger by ID",
    handler: async (args, ctx) => {
      const id = args.trim();
      if (!id) {
        if (ctx.hasUI) ctx.ui.notify("Usage: /trigger-enable <id>", "warning");
        return;
      }

      if (broker.setEnabled(id, true)) {
        if (ctx.hasUI) ctx.ui.notify(`Trigger '${id}' enabled`, "info");
      } else if (ctx.hasUI) {
        ctx.ui.notify(`Trigger '${id}' not found`, "error");
      }
    },
  });

  pi.registerCommand("trigger-disable", {
    description: "Disable a trigger by ID",
    handler: async (args, ctx) => {
      const id = args.trim();
      if (!id) {
        if (ctx.hasUI) ctx.ui.notify("Usage: /trigger-disable <id>", "warning");
        return;
      }

      if (broker.setEnabled(id, false)) {
        if (ctx.hasUI) ctx.ui.notify(`Trigger '${id}' disabled`, "info");
      } else if (ctx.hasUI) {
        ctx.ui.notify(`Trigger '${id}' not found`, "error");
      }
    },
  });

  pi.registerCommand("trigger-diag", {
    description: "Show detailed trigger diagnostics",
    handler: async (_args, ctx) => {
      if (!ctx.hasUI) return;

      const diagnostics = broker.diagnostics() as TriggerDiagnosticsView[];
      const editorDiagnostics = editorRegistry.diagnostics();
      const lines = [
        "# Trigger Diagnostics",
        "",
        "## Summary",
        `- Total triggers: ${diagnostics.length}`,
        `- Enabled: ${diagnostics.filter((d: TriggerDiagnosticsView) => d.enabled).length}`,
        `- Disabled: ${diagnostics.filter((d: TriggerDiagnosticsView) => !d.enabled).length}`,
        "",
        "## Editor runtime",
        `- Owner: ${editorDiagnostics.ownerId}`,
        `- Mounted: ${editorDiagnostics.mounted}`,
        `- Mount count: ${editorDiagnostics.mountCount}`,
        ...(editorDiagnostics.lastMountedAt
          ? [`- Last mounted at: ${editorDiagnostics.lastMountedAt}`]
          : []),
        "",
        "## Details",
        "",
      ];

      for (const d of diagnostics) {
        lines.push(`### ${d.id}`);
        lines.push(`- **Description**: ${d.description}`);
        lines.push(`- **Match Type**: ${d.matchType}`);
        lines.push(`- **Priority**: ${d.priority}`);
        lines.push(`- **Enabled**: ${d.enabled}`);
        lines.push(`- **Fire Count**: ${d.fireCount}`);
        if (d.lastFired) {
          lines.push(`- **Last Fired**: ${d.lastFired.toISOString()}`);
        }
        if (d.lastError) {
          lines.push(`- **Last Error**: ${d.lastError}`);
        }
        lines.push("");
      }

      await ctx.ui.editor("Trigger Diagnostics", lines.join("\n"));
    },
  });

  pi.registerCommand("trigger-pick", {
    description: "Manually trigger a picker for any registered trigger",
    handler: async (_args, ctx) => {
      if (!ctx.hasUI) return;

      const triggers = (broker.list() as TriggerPickerEntry[]).filter(
        (t: TriggerPickerEntry) => t.showInPicker !== false,
      );
      if (triggers.length === 0) {
        ctx.ui.notify("No triggers available for manual pick", "warning");
        return;
      }

      const options = triggers.map(
        (t: TriggerPickerEntry) =>
          `${t.pickerLabel ?? t.id}${t.pickerDetail ? ` — ${t.pickerDetail}` : ""}`,
      );

      const selected = await ctx.ui.select("Pick a trigger", options);
      if (!selected) return;

      const triggerId = triggers.find((t: TriggerPickerEntry) =>
        selected.startsWith(t.pickerLabel ?? t.id),
      )?.id;
      if (triggerId) {
        ctx.ui.notify(`Selected trigger: ${triggerId}`, "info");
      }
    },
  });

  pi.registerCommand("trigger-reload", {
    description: "Reload built-in demo triggers",
    handler: async (_args, ctx) => {
      unregisterExampleTriggers(broker);

      if (examplesEnabled) {
        registerExampleTriggers(broker, pi);
      }

      if (ctx.hasUI) {
        ctx.ui.notify(
          `Reloaded built-in triggers (${broker.list().length} total registered)`,
          "info",
        );
      }
    },
  });
}
