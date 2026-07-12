import { type BigIntStats, constants } from "node:fs";
import {
  type FileHandle,
  lstat,
  mkdir,
  open,
  readdir,
  realpath,
  rmdir,
  unlink,
} from "node:fs/promises";
import path from "node:path";

const LOGICAL_PATH = /^(?!\/)(?!.*(?:^|\/)\.{1,2}(?:\/|$))(?!.*\/\/)(?!.*\\)[A-Za-z0-9._/+~-]+$/;
const DIRECTORY_FLAGS = constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW;
const FILE_FLAGS = constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK;

export type Stat = BigIntStats;
export type Signature = Readonly<{
  dev: bigint;
  ino: bigint;
  size: bigint;
  mode: bigint;
  uid: bigint;
  mtimeNs: bigint;
  ctimeNs: bigint;
}>;
export type SafeDirectory = Readonly<{ handle: FileHandle; absolute: string }>;
export type Material = Readonly<{ bytes: Buffer; mode: number }>;

export class DevelopmentPreparationError extends Error {}

export async function openAbsoluteDirectory(
  value: string,
  label: string,
  requireLeafOwner: boolean,
): Promise<SafeDirectory> {
  if (!path.isAbsolute(value) || path.resolve(value) !== value || value.includes("\0"))
    fail(`${label} must be a canonical absolute path`);
  const components = value.split(path.sep).filter(Boolean);
  let current = await open(path.sep, DIRECTORY_FLAGS);
  let display = "";
  try {
    requireSafeAncestor(await current.stat({ bigint: true }), path.sep);
    for (const component of components) {
      const next = await open(
        procChild({ handle: current, absolute: display || path.sep }, component),
        DIRECTORY_FLAGS,
      );
      display += `/${component}`;
      try {
        requireSafeAncestor(await next.stat({ bigint: true }), display);
      } catch (error) {
        await next.close();
        throw error;
      }
      await current.close();
      current = next;
    }
    const stat = await current.stat({ bigint: true });
    if (requireLeafOwner && Number(stat.uid) !== process.getuid?.()) fail(`unsafe owner: ${label}`);
    return { handle: current, absolute: value };
  } catch (error) {
    await current.close();
    throw error;
  }
}

export async function openRelativeDirectory(
  root: SafeDirectory,
  relative: string,
  label: string,
): Promise<SafeDirectory> {
  validateRelative(relative, label);
  let current: FileHandle | undefined;
  let parent = root.handle;
  try {
    for (const component of relative.split("/")) {
      const next = await open(`/proc/self/fd/${parent.fd}/${component}`, DIRECTORY_FLAGS);
      try {
        const stat = await next.stat({ bigint: true });
        requireOwnerSafe(stat, label);
        if (!stat.isDirectory()) fail(`${label} is not a directory`);
      } catch (error) {
        await next.close();
        throw error;
      }
      if (current) await current.close();
      current = next;
      parent = next;
    }
    if (!current) fail(`${label} is not a distinct directory`);
    return { handle: current, absolute: path.join(root.absolute, ...relative.split("/")) };
  } catch (error) {
    if (current) await current.close();
    throw error;
  }
}

export async function openAbsoluteFile(
  value: string,
  label: string,
  cap: number,
): Promise<{ handle: FileHandle }> {
  if (!path.isAbsolute(value) || path.resolve(value) !== value) fail(`${label} is not canonical`);
  const parent = await openAbsoluteDirectory(path.dirname(value), `${label} parent`, true);
  try {
    const opened = await openRelativeUnknown(parent, path.basename(value), label);
    requireSafeFile(opened.stat, label, cap);
    return { handle: opened.handle };
  } finally {
    await parent.handle.close();
  }
}

export async function resolveStableRequestedFile(
  root: SafeDirectory,
  relative: string,
  label: string,
): Promise<string> {
  validateRelative(relative, label);
  const requested = procChild(root, relative);
  const before = await lstat(requested, { bigint: true });
  if ((!before.isFile() && !before.isSymbolicLink()) || Number(before.uid) !== process.getuid?.())
    fail(`unsafe requested ${label}`);
  const first = await realpath(requested);
  const second = await realpath(requested);
  const after = await lstat(requested, { bigint: true });
  if (
    first !== second ||
    !sameSignature(signature(before), signature(after)) ||
    path.resolve(first) !== first
  )
    fail(`${label} path changed during resolution`);
  return first;
}

