import type { ExploreOperatorEntry } from "./explore-presentation.ts";
import { summarizeExplorePacket } from "./explore-presentation.ts";

export interface ExploreRenderResult {
  content: Array<{ type: string; text?: string }>;
  details?: unknown;
}

export class BoundedAsciiText {
  private text: string;
  private cachedWidth?: number;
  private cachedLines?: string[];

  constructor(text: string) {
    this.text = text;
  }

  setText(text: string): void {
    if (text === this.text) return;
    this.text = text;
    this.invalidate();
  }

  render(width: number): string[] {
    const safeWidth = Number.isSafeInteger(width) && width > 0 ? width : 1;
    if (this.cachedLines && this.cachedWidth === safeWidth) return this.cachedLines;
    const lines = asciiVisible(this.text)
      .split("\n")
      .flatMap((line) => wrapAsciiLine(line, safeWidth));
    this.cachedWidth = safeWidth;
    this.cachedLines = lines.length > 0 ? lines : [""];
    return this.cachedLines;
  }

  invalidate(): void {
    this.cachedWidth = undefined;
    this.cachedLines = undefined;
  }
}

export function renderExploreCall(
  args: Record<string, unknown>,
  lastComponent?: unknown,
): BoundedAsciiText {
  const symbol = boundedLabel(args.symbol, 120) || "(missing symbol)";
  const mode = args.mode === "standard" || args.mode === "debug" ? args.mode : "compact";
  return component(`SCI explore_symbol_impact ${symbol} [${mode}]`, lastComponent);
}

export function renderExploreResult(
  result: ExploreRenderResult,
  options: { expanded: boolean; isPartial: boolean },
  toolCallId: string,
  retained: ReadonlyMap<string, ExploreOperatorEntry>,
  lastComponent?: unknown,
): BoundedAsciiText {
  if (options.isPartial) return component("SCI explore_symbol_impact running", lastComponent);
  const details = record(result.details);
  const presentation = record(details?.explorePresentation);
  const operator = retained.get(toolCallId);
  const collapsed = collapsedResult(presentation, operator);
  if (!options.expanded) return component(collapsed, lastComponent);

  const modelText = result.content.find((item) => item.type === "text")?.text;
  const expanded = [
    collapsed,
    "",
    "Model projection (sent to the model):",
    typeof modelText === "string"
      ? safePrettyText(modelText)
      : "[bounded model projection unavailable]",
    "",
    "Operator packet (validated, disclosure-sanitized, bounded, TUI-only):",
    operator ? safePretty(operator.packet) : "[operator packet unavailable; raw fallback withheld]",
  ].join("\n");
  return component(expanded, lastComponent);
}

export function renderExploreOperatorEntry(
  entry: ExploreOperatorEntry | undefined,
  expanded: boolean,
  lastComponent?: unknown,
): BoundedAsciiText {
  if (!entry) {
    return component("SCI operator packet unavailable; unsafe detail withheld", lastComponent);
  }
  const summary = summarizeExplorePacket(entry.packet, entry.requestedMode);
  const collapsed = [
    `SCI operator detail [${entry.requestedMode}]`,
    summary.status,
    boundedLabel(summary.symbol, 80),
    `${entry.producerBytes} bytes`,
    "TUI-only",
  ]
    .filter(Boolean)
    .join(" | ");
  if (!expanded) return component(collapsed, lastComponent);
  return component(
    `${collapsed}\n\nValidated sanitized producer packet:\n${safePretty(entry.packet)}`,
    lastComponent,
  );
}

function collapsedResult(
  presentation: Record<string, unknown> | undefined,
  operator: ExploreOperatorEntry | undefined,
): string {
  if (!presentation) return "SCI explore result unavailable; raw fallback withheld";
  const mode = boundedLabel(presentation.requestedMode, 16) || "compact";
  const status = boundedLabel(presentation.status, 24) || "indeterminate";
  const pieces = [`SCI explore [${mode}]`, status];
  if (typeof presentation.riskLevel === "string") {
    pieces.push(`risk ${boundedLabel(presentation.riskLevel, 24)}`);
  }
  if (Number.isSafeInteger(presentation.totalFiles)) {
    pieces.push(
      `impact ${safeCount(presentation.emittedFiles)}/${safeCount(presentation.totalFiles)} files`,
    );
  }
  if (presentation.graphObserved === true || safeCount(presentation.graphObservedItems) > 0) {
    pieces.push(
      `graph observed ${safeCount(presentation.graphObservedItems)}, usable ${safeCount(presentation.graphUsableItems)}`,
    );
  }
  if (typeof presentation.nextAction === "string") {
    pieces.push(`next ${boundedLabel(presentation.nextAction, 48)}`);
  }
  pieces.push(operator ? "detail retained" : "detail unavailable");
  return pieces.join(" | ");
}

function component(text: string, previous?: unknown): BoundedAsciiText {
  if (previous instanceof BoundedAsciiText) {
    previous.setText(text);
    return previous;
  }
  return new BoundedAsciiText(text);
}

function safePretty(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2) ?? "[empty]";
  } catch {
    return "[operator packet could not be rendered; raw fallback withheld]";
  }
}

function safePrettyText(value: string): string {
  try {
    return JSON.stringify(JSON.parse(value), null, 2);
  } catch {
    return "[model projection could not be rendered; raw fallback withheld]";
  }
}

function asciiVisible(value: string): string {
  let output = "";
  for (const character of value) {
    if (character === "\n") {
      output += character;
      continue;
    }
    const codePoint = character.codePointAt(0) ?? 0;
    output +=
      codePoint >= 0x20 && codePoint <= 0x7e
        ? character
        : `\\u{${codePoint.toString(16).padStart(4, "0")}}`;
  }
  return output;
}

function wrapAsciiLine(line: string, width: number): string[] {
  if (line.length === 0) return [""];
  const lines: string[] = [];
  for (let offset = 0; offset < line.length; offset += width) {
    lines.push(line.slice(offset, offset + width));
  }
  return lines;
}

function boundedLabel(value: unknown, max: number): string {
  if (typeof value !== "string") return "";
  const points = Array.from(value);
  return points.length <= max ? value : `${points.slice(0, Math.max(0, max - 3)).join("")}...`;
}

function safeCount(value: unknown): number {
  return Number.isSafeInteger(value) && Number(value) >= 0 ? Number(value) : 0;
}

function record(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}
