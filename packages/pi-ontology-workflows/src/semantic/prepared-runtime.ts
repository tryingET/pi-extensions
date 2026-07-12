import { createHash } from "node:crypto";
import { type BigIntStats, constants } from "node:fs";
import { type FileHandle, open } from "node:fs/promises";
import path from "node:path";
import { performance } from "node:perf_hooks";

const DIGEST = /^sha256:[0-9a-f]{64}$/;
const COMMIT = /^[0-9a-f]{40}$/;
const VERSION = /^3\.12\.[0-9]+$/;
const LOGICAL_PATH = /^(?!\/)(?!.*(?:^|\/)\.{1,2}(?:\/|$))(?!.*\/\/)(?!.*\\)[^\0]+$/;
const ALLOWED_MODES = new Set([0o444, 0o555, 0o644, 0o755]);
const MAX_FILE_BYTES = 1_048_576;
const MAX_FILES = 5_000;
const MAX_TOTAL_BYTES = 33_554_432;
const MAX_INTERPRETER_BYTES = 134_217_728;
const MAX_MANIFEST_BYTES = 1_048_576;
const MAX_JSON_DEPTH = 64;
const MANIFEST_DOMAIN = Buffer.from("pi.rocs-prepared-runtime-manifest.v0\0", "ascii");
const DIRECTORY_FLAGS = constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW;
const FILE_FLAGS = constants.O_RDONLY | constants.O_NOFOLLOW;

type BigStat = BigIntStats;
type Signature = Readonly<{
  dev: bigint;
  ino: bigint;
  size: bigint;
  mode: bigint;
  uid: bigint;
  mtimeNs: bigint;
  ctimeNs: bigint;
}>;

export interface PreparedRuntimeFile {
  path: string;
  mode: number;
  size: number;
  digest: string;
}
export interface PreparedRuntimeManifest {
  schema: "pi-rocs-prepared-runtime-manifest.v0";
  rocs_commit: string;
  files: PreparedRuntimeFile[];
  dependency_lock_digest: string;
  interpreter: { path: string; version: string; digest: string };
  entrypoint_digest: string;
  manifest_digest: string;
}
export interface PreparedRuntimeRawMaterial {
  files: Readonly<Record<string, Uint8Array>>;
  dependencyLock: Uint8Array;
  entrypoint: Uint8Array;
  interpreter: Uint8Array;
}
export interface PreparedRuntimeLocation {
  root: string;
  manifestPath: string;
  dependencyLockPath: string;
  entrypointPath: string;
}
export interface VerifiedPreparedRuntime {
  readonly manifest: PreparedRuntimeManifest;
  /** Descriptor-backed paths, valid only until close(). */
  readonly executable: "/proc/self/fd/3";
  readonly cwd: "/proc/self/fd/4";
  readonly interpreterFd: number;
  readonly rootFd: number;
  reverifyInodes(): Promise<void>;
  close(): Promise<void>;
}

export class PreparedRuntimeError extends Error {}

export function sha256Raw(bytes: Uint8Array): string {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

/** RFC 8785 under the protocol's non-negative-safe-integer I-JSON profile. */
export function jcsBytes(value: unknown): Buffer {
  const encode = (item: unknown): string => {
    if (item === null) return "null";
    if (item === true) return "true";
    if (item === false) return "false";
    if (typeof item === "string") {
      assertUnicodeScalars(item);
      return JSON.stringify(item);
    }
    if (typeof item === "number" && Number.isSafeInteger(item) && item >= 0) return String(item);
    if (Array.isArray(item)) return `[${item.map(encode).join(",")}]`;
    if (isRecord(item)) {
      const keys = Object.keys(item);
      for (const key of keys) assertUnicodeScalars(key);
      keys.sort(compareUtf16);
      return `{${keys.map((key) => `${JSON.stringify(key)}:${encode(item[key])}`).join(",")}}`;
    }
    throw new PreparedRuntimeError("value is not integer-only I-JSON");
  };
  return Buffer.from(encode(value), "utf8");
}

export function parseStrictIJson(bytes: Uint8Array): unknown {
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    fail("invalid UTF-8 JSON");
  }
  rejectDuplicateJsonKeys(text);
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    fail("malformed JSON");
  }
  validateIJson(value, 0);
  return value;
}

