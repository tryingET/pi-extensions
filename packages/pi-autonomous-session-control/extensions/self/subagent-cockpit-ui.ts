import type { KeybindingsManager, Theme } from "@earendil-works/pi-coding-agent";
import {
  type Component,
  Editor,
  type Focusable,
  matchesKey,
  ScrollView,
  SelectList,
  type TUI,
  truncateToWidth,
} from "@earendil-works/pi-tui";
import type { SubagentCockpitSnapshot } from "./subagent-cockpit-data.ts";
import {
  attemptKey,
  type CockpitFilter,
  type CockpitSource,
  type CockpitTarget,
  cockpitText,
} from "./subagent-cockpit-ui-control.ts";
import { buildCockpitTimeline, prepareCockpitSnapshot } from "./subagent-cockpit-ui-timeline.ts";
import type { SubagentDashboardRow } from "./subagent-dashboard-data.ts";

type Surface = "children" | "timeline" | "draft";
type CockpitHost = TUI;
const DRAFT_LIMIT = 4000;
const DRAFT_COUNT_LIMIT = 128;

export class SubagentCockpitUI implements Component, Focusable {
  private hasFocus = false;
  private surface: Surface = "children";
  private picker!: SelectList;
  private confirmation?: { target: CockpitTarget; picker: SelectList };
  private readonly input: Editor;
  private readonly scroll: ScrollView;
  private timer?: ReturnType<typeof setInterval>;
  private disposed = false;
  private rows: SubagentDashboardRow[] = [];
  private name?: string;
  private snapshot?: SubagentCockpitSnapshot;
  private selectedEvent = 0;
  private expanded = new Set<string>();
  private notice = "";
  private cache?: { width: number; lines: string[]; offsets: number[] };
  private revealSelection = true;
  private follow = true;
  private readonly host: CockpitHost;
  private readonly theme: Pick<Theme, "fg">;
  private readonly source: CockpitSource;
  private readonly done: () => void;
  private readonly filter: CockpitFilter;
  private readonly drafts: Map<string, string>;
  private draftKey?: string;
  private readonly keybindings?: KeybindingsManager;

  constructor(
    host: CockpitHost,
    theme: Pick<Theme, "fg">,
    source: CockpitSource,
    done: () => void,
    filter: CockpitFilter = "all",
    selectedName?: string,
    drafts = new Map<string, string>(),
    keybindings?: KeybindingsManager,
  ) {
    this.host = host;
    this.theme = theme;
    this.source = source;
    this.done = done;
    this.filter = filter;
    this.drafts = drafts;
    this.keybindings = keybindings;
    this.input = new Editor(host, {
      borderColor: (text) => this.theme.fg("border", text),
      selectList: this.listTheme(),
    });
    this.input.disableSubmit = true;
    this.picker = new SelectList([], 3, this.listTheme());
    this.name = selectedName;
    this.scroll = new ScrollView(
      { render: (width) => this.timeline(width).lines, invalidate: () => {} },
      {
        follow: "end",
        scrollbar: "hidden",
        overscroll: "contain",
      },
    );
    this.refresh();
    this.timer = setInterval(() => this.refresh(), 1000);
    this.timer.unref?.();
  }

  get focused(): boolean {
    return this.hasFocus;
  }
  set focused(value: boolean) {
    this.hasFocus = value;
    this.input.focused = value && this.surface === "draft" && !this.confirmation;
  }

  private saveDraft(): void {
    const key = this.draftKey;
    if (!key) return;
    this.drafts.delete(key);
    this.drafts.set(key, this.input.getExpandedText().slice(0, DRAFT_LIMIT));
    while (this.drafts.size > DRAFT_COUNT_LIMIT) {
      const oldest = this.drafts.keys().next().value;
      if (oldest === undefined) break;
      this.drafts.delete(oldest);
    }
  }

  private listTheme() {
    return {
      selectedPrefix: (s: string) => this.theme.fg("accent", s),
      selectedText: (s: string) => this.theme.fg("accent", s),
      description: (s: string) => this.theme.fg("muted", s),
      scrollInfo: (s: string) => this.theme.fg("dim", s),
      noMatch: (s: string) => this.theme.fg("muted", s),
    };
  }

