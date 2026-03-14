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