export function preparedManifestDigest(manifest: PreparedRuntimeManifest): string {
  const preimage: Record<string, unknown> = { ...manifest };
  delete preimage.manifest_digest;
  return sha256Raw(Buffer.concat([MANIFEST_DOMAIN, jcsBytes(preimage)]));
}

export function parsePreparedRuntimeManifest(value: unknown): PreparedRuntimeManifest {
  if (!isRecord(value)) fail("manifest must be an object");
  exactKeys(
    value,
    [
      "schema",
      "rocs_commit",
      "files",
      "dependency_lock_digest",
      "interpreter",
      "entrypoint_digest",
      "manifest_digest",
    ],
    "manifest",
  );
  if (value.schema !== "pi-rocs-prepared-runtime-manifest.v0") fail("unsupported manifest schema");
  if (!stringMatch(value.rocs_commit, COMMIT)) fail("invalid rocs_commit");
  if (!Array.isArray(value.files) || value.files.length < 1 || value.files.length > MAX_FILES)
    fail("invalid files collection");
  const files = value.files.map((entry, index) => parseFile(entry, index));
  const sorted = [...files].sort((a, b) =>
    Buffer.compare(Buffer.from(a.path), Buffer.from(b.path)),
  );
  if (files.some((entry, index) => entry.path !== sorted[index]?.path))
    fail("files must be sorted by path UTF-8 bytes");
  if (new Set(files.map((entry) => entry.path)).size !== files.length)
    fail("file paths must be unique");
  if (files.reduce((sum, entry) => sum + entry.size, 0) > MAX_TOTAL_BYTES)
    fail("prepared runtime exceeds total byte cap");
  if (
    !stringMatch(value.dependency_lock_digest, DIGEST) ||
    !stringMatch(value.entrypoint_digest, DIGEST) ||
    !stringMatch(value.manifest_digest, DIGEST)
  )
    fail("invalid manifest digest field");
  if (!isRecord(value.interpreter)) fail("interpreter must be an object");
  exactKeys(value.interpreter, ["path", "version", "digest"], "interpreter");
  if (
    typeof value.interpreter.path !== "string" ||
    !path.isAbsolute(value.interpreter.path) ||
    value.interpreter.path.includes("\0") ||
    Buffer.byteLength(value.interpreter.path) > 4096
  )
    fail("invalid interpreter path");
  if (
    !stringMatch(value.interpreter.version, VERSION) ||
    !stringMatch(value.interpreter.digest, DIGEST)
  )
    fail("invalid interpreter identity");
  const manifest = value as unknown as PreparedRuntimeManifest;
  if (preparedManifestDigest(manifest) !== manifest.manifest_digest)
    fail("manifest digest mismatch");
  return manifest;
}

export function verifyPreparedRuntimeMaterial(
  manifestValue: unknown,
  raw: PreparedRuntimeRawMaterial,
): PreparedRuntimeManifest {
  const manifest = parsePreparedRuntimeManifest(manifestValue);
  exactKeys(
    raw.files,
    manifest.files.map((entry) => entry.path),
    "raw files",
  );
  for (const entry of manifest.files) {
    const bytes = raw.files[entry.path];
    if (!bytes || bytes.byteLength !== entry.size || sha256Raw(bytes) !== entry.digest)
      fail(`raw file mismatch: ${entry.path}`);
  }
  if (sha256Raw(raw.dependencyLock) !== manifest.dependency_lock_digest)
    fail("raw dependency lock mismatch");
  if (sha256Raw(raw.entrypoint) !== manifest.entrypoint_digest) fail("raw entrypoint mismatch");
  if (sha256Raw(raw.interpreter) !== manifest.interpreter.digest) fail("raw interpreter mismatch");
  return manifest;
}