  private select(name?: string): void {
    this.saveDraft();
    this.name = name;
    this.snapshot = undefined;
    this.draftKey = undefined;
    this.input.setText("");
    this.selectedEvent = 0;
    this.expanded.clear();
    this.follow = true;
    this.scroll.scrollToEnd();
    this.cache = undefined;
    this.readSelected();
  }

  private readSelected(): void {
    if (!this.name) return;
    this.saveDraft();
    const previousKey = this.draftKey;
    const previousId = this.snapshot?.events[this.selectedEvent]?.id;
    const next = this.source.read(this.name);
    if (!this.snapshot && this.notice.startsWith("Unavailable:")) this.notice = "";
    this.snapshot = prepareCockpitSnapshot(next);
    // An unavailable read must not reassign editor text to an unverified attempt.
    const nextKey =
      next.dispatchId && next.attemptId ? attemptKey(next) : (previousKey ?? attemptKey(next));
    if (previousKey !== nextKey) {
      this.draftKey = nextKey;
      this.input.setText(this.drafts.get(nextKey) ?? "");
      this.expanded.clear();
      this.confirmation = undefined;
      this.focused = this.hasFocus;
      this.notice = previousKey ? "Attempt changed; private draft switched. No action taken." : "";
      this.follow = true;
    }
    const ids = new Set(this.snapshot.events.map((event) => event.id));
    for (const id of this.expanded) if (!ids.has(id)) this.expanded.delete(id);
    this.selectedEvent = this.follow
      ? Math.max(0, this.snapshot.events.length - 1)
      : Math.max(
          0,
          this.snapshot.events.findIndex((event) => event.id === previousId),
        );
    this.cache = undefined;
  }

  refresh(): void {
    if (this.disposed) return;
    try {
      this.saveDraft();
      this.rows = this.source
        .rows()
        .filter((row) => this.filter === "all" || row.status === this.filter);
      if (!this.rows.some((row) => row.sessionName === this.name))
        this.select(this.rows[0]?.sessionName);
      this.picker = new SelectList(
        this.rows.map((row) => ({
          value: row.sessionName,
          label: cockpitText(`${row.sessionName} · ${row.status}`, 240).replace(/\s+/g, " "),
        })),
        3,
        this.listTheme(),
      );
      this.picker.setSelectedIndex(
        Math.max(
          0,
          this.rows.findIndex((row) => row.sessionName === this.name),
        ),
      );
      this.picker.onSelectionChange = (item) => {
        this.select(item.value);
        this.invalidate();
      };
      this.picker.onSelect = () => {
        this.surface = "timeline";
        this.focused = this.hasFocus;
      };
      this.readSelected();
    } catch (error) {
      this.snapshot = undefined;
      this.notice = `Unavailable: ${cockpitText(String(error), 240)}`;
      this.cache = undefined;
    }
    this.host.requestRender();
  }

  private send(): void {
    const target = this.snapshot;
    const message = this.input.getExpandedText().trim();
    if (!target?.steeringSupported || target.status !== "running" || !message) {
      this.notice =
        target?.unavailableReason ?? "No live steering endpoint or empty draft; nothing sent.";
      return;
    }
    try {
      const result = this.source.send({ ...target }, message);
      this.notice = result.ok
        ? `${result.status}${result.requestId ? ` · ${result.requestId}` : ""}`
        : (result.error ?? result.status);
      if (result.ok) {
        this.input.setText("");
        this.saveDraft();
      }
      this.readSelected();
    } catch (error) {
      this.notice = `Send failed: ${String(error)}`;
    }
    this.cache = undefined;
  }

