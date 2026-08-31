// ---
// summary: "verifies stable publisher aggregation into operator-facing terminal cards"
// read_when:
//   - "changing card identity, representative selection, or membership comparison"
// ---

import assert from "node:assert/strict";
import test from "node:test";

import {
  haveSameCardMembership,
  haveSameRecordMembership,
  projectSessionCards,
} from "../src/common/session-cards.mjs";

const logicalSessionId = "019fa4d0-7142-7fb4-8d30-f98e951f0513";

function publisher(overrides = {}) {
  return {
    sessionId: logicalSessionId,
    publisherId: "publisher-a",
    terminalKey: "ghostty:main:17",
    terminalKind: "ghostty-surface",
    terminalFamily: "main",
    terminalSurfaceId: "17",
    state: "success",
    agentActive: false,
    lastEventAt: 100,
    updatedAt: 100,
    startedAt: 1,
    turnIndex: 1,
    ...overrides,
  };
}

test("publishers on one terminal aggregate into one card and active real work wins", () => {
  const idleHeartbeat = publisher({ publisherId: "idle", updatedAt: 10_000 });
  const active = publisher({
    publisherId: "active",
    state: "tool",
    agentActive: true,
    lastEventAt: 200,
    updatedAt: 201,
  });
  const [card] = projectSessionCards([active, idleHeartbeat]);
  assert.equal(card.cardId, "terminal:ghostty:main:17");
  assert.equal(card.publisherId, "active");
  assert.equal(card.publisherCount, 2);
});

test("the same logical session on two terminal surfaces produces two cards", () => {
  const cards = projectSessionCards([
    publisher({ publisherId: "a", terminalKey: "ghostty:main:17" }),
    publisher({
      publisherId: "b",
      terminalKey: "ghostty:main:18",
      terminalSurfaceId: "18",
    }),
  ]);
  assert.deepEqual(cards.map((card) => card.cardId).sort(), [
    "terminal:ghostty:main:17",
    "terminal:ghostty:main:18",
  ]);
});

test("unbound duplicate publishers remain one containment card", () => {
  const cards = projectSessionCards([
    publisher({
      publisherId: "a",
      terminalKind: "unbound",
      terminalKey: "",
      terminalFamily: "",
      terminalSurfaceId: "",
    }),
    publisher({
      publisherId: "b",
      terminalKind: "unbound",
      terminalKey: "",
      terminalFamily: "",
      terminalSurfaceId: "",
    }),
  ]);
  assert.equal(cards.length, 1);
  assert.equal(cards[0].cardId, `session:${logicalSessionId}`);
});

test("record and card membership comparisons are reflexive with duplicate logical ids", () => {
  const records = [publisher({ publisherId: "a" }), publisher({ publisherId: "b" })];
  assert.equal(haveSameRecordMembership(records, records), true);
  assert.equal(haveSameCardMembership(records, records), true);
  assert.equal(haveSameRecordMembership(records, [publisher({ publisherId: "a" })]), false);
  assert.equal(
    haveSameRecordMembership(
      [publisher({ publisherId: "a", terminalKey: "ghostty:main:17" })],
      [
        publisher({
          publisherId: "a",
          terminalKey: "ghostty:main:18",
          terminalSurfaceId: "18",
        }),
      ],
    ),
    false,
    "a publisher moving between terminal surfaces changes workspace membership",
  );
});
