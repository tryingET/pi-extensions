// summary: exact host identity, active-branch journal and activity frontier for closeout.
// read_when: changing reload/fork/compaction safety or concurrent-work refusal.

import { realpath } from "node:fs/promises";
import type { ExtensionContext, SessionEntry } from "@earendil-works/pi-coding-agent";
import {
  CLOSEOUT_ENTRY,
  CLOSEOUT_TOOL,
  type CloseoutState,
  digest,
  type HostIdentity,
  restoreState,
} from "./sessionCloseout.ts";
import { repoRoot } from "./sessionCloseoutReadback.ts";

export async function hostIdentity(ctx: ExtensionContext): Promise<HostIdentity> {
  const sessionId = ctx.sessionManager.getSessionId();
  const sessionFile = ctx.sessionManager.getSessionFile();
  const header = ctx.sessionManager.getHeader();
  if (!sessionId || !sessionFile || !header || header.id !== sessionId)
    throw new Error("Exact persistent caller-session identity unavailable");
  return { sessionId, sessionFile, cwd: await realpath(ctx.cwd), repo: await repoRoot(ctx.cwd) };
}
export function journalState(ctx: ExtensionContext, host: HostIdentity): CloseoutState | undefined {
  const all = ctx.sessionManager
    .getEntries()
    .filter((e) => e.type === "custom" && e.customType === CLOSEOUT_ENTRY);
  const state = restoreState(
    all.map((e) => (e.type === "custom" ? e.data : null)),
    host,
  );
  if (state) {
    const branchIds = new Set(ctx.sessionManager.getBranch().map((e) => e.id));
    const own = all.filter(
      (e) => e.type === "custom" && (e.data as CloseoutState)?.host?.sessionId === host.sessionId,
    );
    if (own.some((e) => !branchIds.has(e.id)))
      throw new Error(
        "Closeout journal is on another branch; return to its branch instead of dropping obligations",
      );
  }
  return state;
}
export function activityDigest(entries: SessionEntry[]): string {
  const activity: unknown[] = [];
  for (const e of entries) {
    if (e.type === "custom_message" && e.customType === "session-closeout-report") continue;
    if (e.type === "message") {
      const m = e.message;
      if (m.role === "assistant") {
        const calls = m.content.filter((c) => c.type === "toolCall" && c.name !== CLOSEOUT_TOOL);
        if (calls.length) activity.push([e.id, calls]);
      } else if (m.role === "toolResult") {
        if (m.toolName !== CLOSEOUT_TOOL) activity.push([e.id, m.toolCallId, m.isError]);
      } else activity.push(e.id);
    } else if (e.type !== "custom" || e.customType !== CLOSEOUT_ENTRY) activity.push(e.id);
  }
  return digest(activity);
}
export function pendingCalls(
  entries: SessionEntry[],
  boundary: string | null,
  ownCall?: string,
): string[] {
  const index = boundary ? entries.findIndex((e) => e.id === boundary) : -1;
  if (boundary && index < 0) return ["Original closeout boundary no longer in active branch"];
  const calls = new Map<string, string>();
  for (const e of entries.slice(index + 1)) {
    if (e.type !== "message") continue;
    const m = e.message;
    if (m.role === "assistant")
      for (const c of m.content) {
        if (c.type === "toolCall" && c.id !== ownCall) calls.set(c.id, c.name);
      }
    if (m.role === "toolResult") calls.delete(m.toolCallId);
  }
  return [...calls].map(([id, name]) => `Unsettled tool call ${name}:${id}`);
}