export async function verifyPreparedRuntime(
  location: PreparedRuntimeLocation,
  deadline?: number,
): Promise<PreparedRuntimeManifest> {
  const verified = await openVerifiedPreparedRuntime(location, deadline);
  try {
    return verified.manifest;
  } finally {
    await verified.close();
  }
}

export async function openVerifiedPreparedRuntime(
  location: PreparedRuntimeLocation,
  deadline?: number,
): Promise<VerifiedPreparedRuntime> {
  checkDeadline(deadline);
  if (process.platform !== "linux" || process.getuid === undefined)
    fail("prepared runtime requires Linux owner identity");
  const rootPath = requireAbsoluteNormalized(location.root, "runtime root");
  const root = await openAbsoluteDirectory(rootPath, deadline);
  const handles: FileHandle[] = [root];
  try {
    const rootStat = await timedStat(root, deadline);
    requireSafeDirectory(rootStat, "runtime root", true);
    const rootSignature = signature(rootStat);
    const manifestRelative = relativeInside(rootPath, location.manifestPath, "manifest");
    const lockRelative = relativeInside(rootPath, location.dependencyLockPath, "dependency lock");
    const entrypointRelative = relativeInside(rootPath, location.entrypointPath, "entrypoint");
    const manifestMaterial = await openMaterial(
      root,
      manifestRelative,
      MAX_MANIFEST_BYTES,
      undefined,
      deadline,
    );
    handles.push(manifestMaterial.handle);
    const manifest = parsePreparedRuntimeManifest(parseStrictIJson(manifestMaterial.bytes));
    const interpreterRelative = relativeInside(rootPath, manifest.interpreter.path, "interpreter");
    const allRelative = [
      manifestRelative,
      lockRelative,
      entrypointRelative,
      interpreterRelative,
      ...manifest.files.map((x) => x.path),
    ];
    if (new Set(allRelative).size !== allRelative.length)
      fail("runtime material paths must be distinct");

    const lock = await openMaterial(root, lockRelative, MAX_FILE_BYTES, undefined, deadline);
    const entrypoint = await openMaterial(
      root,
      entrypointRelative,
      MAX_FILE_BYTES,
      undefined,
      deadline,
    );
    const interpreter = await openMaterial(
      root,
      interpreterRelative,
      MAX_INTERPRETER_BYTES,
      undefined,
      deadline,
    );
    handles.push(lock.handle, entrypoint.handle, interpreter.handle);
    const files: Record<string, Uint8Array> = {};
    const records: MaterialRecord[] = [manifestMaterial, lock, entrypoint, interpreter];
    for (const entry of manifest.files) {
      const material = await openMaterial(root, entry.path, MAX_FILE_BYTES, entry.mode, deadline);
      handles.push(material.handle);
      records.push(material);
      files[entry.path] = material.bytes;
    }
    verifyPreparedRuntimeMaterial(manifest, {
      files,
      dependencyLock: lock.bytes,
      entrypoint: entrypoint.bytes,
      interpreter: interpreter.bytes,
    });

    let closed = false;
    return {
      manifest,
      executable: "/proc/self/fd/3",
      cwd: "/proc/self/fd/4",
      interpreterFd: interpreter.handle.fd,
      rootFd: root.fd,
      async reverifyInodes() {
        if (closed) fail("prepared runtime verification lease is closed");
        checkDeadline(deadline);
        const currentRoot = await openAbsoluteDirectory(rootPath, deadline);
        try {
          if (!sameSignature(signature(await timedStat(currentRoot, deadline)), rootSignature))
            fail("runtime root inode drift");
        } finally {
          await currentRoot.close();
        }
        for (const record of records) {
          checkDeadline(deadline);
          const retained = signature(await timedStat(record.handle, deadline));
          if (!sameSignature(retained, record.signature))
            fail(`runtime material drift: ${record.relative}`);
          const reopened = await openRelativeFile(root, record.relative, deadline);
          try {
            const current = signature(await timedStat(reopened, deadline));
            if (!sameSignature(current, record.signature))
              fail(`runtime path inode drift: ${record.relative}`);
          } finally {
            await reopened.close();
          }
        }
        checkDeadline(deadline);
      },
      async close() {
        if (closed) return;
        closed = true;
        await Promise.allSettled([...handles].reverse().map((handle) => handle.close()));
      },
    };
  } catch (error) {
    await Promise.allSettled([...handles].reverse().map((handle) => handle.close()));
    throw error;
  }
}

