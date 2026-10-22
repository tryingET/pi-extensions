// summary: Read-only recovery observation types; not AK custody or reopen authority.
export interface ProcessObservation {
  pid: number;
  ppid: number;
  startTicks: string;
  birthMs: number;
  bootId: string;
  pidDomain: string;
  executable: string;
  executableIdentity: string;
  selectorDigest?: string;
  cwd: string;
  harness: string;
}
export interface SessionObservation {
  harness: string;
  sessionId: string | null;
  pid: number;
  source: string;
  sourceRef: string;
  cwd: string;
  startedAt: number;
  pidDomain: string | null;
  procStart: string | null;
  bootId?: string | null;
  changed: boolean;
  updatedAt?: number;
  transcripts: TranscriptObservation[];
}
export interface TranscriptObservation {
  path: string;
  state: string;
  method: string;
  identity?: string;
  size?: number;
  changed?: boolean;
  sessionId?: string | null;
}
export interface WindowObservation {
  id: number;
  pid: number | null;
  workspace_id: number | null;
}
export interface WorkspaceObservation {
  id: number;
  idx: number;
}
export interface SourceCoverage {
  source: string;
  state: string;
  observed: number;
  rejected: number;
  limitations: string[];
}
export interface ClaimObservation {
  id: number;
  claimed_by: string;
  status: string;
  lease_expires_at: string;
}
export interface RecoveryInputs {
  startedAt: number;
  endedAt: number;
  bootId: string;
  pidDomain: string;
  before: ProcessObservation[];
  after: ProcessObservation[];
  sessions: SessionObservation[];
  windows: WindowObservation[];
  windowsAfter: WindowObservation[];
  workspaces: WorkspaceObservation[];
  workspacesAfter: WorkspaceObservation[];
  claims: ClaimObservation[];
  sources: SourceCoverage[];
}
