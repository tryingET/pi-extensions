import type { ValidationFinding } from "../core/contracts.ts";
import type { BoundPackResult, DiscoveryResult } from "../semantic/protocol.ts";
import type { RocsRunnerDescriptor } from "../semantic/runner.ts";

export interface RocsCommandContext {
  workspaceRoot: string;
  workspaceRefMode: "strict" | "loose";
  resolveRefs: boolean;
  /** Optional shared monotonic deadline for prompt-run calls. */
  deadline?: number;
  /** Generation-scoped cancellation; never sourced from ambient process state. */
  signal?: AbortSignal;
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

export type RocsProtocolCall<T> =
  | { invocation: "ok"; result: T }
  | {
      invocation: "unavailable" | "timeout" | "incompatible" | "resource_exhausted";
      message: string;
    };

export interface RocsDevelopmentPort {
  readonly developmentDescriptor: RocsRunnerDescriptor;
  discover(
    repoPath: string,
    query: string,
    profile: string,
    context: RocsCommandContext,
  ): Promise<RocsProtocolCall<DiscoveryResult>>;
  boundPack(
    repoPath: string,
    ontId: string,
    profile: string,
    expectedSnapshotDigest: string,
    expectedDocumentDigest: string,
    context: RocsCommandContext,
    options?: { depth?: number; maxDocs?: number },
  ): Promise<RocsProtocolCall<BoundPackResult>>;
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
  readonly developmentDescriptor?: RocsRunnerDescriptor;
  discover?: RocsDevelopmentPort["discover"];
  boundPack?: RocsDevelopmentPort["boundPack"];
}
