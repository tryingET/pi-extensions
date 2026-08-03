import { createHash, randomUUID } from "node:crypto";
import {
  closeSync,
  constants,
  fstatSync,
  fsyncSync,
  lstatSync,
  openSync,
  readFileSync,
  readSync,
  realpathSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";
import {
  assertCandidateGenerationId,
  assertCandidateResourceId,
  assertOwnerOnlyDirectory,
  type CandidateLifecycleRecord,
  digestObject,
  getCandidateLifecycleRoot,
  lexicalPathExists,
  stableJson,
} from "./candidatePeerLifecycleV2Core.ts";

const HEX64 = /^[a-f0-9]{64}$/;

export type TerminalCandidateState =
  | "cleaned"
  | "reconciled_missing"
  | "closed_with_retained_effects";

export type TerminalCompactionSource = {
  originalPath: string;
  capsulePath: string;
  sha256: string;
  size: number;
  mode: number;
};

export function assertTerminalCompactionSourceManifest(sources: TerminalCompactionSource[]): void {
  if (!Array.isArray(sources) || sources.length < 2) {
    throw new Error("terminal compaction source manifest is incomplete");
  }
  const capsulePaths = new Set<string>();
  const originalPaths = new Set<string>();
  for (const source of sources) {
    if (
      !isAbsolute(source.originalPath) ||
      resolve(source.originalPath) !== source.originalPath ||
      !source.capsulePath.startsWith("payload/") ||
      source.capsulePath.startsWith("/") ||
      source.capsulePath.split("/").includes("..") ||
      !HEX64.test(source.sha256) ||
      !Number.isSafeInteger(source.size) ||
      source.size < 0 ||
      !Number.isSafeInteger(source.mode) ||
      (source.mode & 0o077) !== 0 ||
      capsulePaths.has(source.capsulePath) ||
      originalPaths.has(source.originalPath)
    ) {
      throw new Error("terminal compaction source manifest identity is invalid or duplicated");
    }
    capsulePaths.add(source.capsulePath);
    originalPaths.add(source.originalPath);
  }
  if (
    stableJson(sources.map((item) => item.capsulePath)) !==
    stableJson([...capsulePaths].sort((left, right) => left.localeCompare(right)))
  ) {
    throw new Error("terminal compaction source manifest is not canonically sorted");
  }
  if (
    !capsulePaths.has("payload/resource/record.json") ||
    !capsulePaths.has("payload/resource/events.jsonl")
  ) {
    throw new Error("terminal compaction source manifest omits terminal record or events");
  }
}

export type TerminalCompactionMarker = {
  schemaVersion: 1;
  type: "candidate_terminal_compaction";
  resourceId: string;
  generationId: string;
  terminalState: TerminalCandidateState;
  terminalRecordDigest: string;
  aliases: string[];
  capsulePath: string;
  capsuleSha256: string;
  capsuleSize: number;
  capsuleMetadataDigest: string;
  sourceBytes: number;
  sourceManifest: TerminalCompactionSource[];
  sourceManifestDigest: string;
  preparationDigest: string;
  authorizationDigest: string;
  committedAt: string;
  markerDigest: string;
};

export type TerminalCompactionGarbageCollectionReceipt = {
  schemaVersion: 1;
  type: "candidate_terminal_compaction_gc";
  resourceId: string;
  generationId: string;
  markerDigest: string;
  registryRecordsRetained: string[];
  removedEvents: boolean;
  removedArchive: boolean;
  completedAt: string;
  receiptDigest: string;
};

export function getTerminalRetentionRoot(env: NodeJS.ProcessEnv = process.env): string {
  return join(getCandidateLifecycleRoot(env), "terminal-retention");
}

export function getTerminalRetentionGenerationDir(
  resourceId: string,
  generationId: string,
  env: NodeJS.ProcessEnv = process.env,
): string {
  return join(
    getTerminalRetentionRoot(env),
    assertCandidateResourceId(resourceId),
    assertCandidateGenerationId(generationId),
  );
}

export function getTerminalCompactionMarkerPath(
  resourceId: string,
  env: NodeJS.ProcessEnv = process.env,
): string {
  return join(
    getCandidateLifecycleRoot(env),
    "resources",
    assertCandidateResourceId(resourceId),
    "terminal-compaction.json",
  );
}

function sha256Descriptor(fd: number): string {
  const hash = createHash("sha256");
  const buffer = Buffer.allocUnsafe(1024 * 1024);
  let position = 0;
  for (;;) {
    const bytes = readSync(fd, buffer, 0, buffer.length, position);
    if (bytes === 0) break;
    hash.update(buffer.subarray(0, bytes));
    position += bytes;
  }
  return hash.digest("hex");
}

export function sha256File(path: string): string {
  const fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    return sha256Descriptor(fd);
  } finally {
    closeSync(fd);
  }
}

