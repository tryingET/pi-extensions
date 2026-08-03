export const ASC_REWIND_LEDGER_VERSION = 1;
export const REWIND_STORE_REF = "refs/pi-rewind/store";
export const EMPTY_TREE_SHA = "4b825dc642cb6eb9a060e54bf8d69288fbee4904";

export interface SnapshotRef {
  commitSha: string;
  treeSha: string;
}

export interface RestoreExactResult {
  changed: boolean;
  undoCommitSha?: string;
  targetTreeSha: string;
}

export type BindingTuple = [entryId: string, snapshotIndex: number];

export interface GitCommandResult {
  stdout: string;
  stderr: string;
  code: number;
}

export interface GitCommandOptions {
  env?: NodeJS.ProcessEnv;
  stdin?: string;
}

export type GitRunner = (args: string[], options?: GitCommandOptions) => Promise<GitCommandResult>;
