/**
summary: "Stores bounded immutable byte snapshots under opaque word aliases with SHA-256 digests, oldest-first eviction, and a content-addressed alias ledger."
read_when:
  - "Changing snapshot alias generation, byte or count budgets, digesting, copying, or eviction order."
  - "Changing how evicted or restored aliases are recognized (the ledger)."
*/
import { createHash } from "node:crypto";

const DEFAULT_WORDS = [
  "amber",
  "apple",
  "atlas",
  "basil",
  "beacon",
  "birch",
  "cedar",
  "cobalt",
  "coral",
  "delta",
  "ember",
  "falcon",
  "fern",
  "flint",
  "forest",
  "harbor",
  "hazel",
  "indigo",
  "iris",
  "jade",
  "juniper",
  "kiwi",
  "lilac",
  "lotus",
  "maple",
  "mesa",
  "mint",
  "nova",
  "oasis",
  "olive",
  "onyx",
  "opal",
  "orbit",
  "otter",
  "pearl",
  "pine",
  "plum",
  "quartz",
  "raven",
  "river",
  "robin",
  "sable",
  "sage",
  "solar",
  "spruce",
  "stone",
  "tiger",
  "ultra",
  "violet",
  "walnut",
  "willow",
  "zebra",
];

export function digestBytes(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

/**
 * A revision names exact bytes: its alias, the canonical path it was read from, and the SHA-256 of
 * those bytes. The ledger outlives the bytes (eviction, reload), so a forgotten alias can be
 * recognized and, when the file still holds exactly those bytes, rehydrated from the file itself.
 */
export class SnapshotStore {
  constructor({
    maxSnapshots = 32,
    maxBytes = 32 * 1024 * 1024,
    maxLedger = 4096,
    words = DEFAULT_WORDS,
    onRevision,
  } = {}) {
    if (!Number.isInteger(maxSnapshots) || maxSnapshots < 1) {
      throw new Error("maxSnapshots must be a positive integer");
    }
    if (!Number.isInteger(maxBytes) || maxBytes < 1) {
      throw new Error("maxBytes must be a positive integer");
    }
    if (!Number.isInteger(maxLedger) || maxLedger < maxSnapshots) {
      throw new Error("maxLedger must be an integer of at least maxSnapshots");
    }
    if (!Array.isArray(words) || words.length === 0) {
      throw new Error("words must contain at least one alias");
    }
    this.maxSnapshots = maxSnapshots;
    this.maxBytes = maxBytes;
    this.maxLedger = maxLedger;
    this.words = [...words];
    this.snapshots = new Map();
    this.ledger = new Map();
    this.totalBytes = 0;
    this.sequence = 0;
    this.onRevision = onRevision;
  }

  assertWithinByteBudget(bytes) {
    if (!Buffer.isBuffer(bytes)) throw new Error("snapshot bytes must be a Buffer");
    if (bytes.length > this.maxBytes) {
      throw new Error(`File exceeds snapshot byte budget (${this.maxBytes} bytes)`);
    }
  }

  /** Store a snapshot under a fresh alias and record it in the ledger. */
  add(snapshot) {
    if (!snapshot) throw new Error("snapshot is required");
    this.assertWithinByteBudget(snapshot.bytes);
    const stored = this.#store(this.#nextAlias(), snapshot);
    this.#remember({ alias: stored.alias, path: stored.path, digest: stored.digest });
    this.onRevision?.({ alias: stored.alias, path: stored.path, digest: stored.digest });
    return stored;
  }

  /**
   * Hold the bytes of a ledger alias again. Only for bytes whose digest is the recorded one: the
   * revision names exactly these bytes, wherever they were read from since.
   */
  rehydrate(alias, snapshot) {
    const record = this.ledger.get(alias);
    if (!record) throw new Error(`Unknown revision '${alias}'`);
    this.assertWithinByteBudget(snapshot.bytes);
    if (snapshot.path !== record.path || digestBytes(snapshot.bytes) !== record.digest) {
      throw new Error(`Revision '${alias}' cannot be rehydrated from different bytes`);
    }
    this.#forget(alias);
    return this.#store(alias, snapshot);
  }

  get(alias) {
    return this.snapshots.get(alias);
  }

  /** The ledger record of an alias minted or restored in this store, held or not. */
  lookup(alias) {
    return this.ledger.get(alias);
  }

  /** The newest ledger records for a canonical path, newest first. */
  revisionsOf(path, limit = 4) {
    const found = [];
    for (const record of [...this.ledger.values()].reverse()) {
      if (record.path === path) found.push(record);
      if (found.length >= limit) break;
    }
    return found;
  }

  /**
   * Restore ledger records written by an earlier process (for example from a session's tool
   * results). Bytes are not restored: a restored alias rehydrates from its file on use. New
   * aliases never reuse a restored one.
   */
  restore(records) {
    for (const record of records) {
      if (
        !record ||
        typeof record.alias !== "string" ||
        typeof record.path !== "string" ||
        !/^[a-f0-9]{64}$/u.test(String(record.digest))
      ) {
        continue;
      }
      if (!this.ledger.has(record.alias)) {
        this.#remember({ alias: record.alias, path: record.path, digest: record.digest });
      }
      const ordinal = this.#ordinal(record.alias);
      if (ordinal !== undefined && ordinal >= this.sequence) this.sequence = ordinal + 1;
    }
  }

  /** Most recently added aliases, newest first; diagnostic hints only. */
  recentAliases(limit = 4) {
    const aliases = [...this.snapshots.keys()];
    return aliases.slice(-limit).reverse();
  }

  clear() {
    this.snapshots.clear();
    this.ledger.clear();
    this.totalBytes = 0;
  }

  stats() {
    return { count: this.snapshots.size, bytes: this.totalBytes, known: this.ledger.size };
  }

  #store(alias, snapshot) {
    const stored = {
      ...snapshot,
      alias,
      digest: digestBytes(snapshot.bytes),
      bytes: Buffer.from(snapshot.bytes),
      createdAt: new Date().toISOString(),
    };
    this.snapshots.set(alias, stored);
    this.totalBytes += stored.bytes.length;
    this.#evict();
    return stored;
  }

  #remember(record) {
    this.ledger.delete(record.alias);
    this.ledger.set(record.alias, record);
    while (this.ledger.size > this.maxLedger) {
      const oldest = this.ledger.keys().next().value;
      if (oldest === undefined) break;
      this.ledger.delete(oldest);
    }
  }

  #forget(alias) {
    const held = this.snapshots.get(alias);
    if (!held) return;
    this.snapshots.delete(alias);
    this.totalBytes -= held.bytes.length;
  }

  #ordinal(alias) {
    const match = /^([a-z]+)(\d*)$/u.exec(alias);
    if (!match) return undefined;
    const index = this.words.indexOf(match[1]);
    if (index === -1) return undefined;
    const cycle = match[2] === "" ? 0 : Number(match[2]) - 1;
    return cycle < 1 && match[2] !== "" ? undefined : cycle * this.words.length + index;
  }

  #nextAlias() {
    for (;;) {
      const ordinal = this.sequence;
      this.sequence += 1;
      const word = this.words[ordinal % this.words.length];
      const cycle = Math.floor(ordinal / this.words.length);
      const alias = cycle === 0 ? word : `${word}${cycle + 1}`;
      if (!this.ledger.has(alias)) return alias;
    }
  }

  #evict() {
    while (this.snapshots.size > this.maxSnapshots || this.totalBytes > this.maxBytes) {
      const oldest = this.snapshots.entries().next().value;
      if (!oldest) break;
      const [alias, snapshot] = oldest;
      this.snapshots.delete(alias);
      this.totalBytes -= snapshot.bytes.length;
    }
  }
}
