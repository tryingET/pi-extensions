// summary: overview-first, keyboard-navigable subscription cockpit with detail and horizon tabs.
// read_when: changing limits dashboard navigation, focus, responsive layout, or hotkeys.
import type { KeybindingsManager, Theme } from "@earendil-works/pi-coding-agent";
import {
  type Component,
  decodeKittyPrintable,
  type Focusable,
  fuzzyFilter,
  Input,
  matchesKey,
  wrapTextWithAnsi,
} from "@earendil-works/pi-tui";
import { fit, renderAccountDetails } from "./limits-dashboard-render.ts";
import {
  baseHeadroom,
  type LimitsAccountRow,
  type LimitsDashboardStore,
  nextCreditExpiry,
} from "./limits-dashboard-store.ts";
import {
  compareOverviewRows,
  needsAttention,
  renderOverview,
  renderTimeline,
} from "./limits-runway.ts";

type Sort = "active" | "headroom" | "reset" | "expiry";
type View = "overview" | "subscription" | "horizon";
type DetailView = Exclude<View, "overview">;
const VIEWS: View[] = ["overview", "subscription", "horizon"];
export interface LimitsDashboardActions {
  close: () => void;
  switchAccount: (provider: string) => Promise<string>;
  render: () => void;
  rows: () => number;
}
export class LimitsDashboard implements Component, Focusable {
  readonly store: LimitsDashboardStore;
  private theme: Theme;
  private keys: KeybindingsManager;
  private actions: LimitsDashboardActions;
  private input = new Input();
  private hasFocus = false;
  private searching = false;
  private view: View = "overview";
  private selectedProvider?: string;
  private offsets: Record<DetailView, number> = { subscription: 0, horizon: 0 };
  private lengths: Record<DetailView, number> = { subscription: 0, horizon: 0 };
  private detailHeight = 10;
  private overviewHeight = 8;
  private sort: Sort = "reset";
  private help = false;
  private attention = false;
  private helpOffset = 0;
  private helpHeight = 10;
  private helpLength = 0;
  private switching = false;

