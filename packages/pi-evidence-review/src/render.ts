import {
  type Component,
  Key,
  matchesKey,
  truncateToWidth,
  visibleWidth,
  wrapTextWithAnsi,
} from "@earendil-works/pi-tui";
import type { EvidenceReview } from "./validation.ts";

const CONTROL_CHARACTER = /\p{Cc}/u;
const FORMAT_CHARACTER = /\p{Cf}/u;
const SUMMARY_ITEM_LIMIT = 8;

function codePointLabel(character: string): string {
  return `U+${character.codePointAt(0)?.toString(16).toUpperCase().padStart(4, "0") ?? "????"}`;
}

export function sanitizePlainText(value: string): string {
  let output = "";
  for (const character of value) {
    if (character === "\r") output += "[carriage-return]";
    else if (character === "\n") output += "[newline]";
    else if (character === "\t") output += "[tab]";
    else if (CONTROL_CHARACTER.test(character)) output += `[control ${codePointLabel(character)}]`;
    else if (FORMAT_CHARACTER.test(character)) output += `[format ${codePointLabel(character)}]`;
    else output += character;
  }
  return output;
}

function valueText(value: unknown): string {
  if (value === null) return "null / unknown or inapplicable as supplied";
  if (typeof value === "string") return sanitizePlainText(value);
  if (typeof value === "boolean" || typeof value === "number") return String(value);
  return "";
}

function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function records(value: unknown): Array<Record<string, unknown>> {
  return Array.isArray(value) ? value.map(record) : [];
}

