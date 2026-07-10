export function createSessionTokenHistoryCache() {
  return {
    processedEntries: 0,
    totals: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    scannedEntries: 0,
  };
}

function tokenCount(value) {
  return typeof value === "number" && Number.isFinite(value) ? Math.max(0, value) : 0;
}

function entryContinuityKey(entry) {
  if (!entry || typeof entry !== "object" || typeof entry.id !== "string" || !entry.id) {
    return entry;
  }
  if (entry.type !== "message" || entry.message?.role !== "assistant") {
    return `${entry.id}\u0000${entry.type ?? ""}`;
  }
  const usage = entry.message.usage;
  return [
    entry.id,
    "assistant",
    tokenCount(usage?.input),
    tokenCount(usage?.output),
    tokenCount(usage?.cacheRead),
    tokenCount(usage?.cacheWrite),
  ].join("\u0000");
}

// Pi SessionManager#getEntries() is append-only and returns defensive array copies.
// Continuity keys therefore validate the immutable prefix without rescanning it; callers with
// mutable or reordered histories must use a fresh cache.
export function summarizeSessionTokenEntries(entries, cache = createSessionTokenHistoryCache()) {
  const canAppend =
    entries.length >= cache.processedEntries &&
    (cache.processedEntries === 0 ||
      (entryContinuityKey(entries[0]) === cache.firstEntryKey &&
        entryContinuityKey(entries[cache.processedEntries - 1]) === cache.boundaryEntryKey));
  if (!canAppend) {
    cache.processedEntries = 0;
    cache.firstEntryKey = undefined;
    cache.boundaryEntryKey = undefined;
    cache.totals = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };
  }

  for (let index = cache.processedEntries; index < entries.length; index += 1) {
    const entry = entries[index];
    cache.scannedEntries += 1;
    if (entry?.type !== "message" || entry.message?.role !== "assistant") continue;
    cache.totals.input += tokenCount(entry.message.usage?.input);
    cache.totals.output += tokenCount(entry.message.usage?.output);
    cache.totals.cacheRead += tokenCount(entry.message.usage?.cacheRead);
    cache.totals.cacheWrite += tokenCount(entry.message.usage?.cacheWrite);
  }

  cache.processedEntries = entries.length;
  cache.firstEntryKey = entryContinuityKey(entries[0]);
  cache.boundaryEntryKey = entryContinuityKey(entries.at(-1));
  return { ...cache.totals };
}
