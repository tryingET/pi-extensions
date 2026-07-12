import { type BigIntStats, constants, type Dir } from "node:fs";
import { type FileHandle, lstat, open, opendir, realpath } from "node:fs/promises";
import { isAbsolute, relative, resolve, sep } from "node:path";
import type { EvidenceReview } from "./validation.ts";
import { RESOURCE_CAPS, ReviewRejection, validateEvidenceReview } from "./validation.ts";

function contained(root: string, target: string): boolean {
  const rel = relative(root, target);
  return rel === "" || (!rel.startsWith(`..${sep}`) && rel !== ".." && !isAbsolute(rel));
}

function sameIdentity(left: BigIntStats, right: BigIntStats): boolean {
  return left.dev === right.dev && left.ino === right.ino;
}

function sameStableMetadata(left: BigIntStats, right: BigIntStats): boolean {
  return (
    sameIdentity(left, right) &&
    left.size === right.size &&
    left.mtimeNs === right.mtimeNs &&
    left.ctimeNs === right.ctimeNs
  );
}

async function openedDescriptorPath(fileDescriptor: number): Promise<string> {
  for (const descriptorPath of [`/proc/self/fd/${fileDescriptor}`, `/dev/fd/${fileDescriptor}`]) {
    try {
      await realpath(descriptorPath);
      return descriptorPath;
    } catch {
      // Try the next host-provided descriptor path. Absence fails closed below.
    }
  }
  throw new ReviewRejection("descriptor_containment_unavailable");
}

async function openedDescriptorTarget(fileDescriptor: number): Promise<string> {
  return realpath(await openedDescriptorPath(fileDescriptor));
}

async function inspectPathComponents(
  workspaceReal: string,
  lexicalTarget: string,
): Promise<BigIntStats[]> {
  const rel = relative(workspaceReal, lexicalTarget);
  const segments = rel.split(sep).filter(Boolean);
  const snapshots: BigIntStats[] = [];
  let current = workspaceReal;
  for (const [index, segment] of segments.entries()) {
    current = resolve(current, segment);
    const stats = await lstat(current, { bigint: true }).catch(() => {
      throw new ReviewRejection("file");
    });
    if (stats.isSymbolicLink()) throw new ReviewRejection("symlink_component");
    if (index < segments.length - 1 && !stats.isDirectory()) {
      throw new ReviewRejection("path_component_type");
    }
    snapshots.push(stats);
  }
  return snapshots;
}

function requireSameComponentSnapshots(before: BigIntStats[], after: BigIntStats[]): void {
  if (
    before.length !== after.length ||
    before.some((snapshot, index) => {
      const current = after[index];
      return !current || !sameStableMetadata(snapshot, current);
    })
  ) {
    throw new ReviewRejection("path_changed");
  }
}

export type ReaderTestHooks = {
  beforeOpen?: () => void | Promise<void>;
  afterOpen?: () => void | Promise<void>;
  afterFirstRead?: () => void | Promise<void>;
};

export type EvidenceReviewDiscoveryCaps = Readonly<{
  directories: number;
  entries: number;
  jsonCandidates: number;
  validatedCandidates: number;
  matches: number;
}>;

export const DISCOVERY_CAPS: EvidenceReviewDiscoveryCaps = Object.freeze({
  directories: 256,
  entries: 4_096,
  jsonCandidates: 512,
  validatedCandidates: 128,
  matches: 50,
});

export type EvidenceReviewDiscovery = {
  files: string[];
  truncated: boolean;
};

const SKIPPED_DISCOVERY_DIRECTORIES = new Set([
  ".git",
  ".cache",
  "build",
  "coverage",
  "dist",
  "node_modules",
  "vendor",
]);

function discoveryPriority(namedPath: string): number {
  return /(?:evidence|review)/iu.test(namedPath) ? 0 : 1;
}