export function withStableTerminalFile<T>(
  path: string,
  label: string,
  action: (stablePath: string, digest: string, size: number) => T,
): T {
  const fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const before = fstatSync(fd);
    const lexical = lstatSync(path);
    if (
      !before.isFile() ||
      before.dev !== lexical.dev ||
      before.ino !== lexical.ino ||
      (before.mode & 0o077) !== 0 ||
      (process.getuid && before.uid !== process.getuid())
    ) {
      throw new Error(`${label} is not a stable owner-only regular file`);
    }
    const digest = sha256Descriptor(fd);
    const result = action(`/proc/${process.pid}/fd/${fd}`, digest, before.size);
    const after = fstatSync(fd);
    if (
      before.dev !== after.dev ||
      before.ino !== after.ino ||
      before.size !== after.size ||
      before.mtimeMs !== after.mtimeMs ||
      digest !== sha256Descriptor(fd)
    ) {
      throw new Error(`${label} changed while being consumed`);
    }
    return result;
  } finally {
    closeSync(fd);
  }
}

export function syncTerminalPath(path: string): void {
  const fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
}

export function durableTerminalJson(
  path: string,
  value: unknown,
  options: { beforeCommit?: () => void } = {},
): void {
  const parent = dirname(path);
  assertOwnerOnlyDirectory(parent);
  const temporary = `${path}.${process.pid}.${randomUUID()}.tmp`;
  const fd = openSync(
    temporary,
    constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW,
    0o600,
  );
  let closed = false;
  try {
    writeFileSync(fd, `${JSON.stringify(value, null, 2)}\n`);
    fsyncSync(fd);
    closeSync(fd);
    closed = true;
    options.beforeCommit?.();
    renameSync(temporary, path);
    syncTerminalPath(parent);
  } catch (error) {
    if (!closed) closeSync(fd);
    rmSync(temporary, { force: true });
    throw error;
  }
}

function canonicalTimestamp(value: string, label: string): number {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)) {
    throw new Error(`${label} must be a canonical UTC timestamp`);
  }
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed) || new Date(parsed).toISOString() !== value) {
    throw new Error(`${label} must be a real canonical UTC timestamp`);
  }
  return parsed;
}

function assertOwnerFile(path: string, label: string): void {
  if (!isAbsolute(path) || resolve(path) !== path)
    throw new Error(`${label} path is not canonical`);
  const info = lstatSync(path);
  if (!info.isFile() || info.isSymbolicLink() || realpathSync(path) !== path) {
    throw new Error(`${label} is not a canonical regular file`);
  }
  if ((info.mode & 0o077) !== 0) throw new Error(`${label} is not owner-only`);
}

function markerUnsigned(
  marker: TerminalCompactionMarker,
): Omit<TerminalCompactionMarker, "markerDigest"> {
  return Object.fromEntries(
    Object.entries(marker).filter(([key]) => key !== "markerDigest"),
  ) as Omit<TerminalCompactionMarker, "markerDigest">;
}

