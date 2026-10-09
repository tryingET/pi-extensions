// ---
// summary: "coordinates snapshot reads, content-addressed stale-safe atomic edits, change-local previews, and revision storage"
// read_when:
//   - "changing snapshot service limits, mutation safety, or read and edit responses"
//   - "changing when a revision is valid (its bytes) or how forgotten aliases rehydrate"
// ---

import { normalizeRevisionAlias } from "./edit-arguments.js";
import { digestBytes, SnapshotStore } from "./snapshot-store.js";

export { normalizeEditArguments, normalizeRevisionAlias } from "./edit-arguments.js";
export { revisionsFromEntries, revisionsFromMessages } from "./session-revisions.js";

import {
  atomicReplace,
  decodeTextBytes,
  loadTextFile,
  planTextEdits,
  readFileState,
  resolveTextFile,
} from "./text-file.js";

const DEFAULT_MAX_LINES = 2000;
const DEFAULT_MAX_BYTES = 50 * 1024;
const EDIT_PREVIEW_MAX_BYTES = 8 * 1024;
const PREVIEW_CONTEXT_LINES = 2;

export class SnapshotEditService {
  /**
   * @param {{
   *   store?: SnapshotStore,
   *   mutationQueue?: (
   *     path: string,
   *     operation: () => Promise<{text: string, details: Record<string, unknown>}>
   *   ) => Promise<{text: string, details: Record<string, unknown>}>
   * }} [options]
   */
  constructor({ store, mutationQueue, onRevision } = {}) {
    this.store = store ?? new SnapshotStore({ onRevision });
    this.mutationQueue = mutationQueue ?? (async (_path, operation) => operation());
  }

  /**
   * Recognize revisions an earlier process issued (alias, canonical path, digest), for example
   * from a session's earlier read and edit results. They rehydrate from the file when it still
   * holds exactly those bytes.
   */
  restoreRevisions(records) {
    this.store.restore(records);
  }

  async read({ path, offset = 1, limit = DEFAULT_MAX_LINES }, cwd) {
    if (typeof path !== "string" || path.length === 0) throw new Error("path is required");
    if (!Number.isInteger(offset) || offset < 1)
      throw new Error("offset must be a positive integer");
    if (!Number.isInteger(limit) || limit < 1) throw new Error("limit must be a positive integer");

    const target = await resolveTextFile(path, cwd);
    const loaded = await loadTextFile(target.canonicalPath);
    const snapshot = this.store.add({
      path: target.canonicalPath,
      bytes: loaded.bytes,
      text: loaded.text,
      hasBom: loaded.hasBom,
      lines: loaded.lines,
      preferredEol: loaded.preferredEol,
      mode: target.fileStat.mode,
      identity: target.identity,
    });
    const rendered = renderRead(snapshot, offset, Math.min(limit, DEFAULT_MAX_LINES));
    return {
      text: rendered.text,
      details: {
        revision: snapshot.alias,
        digest: snapshot.digest,
        path: snapshot.path,
        lineCount: snapshot.lines.length,
        offset,
        returnedLines: rendered.returnedLines,
        truncated: rendered.truncated,
      },
    };
  }