function pickerSafePath(namedPath: string): boolean {
  return !/[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/u.test(namedPath);
}

function requirePositiveDiscoveryCaps(caps: EvidenceReviewDiscoveryCaps): void {
  if (Object.values(caps).some((value) => !Number.isSafeInteger(value) || value < 1)) {
    throw new ReviewRejection("discovery_caps");
  }
}

async function openDiscoveryDirectory(
  workspaceReal: string,
  directoryPath: string,
): Promise<{ directory: Dir; handle: FileHandle }> {
  if (typeof constants.O_NOFOLLOW !== "number" || typeof constants.O_DIRECTORY !== "number") {
    throw new ReviewRejection("no_follow_unavailable");
  }
  const componentSnapshots = await inspectPathComponents(workspaceReal, directoryPath);
  const before =
    componentSnapshots.at(-1) ??
    (await lstat(workspaceReal, { bigint: true }).catch(() => {
      throw new ReviewRejection("workspace");
    }));
  if (!before.isDirectory()) throw new ReviewRejection("path_component_type");

  const handle = await open(
    directoryPath,
    constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW,
  ).catch(() => {
    throw new ReviewRejection("open");
  });
  try {
    const opened = await handle.stat({ bigint: true });
    if (!opened.isDirectory() || !sameStableMetadata(before, opened)) {
      throw new ReviewRejection("identity_or_metadata");
    }
    const descriptorPath = await openedDescriptorPath(handle.fd);
    const descriptorTarget = await realpath(descriptorPath);
    if (!contained(workspaceReal, descriptorTarget)) {
      throw new ReviewRejection("opened_escape");
    }
    const openedComponents = await inspectPathComponents(workspaceReal, directoryPath);
    requireSameComponentSnapshots(componentSnapshots, openedComponents);
    return { directory: await opendir(descriptorPath), handle };
  } catch (error) {
    await handle.close();
    throw error;
  }
}

export async function discoverEvidenceReviewFiles(
  workspace: string,
  caps: EvidenceReviewDiscoveryCaps = DISCOVERY_CAPS,
): Promise<EvidenceReviewDiscovery> {
  requirePositiveDiscoveryCaps(caps);
  const workspaceReal = await realpath(workspace).catch(() => {
    throw new ReviewRejection("workspace");
  });
  const directories: string[] = [workspaceReal];
  const candidates: string[] = [];
  let directoryCount = 0;
  let entryCount = 0;
  let truncated = false;

  traversal: while (directories.length > 0) {
    if (directoryCount >= caps.directories) {
      truncated = true;
      break;
    }
    const directoryPath = directories.shift();
    if (!directoryPath) break;
    directoryCount += 1;

    let openedDirectory: { directory: Dir; handle: FileHandle };
    try {
      openedDirectory = await openDiscoveryDirectory(workspaceReal, directoryPath);
    } catch {
      continue;
    }
    try {
      for await (const entry of openedDirectory.directory) {
        entryCount += 1;
        if (entryCount > caps.entries) {
          truncated = true;
          break traversal;
        }

        const absolutePath = resolve(directoryPath, entry.name);
        if (!contained(workspaceReal, absolutePath) || entry.isSymbolicLink()) continue;
        if (entry.isDirectory()) {
          if (!SKIPPED_DISCOVERY_DIRECTORIES.has(entry.name)) directories.push(absolutePath);
          continue;
        }
        if (entry.isFile() && entry.name.toLowerCase().endsWith(".json")) {
          const namedPath = relative(workspaceReal, absolutePath);
          if (!pickerSafePath(namedPath)) continue;
          candidates.push(namedPath);
          if (candidates.length >= caps.jsonCandidates) {
            truncated = true;
            break traversal;
          }
        }
      }
    } finally {
      await openedDirectory.handle.close();
    }
  }

  candidates.sort(
    (left, right) =>
      discoveryPriority(left) - discoveryPriority(right) || left.localeCompare(right),
  );
  if (candidates.length > caps.validatedCandidates) truncated = true;

  const files: string[] = [];
  for (const namedPath of candidates.slice(0, caps.validatedCandidates)) {
    try {
      await readEvidenceReviewFile(workspaceReal, namedPath);
      files.push(namedPath);
      if (files.length >= caps.matches) {
        if (candidates.length > files.length) truncated = true;
        break;
      }
    } catch {
      // Discovery exposes only files that pass the same fail-closed reader used after selection.
    }
  }

  return { files, truncated };
}

export async function readEvidenceReviewFile(
  workspace: string,
  namedPath: string,
  testHooks: ReaderTestHooks = {},
): Promise<EvidenceReview> {
  if (!namedPath || namedPath.includes("\0") || isAbsolute(namedPath)) {
    throw new ReviewRejection("path");
  }
  if (namedPath.trim() !== namedPath || !namedPath.toLowerCase().endsWith(".json")) {
    throw new ReviewRejection("path");
  }

  const workspaceReal = await realpath(workspace).catch(() => {
    throw new ReviewRejection("workspace");
  });
  const lexicalTarget = resolve(workspaceReal, namedPath);
  if (!contained(workspaceReal, lexicalTarget)) throw new ReviewRejection("path_escape");

  const componentSnapshots = await inspectPathComponents(workspaceReal, lexicalTarget);
  const before = componentSnapshots.at(-1);
  if (!before?.isFile()) throw new ReviewRejection("file_type");
  if (before.size > BigInt(RESOURCE_CAPS.encodedBytes)) {
    throw new ReviewRejection("encoded_bytes");
  }

  const resolvedTarget = await realpath(lexicalTarget).catch(() => {
    throw new ReviewRejection("file");
  });
  if (!contained(workspaceReal, resolvedTarget)) throw new ReviewRejection("resolved_escape");
  if (typeof constants.O_NOFOLLOW !== "number") {
    throw new ReviewRejection("no_follow_unavailable");
  }

  await testHooks.beforeOpen?.();
  const handle = await open(lexicalTarget, constants.O_RDONLY | constants.O_NOFOLLOW).catch(() => {
    throw new ReviewRejection("open");
  });
  try {
    const opened = await handle.stat({ bigint: true });
    if (!opened.isFile() || !sameStableMetadata(before, opened)) {
      throw new ReviewRejection("identity_or_metadata");
    }
    const openedComponents = await inspectPathComponents(workspaceReal, lexicalTarget);
    requireSameComponentSnapshots(componentSnapshots, openedComponents);

    const descriptorTarget = await openedDescriptorTarget(handle.fd);
    if (!contained(workspaceReal, descriptorTarget)) {
      throw new ReviewRejection("opened_escape");
    }
    await testHooks.afterOpen?.();

    const bytes = Buffer.allocUnsafe(RESOURCE_CAPS.encodedBytes + 1);
    let offset = 0;
    let firstRead = true;
    while (offset < bytes.length) {
      const result = await handle.read(bytes, offset, bytes.length - offset, offset);
      if (result.bytesRead === 0) break;
      offset += result.bytesRead;
      if (firstRead) {
        firstRead = false;
        await testHooks.afterFirstRead?.();
      }
    }
    if (offset > RESOURCE_CAPS.encodedBytes) throw new ReviewRejection("encoded_bytes");

    const after = await handle.stat({ bigint: true });
    if (!after.isFile() || !sameStableMetadata(opened, after) || after.size !== BigInt(offset)) {
      throw new ReviewRejection("changed_during_read");
    }
    const afterComponents = await inspectPathComponents(workspaceReal, lexicalTarget);
    requireSameComponentSnapshots(componentSnapshots, afterComponents);

    const decoder = new TextDecoder("utf-8", { fatal: true });
    let text: string;
    try {
      text = decoder.decode(bytes.subarray(0, offset));
    } catch {
      throw new ReviewRejection("utf8");
    }

    let value: unknown;
    try {
      value = JSON.parse(text);
    } catch {
      throw new ReviewRejection("json");
    }
    return validateEvidenceReview(value);
  } finally {
    await handle.close();
  }
}
