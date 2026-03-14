/**
 * Prompt Template Accelerator (PTX)
 *
 * - Non-UI: deterministic `$$` transform pipeline (for tests/automation)
 * - UI: explicit `/ptx-select` picker command
 * - Live integration: registers `$$ /...` picker through pi-interaction trigger surfaces when available
 */

import { readFile } from "node:fs/promises";
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { buildTransformedCommand } from "../src/buildTransformedCommand.js";
import { runFzfProbe, selectFuzzyCandidate } from "../src/fuzzySelector.js";
import { parseRawCommand, RawCommandParseError } from "../src/parseRawCommand.js";
import { parseTemplatePlaceholders } from "../src/parseTemplatePlaceholders.js";
import { planPromptTemplateTransform } from "../src/planPromptTemplateTransform.js";
import { toPtxCandidates } from "../src/ptxCandidateAdapter.js";
import { loadPtxPolicyConfig } from "../src/ptxPolicyConfig.js";

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

function asErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function resolvePolicyLookupCwd(ctx: any): string {
  const cwd = typeof ctx?.cwd === "string" ? ctx.cwd.trim() : "";
  return cwd.length > 0 ? cwd : process.cwd();
}

function formatPolicyConfigError(configPath: string, error: unknown): string {
  return `PTX policy config error at ${configPath}: ${asErrorMessage(error)}`;
}

function formatTemplateAmbiguityWarning(commandName: string, plan: {
  matches?: unknown[];
  prefillableMatches?: unknown[];
}): string {
  const totalCount = Array.isArray(plan.matches) ? plan.matches.length : 0;
  const prefillableCount = Array.isArray(plan.prefillableMatches) ? plan.prefillableMatches.length : 0;
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

function candidateToTemplateCommand(candidate: PtxTemplateCandidate | null | undefined): TemplateCommandOverride | undefined {
  const name = String(candidate?.commandName ?? candidate?.id ?? "")
    .trim()
    .replace(/^\/+/, "");

  if (!name) return undefined;

  const templateCommand: TemplateCommandOverride = {
    name,
    source: "prompt",
  };

  if (typeof candidate?.commandDescription === "string" && candidate.commandDescription.trim().length > 0) {
    templateCommand.description = candidate.commandDescription.trim();
  }

  if (typeof candidate?.commandPath === "string" && candidate.commandPath.trim().length > 0) {
    templateCommand.path = candidate.commandPath.trim();
  }

  return templateCommand;
}

async function buildTemplateSuggestion(options: {
  pi: ExtensionAPI;
  ctx: any;
  commandName: string;
  providedArgs: string[];
  templateCommand?: TemplateCommandOverride;
}): Promise<{ transformed?: string; warning?: string }> {
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
        : { warning: `Template blocked by PTX policy: /${options.commandName} (${plan.policy.reason}).` };
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
      return { warning: `PTX parse error: ${plan.error.message}` };
    case "not-slash-command":
    default:
      return { warning: `PTX input error: expected slash command after '${PREFIX}'.` };
  }
}

function selectionModeMessage(selection: { mode: "fzf" | "fallback"; reason?: string }): string {
  if (selection.mode === "fzf") return "selection mode=fzf";
  return selection.reason ? `selection mode=fallback (${selection.reason})` : "selection mode=fallback";
}

async function pickTemplate(options: {
  pi: ExtensionAPI;
  ctx: any;
  query: string;
  title: string;
}): Promise<{
  selected: PtxTemplateCandidate | null;
  mode: "fzf" | "fallback";
  reason?: string;
}> {
  const commands = options.pi.getCommands();
  const promptCommands = commands.filter((command) => command && command.source === "prompt");
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
      slice.length
        ? `${"${@:"}${slice.start}:${slice.length}}`
        : `${"${@:"}${slice.start}}`,
    );
  }
  return parts.length > 0 ? parts.join(", ") : "none";
}

