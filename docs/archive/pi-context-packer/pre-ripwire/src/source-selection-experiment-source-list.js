import path from "node:path";

import { parseRawJson } from "./source-selection-experiment-raw.js";
import {
  boundedText,
  compareUtf8,
  exactKeys,
  invariant,
  isSafePath,
  normalizeText,
  unique,
} from "./source-selection-experiment-utils.js";

export const SOURCE_LIST_CONTRACT = "source-list.v1";
export const DEFAULT_SOURCE_EXTENSIONS = Object.freeze([
  ".bash",
  ".c",
  ".cc",
  ".cjs",
  ".cpp",
  ".cs",
  ".go",
  ".h",
  ".hpp",
  ".java",
  ".js",
  ".jsx",
  ".kt",
  ".lua",
  ".mjs",
  ".php",
  ".py",
  ".rb",
  ".rs",
  ".sh",
  ".swift",
  ".ts",
  ".tsx",
  ".zsh",
]);

const INDEX_KINDS = new Set(["regular", "symlink", "gitlink", "conflicted", "other"]);
const WORKTREE_KINDS = new Set([
  "regular",
  "symlink",
  "gitlink",
  "conflicted",
  "other",
  "directory",
  "missing",
  "indeterminate",
]);
const METADATA_STATUSES = new Set(["present", "absent", "invalid", "unreadable", "not_applicable"]);
const INVALID_METADATA_ERRORS = new Set([
  "duplicate_summary",
  "invalid_summary",
  "invalid_read_when",
  "metadata_comment_too_large",
  "unterminated_metadata_comment",
]);

function canonicalOrder(values) {
  return values.every((value, index) => index === 0 || compareUtf8(values[index - 1], value) < 0);
}

function sourceMetadataScalar(value) {
  return (
    boundedText(value, 240, true) &&
    value.length <= 240 &&
    value === normalizeText(value) &&
    ![...value].some((character) => {
      const code = character.codePointAt(0);
      return code <= 0x1f || (code >= 0x7f && code <= 0x9f);
    })
  );
}

function validateMetadata(item, label) {
  invariant(METADATA_STATUSES.has(item.metadataStatus), `${label}.metadataStatus is invalid`);
  const unavailable = () => {
    invariant(item.summary === null, `${label}.summary must be null`);
    invariant(
      Array.isArray(item.readWhen) && item.readWhen.length === 0,
      `${label}.readWhen must be empty`,
    );
  };
  if (item.metadataStatus === "present") {
    invariant(
      item.indexKind === "regular" && item.worktreeKind === "regular",
      `${label}: present metadata requires a regular source`,
    );
    invariant(sourceMetadataScalar(item.summary), `${label}.summary violates source-list grammar`);
    invariant(
      Array.isArray(item.readWhen) &&
        item.readWhen.length <= 5 &&
        item.readWhen.every(sourceMetadataScalar),
      `${label}.readWhen violates source-list grammar`,
    );
    invariant(item.metadataError === null, `${label}.metadataError must be null`);
    return;
  }
  unavailable();
  if (item.metadataStatus === "absent") {
    invariant(
      item.indexKind === "regular" &&
        item.worktreeKind === "regular" &&
        item.metadataError === null,
      `${label}: absent metadata posture is inconsistent`,
    );
  } else if (item.metadataStatus === "invalid") {
    invariant(
      item.indexKind === "regular" &&
        item.worktreeKind === "regular" &&
        INVALID_METADATA_ERRORS.has(item.metadataError),
      `${label}: invalid metadata posture is inconsistent`,
    );
  } else if (item.metadataStatus === "unreadable") {
    invariant(
      item.indexKind === "regular",
      `${label}: unreadable metadata requires a regular index entry`,
    );
    invariant(
      item.worktreeKind !== "regular" && boundedText(item.metadataError, 512, true),
      `${label}: unreadable metadata posture is inconsistent`,
    );
  } else {
    invariant(item.indexKind !== "regular", `${label}: not_applicable cannot be regular`);
    invariant(item.worktreeKind === item.indexKind, `${label}: non-regular kinds must agree`);
    invariant(item.metadataError === null, `${label}.metadataError must be null`);
  }
}

function validateItem(item, index) {
  const label = `sourceList.items[${index}]`;
  exactKeys(
    item,
    [
      "path",
      "indexKind",
      "extension",
      "worktreeKind",
      "metadataStatus",
      "summary",
      "readWhen",
      "metadataError",
    ],
    [],
    label,
  );
  invariant(isSafePath(item.path), `${label}.path is unsafe for context selection`);
  invariant(INDEX_KINDS.has(item.indexKind), `${label}.indexKind is invalid`);
  invariant(WORKTREE_KINDS.has(item.worktreeKind), `${label}.worktreeKind is invalid`);
  invariant(
    item.extension === path.posix.extname(item.path).toLowerCase() &&
      DEFAULT_SOURCE_EXTENSIONS.includes(item.extension),
    `${label}.extension is invalid`,
  );
  validateMetadata(item, label);
}

