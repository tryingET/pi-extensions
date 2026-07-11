import { randomBytes } from "node:crypto";
import { chmod, lstat, open, realpath, rename, rm, stat } from "node:fs/promises";
import { basename, dirname, resolve } from "node:path";

const UTF8_DECODER = new TextDecoder("utf-8", { fatal: true });
const UTF8_BOM = Buffer.from([0xef, 0xbb, 0xbf]);

export async function resolveTextFile(inputPath, cwd) {
  const requestedPath = resolve(cwd, inputPath.replace(/^@/, ""));
  const requestedStat = await lstat(requestedPath);
  const canonicalPath = await realpath(requestedPath);
  const fileStat = await stat(canonicalPath);
  if (!fileStat.isFile()) throw new Error(`Not a regular file: ${inputPath}`);
  if (fileStat.nlink > 1) {
    throw new Error(`Refusing atomic replacement of hard-linked file: ${inputPath}`);
  }
  return {
    canonicalPath,
    fileStat,
    requestedWasSymlink: requestedStat.isSymbolicLink(),
    identity: { dev: fileStat.dev, ino: fileStat.ino },
  };
}

export async function readFileState(canonicalPath) {
  const handle = await open(canonicalPath, "r");
  try {
    const fileStat = await handle.stat();
    const bytes = await handle.readFile();
    return { bytes, fileStat };
  } finally {
    await handle.close();
  }
}

export async function loadTextFile(canonicalPath) {
  const { bytes } = await readFileState(canonicalPath);
  return decodeTextBytes(bytes, canonicalPath);
}

export function decodeTextBytes(bytes, label = "file") {
  const hasBom = bytes.subarray(0, 3).equals(UTF8_BOM);
  const payload = hasBom ? bytes.subarray(3) : bytes;
  if (payload.includes(0)) throw new Error(`Binary file is not supported: ${label}`);

  let text;
  try {
    text = UTF8_DECODER.decode(payload);
  } catch {
    throw new Error(`File is not valid UTF-8 text: ${label}`);
  }
  if (/\r(?!\n)/u.test(text)) throw new Error(`Bare-CR line endings are not supported: ${label}`);
  if (text.includes("\r\n") && /(^|[^\r])\n/u.test(text)) {
    throw new Error(`Mixed CRLF/LF line endings are not supported: ${label}`);
  }
  return {
    bytes: Buffer.from(bytes),
    text,
    hasBom,
    lines: indexLines(text),
    preferredEol: detectPreferredEol(text),
  };
}

export function indexLines(text) {
  if (text.length === 0) return [];
  const lines = [];
  let start = 0;
  for (let index = 0; index < text.length; index += 1) {
    if (text[index] !== "\n") continue;
    const contentEnd = index > start && text[index - 1] === "\r" ? index - 1 : index;
    lines.push({ start, contentEnd, end: index + 1, text: text.slice(start, contentEnd) });
    start = index + 1;
  }
  if (start < text.length) {
    lines.push({ start, contentEnd: text.length, end: text.length, text: text.slice(start) });
  }
  return lines;
}

export function detectPreferredEol(text) {
  return text.includes("\r\n") ? "\r\n" : "\n";
}

function normalizeEol(text, eol) {
  return text.replace(/\r\n|\r|\n/g, eol);
}

/** Resolve every exact-text selector against the same immutable snapshot, then mutate. */
export function applyTextEdits(base, edits) {
  if (!Array.isArray(edits) || edits.length === 0) {
    throw new Error("edits must contain at least one operation");
  }
  const resolved = edits.map((edit, index) => resolveEdit(base, edit, index));
  validateDisjoint(resolved);
  resolved.sort(
    (left, right) => right.startOffset - left.startOffset || right.endOffset - left.endOffset,
  );

  let text = base.text;
  for (const edit of resolved) {
    text = `${text.slice(0, edit.startOffset)}${edit.replacement}${text.slice(edit.endOffset)}`;
  }
  if (text === base.text) throw new Error("Edit would make no changes");
  const payload = Buffer.from(text, "utf8");
  return base.hasBom ? Buffer.concat([UTF8_BOM, payload]) : payload;
}

function resolveEdit(base, edit, index) {
  if (!edit || typeof edit !== "object") throw new Error(`edits[${index}] must be an object`);
  if ("startLine" in edit || "endLine" in edit) {
    throw new Error(
      `edits[${index}] uses retired line coordinates; reread the file and retry with oldText or anchorText selectors`,
    );
  }
  if (edit.op !== "replace" && edit.op !== "insert_after") {
    throw new Error(`edits[${index}].op must be replace or insert_after`);
  }
  if (typeof edit.newText !== "string") throw new Error(`edits[${index}].newText must be a string`);

  const selectorKey = edit.op === "replace" ? "oldText" : "anchorText";
  const selector = edit[selectorKey];
  if (typeof selector !== "string" || selector.length === 0) {
    throw new Error(`edits[${index}].${selectorKey} must be a non-empty string`);
  }
  const normalizedSelector = normalizeEol(selector, base.preferredEol);
  const starts = exactMatchOffsets(base.text, normalizedSelector);
  const occurrence = resolveOccurrence(edit.occurrence, starts.length, index, selectorKey);
  const selectedStart = starts[occurrence - 1];
  const selectedEnd = selectedStart + normalizedSelector.length;
  const replacement = normalizeEol(edit.newText, base.preferredEol);

  if (edit.op === "replace") {
    if (replacement === normalizedSelector) throw new Error(`edits[${index}] makes no change`);
    return { index, startOffset: selectedStart, endOffset: selectedEnd, replacement };
  }
  if (replacement.length === 0) throw new Error(`edits[${index}] inserts no text`);
  return { index, startOffset: selectedEnd, endOffset: selectedEnd, replacement };
}