  /**
   * A revision is valid exactly while its file holds the bytes it names. A revision this store
   * no longer holds (evicted, or issued before a reload and restored) rehydrates from the file
   * when the file still has its digest; a file replaced by identical bytes is the same revision.
   * Changed bytes are stale, and the message names the revision the file holds now, if any.
   */
  async edit({ path, base, edits }, cwd, signal) {
    if (typeof path !== "string" || path.length === 0) throw new Error("path is required");
    if (typeof base !== "string" || base.length === 0) throw new Error("base revision is required");
    const normalizedBase = normalizeRevisionAlias(base);
    const record = this.store.get(normalizedBase) ?? this.store.lookup(normalizedBase);
    if (!record) {
      // The alias decides first; the file only adds a hint when it resolves.
      const canonical = await resolveTextFile(path, cwd).then(
        (resolved) => resolved.canonicalPath,
        () => undefined,
      );
      throw new Error(unknownRevisionMessage(base, normalizedBase, this.store, canonical));
    }
    const target = await resolveTextFile(path, cwd);
    if (target.canonicalPath !== record.path) {
      throw new Error(
        differentFileMessage(normalizedBase, record.path, target.canonicalPath, this.store),
      );
    }

    return this.mutationQueue(target.canonicalPath, async () => {
      if (signal?.aborted) throw new Error("snapshot_edit cancelled before mutation");
      const current = await readFileState(target.canonicalPath);
      if (!current.fileStat.isFile())
        throw new Error("Mutation target is no longer a regular file");
      if (current.fileStat.nlink > 1) {
        throw new Error(`Refusing atomic replacement of hard-linked file: ${path}`);
      }
      const currentDigest = digestBytes(current.bytes);
      if (currentDigest !== record.digest) {
        throw new Error(staleMessage(normalizedBase, record.path, currentDigest, this.store));
      }
      // The file holds exactly the revision's bytes, so they are the snapshot, whichever inode
      // or process read them first.
      const identity = { dev: current.fileStat.dev, ino: current.fileStat.ino };
      let snapshot = this.store.get(normalizedBase);
      if (!snapshot) {
        const decoded = decodeTextBytes(current.bytes, target.canonicalPath);
        snapshot = this.store.rehydrate(normalizedBase, {
          path: target.canonicalPath,
          bytes: decoded.bytes,
          text: decoded.text,
          hasBom: decoded.hasBom,
          lines: decoded.lines,
          preferredEol: decoded.preferredEol,
          mode: current.fileStat.mode,
          identity,
        });
      }

      const plan = planTextEdits(snapshot, edits);
      this.store.assertWithinByteBudget(plan.bytes);
      const committed = decodeTextBytes(plan.bytes, target.canonicalPath);
      if (signal?.aborted) throw new Error("snapshot_edit cancelled before commit");
      const commit = await atomicReplace(
        target.canonicalPath,
        plan.bytes,
        record.digest,
        identity,
        digestBytes,
        signal,
      );
      const next = this.store.add({
        path: target.canonicalPath,
        bytes: committed.bytes,
        text: committed.text,
        hasBom: committed.hasBom,
        lines: committed.lines,
        preferredEol: committed.preferredEol,
        mode: commit.mode,
        identity: commit.identity,
      });

      const regions = changedRegions(next, plan.changes);
      const preview = renderChangePreview(next, regions);
      return {
        text: `Applied ${edits.length} snapshot edit(s). New revision: ${next.alias}\n\n${preview}`,
        details: {
          baseRevision: normalizedBase,
          revision: next.alias,
          digest: next.digest,
          path: next.path,
          editsApplied: edits.length,
          lineCount: next.lines.length,
          changedLines: regions.map(({ first, last }) => [first, last]),
        },
      };
    });
  }

  clear() {
    this.store.clear();
  }

  stats() {
    return this.store.stats();
  }
}

function newestOf(store, path, except) {
  return store.revisionsOf(path, 8).find((record) => record.alias !== except);
}

function unknownRevisionMessage(rawBase, alias, store, path) {
  const recent = store.recentAliases();
  const prefixNote =
    rawBase !== alias
      ? " Pass the bare alias word (for example base: 'amber') without the 'revision:' header prefix."
      : "";
  const heldNote =
    recent.length > 0
      ? ` This session still holds revision(s): ${recent.join(", ")}.`
      : " The session revision store is empty.";
  const newest = newestOf(store, path, alias);
  const fileNote = newest ? ` The newest revision of this file is '${newest.alias}'.` : "";
  return `Unknown or expired revision '${alias}'.${heldNote}${fileNote}${prefixNote} Aliases are session-scoped; call snapshot_read again and copy the alias from its 'revision:<alias>' header.`;
}

function differentFileMessage(alias, ownerPath, targetPath, store) {
  const newest = newestOf(store, targetPath, alias);
  const hint = newest
    ? ` The newest revision of ${targetPath} in this session is '${newest.alias}'.`
    : ` Read ${targetPath} first and use its revision.`;
  return `Revision '${alias}' belongs to a different file (${ownerPath}), not ${targetPath}.${hint}`;
}

function staleMessage(alias, path, currentDigest, store) {
  const holds = store
    .revisionsOf(path, 64)
    .find((record) => record.digest === currentDigest && record.alias !== alias);
  const hint = holds
    ? ` The file now holds exactly revision '${holds.alias}' (for example your own later edit); retry with base '${holds.alias}' after checking your selectors against it.`
    : " Reread before retrying.";
  return `Stale revision '${alias}': the file changed after this revision was read.${hint}`;
}

/** Changed regions of a committed revision, as 1-indexed line ranges, from base-offset changes. */
function changedRegions(next, changes) {
  let delta = 0;
  return changes.map((change) => {
    const start = change.startOffset + delta;
    const end = start + change.replacement.length;
    delta += change.replacement.length - (change.endOffset - change.startOffset);
    const first = lineAt(next, start);
    const last = end > start ? lineAt(next, end - 1) : first;
    return { index: change.index, first, last };
  });
}

function lineAt(snapshot, offset) {
  const lines = snapshot.lines;
  if (lines.length === 0) return 1;
  let low = 0;
  let high = lines.length - 1;
  while (low < high) {
    const middle = (low + high + 1) >> 1;
    if (lines[middle].start <= offset) low = middle;
    else high = middle - 1;
  }
  return low + 1;
}

