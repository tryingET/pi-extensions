// ---
// summary: "coordinates snapshot reads, stale-safe atomic edits, previews, and revision storage"
// read_when:
//   - "changing snapshot service limits, mutation safety, or read and edit responses"
// ---
import { digestBytes, SnapshotStore } from "./snapshot-store.js";
import {
  applyTextEdits,
  atomicReplace,
  decodeTextBytes,
  loadTextFile,
  readFileState,
  resolveTextFile,
} from "./text-file.js";

const DEFAULT_MAX_LINES = 2000;
const DEFAULT_MAX_BYTES = 50 * 1024;
const EDIT_PREVIEW_MAX_BYTES = 8 * 1024;

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
  constructor({ store = new SnapshotStore(), mutationQueue } = {}) {
    this.store = store;
    this.mutationQueue = mutationQueue ?? (async (_path, operation) => operation());
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
        lineCount: snapshot.lines.length,
        offset,
        returnedLines: rendered.returnedLines,
        truncated: rendered.truncated,
      },
    };
  }

  async edit({ path, base, edits }, cwd, signal) {
    if (typeof path !== "string" || path.length === 0) throw new Error("path is required");
    if (typeof base !== "string" || base.length === 0) throw new Error("base revision is required");
    const snapshot = this.store.get(base);
    if (!snapshot)
      throw new Error(`Unknown or expired revision '${base}'; call snapshot_read again`);

    const target = await resolveTextFile(path, cwd);
    if (target.canonicalPath !== snapshot.path) {
      throw new Error(`Revision '${base}' belongs to a different file`);
    }
    if (
      target.identity.dev !== snapshot.identity.dev ||
      target.identity.ino !== snapshot.identity.ino
    ) {
      throw new Error(`Revision '${base}' refers to a file identity that has been replaced`);
    }

    return this.mutationQueue(target.canonicalPath, async () => {
      if (signal?.aborted) throw new Error("snapshot_edit cancelled before mutation");
      const current = await readFileState(target.canonicalPath);
      if (
        current.fileStat.dev !== snapshot.identity.dev ||
        current.fileStat.ino !== snapshot.identity.ino
      ) {
        throw new Error(`Revision '${base}' refers to a file identity that has been replaced`);
      }
      const currentDigest = digestBytes(current.bytes);
      if (currentDigest !== snapshot.digest) {
        throw new Error(
          `Stale revision '${base}': the file changed after snapshot_read; reread before retrying`,
        );
      }

      const desiredBytes = applyTextEdits(snapshot, edits);
      this.store.assertWithinByteBudget(desiredBytes);
      const committed = decodeTextBytes(desiredBytes, target.canonicalPath);
      if (signal?.aborted) throw new Error("snapshot_edit cancelled before commit");
      const commit = await atomicReplace(
        target.canonicalPath,
        desiredBytes,
        snapshot.digest,
        snapshot.identity,
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

      const preview = renderEditPreview(next);
      return {
        text: `Applied ${edits.length} snapshot edit(s). New revision: ${next.alias}\n\n${preview}`,
        details: {
          baseRevision: base,
          revision: next.alias,
          digest: next.digest,
          editsApplied: edits.length,
          lineCount: next.lines.length,
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

function renderEditPreview(snapshot) {
  try {
    return renderRead(snapshot, 1, Math.min(snapshot.lines.length || 1, 12), EDIT_PREVIEW_MAX_BYTES)
      .text;
  } catch {
    return `[Edit preview omitted: content does not fit the ${EDIT_PREVIEW_MAX_BYTES}-byte preview cap.]`;
  }
}
