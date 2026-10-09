import type { RevisionRecord, SnapshotStore } from "./snapshot-store.js";

export type { RevisionRecord, Snapshot, SnapshotStore } from "./snapshot-store.js";

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
 * The revisions a transcript's successful snapshot reads and edits issued (pi-ai messages in order),
 * for SnapshotEditService#restoreRevisions after a reload or resume. Results without a canonical
 * path in their details resolve the call's path against `cwd`.
 */
export function revisionsFromMessages(messages: readonly unknown[], cwd: string): RevisionRecord[];

/** The same, from Pi session entries ({ type: "message", message }). */
export function revisionsFromEntries(entries: readonly unknown[], cwd: string): RevisionRecord[];

/**
 * Models naturally copy the rendered `revision:<alias>` header line. Accept both
 * forms by stripping one optional header prefix and surrounding whitespace.
 */
export function normalizeRevisionAlias(value: string): string;

/**
 * Reads a text file into a revision, and edits a file only against the revision it was read as.
 * A revision is valid exactly while its file holds the bytes it names (content-addressed).
 */
export class SnapshotEditService {
  constructor(options?: {
    store?: SnapshotStore;
    mutationQueue?: SnapshotMutationQueue;
    /** Passed to the default store: called for every newly issued revision. */
    onRevision?: (record: RevisionRecord) => void;
  });
  readonly store: SnapshotStore;
  /** Recognize revisions an earlier process issued (for example from a session's earlier results). */
  restoreRevisions(records: Iterable<RevisionRecord>): void;
  read(
    request: { path: string; offset?: number; limit?: number },
    cwd: string,
  ): Promise<
    SnapshotResult<{
      revision: string;
      digest: string;
      /** Canonical path the revision was read from. */
      path: string;
      lineCount: number;
      offset: number;
      returnedLines: number;
      truncated: boolean;
    }>
  >;
  /**
   * Rejects, reporting every problem in the batch at once, when a selector does not resolve
   * exactly, operations conflict, or the file no longer holds the bytes `base` names.
   */
  edit(
    request: { path: string; base: string; edits: SnapshotEdit[] },
    cwd: string,
    signal?: AbortSignal,
  ): Promise<
    SnapshotResult<{
      baseRevision: string;
      revision: string;
      digest: string;
      path: string;
      editsApplied: number;
      lineCount: number;
      /** 1-indexed [first, last] line of each changed region in the new revision. */
      changedLines: [number, number][];
    }>
  >;
  clear(): void;
  stats(): { count: number; bytes: number; known: number };
}
