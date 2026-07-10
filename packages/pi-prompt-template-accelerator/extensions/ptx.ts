/**
 * Prompt Template Accelerator (PTX)
 *
 * - Non-UI: deterministic `$$` transform pipeline (for tests/automation)
 * - UI: explicit `/ptx-select` picker command
 * - Live integration: registers `$$ /...` picker through the split pi-trigger-adapter surface when available
 */

import { readFile } from "node:fs/promises";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { buildTransformedCommand } from "../src/buildTransformedCommand.js";
import { getCommandPath, isPromptCommand } from "../src/commandProvenance.js";
import { runFzfProbe, selectFuzzyCandidate } from "../src/fuzzySelector.js";
import { parseRawCommand, RawCommandParseError } from "../src/parseRawCommand.js";
import { parseTemplatePlaceholders } from "../src/parseTemplatePlaceholders.js";
import { planPromptTemplateTransform } from "../src/planPromptTemplateTransform.js";
import { toPtxCandidates } from "../src/ptxCandidateAdapter.js";
import {
  formatNoPromptTemplateAvailabilityWarning,
  formatNoPromptTemplateSelectionWarning,
} from "../src/ptxNoCandidateMessage.js";
import { loadPtxPolicyConfig } from "../src/ptxPolicyConfig.js";
import {
  createInitialPtxModelLifecycleState,
  observePtxModelSelection,
  registerPtxCapabilityBridges,
  unregisterPtxCapabilityBridges,
} from "../src/ptxRuntimeRegistry.js";

const PREFIX = "$$";
const LIVE_TRIGGER_ID = "ptx-template-picker";

type SelectorInvocation = {
  query: string;
  args: string[];
  rawAfterPrefix: string;
};

type TemplateCommandOverride = {
  name: string;
  source: "prompt";
  description?: string;
  path?: string;
};

type PtxTemplateCandidate = {
  id: string;
  label: string;
  detail?: string;
  source: string;
  commandName?: string;
  commandPath?: string;
  commandDescription?: string;
};

type PromptCommandLike = {
  name?: unknown;
  description?: unknown;
  path?: unknown;
  source?: unknown;
  sourceInfo?: {
    source?: unknown;
    path?: unknown;
  } | null;
};

type NotifyLevel = "info" | "warning" | "error";

type PtxContextLike = {
  cwd?: unknown;
  hasUI?: boolean;
  ui?: {
    notify?: (message: string, level?: NotifyLevel) => void;
    select?: (title: string, options: string[]) => Promise<string | undefined> | string | undefined;
    setText?: (text: string) => void;
    setEditorText?: (text: string) => void;
  };
};

type PtxLiveTriggerApi = {
  setText?: (text: string) => void;
  notify?: (message: string, level?: NotifyLevel) => void;
};

type PtxLiveTriggerParsed = {
  meta?: {
    parsedArgs?: unknown;
  };
  context?: unknown;
};

type PtxApplySelectionArgs = {
  selected?: unknown;
  parsed?: PtxLiveTriggerParsed;
  context?: PtxContextLike;
  api?: PtxLiveTriggerApi;
};

type PtxNoCandidatesArgs = {
  reason?: string;
  api?: PtxLiveTriggerApi;
};

type PtxErrorArgs = {
  error?: unknown;
  api?: PtxLiveTriggerApi;
};

type ModelSelectEvent = {
  model?: unknown;
};

type TemplateSuggestionResult = {
  transformed?: string;
  warning?: string;
};

type PtxModelLifecycleState = ReturnType<typeof createInitialPtxModelLifecycleState>;

type TriggerSurface = {
  registerPickerInteraction?: (config: Record<string, unknown>) =>
    | {
        unregister?: (() => void) | undefined;
      }
    | undefined;
  splitQueryAndContext?: (
    value: string,
    separator: string,
  ) => {
    query: string;
    context: string;
  };
};

type LiveTriggerRegistrationResult = {
  unregister: () => void;
  reason: string;
};

function asErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function resolvePolicyLookupCwd(ctx: PtxContextLike): string {
  const cwd = typeof ctx?.cwd === "string" ? ctx.cwd.trim() : "";
  return cwd.length > 0 ? cwd : process.cwd();
}

function formatPolicyConfigError(configPath: string, error: unknown): string {
  return `PTX policy config error at ${configPath}: ${asErrorMessage(error)}`;
}

