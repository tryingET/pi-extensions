import { basename } from "node:path";
import type { AppKeybinding, KeybindingsManager, Theme } from "@mariozechner/pi-coding-agent";
import * as PiCodingAgent from "@mariozechner/pi-coding-agent";
import { matchesKey, type TUI, truncateToWidth } from "@mariozechner/pi-tui";
import type { ContextSnapshot } from "./types.js";

/** @typedef {AppKeybinding|"tui.select.cancel"|"app.tools.expand"} OverlayBinding */

/** @param {KeybindingsManager} keybindings @param {string} data @param {OverlayBinding} binding */
function matchesBinding(keybindings, data, binding) {
  try {
    return keybindings.matches(data, binding);
  } catch {
    return false;
  }
}

/** @param {OverlayBinding} binding @param {string} description */
function keyHint(binding, description) {
  return PiCodingAgent.keyHint(binding, description);
}

type FocusPane = "groups" | "items";

const BODY_ROWS = 16;
const ITEM_LIST_ROWS = 8;
const PREVIEW_ROWS = 5;

export class ContextOverlayComponent {
  private selectedGroup = 0;
  private selectedItem = 0;
  private frozen = false;
  private focusPane: FocusPane = "groups";

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

    if (this.focusPane === "items" && matchesKey(data, "enter")) {
      this.openSelectedItem();
      return;
    }

    if (matchesKey(data, "left")) {
      this.focusPane = "groups";
      this.tui.requestRender();
      return;
    }
    if (matchesKey(data, "right")) {
      this.focusPane = "items";
      this.tui.requestRender();
      return;
    }

    if (matchesKey(data, "up")) {
      if (this.focusPane === "groups") this.selectedGroup -= 1;
      else this.selectedItem -= 1;
      this.clamp();
      this.tui.requestRender();
      return;
    }

    if (matchesKey(data, "down")) {
      if (this.focusPane === "groups") this.selectedGroup += 1;
      else this.selectedItem += 1;
      this.clamp();
      this.tui.requestRender();
    }
  }

  render(width: number): string[] {
    const inner = Math.max(20, width - 2);
    const leftW = Math.max(28, Math.floor(inner * 0.42));
    const rightW = Math.max(20, inner - leftW - 3);

    const lines: string[] = [];
    const border = (s: string) => this.theme.fg("border", s);

    const header = this.buildHeader(inner);
    lines.push(border(`╭${"─".repeat(inner)}╮`));
    lines.push(border("│") + truncateToWidth(header, inner, "...", true) + border("│"));
    lines.push(border("├") + border("─".repeat(inner)) + border("┤"));

    const groups = this.snapshot.groups;
    const group = groups[this.selectedGroup];
    const items = group?.items ?? [];
    const left = this.renderGroups(leftW);
    const right = this.renderItems(items, rightW);

    const rows = BODY_ROWS;
    for (let i = 0; i < rows; i++) {
      const l = truncateToWidth(left[i] ?? "", leftW, "...", true);
      const r = truncateToWidth(right[i] ?? "", rightW, "...", true);
      const sep = this.theme.fg("dim", " │ ");
      const body = `${l.padEnd(leftW)}${sep}${r.padEnd(rightW)}`;
      lines.push(border("│") + truncateToWidth(body, inner, "...", true) + border("│"));
    }

    lines.push(border("├") + border("─".repeat(inner)) + border("┤"));
    lines.push(border("│") + truncateToWidth(this.buildFooter(), inner, "...", true) + border("│"));
    lines.push(border(`╰${"─".repeat(inner)}╯`));

    return lines;
  }

  invalidate(): void {}
  dispose(): void {}

  private buildHeader(innerW: number): string {
    const usage = this.snapshot.usage;
    const mode = this.frozen
      ? this.theme.fg("warning", "FROZEN")
      : this.theme.fg("success", "LIVE");
    const usageText = usage
      ? `${usage.tokens}/${usage.contextWindow} (${usage.percent.toFixed(1)}%)`
      : `~${this.snapshot.totalEstimatedTokens} est`;
    const title = `${this.theme.fg("accent", "Context Inspector")} • ${mode} • ${usageText} • ${this.snapshot.modelLabel}`;
    return truncateToWidth(title, innerW, "...", true);
  }

  private buildFooter(): string {
    const close = keyHint("tui.select.cancel", "close");
    const toggle = keyHint("app.tools.expand", "freeze/live");
    return this.theme.fg(
      "dim",
      `${close} • ${toggle} • ←/→ pane • ↑/↓ select • Enter open file • ${this.focusPane.toUpperCase()}`,
    );
  }

  private renderGroups(width: number): string[] {
    const out: string[] = [this.theme.fg("accent", "Groups")];
    for (let i = 0; i < this.snapshot.groups.length; i++) {
      const g = this.snapshot.groups[i];
      if (!g) continue;
      const selected = i === this.selectedGroup && this.focusPane === "groups";
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
      const selected = i === this.selectedItem && this.focusPane === "items";
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
  }
}
