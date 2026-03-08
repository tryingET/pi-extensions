import { registerPickerInteraction, splitQueryAndContext } from "@tryinget/pi-trigger-adapter";
import { selectFuzzyCandidate } from "./fuzzySelector.js";
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

function buildVaultPrompt(template: Template, context: string): string {
  return context ? `${template.content}\n\n## CONTEXT\n${context}` : template.content;
}

function loadVaultTemplate(runtime: VaultRuntime, name: string): Template | null {
  return runtime.getTemplate(name);
}

async function pickVaultTemplate(
  runtime: VaultRuntime,
  ctx: UiContext,
  query: string,
): Promise<SelectionResult> {
  const templates = runtime.listTemplates();
  const candidates = toVaultCandidates(templates) as FuzzyCandidate[];
  if (candidates.length === 0) {
    const reason = runtime.getVaultQueryError() ? "vault-db-unavailable" : "empty-vault";
    return { selected: null, mode: "fallback", reason };
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
      loadCandidates: () => {
        const templates = runtime.listTemplates();
        const candidates = toVaultCandidates(templates) as FuzzyCandidate[];
        const reason =
          candidates.length === 0
            ? runtime.getVaultQueryError()
              ? "vault-db-unavailable"
              : "empty-vault"
            : undefined;
        return { candidates, reason, metadata: { templateCount: templates.length } };
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
        api,
        selection,
      }: {
        selected: { id: string };
        parsed: { context: string };
        api: {
          setText: (text: string) => void;
          notify?: (message: string, level?: string) => void;
        };
        selection: { mode: "fzf" | "fallback"; reason?: string };
      }) => {
        const template = loadVaultTemplate(runtime, selected.id);
        if (!template) {
          api.notify?.(`Template not found: ${selected.id}`, "error");
          return;
        }
        api.setText(buildVaultPrompt(template, parsed.context));
        const contextSuffix = parsed.context ? " + context" : "";
        api.notify?.(
          `Prepared: ${template.name} (${runtime.facetLabel(template)})${contextSuffix} — ${selectionModeMessage(selection as SelectionResult)}`,
          "info",
        );
        if (template.id)
          runtime.logExecution(template.id, template.name, "live-trigger", parsed.context);
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
    buildVaultPrompt,
    loadVaultTemplate: (name) => loadVaultTemplate(runtime, name),
  };
}