interface MaterialRecord {
  relative: string;
  handle: FileHandle;
  bytes: Buffer;
  signature: Signature;
}

async function openMaterial(
  root: FileHandle,
  relative: string,
  cap: number,
  expectedMode: number | undefined,
  deadline: number | undefined,
): Promise<MaterialRecord> {
  const handle = await openRelativeFile(root, relative, deadline);
  try {
    const before = await timedStat(handle, deadline);
    requireSafeFile(before, relative, expectedMode);
    const bytes = await boundedDescriptorRead(handle, cap, deadline);
    const after = await timedStat(handle, deadline);
    if (!sameSignature(signature(before), signature(after)))
      fail(`runtime material changed while read: ${relative}`);
    return { relative, handle, bytes, signature: signature(after) };
  } catch (error) {
    await handle.close();
    throw error;
  }
}

async function boundedDescriptorRead(
  handle: FileHandle,
  cap: number,
  deadline?: number,
): Promise<Buffer> {
  const chunks: Buffer[] = [];
  let position = 0;
  while (position <= cap) {
    checkDeadline(deadline);
    const wanted = Math.min(65_536, cap + 1 - position);
    const chunk = Buffer.allocUnsafe(wanted);
    const { bytesRead } = await handle.read(chunk, 0, wanted, position);
    if (bytesRead === 0) break;
    chunks.push(chunk.subarray(0, bytesRead));
    position += bytesRead;
  }
  if (position > cap) fail("runtime material byte cap exceeded");
  checkDeadline(deadline);
  return Buffer.concat(chunks, position);
}

async function openAbsoluteDirectory(absolute: string, deadline?: number): Promise<FileHandle> {
  const components = absolute.split(path.sep).filter(Boolean);
  let current = await open(path.sep, DIRECTORY_FLAGS);
  try {
    requireSafeAncestor(await timedStat(current, deadline), path.sep);
    let display = "";
    for (const component of components) {
      checkDeadline(deadline);
      const next = await open(`/proc/self/fd/${current.fd}/${component}`, DIRECTORY_FLAGS);
      display += `/${component}`;
      try {
        requireSafeAncestor(await timedStat(next, deadline), display);
      } catch (error) {
        await next.close();
        throw error;
      }
      await current.close();
      current = next;
    }
    return current;
  } catch (error) {
    await current.close();
    throw error;
  }
}

async function openRelativeFile(
  root: FileHandle,
  relative: string,
  deadline?: number,
): Promise<FileHandle> {
  if (!LOGICAL_PATH.test(relative)) fail("invalid runtime-relative path");
  const components = relative.split("/");
  const leaf = components.pop();
  if (!leaf) fail("invalid runtime-relative path");
  let current: FileHandle | undefined;
  let parentFd = root.fd;
  try {
    for (const component of components) {
      checkDeadline(deadline);
      const next = await open(`/proc/self/fd/${parentFd}/${component}`, DIRECTORY_FLAGS);
      try {
        requireSafeDirectory(await timedStat(next, deadline), component, true);
      } catch (error) {
        await next.close();
        throw error;
      }
      if (current) await current.close();
      current = next;
      parentFd = next.fd;
    }
    checkDeadline(deadline);
    return await open(`/proc/self/fd/${parentFd}/${leaf}`, FILE_FLAGS);
  } finally {
    if (current) await current.close();
  }
}

async function timedStat(handle: FileHandle, deadline?: number): Promise<BigStat> {
  checkDeadline(deadline);
  const stat = await handle.stat({ bigint: true });
  checkDeadline(deadline);
  return stat;
}

