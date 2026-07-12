// summary: Formats compact autoresearch TUI lines, metrics, improvements, and box borders.
// read_when:
//   - Adjusting terminal metric display, truncation, or bordered layout helpers.
export function truncatePlainLine(line: string, width: number): string {
  if (line.length <= width) return line;
  if (width <= 1) return line.slice(0, Math.max(0, width));
  return `${line.slice(0, Math.max(0, width - 1))}…`;
}

export function formatAutoresearchTuiMetric(value: number | null, unit: string): string {
  if (value === null || !Number.isFinite(value)) return "—";
  const formatted =
    Math.abs(value) >= 100
      ? value.toFixed(0)
      : Number.isInteger(value)
        ? String(value)
        : value.toFixed(2);
  return `${formatted}${unit}`;
}

export function formatAutoresearchTuiImprovement(
  baseline: number | null,
  best: number | null,
  direction: string | null,
): string {
  if (
    baseline === null ||
    best === null ||
    baseline === 0 ||
    !Number.isFinite(baseline) ||
    !Number.isFinite(best)
  ) {
    return "—";
  }
  const raw = ((best - baseline) / baseline) * 100;
  const improved =
    direction === "lower" ? best < baseline : direction === "higher" ? best > baseline : false;
  const sign = raw > 0 ? "+" : "";
  const arrow = improved ? "↗" : raw === 0 ? "→" : "↘";
  return `${arrow} ${sign}${raw.toFixed(1)}%`;
}

export function borderedLine(text: string, innerWidth: number): string {
  const truncated = truncatePlainLine(text, innerWidth);
  return `│${truncated}${" ".repeat(Math.max(0, innerWidth - truncated.length))}│`;
}

export function borderLine(left: string, fill: string, right: string, innerWidth: number): string {
  return `${left}${fill.repeat(innerWidth)}${right}`;
}
