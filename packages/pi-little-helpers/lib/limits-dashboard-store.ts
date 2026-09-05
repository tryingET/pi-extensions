// summary: bounded, cancellable dashboard refresh queue and account-scoped snapshot state.
// read_when: changing limits refresh concurrency, cancellation, partial errors, or sorting metrics.
import type { LimitsAccount, LimitsSnapshot } from "./limits-types.ts";

export interface LimitsAccountRow {
  account: LimitsAccount;
  status: "idle" | "queued" | "loading" | "ready" | "error";
  snapshot?: LimitsSnapshot;
  error?: string;
}
export type LimitsAccountFetcher = (
  account: LimitsAccount,
  signal: AbortSignal,
) => Promise<LimitsSnapshot>;
export function baseHeadroom(row: LimitsAccountRow): number | undefined {
  const values =
    row.snapshot?.usage?.windows
      .filter((window) => window.primary)
      .flatMap((window) =>
        window.remainingPercent === undefined ? [] : [window.remainingPercent],
      ) ?? [];
  return values.length ? Math.min(...values) : undefined;
}
export function nextCreditExpiry(row: LimitsAccountRow): number | undefined {
  if (!row.snapshot?.credits?.availableCount) return undefined;
  const values = row.snapshot.credits.credits
    .filter((credit) => !credit.status || credit.status === "available")
    .map((credit) => Date.parse(credit.expiresAt ?? ""))
    .filter(Number.isFinite);
  return values.length ? Math.min(...values) : undefined;
}
export class LimitsDashboardStore {
  readonly rows: LimitsAccountRow[];
  activeProvider?: string;
  note = "Browsing never changes your active subscription.";
  private readonly abort = new AbortController();
  private readonly queue: LimitsAccountRow[] = [];
  private running = 0;
  private closed = false;
  private waiters: Array<() => void> = [];
  private fetchAccount: LimitsAccountFetcher;
  private changed: () => void;
  waitForIdle(): Promise<void> {
    if (this.closed || (!this.running && !this.queue.length)) return Promise.resolve();
    return new Promise((resolve) => this.waiters.push(resolve));
  }
  private settleWaiters(): void {
    if (this.closed || (!this.running && !this.queue.length)) {
      for (const resolve of this.waiters.splice(0)) resolve();
    }
  }

  constructor(accounts: LimitsAccount[], fetchAccount: LimitsAccountFetcher, changed: () => void) {
    this.fetchAccount = fetchAccount;
    this.changed = changed;
    this.rows = accounts.map((account) => ({ account, status: "idle" }));
  }
  get disposed(): boolean {
    return this.closed;
  }
  refresh(provider?: string): void {
    if (this.closed) return;
    const rows = provider
      ? this.rows.filter((row) => row.account.provider === provider)
      : this.rows;
    for (const row of rows) {
      if (row.status === "queued" || row.status === "loading") continue;
      row.error = undefined;
      if (row.account.unsupportedReason) {
        row.status = "error";
        row.error = row.account.unsupportedReason;
        continue;
      }
      if (!row.account.models.length) {
        row.status = "error";
        row.error = "Subscription is not loaded. Run /reload after configuring multi-pass.";
        continue;
      }
      if (!row.account.authenticated) {
        row.status = "error";
        row.error = "Not signed in. Use /subs login for this subscription, then reopen /limits.";
        continue;
      }
      row.status = "queued";
      this.queue.push(row);
    }
    this.changed();
    this.pump();
  }
  private pump(): void {
    while (!this.closed && this.running < 2 && this.queue.length) {
      const row = this.queue.shift();
      if (!row) return;
      row.status = "loading";
      this.running++;
      this.changed();
      void Promise.resolve()
        .then(() => {
          this.abort.signal.throwIfAborted();
          return this.fetchAccount(row.account, this.abort.signal);
        })
        .then((snapshot) => {
          if (this.closed) return;
          if (snapshot.provider !== row.account.provider)
            throw new Error("Account identity mismatch");
          row.snapshot = snapshot;
          row.status = snapshot.usage || snapshot.credits || snapshot.money ? "ready" : "error";
        })
        .catch(() => {
          if (this.closed) return;
          row.status = "error";
          // Auth errors can contain provider internals. Keep the presentation safe and actionable.
          row.error =
            "Account check failed. Check sign-in, network and project restrictions; press r to retry.";
        })
        .finally(() => {
          this.running--;
          if (this.closed) return;
          this.changed();
          this.pump();
          this.settleWaiters();
        });
    }
  }
  dispose(): void {
    if (this.closed) return;
    this.closed = true;
    this.queue.length = 0;
    this.abort.abort();
    this.settleWaiters();
  }
}
