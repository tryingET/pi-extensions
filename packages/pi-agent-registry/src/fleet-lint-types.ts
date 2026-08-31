// ---
// summary: versioned non-authorizing fleet-lint report and stable diagnostic vocabulary.
// read_when:
//   - changing fleet lint machine output, severity semantics, immutable observations, or lifecycle claims.
// ---

export const AGENT_FLEET_LINT_SCHEMA = "ai-society.agent-fleet-lint/1";
export type FleetLintSeverity = "error" | "warning" | "info";

export interface FleetLintDiagnostic {
  code: string;
  severity: FleetLintSeverity;
  repo: string;
  path?: string;
  message: string;
  hint?: string;
}

export interface FleetLintRepositoryRevision {
  commit?: string;
  treeOid?: string;
  status: "clean_observed" | "dirty" | "invalid" | "concurrent_change";
  statusSha256?: string;
  snapshotSha256?: string;
}

export interface FleetLintRepositoryResult {
  repo: string;
  repoName: string;
  revision: FleetLintRepositoryRevision;
  manifest: {
    present: boolean;
    schema?: string;
    name?: string;
    role?: string;
    creationTask?: string;
    blobOid?: string;
    sha256?: string;
  };
  profile?: {
    requested?: string;
    resolved?: string;
    status: "canonical" | "deprecated_alias" | "unknown" | "none";
  };
  prompt: {
    status: "current" | "stale" | "missing" | "unverifiable";
    actualSha256?: string;
    expectedSha256?: string;
    inputSha256?: string;
    compilerContract: string;
  };
  template: {
    mode: "managed_v2" | "legacy" | "unknown";
    provenanceStatus: "verified_local_source" | "unbound" | "invalid";
    sourcePath?: string;
    sourceRevision?: string;
    sourceTreeOid?: string;
    answersSha256?: string;
    ownershipSha256?: string;
  };
  lifecycle: {
    signal: "recent_activity" | "stale_candidate" | "unknown";
    latestActivityAt?: string;
    authorityEffect: "none";
  };
  diagnostics: FleetLintDiagnostic[];
}

export interface FleetLintCollision {
  kind: "name" | "role";
  normalizedValue: string;
  repositories: string[];
}

export interface AgentFleetLintReport {
  schema: typeof AGENT_FLEET_LINT_SCHEMA;
  kind: "immutable_observation";
  authorityEffect: "none";
  observedAt: string;
  roots: string[];
  profileSource: {
    path: string;
    schema: string;
    rawSha256: string;
    commit?: string;
    blobOid?: string;
    committedSha256?: string;
    status: "bound" | "dirty" | "invalid";
  };
  policy: {
    staleAfterDays: number;
    lifecycleAuthority: "advisory_signal_only";
    dispatchPosture: "fleet_phase_0_disabled";
  };
  repositories: FleetLintRepositoryResult[];
  collisions: FleetLintCollision[];
  diagnostics: FleetLintDiagnostic[];
  summary: {
    status: "healthy" | "unhealthy";
    candidateRepositories: number;
    includedRepositories: number;
    omittedRepositories: number;
    manifests: number;
    errors: number;
    warnings: number;
    infos: number;
    recentActivitySignals: number;
    staleCandidateSignals: number;
    unknownLifecycleSignals: number;
  };
  reportSha256: string;
  stateSha256: string;
}
