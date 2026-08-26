// ---
// summary: "Renders and controls the keyboard-navigable context inspector overlay with grouped items and previews."
// read_when:
//   - "Changing context overlay layout, navigation, rendering, freezing, or file-opening interaction."
// ---
import { basename } from "node:path";
import type { AppKeybinding, KeybindingsManager, Theme } from "@earendil-works/pi-coding-agent";
import * as PiCodingAgent from "@earendil-works/pi-coding-agent";
import { matchesKey, type TUI, truncateToWidth } from "@earendil-works/pi-tui";
import {
  buildIcicleView,
  cursorFromSelection,
  type IcicleCursor,
  type IcicleMove,
  INITIAL_ICICLE_CURSOR,
  layoutIcicleRows,
  layoutOccupancyBar,
  moveIcicleCursor,
} from "./icicle-layout.js";
import type { ContextSnapshot } from "./types.js";

type OverlayBinding = AppKeybinding | "tui.select.cancel" | "app.tools.expand";
type ViewMode = "groups" | "items" | "icicle";

function matchesBinding(
  keybindings: KeybindingsManager,
  data: string,
  binding: OverlayBinding,
): boolean {
  try {
    return keybindings.matches(data, binding);
  } catch {
    return false;
  }
}

function keyHint(binding: OverlayBinding, description: string): string {
  return PiCodingAgent.keyHint(binding, description);
}

const BODY_ROWS = 16;
const ITEM_LIST_ROWS = 8;
const PREVIEW_ROWS = 5;
const ICICLE_PREFIX = 5;
const DEPTH_LABELS = ["cat ", "file", "item"] as const;

export class ContextOverlayComponent {
  private selectedGroup = 0;
  private selectedItem = 0;
  private frozen = false;
  private viewMode: ViewMode = "groups";
  private icicleCursor: IcicleCursor = INITIAL_ICICLE_CURSOR;

  constructor(
    private tui: TUI,
    private theme: Theme,
    private keybindings: KeybindingsManager,
    private snapshot: ContextSnapshot,
    private done: () => void,
    private openPath: (path: string) => Promise<boolean>,
    private notify: (message: string, level?: "info" | "warning" | "error") => void,
  ) {}

  setSnapshot(snapshot: ContextSnapshot): void {
    if (this.frozen) return;
    this.snapshot = snapshot;
    this.clamp();
    this.tui.requestRender();
  }

  handleInput(data: string): void {
    if (
      matchesBinding(this.keybindings, data, "tui.select.cancel") ||
      matchesBinding(this.keybindings, data, "app.interrupt")
    ) {
      this.done();
      return;
    }

    if (matchesBinding(this.keybindings, data, "app.tools.expand")) {
      this.frozen = !this.frozen;
      this.tui.requestRender();
      return;
    }

    if (matchesKey(data, "tab") || matchesKey(data, "i") || matchesKey(data, "g")) {
      const toIcicle =
        matchesKey(data, "i") || (matchesKey(data, "tab") && this.viewMode !== "icicle");
      if (toIcicle) this.enterIcicle();
      else this.viewMode = "groups";
      this.tui.requestRender();
      return;
    }

    if (matchesKey(data, "enter")) {
      if (this.viewMode === "items" || this.viewMode === "icicle") this.openSelectedItem();
      return;
    }

    if (this.viewMode === "icicle") {
      if (matchesKey(data, "left")) this.moveIcicle("left");
      else if (matchesKey(data, "right")) this.moveIcicle("right");
      else if (matchesKey(data, "up")) this.moveIcicle("up");
      else if (matchesKey(data, "down")) this.moveIcicle("down");
      return;
    }

    if (matchesKey(data, "left")) {
      this.viewMode = "groups";
      this.tui.requestRender();
      return;
    }
    if (matchesKey(data, "right")) {
      this.viewMode = "items";
      this.tui.requestRender();
      return;
    }

    if (matchesKey(data, "up")) {
      if (this.viewMode === "groups") this.selectedGroup -= 1;
      else this.selectedItem -= 1;
      this.clamp();
      this.tui.requestRender();
      return;
    }

    if (matchesKey(data, "down")) {
      if (this.viewMode === "groups") this.selectedGroup += 1;
      else this.selectedItem += 1;
      this.clamp();
      this.tui.requestRender();
    }
  }

