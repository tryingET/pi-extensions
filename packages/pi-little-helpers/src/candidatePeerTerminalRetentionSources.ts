import { execFileSync } from "node:child_process";
import {
  chmodSync,
  copyFileSync,
  linkSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";
import {
  type CandidateLifecycleRecord,
  digestObject,
  getCandidateLifecycleEventsPath,
  getCandidateLifecycleRecordPath,
  getCandidateLifecycleRoot,
  stableJson,
} from "./candidatePeerLifecycleV2Core.ts";
import {
  type CandidatePeerRegistryRecord,
  getCandidatePeerRegistryPath,
} from "./candidatePeerRegistry.ts";
import {
  sha256File,
  type TerminalCandidateState,
  type TerminalCompactionSource,
  withStableTerminalFile,
} from "./candidatePeerTerminalRetentionCore.ts";

export type TerminalCapsuleVerification = {
  resourceId: string;
  generationId: string;
  terminalState: TerminalCandidateState;
  terminalRecordDigest: string;
  capsulePath: string;
  capsuleSha256: string;
  capsuleSize: number;
  capsuleMetadataDigest: string;
  sourceManifest: TerminalCompactionSource[];
  sourceManifestDigest: string;
};

function regularSource(originalPath: string, capsulePath: string): TerminalCompactionSource {
  const info = lstatSync(originalPath);
  if (!info.isFile() || info.isSymbolicLink() || realpathSync(originalPath) !== originalPath) {
    throw new Error(`terminal compaction source is not a canonical regular file: ${originalPath}`);
  }
  if ((info.mode & 0o077) !== 0) {
    throw new Error(`terminal compaction source is not owner-only: ${originalPath}`);
  }
  return {
    originalPath,
    capsulePath,
    sha256: sha256File(originalPath),
    size: info.size,
    mode: info.mode & 0o777,
  };
}

export function terminalArchiveSourcesAt(archiveDir: string): TerminalCompactionSource[] {
  const result: TerminalCompactionSource[] = [];
  for (const entry of readdirSync(archiveDir, { withFileTypes: true })) {
    const full = join(archiveDir, entry.name);
    if (entry.isDirectory() || entry.isSymbolicLink()) {
      throw new Error("candidate terminal archive contains an unsupported nested or linked member");
    }
    result.push(regularSource(full, join("payload", "archive", relative(archiveDir, full))));
  }
  return result.sort((left, right) => left.capsulePath.localeCompare(right.capsulePath));
}

export function terminalArchiveSources(
  record: CandidateLifecycleRecord,
  env: NodeJS.ProcessEnv,
): TerminalCompactionSource[] {
  if (!record.archive) return [];
  const archiveDir = join(
    getCandidateLifecycleRoot(env),
    "archives",
    record.resourceId,
    record.generationId,
  );
  if (resolve(record.archive.archiveDir) !== archiveDir) {
    throw new Error("candidate terminal archive path does not match lifecycle root");
  }
  return terminalArchiveSourcesAt(archiveDir);
}

export function collectTerminalCompactionSources(
  record: CandidateLifecycleRecord,
  env: NodeJS.ProcessEnv,
): TerminalCompactionSource[] {
  const sources: TerminalCompactionSource[] = [];
  for (const alias of [...record.aliases].sort()) {
    const path = resolve(getCandidatePeerRegistryPath(alias, env));
    const registry = JSON.parse(readFileSync(path, "utf8")) as CandidatePeerRegistryRecord;
    if (
      registry.schemaVersion !== 1 ||
      registry.peerRunId !== alias ||
      registry.registryPath !== path ||
      resolve(registry.repoRoot) !== resolve(record.repoRoots[0] ?? "") ||
      resolve(registry.worktreePath) !== resolve(record.worktreePath) ||
      !record.branchNames.includes(registry.branchName)
    ) {
      throw new Error(`candidate terminal registry identity mismatch: ${alias}`);
    }
    sources.push(regularSource(path, join("payload", "registry", `${alias}.json`)));
  }
  sources.push(
    regularSource(
      getCandidateLifecycleRecordPath(record.resourceId, env),
      join("payload", "resource", "record.json"),
    ),
    regularSource(
      getCandidateLifecycleEventsPath(record.resourceId, env),
      join("payload", "resource", "events.jsonl"),
    ),
    ...terminalArchiveSources(record, env),
  );
  return sources.sort((left, right) => left.capsulePath.localeCompare(right.capsulePath));
}

export function copyTerminalCompactionSources(
  stage: string,
  sources: TerminalCompactionSource[],
): void {
  for (const source of sources) {
    const target = join(stage, source.capsulePath);
    mkdirSync(dirname(target), { recursive: true, mode: 0o700 });
    try {
      linkSync(source.originalPath, target);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EXDEV") throw error;
      copyFileSync(source.originalPath, target);
      chmodSync(target, source.mode);
    }
  }
}

function safeCapsuleMembers(capsulePath: string, expected: string[]): void {
  const options = { encoding: "utf8" as const, maxBuffer: 64 * 1024 * 1024 };
  const names = String(execFileSync("tar", ["-tzf", capsulePath], options))
    .split("\n")
    .filter(Boolean);
  const verbose = String(execFileSync("tar", ["-tvzf", capsulePath], options))
    .split("\n")
    .filter(Boolean);
  if (names.length !== verbose.length) throw new Error("terminal capsule listing changed");
  const files: string[] = [];
  for (let index = 0; index < names.length; index += 1) {
    const item = names[index];
    const type = verbose[index]?.[0];
    if (
      item.startsWith("/") ||
      item.split("/").includes("..") ||
      [...item].some((character) => character.charCodeAt(0) < 32) ||
      (type !== "-" && type !== "d")
    ) {
      throw new Error("terminal capsule contains an unsafe member path or type");
    }
    if (type === "-") files.push(item);
    else if (!item.endsWith("/") || !expected.some((path) => path.startsWith(item))) {
      throw new Error("terminal capsule contains an unbound directory member");
    }
  }
  if (stableJson(files.sort()) !== stableJson([...expected].sort())) {
    throw new Error("terminal capsule member set mismatch");
  }
}

export function verifyPreparedTerminalCapsule(prepared: TerminalCapsuleVerification): void {
  const restore = mkdtempSync(join(tmpdir(), "candidate-terminal-prepare-"));
  try {
    withStableTerminalFile(
      prepared.capsulePath,
      "prepared terminal capsule",
      (stableCapsulePath, capsuleDigest, capsuleSize) => {
        if (capsuleDigest !== prepared.capsuleSha256 || capsuleSize !== prepared.capsuleSize) {
          throw new Error("prepared terminal capsule size or digest mismatch");
        }
        safeCapsuleMembers(stableCapsulePath, [
          "capsule-metadata.json",
          ...prepared.sourceManifest.map((item) => item.capsulePath),
        ]);
        execFileSync("tar", ["-xzf", stableCapsulePath, "-C", restore]);
        for (const source of prepared.sourceManifest) {
          const path = resolve(restore, source.capsulePath);
          const info = lstatSync(path);
          if (
            relative(restore, path).startsWith("..") ||
            !info.isFile() ||
            info.isSymbolicLink() ||
            info.size !== source.size ||
            (info.mode & 0o777) !== source.mode ||
            sha256File(path) !== source.sha256
          ) {
            throw new Error(`terminal capsule restoration mismatch: ${source.capsulePath}`);
          }
        }
        const metadataPath = join(restore, "capsule-metadata.json");
        const metadataInfo = lstatSync(metadataPath);
        if (
          !metadataInfo.isFile() ||
          metadataInfo.isSymbolicLink() ||
          (metadataInfo.mode & 0o777) !== 0o600
        ) {
          throw new Error("terminal capsule metadata is not an owner-only regular file");
        }
        const metadata = JSON.parse(readFileSync(metadataPath, "utf8")) as Record<string, unknown>;
        const metadataUnsigned = Object.fromEntries(
          Object.entries(metadata).filter(([key]) => key !== "metadataDigest"),
        );
        if (
          metadata.metadataDigest !== prepared.capsuleMetadataDigest ||
          metadata.metadataDigest !== digestObject(metadataUnsigned) ||
          metadata.resourceId !== prepared.resourceId ||
          metadata.generationId !== prepared.generationId ||
          metadata.terminalState !== prepared.terminalState ||
          metadata.terminalRecordDigest !== prepared.terminalRecordDigest ||
          metadata.sourceManifestDigest !== prepared.sourceManifestDigest ||
          stableJson(metadata.sourceManifest) !== stableJson(prepared.sourceManifest)
        ) {
          throw new Error("terminal capsule metadata binding mismatch");
        }
      },
    );
  } finally {
    rmSync(restore, { recursive: true, force: true });
  }
}

export function assertTerminalCompactionSourcesCurrent(sources: TerminalCompactionSource[]): void {
  for (const source of sources) {
    const info = lstatSync(source.originalPath);
    if (
      !info.isFile() ||
      info.isSymbolicLink() ||
      info.size !== source.size ||
      (info.mode & 0o777) !== source.mode ||
      sha256File(source.originalPath) !== source.sha256
    ) {
      throw new Error(`terminal compaction source drifted: ${source.originalPath}`);
    }
  }
}

export function assertExactTerminalCompactionSources(
  record: CandidateLifecycleRecord,
  env: NodeJS.ProcessEnv,
  expected: TerminalCompactionSource[],
): void {
  assertTerminalCompactionSourcesCurrent(expected);
  const current = collectTerminalCompactionSources(record, env);
  if (stableJson(current) !== stableJson(expected)) {
    throw new Error("terminal compaction source member set drifted");
  }
}

export function assertTerminalCompactionSourceAt(
  path: string,
  expected: TerminalCompactionSource,
  label: string,
): void {
  const current = regularSource(path, expected.capsulePath);
  if (
    current.capsulePath !== expected.capsulePath ||
    current.sha256 !== expected.sha256 ||
    current.size !== expected.size ||
    current.mode !== expected.mode
  ) {
    throw new Error(`${label} is not capsule-bound`);
  }
}

export function assertRecoverableTerminalCompactionSources(
  record: CandidateLifecycleRecord,
  expected: TerminalCompactionSource[],
  paths: { eventsQuarantine: string; archiveQuarantine: string },
): void {
  const retained = expected.filter(
    (source) =>
      source.capsulePath === "payload/resource/record.json" ||
      source.capsulePath.startsWith("payload/registry/"),
  );
  assertTerminalCompactionSourcesCurrent(retained);

  const eventSource = expected.find(
    (source) => source.capsulePath === "payload/resource/events.jsonl",
  );
  if (!eventSource) throw new Error("terminal lifecycle event source is missing from manifest");
  const liveEvents = lstatExists(eventSource.originalPath);
  const quarantinedEvents = lstatExists(paths.eventsQuarantine);
  if (liveEvents && quarantinedEvents) {
    throw new Error("terminal lifecycle event source and quarantine both exist");
  }
  if (liveEvents) {
    assertTerminalCompactionSourceAt(eventSource.originalPath, eventSource, "terminal events");
  }
  if (quarantinedEvents) {
    assertTerminalCompactionSourceAt(
      paths.eventsQuarantine,
      eventSource,
      "terminal events quarantine",
    );
  }

  const expectedArchive = expected.filter((source) =>
    source.capsulePath.startsWith("payload/archive/"),
  );
  const liveArchive = Boolean(record.archive && lstatExists(record.archive.archiveDir));
  const quarantinedArchive = lstatExists(paths.archiveQuarantine);
  if (liveArchive && quarantinedArchive) {
    throw new Error("terminal archive source and quarantine both exist");
  }
  if (!record.archive && quarantinedArchive) {
    throw new Error("terminal archive quarantine exists without an archive binding");
  }
  if (liveArchive && record.archive) {
    const current = terminalArchiveSourcesAt(record.archive.archiveDir);
    if (stableJson(current) !== stableJson(expectedArchive)) {
      throw new Error("terminal archive source member set drifted");
    }
  }
  if (quarantinedArchive) {
    const expectedByPath = new Map(expectedArchive.map((source) => [source.capsulePath, source]));
    for (const source of terminalArchiveSourcesAt(paths.archiveQuarantine)) {
      const expectedSource = expectedByPath.get(source.capsulePath);
      if (
        !expectedSource ||
        source.sha256 !== expectedSource.sha256 ||
        source.size !== expectedSource.size ||
        source.mode !== expectedSource.mode
      ) {
        throw new Error("terminal archive quarantine member set drifted");
      }
    }
  }
}

function lstatExists(path: string): boolean {
  try {
    lstatSync(path);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw error;
  }
}
