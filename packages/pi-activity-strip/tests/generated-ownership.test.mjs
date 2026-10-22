// ---
// summary: "seeded production replay of jump/release/identity interleavings with a history-based oracle"
// read_when:
//   - "changing ownership, publisher ordering, accepted jumps, or replay coverage"
// ---

import assert from "node:assert/strict";
import test from "node:test";
import { productionFixture } from "./support/production-panel-fixture.mjs";

// Oracle is a specification over the external event vocabulary, not a second implementation
// of sourceIdentity/currentView/visibility. No production identity/admission helper is imported.
const invalidating = new Set([
  "workspace-revoked",
  "owner-closed",
  "non-agent-focused",
  "membership-lost",
  "cancelled",
  "superseded",
  "fresh-workspace-changed",
  "fresh-target-replaced",
]);
const harmless = ["reorder", "refresh", "source-focus", "null-focus", "old-ack", "old-cancel"];
const vocabulary = [...harmless, ...invalidating];
const expectedFocus = (events) => (events.some((event) => invalidating.has(event)) ? [] : [55]);

function traceFor(seed, kind) {
  let value = seed >>> 0;
  const next = (size) => {
    value = (Math.imul(value, 1664525) + 1013904223) >>> 0;
    return Math.floor((value / 0x100000000) * size);
  };
  const choices = kind === "valid" ? harmless : vocabulary;
  const events = Array.from({ length: 1 + next(12) }, () => choices[next(choices.length)]);
  if (kind === "revoked")
    events.splice(next(events.length + 1), 0, [...invalidating][next(invalidating.size)]);
  return { seed, kind, events };
}

class ReplayMismatch extends Error {
  constructor(kind, cause) {
    super(`ownership oracle mismatch: ${kind}`, { cause });
    this.kind = kind;
  }
}

function checkOutcome(kind, check) {
  try {
    check();
  } catch (cause) {
    throw new ReplayMismatch(kind, cause);
  }
}

async function replay({ mode, events }) {
  const f = productionFixture();
  const p = f.projection;
  // Given an admitted source and accepted listed jump; When own release beats fresh IPC.
  const request = f.claim(mode);
  assert.notEqual(request, null);
  const epoch = p.getInteractionEpoch();
  f.focus(null);
  const pending = f.jump({ windowId: 55, request, epoch });
  p.keyboardChanged(request, false);
  let fresh = f.windows();
  let workspaces = f.workspaces();
  let activity = 2000;
  for (const event of events) {
    if (event === "reorder") {
      activity += 1;
      // Real SessionStore ordering, not just an array permutation of an already projected card.
      const publisher = activity % 2 === 0 ? f.a : f.b;
      const before = f.store.snapshot(activity).sessions.map((record) => record.publisherId);
      assert.ok(
        f.store.upsert(
          { ...publisher, publisherSequence: activity, updatedAt: activity, lastEventAt: activity },
          activity,
        ),
        "generated update must be admitted, not silently ignored as an old publisher sequence",
      );
      const snapshot = f.store.snapshot(activity);
      assert.notDeepEqual(
        snapshot.sessions.map((record) => record.publisherId),
        before,
      );
      p.updateSnapshot(snapshot);
    }
    if (event === "refresh") f.refresh();
    if (event === "source-focus") f.focus(44);
    if (event === "null-focus") f.focus(null);
    if (event === "old-ack") p.keyboardChanged(request - 1, true);
    if (event === "old-cancel") p.cancelHoverKeyboard(0);
    if (event === "workspace-revoked") f.handlers.onFocusedWorkspace();
    if (event === "owner-closed") f.handlers.onWindowClosed(44);
    if (event === "non-agent-focused") f.focus(99);
    if (event === "membership-lost") f.update([f.a, f.target]);
    if (event === "cancelled") p.cancelKeyboard();
    if (event === "superseded") {
      f.focus(44);
      p.requestKeyboard();
    }
    if (event === "fresh-workspace-changed")
      workspaces = workspaces.map((w) => ({ ...w, is_focused: w.id === 9 }));
    if (event === "fresh-target-replaced")
      fresh = fresh.map((w) => (w.id === 55 ? { ...w, pid: 9000, title: "plain shell" } : w));
  }
  f.finish(fresh, workspaces);
  const result = await pending;
  // Then only an unrevoked intent can focus exactly once, never a guessed/replayed target.
  checkOutcome("focus-effects", () => assert.deepEqual(f.focused, expectedFocus(events)));
  checkOutcome("result", () => assert.equal(result.ok, expectedFocus(events).length === 1));
  checkOutcome("post-release", () => assert.equal(p.acceptJumpIntent(request, epoch), null));
  return f.focused;
}

