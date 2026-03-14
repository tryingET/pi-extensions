import type {
  OntologyArtifactKind,
  OntologyScope,
  ResolvedOntologyTarget,
  WorkspaceContext,
} from "../core/contracts.ts";

export interface ResolveTargetParams {
  cwd: string;
  scope?: OntologyScope;
  targetRepo?: string;
  targetId?: string;
  artifactKind?: OntologyArtifactKind;
}

export interface WorkspacePort {
  detect(cwd: string): Promise<WorkspaceContext>;
  resolveTarget(params: ResolveTargetParams): Promise<ResolvedOntologyTarget>;
}