export function readTerminalCompactionMarker(
  record: CandidateLifecycleRecord,
  env: NodeJS.ProcessEnv = process.env,
): TerminalCompactionMarker | undefined {
  const path = getTerminalCompactionMarkerPath(record.resourceId, env);
  try {
    assertOwnerFile(path, "terminal compaction marker");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw error;
  }
  const marker = JSON.parse(readFileSync(path, "utf8")) as TerminalCompactionMarker;
  assertTerminalCompactionSourceManifest(marker.sourceManifest);
  const expectedDir = getTerminalRetentionGenerationDir(
    record.resourceId,
    record.generationId,
    env,
  );
  if (
    marker.schemaVersion !== 1 ||
    marker.type !== "candidate_terminal_compaction" ||
    marker.resourceId !== record.resourceId ||
    marker.generationId !== record.generationId ||
    marker.terminalState !== record.state ||
    marker.terminalRecordDigest !== digestObject(record) ||
    stableJson(marker.aliases) !== stableJson([...record.aliases].sort()) ||
    marker.capsulePath !== join(expectedDir, "terminal-capsule.tar.gz") ||
    !HEX64.test(marker.capsuleSha256) ||
    !HEX64.test(marker.capsuleMetadataDigest) ||
    !HEX64.test(marker.sourceManifestDigest) ||
    !HEX64.test(marker.preparationDigest) ||
    !HEX64.test(marker.authorizationDigest) ||
    marker.sourceManifestDigest !== digestObject(marker.sourceManifest) ||
    marker.sourceBytes !== marker.sourceManifest.reduce((sum, item) => sum + item.size, 0) ||
    marker.markerDigest !== digestObject(markerUnsigned(marker))
  ) {
    throw new Error("terminal compaction marker binding or digest mismatch");
  }
  canonicalTimestamp(marker.committedAt, "terminal compaction commit time");
  const preparationPath = join(expectedDir, "preparation.json");
  const authorizationPath = join(expectedDir, "authorization.json");
  assertOwnerFile(preparationPath, "terminal compaction preparation");
  assertOwnerFile(authorizationPath, "terminal compaction authorization");
  const preparation = JSON.parse(readFileSync(preparationPath, "utf8")) as Record<string, unknown>;
  const preparationUnsigned = Object.fromEntries(
    Object.entries(preparation).filter(([key]) => key !== "preparationDigest"),
  );
  const authorization = JSON.parse(readFileSync(authorizationPath, "utf8")) as Record<
    string,
    unknown
  >;
  const authorizationUnsigned = Object.fromEntries(
    Object.entries(authorization).filter(([key]) => key !== "authorizationDigest"),
  );
  if (
    preparation.preparationDigest !== marker.preparationDigest ||
    preparation.preparationDigest !== digestObject(preparationUnsigned) ||
    preparation.resourceId !== record.resourceId ||
    preparation.generationId !== record.generationId ||
    preparation.terminalRecordDigest !== marker.terminalRecordDigest ||
    preparation.sourceManifestDigest !== marker.sourceManifestDigest ||
    preparation.capsuleSha256 !== marker.capsuleSha256 ||
    authorization.authorizationDigest !== marker.authorizationDigest ||
    authorization.authorizationDigest !== digestObject(authorizationUnsigned) ||
    authorization.resourceId !== record.resourceId ||
    authorization.generationId !== record.generationId ||
    authorization.preparationDigest !== marker.preparationDigest ||
    authorization.terminalRecordDigest !== marker.terminalRecordDigest ||
    authorization.sourceManifestDigest !== marker.sourceManifestDigest ||
    authorization.capsuleSha256 !== marker.capsuleSha256
  ) {
    throw new Error("terminal compaction preparation or authorization evidence drifted");
  }
  const issuedAtMs = canonicalTimestamp(
    String(authorization.issuedAt),
    "terminal compaction authorization issue time",
  );
  const expiresAtMs = canonicalTimestamp(
    String(authorization.expiresAt),
    "terminal compaction authorization expiry",
  );
  const committedAtMs = canonicalTimestamp(marker.committedAt, "terminal compaction commit time");
  if (
    issuedAtMs > committedAtMs ||
    committedAtMs >= expiresAtMs ||
    expiresAtMs - issuedAtMs > 30 * 60 * 1000
  ) {
    throw new Error("terminal compaction marker was not committed under a valid authorization");
  }
  assertOwnerFile(marker.capsulePath, "terminal compaction capsule");
  const capsuleInfo = lstatSync(marker.capsulePath);
  if (
    capsuleInfo.size !== marker.capsuleSize ||
    sha256File(marker.capsulePath) !== marker.capsuleSha256
  ) {
    throw new Error("terminal compaction capsule size or digest mismatch");
  }
  return marker;
}

