// ---
// summary: pi-telemetry extension entry — collector wiring, /telemetry dashboard command, telemetry agent tool.
// read_when:
//   - changing live collector wiring, dashboard command flags, or the agent tool surface.
// ---

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { summarizeTelemetryEvents } from "../src/aggregate.ts";
import { registerTelemetryCollector } from "../src/collector.ts";
import { renderTelemetryDashboard } from "../src/dashboard.ts";
import { appendTelemetryEvent, readTelemetryEvents, resolveTelemetryDir } from "../src/store.ts";

const DEFAULT_WINDOW_DAYS = 14;
const MAX_WINDOW_DAYS = 90;

export default function telemetryExtension(pi: ExtensionAPI): void {
  const dir = resolveTelemetryDir();

  registerTelemetryCollector(pi, { dir });

  pi.registerCommand("telemetry", {
    description: "Regenerate the telemetry HTML dashboard (default 14d window)",
    handler: async (args, ctx) => {
      const days = parseWindowDays(args);
      const events = await readTelemetryEvents(dir, days);
      const summary = summarizeTelemetryEvents(events, days);
      const html = renderTelemetryDashboard(summary, {
        generatedAt: Date.now(),
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
      const events = await readTelemetryEvents(dir, windowDays);
      const summary = summarizeTelemetryEvents(events, windowDays);

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

export { appendTelemetryEvent, readTelemetryEvents, resolveTelemetryDir };
