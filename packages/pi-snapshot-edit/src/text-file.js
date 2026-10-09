/**
summary: "Validates UTF-8 text snapshots, resolves exact selectors, and atomically replaces unchanged regular files."
read_when:
  - "Changing file identity checks, BOM or line-ending handling, selector transactions, or atomic commit safeguards."
*/
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
  return planTextEdits(base, edits).bytes;
}

/**
 * Resolve every operation against the same immutable snapshot before anything changes. Every
 * problem in the batch is reported at once, each with what the revision actually holds there
 * (match lines, near misses, conflicting edits), so one corrected retry can succeed. Nothing
 * inexact is ever applied. Returns the desired bytes and the resolved changes in base offsets.
 */
export function planTextEdits(base, edits) {
  if (!Array.isArray(edits) || edits.length === 0) {
    throw new Error("edits must contain at least one operation");
  }
  const problems = [];
  const resolved = [];
  edits.forEach((edit, index) => {
    try {
      resolved.push(resolveEdit(base, edit, index));
    } catch (error) {
      problems.push(error instanceof Error ? error.message : String(error));
    }
  });
  problems.push(...disjointProblems(base, resolved));
  if (problems.length === 1) throw new Error(problems[0]);
  if (problems.length > 1) {
    throw new Error(
      `${problems.length} problems in ${edits.length} edit(s) against this revision; fix all of them and retry:\n${problems.map((problem) => `- ${problem}`).join("\n")}`,
    );
  }
  const ascending = [...resolved].sort(
    (left, right) => left.startOffset - right.startOffset || left.endOffset - right.endOffset,
  );
  let text = "";
  let cursor = 0;
  for (const edit of ascending) {
    text += base.text.slice(cursor, edit.startOffset) + edit.replacement;
    cursor = edit.endOffset;
  }
  text += base.text.slice(cursor);
  if (text === base.text) throw new Error("Edit would make no changes");
  const payload = Buffer.from(text, "utf8");
  return {
    bytes: base.hasBom ? Buffer.concat([UTF8_BOM, payload]) : payload,
    text,
    changes: ascending.map(({ index, startOffset, endOffset, replacement }) => ({
      index,
      startOffset,
      endOffset,
      replacement,
    })),
  };
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
  const occurrence = resolveOccurrence(
    base,
    edit.occurrence,
    starts,
    index,
    selectorKey,
    normalizedSelector,
  );
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

function resolveOccurrence(base, value, starts, index, selectorKey, selector) {
  const matchCount = starts.length;
  if (matchCount === 0) {
    throw new Error(
      `edits[${index}].${selectorKey} has no exact match in the base revision; ${nearMiss(base, selector)}`,
    );
  }
  if (value === undefined) {
    if (matchCount === 1) return 1;
    throw new Error(
      `edits[${index}].${selectorKey} matches ${matchCount} occurrences; occurrence is required and 1-indexed. ${listMatches(base, starts)}`,
    );
  }
  if (!Number.isInteger(value) || value < 1) {
    throw new Error(`edits[${index}].occurrence must be a positive 1-indexed integer`);
  }
  if (value > matchCount) {
    throw new Error(
      `edits[${index}].occurrence ${value} is out of range for ${matchCount} match(es). ${listMatches(base, starts)}`,
    );
  }
  return value;
}

const LISTED_MATCHES = 8;
const EXCERPT_CHARS = 96;

/** 1-indexed line of a text offset, by binary search over the snapshot's line index. */
function lineOf(base, offset) {
  const lines = base.lines;
  let low = 0;
  let high = lines.length - 1;
  while (low < high) {
    const middle = (low + high + 1) >> 1;
    if (lines[middle].start <= offset) low = middle;
    else high = middle - 1;
  }
  return low + 1;
}

function excerpt(text) {
  const flat = text.length > EXCERPT_CHARS ? `${text.slice(0, EXCERPT_CHARS)}…` : text;
  return JSON.stringify(flat);
}

function listMatches(base, starts) {
  const shown = starts.slice(0, LISTED_MATCHES).map((start, position) => {
    const line = lineOf(base, start);
    return `#${position + 1} line ${line}: ${excerpt(base.lines[line - 1]?.text ?? "")}`;
  });
  const more = starts.length > LISTED_MATCHES ? `; and ${starts.length - LISTED_MATCHES} more` : "";
  return `Matches: ${shown.join("; ")}${more}.`;
}

const squash = (line) => line.replace(/\s+/gu, " ").trim();

/**
 * Why a selector has no exact match, from the revision's own text: a whitespace-only difference,
 * or the selector line where the closest candidate diverges. Diagnosis only; nothing is applied.
 */
function nearMiss(base, selector) {
  const wanted = selector.split(base.preferredEol);
  const lines = base.lines.map((line) => line.text);
  if (wanted.length === 0 || lines.length === 0) return "reread the file before retrying";
  const wantedSquashed = wanted.map(squash);
  for (let start = 0; start + wanted.length <= lines.length; start += 1) {
    if (sameIgnoringWhitespace(lines, start, wantedSquashed)) {
      const held = lines.slice(start, start + wanted.length).join("\n");
      return `it matches at line ${start + 1} if whitespace is ignored; the revision has ${excerpt(held)}`;
    }
  }
  let best;
  for (let start = 0; start < lines.length; start += 1) {
    if (
      !lines[start].includes(wanted[0]) &&
      !(wanted.length > 1 && lines[start].endsWith(wanted[0]))
    )
      continue;
    let agreed = 1;
    while (
      agreed < wanted.length &&
      start + agreed < lines.length &&
      (agreed === wanted.length - 1
        ? lines[start + agreed].startsWith(wanted[agreed])
        : lines[start + agreed] === wanted[agreed])
    ) {
      agreed += 1;
    }
    if (!best || agreed > best.agreed) best = { start, agreed };
  }
  if (best && wanted.length > 1 && best.agreed < wanted.length) {
    const differing = best.start + best.agreed;
    const held = differing < lines.length ? excerpt(lines[differing]) : "the end of the file";
    return `its first line occurs at line ${best.start + 1}, but its line ${best.agreed + 1} differs: the revision has ${held} where it has ${excerpt(wanted[best.agreed])}`;
  }
  if (wanted.length === 1) {
    const prefix = longestPresentPrefix(base.text, wanted[0]);
    if (prefix.length >= Math.min(8, wanted[0].length - 1) && prefix.length > 0) {
      const at = base.text.indexOf(prefix);
      const line = lineOf(base, at);
      return `its first ${prefix.length} of ${wanted[0].length} characters occur at line ${line}, where the revision continues ${excerpt(base.lines[line - 1]?.text ?? "")}`;
    }
  }
  return "none of its lines occur in the revision; reread the file before retrying";
}

function sameIgnoringWhitespace(lines, start, wantedSquashed) {
  const last = wantedSquashed.length - 1;
  for (let offset = 0; offset <= last; offset += 1) {
    const held = squash(lines[start + offset]);
    const wanted = wantedSquashed[offset];
    if (last === 0) {
      if (wanted.length === 0 || !held.includes(wanted)) return false;
    } else if (offset === 0) {
      if (!held.endsWith(wanted)) return false;
    } else if (offset === last) {
      if (!held.startsWith(wanted)) return false;
    } else if (held !== wanted) return false;
  }
  return true;
}

function longestPresentPrefix(text, wanted) {
  let low = 0;
  let high = wanted.length;
  while (low < high) {
    const middle = (low + high + 1) >> 1;
    if (text.includes(wanted.slice(0, middle))) low = middle;
    else high = middle - 1;
  }
  return wanted.slice(0, low);
}

/** Every pair of resolved operations that would touch the same bytes or insertion point. */
function disjointProblems(base, edits) {
  const problems = [];
  const ascending = [...edits].sort(
    (left, right) => left.startOffset - right.startOffset || left.endOffset - right.endOffset,
  );
  for (let left = 0; left < ascending.length; left += 1) {
    for (let right = left + 1; right < ascending.length; right += 1) {
      const previous = ascending[left];
      const current = ascending[right];
      if (current.startOffset > previous.endOffset) break;
      const kind = conflict(previous, current);
      if (!kind) continue;
      const [first, second] =
        previous.index < current.index ? [previous, current] : [current, previous];
      problems.push(
        `edits[${first.index}] (line ${lineOf(base, first.startOffset)}) and edits[${second.index}] (line ${lineOf(base, second.startOffset)}) overlap: ${kind}; combine them into one replace or choose disjoint selectors`,
      );
    }
  }
  return problems;
}

function conflict(previous, current) {
  const previousInserts = previous.startOffset === previous.endOffset;
  const currentInserts = current.startOffset === current.endOffset;
  if (previousInserts && currentInserts) {
    return previous.startOffset === current.startOffset ? "two insertions at one point" : undefined;
  }
  if (previousInserts) {
    return previous.startOffset >= current.startOffset && previous.startOffset <= current.endOffset
      ? "an insertion on a replacement boundary or interior"
      : undefined;
  }
  if (currentInserts) {
    return current.startOffset >= previous.startOffset && current.startOffset <= previous.endOffset
      ? "an insertion on a replacement boundary or interior"
      : undefined;
  }
  return previous.endOffset > current.startOffset ? "overlapping replacements" : undefined;
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
