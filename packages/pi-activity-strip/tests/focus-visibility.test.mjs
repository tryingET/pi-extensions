import assert from "node:assert/strict";
import test from "node:test";
import { classifyWorkspaceFocus, resolveWorkspaceView } from "../src/common/workspace-view.mjs";
import { createFocusVisibility } from "../src/native/focus-visibility.mjs";
import { createNativePanelProjection } from "../src/native/panel-projection.mjs";

const workspace = { id: 7, idx: 1, is_focused: true };
const raw = {
  sessionId: "019fa4d0-7142-7fb4-8d30-f98e951f0513",
  publisherId: "p-a",
  repoLabel: "fixture",
};
const agent = {
  id: 44,
  workspace_id: 7,
  app_id: "com.mitchellh.ghostty",
  title: "π - fixture · 019fa4d071427fb48d30f98e951f0513",
  is_focused: true,
};
const card = { ...raw, cardId: `session:${raw.sessionId}`, windowId: 44, surfaceVisible: true };
const options = { resolveHostPid: () => null, existsSync: () => false };

for (const app_id of ["brave-browser", "obsidian", "plain-terminal", "another-app"]) {
  test(`agent -> ${app_id} -> agent keeps cards but hides on exact non-agent focus`, () => {
    const published = [];
    const projection = createNativePanelProjection({
      isNiriSession: () => true,
      publish: (v) => published.push(v),
    });
    projection.updateSnapshot({ generatedAt: 1, sessions: [raw] });
    const publish = (windows) => {
      const view = resolveWorkspaceView(windows, workspace, [raw], options);
      assert.ok(view);
      projection.publishWorkspaceView(view);
      return published.at(-1);
    };
    // This fixture uses the existing exact legacy session-title resolver, not an app-id guess.
    assert.equal(publish([agent]).visible, true);
    const request = projection.requestKeyboard();
    const other = { id: 45, app_id, title: "agent-a", workspace_id: 7, is_focused: true };
    // An unrelated title alone must not acquire an already exactly owned card (ambiguous titles
    // fail closed too). Use an ordinary non-agent title in the actual transition.
    other.title = "ordinary non-agent app";
    const hidden = publish([{ ...agent, is_focused: false }, other]);
    assert.equal(hidden.sessions.length, 1);
    assert.equal(hidden.visible, false);
    projection.keyboardChanged(request, true);
    projection.send();
    assert.equal(published.at(-1).visible, false, "late panel ack never overrides non-agent");
    assert.equal(projection.requestKeyboard(), null, "shortcut fails closed while hidden");
    assert.equal(publish([agent, { ...other, is_focused: false }]).visible, true);
  });
}

test("classification requires exact admitted window ownership, not app-id or a matching-looking title", () => {
  for (const app_id of ["com.mitchellh.ghostty", "brave-browser", "obsidian"]) {
    assert.equal(
      classifyWorkspaceFocus([{ ...agent, id: 99, app_id }], workspace, [card]),
      "non-agent",
    );
  }
  assert.equal(classifyWorkspaceFocus([agent], workspace, [card]), "agent");
  assert.equal(
    classifyWorkspaceFocus([agent], workspace, [{ ...card, surfaceVisible: false }]),
    "non-agent",
  );
  assert.equal(
    classifyWorkspaceFocus([agent], workspace, [card, { ...card, cardId: "other" }]),
    "unknown",
  );
  assert.equal(classifyWorkspaceFocus([agent, { ...agent, id: 45 }], workspace, [card]), "unknown");
  assert.equal(classifyWorkspaceFocus([], workspace, [card]), "unknown");
  assert.equal(
    classifyWorkspaceFocus([{ ...agent, workspace_id: 8 }], workspace, [card]),
    "unknown",
  );
});

test("explicit pending keyboard entry survives NULL before ack, but never non-agent/unknown/workspace changes", () => {
  for (const next of [
    { workspaceId: 7, focus: "non-agent", hasCards: true },
    { workspaceId: 7, focus: "unknown", hasCards: true },
    { workspaceId: 8, focus: "none", hasCards: true },
    { workspaceId: 7, focus: "none", hasCards: false },
  ]) {
    const state = createFocusVisibility();
    const observe = (focus) => state.observe({ workspaceId: 7, focus, hasCards: true });
    assert.equal(observe("none"), false, "NULL initially is not ownership");
    assert.equal(observe("agent"), true);
    assert.equal(state.requestKeyboard(12, true), false, "click-through");
    assert.equal(state.requestKeyboard(12, false), true);
    assert.equal(observe("none"), true, "request reserved before Niri NULL/ack ordering");
    state.keyboardChanged(12, true);
    assert.equal(observe("none"), true);
    assert.equal(state.observe(next), false);
    state.keyboardChanged(12, true);
    assert.equal(state.isEligible(), false);
    assert.equal(state.requestKeyboard(13, false), false);
  }
});

test("keyboard exit/failure/restart revoke ownership; ordinary NULL is hidden", () => {
  const state = createFocusVisibility();
  const observe = (focus) => state.observe({ workspaceId: 7, focus, hasCards: true });
  observe("agent");
  state.requestKeyboard(1, false);
  observe("none");
  state.keyboardChanged(0, false);
  assert.equal(state.isEligible(), true, "stale exit ignored");
  state.keyboardChanged(1, false);
  assert.equal(observe("none"), false);
  observe("agent");
  state.requestKeyboard(2, false);
  state.resetKeyboard();
  assert.equal(observe("none"), false);
});
