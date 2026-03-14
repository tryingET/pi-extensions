import type { ValidationFinding } from "../core/contracts.ts";

export interface RocsCommandContext {
  workspaceRoot: string;
  workspaceRefMode: "strict" | "loose";
  resolveRefs: boolean;
}

export interface RocsSummaryResult {
  layers: Array<{
    name: string;
    origin: string;
    src_root: string;
    kind: string;
    source: string;
  }>;
  counts: {
    concepts: number;
    relations: number;
  };
}

export interface RocsValidateResult {
  ok: boolean;
  findings: ValidationFinding[];
}

export interface RocsBuildResult {
  ok: boolean;
  dist: {
    dir: string;
    files: {
      resolve?: string;
      summary?: string;
      id_index?: string;
      authority_receipt?: string;
      authority_receipt_command?: string;
    };
  };
}

export interface RocsPackResult {
  text: string;
}

export interface RocsPort {
  summary(repoPath: string, context: RocsCommandContext): Promise<RocsSummaryResult>;
  validate(repoPath: string, context: RocsCommandContext): Promise<RocsValidateResult>;
  build(repoPath: string, context: RocsCommandContext): Promise<RocsBuildResult>;
  pack(
    repoPath: string,
    ontId: string,
    context: RocsCommandContext,
    options?: { depth?: number; maxDocs?: number },
  ): Promise<RocsPackResult>;
}