function strings(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function appendBoundedItems(
  lines: string[],
  title: string,
  items: Array<Record<string, unknown>>,
  render: (item: Record<string, unknown>) => string,
): void {
  lines.push(`-- ${title} (${items.length}) --`);
  for (const item of items.slice(0, SUMMARY_ITEM_LIMIT)) lines.push(`- ${render(item)}`);
  if (items.length > SUMMARY_ITEM_LIMIT) {
    lines.push(`- ... ${items.length - SUMMARY_ITEM_LIMIT} more; press D for details`);
  }
}

function appendBoundedStrings(lines: string[], title: string, items: string[]): void {
  if (items.length === 0) return;
  lines.push(`-- ${title} (${items.length}) --`);
  for (const item of items.slice(0, SUMMARY_ITEM_LIMIT)) {
    lines.push(`- ${sanitizePlainText(item)}`);
  }
  if (items.length > SUMMARY_ITEM_LIMIT) {
    lines.push(`- ... ${items.length - SUMMARY_ITEM_LIMIT} more; press D for details`);
  }
}

function flatten(value: unknown, path: string, lines: string[]): void {
  if (Array.isArray(value)) {
    if (value.length === 0) lines.push(`${path}: [none supplied]`);
    value.forEach((child, index) => {
      flatten(child, `${path}[${index}]`, lines);
    });
    return;
  }
  if (value !== null && typeof value === "object") {
    for (const [key, child] of Object.entries(value)) {
      flatten(child, path ? `${path}.${sanitizePlainText(key)}` : sanitizePlainText(key), lines);
    }
    return;
  }
  lines.push(`${path}: ${valueText(value)}`);
}

export function reviewSummaryLines(review: EvidenceReview): string[] {
  const source = record(review.source);
  const outcome = record(review.outcome);
  const scope = record(review.scope);
  const risk = record(scope.risk);
  const commands = record(review.commands);
  const checks = record(review.checks);
  const handoff = record(review.handoffReadiness);
  const claims = records(review.claims);
  const limitations = records(review.limitations);
  const boundaries = records(review.authorityBoundaries);
  const decisions = records(review.operatorDecisionPoints);
  const gates = records(handoff.gates);
  const evidenceArtifacts = records(review.evidenceArtifacts);
  const selectedCommands = Array.isArray(commands.selected) ? commands.selected.length : 0;
  const recommendedMinimum = Array.isArray(commands.recommendedMinimum)
    ? commands.recommendedMinimum.length
    : 0;
  const recommendedBroader = Array.isArray(commands.recommendedBroader)
    ? commands.recommendedBroader.length
    : 0;
  const executedCommands = Array.isArray(checks.commands) ? checks.commands.length : 0;

  const lines = [
    "EVIDENCE REVIEW - inert, read-only display",
    "No decision is selected or recorded. Commands, paths, and URIs are plain text only.",
    `Outcome: ${valueText(outcome.status)} | previewOnly=${valueText(outcome.previewOnly)} | applied=${valueText(outcome.applied)} | productionReady=${valueText(outcome.productionReady)}`,
    `Source: kind=${valueText(source.kind)} | workflow=${valueText(source.workflow)}`,
    `Scope: touchedFiles=${strings(scope.touchedFiles).length} | risk=${valueText(risk.level)}/${valueText(risk.category)} | target=${valueText(scope.target)}`,
    `Checks: ok=${valueText(checks.ok)} | executed=${executedCommands} | elapsedMs=${valueText(checks.elapsedMs)}`,
    `Commands: selected=${selectedCommands} | recommended minimum=${recommendedMinimum} | recommended broader=${recommendedBroader}`,
    `Evidence: artifacts=${evidenceArtifacts.length} | claims=${claims.length} | limitations=${limitations.length} | boundaries=${boundaries.length}`,
    `Handoff: status=${valueText(handoff.status)} | decision=${valueText(handoff.decision)} (displayed only; never accepted)`,
  ];

  appendBoundedItems(
    lines,
    "Claims",
    claims,
    (item) => `${valueText(item.id)} [${valueText(item.status)}]: ${valueText(item.claim)}`,
  );
  appendBoundedItems(
    lines,
    "Limitations",
    limitations,
    (item) => `${valueText(item.id)} [${valueText(item.severity)}]: ${valueText(item.limitation)}`,
  );
  appendBoundedItems(
    lines,
    "Authority boundaries",
    boundaries,
    (item) => `${valueText(item.id)}: ${valueText(item.boundary)}`,
  );
  appendBoundedItems(
    lines,
    "Operator decisions",
    decisions,
    (item) =>
      `${valueText(item.id)} | options=${strings(item.options).join(", ")} | uncertainty=${valueText(item.residualUncertainty)}`,
  );
  appendBoundedItems(
    lines,
    "Handoff gates",
    gates,
    (item) => `${valueText(item.id)} [${valueText(item.status)}]: ${valueText(item.limitation)}`,
  );

  appendBoundedStrings(lines, "Operator questions", strings(review.operatorQuestions));
  appendBoundedStrings(lines, "Advisory next actions", strings(handoff.nextActions));
  return lines;
}

export function reviewDisplayLines(review: EvidenceReview): string[] {
  const lines = [
    "EVIDENCE REVIEW - full normalized detail",
    "No decision is selected or recorded. Commands, paths, and URIs are plain text only.",
    "-- normalized producer fields (source order) --",
  ];
  flatten(review, "", lines);
  return lines;
}

export class EvidenceReviewPanel implements Component {
  private scroll = 0;
  private detailed = false;
  private cachedWidth?: number;
  private cachedLines?: string[];

  constructor(
    private readonly summaryLines: string[],
    private readonly onClose: () => void,
    private readonly viewportHeight = 22,
    private readonly detailLines: string[] = summaryLines,
  ) {}

  private sourceLines(): string[] {
    return this.detailed ? this.detailLines : this.summaryLines;
  }

  private wrapped(width: number): string[] {
    const safeWidth = Math.max(1, width);
    if (this.cachedLines && this.cachedWidth === safeWidth) return this.cachedLines;
    const wrapped: string[] = [];
    for (const line of this.sourceLines()) {
      const parts = wrapTextWithAnsi(line, safeWidth);
      wrapped.push(...(parts.length > 0 ? parts : [""]));
    }
    this.cachedWidth = safeWidth;
    this.cachedLines = wrapped;
    return wrapped;
  }

  render(width: number): string[] {
    const safeWidth = Math.max(1, width);
    const all = this.wrapped(safeWidth);
    const contentHeight = Math.max(1, this.viewportHeight - 1);
    const maximumScroll = Math.max(0, all.length - contentHeight);
    this.scroll = Math.min(this.scroll, maximumScroll);
    const visible = all.slice(this.scroll, this.scroll + contentHeight);
    const viewAction = this.detailed ? "summary" : "details";
    const footer = `Up/Down/PgUp/PgDn scroll | Enter/D ${viewAction} | Esc close | ${this.scroll + 1}-${Math.min(this.scroll + contentHeight, all.length)}/${all.length}`;
    return [...visible, truncateToWidth(footer, safeWidth, "")].map((line) =>
      visibleWidth(line) <= safeWidth ? line : truncateToWidth(line, safeWidth, ""),
    );
  }

  handleInput(data: string): void {
    const page = Math.max(1, this.viewportHeight - 3);
    if (matchesKey(data, Key.escape) || matchesKey(data, Key.ctrl("c"))) {
      this.onClose();
      return;
    }
    if (matchesKey(data, Key.enter) || data.toLowerCase() === "d") {
      this.detailed = !this.detailed;
      this.scroll = 0;
    } else if (matchesKey(data, Key.up)) this.scroll = Math.max(0, this.scroll - 1);
    else if (matchesKey(data, Key.down)) this.scroll += 1;
    else if (matchesKey(data, Key.pageUp)) this.scroll = Math.max(0, this.scroll - page);
    else if (matchesKey(data, Key.pageDown)) this.scroll += page;
    else if (matchesKey(data, Key.home)) this.scroll = 0;
    else if (matchesKey(data, Key.end)) this.scroll = Number.MAX_SAFE_INTEGER;
    this.cachedWidth = undefined;
    this.cachedLines = undefined;
  }

  invalidate(): void {
    this.cachedWidth = undefined;
    this.cachedLines = undefined;
  }
}