export async function readRelativeFile(
  root: SafeDirectory,
  relative: string,
  cap: number,
  label: string,
): Promise<Buffer> {
  validateRelative(relative, label);
  const opened = await openRelativeUnknown(root, relative, label);
  try {
    requireSafeFile(opened.stat, label, cap);
    return await readOpenedFile(opened.handle, cap, label, opened.stat);
  } finally {
    await opened.handle.close();
  }
}

export async function openRelativeUnknown(
  root: SafeDirectory,
  relative: string,
  label: string,
): Promise<{ handle: FileHandle; stat: Stat; borrowed?: false }> {
  validateRelative(relative, label);
  const components = relative.split("/");
  const leaf = components.pop();
  let current: FileHandle | undefined;
  let parent = root.handle;
  try {
    for (const component of components) {
      const next = await open(`/proc/self/fd/${parent.fd}/${component}`, DIRECTORY_FLAGS);
      try {
        requireOwnerSafe(await next.stat({ bigint: true }), label);
      } catch (error) {
        await next.close();
        throw error;
      }
      if (current) await current.close();
      current = next;
      parent = next;
    }
    const handle = await open(`/proc/self/fd/${parent.fd}/${leaf}`, FILE_FLAGS);
    const stat = await handle.stat({ bigint: true });
    return { handle, stat };
  } finally {
    if (current) await current.close();
  }
}

export async function readOpenedFile(
  handle: FileHandle,
  cap: number,
  label: string,
  known?: Stat,
): Promise<Buffer> {
  const before = known ?? (await handle.stat({ bigint: true }));
  requireSafeFile(before, label, cap);
  const chunks: Buffer[] = [];
  let position = 0;
  while (position <= cap) {
    const wanted = Math.min(65_536, cap + 1 - position);
    const chunk = Buffer.allocUnsafe(wanted);
    const { bytesRead } = await handle.read(chunk, 0, wanted, position);
    if (bytesRead === 0) break;
    chunks.push(chunk.subarray(0, bytesRead));
    position += bytesRead;
  }
  if (position > cap) fail(`preparation file exceeds cap: ${label}`);
  const after = await handle.stat({ bigint: true });
  if (!sameSignature(signature(before), signature(after)))
    fail(`preparation material changed while read: ${label}`);
  return Buffer.concat(chunks, position);
}

export async function stableDirectoryNames(root: SafeDirectory, label: string): Promise<string[]> {
  const before = signature(await root.handle.stat({ bigint: true }));
  const names = await readdir(`/proc/self/fd/${root.handle.fd}`);
  const after = signature(await root.handle.stat({ bigint: true }));
  if (!sameSignature(before, after)) fail(`directory changed while enumerated: ${label}`);
  for (const name of names)
    if (!name || name.includes("/") || name === "." || name === "..")
      fail(`unsafe directory entry: ${label}`);
  return names.sort((a, b) => Buffer.compare(Buffer.from(a), Buffer.from(b)));
}

export async function ensurePrivateCache(value: string): Promise<SafeDirectory> {
  if (!path.isAbsolute(value) || path.resolve(value) !== value || value.includes("\0"))
    fail("extension cache root must be a canonical absolute path");
  const components = value.split(path.sep).filter(Boolean);
  let current = await open(path.sep, DIRECTORY_FLAGS);
  let display = "";
  try {
    requireSafeAncestor(await current.stat({ bigint: true }), path.sep);
    for (let index = 0; index < components.length; index++) {
      const component = components[index] ?? "";
      const candidate = `/proc/self/fd/${current.fd}/${component}`;
      let created = false;
      let next: FileHandle;
      try {
        next = await open(candidate, DIRECTORY_FLAGS);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
        try {
          await mkdir(candidate, { mode: 0o700 });
          created = true;
        } catch (mkdirError) {
          if ((mkdirError as NodeJS.ErrnoException).code !== "EEXIST") throw mkdirError;
        }
        next = await open(candidate, DIRECTORY_FLAGS);
      }
      display += `/${component}`;
      const stat = await next.stat({ bigint: true });
      requireSafeAncestor(stat, display);
      if (created) await next.chmod(0o700);
      await current.close();
      current = next;
      if (index === components.length - 1) {
        const final = await current.stat({ bigint: true });
        if (Number(final.uid) !== process.getuid?.() || (Number(final.mode) & 0o077) !== 0)
          fail("extension cache root must be owner-private");
      }
    }
    return { handle: current, absolute: value };
  } catch (error) {
    await current.close();
    throw error;
  }
}

export async function createPrivateChild(
  parent: SafeDirectory,
  name: string,
): Promise<SafeDirectory> {
  validateComponent(name, "staging name");
  await mkdir(procChild(parent, name), { mode: 0o700 });
  const child = await openRelativeDirectory(parent, name, "staging generation");
  await child.handle.chmod(0o700);
  return child;
}