function formatTemplateAmbiguityWarning(
  commandName: string,
  plan: {
    matches?: unknown[];
    prefillableMatches?: unknown[];
  },
): string {
  const totalCount = Array.isArray(plan.matches) ? plan.matches.length : 0;
  const prefillableCount = Array.isArray(plan.prefillableMatches)
    ? plan.prefillableMatches.length
    : 0;
  return `Template name is ambiguous: /${commandName} (${prefillableCount} prefillable matches, ${totalCount} total). Use picker or '/ptx-select ${commandName}'.`;
}

function parseSelectorInvocation(rawAfterPrefix: string): SelectorInvocation | null {
  const trimmed = rawAfterPrefix.trim();
  if (!trimmed) return null;

  const parsed = parseRawCommand(trimmed);
  if (!parsed) return null;

  return {
    query: parsed.commandName,
    args: parsed.args,
    rawAfterPrefix: trimmed,
  };
}

function buildRawFallbackCommand(commandName: string, providedArgs: string[]): string | undefined {
  try {
    return buildTransformedCommand(commandName, providedArgs);
  } catch {
    return undefined;
  }
}

function candidateToTemplateCommand(
  candidate: PtxTemplateCandidate | null | undefined,
): TemplateCommandOverride | undefined {
  const name = String(candidate?.commandName ?? candidate?.id ?? "")
    .trim()
    .replace(/^\/+/, "");

  if (!name) return undefined;

  const templateCommand: TemplateCommandOverride = {
    name,
    source: "prompt",
  };

  if (
    typeof candidate?.commandDescription === "string" &&
    candidate.commandDescription.trim().length > 0
  ) {
    templateCommand.description = candidate.commandDescription.trim();
  }

  if (typeof candidate?.commandPath === "string" && candidate.commandPath.trim().length > 0) {
    templateCommand.path = candidate.commandPath.trim();
  }

  return templateCommand;
}

async function buildTemplateSuggestion(options: {
  pi: ExtensionAPI;
  ctx: PtxContextLike;
  commandName: string;
  providedArgs: string[];
  templateCommand?: TemplateCommandOverride;
}): Promise<TemplateSuggestionResult> {
  const rawText = buildTransformedCommand(options.commandName, options.providedArgs);
  const policyLoad = await loadPtxPolicyConfig({ cwd: resolvePolicyLookupCwd(options.ctx) });

  if (policyLoad.error) {
    return {
      warning: formatPolicyConfigError(policyLoad.configPath, policyLoad.error),
    };
  }

  const plan = await planPromptTemplateTransform({
    pi: options.pi,
    ctx: options.ctx,
    rawText,
    policyConfig: policyLoad.config,
    templateCommandOverride: options.templateCommand,
  });

  switch (plan.status) {
    case "ok":
      return { transformed: plan.transformed };
    case "policy-blocked":
      return plan.policy.fallback === "passthrough"
        ? {
            transformed: rawText,
            warning: `Template blocked by PTX policy: /${options.commandName} (${plan.policy.reason}); inserted raw command without inferred args.`,
          }
        : {
            warning: `Template blocked by PTX policy: /${options.commandName} (${plan.policy.reason}).`,
          };
    case "template-name-ambiguous":
      return { warning: formatTemplateAmbiguityWarning(options.commandName, plan) };
    case "template-path-missing":
      return {
        transformed: rawText,
        warning: `Template path unavailable: /${options.commandName}; inserted raw command without inferred args.`,
      };
    case "template-read-error":
      return {
        transformed: rawText,
        warning: `Cannot read template: ${asErrorMessage(plan.error)}; inserted raw command without inferred args.`,
      };
    case "non-template-command":
      return options.templateCommand
        ? {
            transformed: rawText,
            warning: `Template metadata drifted for /${options.commandName}; inserted raw command without inferred args.`,
          }
        : { warning: `Template not found: /${options.commandName}` };
    case "parse-error":
      return { warning: `PTX parse error: ${asErrorMessage(plan.error)}` };
    default:
      return { warning: `PTX input error: expected slash command after '${PREFIX}'.` };
  }
}

function selectionModeMessage(selection: { mode: "fzf" | "fallback"; reason?: string }): string {
  if (selection.mode === "fzf") return "selection mode=fzf";
  return selection.reason
    ? `selection mode=fallback (${selection.reason})`
    : "selection mode=fallback";
}

