import { execFileSync } from "node:child_process";
import { lstatSync, mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative, resolve } from "node:path";
import {
  type CandidateLifecycleRecord,
  digestObject,
  stableJson,
} from "./candidatePeerLifecycleV2Core.ts";
import {
  readTerminalCompactionGarbageCollectionReceipt,
  readTerminalCompactionMarker,
  sha256File,
  type TerminalCompactionMarker,
  withStableTerminalFile,
} from "./candidatePeerTerminalRetentionCore.ts";

export type MaterializedTerminalCompaction = {
  marker: TerminalCompactionMarker;
  root: string;
  eventsPath: string;
  archiveDir?: string;
  registryPaths: Map<string, string>;
  cleanup: () => void;
};

function restoredFiles(root: string): string[] {
  const result: string[] = [];
  const stack = [root];
  while (stack.length > 0) {
    const current = stack.pop() as string;
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const full = join(current, entry.name);
      if (entry.isDirectory() && !entry.isSymbolicLink()) stack.push(full);
      else result.push(relative(root, full));
    }
  }
  return result.sort();
}

function assertSafeArchiveListing(capsulePath: string, expectedFiles: string[]): void {
  const commandOptions = { encoding: "utf8" as const, maxBuffer: 64 * 1024 * 1024 };
  const names = String(execFileSync("tar", ["-tzf", capsulePath], commandOptions))
    .split("\n")
    .filter(Boolean);
  const verbose = String(execFileSync("tar", ["-tvzf", capsulePath], commandOptions))
    .split("\n")
    .filter(Boolean);
  if (names.length !== verbose.length) {
    throw new Error("terminal compaction capsule listing changed during inspection");
  }
  const files: string[] = [];
  for (let index = 0; index < names.length; index += 1) {
    const item = names[index];
    const type = verbose[index]?.[0];
    if (
      item.startsWith("/") ||
      item.split("/").some((part) => part === "..") ||
      [...item].some((character) => character.charCodeAt(0) < 32) ||
      (type !== "-" && type !== "d")
    ) {
      throw new Error("terminal compaction capsule contains an unsafe member path or type");
    }
    if (type === "-") files.push(item);
    else if (!item.endsWith("/") || !expectedFiles.some((path) => path.startsWith(item))) {
      throw new Error("terminal compaction capsule contains an unbound directory member");
    }
  }
  if (stableJson(files.sort()) !== stableJson([...expectedFiles].sort())) {
    throw new Error("terminal compaction capsule member set mismatch");
  }
}

export function materializeTerminalCompaction(
  record: CandidateLifecycleRecord,
  env: NodeJS.ProcessEnv = process.env,
  options: { allowPending?: boolean } = {},
): MaterializedTerminalCompaction | undefined {
  const marker = readTerminalCompactionMarker(record, env);
  if (!marker) return undefined;
  if (!options.allowPending) {
    const receipt = readTerminalCompactionGarbageCollectionReceipt(record, marker, env);
    if (!receipt) return undefined;
  }
  const root = mkdtempSync(join(tmpdir(), "candidate-terminal-restore-"));
  try {
    return withStableTerminalFile(
      marker.capsulePath,
      "terminal compaction capsule",
      (stableCapsulePath, capsuleDigest, capsuleSize) => {
        if (capsuleDigest !== marker.capsuleSha256 || capsuleSize !== marker.capsuleSize) {
          throw new Error("terminal compaction capsule size or digest mismatch");
        }
        const expectedFiles = [
          "capsule-metadata.json",
          ...marker.sourceManifest.map((item) => item.capsulePath),
        ];
        assertSafeArchiveListing(stableCapsulePath, expectedFiles);
        execFileSync("tar", ["-xzf", stableCapsulePath, "-C", root]);
        if (stableJson(restoredFiles(root)) !== stableJson([...expectedFiles].sort())) {
          throw new Error("terminal compaction restored member set mismatch");
        }
        for (const source of marker.sourceManifest) {
          const restored = resolve(root, source.capsulePath);
          if (relative(root, restored).startsWith("..")) {
            throw new Error("terminal compaction restored path escaped its root");
          }
          const info = lstatSync(restored);
          if (
            !info.isFile() ||
            info.isSymbolicLink() ||
            info.size !== source.size ||
            (info.mode & 0o777) !== source.mode ||
            sha256File(restored) !== source.sha256
          ) {
            throw new Error(`terminal compaction restored byte mismatch: ${source.capsulePath}`);
          }
        }
        const metadataPath = join(root, "capsule-metadata.json");
        const metadataInfo = lstatSync(metadataPath);
        if (
          !metadataInfo.isFile() ||
          metadataInfo.isSymbolicLink() ||
          (metadataInfo.mode & 0o777) !== 0o600
        ) {
          throw new Error("terminal compaction capsule metadata is not an owner-only regular file");
        }
        const metadata = JSON.parse(readFileSync(metadataPath, "utf8")) as Record<string, unknown>;
        const metadataUnsigned = Object.fromEntries(
          Object.entries(metadata).filter(([key]) => key !== "metadataDigest"),
        );
        if (
          metadata.metadataDigest !== marker.capsuleMetadataDigest ||
          metadata.metadataDigest !== digestObject(metadataUnsigned) ||
          metadata.resourceId !== record.resourceId ||
          metadata.generationId !== record.generationId ||
          metadata.terminalState !== record.state ||
          metadata.terminalRecordDigest !== marker.terminalRecordDigest ||
          metadata.sourceManifestDigest !== marker.sourceManifestDigest ||
          stableJson(metadata.sourceManifest) !== stableJson(marker.sourceManifest)
        ) {
          throw new Error("terminal compaction capsule metadata binding mismatch");
        }
        const restoredRecord = JSON.parse(
          readFileSync(join(root, "payload", "resource", "record.json"), "utf8"),
        );
        if (digestObject(restoredRecord) !== marker.terminalRecordDigest) {
          throw new Error("terminal compaction restored record digest mismatch");
        }
        const registryPaths = new Map<string, string>();
        for (const alias of marker.aliases) {
          registryPaths.set(alias, join(root, "payload", "registry", `${alias}.json`));
        }
        const archiveDir = marker.sourceManifest.some((item) =>
          item.capsulePath.startsWith("payload/archive/"),
        )
          ? join(root, "payload", "archive")
          : undefined;
        return {
          marker,
          root,
          eventsPath: join(root, "payload", "resource", "events.jsonl"),
          ...(archiveDir ? { archiveDir } : {}),
          registryPaths,
          cleanup: () => rmSync(root, { recursive: true, force: true }),
        };
      },
    );
  } catch (error) {
    rmSync(root, { recursive: true, force: true });
    throw error;
  }
}
