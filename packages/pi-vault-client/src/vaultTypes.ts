import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Text } from "@mariozechner/pi-tui";

export const PROMPT_VAULT_ROOT =
  process.env.PROMPT_VAULT_ROOT || "/home/tryinget/ai-society/core/prompt-vault";
export const VAULT_DIR = process.env.VAULT_DIR || `${PROMPT_VAULT_ROOT}/prompt-vault-db`;
export const VLLM_ENDPOINT = process.env.VLLM_ENDPOINT || "http://localhost:8000";
export const VLLM_MODEL = process.env.VLLM_MODEL || "Qwen/Qwen2.5-3B-Instruct";
export const DEFAULT_VAULT_QUERY_LIMIT = 20;
export const MAX_VAULT_QUERY_LIMIT = 50;
export const INTENT_RANKING_CANDIDATE_POOL_LIMIT = 500;
export const LIVE_VAULT_TRIGGER_ID = "vault-template-live-picker";
export const LIVE_VAULT_TRIGGER_DEBOUNCE_MS = 180;
export const LIVE_VAULT_MIN_QUERY = 0;
export const LIVE_TRIGGER_TELEMETRY_LIMIT = 100;
export const SCHEMA_VERSION = 8;

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
export const RENDER_ENGINES = ["none", "pi-vars", "nunjucks"] as const;

export type Company = (typeof COMPANIES)[number];
export type RenderEngine = (typeof RENDER_ENGINES)[number];
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
  render_engine?: RenderEngine | null;
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
  intent_text?: string;
  controlled_vocabulary?: VaultQueryControlledVocabulary;
}

export interface VaultExecutionContext {
  cwd?: string;
  currentCompany?: string;
}

export interface VaultMutationContext extends VaultExecutionContext {
  actorCompany?: string;
  allowAmbientCwdFallback?: boolean;
}

export interface TemplateUpdatePatch {
  content?: string;
  description?: string;
  artifact_kind?: string;
  control_mode?: string;
  formalization_level?: string;
  owner_company?: string;
  visibility_companies?: string[];
  controlled_vocabulary?: RouterControlledVocabulary;
}

export interface TemplateMutationResult {
  status: "ok" | "error";
  message: string;
  templateId?: number;
}

export type InsertResult = TemplateMutationResult;
export type UpdateResult = TemplateMutationResult;

export interface TemplatePreparationOptions {
  args?: string[];
  currentCompany?: string;
  context?: string;
  templateName?: string;
  data?: Record<string, unknown>;
  appendContextSection?: boolean;
  allowLegacyPiVarsAutoDetect?: boolean;
}

export interface PreparedTemplateSuccess {
  ok: true;
  engine: RenderEngine;
  explicitEngine: RenderEngine | null;
  body: string;
  hasFrontmatter: boolean;
  error: null;
  rendered: string;
  prepared: string;
  renderContext: Record<string, unknown>;
  usedRenderKeys: string[];
  contextAppended: boolean;
}

export interface PreparedTemplateFailure {
  ok: false;
  error: string;
}

export type PreparedTemplateResult = PreparedTemplateSuccess | PreparedTemplateFailure;

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

export type VaultResult<T> =
  | { ok: true; value: T; error: null }
  | { ok: false; value: null; error: string };

export interface VaultRuntime {
  queryVaultJson: (sql: string) => DoltJsonResult | null;
  queryVaultJsonDetailed: (sql: string) => VaultResult<DoltJsonResult>;
  execVault: (sql: string) => boolean;
  commitVault: (message: string) => void;
  escapeSql: (str: string) => string;
  escapeLikePattern: (str: string) => string;
  parseTemplateRows: (result: DoltJsonResult | null) => Template[];
  facetLabel: (
    template: Pick<Template, "artifact_kind" | "control_mode" | "formalization_level">,
  ) => string;
  governanceLabel: (template: Pick<Template, "owner_company" | "visibility_companies">) => string;
  controlledVocabularyLabel: (template: Pick<Template, "controlled_vocabulary">) => string;
  formatTemplateDetails: (
    template: Template,
    includeContent?: boolean,
    options?: { includeGovernance?: boolean },
  ) => string;
  getCurrentCompany: (cwd?: string) => string;
  resolveCurrentCompanyContext: (cwd?: string) => { company: string; source: string };
  buildVisibilityPredicate: (company?: string) => string;
  getContracts: () => GovernedContracts;
  getTemplate: (name: string, context?: VaultExecutionContext) => Template | null;
  getTemplateDetailed: (
    name: string,
    context?: VaultExecutionContext,
  ) => VaultResult<Template | null>;
  listTemplates: (
    filters?: Partial<Pick<Template, "artifact_kind" | "control_mode" | "formalization_level">>,
    context?: VaultExecutionContext,
  ) => Template[];
  listTemplatesDetailed: (
    filters?: Partial<Pick<Template, "artifact_kind" | "control_mode" | "formalization_level">>,
    context?: VaultExecutionContext,
  ) => VaultResult<Template[]>;
  searchTemplates: (query: string, context?: VaultExecutionContext) => Template[];
  searchTemplatesDetailed: (
    query: string,
    context?: VaultExecutionContext,
  ) => VaultResult<Template[]>;
  queryTemplates: (
    filters: VaultQueryFilters,
    limit: number,
    includeContent: boolean,
    context?: VaultExecutionContext,
  ) => Template[];
  queryTemplatesDetailed: (
    filters: VaultQueryFilters,
    limit: number,
    includeContent: boolean,
    context?: VaultExecutionContext,
  ) => VaultResult<Template[]>;
  retrieveByNames: (
    names: string[],
    includeContent: boolean,
    context?: VaultExecutionContext,
  ) => Template[];
  retrieveByNamesDetailed: (
    names: string[],
    includeContent: boolean,
    context?: VaultExecutionContext,
  ) => VaultResult<Template[]>;
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
    context?: VaultMutationContext,
  ) => InsertResult;
  updateTemplate: (
    name: string,
    patch: TemplateUpdatePatch,
    context?: VaultMutationContext,
  ) => UpdateResult;
  rateTemplate: (
    executionId: number,
    rating: number,
    success: boolean,
    notes: string,
    context?: VaultMutationContext,
  ) => { ok: boolean; message: string };
  logExecution: (
    template: Pick<Template, "id" | "version">,
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
  pickVaultTemplate: (ctx: UiContext, query: string) => Promise<SelectionResult>;
  registerVaultLiveTrigger: () => void;
  prepareVaultPrompt: (
    template: Template,
    options?: { context?: string; currentCompany?: string; cwd?: string },
  ) => PreparedTemplateResult;
  loadVaultTemplate: (name: string, context?: VaultExecutionContext) => Template | null;
}

export interface GroundingRuntime {
  buildGroundedNext10Prompt: (
    commandText: string,
    options?: { cwd?: string; currentCompany?: string },
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
