// ---
// summary: "verifies AK claim parsing, lease semantics, and the fail-closed task chip join"
// read_when:
//   - "changing AK read parsing or card join rules"
// ---

import assert from "node:assert/strict";
import test from "node:test";
import {
  AK_TASK_CHIP_ACTIVE,
  AK_TASK_CHIP_DEFERRED,
  AK_TASK_CHIP_ORPHANED,
  claimIsLive,
  cwdIsInsideRepo,
  joinAkTaskChips,
  parseAkClaimList,
  parseAkDeferredList,
  parseAkTimestampMs,
  summarizeAkTasks,
} from "../src/common/ak-tasks.mjs";

const REPO = "/home/tryinget/ai-society/softwareco/owned/pi-extensions";
const NOW = Date.parse("2026-09-13T06:00:00.000Z");
const LIVE_LEASE = "2026-09-13T07:00:00.000Z";
const EXPIRED_LEASE = "2026-09-13T05:00:00.000Z";
const SESSION_A = "01a0993a-d336-739f-a308-cfa4c21d6332";
const SESSION_DEAD = "01a070a1-5bf3-7c40-b820-b48f43c12e2f";

/** @param {Record<string, unknown>} [overrides] */
function claimRow(overrides = {}) {
  return {
    id: 5701,
    repo: REPO,
    title: "Show clickable AK-task references",
    status: "claimed",
    claimed_by: `session-${SESSION_A}`,
    claimed_at: "2026-09-13T05:26:42.620865382+00:00",
    lease_expires_at: LIVE_LEASE,
    ...overrides,
  };
}

/** @param {Record<string, unknown>} [overrides] */
function card(overrides = {}) {
  return {
    cardId: `terminal:ghostty:gtk4:${SESSION_A}`,
    sessionId: SESSION_A,
    publisherSessionIds: [SESSION_A],
    cwd: REPO,
    repoLabel: "pi-extensions",
    ...overrides,
  };
}

test("claim list parses only session-bound live-shape claims", () => {
  const raw = JSON.stringify([
    claimRow(),
    claimRow({ id: 5511, claimed_by: "pi:01a05bcc-4790-77cf-be21-e6a0d2ccc0d9:evidence-repair" }),
    claimRow({ id: 5438, claimed_by: "sci5438-producer" }),
    claimRow({ id: 5432, claimed_by: `session-${SESSION_DEAD}`, lease_expires_at: EXPIRED_LEASE }),
    claimRow({ id: 5433, lease_expires_at: "not-a-timestamp" }),
    claimRow({ id: 5434, status: "done" }),
    claimRow({ id: 5435, repo: "relative/path" }),
    { id: "nope", title: "malformed row" },
  ]);
  const parsed = parseAkClaimList(raw);
  assert.equal(parsed.ok, true);
  if (!parsed.ok) return;
  // Only the well-formed session-bound claims survive: runtime agents are not Pi sessions,
  // relative repos drop their rows, and an unparseable lease drops its row entirely.
  assert.deepEqual(
    parsed.claims.map((claim) => claim.id),
    [5701, 5432],
  );
  const expired = parsed.claims.find((claim) => claim.id === 5432);
  assert.equal(claimIsLive({ leaseExpiresAt: expired?.leaseExpiresAt ?? 0 }, NOW), false);
});

test("claim list fails closed on malformed envelopes", () => {
  assert.equal(parseAkClaimList("{ nope").ok, false);
  assert.equal(parseAkClaimList('{"tasks":[]}').ok, false);
  assert.equal(parseAkClaimList("null").ok, false);
});

test("deferred list keeps only active deferrals with valid repos", () => {
  const raw = JSON.stringify([
    {
      task: {
        id: 4220,
        repo: REPO,
        title: "Control Decision 77 epoch admissions",
        status: "pending",
      },
      deferral: { state: "active" },
    },
    {
      task: { id: 5000, repo: REPO, title: "Resolved deferral", status: "pending" },
      deferral: { state: "resolved" },
    },
    {
      task: { id: 5001, repo: "not/absolute", title: "Bad repo", status: "pending" },
      deferral: { state: "active" },
    },
    { task: null, deferral: { state: "active" } },
  ]);
  const parsed = parseAkDeferredList(raw);
  assert.equal(parsed.ok, true);
  if (!parsed.ok) return;
  assert.deepEqual(
    parsed.deferred.map((task) => task.id),
    [4220],
  );
  assert.equal(parseAkDeferredList("[]").ok, true);
  assert.equal(parseAkDeferredList("nope").ok, false);
});

