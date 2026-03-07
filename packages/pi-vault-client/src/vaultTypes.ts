import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Text } from "@mariozechner/pi-tui";

export const VAULT_DIR =
  process.env.VAULT_DIR || "/home/tryinget/ai-society/core/prompt-vault/prompt-vault-db";
export const VLLM_ENDPOINT = process.env.VLLM_ENDPOINT || "http://localhost:8000";
export const VLLM_MODEL = process.env.VLLM_MODEL || "Qwen/Qwen2.5-3B-Instruct";
export const DEFAULT_VAULT_QUERY_LIMIT = 5;
export const MAX_VAULT_QUERY_LIMIT = 50;
export const LIVE_VAULT_TRIGGER_ID = "vault-template-live-picker";
export const LIVE_VAULT_TRIGGER_DEBOUNCE_MS = 180;
export const LIVE_VAULT_MIN_QUERY = 0;
export const LIVE_TRIGGER_TELEMETRY_LIMIT = 100;
export const SCHEMA_VERSION = 3;

export interface FuzzyCandidate {
  id: string;
  label: string;
  detail?: string;
  preview?: string;
  source: "ptx" | "vault";
}

export interface SelectionResult {
  selected: FuzzyCandidate | null;
  mode: "fzf" | "fallback";
  reason?: string;
}

export interface UiContext {
  hasUI: boolean;
  ui: {
    select: (title: string, options: string[]) => Promise<string | null>;
    notify: (message: string, level?: string) => void;
    editor: (title: string, content: string) => Promise<string | undefined>;
    setEditorText: (text: string) => void;
  };
  cwd?: string;
  model?: { id?: string };
}

export interface Template {
  name: string;
  description: string;
  content: string;
  artifact_kind: string;
  control_mode: string;
  formalization_level: string;
  tags: string[];
  id?: number;
}

export interface DoltJsonResult {
  rows: Record<string, unknown>[];
}

export interface InsertResult {
  status: "ok" | "confirm" | "error";
  message: string;
  newTags?: string[];
  existingVocab?: Record<string, string[]>;
  templateId?: number;
}

export interface LiveTriggerTelemetryEvent {
  timestamp: string;
  event: string;
  triggerId?: string;
  query?: string;
  contextLength?: number;
  candidateCount?: number;
  selectedId?: string;
  selectedLabel?: string;
  mode?: string;
  reason?: string;
  error?: string;
}

export interface ParsedDsl {
  map: Record<string, string>;
  freeform: string[];
  warnings: string[];
}

export interface FrameworkResolution {
  selected: Template[];
  retrievalMethod: "exact" | "discovery" | "mixed" | "none";
  discoveryUsed: 0 | 1;
  invalidOverrides: string[];
}

export interface VaultRuntime {
  queryVaultJson: (sql: string) => DoltJsonResult | null;
  execVault: (sql: string) => boolean;
  commitVault: (message: string) => void;
  escapeSql: (str: string) => string;
  escapeLikePattern: (str: string) => string;
  clearVaultQueryError: () => void;
  setVaultQueryError: (error: unknown) => void;
  getVaultQueryError: () => string | null;
  parseTemplateRows: (result: DoltJsonResult | null) => Template[];
  facetLabel: (
    template: Pick<Template, "artifact_kind" | "control_mode" | "formalization_level">,
  ) => string;
  getTemplate: (name: string) => Template | null;
  listTemplates: (
    filters?: Partial<Pick<Template, "artifact_kind" | "control_mode" | "formalization_level">>,
  ) => Template[];
  searchTemplates: (query: string) => Template[];
  queryTemplates: (
    tags: string[],
    keywords: string[],
    limit: number,
    includeContent: boolean,
    artifactKinds: string[],
    controlModes: string[],
    formalizationLevels: string[],
  ) => Template[];
  retrieveByNames: (names: string[], includeContent: boolean) => Template[];
  getVocabulary: () => Record<string, string[]>;
  insertTemplate: (
    name: string,
    content: string,
    description: string,
    tags: string[],
    artifactKind: string,
    controlMode: string,
    formalizationLevel: string,
    confirmNewTags: boolean,
  ) => InsertResult;
  rateTemplate: (
    templateName: string,
    variant: string,
    rating: number,
    success: boolean,
    notes: string,
  ) => { ok: boolean; message: string };
  logExecution: (
    templateId: number,
    templateName: string,
    model: string,
    inputContext?: string,
  ) => void;
  checkSchemaVersion: () => boolean;
}

export interface PickerRuntime {
  recordLiveTriggerTelemetry: (event: Record<string, unknown>) => void;
  summarizeLiveTriggerTelemetry: () => string;
  selectionModeMessage: (selection: SelectionResult) => string;
  splitVaultQueryAndContext: (rest: string) => { query: string; context: string };
  parseVaultSelectionInput: (text: string) => { query: string; context: string } | null;
  rankVaultCandidates: (
    candidates: FuzzyCandidate[],
    query: string,
  ) => { ranked: FuzzyCandidate[]; mode: "fzf" | "fallback"; reason?: string };
  buildVaultBrowserReport: (
    query: string,
    candidates: FuzzyCandidate[],
    ranking: { ranked: FuzzyCandidate[]; mode: "fzf" | "fallback"; reason?: string },
    runtime: VaultRuntime,
  ) => string;
  pickVaultTemplate: (ctx: UiContext, query: string) => Promise<SelectionResult>;
  registerVaultLiveTrigger: () => void;
  buildVaultPrompt: (template: Template, context: string) => string;
  loadVaultTemplate: (name: string) => Template | null;
}

export interface GroundingRuntime {
  buildGroundedNext10Prompt: (
    commandText: string,
  ) => { ok: true; prompt: string } | { ok: false; reason: string };
}

export interface VaultModuleRuntime extends VaultRuntime, PickerRuntime, GroundingRuntime {}

export function renderTextPreview(result: {
  content: Array<{ type: string; text?: string }>;
}): Text {
  const text = result.content[0];
  return new Text(text?.type === "text" ? String(text.text || "").slice(0, 200) : "", 0, 0);
}

export type PiExtension = ExtensionAPI;
