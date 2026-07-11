import { readFile } from "node:fs/promises";
import { digestBytes, SnapshotStore } from "./snapshot-store.js";
import {
  applyLineEdits,
  atomicReplace,
  decodeTextBytes,
  loadTextFile,
  resolveTextFile,
} from "./text-file.js";

const DEFAULT_MAX_LINES = 2000;
const DEFAULT_MAX_BYTES = 50 * 1024;

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
      const currentBytes = await readFile(target.canonicalPath);
      const currentDigest = digestBytes(currentBytes);
      if (currentDigest !== snapshot.digest) {
        throw new Error(
          `Stale revision '${base}': the file changed after snapshot_read; reread before retrying`,
        );
      }

      const desiredBytes = applyLineEdits(snapshot, edits);
      if (signal?.aborted) throw new Error("snapshot_edit cancelled before commit");
      const commit = await atomicReplace(
        target.canonicalPath,
        desiredBytes,
        snapshot.digest,
        snapshot.identity,
        digestBytes,
        signal,
      );
      const committed = decodeTextBytes(desiredBytes, target.canonicalPath);
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

      const minimumLine = Math.max(
        1,
        Math.min(...edits.map((edit) => Math.max(1, edit.startLine))) - 2,
      );
      const maximumLine = Math.min(
        next.lines.length,
        Math.max(...edits.map((edit) => Math.max(1, edit.endLine ?? edit.startLine))) + 3,
      );
      const previewLimit = Math.max(1, maximumLine - minimumLine + 1);
      const preview = renderRead(next, minimumLine, previewLimit);
      return {
        text: `Applied ${edits.length} snapshot edit(s). New revision: ${next.alias}\n\n${preview.text}`,
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

function renderRead(snapshot, offset, limit) {
  const start = Math.min(offset - 1, snapshot.lines.length);
  const selected = snapshot.lines.slice(start, start + limit);
  const output = [`revision:${snapshot.alias}`];
  let byteCount = Buffer.byteLength(output[0], "utf8");
  let returnedLines = 0;
  for (let index = 0; index < selected.length; index += 1) {
    const rendered = `${start + index + 1}│${selected[index].text}`;
    const renderedBytes = Buffer.byteLength(rendered, "utf8") + 1;
    if (byteCount + renderedBytes > DEFAULT_MAX_BYTES) break;
    output.push(rendered);
    byteCount += renderedBytes;
    returnedLines += 1;
  }
  const truncated = start + returnedLines < snapshot.lines.length;
  if (truncated) {
    output.push(
      `[Snapshot read truncated after ${returnedLines} line(s); continue with offset ${start + returnedLines + 1}. Revision ${snapshot.alias} remains bound to the full file.]`,
    );
  }
  return { text: output.join("\n"), returnedLines, truncated };
}