function exactMatchOffsets(text, selector) {
  const starts = [];
  let from = 0;
  while (from <= text.length - selector.length) {
    const found = text.indexOf(selector, from);
    if (found === -1) break;
    starts.push(found);
    from = found + 1;
  }
  return starts;
}

function resolveOccurrence(value, matchCount, index, selectorKey) {
  if (matchCount === 0) {
    throw new Error(
      `edits[${index}].${selectorKey} has no exact match in the base revision; reread before retrying`,
    );
  }
  if (value === undefined) {
    if (matchCount === 1) return 1;
    throw new Error(
      `edits[${index}].${selectorKey} matches ${matchCount} occurrences; occurrence is required and 1-indexed`,
    );
  }
  if (!Number.isInteger(value) || value < 1) {
    throw new Error(`edits[${index}].occurrence must be a positive 1-indexed integer`);
  }
  if (value > matchCount) {
    throw new Error(
      `edits[${index}].occurrence ${value} is out of range for ${matchCount} match(es)`,
    );
  }
  return value;
}

function validateDisjoint(edits) {
  const ascending = [...edits].sort(
    (left, right) => left.startOffset - right.startOffset || left.endOffset - right.endOffset,
  );
  for (let index = 1; index < ascending.length; index += 1) {
    const previous = ascending[index - 1];
    const current = ascending[index];
    const overlap = previous.endOffset > current.startOffset;
    const sameInsertion =
      previous.startOffset === previous.endOffset &&
      current.startOffset === current.endOffset &&
      previous.startOffset === current.startOffset;
    const insertionOnReplacement =
      previous.startOffset === previous.endOffset
        ? previous.startOffset >= current.startOffset && previous.startOffset <= current.endOffset
        : current.startOffset === current.endOffset &&
          current.startOffset >= previous.startOffset &&
          current.startOffset <= previous.endOffset;
    if (overlap || sameInsertion || insertionOnReplacement) {
      throw new Error(`edits[${previous.index}] and edits[${current.index}] overlap`);
    }
  }
}

export async function atomicReplace(
  canonicalPath,
  bytes,
  expectedDigest,
  expectedIdentity,
  digestBytes,
  signal,
) {
  const before = await readFileState(canonicalPath);
  const fileStat = before.fileStat;
  validateCommitIdentity(fileStat, expectedIdentity);
  if (digestBytes(before.bytes) !== expectedDigest) {
    throw new Error("File changed during mutation preparation; reread before retrying");
  }

  const tempPath = `${dirname(canonicalPath)}/.${basename(canonicalPath)}.snapshot-edit-${process.pid}-${randomBytes(6).toString("hex")}`;
  let handle;
  try {
    handle = await open(tempPath, "wx", 0o600);
    await handle.writeFile(bytes);
    await handle.sync();
    await handle.close();
    handle = undefined;
    await chmod(tempPath, fileStat.mode);
    const committedStat = await stat(tempPath);
    const finalCheck = await readFileState(canonicalPath);
    validateCommitIdentity(finalCheck.fileStat, expectedIdentity);
    if (digestBytes(finalCheck.bytes) !== expectedDigest) {
      throw new Error("File changed immediately before commit; no snapshot edit was written");
    }
    if (signal?.aborted) throw new Error("snapshot_edit cancelled before atomic commit");
    // Best-effort pre-rename detection only: a non-cooperating writer can still
    // change the directory entry after this check and before rename completes.
    await rename(tempPath, canonicalPath);
    return {
      identity: { dev: committedStat.dev, ino: committedStat.ino },
      mode: committedStat.mode,
    };
  } finally {
    if (handle) await handle.close().catch(() => {});
    await rm(tempPath, { force: true }).catch(() => {});
  }
}

function validateCommitIdentity(fileStat, expectedIdentity) {
  if (!fileStat.isFile()) throw new Error("Mutation target is no longer a regular file");
  if (fileStat.nlink > 1) throw new Error("Mutation target became hard-linked before commit");
  if (fileStat.dev !== expectedIdentity.dev || fileStat.ino !== expectedIdentity.ino) {
    throw new Error("Mutation target identity changed after snapshot_read; reread before retrying");
  }
}
