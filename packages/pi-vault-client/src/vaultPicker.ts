import { registerPickerInteraction, splitQueryAndContext } from "@tryinget/pi-trigger-adapter";
import { selectFuzzyCandidate } from "./fuzzySelector.js";
import { prepareTemplateForExecutionCompat } from "./templatePreparationCompat.js";
import { toVaultCandidates } from "./vaultCandidateAdapter.js";
import {
  type FuzzyCandidate,
  LIVE_TRIGGER_TELEMETRY_LIMIT,
  LIVE_VAULT_MIN_QUERY,
  LIVE_VAULT_TRIGGER_DEBOUNCE_MS,
  LIVE_VAULT_TRIGGER_ID,
  type LiveTriggerTelemetryEvent,
  type PickerRuntime,
  type SelectionResult,
  type Template,
  type UiContext,
  type VaultRuntime,
} from "./vaultTypes.js";

const liveTriggerTelemetry = {
  registrations: 0,
  registrationFailures: 0,
  events: [] as LiveTriggerTelemetryEvent[],
};

function recordLiveTriggerTelemetry(event: Record<string, unknown>): void {
  const normalized: LiveTriggerTelemetryEvent = {
    timestamp: String(event.timestamp ?? new Date().toISOString()),
    event: String(event.event ?? "unknown"),
    triggerId: event.triggerId ? String(event.triggerId) : undefined,
    query: event.query ? String(event.query) : undefined,
    contextLength: typeof event.contextLength === "number" ? event.contextLength : undefined,
    candidateCount: typeof event.candidateCount === "number" ? event.candidateCount : undefined,
    selectedId: event.selectedId ? String(event.selectedId) : undefined,
    selectedLabel: event.selectedLabel ? String(event.selectedLabel) : undefined,
    mode: event.mode ? String(event.mode) : undefined,
    reason: event.reason ? String(event.reason) : undefined,
    error: event.error ? String(event.error) : undefined,
  };

  liveTriggerTelemetry.events.push(normalized);
  if (liveTriggerTelemetry.events.length > LIVE_TRIGGER_TELEMETRY_LIMIT)
    liveTriggerTelemetry.events.shift();
}

function summarizeLiveTriggerTelemetry(): string {
  const recent = liveTriggerTelemetry.events.slice(-10);
  const lines = [
    "# Vault Live Trigger Telemetry",
    "",
    `- registrations: ${liveTriggerTelemetry.registrations}`,
    `- registration_failures: ${liveTriggerTelemetry.registrationFailures}`,
    `- retained_events: ${liveTriggerTelemetry.events.length}`,
    "",
    "## Recent events",
  ];
  if (recent.length === 0) lines.push("_No live-trigger telemetry recorded yet._");
  else {
    for (const event of recent) {
      const parts = [event.timestamp, event.event];
      if (event.query) parts.push(`query=${event.query}`);
      if (event.selectedId) parts.push(`selected=${event.selectedId}`);
      if (event.mode) parts.push(`mode=${event.mode}`);
      if (event.reason) parts.push(`reason=${event.reason}`);
      lines.push(`- ${parts.join(" | ")}`);
    }
  }
  return lines.join("\n");
}

function selectionModeMessage(selection: SelectionResult): string {
  if (selection.mode === "fzf") return "selection mode=fzf";
  return selection.reason
    ? `selection mode=fallback (${selection.reason})`
    : "selection mode=fallback";
}

function splitVaultQueryAndContext(rest: string): { query: string; context: string } {
  return splitQueryAndContext(rest, "::");
}

function parseVaultSelectionInput(text: string): { query: string; context: string } | null {
  if (text === "/vault") return { query: "", context: "" };
  if (text.startsWith("/vault:")) return splitVaultQueryAndContext(text.slice(7));
  if (text.startsWith("/vault ")) return splitVaultQueryAndContext(text.slice(7));
  return null;
}

function prepareVaultPrompt(
  runtime: VaultRuntime,
  template: Template,
  options: { context?: string; currentCompany?: string; cwd?: string } = {},
) {
  return prepareTemplateForExecutionCompat(template.content, {
    currentCompany: options.currentCompany ?? runtime.getCurrentCompany(options.cwd),
    context: options.context ?? "",
    templateName: template.name,
    allowLegacyPiVarsAutoDetect: false,
  });
}

function loadVaultTemplate(
  runtime: VaultRuntime,
  name: string,
  context?: { currentCompany?: string; cwd?: string },
): Template | null {
  return runtime.getTemplate(name, context);
}

async function pickVaultTemplate(
  runtime: VaultRuntime,
  ctx: UiContext,
  query: string,
): Promise<SelectionResult> {
  const currentCompany = runtime.getCurrentCompany(ctx.cwd);
  const templatesResult = runtime.listTemplatesDetailed(undefined, {
    currentCompany,
    cwd: ctx.cwd,
  });
  if (!templatesResult.ok) {
    return { selected: null, mode: "fallback", reason: "vault-db-unavailable" };
  }
  const candidates = toVaultCandidates(templatesResult.value) as FuzzyCandidate[];
  if (candidates.length === 0) {
    return { selected: null, mode: "fallback", reason: "empty-vault" };
  }
  return (await selectFuzzyCandidate(candidates, {
    query,
    title: query
      ? `Vault template picker (query: ${query})`
      : "Vault template picker (all templates)",
    ui: ctx.hasUI ? ctx.ui : undefined,
    maxOptions: Math.max(1, candidates.length),
    telemetry: recordLiveTriggerTelemetry,
  })) as SelectionResult;
}

