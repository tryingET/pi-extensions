/**
summary: "Stores bounded immutable byte snapshots under opaque word aliases with SHA-256 digests and oldest-first eviction."
read_when:
  - "Changing snapshot alias generation, byte or count budgets, digesting, copying, or eviction order."
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

export class SnapshotStore {
  constructor({ maxSnapshots = 32, maxBytes = 32 * 1024 * 1024, words = DEFAULT_WORDS } = {}) {
    if (!Number.isInteger(maxSnapshots) || maxSnapshots < 1) {
      throw new Error("maxSnapshots must be a positive integer");
    }
    if (!Number.isInteger(maxBytes) || maxBytes < 1) {
      throw new Error("maxBytes must be a positive integer");
    }
    if (!Array.isArray(words) || words.length === 0) {
      throw new Error("words must contain at least one alias");
    }
    this.maxSnapshots = maxSnapshots;
    this.maxBytes = maxBytes;
    this.words = [...words];
    this.snapshots = new Map();
    this.totalBytes = 0;
    this.sequence = 0;
  }

  assertWithinByteBudget(bytes) {
    if (!Buffer.isBuffer(bytes)) throw new Error("snapshot bytes must be a Buffer");
    if (bytes.length > this.maxBytes) {
      throw new Error(`File exceeds snapshot byte budget (${this.maxBytes} bytes)`);
    }
  }

  add(snapshot) {
    if (!snapshot) throw new Error("snapshot is required");
    this.assertWithinByteBudget(snapshot.bytes);

    const alias = this.#nextAlias();
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

  get(alias) {
    return this.snapshots.get(alias);
  }

  clear() {
    this.snapshots.clear();
    this.totalBytes = 0;
  }

  stats() {
    return { count: this.snapshots.size, bytes: this.totalBytes };
  }

  #nextAlias() {
    const ordinal = this.sequence;
    this.sequence += 1;
    const word = this.words[ordinal % this.words.length];
    const cycle = Math.floor(ordinal / this.words.length);
    return cycle === 0 ? word : `${word}${cycle + 1}`;
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