  constructor(
    store: LimitsDashboardStore,
    theme: Theme,
    keys: KeybindingsManager,
    actions: LimitsDashboardActions,
  ) {
    this.store = store;
    this.theme = theme;
    this.keys = keys;
    this.actions = actions;
    this.selectedProvider = store.activeProvider ?? store.rows[0]?.account.provider;
  }
  get focused(): boolean {
    return this.hasFocus;
  }
  set focused(value: boolean) {
    this.hasFocus = value;
    this.syncFocus();
  }
  private syncFocus(): void {
    this.input.focused = this.hasFocus && this.searching;
  }
  invalidate(): void {
    this.input.invalidate();
  }
  filteredRows(): LimitsAccountRow[] {
    const matching = fuzzyFilter(
      this.store.rows.filter((row) => !this.attention || needsAttention(row)),
      this.input.getValue(),
      (row) =>
        `${row.account.label} ${row.account.family ?? ""} ${row.account.provider} ${row.snapshot?.usage?.plan ?? ""} ${row.status} ${needsAttention(row) ? "attention" : ""} ${row.account.provider === this.store.activeProvider ? "active" : ""}`,
    );
    return matching.sort((a, b) => {
      if (this.sort === "active")
        return (
          Number(b.account.provider === this.store.activeProvider) -
          Number(a.account.provider === this.store.activeProvider)
        );
      if (this.sort === "headroom") return (baseHeadroom(b) ?? -1) - (baseHeadroom(a) ?? -1);
      if (this.sort === "reset") return compareOverviewRows(a, b);
      return (nextCreditExpiry(a) ?? Infinity) - (nextCreditExpiry(b) ?? Infinity);
    });
  }
  selected(): LimitsAccountRow | undefined {
    const rows = this.filteredRows();
    return rows.find((row) => row.account.provider === this.selectedProvider) ?? rows[0];
  }
  private move(delta: number): void {
    const rows = this.filteredRows();
    const selected = this.selected();
    const index = selected ? rows.indexOf(selected) : -1;
    this.selectedProvider =
      rows[Math.max(0, Math.min(rows.length - 1, index + delta))]?.account.provider;
    this.offsets.subscription = 0;
  }
  private scroll(delta: number): void {
    if (this.view === "overview") return;
    this.offsets[this.view] = Math.max(
      0,
      Math.min(
        Math.max(0, this.lengths[this.view] - this.detailHeight),
        this.offsets[this.view] + delta,
      ),
    );
  }
  private cycleTab(delta: number): void {
    this.view = VIEWS[(VIEWS.indexOf(this.view) + delta + VIEWS.length) % VIEWS.length];
  }
  private back(): boolean {
    if (this.view !== "overview") this.view = "overview";
    else if (this.attention) this.attention = false;
    else if (this.input.getValue()) this.input.setValue("");
    else {
      this.actions.close();
      return true;
    }
    return false;
  }
  handleInput(data: string): void {
    if (this.store.disposed) return;
    data = decodeKittyPrintable(data) ?? data;
    const cancel = this.keys.matches(data, "tui.select.cancel") || matchesKey(data, "ctrl+c");
    const up = this.keys.matches(data, "tui.select.up");
    const down = this.keys.matches(data, "tui.select.down");
    const confirm = this.keys.matches(data, "tui.select.confirm");
    if (this.help) {
      if (cancel || data === "?" || confirm) this.help = false;
      else {
        const delta = up
          ? -1
          : down
            ? 1
            : matchesKey(data, "pageDown")
              ? this.helpHeight
              : matchesKey(data, "pageUp")
                ? -this.helpHeight
                : 0;
        this.helpOffset = Math.max(
          0,
          Math.min(Math.max(0, this.helpLength - this.helpHeight), this.helpOffset + delta),
        );
      }
    } else if (this.searching) {
      if (cancel) {
        this.input.setValue("");
        this.searching = false;
        this.view = "overview";
      } else if (up || down) this.move(up ? -1 : 1);
      else if (confirm) {
        this.searching = false;
        this.view = "subscription";
      } else if (matchesKey(data, "tab") || matchesKey(data, "shift+tab")) {
        this.searching = false;
        this.cycleTab(matchesKey(data, "shift+tab") ? -1 : 1);
      } else {
        this.input.handleInput(data);
        this.selectedProvider = this.filteredRows()[0]?.account.provider;
        this.offsets.subscription = 0;
      }
    } else if (cancel || data === "q") {
      if (this.back()) return;
    } else if (data === "/" || matchesKey(data, "ctrl+f")) {
      this.searching = true;
      this.view = "overview";
    } else if (data === "?") this.help = true;
    else if (data === "!") this.attention = !this.attention;
    else if (data === "t") this.view = this.view === "horizon" ? "overview" : "horizon";
    else if (matchesKey(data, "tab") || matchesKey(data, "shift+tab"))
      this.cycleTab(matchesKey(data, "shift+tab") ? -1 : 1);
    else if (confirm || matchesKey(data, "right")) this.view = "subscription";
    else if (matchesKey(data, "left")) this.view = "overview";
    else if (up || down || data === "j" || data === "k") {
      const delta = up || data === "k" ? -1 : 1;
      if (this.view === "overview") this.move(delta);
      else this.scroll(delta);
    } else if (matchesKey(data, "pageDown") || matchesKey(data, "ctrl+d")) {
      if (this.view === "overview") this.move(this.overviewHeight);
      else this.scroll(this.detailHeight - 1);
    } else if (matchesKey(data, "pageUp") || matchesKey(data, "ctrl+u")) {
      if (this.view === "overview") this.move(-this.overviewHeight);
      else this.scroll(1 - this.detailHeight);
    } else if (matchesKey(data, "home") || data === "g") {
      if (this.view === "overview") this.move(-Infinity);
      else this.scroll(-Infinity);
    } else if (matchesKey(data, "end") || data === "G") {
      if (this.view === "overview") this.move(Infinity);
      else this.scroll(Infinity);
    } else if (data === "a") {
      this.input.setValue("");
      this.selectedProvider = this.store.activeProvider;
      this.attention = false;
      this.offsets.subscription = 0;
      this.view = "overview";
    } else if (data === "o") {
      const sorts: Sort[] = ["active", "headroom", "reset", "expiry"];
      this.sort = sorts[(sorts.indexOf(this.sort) + 1) % sorts.length];
    } else if (data === "r") {
      const selected = this.selected();
      if (selected) this.store.refresh(selected.account.provider);
    } else if (data === "R") this.store.refresh();
    else if (data === "s" && !this.switching) this.switchSelected();
    this.syncFocus();
    this.actions.render();
  }
  private switchSelected(): void {
    const row = this.selected();
    if (!row) return;
    this.switching = true;
    this.store.note = `Switching to ${row.account.label}…`;
    void this.actions
      .switchAccount(row.account.provider)
      .then((message) => {
        if (!this.store.disposed) this.store.note = message;
      })
      .catch(() => {
        if (!this.store.disposed)
          this.store.note = "Could not switch. Check sign-in and project restrictions.";
      })
      .finally(() => {
        this.switching = false;
        if (!this.store.disposed) this.actions.render();
      });
  }
  private detail(width: number, height: number, now: number): string[] {
    const tab = this.view === "horizon" ? "horizon" : "subscription";
    const row = this.selected();
    const content = (
      tab === "horizon"
        ? renderTimeline(this.filteredRows(), this.theme, now)
        : renderAccountDetails(
            row,
            this.theme,
            row?.account.provider === this.store.activeProvider,
            now,
          )
    ).flatMap((line) => wrapTextWithAnsi(line, width));
    this.detailHeight = Math.max(1, height - 1);
    this.lengths[tab] = content.length;
    this.scroll(0);
    const offset = this.offsets[tab];
    const result = content.slice(offset, offset + this.detailHeight);
    while (result.length < height - 1) result.push("");
    result.push(
      this.theme.fg(
        "dim",
        `${content.length ? offset + 1 : 0}–${Math.min(content.length, offset + this.detailHeight)} / ${content.length} lines · ↑↓ scroll · ← overview`,
      ),
    );
    return result.slice(0, height).map((line) => fit(line, width));
  }
  private tabs(width: number): string {
    const labels =
      width < 40 ? ["Overview", "Sub", "Horizon"] : ["Overview", "Subscription", "Horizon"];
    return VIEWS.map((view, index) =>
      view === this.view
        ? this.theme.fg("accent", this.theme.bold(`[${labels[index]}]`))
        : this.theme.fg("muted", ` ${labels[index]} `),
    ).join(" ");
  }
  private guide(width: number, height: number): string[] {
    const help = [
      "KEYBOARD FIELD GUIDE",
      "",
      "Overview is home: five columns per subscription. ● marks the active account.",
      "Narrow view labels all five fields for the selected account; ↑↓ chooses others.",
      "↑↓ or j/k      Choose a subscription in Overview; scroll other tabs",
      "Enter / →      Inspect the selected subscription (never switches)",
      "Tab / Shift+Tab Cycle Overview → Subscription → Horizon, or reverse",
      "← / Esc        Return to Overview; Esc there clears filters, then closes",
      "/ or Ctrl+F    Fuzzy search labels, provider names, plans and status",
      "PgUp / PgDn    Page through subscriptions or scroll detail / horizon",
      "Home / End     First / last subscription or detail line",
      "r / R          Refresh selected subscription / every subscription",
      "s              Explicitly switch subscription, preserving model if available",
      "a              Reveal the active account in Overview",
      "o              Sort: quota renewal + lowest left (default) → credit expiry → active → headroom",
      "!              Filter expiring credits, low quota and unavailable / empty balances",
      "t              Horizon: quota renewals and credit expiries; t returns home",
      "Esc / q        Back to Overview, then clear filters, then close",
      "",
      "Default order: displayed quota renewal soonest, then lowest Left; unknowns last.",
      "Headroom = lowest reported base-window percentage, not a time forecast.",
      "Percentages compare quota pressure, not equal amounts of work.",
      "OpenRouter key allowance and account wallet are separate USD amounts.",
      "An uncapped key does not mean an unlimited wallet. Unknown stays unknown.",
      "Additional model limits are shown separately in the Subscription tab.",
      "Banked reset credits belong only to Codex, not to other subscriptions.",
      "RENEWS = renewal of the quota window shown, not expiry of banked credit.",
      "BANKED = available reset count. CREDITS EXPIRE = earliest reported expiry.",
      "↺? = unknown count; 0 = none. Expiry ? = missing dates; — = not applicable.",
      "K/W = key/wallet USD; ∞ = uncapped key only; ~ amounts are rounded.",
      "! yellow: expires within 3 days. !! red: within 1 day or timestamp passed.",
      "Before name: ↻ checking, … queued, ~ partial, old = failed refresh / previous data.",
      "A passed renewal or expiry needs refresh (↻); no renewal or consumption is inferred.",
      "Other providers require compatible sub-core; aliases never borrow base quota.",
      "Errors are isolated. Refreshes use at most two subscriptions at once.",
      "Browsing and refreshing never switch accounts or spend reset credits.",
    ].flatMap((line) => wrapTextWithAnsi(line, width));
    this.helpHeight = height;
    this.helpLength = help.length;
    this.helpOffset = Math.min(this.helpOffset, Math.max(0, help.length - height));
    return help.slice(this.helpOffset, this.helpOffset + height);
  }
  render(width: number): string[] {
    if (this.store.disposed || !Number.isFinite(width) || width <= 0) return [];
    const height = Math.max(5, Math.min(42, Math.floor(this.actions.rows() * 0.85)));
    if (width < 32 || height < 12)
      return ["LIMITS / RUNWAY", "Resize terminal for the dashboard.", "Esc back / close."]
        .map((line) => fit(line, width))
        .slice(0, height);
    const inner = width - 4;
    const now = Date.now();
    const rows = this.filteredRows();
    const checked = this.store.rows.filter((row) => row.snapshot).length;
    const loading = this.store.rows.filter(
      (row) => row.status === "loading" || row.status === "queued",
    ).length;
    const attention = this.store.rows.filter(needsAttention).length;
    const heading = `${this.theme.fg("accent", this.theme.bold("LIMITS / RUNWAY"))}  ${this.theme.fg("muted", "Your subscriptions. One view.")}`;
    const summary = `${this.store.rows.length} subscriptions · ${checked} checked${loading ? ` · ↻ ${loading} pending` : ""} · ${attention} need attention`;
    const search = this.searching
      ? (this.input.render(inner - 8)[0] ?? "")
      : this.theme.fg("dim", this.input.getValue() || "/ search subscriptions…");
    const content = [
      heading,
      this.tabs(inner),
      this.theme.fg("muted", summary),
      `Search  ${search}`,
    ];
    // Ten chrome rows leave exactly eight subscription rows at a 24-row terminal.
    const bodyHeight = height - 10;
    if (this.help) content.push(...this.guide(inner, bodyHeight));
    else if (this.view === "overview") {
      this.overviewHeight = Math.max(1, bodyHeight - 2);
      content.push(
        ...renderOverview(
          rows,
          this.selected(),
          this.theme,
          inner,
          bodyHeight,
          this.store.activeProvider,
          this.sort,
          this.attention,
          now,
        ),
      );
    } else content.push(...this.detail(inner, bodyHeight, now));
    while (content.length < height - 6) content.push("");
    content.push(
      this.theme.fg("border", "─".repeat(inner)),
      this.theme.fg(
        "accent",
        this.help
          ? `Help ${this.helpOffset + 1}–${Math.min(this.helpLength, this.helpOffset + this.helpHeight)} / ${this.helpLength} · ↑↓ / PgUp / PgDn · Esc returns`
          : this.store.note,
      ),
      this.theme.fg(
        "muted",
        this.searching
          ? "Type to filter · ↑↓ choose · Enter inspect · Esc clear"
          : this.view === "overview"
            ? "↑↓ choose · Enter inspect · Tab view · s switch · Esc close"
            : "↑↓ scroll · Tab view · ← Overview · s switch · Esc back",
      ),
      this.theme.fg("dim", "r refresh · R all · ! attention · t horizon · o sort · ? help"),
    );
    const border = (text: string) => this.theme.fg("borderAccent", text);
    return [
      border(`╭${"─".repeat(width - 2)}╮`),
      ...content.map((line) => `${border("│")} ${fit(line, inner)} ${border("│")}`),
      border(`╰${"─".repeat(width - 2)}╯`),
    ].slice(0, height);
  }
}