function requireSafeAncestor(stat: BigStat, label: string): void {
  if (!stat.isDirectory() || (Number(stat.mode) & 0o022) !== 0)
    fail(`unsafe or writable path component: ${label}`);
}
function requireSafeDirectory(stat: BigStat, label: string, requireOwner: boolean): void {
  if (
    !stat.isDirectory() ||
    (requireOwner && Number(stat.uid) !== process.getuid?.()) ||
    (Number(stat.mode) & 0o022) !== 0
  )
    fail(`unsafe runtime directory: ${label}`);
}
function requireSafeFile(stat: BigStat, label: string, expectedMode?: number): void {
  const mode = Number(stat.mode) & 0o777;
  if (
    !stat.isFile() ||
    Number(stat.uid) !== process.getuid?.() ||
    (mode & 0o022) !== 0 ||
    (expectedMode !== undefined && mode !== expectedMode)
  )
    fail(`unsafe runtime material: ${label}`);
}
function signature(stat: BigStat): Signature {
  return {
    dev: stat.dev,
    ino: stat.ino,
    size: stat.size,
    mode: stat.mode,
    uid: stat.uid,
    mtimeNs: stat.mtimeNs,
    ctimeNs: stat.ctimeNs,
  };
}
function sameSignature(a: Signature, b: Signature): boolean {
  return (
    a.dev === b.dev &&
    a.ino === b.ino &&
    a.size === b.size &&
    a.mode === b.mode &&
    a.uid === b.uid &&
    a.mtimeNs === b.mtimeNs &&
    a.ctimeNs === b.ctimeNs
  );
}
function relativeInside(root: string, candidate: string, label: string): string {
  const absolute = requireAbsoluteNormalized(candidate, label);
  const relative = path.relative(root, absolute);
  if (!relative || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative))
    fail(`${label} must be a distinct file inside runtime root`);
  const logical = relative.split(path.sep).join("/");
  if (!LOGICAL_PATH.test(logical)) fail(`${label} escapes runtime root`);
  return logical;
}
function requireAbsoluteNormalized(value: string, label: string): string {
  if (typeof value !== "string" || !path.isAbsolute(value) || value.includes("\0"))
    fail(`${label} must be absolute`);
  const resolved = path.resolve(value);
  if (resolved !== value || Buffer.byteLength(value) > 4096) fail(`${label} is not canonical`);
  return resolved;
}
function parseFile(value: unknown, index: number): PreparedRuntimeFile {
  if (!isRecord(value)) fail(`files[${index}] must be an object`);
  exactKeys(value, ["path", "mode", "size", "digest"], `files[${index}]`);
  if (
    typeof value.path !== "string" ||
    !LOGICAL_PATH.test(value.path) ||
    Buffer.byteLength(value.path) > 4096
  )
    fail(`invalid file path at ${index}`);
  if (typeof value.mode !== "number" || !ALLOWED_MODES.has(value.mode))
    fail(`invalid file mode at ${index}`);
  if (
    !Number.isInteger(value.size) ||
    (value.size as number) < 0 ||
    (value.size as number) > MAX_FILE_BYTES
  )
    fail(`invalid file size at ${index}`);
  if (!stringMatch(value.digest, DIGEST)) fail(`invalid file digest at ${index}`);
  return value as unknown as PreparedRuntimeFile;
}
function rejectDuplicateJsonKeys(text: string): void {
  let cursor = 0;
  const isWhitespace = (character: string | undefined) =>
    character === " " || character === "\n" || character === "\r" || character === "\t";
  const isDelimiter = (character: string | undefined) =>
    isWhitespace(character) || character === "," || character === "}" || character === "]";
  const whitespace = () => {
    while (isWhitespace(text[cursor])) cursor++;
  };
  const quoted = (): string => {
    const start = cursor++;
    let escaped = false;
    while (cursor < text.length) {
      const character = text[cursor++];
      if (!escaped && character === '"') {
        try {
          return JSON.parse(text.slice(start, cursor)) as string;
        } catch {
          fail("invalid JSON string");
        }
      }
      if (!escaped && character === "\\") escaped = true;
      else escaped = false;
    }
    fail("unterminated JSON string");
  };
  const scan = (depth: number): void => {
    if (depth > MAX_JSON_DEPTH) fail("JSON nesting exceeds cap");
    whitespace();
    if (text[cursor] === "{") {
      cursor++;
      const keys = new Set<string>();
      whitespace();
      if (text[cursor] === "}") {
        cursor++;
        return;
      }
      while (true) {
        if (text[cursor] !== '"') fail("invalid JSON object key");
        const key = quoted();
        if (keys.has(key)) fail(`duplicate JSON key: ${key}`);
        keys.add(key);
        whitespace();
        if (text[cursor++] !== ":") fail("invalid JSON object separator");
        scan(depth + 1);
        whitespace();
        if (text[cursor] === "}") {
          cursor++;
          return;
        }
        if (text[cursor++] !== ",") fail("invalid JSON object delimiter");
        whitespace();
      }
    }
    if (text[cursor] === "[") {
      cursor++;
      whitespace();
      if (text[cursor] === "]") {
        cursor++;
        return;
      }
      while (true) {
        scan(depth + 1);
        whitespace();
        if (text[cursor] === "]") {
          cursor++;
          return;
        }
        if (text[cursor++] !== ",") fail("invalid JSON array delimiter");
        whitespace();
      }
    }
    if (text[cursor] === '"') {
      quoted();
      return;
    }
    const start = cursor;
    while (cursor < text.length && !isDelimiter(text[cursor])) cursor++;
    if (cursor === start) fail("invalid JSON value");
  };
  scan(0);
  whitespace();
  if (cursor !== text.length) fail("trailing JSON data");
}
function validateIJson(value: unknown, depth: number): void {
  if (depth > MAX_JSON_DEPTH) fail("JSON nesting exceeds cap");
  if (typeof value === "string") assertUnicodeScalars(value);
  else if (typeof value === "number") {
    if (!Number.isSafeInteger(value) || value < 0)
      fail("JSON number is not a non-negative safe integer");
  } else if (Array.isArray(value)) {
    for (const item of value) validateIJson(item, depth + 1);
  } else if (isRecord(value)) {
    for (const [key, item] of Object.entries(value)) {
      assertUnicodeScalars(key);
      validateIJson(item, depth + 1);
    }
  } else if (value !== null && typeof value !== "boolean") fail("invalid I-JSON value");
}
function assertUnicodeScalars(value: string): void {
  for (let index = 0; index < value.length; index++) {
    const unit = value.charCodeAt(index);
    if (unit >= 0xd800 && unit <= 0xdbff) {
      const low = value.charCodeAt(index + 1);
      if (!(low >= 0xdc00 && low <= 0xdfff)) fail("invalid Unicode scalar");
      index++;
    } else if (unit >= 0xdc00 && unit <= 0xdfff) fail("invalid Unicode scalar");
  }
}
function exactKeys(
  value: Record<string, unknown> | Readonly<Record<string, Uint8Array>>,
  expected: readonly string[],
  label: string,
): void {
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (actual.length !== wanted.length || actual.some((key, index) => key !== wanted[index]))
    fail(`${label} has unknown or missing fields`);
}
function compareUtf16(a: string, b: string): number {
  const aa = Buffer.from(a, "utf16le").swap16();
  const bb = Buffer.from(b, "utf16le").swap16();
  return Buffer.compare(aa, bb);
}
function checkDeadline(deadline?: number): void {
  if (deadline !== undefined && performance.now() >= deadline)
    fail("prepared runtime deadline exceeded");
}
function stringMatch(value: unknown, pattern: RegExp): value is string {
  return typeof value === "string" && pattern.test(value);
}
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function fail(message: string): never {
  throw new PreparedRuntimeError(message);
}
