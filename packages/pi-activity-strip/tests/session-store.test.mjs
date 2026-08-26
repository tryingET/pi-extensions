// summary: "Verifies activity-strip session ordering and stale-session purging in the broker store."
// read_when:
//   - "Changing session-store sorting, freshness thresholds, or snapshot contents."

import assert from "node:assert/strict";
import test from "node:test";
import { SessionStore } from "../src/broker/session-store.mjs";
import { createInitialSnapshot } from "../src/common/telemetry.mjs";

test("session store sorts active sessions ahead of idle ones", () => {
  const store = new SessionStore({ staleAfterMs: 60_000 });
  const idle = createInitialSnapshot({ cwd: "/tmp/idle", sessionName: "idle" });
  idle.state = "idle";
  idle.updatedAt = Date.now() - 1000;

  const tool = createInitialSnapshot({ cwd: "/tmp/tool", sessionName: "tool" });
  tool.state = "tool";
  tool.updatedAt = Date.now();

  store.upsert(idle);
  store.upsert(tool);

  const snapshot = store.snapshot();
  assert.equal(snapshot.sessions[0].sessionId, tool.sessionId);
  assert.equal(snapshot.sessions[1].sessionId, idle.sessionId);
});

test("session store purges stale sessions", () => {
  const store = new SessionStore({ staleAfterMs: 10 });
  const stale = createInitialSnapshot({ cwd: "/tmp/stale", sessionName: "stale" });
  stale.updatedAt = Date.now() - 500;
  store.upsert(stale);

  const snapshot = store.snapshot();
  assert.equal(snapshot.sessions.length, 0);
});

test("two live processes sharing one session id keep separate cards", () => {
  const store = new SessionStore({ staleAfterMs: 60_000 });
  const base = {
    sessionId: "019fa4d0-7142-7fb4-8d30-f98e951f0513",
    state: "thinking",
    updatedAt: Date.now(),
  };
  const resumedIdle = { ...base, publisherId: "publisher-old", state: "success" };
  const working = { ...base, publisherId: "publisher-new", state: "tool" };

  store.upsert(resumedIdle);
  store.upsert(working);
  let sessions = store.snapshot().sessions;
  assert.equal(sessions.length, 2);

  // Heartbeats from the idle process can no longer overwrite the working card.
  store.upsert({ ...resumedIdle, updatedAt: Date.now() });
  sessions = store.snapshot().sessions;
  assert.equal(sessions.length, 2);
  assert.deepEqual(sessions.map((session) => session.state).sort(), ["success", "tool"]);

  // Shutdown of one process removes only its own card.
  store.remove(base.sessionId, "publisher-old");
  sessions = store.snapshot().sessions;
  assert.equal(sessions.length, 1);
  assert.equal(sessions[0].publisherId, "publisher-new");
});

test("legacy publishers without publisherId keep bare session keys", () => {
  const store = new SessionStore({ staleAfterMs: 60_000 });
  store.upsert({ sessionId: "legacy-1", state: "idle", updatedAt: Date.now() });
  assert.equal(store.snapshot().sessions.length, 1);
  assert.equal(store.remove("legacy-1"), true);
  assert.equal(store.snapshot().sessions.length, 0);
});

test("normalization defaults lastEventAt to updatedAt for legacy publishers", () => {
  const store = new SessionStore({ staleAfterMs: 60_000 });
  const updatedAt = Date.now() - 1000;
  store.upsert({ sessionId: "legacy-2", updatedAt });
  const [session] = store.snapshot().sessions;
  assert.equal(session.lastEventAt, updatedAt);
  assert.equal(session.publisherId, "");
});