  render(width: number): string[] {
    if (!Number.isFinite(width) || width <= 0) {
      return [];
    }

    if (width < 3) {
      return [this.buildHeader(width)];
    }

    const inner = width - 2;
    const sepWidth = 3;
    const leftW = Math.max(
      1,
      Math.min(Math.max(12, Math.floor(inner * 0.42)), Math.max(1, inner - sepWidth - 1)),
    );
    const rightW = Math.max(1, inner - leftW - sepWidth);

    const lines: string[] = [];
    const border = (s: string) => this.theme.fg("border", s);

    lines.push(border(`╭${"─".repeat(inner)}╮`));
    lines.push(
      border("│") + truncateToWidth(this.buildHeader(inner), inner, "...", true) + border("│"),
    );
    const occupancy = this.buildOccupancyStrip(inner);
    if (occupancy) {
      lines.push(border("│") + truncateToWidth(occupancy, inner, "...", true) + border("│"));
    }
    lines.push(border("├") + border("─".repeat(inner)) + border("┤"));

    const groups = this.snapshot.groups;
    const group = groups[this.selectedGroup];
    const items = group?.items ?? [];

    if (this.viewMode === "icicle") {
      const icicle = this.renderIcicle(inner);
      const itemLines = this.renderItems(items, inner);
      const icicleRows = Math.min(icicle.length, 6);
      for (let i = 0; i < BODY_ROWS; i++) {
        const line = i < icicleRows ? (icicle[i] ?? "") : (itemLines[i - icicleRows] ?? "");
        lines.push(border("│") + truncateToWidth(line, inner, "...", true) + border("│"));
      }
    } else {
      const left = this.renderGroups(leftW);
      const right = this.renderItems(items, rightW);
      for (let i = 0; i < BODY_ROWS; i++) {
        const l = truncateToWidth(left[i] ?? "", leftW, "...", true);
        const r = truncateToWidth(right[i] ?? "", rightW, "...", true);
        const sep = this.theme.fg("dim", " │ ");
        const body = `${l.padEnd(leftW)}${sep}${r.padEnd(rightW)}`;
        lines.push(border("│") + truncateToWidth(body, inner, "...", true) + border("│"));
      }
    }

    lines.push(border("├") + border("─".repeat(inner)) + border("┤"));
    lines.push(border("│") + truncateToWidth(this.buildFooter(), inner, "...", true) + border("│"));
    lines.push(border(`╰${"─".repeat(inner)}╯`));

    return lines;
  }

  invalidate(): void {}
  dispose(): void {}

  private enterIcicle(): void {
    this.viewMode = "icicle";
    this.icicleCursor = cursorFromSelection(
      this.snapshot.groups,
      this.selectedGroup,
      this.selectedItem,
    );
    this.syncIcicleSelection();
  }

  private moveIcicle(action: IcicleMove): void {
    this.icicleCursor = moveIcicleCursor(this.snapshot.groups, this.icicleCursor, action);
    this.syncIcicleSelection();
    this.tui.requestRender();
  }

  private syncIcicleSelection(): void {
    const view = buildIcicleView(this.snapshot.groups, this.icicleCursor);
    this.icicleCursor = view.cursor;
    this.selectedGroup = view.selectedGroup;
    this.selectedItem = view.selectedItem;
  }

  private buildHeader(innerW: number): string {
    const usage = this.snapshot.usage;
    const mode = this.frozen
      ? this.theme.fg("warning", "FROZEN")
      : this.theme.fg("success", "LIVE");
    const usagePercent = usage?.percent;
    const tokenText = usage?.tokens == null ? "?" : String(usage.tokens);
    const usageText = usage
      ? `${tokenText}/${usage.contextWindow} (${usagePercent == null ? "?" : usagePercent.toFixed(1)}%)`
      : `~${this.snapshot.totalEstimatedTokens} est`;
    const title = `${this.theme.fg("accent", "Context Inspector")} • ${mode} • ${usageText} • ${this.snapshot.modelLabel}`;
    return truncateToWidth(title, innerW, "...", true);
  }

  private buildOccupancyStrip(innerW: number): string | undefined {
    const usage = this.snapshot.usage;
    if (!usage) return undefined;
    const barW = Math.max(4, Math.min(24, innerW - 22));
    const layout = layoutOccupancyBar(usage.tokens, usage.contextWindow, barW);
    const bar = layout.known
      ? this.theme.fg("success", "█".repeat(layout.filled)) +
        this.theme.fg("dim", "░".repeat(layout.empty))
      : this.theme.fg("dim", "░".repeat(barW));
    const label = layout.known ? "occupancy measured" : "occupancy unknown";
    return `${bar} ${this.theme.fg("dim", label)}`;
  }

  private buildFooter(): string {
    const close = keyHint("tui.select.cancel", "close");
    const toggle = keyHint("app.tools.expand", "freeze/live");
    const nav = this.viewMode === "icicle" ? "←/→ frame • ↑/↓ depth" : "←/→ pane • ↑/↓ select";
    return this.theme.fg(
      "dim",
      `${close} • ${toggle} • ${this.viewMode.toUpperCase()} • Tab/g/i view • ${nav} • Enter open file`,
    );
  }