async function minimizedFailure(trace, failureKind) {
  let events = [...trace.events];
  for (let index = 0; index < events.length; ) {
    const candidate = events.filter((_, i) => i !== index);
    try {
      await replay({ ...trace, events: candidate });
      index += 1;
    } catch (error) {
      // Never shrink to a fixture error or a different behavioral failure.
      if (!(error instanceof ReplayMismatch) || error.kind !== failureKind) throw error;
      events = candidate;
      index = 0;
    }
  }
  return { ...trace, events };
}

const seeds = process.env.PI_ACTIVITY_STRIP_REPLAY_SEED
  ? [Number(process.env.PI_ACTIVITY_STRIP_REPLAY_SEED)]
  : Array.from({ length: 64 }, (_, i) => i + 1);
for (const seed of seeds) {
  assert.ok(Number.isSafeInteger(seed) && seed >= 0 && seed <= 0xffffffff, "uint32 replay seed");
  for (const kind of ["valid", "revoked"])
    for (const mode of ["hover", "explicit"]) {
      const trace = { ...traceFor(seed, kind), mode };
      test(`Scenario: generated jump seed=${seed} mode=${mode} kind=${kind}`, async (t) => {
        t.diagnostic(JSON.stringify(trace));
        try {
          await replay(trace);
        } catch (error) {
          if (error instanceof ReplayMismatch)
            t.diagnostic(`minimized=${JSON.stringify(await minimizedFailure(trace, error.kind))}`);
          throw error;
        }
      });
    }
}

for (const mode of ["hover", "explicit"])
  test(`Scenario: duplicate ${mode} Enter before release cannot consume the intent twice`, async () => {
    // Given a jump blocked on fresh IPC, When the same request is submitted before release,
    // Then exactly one request succeeds and exactly one compositor action occurs.
    const f = productionFixture();
    const request = f.claim(mode);
    const event = { windowId: 55, request, epoch: f.projection.getInteractionEpoch() };
    f.focus(null);
    const first = f.jump(event);
    const duplicate = f.jump(event);
    f.finish(); // queued fixture reads also complete a broken duplicate instead of hanging.
    const outcomes = await Promise.all([first, duplicate]);
    assert.deepEqual(
      outcomes.map((result) => result.ok),
      [true, false],
    );
    assert.deepEqual(f.focused, [55]);
  });

// Explicit mechanism coverage, independent of PRNG distribution or success counts.
for (const mode of ["hover", "explicit"])
  for (const event of vocabulary)
    test(`Scenario: oracle boundary ${mode} ${event}`, () =>
      replay({ mode, events: ["old-ack", "reorder", event, "refresh", "old-cancel"] }));

test("Scenario: external oracle rejects suppression of a required focus and an invented focus", () => {
  // Challenge the *oracle*, not production: historical lost-jump/unauthorized-jump result classes.
  assert.throws(() => assert.deepEqual([], expectedFocus(["reorder", "old-ack"])));
  assert.throws(() => assert.deepEqual([55], expectedFocus(["workspace-revoked", "refresh"])));
});
