// summary: provider-neutral display data; quota windows, spending allowance and reset credits stay distinct.
// read_when: extending /limits normalized snapshots without changing provider-owned adapters.
import type { CodexAccount } from "./codex-accounts.ts";
import type { CodexLimitsSnapshot } from "./codex-limits.ts";

export interface LimitsAccount extends CodexAccount {
  family?: string;
  unsupportedReason?: string;
}
export interface LimitsMoney {
  currency: "USD";
  keyLimit?: number | null;
  keyRemaining?: number;
  keyUsage?: number;
  walletTotal?: number;
  walletUsage?: number;
  walletRemaining?: number;
  walletUnavailable?: boolean;
}
export interface LimitsSnapshot extends CodexLimitsSnapshot {
  source?: "codex" | "sub-core";
  money?: LimitsMoney;
  facts?: string[];
  notes?: string[];
}
