import type { CustomEditor, ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { createEditorRegistry, TriggerEditor } from "@tryinget/pi-editor-registry";
import { registerPickerInteraction, splitQueryAndContext } from "@tryinget/pi-trigger-adapter";
import {
  ONTOLOGY_SCOPES,
  type OntologyInspectRequest,
  type OntologyScope,
  type OntologySearchHit,
} from "../core/contracts.ts";
import { inspectOntology } from "../core/inspect.ts";
import type { FilesPort } from "../ports/files-port.ts";
import type { RocsPort } from "../ports/rocs-port.ts";
import type { WorkspacePort } from "../ports/workspace-port.ts";

const ENABLED_ENV = "PI_ONTOLOGY_INTERACTION_ENABLED";
const LEGACY_MODE_ENV = "PI_ONTOLOGY_INTERACTION_LEGACY_MODE";

const editorRegistry = createEditorRegistry({ ownerId: "@tryinget/pi-ontology-workflows" });

export interface OntologyInteractionDeps {
  files: FilesPort;
  rocs: RocsPort;
  workspace: WorkspacePort;
}

export interface InteractionCandidate {
  id: string;
  label: string;
  detail: string;
  preview: string;
  source: string;
  ontId: string;
  kind: string;
  scope: Exclude<OntologyScope, "auto">;
  title: string;
}

export function registerOntologyInteractionRuntime(
  pi: ExtensionAPI,
  deps: OntologyInteractionDeps,
): void {
  if (!interactionEnabled()) {
    return;
  }

  registerOntologyPickerInteractions(pi, deps);

  pi.on("session_start", (_event, ctx) => {
    if (!ctx.hasUI || legacyModeEnabled()) return;

    editorRegistry.mount({
      ctx,
      factory: (tui: unknown, theme: unknown, keybindings: unknown) => {
        return new TriggerEditor(tui, theme, keybindings, pi, ctx.ui, {
          cwd: ctx.cwd,
          sessionKey: `ontology-workflows:${ctx.cwd}`,
        }) as unknown as CustomEditor;
      },
    });
  });
}

export function toInteractionCandidate(
  hit: OntologySearchHit,
  requestedScope: OntologyScope = "auto",
): InteractionCandidate {
  const scope = requestedScope !== "auto" ? requestedScope : inferScopeFromLayer(hit.layer);
  const detailParts = [hit.kind, hit.layer, hit.title || hit.labels[0] || "untitled"];
  return {
    id: hit.ontId,
    ontId: hit.ontId,
    kind: hit.kind,
    scope,
    title: hit.title,
    label: hit.ontId,
    detail: detailParts.join(" • "),
    preview: hit.definition,
    source: "ontology",
  };
}

export function buildPackInsertion(candidate: InteractionCandidate): string {
  return [
    `Use ontology_inspect with kind=pack, scope=${candidate.scope}, ontId="${candidate.ontId}".`,
    "Then summarize only the most relevant semantic details.",
  ].join(" ");
}

export function buildChangePlanInsertion(candidate: InteractionCandidate): string {
  const artifactKind = candidate.kind === "relation" ? "relation" : "concept";
  return [
    `Use ontology_change with mode=plan, artifactKind=${artifactKind}, operation=update, scope=${candidate.scope}, targetId="${candidate.ontId}".`,
    "Fill the remaining fields from my request and do not apply yet.",
  ].join(" ");
}

function registerOntologyPickerInteractions(_pi: unknown, deps: OntologyInteractionDeps): void {
  registerPickerInteraction({
    id: "ontology-id-picker",
    description: "Pick an ontology id while typing /ontology:<query>[::scope]",
    priority: 100,
    match: /^\/ontology:(.*)$/,
    requireCursorAtEnd: true,
    debounceMs: 120,
    showInPicker: true,
    pickerLabel: "/ontology:",
    pickerDetail: "Insert ontology id",
    minQueryLength: 0,
    loadCandidates: async ({
      parsed,
      api,
    }: {
      parsed: { query: string; context: string };
      api?: unknown;
    }) => {
      const scope = normalizeScope(parsed.context);
      const result = await inspectOntology(
        {
          kind: "search",
          scope,
          query: parsed.query,
        } satisfies OntologyInspectRequest,
        { cwd: getApiCwd(api) },
        deps,
      );
      return {
        candidates: (result.search?.hits ?? []).map((hit) => toInteractionCandidate(hit, scope)),
        reason: result.search?.hits.length ? undefined : "no-ontology-hits",
      };
    },
    parseInput: (match: { groups?: string[] }) => {
      const raw = String(match?.groups?.[0] ?? "");
      const parsed = splitQueryAndContext(raw, "::");
      return { query: parsed.query, context: parsed.context, raw };
    },
    selectTitle: ({ query, context }: { query: string; context: string }) =>
      `Pick ontology id${context ? ` (${context})` : ""}${query ? ` — ${query}` : ""}`,
    applySelection: ({
      selected,
      api,
    }: {
      selected: InteractionCandidate;
      api: { setText: (text: string) => void };
    }) => {
      api.setText(selected.ontId);
    },
    onNoCandidates: ({
      api,
    }: {
      api: { notify?: (message: string, level?: "info" | "warning" | "error") => void };
    }) => {
      api.notify?.("No ontology matches", "warning");
    },
  });

  registerPickerInteraction({
    id: "ontology-pack-picker",
    description: "Pick an ontology item and insert an ontology_inspect pack request",
    priority: 95,
    match: /^\/ontology-pack:(.*)$/,
    requireCursorAtEnd: true,
    debounceMs: 120,
    showInPicker: true,
    pickerLabel: "/ontology-pack:",
    pickerDetail: "Insert ontology_inspect pack prompt",
    minQueryLength: 0,
    loadCandidates: async ({
      parsed,
      api,
    }: {
      parsed: { query: string; context: string };
      api?: unknown;
    }) => {
      const scope = normalizeScope(parsed.context);
      const result = await inspectOntology(
        {
          kind: "search",
          scope,
          query: parsed.query,
        } satisfies OntologyInspectRequest,
        { cwd: getApiCwd(api) },
        deps,
      );
      return {
        candidates: (result.search?.hits ?? []).map((hit) => toInteractionCandidate(hit, scope)),
        reason: result.search?.hits.length ? undefined : "no-ontology-hits",
      };
    },
    parseInput: (match: { groups?: string[] }) => {
      const raw = String(match?.groups?.[0] ?? "");
      const parsed = splitQueryAndContext(raw, "::");
      return { query: parsed.query, context: parsed.context, raw };
    },
    selectTitle: ({ query, context }: { query: string; context: string }) =>
      `Pick ontology pack target${context ? ` (${context})` : ""}${query ? ` — ${query}` : ""}`,
    applySelection: ({
      selected,
      api,
    }: {
      selected: InteractionCandidate;
      api: { setText: (text: string) => void };
    }) => {
      api.setText(buildPackInsertion(selected));
    },
  });

  registerPickerInteraction({
    id: "ontology-change-picker",
    description: "Pick an ontology item and insert an ontology_change plan request",
    priority: 90,
    match: /^\/ontology-change:(.*)$/,
    requireCursorAtEnd: true,
    debounceMs: 120,
    showInPicker: true,
    pickerLabel: "/ontology-change:",
    pickerDetail: "Insert ontology_change plan prompt",
    minQueryLength: 0,
    loadCandidates: async ({
      parsed,
      api,
    }: {
      parsed: { query: string; context: string };
      api?: unknown;
    }) => {
      const scope = normalizeScope(parsed.context);
      const result = await inspectOntology(
        {
          kind: "search",
          scope,
          query: parsed.query,
        } satisfies OntologyInspectRequest,
        { cwd: getApiCwd(api) },
        deps,
      );
      return {
        candidates: (result.search?.hits ?? []).map((hit) => toInteractionCandidate(hit, scope)),
        reason: result.search?.hits.length ? undefined : "no-ontology-hits",
      };
    },
    parseInput: (match: { groups?: string[] }) => {
      const raw = String(match?.groups?.[0] ?? "");
      const parsed = splitQueryAndContext(raw, "::");
      return { query: parsed.query, context: parsed.context, raw };
    },
    selectTitle: ({ query, context }: { query: string; context: string }) =>
      `Pick ontology change target${context ? ` (${context})` : ""}${query ? ` — ${query}` : ""}`,
    applySelection: ({
      selected,
      api,
    }: {
      selected: InteractionCandidate;
      api: { setText: (text: string) => void };
    }) => {
      api.setText(buildChangePlanInsertion(selected));
    },
  });
}

function getApiCwd(api: unknown): string {
  const ctx = isRecord(api) && isRecord(api.ctx) ? api.ctx : undefined;
  const cwd = typeof ctx?.cwd === "string" ? ctx.cwd.trim() : "";
  return cwd || process.cwd();
}

function inferScopeFromLayer(layer: string): Exclude<OntologyScope, "auto"> {
  if (layer === "core") return "core";
  if (layer === "company") return "company";
  return "repo";
}

function normalizeScope(value: string): OntologyScope {
  return ONTOLOGY_SCOPES.includes(value as OntologyScope) ? (value as OntologyScope) : "auto";
}

function interactionEnabled(): boolean {
  const raw = process.env[ENABLED_ENV];
  if (raw === undefined) return true;
  return raw !== "0" && raw.toLowerCase() !== "false";
}

function legacyModeEnabled(): boolean {
  const raw = process.env[LEGACY_MODE_ENV]?.trim().toLowerCase();
  return raw === "1" || raw === "true";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
