/** One indexed line of a snapshot's text; offsets are UTF-16 indices into `text`. */
export interface SnapshotLine {
  start: number;
  contentEnd: number;
  end: number;
  text: string;
}

/** What the service records for a read or a committed edit. */
export interface SnapshotInput {
  path: string;
  bytes: Buffer;
  text: string;
  hasBom: boolean;
  lines: SnapshotLine[];
  preferredEol: "\n" | "\r\n";
  mode: number;
  identity: { dev: number; ino: number };
}

/** A stored snapshot: the input plus its alias, SHA-256 digest of `bytes`, and creation time. */
export interface Snapshot extends SnapshotInput {
  alias: string;
  digest: string;
  createdAt: string;
}

/** What a revision names: exact bytes (by SHA-256) read from one canonical path. */
export interface RevisionRecord {
  alias: string;
  path: string;
  digest: string;
}

export function digestBytes(bytes: Buffer): string;

/**
 * Bounded immutable snapshots under word aliases, evicted oldest first, plus a ledger of every
 * alias issued or restored, so a revision whose bytes are gone can rehydrate from its file.
 */
export class SnapshotStore {
  constructor(options?: {
    maxSnapshots?: number;
    maxBytes?: number;
    /** Ledger records kept (at least maxSnapshots); oldest are forgotten first. */
    maxLedger?: number;
    words?: string[];
    /** Called for every newly issued revision, for hosts that persist the ledger themselves. */
    onRevision?: (record: RevisionRecord) => void;
  });
  readonly maxSnapshots: number;
  readonly maxBytes: number;
  readonly maxLedger: number;
  assertWithinByteBudget(bytes: Buffer): void;
  add(snapshot: SnapshotInput): Snapshot;
  /** Hold a ledger alias's bytes again; refuses bytes or a path other than the recorded ones. */
  rehydrate(alias: string, snapshot: SnapshotInput): Snapshot;
  get(alias: string): Snapshot | undefined;
  lookup(alias: string): RevisionRecord | undefined;
  /** Newest ledger records for a canonical path, newest first. */
  revisionsOf(path: string, limit?: number): RevisionRecord[];
  /** Recognize revisions an earlier process issued; new aliases never reuse them. */
  restore(records: Iterable<RevisionRecord>): void;
  /** Most recently added aliases, newest first; diagnostic hints only. */
  recentAliases(limit?: number): string[];
  clear(): void;
  stats(): { count: number; bytes: number; known: number };
}