async function pickTemplate(options: {
  pi: ExtensionAPI;
  ctx: PtxContextLike;
  query: string;
  title: string;
}): Promise<{
  selected: PtxTemplateCandidate | null;
  mode: "fzf" | "fallback";
  reason?: string;
}> {
  const commands = options.pi.getCommands();
  const promptCommands = commands.filter((command) =>
    isPromptCommand(command as PromptCommandLike),
  );
  const candidates = toPtxCandidates(commands);

  if (candidates.length === 0) {
    const reason =
      commands.length === 0
        ? "prompt-command-source-unavailable"
        : promptCommands.length === 0
          ? "no-prompt-templates"
          : "no-prefillable-prompt-templates";
    return { selected: null, mode: "fallback", reason };
  }

  return await selectFuzzyCandidate(candidates, {
    query: options.query,
    title: options.title,
    ui: options.ctx.hasUI ? options.ctx.ui : undefined,
    maxOptions: 30,
  });
}

function formatArgContract(templateText: string): string {
  const usage = parseTemplatePlaceholders(templateText);
  const parts = [];
  for (const index of usage.positionalIndexes) parts.push(`$${index}`);
  if (usage.usesAllArgs) parts.push("$@");
  for (const slice of usage.slices ?? []) {
    parts.push(
      slice.length ? `${"${@:"}${slice.start}:${slice.length}}` : `${"${@:"}${slice.start}}`,
    );
  }
  return parts.length > 0 ? parts.join(", ") : "none";
}

async function inspectPromptCommands(commands: readonly PromptCommandLike[]) {
  const promptCommands = commands.filter((command) =>
    isPromptCommand(command as PromptCommandLike),
  );
  return await Promise.all(
    promptCommands.map(async (command) => {
      const name = String(command.name || "").trim();
      const path = getCommandPath(command as PromptCommandLike) ?? "";
      if (!path) {
        return {
          name,
          hasPath: "no",
          argContract: "n/a",
          path: "",
          status: "not-prefillable (missing path)",
        };
      }

      try {
        const templateText = await readFile(path, "utf8");
        return {
          name,
          hasPath: "yes",
          argContract: formatArgContract(templateText),
          path,
          status: "prefillable",
        };
      } catch (error) {
        return {
          name,
          hasPath: "yes",
          argContract: "unreadable",
          path,
          status: `unreadable (${asErrorMessage(error)})`,
        };
      }
    }),
  );
}

async function loadTriggerSurface(): Promise<TriggerSurface | null> {
  try {
    const triggerAdapterModuleName = "@tryinget/pi-trigger-adapter";
    return (await import(triggerAdapterModuleName)) as TriggerSurface;
  } catch {
    return null;
  }
}

