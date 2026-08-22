import { domainSeparatedDigest } from "./canonical-cbor.js";
import { BoundaryError } from "./errors.js";
import { WorkspacePath } from "./operations.js";
import { assertInteger, assertString, deepFreeze, stableUtf8Compare } from "./util.js";

const HEX_SHA256 = /^[a-f0-9]{64}$/u;
const GIT_OBJECT_ID = /^[a-f0-9]{40}(?:[a-f0-9]{24})?$/u;
function sha(value, label) {
  return assertString(value, label, { min: 64, max: 64, pattern: HEX_SHA256 });
}

export function createChangeSet({
  changeSetId,
  leaseId,
  sourceManifestSha256,
  sourceCommitObjectId,
  workspaceGeneration,
  dispositionDigest,
  entries,
  createdAtUnixMs = Date.now(),
}) {
  if (!Array.isArray(entries)) throw new BoundaryError("INVALID_CHANGE_ENTRIES", "entries must be an array");
  const seen = new Set();
  let totalContentBytes = 0;
  const normalized = entries.map((entry, index) => {
    const path = WorkspacePath.parse(entry.path, { allowRoot: false }).toString();
    if (seen.has(path)) throw new BoundaryError("DUPLICATE_CHANGE_PATH", `Duplicate change path: ${path}`);
    seen.add(path);
    if (entry.operation === "delete") {
      return deepFreeze({ operation: "delete", path, baseSha256: sha(entry.baseSha256, `entries[${index}].baseSha256`) });
    }
    if (entry.operation === "symlink") {
      const target = assertString(entry.target, `entries[${index}].target`, { min: 1, max: 4_096 });
      if (target.startsWith("/") || target.split("/").includes("..")) {
        throw new BoundaryError("UNSAFE_SYMLINK_TARGET", `Unsafe symlink target for ${path}`);
      }
      return deepFreeze({
        operation: "symlink",
        path,
        baseSha256: entry.baseSha256 === undefined ? undefined : sha(entry.baseSha256, `entries[${index}].baseSha256`),
        target,
        targetSha256: sha(entry.targetSha256, `entries[${index}].targetSha256`),
      });
    }
    if (entry.operation === "add" || entry.operation === "replace") {
      const contentLength = assertInteger(entry.contentLength, `entries[${index}].contentLength`, 0, Number.MAX_SAFE_INTEGER);
      totalContentBytes += contentLength;
      return deepFreeze({
        operation: entry.operation,
        path,
        executable: Boolean(entry.executable),
        baseSha256: entry.baseSha256 === undefined ? undefined : sha(entry.baseSha256, `entries[${index}].baseSha256`),
        contentSha256: sha(entry.contentSha256, `entries[${index}].contentSha256`),
        contentLength,
      });
    }
    throw new BoundaryError("UNSUPPORTED_CHANGE_OPERATION", `Unsupported change operation: ${entry.operation}`);
  });
  normalized.sort((left, right) => stableUtf8Compare(left.path, right.path));
  const changeSet = {
    schema: "pi-tool-boundary-changes/v1",
    changeSetId: assertString(changeSetId, "changeSetId", { min: 1, max: 256 }),
    leaseId: assertString(leaseId, "leaseId", { min: 1, max: 256 }),
    sourceManifestSha256: sha(sourceManifestSha256, "sourceManifestSha256"),
    sourceCommitObjectId: assertString(sourceCommitObjectId, "sourceCommitObjectId", {
      min: 40,
      max: 64,
      pattern: GIT_OBJECT_ID,
    }),
    workspaceGeneration: assertInteger(workspaceGeneration, "workspaceGeneration", 1, Number.MAX_SAFE_INTEGER),
    createdAtUnixMs: assertInteger(createdAtUnixMs, "createdAtUnixMs", 1, Number.MAX_SAFE_INTEGER),
    pathProfile: "utf8-nfc-safe/v1",
    entries: normalized,
    totalContentBytes,
    dispositionDigest: sha(dispositionDigest, "dispositionDigest"),
  };
  const body = {
    1: changeSet.changeSetId,
    2: changeSet.leaseId,
    3: changeSet.sourceManifestSha256,
    4: changeSet.sourceCommitObjectId,
    5: changeSet.workspaceGeneration,
    6: normalized.map((entry) => [entry.operation, entry.path, entry.baseSha256 ?? null, entry.contentSha256 ?? entry.targetSha256 ?? null, entry.contentLength ?? null, entry.executable ?? null, entry.target ?? null]),
    7: totalContentBytes,
    8: changeSet.dispositionDigest,
  };
  changeSet.manifestSha256 = domainSeparatedDigest("pi-tool-boundary/change-set/v1", body);
  return deepFreeze(changeSet);
}