test("timestamps parse RFC3339 with offsets and reject garbage", () => {
  assert.equal(parseAkTimestampMs("2026-09-13T06:26:42.620865382+00:00"), 1789280802620);
  assert.equal(parseAkTimestampMs(""), null);
  assert.equal(parseAkTimestampMs("yesterday"), null);
  assert.equal(parseAkTimestampMs(12345), null);
});

test("repo containment requires the card cwd to sit inside the task repo", () => {
  assert.equal(cwdIsInsideRepo(REPO, REPO), true);
  assert.equal(cwdIsInsideRepo(`${REPO}/packages/pi-activity-strip`, REPO), true);
  assert.equal(cwdIsInsideRepo(`${REPO}-suffix`, REPO), false);
  assert.equal(cwdIsInsideRepo("/home/tryinget/ai-society", REPO), false);
  assert.equal(cwdIsInsideRepo("", REPO), false);
});

test("a live claim by the card session renders one clickable chip", () => {
  const claims = parseAkClaimList(JSON.stringify([claimRow()]));
  assert.equal(claims.ok, true);
  if (!claims.ok) return;
  const { cards, renderedCounts } = joinAkTaskChips({
    cards: [card()],
    claims: claims.claims,
    liveSessionIds: [SESSION_A],
    nowMs: NOW,
  });
  assert.deepEqual(cards[0].akTasks, [
    { id: 5701, title: "Show clickable AK-task references", state: AK_TASK_CHIP_ACTIVE },
  ]);
  assert.equal(cards[0].akTaskOverflow, undefined);
  assert.deepEqual(renderedCounts, { active: 1, orphaned: 0, deferred: 0 });
});

test("expired leases are vacant custody and render nothing", () => {
  const claims = parseAkClaimList(
    JSON.stringify([
      claimRow({ claimed_by: `session-${SESSION_A}`, lease_expires_at: EXPIRED_LEASE }),
    ]),
  );
  assert.equal(claims.ok, true);
  if (!claims.ok) return;
  const { cards } = joinAkTaskChips({
    cards: [card()],
    claims: claims.claims,
    liveSessionIds: [SESSION_A],
    nowMs: NOW,
  });
  assert.equal(cards[0].akTasks, undefined);
});

test("a claim resumed into two terminals is ambiguous and binds nothing", () => {
  const claims = parseAkClaimList(JSON.stringify([claimRow()]));
  assert.equal(claims.ok, true);
  if (!claims.ok) return;
  const { cards } = joinAkTaskChips({
    cards: [card(), card({ cardId: "terminal:ghostty:gtk4:other", sessionId: SESSION_A })],
    claims: claims.claims,
    liveSessionIds: [SESSION_A],
    nowMs: NOW,
  });
  assert.equal(cards[0].akTasks, undefined);
  assert.equal(cards[1].akTasks, undefined);
});

test("claims by dead sessions badge cards inside the task repo, never as buttons", () => {
  const claims = parseAkClaimList(
    JSON.stringify([
      claimRow({
        id: 5432,
        claimed_by: `session-${SESSION_DEAD}`,
        claimed_at: "2026-09-08T20:00:00Z",
      }),
      claimRow({
        id: 5281,
        claimed_by: `session-${SESSION_DEAD}`,
        repo: "/home/tryinget/ai-society/softwareco/owned/agent-kernel",
      }),
    ]),
  );
  assert.equal(claims.ok, true);
  if (!claims.ok) return;
  const liveSessionIds = [SESSION_A];
  const { cards, orphanedClaimCount } = joinAkTaskChips({
    cards: [card()],
    claims: claims.claims,
    liveSessionIds,
    nowMs: NOW,
  });
  // Only the pi-extensions task joins this card's repo; the agent-kernel claim does not.
  assert.deepEqual(cards[0].akTasks, [
    { id: 5432, title: "Show clickable AK-task references", state: AK_TASK_CHIP_ORPHANED },
  ]);
  assert.equal(orphanedClaimCount, 2);
  // The same claim is not orphaned once its session is live again, even off-workspace.
  const revived = joinAkTaskChips({
    cards: [card()],
    claims: claims.claims,
    liveSessionIds: [SESSION_A, SESSION_DEAD],
    nowMs: NOW,
  });
  assert.equal(revived.cards[0].akTasks, undefined);
});

