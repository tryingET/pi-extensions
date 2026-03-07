import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Text } from "@mariozechner/pi-tui";

export const PROMPT_VAULT_ROOT =
  process.env.PROMPT_VAULT_ROOT || "/home/tryinget/ai-society/core/prompt-vault";
export const VAULT_DIR = process.env.VAULT_DIR || `${PROMPT_VAULT_ROOT}/prompt-vault-db`;
export const VLLM_ENDPOINT = process.env.VLLM_ENDPOINT || "http://localhost:8000";
export const VLLM_MODEL = process.env.VLLM_MODEL || "Qwen/Qwen2.5-3B-Instruct";
export const DEFAULT_VAULT_QUERY_LIMIT = 5;
export const MAX_VAULT_QUERY_LIMIT = 50;
export const LIVE_VAULT_TRIGGER_ID = "vault-template-live-picker";
export const LIVE_VAULT_TRIGGER_DEBOUNCE_MS = 180;
export const LIVE_VAULT_MIN_QUERY = 0;
export const LIVE_TRIGGER_TELEMETRY_LIMIT = 100;
export const SCHEMA_VERSION = 7;

export const COMPANIES = [
  "core",
  "software",
  "finance",
  "house",
  "health",
  "teaching",
  "holding",
] as const;

export const ARTIFACT_KINDS = ["cognitive", "procedure", "session"] as const;
export const CONTROL_MODES = ["one_shot", "router", "loop"] as const;
export const FORMALIZATION_LEVELS = ["napkin", "bounded", "structured", "workflow"] as const;
export const CONTROLLED_VOCABULARY_DIMENSIONS = [
  "routing_context",
  "activity_phase",
  "input_artifact",
  "transition_target_type",
  "selection_principles",
  "output_commitment",
] as const;

export type Company = (typeof COMPANIES)[number];
export type ArtifactKind = (typeof ARTIFACT_KINDS)[number];
export type ControlMode = (typeof CONTROL_MODES)[number];
export type FormalizationLevel = (typeof FORMALIZATION_LEVELS)[number];
export type ControlledVocabularyDimension = (typeof CONTROLLED_VOCABULARY_DIMENSIONS)[number];

export interface RouterControlledVocabulary {
  routing_context?: string;
  activity_phase?: string;
  input_artifact?: string;
  transition_target_type?: string;
  selection_principles?: string[];
  output_commitment?: string;
}

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
  artifact_kind: ArtifactKind | string;
  control_mode: ControlMode | string;
  formalization_level: FormalizationLevel | string;
  owner_company: Company | string;
  visibility_companies: string[];
  controlled_vocabulary: RouterControlledVocabulary | null;
  status?: string;
  export_to_pi?: boolean;
  version?: number;
  id?: number;
}

export interface DoltJsonResult {
  rows: Record<string, unknown>[];
}

export interface VaultQueryControlledVocabulary {
  routing_context?: string[];
  activity_phase?: string[];
  input_artifact?: string[];
  transition_target_type?: string[];
  selection_principles?: string[];
  output_commitment?: string[];
}

export interface VaultQueryFilters {
  artifact_kind?: string[];
  control_mode?: string[];
  formalization_level?: string[];
  owner_company?: string[];
  visibility_company?: string;
  controlled_vocabulary?: VaultQueryControlledVocabulary;
}

export interface InsertResult {
  status: "ok" | "error";
  message: string;
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

export interface GovernedContracts {
  ontology: {
    facets: {
      artifact_kind: string[];
      control_mode: string[];
      formalization_level: string[];
    };
  };
  controlledVocabulary: {
    dimensions: Record<string, string[]>;
    router_required_dimensions: string[];
  };
  companyVisibility: {
    companies: string[];
    defaults?: {
      owner_company?: string;
      visibility_companies?: string[];
    };
  };
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
  governanceLabel: (template: Pick<Template, "owner_company" | "visibility_companies">) => string;
  controlledVocabularyLabel: (template: Pick<Template, "controlled_vocabulary">) => string;
  formatTemplateDetails: (template: Template, includeContent?: boolean) => string;
  getCurrentCompany: () => string;
  buildVisibilityPredicate: (company?: string) => string;
  getContracts: () => GovernedContracts;
  getTemplate: (name: string) => Template | null;
  listTemplates: (
    filters?: Partial<Pick<Template, "artifact_kind" | "control_mode" | "formalization_level">>,
  ) => Template[];
  searchTemplates: (query: string) => Template[];
  queryTemplates: (
    filters: VaultQueryFilters,
    limit: number,
    includeContent: boolean,
  ) => Template[];
  retrieveByNames: (names: string[], includeContent: boolean) => Template[];
  getVocabulary: () => Record<string, string[]>;
  insertTemplate: (
    name: string,
    content: string,
    description: string,
    artifactKind: string,
    controlMode: string,
    formalizationLevel: string,
    ownerCompany: string,
    visibilityCompanies: string[],
    controlledVocabulary: RouterControlledVocabulary | null,
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
