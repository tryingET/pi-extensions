// ---
// summary: pi-telemetry extension entry — collector wiring, dashboard/review commands, telemetry agent tool.
// read_when:
//   - changing live collector wiring, dashboard/review command flags, or the agent tool surface.
// ---

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { summarizeTelemetryEvents } from "../src/aggregate.ts";
import { backfillSessionsTelemetry } from "../src/backfill.ts";
import { registerTelemetryCollector } from "../src/collector.ts";
import { renderTelemetryDashboard } from "../src/dashboard.ts";
import {
  buildTelemetryReviewSnapshot,
  writeTelemetryReviewSnapshot,
} from "../src/review-snapshot.ts";
import { readTelemetryEvents, resolveTelemetryDir } from "../src/store.ts";

const DEFAULT_WINDOW_DAYS = 14;
const MAX_WINDOW_DAYS = 90;

export default function telemetryExtension(pi: ExtensionAPI): void {
  const dir = resolveTelemetryDir();

  registerTelemetryCollector(pi, { dir });

  pi.registerCommand("telemetry", {
    description:
      "Regenerate the dashboard; /telemetry review [days] writes a digest-bound snapshot; /telemetry backfill [days] derives bounded history",
    handler: async (args, ctx) => {
      const command = args.trim();
      if (/^backfill(?:\s|$)/u.test(command)) {
        const days = parseWindowDays(command.replace(/^backfill\s*/u, ""));
        const result = await backfillSessionsTelemetry({ days });
        const message =
          `Telemetry backfill: ${result.events} events derived from ${result.filesBackfilled} sessions ` +
          `(${result.filesSkippedAlreadyBackfilled} already done, ${result.filesSkippedLiveOverlap} live-covered) ` +
          `into ${result.shardDays.length} day shards.`;
        if (ctx?.hasUI) ctx.ui.notify(message, "info");
        return message;
      }

      const review = /^review(?:\s|$)/u.test(command);
      const days = parseWindowDays(review ? command.replace(/^review\s*/u, "") : command);
      const now = Date.now();
      const events = await readTelemetryEvents(dir, days, now);
      const summary = summarizeTelemetryEvents(events, days, now);

      if (review) {
        const snapshot = buildTelemetryReviewSnapshot({
          events,
          summary,
          windowDays: days,
          generatedAt: now,
        });
        const target = await writeTelemetryReviewSnapshot(dir, snapshot);
        const message =
          `Telemetry review snapshot written: ${target} ` +
          `(${events.length} events, ${days}d, sha256:${snapshot.snapshotSha256})`;
        if (ctx?.hasUI) ctx.ui.notify(message, "info");
        return message;
      }

      const html = renderTelemetryDashboard(summary, {
        generatedAt: now,
        windowDays: days,
        sourceDir: dir,
      });

      const { writeFile, mkdir } = await import("node:fs/promises");
      const path = await import("node:path");
      await mkdir(dir, { recursive: true });
      const target = path.join(dir, "dashboard.html");
      await writeFile(target, html, "utf8");

      const message = `Telemetry dashboard written: ${target} (${events.length} events, ${days}d window)`;
      if (ctx?.hasUI) {
        ctx.ui.notify(message, "info");
      }
      return message;
    },
  });

  pi.registerTool({
    name: "telemetry",
    label: "Runtime Telemetry Aggregates",
    description:
      "Query bounded aggregates over local pi telemetry shards (compaction, tool calls, vault queries, skill loads, self-driving follow-ups, subagents). Mirror-only observability; not authority.",
    promptSnippet:
      "Inspect runtime telemetry aggregates: compaction pressure, failing tools, vault/skill usage, follow-up outcomes.",
    parameters: Type.Object({
      window_days: Type.Optional(
        Type.Integer({
          minimum: 1,
          maximum: MAX_WINDOW_DAYS,
          description: "Lookback window in days (default 7)",
        }),
      ),
      group_by: Type.Optional(Type.String({ description: "Optional focus: day | kind | tool" })),
    }),
    async execute(_toolCallId, params) {
      const windowDays = clampWindowDays(params.window_days);
      const now = Date.now();
      const events = await readTelemetryEvents(dir, windowDays, now);
      const summary = summarizeTelemetryEvents(events, windowDays, now);

      if (params.group_by === "day") {
        return ok({ windowDays, perDay: summary.perDay });
      }
      if (params.group_by === "kind") {
        return ok({ windowDays, perKind: summary.perKind });
      }
      if (params.group_by === "tool") {
        return ok({ windowDays, toolCalls: summary.toolCalls });
      }

      return ok({
        windowDays,
        totalEvents: summary.totalEvents,
        compaction: summary.compaction,
        toolCalls: summary.toolCalls,
        vault: summary.vault,
        skills: summary.skills,
        followUps: summary.followUps,
        subagents: summary.subagents,
        boundary:
          "telemetry is a mirror-only projection; it is not AK/KES evidence or any owner authority",
      });
    },
  });
}

function ok(data: unknown) {
  return {
    content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
    details: { data },
  };
}

function parseWindowDays(args: string): number {
  const parsed = Number.parseInt(args.trim(), 10);
  return Number.isFinite(parsed) ? clampWindowDays(parsed) : DEFAULT_WINDOW_DAYS;
}

function clampWindowDays(value: number | undefined): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return 7;
  return Math.min(MAX_WINDOW_DAYS, Math.max(1, Math.floor(value)));
}

export { readTelemetryEvents, resolveTelemetryDir };