test("deferred tasks of the card repo render as badges", () => {
  const deferred = [{ id: 4220, title: "Control Decision 77 epoch admissions", repo: REPO }];
  const { cards } = joinAkTaskChips({
    cards: [card(), card({ cwd: "/home/tryinget/ai-society/softwareco/owned/dspx" })],
    deferred,
    nowMs: NOW,
  });
  assert.deepEqual(cards[0].akTasks, [
    { id: 4220, title: "Control Decision 77 epoch admissions", state: AK_TASK_CHIP_DEFERRED },
  ]);
  assert.equal(cards[1].akTasks, undefined);
});

test("a deferred claim never becomes a button even for its own claiming session", () => {
  const claims = parseAkClaimList(JSON.stringify([claimRow({ id: 4220 })]));
  assert.equal(claims.ok, true);
  if (!claims.ok) return;
  const deferred = [{ id: 4220, title: "Control Decision 77 epoch admissions", repo: REPO }];
  const { cards } = joinAkTaskChips({
    cards: [card()],
    claims: claims.claims,
    deferred,
    liveSessionIds: [SESSION_A],
    nowMs: NOW,
  });
  assert.deepEqual(cards[0].akTasks, [
    { id: 4220, title: "Control Decision 77 epoch admissions", state: AK_TASK_CHIP_DEFERRED },
  ]);
});

test("chips are bounded per card with an overflow count", () => {
  const claims = parseAkClaimList(
    JSON.stringify([
      claimRow({ id: 1, claimed_at: "2026-09-13T05:00:00Z" }),
      claimRow({ id: 2, claimed_at: "2026-09-13T05:10:00Z" }),
      claimRow({ id: 3, claimed_at: "2026-09-13T05:20:00Z" }),
      claimRow({
        id: 10,
        claimed_by: `session-${SESSION_DEAD}`,
        claimed_at: "2026-09-13T05:00:00Z",
      }),
      claimRow({
        id: 11,
        claimed_by: `session-${SESSION_DEAD}`,
        claimed_at: "2026-09-13T04:00:00Z",
      }),
      claimRow({
        id: 12,
        claimed_by: `session-${SESSION_DEAD}`,
        claimed_at: "2026-09-13T03:00:00Z",
      }),
    ]),
  );
  assert.equal(claims.ok, true);
  if (!claims.ok) return;
  const { cards } = joinAkTaskChips({
    cards: [card()],
    claims: claims.claims,
    liveSessionIds: [SESSION_A],
    nowMs: NOW,
  });
  // Newest two live claims first, then the two soonest-vacant orphans; the rest overflow.
  assert.deepEqual(
    cards[0].akTasks?.map((chip) => chip.id),
    [3, 2, 10, 11],
  );
  assert.equal(cards[0].akTaskOverflow, 2);
});

test("agent-kind session ids can never join a session-bound claim", () => {
  const claims = parseAkClaimList(
    JSON.stringify([claimRow({ claimed_by: "session-agent:claude:abc", claimed_at: undefined })]),
  );
  assert.equal(claims.ok, true);
  if (!claims.ok) return;
  assert.deepEqual(claims.claims, []);
});

test("summarizeAkTasks counts live, orphaned, and deferred state", () => {
  const claims = parseAkClaimList(
    JSON.stringify([
      claimRow(),
      claimRow({ id: 5432, claimed_by: `session-${SESSION_DEAD}` }),
      claimRow({
        id: 5433,
        claimed_by: `session-${SESSION_DEAD}`,
        lease_expires_at: EXPIRED_LEASE,
      }),
    ]),
  );
  assert.equal(claims.ok, true);
  if (!claims.ok) return;
  const summary = summarizeAkTasks({
    claims: claims.claims,
    deferred: [{ id: 4220, title: "deferred", repo: REPO }],
    liveSessionIds: [SESSION_A],
    nowMs: NOW,
  });
  assert.deepEqual(summary, { liveClaimCount: 2, orphanedClaimCount: 1, deferredCount: 1 });
});