  private renderIcicle(width: number): string[] {
    const view = buildIcicleView(this.snapshot.groups, this.icicleCursor);
    this.icicleCursor = view.cursor;
    const usageTokens = this.snapshot.usage?.tokens ?? undefined;
    const measured = usageTokens != null && usageTokens > 0 ? usageTokens : undefined;
    const barW = Math.max(0, width - ICICLE_PREFIX);
    const rows = layoutIcicleRows(view, barW, measured);
    const out: string[] = [this.theme.fg("accent", "Icicle  cat → file → item")];
    for (let depth = 0; depth < 3; depth++) {
      const row = rows[depth];
      const frames = view.levels[depth] ?? [];
      if (!row) {
        out.push("");
        continue;
      }
      const selected = view.cursor.depth === depth;
      let line = selected ? this.theme.fg("accent", "▸") : " ";
      line += this.theme.fg(selected ? "accent" : "dim", DEPTH_LABELS[depth] ?? "    ");
      line += " ".repeat(Math.max(0, row.offset));
      for (let i = 0; i < frames.length; i++) {
        const n = row.cells[i] ?? 0;
        if (n <= 0) continue;
        const isSel = selected && i === row.selectedIndex;
        line += this.theme.fg(isSel ? "accent" : "muted", (isSel ? "█" : "▀").repeat(n));
      }
      out.push(line);
    }
    const frame = view.levels[view.cursor.depth]?.[view.cursor.indexByDepth[view.cursor.depth]];
    const caption = frame
      ? `${frame.label} (t:${frame.tokens}${frame.itemCount > 1 ? `, n:${frame.itemCount}` : ""})`
      : "empty";
    out.push(this.theme.fg("dim", caption));
    return out;
  }

  private renderGroups(width: number): string[] {
    const out: string[] = [this.theme.fg("accent", "Groups")];
    for (let i = 0; i < this.snapshot.groups.length; i++) {
      const g = this.snapshot.groups[i];
      if (!g) continue;
      const selected = i === this.selectedGroup && this.viewMode === "groups";
      const prefix = selected ? this.theme.fg("accent", "▶ ") : "  ";
      const text = `${g.label} (${g.tokens}, ${g.percent.toFixed(1)}%)`;
      out.push(prefix + truncateToWidth(text, width - 2, "...", true));
    }
    return out;
  }

  private renderItems(items: ContextSnapshot["groups"][number]["items"], width: number): string[] {
    const out: string[] = [];
    const group = this.snapshot.groups[this.selectedGroup];
    out.push(this.theme.fg("accent", group ? `${group.label} items` : "Items"));

    if (items.length === 0) {
      out.push(this.theme.fg("dim", "0/0"));
      for (let i = 0; i < ITEM_LIST_ROWS + 1 + PREVIEW_ROWS; i++) out.push("");
      return out;
    }

    const half = Math.floor(ITEM_LIST_ROWS / 2);
    let start = this.selectedItem - half;
    start = Math.max(0, start);
    start = Math.min(start, Math.max(0, items.length - ITEM_LIST_ROWS));
    const end = Math.min(items.length, start + ITEM_LIST_ROWS);

    const scrollInfo = `${start + 1}-${end}/${items.length}`;
    out.push(this.theme.fg("dim", scrollInfo));

    const item = items[this.selectedItem];
    for (let i = start; i < end; i++) {
      const it = items[i];
      if (!it) continue;
      const selected = i === this.selectedItem && this.viewMode !== "groups";
      const prefix = selected ? this.theme.fg("accent", "▶ ") : "  ";
      const fileName = it.path ? basename(it.path) : undefined;
      const rowText = fileName
        ? `${fileName} ← ${it.label} (t:${it.tokens})`
        : `${it.label} (t:${it.tokens})`;
      out.push(prefix + truncateToWidth(rowText, width - 2, "...", true));
    }
    for (let i = end; i < start + ITEM_LIST_ROWS; i++) {
      out.push("");
    }

    out.push(this.theme.fg("muted", "Preview"));
    if (!item) {
      for (let i = 0; i < PREVIEW_ROWS; i++) out.push("");
      return out;
    }

    const previewLines: string[] = [];
    if (item.path) {
      previewLines.push(this.theme.fg("dim", item.path));
    }
    previewLines.push(...item.preview.split("\n").filter((line) => line.length > 0));

    for (let i = 0; i < PREVIEW_ROWS; i++) {
      out.push(truncateToWidth(previewLines[i] ?? "", width, "...", true));
    }

    return out;
  }

  private openSelectedItem(): void {
    const items = this.snapshot.groups[this.selectedGroup]?.items ?? [];
    const item = items[this.selectedItem];
    if (!item) return;
    if (!item.path) {
      this.notify("Selected item has no file path", "warning");
      return;
    }
    void this.openPath(item.path).then((opened) => {
      if (opened) {
        this.done();
      }
    });
  }

  private clamp(): void {
    const maxGroup = Math.max(0, this.snapshot.groups.length - 1);
    this.selectedGroup = Math.min(Math.max(0, this.selectedGroup), maxGroup);

    const items = this.snapshot.groups[this.selectedGroup]?.items ?? [];
    const maxItem = Math.max(0, items.length - 1);
    this.selectedItem = Math.min(Math.max(0, this.selectedItem), maxItem);

    if (this.viewMode === "icicle") this.syncIcicleSelection();
  }
}