async function maybeRegisterLiveTrigger(options: {
  pi: ExtensionAPI;
}): Promise<LiveTriggerRegistrationResult> {
  try {
    const inputTriggers = await loadTriggerSurface();
    if (!inputTriggers) {
      return { unregister: () => {}, reason: "trigger-surface-unavailable" };
    }

    if (typeof inputTriggers.registerPickerInteraction !== "function") {
      return { unregister: () => {}, reason: "registerPickerInteraction-unavailable" };
    }

    const splitQueryAndContext: (
      value: string,
      separator: string,
    ) => {
      query: string;
      context: string;
    } =
      typeof inputTriggers.splitQueryAndContext === "function"
        ? inputTriggers.splitQueryAndContext
        : (value: string) => ({ query: value, context: "" });

    const registration = inputTriggers.registerPickerInteraction({
      id: LIVE_TRIGGER_ID,
      description: "PTX live picker for $$ /<template>",
      priority: 120,
      match: /^\$\$\s*\/([^\n]*)$/,
      requireCursorAtEnd: true,
      debounceMs: 150,
      showInPicker: true,
      pickerLabel: "$$ / picker",
      pickerDetail: "Prompt template selector",
      parseInput: (match: { groups?: string[] }) => {
        const grouped = String(match?.groups?.[0] ?? "");
        const split = splitQueryAndContext(grouped, "::");

        let query = split.query.trim();
        let parsedArgs: string[] = [];

        try {
          const parsed = parseRawCommand(`/${query}`);
          if (parsed) {
            query = parsed.commandName;
            parsedArgs = parsed.args;
          }
        } catch {
          // Keep raw query if tokenization fails; deterministic errors are handled in non-UI input path.
        }

        return {
          query,
          context: split.context,
          raw: grouped,
          meta: {
            parsedArgs,
          },
        };
      },
      loadCandidates: () => {
        const commands = options.pi.getCommands();
        const promptCommands = commands.filter((command) =>
          isPromptCommand(command as PromptCommandLike),
        );
        const candidates = toPtxCandidates(commands);
        return {
          candidates,
          reason:
            candidates.length > 0
              ? undefined
              : commands.length === 0
                ? "prompt-command-source-unavailable"
                : promptCommands.length === 0
                  ? "no-prompt-templates"
                  : "no-prefillable-prompt-templates",
        };
      },
      selectTitle: ({ query }: { query: string }) =>
        query ? `PTX template picker (query: ${query})` : "PTX template picker",
      applySelection: async ({ selected, parsed, context, api }: PtxApplySelectionArgs) => {
        const parsedArgs = Array.isArray(parsed?.meta?.parsedArgs) ? parsed.meta.parsedArgs : [];
        const contextArg = String(parsed?.context ?? "").trim();
        const providedArgs = contextArg ? [...parsedArgs, contextArg] : parsedArgs;
        const selectedCandidate = selected as PtxTemplateCandidate | undefined;
        const templateCommand = candidateToTemplateCommand(selectedCandidate);
        const commandName =
          templateCommand?.name ??
          String(selectedCandidate?.id ?? "")
            .replace(/^\/+/, "")
            .trim();
        const rawFallback = commandName
          ? buildRawFallbackCommand(commandName, providedArgs)
          : undefined;

        let suggestion: TemplateSuggestionResult;
        try {
          suggestion = await buildTemplateSuggestion({
            pi: options.pi,
            ctx: context ?? {},
            commandName,
            providedArgs,
            templateCommand,
          });
        } catch (error) {
          suggestion = {
            transformed: rawFallback,
            warning: rawFallback
              ? `PTX live picker fallback for /${commandName}: ${asErrorMessage(error)}; inserted raw command without inferred args.`
              : `PTX live picker error: ${asErrorMessage(error)}`,
          };
        }

        if (!suggestion.transformed) {
          if (rawFallback) {
            api?.setText?.(rawFallback);
          }
          api?.notify?.(
            suggestion.warning ?? `Unable to build suggestion for /${commandName}`,
            "warning",
          );
          return;
        }

        api?.setText?.(suggestion.transformed);
        if (suggestion.warning) {
          api?.notify?.(suggestion.warning, "warning");
        }
      },
      onNoCandidates: ({ reason, api }: PtxNoCandidatesArgs) => {
        api?.notify?.(formatNoPromptTemplateAvailabilityWarning(reason), "warning");
      },
      onError: ({ error, api }: PtxErrorArgs) => {
        api?.notify?.(`PTX live picker error: ${asErrorMessage(error)}`, "error");
      },
    });

    return {
      unregister:
        typeof registration?.unregister === "function" ? registration.unregister : () => {},
      reason: "registered",
    };
  } catch {
    return { unregister: () => {}, reason: "pi-interaction-trigger-surface-unavailable" };
  }
}