  private confirmCancel(): void {
    if (
      !this.snapshot ||
      this.snapshot.status !== "running" ||
      !this.snapshot.attemptId ||
      !this.snapshot.dispatchId
    ) {
      this.notice = "No exact running attempt selected; nothing cancelled.";
      return;
    }
    const target = {
      sessionName: this.snapshot.sessionName,
      dispatchId: this.snapshot.dispatchId,
      attemptId: this.snapshot.attemptId,
    };
    const picker = new SelectList(
      [
        { value: "no", label: "Keep running" },
        { value: "yes", label: "Cancel this exact attempt" },
      ],
      2,
      this.listTheme(),
    );
    picker.onSelect = (item) => {
      this.confirmation = undefined;
      if (item.value === "yes") {
        try {
          const result = this.source.cancel(target);
          this.notice = result.error ?? result.status;
        } catch (error) {
          this.notice = `Cancel failed: ${String(error)}`;
        }
        this.readSelected();
      }
      this.focused = this.hasFocus;
      this.host.requestRender();
    };
    this.confirmation = { target, picker };
    this.focused = this.hasFocus;
  }

  handleInput(data: string): void {
    if (this.disposed) return;
    // Never forward Escape to Pi's main editor / interrupt handler.
    if (matchesKey(data, "escape")) {
      this.close();
      return;
    }
    if (this.confirmation) {
      if (this.host.terminal.rows < 6)
        this.notice = "Resize terminal to confirm; Esc dismisses only.";
      else this.confirmation.picker.handleInput(data);
    } else if (matchesKey(data, "tab") || matchesKey(data, "shift+tab")) {
      const surfaces: Surface[] = ["children", "timeline", "draft"];
      const delta = matchesKey(data, "shift+tab") ? 2 : 1;
      this.surface = surfaces[(surfaces.indexOf(this.surface) + delta) % 3] ?? "children";
      this.focused = this.hasFocus;
    } else if (matchesKey(data, "ctrl+alt+x")) this.confirmCancel();
    else if (this.surface === "draft") {
      if (matchesKey(data, "ctrl+s")) this.send();
      else this.input.handleInput(data); // Enter has no onSubmit: never sends.
      const raw = this.input.getExpandedText();
      const inert = cockpitText(raw, DRAFT_LIMIT);
      if (inert !== raw) this.input.setText(inert);
      this.saveDraft();
    } else if (this.surface === "children") this.picker.handleInput(data);
    else this.timelineInput(data);
    this.cache = undefined;
    this.host.requestRender();
  }

  private timelineInput(data: string): void {
    const events = this.snapshot?.events ?? [];
    const up = this.keybindings?.matches(data, "tui.select.up") ?? matchesKey(data, "up");
    const down = this.keybindings?.matches(data, "tui.select.down") ?? matchesKey(data, "down");
    if (up || down) {
      this.selectedEvent = Math.max(
        0,
        Math.min(events.length - 1, this.selectedEvent + (up ? -1 : 1)),
      );
      this.follow = false;
      this.revealSelection = true;
    } else if (matchesKey(data, "return")) {
      this.follow = false;
      const id = events[this.selectedEvent]?.id;
      if (id) {
        if (this.expanded.has(id)) this.expanded.delete(id);
        else this.expanded.add(id);
      }
      this.revealSelection = true;
    } else if (matchesKey(data, "pageUp") || matchesKey(data, "pageDown")) {
      this.scroll.scrollBy(
        (matchesKey(data, "pageUp") ? -1 : 1) * Math.max(1, this.scroll.viewportHeight - 1),
      );
      this.follow = false;
      this.revealSelection = false;
    } else if (matchesKey(data, "home")) {
      this.scroll.scrollTo(0, { disableFollow: true });
      this.follow = false;
      this.revealSelection = false;
    } else if (matchesKey(data, "end")) {
      this.scroll.scrollToEnd();
      this.follow = true;
      this.selectedEvent = Math.max(0, events.length - 1);
    }
  }

  private timeline(width: number): { lines: string[]; offsets: number[] } {
    if (this.cache?.width === width) return this.cache;
    this.cache = {
      width,
      ...buildCockpitTimeline(this.snapshot, width, this.selectedEvent, this.expanded, this.theme),
    };
    return this.cache;
  }