function registerVaultLiveTrigger(runtime: VaultRuntime): void {
  try {
    const registration = registerPickerInteraction({
      id: LIVE_VAULT_TRIGGER_ID,
      description: "Show vault template picker while typing /vault:<query>",
      priority: 115,
      match: /^\/vault:(.*)$/,
      requireCursorAtEnd: true,
      debounceMs: LIVE_VAULT_TRIGGER_DEBOUNCE_MS,
      showInPicker: true,
      pickerLabel: "/vault: picker",
      pickerDetail: "Live vault template selector",
      parseInput: (match: { groups?: string[] }) => {
        const raw = String(match?.groups?.[0] ?? "");
        const parsed = splitVaultQueryAndContext(raw);
        return { query: parsed.query, context: parsed.context, raw };
      },
      minQueryLength: LIVE_VAULT_MIN_QUERY,
      loadCandidates: ({ context }: { context?: { cwd?: string } }) => {
        const currentCompany = runtime.getCurrentCompany(context?.cwd);
        const templatesResult = runtime.listTemplatesDetailed(undefined, {
          currentCompany,
          cwd: context?.cwd,
        });
        if (!templatesResult.ok) {
          return {
            candidates: [],
            reason: "vault-db-unavailable",
            metadata: { templateCount: 0 },
          };
        }
        const candidates = toVaultCandidates(templatesResult.value) as FuzzyCandidate[];
        const reason = candidates.length === 0 ? "empty-vault" : undefined;
        return { candidates, reason, metadata: { templateCount: templatesResult.value.length } };
      },
      selectTitle: ({ query }: { query: string }) =>
        query ? `Vault live picker (query: ${query})` : "Vault live picker",
      promptForQueryWhenEmpty: true,
      promptQueryThreshold: 15,
      queryPromptTitle: "Filter vault templates",
      queryPromptPlaceholder: "Type a query (e.g. nex, inversion, security)",
      maxOptions: 25,
      applySelection: ({
        selected,
        parsed,
        context,
        api,
        selection,
      }: {
        selected: { id: string };
        parsed: { context: string };
        context?: { cwd?: string };
        api: {
          setText: (text: string) => void;
          notify?: (message: string, level?: string) => void;
        };
        selection: { mode: "fzf" | "fallback"; reason?: string };
      }) => {
        const currentCompany = runtime.getCurrentCompany(context?.cwd);
        const templateResult = runtime.getTemplateDetailed(selected.id, {
          currentCompany,
          cwd: context?.cwd,
        });
        if (!templateResult.ok) {
          api.notify?.(`Template lookup failed (${selected.id}): ${templateResult.error}`, "error");
          return;
        }
        const template = templateResult.value;
        if (!template) {
          api.notify?.(`Template not found: ${selected.id}`, "error");
          return;
        }

        const prepared = prepareVaultPrompt(runtime, template, {
          context: parsed.context,
          currentCompany,
          cwd: context?.cwd,
        });
        if (!prepared.ok) {
          api.notify?.(
            `Vault live picker render failed (${template.name}): ${prepared.error}`,
            "error",
          );
          return;
        }

        api.setText(prepared.prepared);
        const contextSuffix = parsed.context ? " + context" : "";
        api.notify?.(
          `Prepared: ${template.name} (${runtime.facetLabel(template)})${contextSuffix} — ${selectionModeMessage(selection as SelectionResult)}`,
          "info",
        );
        if (template.id) runtime.logExecution(template, "live-trigger", parsed.context);
      },
      onNoCandidates: ({
        parsed,
        reason,
        api,
      }: {
        parsed: { query: string };
        reason?: string;
        api: { notify?: (message: string, level?: string) => void };
      }) => {
        api.notify?.(
          reason
            ? `Vault live picker unavailable (${reason}).`
            : `No vault templates matched: ${parsed.query}`,
          "warning",
        );
      },
      onError: ({
        error,
        api,
      }: {
        error: unknown;
        api: { notify?: (message: string, level?: string) => void };
      }) => {
        const message = error instanceof Error ? error.message : String(error);
        api.notify?.(`Vault live picker failed: ${message}`, "error");
      },
      telemetry: recordLiveTriggerTelemetry,
    });

    if (registration.success) {
      liveTriggerTelemetry.registrations += 1;
      recordLiveTriggerTelemetry({
        event: "registration-success",
        triggerId: LIVE_VAULT_TRIGGER_ID,
      });
      return;
    }
    liveTriggerTelemetry.registrationFailures += 1;
    recordLiveTriggerTelemetry({
      event: "registration-failed",
      triggerId: LIVE_VAULT_TRIGGER_ID,
      reason: registration.error ?? "unknown",
    });
  } catch (error) {
    liveTriggerTelemetry.registrationFailures += 1;
    recordLiveTriggerTelemetry({
      event: "registration-error",
      triggerId: LIVE_VAULT_TRIGGER_ID,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

export function createPickerRuntime(runtime: VaultRuntime): PickerRuntime {
  return {
    recordLiveTriggerTelemetry,
    summarizeLiveTriggerTelemetry,
    selectionModeMessage,
    splitVaultQueryAndContext,
    parseVaultSelectionInput,
    pickVaultTemplate: (ctx, query) => pickVaultTemplate(runtime, ctx, query),
    registerVaultLiveTrigger: () => registerVaultLiveTrigger(runtime),
    prepareVaultPrompt: (template, options) => prepareVaultPrompt(runtime, template, options),
    loadVaultTemplate: (name, context) => loadVaultTemplate(runtime, name, context),
  };
}
