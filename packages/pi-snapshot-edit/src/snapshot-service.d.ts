import type { SnapshotStore } from "./snapshot-store.js";

export type { Snapshot, SnapshotStore } from "./snapshot-store.js";

/** Replace one exact occurrence of `oldText`; `occurrence` (1-indexed) is required when it repeats. */
export interface SnapshotReplaceEdit {
  op: "replace";
  oldText: string;
  newText: string;
  occurrence?: number;
}

/** Insert `newText` right after one exact occurrence of `anchorText`. */
export interface SnapshotInsertAfterEdit {
  op: "insert_after";
  anchorText: string;
  newText: string;
  occurrence?: number;
}

export type SnapshotEdit = SnapshotReplaceEdit | SnapshotInsertAfterEdit;

export interface SnapshotResult<Details> {
  text: string;
  details: Details;
}

export type SnapshotMutationQueue = (
  path: string,
  operation: () => Promise<SnapshotResult<Record<string, unknown>>>,
) => Promise<SnapshotResult<Record<string, unknown>>>;

/**
 * Models naturally copy the rendered `revision:<alias>` header line. Accept both
 * forms by stripping one optional header prefix and surrounding whitespace.
 */
export function normalizeRevisionAlias(value: string): string;

/** Reads a text file into a revision, and edits a file only against the revision it was read as. */
export class SnapshotEditService {
  constructor(options?: { store?: SnapshotStore; mutationQueue?: SnapshotMutationQueue });
  readonly store: SnapshotStore;
  read(
    request: { path: string; offset?: number; limit?: number },
    cwd: string,
  ): Promise<
    SnapshotResult<{
      revision: string;
      digest: string;
      lineCount: number;
      offset: number;
      returnedLines: number;
      truncated: boolean;
    }>
  >;
  /** Rejects when the file changed since `base` was read, or `base` was evicted. */
  edit(
    request: { path: string; base: string; edits: SnapshotEdit[] },
    cwd: string,
    signal?: AbortSignal,
  ): Promise<SnapshotResult<Record<string, unknown>>>;
  clear(): void;
  stats(): { count: number; bytes: number };
}