export function validateSourceListArtifact(sourceListArtifact) {
  exactKeys(sourceListArtifact, ["rawJson", "rawSha256"], [], "sourceListArtifact");
  const payload = parseRawJson(
    sourceListArtifact.rawJson,
    sourceListArtifact.rawSha256,
    "source-list raw artifact",
  );
  exactKeys(
    payload,
    [
      "contractVersion",
      "mode",
      "repository",
      "supportedExtensions",
      "totalCount",
      "returnedCount",
      "page",
      "pageSize",
      "totalPages",
      "truncated",
      "items",
      "violationCount",
      "violations",
      "ok",
    ],
    [],
    "source-list payload",
  );
  invariant(payload.contractVersion === SOURCE_LIST_CONTRACT, "source-list contract mismatch");
  invariant(payload.mode === "inventory", "source-list artifact must be inventory mode");
  invariant(payload.repository === ".", "source-list repository must be portable dot form");
  invariant(payload.ok === true, "source-list artifact must report ok");
  invariant(
    Array.isArray(payload.supportedExtensions) &&
      payload.supportedExtensions.length === DEFAULT_SOURCE_EXTENSIONS.length &&
      payload.supportedExtensions.every(
        (extension, index) => extension === DEFAULT_SOURCE_EXTENSIONS[index],
      ),
    "source-list supportedExtensions do not match the exact default command",
  );
  invariant(Array.isArray(payload.items), "source-list items are required");
  payload.items.forEach((item, index) => {
    validateItem(item, index);
  });
  const paths = payload.items.map(({ path: itemPath }) => itemPath);
  invariant(
    unique(paths) && canonicalOrder(paths),
    "source-list items must have unique canonical paths",
  );
  invariant(
    Number.isSafeInteger(payload.totalCount) && payload.totalCount === payload.items.length,
    "source-list totalCount mismatch",
  );
  invariant(payload.returnedCount === payload.totalCount, "source-list returnedCount mismatch");
  invariant(
    payload.page === 1 && payload.totalPages === 1,
    "source-list full-list page posture mismatch",
  );
  invariant(
    payload.pageSize === Math.max(payload.totalCount, 1),
    "source-list full-list pageSize mismatch",
  );
  invariant(payload.truncated === false, "source-list full-list artifact cannot be truncated");
  invariant(
    payload.violationCount === 0 &&
      Array.isArray(payload.violations) &&
      payload.violations.length === 0,
    "source-list inventory violation fields are inconsistent",
  );
  return payload;
}

function indexKindFor(records) {
  if (records.some(({ stage }) => stage !== 0)) return "conflicted";
  const mode = records[0].mode;
  if (mode === "120000") return "symlink";
  if (mode === "160000") return "gitlink";
  if (mode.startsWith("100")) return "regular";
  return "other";
}

export function parseTrackedPathEvidence(bytes) {
  invariant(
    bytes.length === 0 || bytes.at(-1) === 0,
    "tracked-path evidence is not NUL terminated",
  );
  const decoder = new TextDecoder("utf-8", { fatal: true });
  const grouped = new Map();
  let start = 0;
  for (let index = 0; index < bytes.length; index += 1) {
    if (bytes[index] !== 0) continue;
    invariant(index > start, "tracked-path evidence contains an empty record");
    let record;
    try {
      record = decoder.decode(bytes.subarray(start, index));
    } catch {
      throw new TypeError("tracked-path evidence is not valid UTF-8");
    }
    const match = /^(\d{6}) ([0-9a-f]+) ([0-3])\t(.+)$/su.exec(record);
    invariant(match, "tracked-path evidence has a malformed stage record");
    const entry = { mode: match[1], stage: Number(match[3]), path: match[4] };
    const records = grouped.get(entry.path) ?? [];
    records.push(entry);
    grouped.set(entry.path, records);
    start = index + 1;
  }
  invariant(grouped.size <= 20000, "tracked-path evidence exceeds the source-list bound");
  return [...grouped.entries()]
    .filter(([itemPath]) =>
      DEFAULT_SOURCE_EXTENSIONS.includes(path.posix.extname(itemPath).toLowerCase()),
    )
    .map(([itemPath, records]) => ({ path: itemPath, indexKind: indexKindFor(records) }))
    .sort((left, right) => compareUtf8(left.path, right.path));
}

export function validateTrackedPaths(payload, trackedEntries) {
  invariant(
    trackedEntries.length === payload.items.length,
    "tracked-path candidate count mismatch",
  );
  for (let index = 0; index < trackedEntries.length; index += 1) {
    invariant(
      trackedEntries[index].path === payload.items[index].path &&
        trackedEntries[index].indexKind === payload.items[index].indexKind,
      `tracked-path evidence mismatch at item ${index}`,
    );
  }
}
