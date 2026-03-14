export const ONTOLOGY_SCOPES = ["auto", "repo", "company", "core"] as const;
export type OntologyScope = (typeof ONTOLOGY_SCOPES)[number];

export const ONTOLOGY_INSPECT_KINDS = ["status", "search", "pack"] as const;
export type OntologyInspectKind = (typeof ONTOLOGY_INSPECT_KINDS)[number];

export const ONTOLOGY_CHANGE_MODES = ["plan", "apply"] as const;
export type OntologyChangeMode = (typeof ONTOLOGY_CHANGE_MODES)[number];

export const ONTOLOGY_ARTIFACT_KINDS = ["concept", "relation", "system4d", "bridge"] as const;
export type OntologyArtifactKind = (typeof ONTOLOGY_ARTIFACT_KINDS)[number];

export const ONTOLOGY_CHANGE_OPERATIONS = ["create", "update", "upsert"] as const;
export type OntologyChangeOperation = (typeof ONTOLOGY_CHANGE_OPERATIONS)[number];

export const SYSTEM4D_ACTIONS = ["append", "set", "merge"] as const;
export type System4dAction = (typeof SYSTEM4D_ACTIONS)[number];

export type RepoKind = "repo" | "company" | "core" | "none";

export interface RelationEdge {
  type: string;
  target: string;
}

export interface BridgeMapping {
  concept_id: string;
  target: string;
  kind?: string;
  note?: string;
}

export interface WorkspaceContext {
  cwd: string;
  workspaceRoot: string;
  workspaceRefMode: "strict" | "loose";
  currentRepoPath: string;
  currentRepoHasOntology: boolean;
  currentRepoKind: RepoKind;
  currentCompany?: string;
}

export interface ResolvedOntologyTarget {
  scope: Exclude<OntologyScope, "auto">;
  repoPath: string;
  repoKind: RepoKind;
  workspaceRoot: string;
  workspaceRefMode: "strict" | "loose";
  currentCompany?: string;
  reasons: string[];
  externalToCurrentRepo: boolean;
}

export interface OntologyInspectRequest {
  kind: OntologyInspectKind;
  scope?: OntologyScope;
  targetRepo?: string;
  query?: string;
  ontId?: string;
  includeValidation?: boolean;
  depth?: number;
  maxDocs?: number;
}

export interface ValidationFinding {
  rule_id?: string;
  severity?: string;
  message?: string;
  path?: string;
  layer?: string;
  [key: string]: unknown;
}

export interface OntologyStatusReport {
  layers: Array<{
    name: string;
    origin: string;
    kind: string;
    source: string;
  }>;
  counts: {
    concepts: number;
    relations: number;
  };
  validation?: {
    ok: boolean;
    findings: ValidationFinding[];
  };
}

export interface OntologySearchHit {
  ontId: string;
  kind: string;
  layer: string;
  labels: string[];
  title: string;
  definition: string;
  path: string;
  score: number;
}

export interface OntologyInspectResult {
  target: ResolvedOntologyTarget;
  status?: OntologyStatusReport;
  search?: {
    query: string;
    hits: OntologySearchHit[];
  };
  pack?: {
    ontId: string;
    text: string;
  };
  warnings: string[];
}

export interface OntologyChangeRequest {
  mode: OntologyChangeMode;
  scope?: OntologyScope;
  targetRepo?: string;
  artifactKind: OntologyArtifactKind;
  operation: OntologyChangeOperation;
  targetId?: string;
  title?: string;
  description?: string;
  labels?: string[];
  synonyms?: string[];
  relations?: RelationEdge[];
  examples?: string[];
  antiExamples?: string[];
  status?: string;
  deprecated?: Record<string, unknown>;
  relationGroup?: string;
  relationCharacteristics?: Record<string, unknown>;
  inverse?: string;
  domain?: string;
  range?: string;
  notes?: string[];
  rationale?: string;
  bridgeMappings?: BridgeMapping[];
  system4dPath?: string;
  system4dAction?: System4dAction;
  system4dValue?: unknown;
  validateAfter?: boolean;
  buildAfter?: boolean;
}

export interface PlannedWrite {
  path: string;
  existed: boolean;
  summary: string;
  content: string;
}

export interface OntologyChangeResult {
  target: ResolvedOntologyTarget;
  writes: PlannedWrite[];
  validation?: {
    ok: boolean;
    findings: ValidationFinding[];
  };
  build?: {
    ok: boolean;
    summaryPath?: string;
    idIndexPath?: string;
  };
  warnings: string[];
  applied: boolean;
}
