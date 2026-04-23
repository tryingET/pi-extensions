export interface RewindLedgerReference {
  commitSha: string;
  timestamp: number;
  kind: "binding" | "current" | "undo";
  pinned?: boolean;
}

export interface RewindRetentionSettings {
  maxSnapshots?: number;
  maxAgeDays?: number;
}

export interface PlannedRetentionLiveSet {
  pinnedCommitShas: string[];
  retainedCommitShas: string[];
  liveCommitShas: string[];
}

export function planRetentionLiveSet(
  references: RewindLedgerReference[],
  settings: RewindRetentionSettings,
  now = Date.now(),
): PlannedRetentionLiveSet {
  const latestBindingByCommit = new Map<string, number>();
  const pinnedCommitShas = new Set<string>();

  for (const reference of references) {
    if (!reference.commitSha) {
      continue;
    }

    if (reference.kind === "current" || reference.kind === "undo" || reference.pinned === true) {
      pinnedCommitShas.add(reference.commitSha);
    }

    if (reference.kind !== "binding") {
      continue;
    }

    const previousTimestamp = latestBindingByCommit.get(reference.commitSha) ?? 0;
    if (reference.timestamp > previousTimestamp) {
      latestBindingByCommit.set(reference.commitSha, reference.timestamp);
    }
  }

  let candidates = [...latestBindingByCommit.entries()]
    .filter(([commitSha]) => !pinnedCommitShas.has(commitSha))
    .sort((left, right) => right[1] - left[1]);

  if (typeof settings.maxAgeDays === "number" && settings.maxAgeDays >= 0) {
    const cutoff = now - settings.maxAgeDays * 24 * 60 * 60 * 1000;
    candidates = candidates.filter(([, timestamp]) => timestamp >= cutoff);
  }

  if (
    typeof settings.maxSnapshots === "number" &&
    settings.maxSnapshots >= 0 &&
    candidates.length > settings.maxSnapshots
  ) {
    candidates = candidates.slice(0, settings.maxSnapshots);
  }

  const retainedCommitShas = candidates.map(([commitSha]) => commitSha);
  const liveCommitShas = [...new Set([...pinnedCommitShas, ...retainedCommitShas])];

  return {
    pinnedCommitShas: [...pinnedCommitShas],
    retainedCommitShas,
    liveCommitShas,
  };
}