export async function writeMaterial(
  root: SafeDirectory,
  relative: string,
  bytes: Buffer,
  mode: number,
): Promise<void> {
  validateRelative(relative, "published path");
  const parts = relative.split("/");
  const leaf = parts.pop();
  let directory = root;
  const opened: SafeDirectory[] = [];
  try {
    for (const component of parts) {
      let next: SafeDirectory;
      try {
        next = await openRelativeDirectory(directory, component, "staging directory");
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
        await mkdir(procChild(directory, component), { mode: 0o700 });
        next = await openRelativeDirectory(directory, component, "staging directory");
        await next.handle.chmod(0o700);
      }
      opened.push(next);
      directory = next;
    }
    const handle = await open(
      procChild(directory, leaf ?? ""),
      constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | constants.O_NOFOLLOW,
      mode,
    );
    try {
      await handle.writeFile(bytes);
      await handle.chmod(mode);
      await handle.sync();
      const stat = await handle.stat({ bigint: true });
      if (
        !stat.isFile() ||
        stat.size !== BigInt(bytes.byteLength) ||
        (Number(stat.mode) & 0o777) !== mode
      )
        fail(`staged material identity mismatch: ${relative}`);
    } finally {
      await handle.close();
    }
  } finally {
    await Promise.allSettled(opened.reverse().map((entry) => entry.handle.close()));
  }
}

export async function removeOwnedTree(
  parent: SafeDirectory,
  name: string,
  root: SafeDirectory,
): Promise<void> {
  for (const childName of await stableDirectoryNames(root, "staging cleanup")) {
    const child = await openRelativeUnknown(root, childName, "staging cleanup");
    if (child.stat.isDirectory()) {
      await removeOwnedTree(root, childName, {
        handle: child.handle,
        absolute: path.join(root.absolute, childName),
      });
    } else {
      requireOwnerSafe(child.stat, "staging cleanup");
      await unlink(procChild(root, childName));
      await child.handle.close();
    }
  }
  await root.handle.close();
  await rmdir(procChild(parent, name));
}

export async function childExists(parent: SafeDirectory, name: string): Promise<boolean> {
  validateComponent(name, "generation name");
  try {
    await lstat(procChild(parent, name));
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw error;
  }
}

export function procChild(parent: SafeDirectory, name: string): string {
  return `/proc/self/fd/${parent.handle.fd}/${name}`;
}
export function validateRelative(value: string, label: string): void {
  if (typeof value !== "string" || !LOGICAL_PATH.test(value) || Buffer.byteLength(value) > 4096)
    fail(`unsafe ${label}`);
}
export function validateComponent(value: string, label: string): void {
  if (!value || value.includes("/") || value === "." || value === ".." || value.includes("\0"))
    fail(`unsafe ${label}`);
}
export function normalizeDistribution(value: string): string {
  return value.toLowerCase().replace(/[_.]+/g, "-");
}
export function isNative(value: string): boolean {
  return /\.(?:so|pyd|dll|dylib)$/.test(value);
}
export function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
export function requireSafeAncestor(stat: Stat, label: string): void {
  const uid = Number(stat.uid);
  if (
    !stat.isDirectory() ||
    ![0, process.getuid?.()].includes(uid) ||
    (Number(stat.mode) & 0o022) !== 0
  )
    fail(`unsafe owner or mode path component: ${label}`);
}
export function requireOwnerSafe(stat: Stat, label: string): void {
  if (Number(stat.uid) !== process.getuid?.() || (Number(stat.mode) & 0o022) !== 0)
    fail(`unsafe owner or mode: ${label}`);
}
export function requireSafeFile(stat: Stat, label: string, cap: number): void {
  requireOwnerSafe(stat, label);
  if (!stat.isFile() || stat.size > BigInt(cap)) fail(`unsafe preparation file: ${label}`);
}
export function signature(stat: Stat): Signature {
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
export function sameSignature(a: Signature, b: Signature): boolean {
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
export function requireLinuxOwner(): void {
  if (process.platform !== "linux" || process.getuid === undefined)
    fail("development preparation requires Linux owner identity");
}
export function isExistingRename(error: unknown): boolean {
  return ["ENOTEMPTY", "EEXIST"].includes((error as NodeJS.ErrnoException).code ?? "");
}
export function message(error: unknown): string {
  return error instanceof Error ? error.message.slice(0, 4096) : "development preparation failed";
}
export function fail(value: string): never {
  throw new DevelopmentPreparationError(value);
}
