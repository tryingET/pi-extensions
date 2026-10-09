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

export function digestBytes(bytes: Buffer): string;

/** Bounded immutable snapshots under word aliases, evicted oldest first. */
export class SnapshotStore {
  constructor(options?: { maxSnapshots?: number; maxBytes?: number; words?: string[] });
  readonly maxSnapshots: number;
  readonly maxBytes: number;
  assertWithinByteBudget(bytes: Buffer): void;
  add(snapshot: SnapshotInput): Snapshot;
  get(alias: string): Snapshot | undefined;
  /** Most recently added aliases, newest first; diagnostic hints only. */
  recentAliases(limit?: number): string[];
  clear(): void;
  stats(): { count: number; bytes: number };
}
