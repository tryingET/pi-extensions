import type { Theme } from "@earendil-works/pi-coding-agent";
import { truncateToWidth, wrapTextWithAnsi } from "@earendil-works/pi-tui";
import type { SubagentCockpitSnapshot } from "./subagent-cockpit-data.ts";
import { cockpitText } from "./subagent-cockpit-ui-control.ts";

export const COCKPIT_EVENT_LIMIT = 160;

// Preparation belongs to polling, not render. Detail/text budgets are shared across events.
export function prepareCockpitSnapshot(next: SubagentCockpitSnapshot): SubagentCockpitSnapshot {
  let textBudget = 32000,
    detailBudget = 32000;
  let truncated = next.truncated || next.events.length > COCKPIT_EVENT_LIMIT;
  const take = (value: string, limit: number) => {
    if (value.length > limit) truncated = true;
    return cockpitText(value, Math.max(0, limit));
  };
  const events = next.events
    .slice(-COCKPIT_EVENT_LIMIT)
    .reverse()
    .map((event) => {
      const text = take(event.text, Math.min(4000, textBudget));
      const detail =
        event.detail === undefined ? undefined : take(event.detail, Math.min(8000, detailBudget));
      textBudget -= text.length;
      detailBudget -= detail?.length ?? 0;
      return {
        ...event,
        timestamp: cockpitText(event.timestamp, 32).replace(/\s+/g, " "),
        kind: cockpitText(event.kind, 40).replace(/\s+/g, " "),
        toolName: event.toolName ? cockpitText(event.toolName, 80).replace(/\s+/g, " ") : undefined,
        text,
        detail,
      };
    });
  return { ...next, events: events.reverse(), receipts: next.receipts.slice(-20), truncated };
}

export function buildCockpitTimeline(
  snapshot: SubagentCockpitSnapshot | undefined,
  width: number,
  selectedEvent: number,
  expanded: Set<string>,
  theme: Pick<Theme, "fg">,
): { lines: string[]; offsets: number[] } {
  const lines: string[] = [],
    offsets: number[] = [];
  for (const [index, event] of (snapshot?.events ?? []).entries()) {
    offsets.push(lines.length);
    const selected = index === selectedEvent;
    const isExpanded = expanded.has(event.id);
    const title = `${selected ? "›" : " "} ${event.timestamp} ${event.kind}${event.toolName ? ` · ${event.toolName}` : ""} ${isExpanded ? "▾" : "▸"}`;
    lines.push(truncateToWidth(theme.fg(selected ? "accent" : "dim", title), width));
    const summary = isExpanded ? event.text : event.text.split("\n").slice(0, 3).join("\n");
    const wrapped = wrapTextWithAnsi(summary, width);
    const limit = isExpanded ? 100 : 6;
    lines.push(...wrapped.slice(0, limit));
    if (wrapped.length > limit || summary.length < event.text.length)
      lines.push("… expand / scroll for bounded detail");
    if (isExpanded && event.detail) {
      const details = wrapTextWithAnsi(event.detail, width);
      lines.push(...details.slice(0, 160));
      if (details.length > 160) lines.push("… detail clipped to display budget");
    }
  }
  if (snapshot?.truncated) lines.push("… bounded history; some earlier content omitted");
  for (const receipt of snapshot?.receipts ?? []) {
    lines.push(
      ...wrapTextWithAnsi(
        cockpitText(
          `Receipt ${receipt.requestId} · ${receipt.status} · ${receipt.updatedAt}\n${receipt.message}${receipt.reason ? `\n${receipt.reason}` : ""}`,
          1500,
        ),
        width,
      ).slice(0, 8),
    );
  }
  if (!lines.length)
    lines.push(
      cockpitText(snapshot?.unavailableReason ?? "No conversation events available.").replace(
        /\s+/g,
        " ",
      ),
    );
  return { lines, offsets };
}
