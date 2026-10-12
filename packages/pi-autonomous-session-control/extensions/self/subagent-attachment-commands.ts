import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { getContextRepoRoot, getContextSessionKey } from "./session-context.ts";
import {
  ATTACHMENT_EVENT,
  type AttachmentRequest,
  claimAttachment,
  prepareAttachment,
  readAttachment,
  settleAttachment,
} from "./subagent-attachment-registry.ts";
import { readCockpitStatus } from "./subagent-cockpit-channel.ts";
import { inertText } from "./subagent-cockpit-io.ts";
import { COCKPIT_FILTERS, type CockpitFilter } from "./subagent-cockpit-ui-control.ts";
import { createSubagentDashboardSnapshot } from "./subagent-dashboard-data.ts";
import type { SubagentState } from "./subagent-session.ts";

export async function requestSubagentTabs(
  pi: ExtensionAPI,
  state: SubagentState,
  ctx: ExtensionContext,
  args = "",
  selectedName?: string,
): Promise<void> {
  if (
    ctx.mode !== "tui" ||
    !ctx.hasUI ||
    process.platform !== "linux" ||
    process.env.TERM_PROGRAM !== "ghostty" ||
    !/^(?:[1-9][0-9]{0,19}|0x[0-9a-fA-F]{1,16})$/.test(process.env.GHOSTTY_SURFACE_ID ?? "") ||
    BigInt(process.env.GHOSTTY_SURFACE_ID ?? "0") === 0n ||
    BigInt(process.env.GHOSTTY_SURFACE_ID ?? "0") > 18446744073709551615n
  ) {
    if (ctx.hasUI)
      ctx.ui.notify(
        "Native subagent tabs require interactive Pi in Ghostty; no overlay/window fallback.",
        "warning",
      );
    return;
  }
  const parentSessionKey = getContextSessionKey(ctx);
  const parentRepoRoot = getContextRepoRoot(ctx);
  if (!parentSessionKey || !parentRepoRoot) {
    ctx.ui.notify("Current parent session/repository identity required.", "warning");
    return;
  }
  const filter = (args.trim() || "running") as CockpitFilter;
  if (!COCKPIT_FILTERS.includes(filter)) {
    ctx.ui.notify(`Usage: /subagents [${COCKPIT_FILTERS.join("|")}]`, "warning");
    return;
  }
  const cwd = resolve(ctx.cwd);
  const sameContext = () =>
    getContextSessionKey(ctx) === parentSessionKey &&
    getContextRepoRoot(ctx) === parentRepoRoot &&
    resolve(ctx.cwd) === cwd;
  const rows = createSubagentDashboardSnapshot(state.sessionsDir, {
    currentSessionKey: parentSessionKey,
    currentRepoRoot: parentRepoRoot,
    sessionScope: "current",
    limit: Number.MAX_SAFE_INTEGER,
  }).rows.filter((r) =>
    selectedName ? r.sessionName === selectedName : filter === "all" || r.status === filter,
  );
  if (!rows.length) {
    ctx.ui.notify("No matching current-session children (default: running only).", "info");
    return;
  }
  if (rows.length > 16)
    ctx.ui.notify(
      "Opening at most 16 children; use /subagent-inspect <name> for others.",
      "warning",
    );
  const items: AttachmentRequest["items"] = [];
  for (const row of rows.slice(0, 16)) {
    try {
      const status = readCockpitStatus(state.sessionsDir, row.sessionName);
      if (
        !status?.dispatchId ||
        !status.attemptId ||
        status.parentSessionKey !== parentSessionKey ||
        status.parentRepoRoot !== parentRepoRoot
      )
        throw new Error("Exact attempt identity unavailable");
      items.push(
        prepareAttachment(
          {
            cwd,
            sessionsDir: resolve(state.sessionsDir),
            parentSessionKey,
            parentRepoRoot,
            sessionName: row.sessionName,
            dispatchId: status.dispatchId,
            attemptId: status.attemptId,
          },
          fileURLToPath(
            new URL(
              import.meta.url.endsWith(".js")
                ? "./subagent-attachment-viewer.js"
                : "./subagent-attachment-viewer.ts",
              import.meta.url,
            ),
          ),
        ),
      );
    } catch (error) {
      ctx.ui.notify(
        `${inertText(row.sessionName, 160)}: ${inertText(error instanceof Error ? error.message : "Attachment unavailable", 500)}`,
        "warning",
      );
    }
  }
  if (!items.length) return;
  const requestId = randomUUID();
  const byKey = new Map(items.map((item) => [item.key, item]));
  await new Promise<void>((done) => {
    let finished = false;
    let admitted = false;
    let lastReply: Parameters<AttachmentRequest["reply"]>[0] | undefined;
    let replyPoll: ReturnType<typeof setInterval> | undefined;
    const finish = () => {
      if (finished) return;
      finished = true;
      clearTimeout(missingListener);
      clearTimeout(watchdog);
      if (replyPoll) clearInterval(replyPoll);
      done();
    };
    const missingListener = setTimeout(() => {
      if (admitted || finished) return;
      ctx.ui.notify(
        "No native-tab helper claimed this request. Load LH's native tab listener; no fallback launched.",
        "warning",
      );
      finish();
    }, 1000);
    // Serial transports plus each bounded ready wait: never a routine four-second command timeout.
    const watchdog = setTimeout(
      () => {
        if (finished) return;
        for (const item of items) {
          const r = readAttachment(item);
          ctx.ui.notify(
            `${item.sessionName}: ${r.status}; ${lastReply ? "native readiness unconfirmed after helper reply" : "helper reply missing"}. No automatic launch retry.`,
            "warning",
          );
        }
        finish();
      },
      items.length * 60_000 + 5000,
    );
    const flushReply = () => {
      if (finished || !lastReply) return;
      const outcomes = lastReply.items.flatMap((r) => {
        const item = byKey.get(r.key);
        return item ? [{ r, item, owner: readAttachment(item) }] : [];
      });
      if (outcomes.length !== items.length) return;
      const mirrorStatuses = new Set(["blocked", "claimed", "awaiting_ready", "bootstrapping"]);
      if (
        outcomes.some(
          ({ r, owner }) =>
            mirrorStatuses.has(r.status) &&
            ["claimed", "awaiting_ready", "bootstrapping", "effect_indeterminate"].includes(
              owner.status,
            ),
        )
      ) {
        // A duplicate consumer's blocked mirror is not the admitted consumer's final outcome.
        admitted = true;
        replyPoll ??= setInterval(flushReply, 100);
        return;
      }
      for (const { r, item, owner } of outcomes) {
        const ready = owner.status === "ready";
        const status = ready
          ? r.status === "reuse"
            ? "reuse"
            : "ready"
          : `${["ready", "reuse"].includes(r.status) ? "unconfirmed" : inertText(r.status, 80)} · owner ${owner.status}`;
        const detail = ready
          ? owner.detail
          : [owner.detail, r.detail]
              .filter(Boolean)
              .map((s) => inertText(s, 500))
              .join(" · ");
        ctx.ui.notify(
          `${item.sessionName}: ${status}${detail ? ` · ${detail}` : ""}`,
          ready ? "info" : "warning",
        );
      }
      finish();
    };
    const request: AttachmentRequest = {
      schema: "asc.subagent-tabs.request.v1",
      requestId,
      cwd,
      parentSessionKey,
      parentRepoRoot,
      items: items.map((item) => ({ ...item })),
      claim(key) {
        const item = byKey.get(key);
        if (!item || finished || !sameContext())
          return { action: "blocked", status: "stale", detail: "Request/context unavailable" };
        admitted = true;
        return claimAttachment(item);
      },
      settle(key, result) {
        const item = byKey.get(key);
        if (!item) return;
        // Settlement remains valid after command timeout, never implying a retry.
        try {
          settleAttachment(item, result);
        } catch {
          ctx.ui.notify(
            `${item.sessionName}: attachment settlement unavailable; do not retry launch.`,
            "warning",
          );
        }
      },
      read(key) {
        const item = byKey.get(key);
        return item ? readAttachment(item) : { status: "blocked", detail: "Unknown request item" };
      },
      reply(result) {
        if (
          finished ||
          result?.requestId !== requestId ||
          !Array.isArray(result.items) ||
          result.items.length !== items.length ||
          new Set(result.items.map((r) => r.key)).size !== items.length ||
          result.items.some((r) => !byKey.has(r.key) || typeof r.status !== "string")
        )
          return;
        lastReply = { requestId, items: result.items.map((r) => ({ ...r })) };
        flushReply();
      },
    };
    try {
      pi.events.emit(ATTACHMENT_EVENT, request);
    } catch {
      ctx.ui.notify(
        "Native-tab helper failed; claimed launches are not retried automatically.",
        "warning",
      );
      if (!admitted) finish();
    }
  });
}
