/**
 * Shared helpers for query resolution.
 */

export function extractQuotedContent(text: string): string | undefined {
  const match = text.match(/"([^"]+)"/) || text.match(/'([^']+)'/);
  return match?.[1];
}

const idStateByPrefix = new Map<string, { lastTs: number; sequence: number }>();

export function createMonotonicId(prefix: string): string {
  const now = Date.now();
  const state = idStateByPrefix.get(prefix);

  if (!state || state.lastTs !== now) {
    idStateByPrefix.set(prefix, { lastTs: now, sequence: 0 });
    return `${prefix}-${now}`;
  }

  state.sequence += 1;
  return `${prefix}-${now}-${state.sequence}`;
}

export function extractConfidenceLevel(text: string): "high" | "medium" | "low" | "blocked" {
  const lower = text.toLowerCase();
  if (lower.includes("high") || lower.includes("confident") || lower.includes("sure"))
    return "high";
  if (lower.includes("low") || lower.includes("uncertain") || lower.includes("unsure"))
    return "low";
  if (lower.includes("blocked") || lower.includes("stuck")) return "blocked";
  return "medium";
}

export function extractUrgency(text: string): "low" | "medium" | "high" {
  const lower = text.toLowerCase();
  if (lower.includes("urgent") || lower.includes("critical") || lower.includes("asap"))
    return "high";
  if (lower.includes("low") || lower.includes("eventually")) return "low";
  return "medium";
}