export function readTerminalCompactionGarbageCollectionReceipt(
  record: CandidateLifecycleRecord,
  marker: TerminalCompactionMarker,
  env: NodeJS.ProcessEnv = process.env,
): TerminalCompactionGarbageCollectionReceipt | undefined {
  const retentionDir = getTerminalRetentionGenerationDir(
    record.resourceId,
    record.generationId,
    env,
  );
  const receiptPath = join(retentionDir, "gc-receipt.json");
  try {
    assertOwnerFile(receiptPath, "terminal compaction GC receipt");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw error;
  }
  const receipt = JSON.parse(
    readFileSync(receiptPath, "utf8"),
  ) as TerminalCompactionGarbageCollectionReceipt;
  const expectedKeys = [
    "completedAt",
    "generationId",
    "markerDigest",
    "receiptDigest",
    "registryRecordsRetained",
    "removedArchive",
    "removedEvents",
    "resourceId",
    "schemaVersion",
    "type",
  ];
  const unsigned = Object.fromEntries(
    Object.entries(receipt).filter(([key]) => key !== "receiptDigest"),
  );
  if (
    stableJson(Object.keys(receipt).sort()) !== stableJson(expectedKeys) ||
    receipt.schemaVersion !== 1 ||
    receipt.type !== "candidate_terminal_compaction_gc" ||
    receipt.resourceId !== record.resourceId ||
    receipt.generationId !== record.generationId ||
    receipt.markerDigest !== marker.markerDigest ||
    stableJson(receipt.registryRecordsRetained) !== stableJson(marker.aliases) ||
    receipt.removedEvents !== true ||
    receipt.removedArchive !== Boolean(record.archive) ||
    receipt.receiptDigest !== digestObject(unsigned) ||
    canonicalTimestamp(receipt.completedAt, "terminal compaction completion time") <
      canonicalTimestamp(marker.committedAt, "terminal compaction commit time")
  ) {
    throw new Error("terminal compaction GC receipt binding or digest mismatch");
  }
  const eventSource = marker.sourceManifest.find(
    (source) => source.capsulePath === "payload/resource/events.jsonl",
  );
  if (
    !eventSource ||
    lexicalPathExists(eventSource.originalPath) ||
    lexicalPathExists(join(retentionDir, "events.jsonl.gc")) ||
    lexicalPathExists(join(retentionDir, "archive.gc")) ||
    (record.archive ? lexicalPathExists(record.archive.archiveDir) : false)
  ) {
    throw new Error("terminal compaction GC receipt does not match retired source state");
  }
  for (const source of marker.sourceManifest.filter((item) =>
    item.capsulePath.startsWith("payload/registry/"),
  )) {
    if (
      !lexicalPathExists(source.originalPath) ||
      sha256File(source.originalPath) !== source.sha256
    ) {
      throw new Error("terminal compaction retained registry source drifted");
    }
  }
  return receipt;
}
