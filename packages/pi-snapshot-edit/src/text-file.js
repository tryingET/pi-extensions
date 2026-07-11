import { randomBytes } from "node:crypto";
import { chmod, lstat, open, readFile, realpath, rename, rm, stat } from "node:fs/promises";
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

export async function loadTextFile(canonicalPath) {
  return decodeTextBytes(await readFile(canonicalPath), canonicalPath);
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

  if (/\r(?!\n)/u.test(text)) {
    throw new Error(`Bare-CR line endings are not supported: ${label}`);
  }
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
  const crlf = text.indexOf("\r\n");
  const lf = text.indexOf("\n");
  if (crlf !== -1 && crlf === lf - 1) return "\r\n";
  return "\n";
}

function normalizeReplacement(text, eol) {
  return text.replace(/\r\n|\r|\n/g, eol);
}

export function applyLineEdits(base, edits) {
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
  const op = edit.op;
  const startLine = edit.startLine;
  const newText = edit.newText;
  if (op !== "replace" && op !== "insert_after") {
    throw new Error(`edits[${index}].op must be replace or insert_after`);
  }
  if (!Number.isInteger(startLine)) throw new Error(`edits[${index}].startLine must be an integer`);
  if (typeof newText !== "string") throw new Error(`edits[${index}].newText must be a string`);

  if (op === "insert_after") {
    if (startLine < 0 || startLine > base.lines.length) {
      throw new Error(`edits[${index}].startLine is outside 0..${base.lines.length}`);
    }
    const startOffset = startLine === 0 ? 0 : base.lines[startLine - 1].end;
    let replacement = normalizeReplacement(newText, base.preferredEol);
    if (replacement.length === 0) throw new Error(`edits[${index}] inserts no text`);
    if (
      startLine === base.lines.length &&
      startOffset === base.text.length &&
      base.text.length > 0
    ) {
      const priorLine = base.lines.at(-1);
      if (priorLine && priorLine.end === priorLine.contentEnd)
        replacement = `${base.preferredEol}${replacement}`;
    }
    if (startLine < base.lines.length && !replacement.endsWith(base.preferredEol)) {
      replacement += base.preferredEol;
    }
    return {
      index,
      op,
      startLine,
      endLine: startLine,
      startOffset,
      endOffset: startOffset,
      replacement,
    };
  }

  const endLine = edit.endLine;
  if (!Number.isInteger(endLine)) throw new Error(`edits[${index}].endLine must be an integer`);
  if (startLine < 1 || endLine < startLine || endLine > base.lines.length) {
    throw new Error(`edits[${index}] range must be within 1..${base.lines.length}`);
  }
  const first = base.lines[startLine - 1];
  const last = base.lines[endLine - 1];
  let replacement = normalizeReplacement(newText, base.preferredEol);
  const replacedHadEol = last.end > last.contentEnd;
  if (replacement.length > 0 && replacedHadEol && !replacement.endsWith(base.preferredEol)) {
    replacement += base.preferredEol;
  }
  return {
    index,
    op,
    startLine,
    endLine,
    startOffset: first.start,
    endOffset: last.end,
    replacement,
  };
}

function validateDisjoint(edits) {
  const ascending = [...edits].sort(
    (left, right) => left.startOffset - right.startOffset || left.endOffset - right.endOffset,
  );
  for (let index = 1; index < ascending.length; index += 1) {
    const previous = ascending[index - 1];
    const current = ascending[index];
    const overlappingRanges = previous.endOffset > current.startOffset;
    const sameInsertionPoint =
      previous.startOffset === previous.endOffset &&
      current.startOffset === current.endOffset &&
      previous.startOffset === current.startOffset;
    const insertionOnBoundary =
      previous.startOffset === previous.endOffset
        ? previous.startOffset >= current.startOffset && previous.startOffset <= current.endOffset
        : current.startOffset === current.endOffset &&
          current.startOffset >= previous.startOffset &&
          current.startOffset <= previous.endOffset;
    if (overlappingRanges || sameInsertionPoint || insertionOnBoundary) {
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
  const before = await readFile(canonicalPath);
  const fileStat = await stat(canonicalPath);
  validateCommitIdentity(fileStat, expectedIdentity);
  if (digestBytes(before) !== expectedDigest) {
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

    const finalCheck = await readFile(canonicalPath);
    const finalStat = await stat(canonicalPath);
    validateCommitIdentity(finalStat, expectedIdentity);
    if (digestBytes(finalCheck) !== expectedDigest) {
      throw new Error("File changed immediately before commit; no snapshot edit was written");
    }
    if (signal?.aborted) throw new Error("snapshot_edit cancelled before atomic commit");
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
