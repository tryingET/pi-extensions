import {
  type Component,
  Key,
  matchesKey,
  truncateToWidth,
  visibleWidth,
  wrapTextWithAnsi,
} from "@earendil-works/pi-tui";
import type { EvidenceReview } from "./validation.ts";

const NON_PRINTING_CONTROL = /[\p{Cc}\p{Cf}]/u;

function isUnsafeControl(character: string): boolean {
  return NON_PRINTING_CONTROL.test(character);
}
const METACHARACTERS: Record<string, string> = {
  "<": "‹",
  ">": "›",
  "&": "＆",
  "#": "＃",
  "*": "＊",
  _: "＿",
  "`": "｀",
  "[": "［",
  "]": "］",
  "(": "（",
  ")": "）",
  "!": "！",
  "|": "｜",
  "\\": "＼",
};

export function sanitizePlainText(value: string): string {
  let output = "";
  for (const character of value.replace(/\r\n|\r|\n|\t/gu, (match) =>
    match === "\t" ? " ⇥ " : " ⏎ ",
  )) {
    if (isUnsafeControl(character)) output += "�";
    else output += METACHARACTERS[character] ?? character;
  }
  return output;
}

function valueText(value: unknown): string {
  if (value === null) return "null / unknown or inapplicable as supplied";
  if (typeof value === "string") return sanitizePlainText(value);
  if (typeof value === "boolean" || typeof value === "number") return String(value);
  return "";
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

export function reviewDisplayLines(review: EvidenceReview): string[] {
  const outcome = review.outcome as Record<string, unknown>;
  const commands = review.commands as Record<string, unknown>;
  const handoff = review.handoffReadiness as Record<string, unknown>;
  const lines = [
    "EVIDENCE REVIEW — inert, read-only display",
    "No decision is selected or recorded. Commands, paths, and URIs are quoted text only.",
    `Outcome status: ${valueText(outcome.status)} | previewOnly=${valueText(outcome.previewOnly)} | applied=${valueText(outcome.applied)}`,
    `Production boundary: productionReady=${valueText(outcome.productionReady)}`,
    `Command posture: selected=${Array.isArray(commands.selected) ? commands.selected.length : 0}, recommended-minimum=${Array.isArray(commands.recommendedMinimum) ? commands.recommendedMinimum.length : 0}, recommended-broader=${Array.isArray(commands.recommendedBroader) ? commands.recommendedBroader.length : 0}`,
    `Handoff: status=${valueText(handoff.status)} | decision=${valueText(handoff.decision)} (displayed only; never accepted)`,
    "--- normalized producer fields (source order) ---",
  ];
  flatten(review, "", lines);
  return lines;
}

export class EvidenceReviewPanel implements Component {
  private scroll = 0;
  private cachedWidth?: number;
  private cachedLines?: string[];

  constructor(
    private readonly sourceLines: string[],
    private readonly onClose: () => void,
    private readonly viewportHeight = 22,
  ) {}

  private wrapped(width: number): string[] {
    const safeWidth = Math.max(1, width);
    if (this.cachedLines && this.cachedWidth === safeWidth) return this.cachedLines;
    const wrapped: string[] = [];
    for (const line of this.sourceLines) {
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
    const footer = `↑↓/PgUp/PgDn scroll • Esc close • ${this.scroll + 1}-${Math.min(this.scroll + contentHeight, all.length)}/${all.length}`;
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
    if (matchesKey(data, Key.up)) this.scroll = Math.max(0, this.scroll - 1);
    else if (matchesKey(data, Key.down)) this.scroll += 1;
    else if (matchesKey(data, Key.pageUp)) this.scroll = Math.max(0, this.scroll - page);
    else if (matchesKey(data, Key.pageDown)) this.scroll += page;
    else if (matchesKey(data, Key.home)) this.scroll = 0;
    else if (matchesKey(data, Key.end)) this.scroll = Number.MAX_SAFE_INTEGER;
    this.cachedWidth = undefined;
  }

  invalidate(): void {
    this.cachedWidth = undefined;
    this.cachedLines = undefined;
  }
}