async function inspectPromptCommands(commands: Array<Record<string, unknown>>) {
  const promptCommands = commands.filter((command) => command && command.source === "prompt");
  return await Promise.all(
    promptCommands.map(async (command) => {
      const name = String(command.name || "").trim();
      const path = typeof command.path === "string" && command.path.trim() ? command.path.trim() : "";
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

async function loadTriggerSurface() {
  try {
    return await import("@tryinget/pi-interaction");
  } catch {
    try {
      return await import("@tryinget/pi-trigger-adapter");
    } catch {
      return null;
    }
  }
}

async function maybeRegisterLiveTrigger(options: {
  pi: ExtensionAPI;
}) {
  try {
    const inputTriggers = await loadTriggerSurface();
    if (!inputTriggers) {
      return { unregister: () => {}, reason: "trigger-surface-unavailable" };
    }

    if (typeof inputTriggers.registerPickerInteraction !== "function") {
      return { unregister: () => {}, reason: "registerPickerInteraction-unavailable" };
    }

    const splitQueryAndContext =
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
        const promptCommands = commands.filter((command) => command && command.source === "prompt");
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
      applySelection: async ({ selected, parsed, context, api }: any) => {
        const parsedArgs = Array.isArray(parsed?.meta?.parsedArgs) ? parsed.meta.parsedArgs : [];
        const contextArg = String(parsed?.context ?? "").trim();
        const providedArgs = contextArg ? [...parsedArgs, contextArg] : parsedArgs;
        const selectedCandidate = selected as PtxTemplateCandidate | undefined;
        const templateCommand = candidateToTemplateCommand(selectedCandidate);
        const commandName = templateCommand?.name ?? String(selectedCandidate?.id ?? "").replace(/^\/+/, "").trim();
        const rawFallback = commandName ? buildRawFallbackCommand(commandName, providedArgs) : undefined;

        let suggestion;
        try {
          suggestion = await buildTemplateSuggestion({
            pi: options.pi,
            ctx: context,
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
          api?.notify?.(suggestion.warning ?? `Unable to build suggestion for /${commandName}`, "warning");
          return;
        }

        api?.setText?.(suggestion.transformed);
        if (suggestion.warning) {
          api?.notify?.(suggestion.warning, "warning");
        }
      },
      onNoCandidates: ({ reason, api }: any) => {
        const suffix = reason ? ` (${reason})` : "";
        api?.notify?.(`No prompt templates available${suffix}.`, "warning");
      },
      onError: ({ error, api }: any) => {
        api?.notify?.(`PTX live picker error: ${asErrorMessage(error)}`, "error");
      },
    });

    return {
      unregister: typeof registration?.unregister === "function" ? registration.unregister : () => {},
      reason: "registered",
    };
  } catch {
    return { unregister: () => {}, reason: "pi-interaction-trigger-surface-unavailable" };
  }
}

export default function ptxExtension(pi: ExtensionAPI) {
  let unregisterLivePicker: (() => void) | null = null;

  // Optional live trigger registration through pi-interaction trigger surfaces.
  // PTX remains fully functional in non-UI mode even when these packages are absent.
  void maybeRegisterLiveTrigger({ pi }).then((result) => {
    unregisterLivePicker = result.unregister;
  });

  pi.on("session_shutdown", () => {
    unregisterLivePicker?.();
    unregisterLivePicker = null;
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

    let parsed: SelectorInvocation | null;
    try {
      parsed = parseSelectorInvocation(rawAfterPrefix);
    } catch (error) {
      if (error instanceof RawCommandParseError) {
        const message = `PTX parse error: ${error.message}`;
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

    // In UI sessions with pi-interaction trigger surfaces loaded, live picker handles this before Enter.
    // This path remains as deterministic fallback and as primary path in non-UI sessions.
    if (ctx.hasUI) {
      const selection = await pickTemplate({
        pi,
        ctx,
        query: parsed.query,
        title: parsed.query ? `PTX template picker (query: ${parsed.query})` : "PTX template picker",
      });

      if (!selection.selected) {
        const reason = selection.reason ? ` (${selection.reason})` : "";
        ctx.ui.notify(`No prompt template selected${reason}.`, "warning");
        return { action: "handled" as const };
      }

      const templateCommand = candidateToTemplateCommand(selection.selected);
      const commandName = templateCommand?.name ?? String(selection.selected.id).replace(/^\/+/, "").trim();
      const rawFallback = buildRawFallbackCommand(commandName, parsed.args);

      let suggestion;
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
        ctx.ui.notify(suggestion.warning ?? `Unable to build suggestion for /${commandName}`, "warning");
        return { action: "handled" as const };
      }

      ctx.ui.setEditorText(suggestion.transformed);
      if (suggestion.warning) {
        ctx.ui.notify(suggestion.warning, "warning");
      } else {
        ctx.ui.notify(`Suggestion for /${commandName}. ${selectionModeMessage(selection)}.`, "info");
      }
      return { action: "handled" as const };
    }

    const suggestion = await buildTemplateSuggestion({
      pi,
      ctx,
      commandName: parsed.query,
      providedArgs: parsed.args,
    });

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
      ctx.ui.notify(`Template Accelerator active. Use '${PREFIX} /query' or '/ptx-select [query]'.`, "info");
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
        const reason = selection.reason ? ` (${selection.reason})` : "";
        ctx.ui.notify(`No prompt template selected${reason}.`, "warning");
        return;
      }

      const templateCommand = candidateToTemplateCommand(selection.selected);
      const commandName = templateCommand?.name ?? String(selection.selected.id).replace(/^\/+/, "").trim();
      const rawFallback = buildRawFallbackCommand(commandName, []);

      let suggestion;
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
        ? inspected.filter((row) => row.name.toLowerCase().includes(query) || row.path.toLowerCase().includes(query))
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
