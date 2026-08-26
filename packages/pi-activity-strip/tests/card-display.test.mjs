// summary: "Verifies stalled-session detection and duplicate-label disambiguation derived from session fields."
// read_when:
//   - "Changing card-display stall thresholds, event-time anchors, or label suffixes."

import assert from "node:assert/strict";
import test from "node:test";
import {
  disambiguatedRepoLabel,
  findDuplicateLabels,
  isStalledSession,
} from "../src/common/card-display.mjs";

test("wedged streams are stalled when no real event arrived within the threshold", () => {
  const now = Date.now();
  const wedged = {
    agentActive: true,
    state: "thinking",
    lastEventAt: now - 16 * 60_000,
    updatedAt: now,
  };
  assert.equal(isStalledSession(wedged, now, 15 * 60_000), true);

  // A heartbeat keeps it live, but only real events keep it working.
  const fresh = { ...wedged, lastEventAt: now - 5_000 };
  assert.equal(isStalledSession(fresh, now, 15 * 60_000), false);

  // Settled sessions are never stalled, even with old event times.
  assert.equal(isStalledSession({ ...wedged, agentActive: false }, now, 15 * 60_000), false);
  assert.equal(isStalledSession({ ...wedged, state: "success" }, now, 15 * 60_000), false);
});

test("long silent tools are only stalled after generous thresholds", () => {
  const now = Date.now();
  const silentBash = {
    agentActive: true,
    state: "tool",
    lastEventAt: now - 10 * 60_000,
    updatedAt: now,
  };
  assert.equal(isStalledSession(silentBash, now, 15 * 60_000), false);
  assert.equal(
    isStalledSession({ ...silentBash, lastEventAt: now - 20 * 60_000 }, now, 15 * 60_000),
    true,
  );
});

test("duplicate repo labels gain a short process suffix", () => {
  const sessions = [
    { repoLabel: "pi-extensions", processId: 489220 },
    { repoLabel: "pi-extensions", processId: 1960895 },
    { repoLabel: "agent-kernel", processId: 111111 },
  ];
  const duplicates = findDuplicateLabels(sessions);
  assert.equal(duplicates.has("pi-extensions"), true);
  assert.equal(duplicates.has("agent-kernel"), false);

  assert.equal(disambiguatedRepoLabel(sessions[0], duplicates), "pi-extensions · 9220");
  assert.equal(disambiguatedRepoLabel(sessions[1], duplicates), "pi-extensions · 0895");
  assert.equal(disambiguatedRepoLabel(sessions[2], duplicates), "agent-kernel");
});
