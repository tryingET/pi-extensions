export type SessionTokenTotals = {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
};

export type SessionTokenHistoryCache = {
  processedEntries: number;
  firstEntryKey?: unknown;
  boundaryEntryKey?: unknown;
  totals: SessionTokenTotals;
  scannedEntries: number;
};

export function createSessionTokenHistoryCache(): SessionTokenHistoryCache;
export function summarizeSessionTokenEntries(
  entries: unknown[],
  cache?: SessionTokenHistoryCache,
): SessionTokenTotals;