  render(width: number): string[] {
    if (!Number.isFinite(width) || width <= 0 || this.disposed) return [];
    const height = Math.max(1, Math.floor(this.host.terminal.rows * 0.85));
    const fit = (s: string) => truncateToWidth(s, width, "…");
    if (this.confirmation) {
      return [
        fit(
          this.theme.fg(
            "warning",
            `Cancel ${cockpitText(this.confirmation.target.sessionName, 160).replace(/\s+/g, " ")}?`,
          ),
        ),
        ...this.confirmation.picker.render(width).map(fit),
        fit(
          this.theme.fg(
            "muted",
            this.host.terminal.rows < 6
              ? "Resize terminal to confirm; Esc dismisses only."
              : "Exact attempt and current parent/repository rechecked before cancellation.",
          ),
        ),
        fit(this.theme.fg("dim", "↑↓ choose · Enter confirm · Esc dismiss only")),
      ].slice(0, height);
    }
    const label = (surface: Surface, text: string) =>
      this.theme.fg(this.surface === surface ? "accent" : "dim", text);
    const lines = [
      fit(this.theme.fg("accent", `Subagents · ${this.filter} · ${this.rows.length}`)),
      fit(label("children", "Children  ↑↓ select · Enter timeline")),
    ];
    lines.push(...this.picker.render(width));
    const snapshot = this.snapshot;
    if (snapshot) {
      lines.push(
        fit(
          cockpitText(
            `${snapshot.status} · ${snapshot.profile ?? ""} ${snapshot.model ?? ""}${snapshot.elapsedMs !== undefined ? ` · ${Math.floor(snapshot.elapsedMs / 1000)}s` : ""}${snapshot.latestTool ? ` · ${snapshot.latestTool}` : ""}`,
            400,
          ).replace(/\s+/g, " "),
        ),
      );
      if (snapshot.objective)
        lines.push(
          fit(this.theme.fg("muted", cockpitText(snapshot.objective, 600).replace(/\s+/g, " "))),
        );
    }
    lines.push(
      fit(
        label(
          "timeline",
          `Timeline · ${this.follow ? "LIVE" : "paused scroll"} · ↑↓ event · Enter expand · PgUp/PgDn · End live`,
        ),
      ),
    );
    const tail = [
      fit(
        label(
          "draft",
          snapshot?.steeringSupported && snapshot.status === "running"
            ? "Private draft · Shift+Enter newline · Ctrl+S send (Enter never sends)"
            : `Read-only · ${cockpitText(snapshot?.unavailableReason ?? "steering unavailable", 240).replace(/\s+/g, " ")}`,
        ),
      ),
      // Pi 1.1 Editor recurses on wide graphemes at a one-column layout width.
      ...this.input.render(Math.max(3, width)).map(fit),
      fit(
        this.theme.fg(
          "muted",
          cockpitText(
            this.notice || "Delivery = injected into context, not compliance.",
            600,
          ).replace(/\s+/g, " "),
        ),
      ),
      fit(this.theme.fg("dim", "Tab focus · Ctrl+Alt+X cancel (confirm) · Esc dismiss only")),
    ];
    const viewport = Math.max(1, height - lines.length - tail.length);
    const timeline = this.timeline(width);
    this.scroll.updateLayout(timeline.lines.length, viewport, () => this.host.requestRender());
    if (this.follow) this.scroll.scrollToEnd();
    else if (this.revealSelection) {
      const offset = timeline.offsets[this.selectedEvent] ?? 0;
      if (offset < this.scroll.scrollTop || offset >= this.scroll.scrollTop + viewport)
        this.scroll.scrollTo(offset, { disableFollow: true });
    }
    this.revealSelection = false;
    // ScrollView.render returns all child lines. The opaque overlay host invokes
    // our render directly (no layout-node traversal), so clip this viewport once.
    const view = this.scroll
      .render(width)
      .slice(this.scroll.scrollTop, this.scroll.scrollTop + viewport);
    while (view.length < viewport) view.push("");
    lines.push(...view, ...tail);
    // Very short terminals preserve the draft cursor and dismiss controls, not clipped top content.
    return lines.slice(-height).map(fit);
  }

  invalidate(): void {
    this.cache = undefined;
    this.picker?.invalidate();
    this.input.invalidate();
  }
  close(): void {
    if (this.disposed) return;
    this.dispose();
    this.done();
  }
  dispose(): void {
    if (this.disposed) return;
    this.saveDraft();
    this.disposed = true;
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
    this.input.focused = false;
  }
}
