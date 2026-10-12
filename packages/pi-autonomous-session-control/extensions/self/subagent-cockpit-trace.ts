import { lstatSync } from "node:fs";
import { join, resolve } from "node:path";
import type { CockpitEvent } from "./subagent-cockpit-channel.ts";
import { inertText, readBoundedFile, safeDirectory } from "./subagent-cockpit-io.ts";

export const GUIDANCE_CUSTOM_TYPE = "asc.subagent-guidance.v1";
export interface TraceEntry {
  type: string;
  id: string;
  parentId: string | null;
  timestamp: string;
  message?: { role?: string; content?: unknown; toolName?: string };
  customType?: string;
  content?: unknown;
  details?: { requestId?: string; dispatchId?: string; attemptId?: string };
}

export function textContent(content: unknown, limit = 2048): string {
  if (typeof content === "string") return inertText(content, limit);
  if (!Array.isArray(content)) return "";
  return inertText(
    content
      .slice(0, 32)
      .filter((block) => block && typeof block === "object" && block.type === "text")
      .map((block) => inertText(block.text, limit))
      .join("\n"),
    limit,
  );
}

// A bounded full-file walk is deliberate: a tail cannot prove active ancestry.
// Oversized/malformed ancestry returns unavailable rather than leaking an old branch.
export function readActiveTrace(
  sessionsDir: string,
  sessionName: string,
  recordedFile?: string,
): TraceEntry[] | undefined {
  const expected = join(resolve(sessionsDir), `${sessionName}.jsonl`);
  if (recordedFile && resolve(sessionsDir, recordedFile) !== expected) return undefined;
  try {
    const raw = readBoundedFile(expected, 2 * 1024 * 1024);
    const lines = raw.split("\n");
    if (lines.length > 10000) return undefined;
    const entries = new Map<string, TraceEntry>();
    let leaf: string | undefined;
    for (let i = 0; i < lines.length; i++) {
      if (!lines[i].trim()) continue;
      // An in-progress append is not yet a committed entry.
      if (i === lines.length - 1 && !raw.endsWith("\n")) break;
      if (Buffer.byteLength(lines[i]) > 256 * 1024) return undefined;
      const entry = JSON.parse(lines[i]) as TraceEntry;
      if (entry.type === "session") continue;
      if (
        typeof entry.id !== "string" ||
        entry.id.length > 120 ||
        entries.has(entry.id) ||
        !(entry.parentId === null || typeof entry.parentId === "string") ||
        typeof entry.timestamp !== "string"
      )
        return undefined;
      entries.set(entry.id, entry);
      leaf = entry.id;
    }
    const branch: TraceEntry[] = [];
    const visited = new Set<string>();
    while (leaf) {
      const entry = entries.get(leaf);
      if (!entry || visited.has(leaf)) return undefined;
      visited.add(leaf);
      branch.push(entry);
      leaf = entry.parentId ?? undefined;
    }
    return branch.reverse();
  } catch {
    return undefined;
  }
}

const proofCache = new Map<string, { signature: string; entries: TraceEntry[] | undefined }>();

// Native snapshots need only pending delivery proofs, not full conversation
// parsing on every poll. Cache only bounded marker records, invalidate on inode,
// byte size, mtime or ctime change; never reuse proofs across an unsafe path.
export function readGuidanceProof(
  sessionsDir: string,
  sessionName: string,
  sessionFile?: string,
): TraceEntry[] | undefined {
  const root = resolve(sessionsDir);
  const path = join(root, `${sessionName}.jsonl`);
  if (sessionFile && resolve(root, sessionFile) !== path) return undefined;
  try {
    safeDirectory(root);
    const stat = lstatSync(path, { bigint: true });
    if (
      !stat.isFile() ||
      stat.isSymbolicLink() ||
      stat.nlink !== 1n ||
      stat.size > 2n * 1024n * 1024n
    )
      return undefined;
    const signature = `${stat.dev}:${stat.ino}:${stat.size}:${stat.mtimeNs}:${stat.ctimeNs}`;
    const cached = proofCache.get(path);
    if (cached?.signature === signature) return cached.entries;
    const entries = readActiveTrace(root, sessionName, sessionFile)
      ?.filter(
        (entry) => entry.type === "custom_message" && entry.customType === GUIDANCE_CUSTOM_TYPE,
      )
      .slice(-32)
      .map((entry) => ({
        type: entry.type,
        id: entry.id,
        parentId: entry.parentId,
        timestamp: inertText(entry.timestamp, 80),
        customType: entry.customType,
        details: Object.fromEntries(
          Object.entries(entry.details ?? {}).filter(
            ([key, value]) =>
              ["requestId", "dispatchId", "attemptId"].includes(key) &&
              typeof value === "string" &&
              value.length <= 120,
          ),
        ),
      }));
    if (proofCache.size >= 16) {
      const oldest = proofCache.keys().next().value;
      if (oldest !== undefined) proofCache.delete(oldest);
    }
    proofCache.set(path, { signature, entries });
    return entries;
  } catch {
    proofCache.delete(path);
    return undefined;
  }
}

export function traceEvents(branch: TraceEntry[]): CockpitEvent[] {
  return branch
    .filter((entry) => entry.type === "message" || entry.type === "custom_message")
    .filter(
      (entry) =>
        entry.type === "custom_message" ||
        ["user", "assistant", "toolResult"].includes(entry.message?.role ?? ""),
    )
    .slice(-80)
    .map((entry) => ({
      id: inertText(entry.id, 120),
      timestamp: inertText(entry.timestamp, 80),
      kind: entry.type === "custom_message" ? "guidance" : inertText(entry.message?.role, 80),
      text: textContent(entry.type === "custom_message" ? entry.content : entry.message?.content),
      ...(entry.message?.toolName ? { toolName: inertText(entry.message.toolName, 120) } : {}),
    }));
}
