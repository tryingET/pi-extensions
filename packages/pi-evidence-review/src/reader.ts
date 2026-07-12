import { type BigIntStats, constants } from "node:fs";
import { lstat, open, realpath } from "node:fs/promises";
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

async function openedDescriptorTarget(fileDescriptor: number): Promise<string> {
  for (const descriptorPath of [`/proc/self/fd/${fileDescriptor}`, `/dev/fd/${fileDescriptor}`]) {
    try {
      return await realpath(descriptorPath);
    } catch {
      // Try the next host-provided descriptor path. Absence fails closed below.
    }
  }
  throw new ReviewRejection("descriptor_containment_unavailable");
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
