import { domainSeparatedDigest } from "./canonical-cbor.js";
import { BoundaryError } from "./errors.js";
import { WorkspacePath } from "./operations.js";
import { assertInteger, assertString, deepFreeze, stableUtf8Compare } from "./util.js";

const HEX_SHA256 = /^[a-f0-9]{64}$/u;
const GIT_OBJECT = /^[a-f0-9]{40,64}$/u;

function digest(value, label) {
  return assertString(value, label, { min: 40, max: 64, pattern: label.includes("Sha256") ? HEX_SHA256 : GIT_OBJECT });
}

export function createSourceSnapshot({
  sourceRepositoryId,
  sourceCommitObjectId,
  sourceTreeObjectId,
  gitVersion,
  entries,
  createdAtUnixMs = Date.now(),
}) {
  if (!Array.isArray(entries)) throw new BoundaryError("INVALID_SOURCE_ENTRIES", "entries must be an array");
  const seen = new Set();
  let totalBytes = 0;
  const normalizedEntries = entries.map((entry, index) => {
    if (!entry || typeof entry !== "object") {
      throw new BoundaryError("INVALID_SOURCE_ENTRY", `entries[${index}] must be an object`);
    }
    const path = WorkspacePath.parse(entry.path, { allowRoot: false }).toString();
    if (seen.has(path)) throw new BoundaryError("DUPLICATE_SOURCE_PATH", `Duplicate source path: ${path}`);
    seen.add(path);
    const contentLength = assertInteger(entry.contentLength, `entries[${index}].contentLength`, 0, Number.MAX_SAFE_INTEGER);
    totalBytes += contentLength;
    if (entry.kind === "file") {
      return deepFreeze({
        kind: "file",
        path,
        executable: Boolean(entry.executable),
        gitBlobObjectId: digest(entry.gitBlobObjectId, "gitBlobObjectId"),
        contentSha256: digest(entry.contentSha256, "contentSha256"),
        contentLength,
      });
    }
    if (entry.kind === "symlink") {
      const target = assertString(entry.target, `entries[${index}].target`, { min: 1, max: 4_096 });
      if (target.startsWith("/") || target.split("/").includes("..")) {
        throw new BoundaryError("UNSAFE_SYMLINK_TARGET", `Unsafe symlink target for ${path}`);
      }
      return deepFreeze({
        kind: "symlink",
        path,
        target,
        gitBlobObjectId: digest(entry.gitBlobObjectId, "gitBlobObjectId"),
        contentSha256: digest(entry.contentSha256, "contentSha256"),
        contentLength,
      });
    }
    throw new BoundaryError("UNSUPPORTED_SOURCE_ENTRY", `Unsupported source entry kind: ${entry.kind}`);
  });
  normalizedEntries.sort((left, right) => stableUtf8Compare(left.path, right.path));
  const snapshot = {
    schema: "pi-tool-boundary-source/v1",
    sourceMode: "committed-clean-tree/v1",
    sourceRepositoryId: assertString(sourceRepositoryId, "sourceRepositoryId", { min: 1, max: 1_024 }),
    sourceCommitObjectId: digest(sourceCommitObjectId, "sourceCommitObjectId"),
    sourceTreeObjectId: digest(sourceTreeObjectId, "sourceTreeObjectId"),
    createdAtUnixMs: assertInteger(createdAtUnixMs, "createdAtUnixMs", 1, Number.MAX_SAFE_INTEGER),
    gitVersion: assertString(gitVersion, "gitVersion", { min: 1, max: 256 }),
    pathProfile: "utf8-nfc-safe/v1",
    entries: normalizedEntries,
    totalFiles: normalizedEntries.length,
    totalBytes,
  };
  const body = {
    1: snapshot.sourceMode,
    2: snapshot.sourceRepositoryId,
    3: snapshot.sourceCommitObjectId,
    4: snapshot.sourceTreeObjectId,
    5: snapshot.pathProfile,
    6: normalizedEntries.map((entry) =>
      entry.kind === "file"
        ? ["file", entry.path, entry.executable, entry.gitBlobObjectId, entry.contentSha256, entry.contentLength]
        : ["symlink", entry.path, entry.target, entry.gitBlobObjectId, entry.contentSha256, entry.contentLength],
    ),
    7: snapshot.totalFiles,
    8: snapshot.totalBytes,
  };
  snapshot.manifestSha256 = domainSeparatedDigest("pi-tool-boundary/source-snapshot/v1", body);
  return deepFreeze(snapshot);
}
