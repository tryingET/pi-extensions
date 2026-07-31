import type { ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import { Key, matchesKey, truncateToWidth } from "@earendil-works/pi-tui";
import { MODE_SELECTION_MAX_OVERLAYS, type ModeSelection, type ResolvedMode } from "./modes.ts";

const MAX_VISIBLE_SELECTOR_ROWS = 18;

interface SelectorRow {
  kind: "base" | "overlay" | "apply" | "cancel";
  key?: string;
  label: string;
}

interface PendingConfirmation {
  message: string;
  accept(): void;
}

export interface ModeSelectorOptions {
  preview?(selection: ModeSelection): readonly string[];
}

/** Decode plain input plus Ghostty/Kitty CSI-u printable key presses without host-internal imports. */
function printableInput(data: string): string | undefined {
  if (Array.from(data).length === 1 && !/[\p{Cc}]/u.test(data)) return data;
  const escapePrefix = `${String.fromCharCode(27)}[`;
  if (!data.startsWith(escapePrefix)) return undefined;
  const match = /^(\d+)(?:;(\d+))?u$/u.exec(data.slice(escapePrefix.length));
  if (!match) return undefined;
  const modifier = Number(match[2] ?? "1");
  if (modifier !== 1 && modifier !== 2) return undefined;
  const codePoint = Number(match[1]);
  if (!Number.isSafeInteger(codePoint) || codePoint < 32 || codePoint > 0x10ffff) return undefined;
  return String.fromCodePoint(codePoint);
}

export async function selectModeComposition(
  ctx: ExtensionCommandContext,
  modes: readonly ResolvedMode[],
  initial: ModeSelection,
  options: ModeSelectorOptions = {},
): Promise<ModeSelection | null> {
  if (ctx.mode !== "tui") return null;
  return ctx.ui.custom<ModeSelection | null>((tui, theme, keybindings, done) => {
    const byKey = new Map(modes.map((mode) => [mode.key, mode]));
    const bases = modes.filter((mode) => mode.promptStrategy !== "append");
    const overlays = modes.filter((mode) => mode.promptStrategy === "append");
    const draft: ModeSelection = {
      baseKey: initial.baseKey,
      overlayKeys: [...initial.overlayKeys],
    };
    let selectedIndex = 0;
    let pending: PendingConfirmation | undefined;
    let notice: string | undefined;
    let filter = "";
    let cachedWidth: number | undefined;
    let cachedLines: string[] | undefined;

    function matchesFilter(mode: ResolvedMode): boolean {
      if (!filter) return true;
      const haystack =
        `${mode.key} ${mode.label} ${mode.description ?? ""} ${mode.promptStrategy} ${mode.scope}`.toLowerCase();
      return haystack.includes(filter);
    }

    function rows(): SelectorRow[] {
      const baseRows: SelectorRow[] = [
        ...(!filter || "native host".includes(filter)
          ? [{ kind: "base" as const, label: "Native host" }]
          : []),
        ...bases.filter(matchesFilter).map((mode) => ({
          kind: "base" as const,
          key: mode.key,
          label: `${mode.label} [${mode.promptStrategy}/${mode.scope}]`,
        })),
      ];
      const overlayRows: SelectorRow[] = overlays.filter(matchesFilter).map((mode) => ({
        kind: "overlay" as const,
        key: mode.key,
        label: `${mode.label} [append/${mode.scope}]`,
      }));
      return [
        ...baseRows,
        ...overlayRows,
        { kind: "apply", label: "Apply" },
        { kind: "cancel", label: "Cancel" },
      ];
    }

    function refresh(): void {
      cachedWidth = undefined;
      cachedLines = undefined;
      const count = rows().length;
      selectedIndex = Math.max(0, Math.min(selectedIndex, count - 1));
      tui.requestRender();
    }

    function moveOverlay(key: string, delta: -1 | 1): void {
      const index = draft.overlayKeys.indexOf(key);
      const target = index + delta;
      if (index < 0 || target < 0 || target >= draft.overlayKeys.length) return;
      const next = [...draft.overlayKeys];
      const currentValue = next[index];
      const targetValue = next[target];
      if (!currentValue || !targetValue) return;
      next[index] = targetValue;
      next[target] = currentValue;
      draft.overlayKeys = next;
      refresh();
    }

    function activate(row: SelectorRow): void {
      if (row.kind === "apply") {
        done({ baseKey: draft.baseKey, overlayKeys: [...draft.overlayKeys] });
        return;
      }
      if (row.kind === "cancel") {
        done(null);
        return;
      }
      if (row.kind === "base") {
        const next = row.key ? byKey.get(row.key) : undefined;
        draft.baseKey = row.key ?? null;
        if (next?.promptStrategy === "replace_final") {
          const count = draft.overlayKeys.length;
          draft.overlayKeys = [];
          notice =
            count > 0
              ? `Exact-final clears ${count} overlay(s) and requires confirmation on Apply.`
              : "Exact-final removes the host envelope and requires confirmation on Apply.";
        }
        refresh();
        return;
      }
      if (!row.key) return;
      const selectedAt = draft.overlayKeys.indexOf(row.key);
      if (selectedAt >= 0) {
        draft.overlayKeys.splice(selectedAt, 1);
        refresh();
        return;
      }
      const base = draft.baseKey ? byKey.get(draft.baseKey) : undefined;
      if (base?.promptStrategy === "replace_final") {
        const overlayKey = row.key;
        pending = {
          message: `Adding ${row.label} requires switching the base to Native host. Continue?`,
          accept: () => {
            draft.baseKey = null;
            draft.overlayKeys.push(overlayKey);
          },
        };
      } else if (draft.overlayKeys.length >= MODE_SELECTION_MAX_OVERLAYS) {
        notice = `A composition supports at most ${MODE_SELECTION_MAX_OVERLAYS} overlays.`;
      } else {
        draft.overlayKeys.push(row.key);
      }
      refresh();
    }

    function handleInput(data: string): void {
      if (pending) {
        if (matchesKey(data, "y")) {
          const accepted = pending;
          pending = undefined;
          accepted.accept();
          refresh();
        } else if (matchesKey(data, "n") || keybindings.matches(data, "tui.select.cancel")) {
          pending = undefined;
          refresh();
        }
        return;
      }
      const currentRows = rows();
      notice = undefined;
      if (keybindings.matches(data, "tui.select.cancel")) {
        done(null);
        return;
      }
      if (keybindings.matches(data, "tui.select.up")) {
        selectedIndex = selectedIndex === 0 ? currentRows.length - 1 : selectedIndex - 1;
        refresh();
        return;
      }
      if (keybindings.matches(data, "tui.select.down")) {
        selectedIndex = selectedIndex === currentRows.length - 1 ? 0 : selectedIndex + 1;
        refresh();
        return;
      }
      if (matchesKey(data, Key.alt("up")) || matchesKey(data, Key.alt("down"))) {
        const row = currentRows[selectedIndex];
        if (row?.kind === "overlay" && row.key) {
          moveOverlay(row.key, matchesKey(data, Key.alt("up")) ? -1 : 1);
        }
        return;
      }
      if (keybindings.matches(data, "tui.select.confirm") || matchesKey(data, Key.space)) {
        const row = currentRows[selectedIndex];
        if (row) activate(row);
        return;
      }
      if (matchesKey(data, Key.backspace)) {
        filter = filter.slice(0, -1);
        selectedIndex = 0;
        refresh();
        return;
      }
      if (matchesKey(data, Key.ctrl("u"))) {
        filter = "";
        selectedIndex = 0;
        refresh();
        return;
      }
      const printable = printableInput(data);
      if (printable && /^[\p{L}\p{N} _-]$/u.test(printable)) {
        filter += printable.toLowerCase();
        selectedIndex = 0;
        refresh();
      }
    }

    function render(width: number): string[] {
      const safeWidth = Math.max(1, width);
      if (cachedLines && cachedWidth === safeWidth) return cachedLines;
      const currentRows = rows();
      const lines: string[] = [];
      const add = (line = "") => lines.push(truncateToWidth(line, safeWidth));
      const renderRow = (text: string, index: number) => {
        const selected = index === selectedIndex;
        const line = `${selected ? "→ " : "  "}${text}`;
        return selected ? theme.bg("selectedBg", theme.fg("text", line)) : theme.fg("text", line);
      };

      add(theme.fg("accent", theme.bold("Prompt mode composition")));
      add(
        theme.fg(
          "dim",
          `filter: ${filter || "(type to search)"} · ${bases.length} bases · ${overlays.length} overlays`,
        ),
      );
      add();
      const maxStart = Math.max(0, currentRows.length - MAX_VISIBLE_SELECTOR_ROWS);
      const windowStart = Math.min(
        maxStart,
        Math.max(0, selectedIndex - Math.floor(MAX_VISIBLE_SELECTOR_ROWS / 2)),
      );
      const windowEnd = Math.min(currentRows.length, windowStart + MAX_VISIBLE_SELECTOR_ROWS);
      add(theme.fg("muted", `Choices ${windowStart + 1}-${windowEnd} of ${currentRows.length}`));
      for (let index = windowStart; index < windowEnd; index++) {
        const row = currentRows[index];
        if (!row) continue;
        if (row.kind === "base") {
          const active = draft.baseKey === (row.key ?? null);
          add(renderRow(`${active ? "(●)" : "( )"} Base · ${row.label}`, index));
        } else if (row.kind === "overlay") {
          const ordinal = row.key ? draft.overlayKeys.indexOf(row.key) : -1;
          add(
            renderRow(`${ordinal >= 0 ? `[${ordinal + 1}]` : "[ ]"} Overlay · ${row.label}`, index),
          );
        } else {
          add(renderRow(row.label, index));
        }
      }

      const selectedRow = currentRows[selectedIndex];
      const selectedMode = selectedRow?.key ? byKey.get(selectedRow.key) : undefined;
      add();
      add(theme.fg("muted", "Details / live composition diff"));
      if (selectedMode) {
        add(
          theme.fg("text", `${selectedMode.key}: ${selectedMode.description ?? "No description"}`),
        );
        add(theme.fg("dim", `source: ${selectedMode.path ?? "built-in"}`));
        const contracts = [
          selectedMode.requires?.length ? `requires=${selectedMode.requires.join(",")}` : "",
          selectedMode.conflictsWith?.length
            ? `conflicts=${selectedMode.conflictsWith.join(",")}`
            : "",
          selectedMode.before?.length ? `before=${selectedMode.before.join(",")}` : "",
          selectedMode.after?.length ? `after=${selectedMode.after.join(",")}` : "",
        ].filter(Boolean);
        if (contracts.length > 0) add(theme.fg("warning", contracts.join(" · ")));
      }
      for (const line of options.preview?.(draft).slice(0, 6) ?? []) add(theme.fg("dim", line));
      add();
      if (pending) {
        add(theme.fg("warning", pending.message));
        add(theme.fg("dim", "Press y to confirm, n/Esc to decline"));
      } else {
        if (notice) add(theme.fg("warning", notice));
        add(
          theme.fg(
            "dim",
            "type filter · Ctrl+U clear · ↑↓ navigate · Enter/Space select · Alt+↑↓ reorder · Esc cancel",
          ),
        );
      }
      cachedWidth = safeWidth;
      cachedLines = lines;
      return lines;
    }

    return {
      render,
      invalidate: () => {
        cachedWidth = undefined;
        cachedLines = undefined;
      },
      handleInput,
    };
  });
}
