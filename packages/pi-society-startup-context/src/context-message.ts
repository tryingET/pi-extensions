// Append-only advisory snapshots, deduplicated against the host's active replay context.
import { createHash } from "node:crypto";
import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import type { StartupContextPacket } from "./payload-check.ts";

export const STARTUP_CONTEXT_TYPE = "society-startup-context";
export const MAX_STARTUP_MESSAGE_BYTES = 32 * 1024;
export const WITHDRAWAL_MESSAGE =
  "AI Society advisory snapshot withdrawn: injection is disabled or cwd is outside eligible scope. This latest message supersedes all earlier AI Society startup snapshots. Earlier advice is historical only, with no continuing authority; read current AK authority before acting.";
const ADVISORY = [
  "AI Society advisory snapshot: this latest snapshot supersedes all earlier AI Society startup snapshots, including snapshots for other cwd/config identities. Earlier snapshots are historical orientation only.",
  "Freshness and health labels describe this observation at injection time, not continuing authority. This packet grants no authorization, task claim, or permission to mutate state; read current AK task/decision authority explicitly before acting, even when this snapshot is healthy and fresh.",
].join("\n");

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, item]) => [key, canonical(item)]),
    );
  return value;
}

export function startupContextMessage(
  ctx: Pick<ExtensionContext, "sessionManager">,
  packet: StartupContextPacket,
  render: (packet: StartupContextPacket) => string,
  eligible: boolean,
) {
  // Never scan all entries or just getBranch(): compacted and abandoned messages
  // are not evidence that the current provider context already contains this advice.
  const entries = ctx.sessionManager?.buildContextEntries?.() || [];
  // Newer hosts can omit/replace a retained message with an append-only context
  // edit. Read these from the same active list; do not mistake omitted raw advice
  // for provider-visible advice. Older hosts simply have no such entries.
  const edits = new Map<string, { content: unknown } | null>();
  for (const entry of entries) {
    const edit = entry as {
      type: string;
      targetId?: string;
      replacement?: { content: unknown } | null;
    };
    if (edit.type === "context_edit" && edit.targetId && edit.replacement !== undefined)
      edits.set(edit.targetId, edit.replacement);
  }
  const prior = [...entries]
    .reverse()
    .find(
      (entry) =>
        entry.type === "custom_message" &&
        entry.customType === STARTUP_CONTEXT_TYPE &&
        edits.get(entry.id) !== null,
    );
  const priorContent =
    prior?.type === "custom_message" ? (edits.get(prior.id)?.content ?? prior.content) : undefined;
  let content: string;
  if (!eligible) {
    if (!prior || priorContent === WITHDRAWAL_MESSAGE) return undefined;
    content = WITHDRAWAL_MESSAGE;
  } else {
    // Generation and monotonic scheduling origin are controller-local, not observation
    // evidence. Keep every other field, including exact capturedAt, freshness, config,
    // cwd and diagnostics (even fields compressed/rounded by the markdown renderer).
    const {
      collectionGeneration: _generation,
      collectionStartedMonoMs: _origin,
      ...evidence
    } = packet;
    const rendered = render(packet);
    const digest = createHash("sha256")
      .update(JSON.stringify(canonical({ evidence, rendered })))
      .digest("hex");
    const header = `${ADVISORY}\nSnapshot evidence SHA-256: ${digest}\n`;
    content = `${header}\n${rendered}`;
    const bytes = Buffer.byteLength(content, "utf8");
    if (bytes > MAX_STARTUP_MESSAGE_BYTES) {
      // Reject the oversized body as a whole, never cut a decision/warning into a
      // misleading partial assertion. Manual rendering still exposes the full packet.
      const diagnostic = [
        `Snapshot body withheld: ${bytes} bytes exceeds ${MAX_STARTUP_MESSAGE_BYTES}-byte injection limit; no body facts or grants are supplied. Use /society-context refresh to inspect the full packet.`,
        `captured_at: ${packet.capturedAt}; cwd: ${packet.cwd}; config: ${packet.configFingerprint}`,
        `source_health: ${packet.sourceHealth}; freshness: ${packet.freshness}; refresh_state: ${packet.refreshState}; full_refresh_status: ${packet.fullRefreshStatus}`,
        `source warning count (before truncation): ${packet.warningCount ?? packet.warnings.length}`,
        `Collection diagnostics: ${JSON.stringify(packet.commandDiagnostics || [])}`,
      ].join("\n");
      content = `${header}\n${diagnostic}`;
      if (Buffer.byteLength(content, "utf8") > MAX_STARTUP_MESSAGE_BYTES)
        content = `${header}\nSnapshot body and oversized source diagnostics withheld (${bytes} original bytes; ${MAX_STARTUP_MESSAGE_BYTES}-byte limit). Evidence digest covers all omitted fields. No source facts or grants supplied; inspect /society-context refresh.`;
    }
    if (priorContent === content) return undefined;
  }
  return { message: { customType: STARTUP_CONTEXT_TYPE, content, display: false } };
}
