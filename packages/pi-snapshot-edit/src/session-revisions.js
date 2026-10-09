// summary: "reads the revisions a session issued (alias, canonical path, digest) back from its read and edit results"
// read_when:
//   - "changing how a host recognizes a session's earlier revisions after a reload or resume"

import { realpathSync } from "node:fs";
import { resolve } from "node:path";

const SNAPSHOT_TOOL_NAMES = new Set(["read", "snapshot_read", "edit", "snapshot_edit"]);

/**
 * The revisions a transcript's successful snapshot reads and edits issued, from pi-ai messages in
 * order (assistant tool calls and their tool results). Results whose details predate the
 * canonical path resolve the call's path against `cwd`; unresolvable ones are skipped. Restore
 * them with SnapshotEditService#restoreRevisions: each rehydrates only while its file still holds
 * exactly its bytes.
 */
export function revisionsFromMessages(messages, cwd) {
  const requested = new Map();
  const records = [];
  for (const message of messages) {
    if (!message || typeof message !== "object") continue;
    if (message.role === "assistant" && Array.isArray(message.content)) {
      for (const part of message.content) {
        if (
          part?.type === "toolCall" &&
          typeof part.id === "string" &&
          SNAPSHOT_TOOL_NAMES.has(part.name) &&
          typeof part.arguments?.path === "string"
        ) {
          requested.set(part.id, part.arguments.path);
        }
      }
      continue;
    }
    if (message.role !== "toolResult" || message.isError === true) continue;
    if (!SNAPSHOT_TOOL_NAMES.has(message.toolName)) continue;
    const { revision, digest, path } = message.details ?? {};
    if (typeof revision !== "string" || typeof digest !== "string") continue;
    let canonical = typeof path === "string" ? path : undefined;
    if (!canonical) {
      const asked = requested.get(message.toolCallId);
      if (typeof asked !== "string") continue;
      try {
        canonical = realpathSync(resolve(cwd, asked.replace(/^@/, "")));
      } catch {
        continue;
      }
    }
    records.push({ alias: revision, path: canonical, digest });
  }
  return records;
}

/** The same, from Pi session entries ({ type: "message", message }) as sessionManager returns them. */
export function revisionsFromEntries(entries, cwd) {
  return revisionsFromMessages(
    entries.flatMap((entry) => (entry?.type === "message" && entry.message ? [entry.message] : [])),
    cwd,
  );
}
