/**
 * Prompt Template Accelerator (PTX)
 *
 * - Non-UI: deterministic `$$` transform pipeline (for tests/automation)
 * - UI: explicit `/ptx-select` picker command
 * - Live integration: registers `$$ /...` picker through pi-interaction trigger surfaces when available
 */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { buildTransformedCommand } from "../src/buildTransformedCommand.js";
import { runFzfProbe, selectFuzzyCandidate } from "../src/fuzzySelector.js";
import { parseRawCommand, RawCommandParseError } from "../src/parseRawCommand.js";
import { planPromptTemplateTransform } from "../src/planPromptTemplateTransform.js";
import { toPtxCandidates } from "../src/ptxCandidateAdapter.js";
import { loadPtxPolicyConfig } from "../src/ptxPolicyConfig.js";

const PREFIX = "$$";
const LIVE_TRIGGER_ID = "ptx-template-picker";

type PolicyConfig = Awaited<ReturnType<typeof loadPtxPolicyConfig>>["config"];

type SelectorInvocation = {
  query: string;
  args: string[];
  rawAfterPrefix: string;
};

function asErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
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

async function buildTemplateSuggestion(options: {
  pi: ExtensionAPI;
  ctx: any;
  commandName: string;
  providedArgs: string[];
  policyConfig: PolicyConfig;
}): Promise<{ transformed?: string; warning?: string }> {
  const rawText = buildTransformedCommand(options.commandName, options.providedArgs);

  const plan = await planPromptTemplateTransform({
    pi: options.pi,
    ctx: options.ctx,
    rawText,
    policyConfig: options.policyConfig,
  });

  switch (plan.status) {
    case "ok":
      return { transformed: plan.transformed };
    case "policy-blocked":
      return { warning: `Template blocked by PTX policy: /${options.commandName} (${plan.policy.reason})` };
    case "template-path-missing":
      return { warning: `Template path unavailable: /${options.commandName}` };
    case "template-read-error":
      return { warning: `Cannot read template: ${asErrorMessage(plan.error)}` };
    case "non-template-command":
      return { warning: `Template not found: /${options.commandName}` };
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
  selected: { id: string; label: string; detail?: string; source: string } | null;
  mode: "fzf" | "fallback";
  reason?: string;
}> {
  const commands = options.pi.getCommands();
  const candidates = toPtxCandidates(commands);

  if (candidates.length === 0) {
    const reason = commands.length === 0 ? "prompt-command-source-unavailable" : "no-prompt-templates";
    return { selected: null, mode: "fallback", reason };
  }

  return await selectFuzzyCandidate(candidates, {
    query: options.query,
    title: options.title,
    ui: options.ctx.hasUI ? options.ctx.ui : undefined,
    maxOptions: 30,
  });
}

async function loadTriggerSurface() {
  try {
    return await import("@tryinget/pi-trigger-adapter");
  } catch {
    try {
      return await import("@tryinget/pi-interaction");
    } catch {
      return null;
    }
  }
}

async function maybeRegisterLiveTrigger(options: {
  pi: ExtensionAPI;
  getPolicyConfig: () => Promise<PolicyConfig>;
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
        const candidates = toPtxCandidates(commands);
        return {
          candidates,
          reason:
            candidates.length > 0
              ? undefined
              : commands.length === 0
                ? "prompt-command-source-unavailable"
                : "no-prompt-templates",
        };
      },
      selectTitle: ({ query }: { query: string }) =>
        query ? `PTX template picker (query: ${query})` : "PTX template picker",
      applySelection: async ({ selected, parsed, context, api }: any) => {
        const policyConfig = await options.getPolicyConfig();
        const parsedArgs = Array.isArray(parsed?.meta?.parsedArgs) ? parsed.meta.parsedArgs : [];
        const contextArg = String(parsed?.context ?? "").trim();
        const providedArgs = contextArg ? [...parsedArgs, contextArg] : parsedArgs;

        const suggestion = await buildTemplateSuggestion({
          pi: options.pi,
          ctx: context,
          commandName: String(selected?.id ?? ""),
          providedArgs,
          policyConfig,
        });

        if (!suggestion.transformed) {
          api?.notify?.(suggestion.warning ?? `Unable to build suggestion for /${selected?.id}`, "warning");
          return;
        }

        api?.setText?.(suggestion.transformed);
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
  let cachedPolicyConfig: PolicyConfig | null = null;
  let unregisterLivePicker: (() => void) | null = null;

  const getPolicyConfig = async () => {
    if (cachedPolicyConfig) return cachedPolicyConfig;
    const loaded = await loadPtxPolicyConfig({ cwd: process.cwd() });
    cachedPolicyConfig = loaded.config;
    return cachedPolicyConfig;
  };

  // Optional live trigger registration through pi-interaction trigger surfaces.
  // PTX remains fully functional in non-UI mode even when these packages are absent.
  void maybeRegisterLiveTrigger({ pi, getPolicyConfig }).then((result) => {
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

      const suggestion = await buildTemplateSuggestion({
        pi,
        ctx,
        commandName: selection.selected.id,
        providedArgs: parsed.args,
        policyConfig: await getPolicyConfig(),
      });

      if (!suggestion.transformed) {
        ctx.ui.notify(suggestion.warning ?? `Unable to build suggestion for /${selection.selected.id}`, "warning");
        return { action: "handled" as const };
      }

      ctx.ui.setEditorText(suggestion.transformed);
      ctx.ui.notify(`Suggestion for /${selection.selected.id}. ${selectionModeMessage(selection)}.`, "info");
      return { action: "handled" as const };
    }

    const suggestion = await buildTemplateSuggestion({
      pi,
      ctx,
      commandName: parsed.query,
      providedArgs: parsed.args,
      policyConfig: await getPolicyConfig(),
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

      const suggestion = await buildTemplateSuggestion({
        pi,
        ctx,
        commandName: selection.selected.id,
        providedArgs: [],
        policyConfig: await getPolicyConfig(),
      });

      if (!suggestion.transformed) {
        ctx.ui.notify(suggestion.warning ?? "Unable to build PTX suggestion", "warning");
        return;
      }

      ctx.ui.setEditorText(suggestion.transformed);
      ctx.ui.notify(`Prepared /${selection.selected.id}. ${selectionModeMessage(selection)}.`, "info");
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