export default function ptxExtension(pi: ExtensionAPI) {
  let unregisterLivePicker: (() => void) | null = null;
  let sessionActive = true;
  let liveTriggerState: { status: string; reason: string } = {
    status: "pending",
    reason: "initializing",
  };
  let modelLifecycleState: PtxModelLifecycleState = createInitialPtxModelLifecycleState();

  registerPtxCapabilityBridges({
    getCommands: () => pi.getCommands(),
    getLiveTriggerState: () => liveTriggerState,
    getModelLifecycleState: () => modelLifecycleState,
  });

  // Optional live trigger registration through the split pi-trigger-adapter surface.
  // PTX remains fully functional in non-UI mode even when this package is absent.
  void maybeRegisterLiveTrigger({ pi }).then((result) => {
    if (!sessionActive) {
      result.unregister();
      return;
    }

    unregisterLivePicker = result.unregister;
    liveTriggerState = {
      status: result.reason === "registered" ? "registered" : "unavailable",
      reason: result.reason,
    };
  });

  pi.on("model_select", (event: ModelSelectEvent) => {
    modelLifecycleState = observePtxModelSelection(modelLifecycleState, event?.model);
  });

  pi.on("session_shutdown", () => {
    sessionActive = false;
    unregisterLivePicker?.();
    unregisterLivePicker = null;
    liveTriggerState = {
      status: "unregistered",
      reason: "session-shutdown",
    };
    unregisterPtxCapabilityBridges();
  });

  pi.on("input", async (event, ctx) => {
    if (event.source === "extension") return { action: "continue" as const };

    const text = String(event.text ?? "").trim();
    if (!text.startsWith(PREFIX)) return { action: "continue" as const };

    const rawAfterPrefix = text.slice(PREFIX.length).trimStart();
    if (!rawAfterPrefix) {
      const message = "PTX input error: expected '/template' after '$$'.";
      if (!ctx.hasUI) return { action: "transform" as const, text: message };
      ctx.ui.notify("Usage: $$ /template", "warning");
      return { action: "handled" as const };
    }

    if (!rawAfterPrefix.startsWith("/")) {
      return { action: "continue" as const };
    }

    let parsed: SelectorInvocation | null;
    try {
      parsed = parseSelectorInvocation(rawAfterPrefix);
    } catch (error) {
      if (error instanceof RawCommandParseError) {
        const message = `PTX parse error: ${asErrorMessage(error)}`;
        if (!ctx.hasUI) return { action: "transform" as const, text: message };
        ctx.ui.notify(message, "warning");
        return { action: "handled" as const };
      }
      throw error;
    }

    if (!parsed) {
      const message = "PTX input error: expected slash command after '$$'.";
      if (!ctx.hasUI) return { action: "transform" as const, text: message };
      ctx.ui.notify(message, "warning");
      return { action: "handled" as const };
    }

    // In UI sessions with pi-trigger-adapter trigger surfaces loaded, live picker handles this before Enter.
    // This path remains as deterministic fallback and as primary path in non-UI sessions.
    if (ctx.hasUI) {
      const selection = await pickTemplate({
        pi,
        ctx,
        query: parsed.query,
        title: parsed.query
          ? `PTX template picker (query: ${parsed.query})`
          : "PTX template picker",
      });

      if (!selection.selected) {
        ctx.ui.notify(formatNoPromptTemplateSelectionWarning(selection.reason), "warning");
        return { action: "handled" as const };
      }

      const templateCommand = candidateToTemplateCommand(selection.selected);
      const commandName =
        templateCommand?.name ?? String(selection.selected.id).replace(/^\/+/, "").trim();
      const rawFallback = buildRawFallbackCommand(commandName, parsed.args);

      let suggestion: TemplateSuggestionResult;
      try {
        suggestion = await buildTemplateSuggestion({
          pi,
          ctx,
          commandName,
          providedArgs: parsed.args,
          templateCommand,
        });
      } catch (error) {
        suggestion = {
          transformed: rawFallback,
          warning: rawFallback
            ? `PTX fallback for /${commandName}: ${asErrorMessage(error)}; inserted raw command without inferred args.`
            : `PTX error: ${asErrorMessage(error)}`,
        };
      }

      if (!suggestion.transformed) {
        if (rawFallback) {
          ctx.ui.setEditorText(rawFallback);
        }
        ctx.ui.notify(
          suggestion.warning ?? `Unable to build suggestion for /${commandName}`,
          "warning",
        );
        return { action: "handled" as const };
      }

      ctx.ui.setEditorText(suggestion.transformed);
      if (suggestion.warning) {
        ctx.ui.notify(suggestion.warning, "warning");
      } else {
        ctx.ui.notify(
          `Suggestion for /${commandName}. ${selectionModeMessage(selection)}.`,
          "info",
        );
      }
      return { action: "handled" as const };
    }

    const rawFallback = buildRawFallbackCommand(parsed.query, parsed.args);
    let suggestion: TemplateSuggestionResult;
    try {
      suggestion = await buildTemplateSuggestion({
        pi,
        ctx,
        commandName: parsed.query,
        providedArgs: parsed.args,
      });
    } catch (error) {
      suggestion = {
        transformed: rawFallback,
        warning: rawFallback
          ? `PTX non-UI fallback for /${parsed.query}: ${asErrorMessage(error)}; inserted raw command without inferred args.`
          : `PTX non-UI error: ${asErrorMessage(error)}`,
      };
    }

    if (!suggestion.transformed) {
      return {
        action: "transform" as const,
        text: suggestion.warning ?? `Unable to build suggestion for /${parsed.query}`,
      };
    }

    return { action: "transform" as const, text: suggestion.transformed };
  });

  pi.registerCommand("ptx", {
    description: "Show template accelerator status",
    handler: async (_args, ctx) => {
      if (!ctx.hasUI) return;
      ctx.ui.notify(
        `Template Accelerator active. Use '${PREFIX} /query' or '/ptx-select [query]'.`,
        "info",
      );
    },
  });

  pi.registerCommand("ptx-select", {
    description: "Pick a prompt template with fuzzy selector and stage transformed command",
    handler: async (args, ctx) => {
      if (!ctx.hasUI) return;

      const query = args.trim();
      const selection = await pickTemplate({
        pi,
        ctx,
        query,
        title: query ? `PTX template picker (query: ${query})` : "PTX template picker",
      });

      if (!selection.selected) {
        ctx.ui.notify(formatNoPromptTemplateSelectionWarning(selection.reason), "warning");
        return;
      }

      const templateCommand = candidateToTemplateCommand(selection.selected);
      const commandName =
        templateCommand?.name ?? String(selection.selected.id).replace(/^\/+/, "").trim();
      const rawFallback = buildRawFallbackCommand(commandName, []);

      let suggestion: TemplateSuggestionResult;
      try {
        suggestion = await buildTemplateSuggestion({
          pi,
          ctx,
          commandName,
          providedArgs: [],
          templateCommand,
        });
      } catch (error) {
        suggestion = {
          transformed: rawFallback,
          warning: rawFallback
            ? `PTX fallback for /${commandName}: ${asErrorMessage(error)}; inserted raw command without inferred args.`
            : `PTX error: ${asErrorMessage(error)}`,
        };
      }

      if (!suggestion.transformed) {
        if (rawFallback) {
          ctx.ui.setEditorText(rawFallback);
        }
        ctx.ui.notify(suggestion.warning ?? "Unable to build PTX suggestion", "warning");
        return;
      }

      ctx.ui.setEditorText(suggestion.transformed);
      if (suggestion.warning) {
        ctx.ui.notify(suggestion.warning, "warning");
      } else {
        ctx.ui.notify(`Prepared /${commandName}. ${selectionModeMessage(selection)}.`, "info");
      }
    },
  });

  pi.registerCommand("ptx-debug-commands", {
    description: "Inspect visible prompt commands, paths, and inferred arg contracts",
    handler: async (args, ctx) => {
      if (!ctx.hasUI) return;

      const query = args.trim().toLowerCase();
      const inspected = await inspectPromptCommands(pi.getCommands());
      const filtered = query
        ? inspected.filter(
            (row) =>
              row.name.toLowerCase().includes(query) || row.path.toLowerCase().includes(query),
          )
        : inspected;

      const output = [
        "# PTX Visible Prompt Commands",
        "",
        `- query: ${query || "<none>"}`,
        `- visible_prompt_commands: ${inspected.length}`,
        `- prefillable_prompt_commands: ${inspected.filter((row) => row.status === "prefillable").length}`,
        "",
        "| Name | Prefillable | Arg Contract | Path | Status |",
        "|---|---|---|---|---|",
        ...filtered.map(
          (row) =>
            `| /${row.name} | ${row.hasPath} | ${row.argContract} | ${row.path || "-"} | ${row.status} |`,
        ),
      ].join("\n");

      await ctx.ui.editor("PTX Debug Commands", output);
    },
  });

  pi.registerCommand("ptx-fzf-spike", {
    description: "Run FZF viability probe for PTX selector runtime",
    handler: async (_args, ctx) => {
      if (!ctx.hasUI) return;

      const probe = runFzfProbe();
      const report = [
        "# PTX FZF Spike",
        "",
        `- cwd: ${ctx.cwd || process.cwd()}`,
        `- interactive status: ${probe.interactive.status ?? "n/a"}`,
        `- interactive stderr: ${probe.interactive.stderr}`,
        `- filter status: ${probe.filter.status ?? "n/a"}`,
        `- filter stdout: ${probe.filter.stdout}`,
        `- filter stderr: ${probe.filter.stderr}`,
        "",
        "Interpretation:",
        "- interactive status != 0 implies TTY-less runtime path; use deterministic fallback chooser.",
        "- filter status == 0 confirms non-interactive fzf ranking path is available.",
      ].join("\n");

      await ctx.ui.editor("PTX FZF Spike", report);
    },
  });
}