/** The leading whole lines of an oversized first hunk that fit the cap, with where it continues. */
function partialHunk(snapshot, hunk) {
  const note = (last) =>
    `[the changed region continues to line ${hunk.last}; read the file to see lines ${last + 1}-${hunk.last}]`;
  let last = hunk.first - 1;
  let body = "";
  while (last < hunk.last) {
    const line = snapshot.lines[last];
    const candidate = body + snapshot.text.slice(line.start, line.end);
    const framed = `@@ lines ${hunk.first}-${last + 1} @@\n${candidate}${candidate.endsWith("\n") ? "" : "\n"}${note(last + 1)}`;
    if (Buffer.byteLength(framed, "utf8") > EDIT_PREVIEW_MAX_BYTES) break;
    body = candidate;
    last += 1;
  }
  if (last < hunk.first) return "";
  return `@@ lines ${hunk.first}-${last} @@\n${body}${body.endsWith("\n") ? "" : "\n"}${note(last)}`;
}

/**
 * The changed regions with a little context, as raw text without gutters under one "@@ lines" header
 * per hunk, bounded like any preview. What a model needs to confirm the edit and select from next.
 */
function renderChangePreview(snapshot, regions) {
  if (snapshot.lines.length === 0) return "[The file is now empty.]";
  const hunks = [];
  for (const region of [...regions].sort((left, right) => left.first - right.first)) {
    const first = Math.max(1, region.first - PREVIEW_CONTEXT_LINES);
    const last = Math.min(snapshot.lines.length, region.last + PREVIEW_CONTEXT_LINES);
    const previous = hunks.at(-1);
    if (previous && first <= previous.last) previous.last = Math.max(previous.last, last);
    else hunks.push({ first, last });
  }
  // Bodies are the revision's exact bytes; a separator newline is added only after a body that
  // ends without one (the file's last line), so selectors copied from a hunk stay exact.
  let text = "";
  let shown = 0;
  for (const hunk of hunks) {
    const body = snapshot.text.slice(
      snapshot.lines[hunk.first - 1].start,
      snapshot.lines[hunk.last - 1].end,
    );
    const separator = text.length > 0 && !text.endsWith("\n") ? "\n" : "";
    const block = `${separator}@@ lines ${hunk.first}-${hunk.last} @@\n${body}`;
    if (Buffer.byteLength(text + block, "utf8") > EDIT_PREVIEW_MAX_BYTES) {
      if (shown === 0) text = partialHunk(snapshot, hunk);
      if (text.length > 0 && shown === 0) shown = 1;
      break;
    }
    text += block;
    shown += 1;
  }
  if (shown === 0) {
    return `[Edit preview omitted: content does not fit the ${EDIT_PREVIEW_MAX_BYTES}-byte preview cap.]`;
  }
  if (shown < hunks.length) {
    const separator = text.endsWith("\n") ? "" : "\n";
    text += `${separator}[${hunks.length - shown} more changed region(s) omitted from the ${EDIT_PREVIEW_MAX_BYTES}-byte preview; read the file to see them.]`;
  }
  return text;
}

function truncationSuffix(snapshot, body, start, returnedLines) {
  const separator = body.length > 0 && !body.endsWith("\n") ? "\n" : "";
  return `${separator}[Snapshot read truncated after ${returnedLines} line(s); continue with offset ${start + returnedLines + 1}. Revision ${snapshot.alias} remains bound to the full file.]`;
}

function renderRead(snapshot, offset, limit, maxBytes = DEFAULT_MAX_BYTES) {
  const start = Math.min(offset - 1, snapshot.lines.length);
  const selected = snapshot.lines.slice(start, start + limit);
  const header = `revision:${snapshot.alias}\n`;
  if (Buffer.byteLength(header, "utf8") > maxBytes) {
    throw new Error("Revision header exceeds the snapshot_read output cap");
  }

  let body = "";
  let returnedLines = 0;
  for (const line of selected) {
    const candidateBody = body + snapshot.text.slice(line.start, line.end);
    const candidateCount = returnedLines + 1;
    const candidateTruncated = start + candidateCount < snapshot.lines.length;
    const suffix = candidateTruncated
      ? truncationSuffix(snapshot, candidateBody, start, candidateCount)
      : "";
    if (Buffer.byteLength(header + candidateBody + suffix, "utf8") > maxBytes) break;
    body = candidateBody;
    returnedLines = candidateCount;
  }

  if (selected.length > 0 && returnedLines === 0) {
    throw new Error(
      `Line ${start + 1} exceeds the snapshot_read 50KB safe-page output cap; exact raw pagination cannot split a line`,
    );
  }
  const truncated = start + returnedLines < snapshot.lines.length;
  const text =
    header + body + (truncated ? truncationSuffix(snapshot, body, start, returnedLines) : "");
  if (Buffer.byteLength(text, "utf8") > maxBytes) {
    throw new Error("snapshot_read output framing exceeds its byte cap");
  }
  return { text, returnedLines, truncated };
}
