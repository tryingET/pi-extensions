import path from "node:path";

export const KES_CONTRACT_VERSION = 1 as const;
export const KES_PACKAGE_NAME = "pi-society-orchestrator";
export const KES_DIARY_DIR = "diary";
export const KES_LEARNINGS_DIR = path.join("docs", "learnings");
export const KES_ALLOWED_ROOTS = [KES_DIARY_DIR, KES_LEARNINGS_DIR] as const;

export type KesDiaryKind = "session" | "phase" | "complete" | "decision" | "validation";
export type KesLearningKind = "learning" | "anti-pattern" | "contract" | "guardrail";
export type KesArtifactKind = "diary" | "learning_candidate";
export type KesSourceKind = "loop_phase" | "loop_summary" | "manual";

export interface KesSourceRef {
  kind: KesSourceKind;
  packageName?: string;
  loop?: string;
  phase?: string;
  sessionId?: string;
  objective: string;
}

export interface KesDiaryEntryInput {
  kind: KesDiaryKind;
  summary: string;
  source: KesSourceRef;
  actions: string[];
  surprises?: string[];
  patterns?: string[];
  candidateHints?: string[];
  followUps?: string[];
  metadata?: Record<string, unknown>;
  timestamp?: Date;
}

export interface KesLearningCandidateInput {
  kind: KesLearningKind;
  summary: string;
  claim: string;
  evidence: string[];
  heuristics?: string[];
  antiPatterns?: string[];
  followUps?: string[];
  metadata?: Record<string, unknown>;
}

export interface KesArtifactRequest {
  diary: KesDiaryEntryInput;
  learningCandidate?: KesLearningCandidateInput;
}

export interface KesRoots {
  packageRoot: string;
  diaryDir: string;
  learningsDir: string;
  diaryRelativeDir: string;
  learningsRelativeDir: string;
}

export interface KesArtifactDraft {
  kind: KesArtifactKind;
  relativePath: string;
  absolutePath: string;
  title: string;
  content: string;
  metadata: Record<string, unknown>;
}

export interface KesArtifactPlan {
  version: typeof KES_CONTRACT_VERSION;
  roots: KesRoots;
  diary: KesArtifactDraft;
  learningCandidate?: KesArtifactDraft;
}
