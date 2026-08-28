import assert from "node:assert/strict";
import test from "node:test";
import {
  AGENT_TEAMS,
  getAgentTeamDisplayLabel,
  resolveAgentForTeam,
  resolveConfiguredDefaultAgentTeam,
} from "../../src/runtime/agent-routing.ts";
import { createSessionTeamStore } from "../../src/runtime/team-state.ts";

test("full team includes every registered agent profile", () => {
  assert.deepEqual(AGENT_TEAMS.full, ["builder", "researcher", "reviewer", "scout"]);
  assert.equal(getAgentTeamDisplayLabel("full"), "all agents");
});

test("resolveAgentForTeam fails closed instead of silently swapping agent roles", () => {
  const allowed = resolveAgentForTeam("researcher", "full");
  assert.equal(allowed.ok, true);
  if (allowed.ok) {
    assert.equal(allowed.agent, "researcher");
  }

  const rejected = resolveAgentForTeam("builder", "quality");
  assert.equal(rejected.ok, false);
  if (!rejected.ok) {
    assert.match(rejected.error, /does not allow agent 'builder'/);
    assert.deepEqual(rejected.allowedAgents, ["reviewer", "researcher"]);
  }

  const unknownTeam = resolveAgentForTeam("builder", "fulll");
  assert.equal(unknownTeam.ok, false);
  if (!unknownTeam.ok) {
    assert.match(unknownTeam.error, /Unknown agent team: fulll/);
    assert.deepEqual(unknownTeam.allowedAgents, []);
  }

  const prototypeTeam = resolveAgentForTeam("scout", "constructor");
  assert.equal(prototypeTeam.ok, false);
  if (!prototypeTeam.ok) {
    assert.match(prototypeTeam.error, /Unknown agent team: constructor/);
    assert.deepEqual(prototypeTeam.allowedAgents, []);
  }
});

test("session team store isolates team selections by session manager", () => {
  const store = createSessionTeamStore();
  const sessionA = { sessionManager: { id: "a" } };
  const sessionB = { sessionManager: { id: "b" } };

  assert.equal(store.getTeam(sessionA), "full");
  assert.equal(store.getTeam(sessionB), "full");

  assert.equal(store.setTeam(sessionA, "quality"), true);
  assert.equal(store.getTeam(sessionA), "quality");
  assert.equal(store.getTeam(sessionB), "full");
});

test("session team store persists team selections by session key", () => {
  const store = createSessionTeamStore();
  const firstCtx = { sessionKey: "session-key-1" };
  const secondCtx = { sessionKey: "session-key-1" };
  const otherCtx = { sessionKey: "session-key-2" };

  assert.equal(store.setTeam(firstCtx, "quality"), true);
  assert.equal(store.getTeam(secondCtx), "quality");
  assert.equal(store.getTeam(otherCtx), "full");
});

test("session team store preserves team selections across session identity shape changes", () => {
  const store = createSessionTeamStore();
  const sessionManager = { id: "session-a" };

  assert.equal(store.setTeam({ sessionManager }, "quality"), true);
  assert.equal(store.getTeam({ sessionManager, sessionKey: "session-key-a" }), "quality");
  assert.equal(store.getTeam({ sessionKey: "session-key-a" }), "quality");
});

test("session team store evicts the oldest session key when capacity is exceeded", () => {
  const store = createSessionTeamStore("full", { maxSessionKeys: 2 });

  assert.equal(store.setTeam({ sessionKey: "session-key-1" }, "quality"), true);
  assert.equal(store.setTeam({ sessionKey: "session-key-2" }, "implement"), true);
  assert.equal(store.getTeam({ sessionKey: "session-key-1" }), "quality");

  assert.equal(store.setTeam({ sessionKey: "session-key-3" }, "explore"), true);
  assert.equal(store.getTeam({ sessionKey: "session-key-1" }), "quality");
  assert.equal(store.getTeam({ sessionKey: "session-key-2" }), "full");
  assert.equal(store.getTeam({ sessionKey: "session-key-3" }), "explore");
});

test("session team store clamps non-positive capacity to one retained session key", () => {
  const store = createSessionTeamStore("full", { maxSessionKeys: 0 });

  assert.equal(store.setTeam({ sessionKey: "session-key-1" }, "quality"), true);
  assert.equal(store.setTeam({ sessionKey: "session-key-2" }, "explore"), true);
  assert.equal(store.getTeam({ sessionKey: "session-key-1" }), "full");
  assert.equal(store.getTeam({ sessionKey: "session-key-2" }), "explore");
});

test("resolveConfiguredDefaultAgentTeam ignores invalid configured defaults", () => {
  assert.equal(resolveConfiguredDefaultAgentTeam("quality"), "quality");
  assert.equal(resolveConfiguredDefaultAgentTeam("invalid-team"), "full");
  assert.equal(resolveConfiguredDefaultAgentTeam(undefined), "full");
});

test("session team store refuses to persist team selections without session identity", () => {
  const store = createSessionTeamStore();

  assert.equal(store.setTeam(undefined, "quality"), false);
  assert.equal(store.getTeam(undefined), "full");
});
