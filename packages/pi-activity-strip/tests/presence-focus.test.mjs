import assert from "node:assert/strict";
import test from "node:test";
import { isPresenceApp, presenceAppsFor } from "../src/common/presence-apps.mjs";
import { classifyWorkspaceFocus, resolveWorkspaceView } from "../src/common/workspace-view.mjs";
import { createNativePanelProjection } from "../src/native/panel-projection.mjs";

const workspace = { id: 7, idx: 1, is_focused: true };
const raw = {
  sessionId: "019fa4d0-7142-7fb4-8d30-f98e951f0513",
  publisherId: "p-a",
  repoLabel: "fixture",
};
const agentWindow = {
  id: 44,
  pid: 4000,
  workspace_id: 7,
  app_id: "com.mitchellh.ghostty",
  title: "π - fixture · 019fa4d071427fb48d30f98e951f0513",
  is_focused: true,
};
const shellWindow = {
  id: 45,
  pid: 4100,
  workspace_id: 7,
  app_id: "com.mitchellh.ghostty",
  title: "nodecode",
  is_focused: false,
};
const vaultWindow = {
  id: 46,
  pid: 4200,
  workspace_id: 7,
  app_id: "com.onepassword.OnePassword",
  title: "1Password",
  is_focused: false,
};
const browserWindow = {
  id: 47,
  pid: 4300,
  workspace_id: 7,
  app_id: "brave-browser",
  title: "Docs",
  is_focused: false,
};
const card = { ...raw, cardId: `session:${raw.sessionId}`, windowId: 44, surfaceVisible: true };
const options = { resolveHostPid: () => null, existsSync: () => false, env: {} };

test("presence apps: Ghostty and 1Password by default, adjustable through one env list", () => {
  for (const id of [
    "com.mitchellh.ghostty",
    "com.tryinget.ghosttysidequest",
    "com.onepassword.OnePassword",
    "1password",
  ])
    assert.equal(isPresenceApp(id, {}), true, id);
  for (const id of ["brave-browser", "md.Obsidian", "", null])
    assert.equal(isPresenceApp(id, {}), false, String(id));
  const env = (value) => ({ PI_ACTIVITY_STRIP_PRESENCE_APP_IDS: value });
  assert.equal(isPresenceApp("md.Obsidian", env("md.obsidian")), true, "adds, case-insensitively");
  assert.equal(isPresenceApp("com.mitchellh.ghostty", env("-com.mitchellh.ghostty")), false);
  assert.equal(isPresenceApp("1Password", env("none")), false, "none drops every default");
  assert.equal(isPresenceApp("md.Obsidian", env("none,md.Obsidian")), true);
  assert.equal(isPresenceApp("anything", env("*")), true);
  assert.equal(presenceAppsFor(env("none")).ids.size, 0);
});

test("a presence app owning no exact card is neutral; card ownership still decides agent", () => {
  const focus = (window, cards = [card], env = {}) =>
    classifyWorkspaceFocus(
      [
        { ...agentWindow, is_focused: false },
        { ...window, is_focused: true },
      ],
      workspace,
      cards,
      env,
    );
  assert.equal(focus(agentWindow), "agent");
  assert.equal(focus(shellWindow), "neutral", "a Ghostty shell/nodecode/angelx tab");
  assert.equal(focus(vaultWindow), "neutral", "1Password");
  assert.equal(focus(browserWindow), "non-agent");
  assert.equal(
    focus(shellWindow, [card], { PI_ACTIVITY_STRIP_PRESENCE_APP_IDS: "none" }),
    "non-agent",
  );
  const twoVisible = [card, { ...card, cardId: "other" }];
  assert.equal(
    focus(agentWindow, twoVisible),
    "neutral",
    "an ambiguous Ghostty window stays present",
  );
  assert.equal(
    focus(agentWindow, twoVisible, { PI_ACTIVITY_STRIP_PRESENCE_APP_IDS: "none" }),
    "unknown",
  );
  assert.equal(
    focus({ ...vaultWindow, workspace_id: 8 }),
    "unknown",
    "another workspace proves nothing",
  );
});

function setup() {
  const published = [];
  /** @type {Map<number, Record<string, unknown>>} */
  const facts = new Map();
  const projection = createNativePanelProjection({
    isNiriSession: () => true,
    publish: (view) => published.push(view),
    getWindowFacts: (id) => facts.get(id) ?? null,
    env: {},
  });
  projection.updateSnapshot({ generatedAt: 1, sessions: [raw] });
  const focusOn = (focused) => {
    const windows = [agentWindow, shellWindow, vaultWindow, browserWindow].map((window) => ({
      ...window,
      is_focused: window.id === focused,
    }));
    for (const window of windows) facts.set(window.id, window);
    const view = resolveWorkspaceView(windows, workspace, [raw], options);
    assert.ok(view);
    projection.publishWorkspaceView(view);
    return { view, published: published.at(-1) };
  };
  return { projection, published, facts, focusOn, last: () => published.at(-1) };
}

test("the strip stays present over Ghostty and 1Password, and hides over other apps", () => {
  const f = setup();
  assert.equal(f.focusOn(44).published.visible, true);
  const shell = f.focusOn(45);
  assert.equal(shell.view.focusKind, "neutral");
  assert.equal(shell.view.focusWindowId, 45);
  assert.equal(shell.published.visible, true);
  assert.equal(shell.published.focusedCardId, null, "a neutral window has no current card");
  assert.equal(f.projection.diagnostics().source, "neutral");
  assert.equal(f.focusOn(46).published.visible, true);
  assert.notEqual(f.projection.requestKeyboard(), null, "the hotkey works over 1Password");
  assert.equal(f.focusOn(47).published.visible, false);
  assert.equal(f.projection.requestKeyboard(), null, "hidden over a browser");
  assert.equal(f.focusOn(46).published.visible, true);
});

test("event-path focus reaches neutral from window facts, and panel NULL keeps the source", () => {
  const f = setup();
  f.focusOn(44);
  const agentEpoch = f.last().interactionEpoch;
  f.projection.publishWindowFocus(46);
  assert.equal(f.last().visible, true);
  assert.notEqual(f.last().interactionEpoch, agentEpoch, "a new source is a new interaction");
  const neutralEpoch = f.last().interactionEpoch;
  const request = f.projection.requestKeyboard();
  assert.notEqual(request, null);
  f.projection.publishWindowFocus(null);
  assert.equal(f.last().visible, true);
  assert.equal(f.last().interactionEpoch, neutralEpoch, "panel NULL is a continuation");
  f.projection.publishWindowFocus(47);
  assert.equal(f.last().visible, false);
  f.facts.delete(45);
  f.projection.publishWindowFocus(45);
  assert.equal(f.last().visible, false, "no window facts, no presence proof");
});

test("panel NULL keeps the current card, so the ring and scroll position do not move", () => {
  const f = setup();
  assert.equal(f.focusOn(44).published.focusedCardId, card.cardId);
  f.projection.publishWindowFocus(null);
  assert.equal(f.last().focusedCardId, card.cardId, "event path");
  assert.equal(f.focusOn(null).published.focusedCardId, card.cardId, "full projection path");
  assert.equal(f.focusOn(45).published.focusedCardId, null, "real focus elsewhere clears it");
});

test("a neutral source authorizes one jump bound to its own window", () => {
  const f = setup();
  f.focusOn(46);
  const request = f.projection.requestKeyboard();
  assert.notEqual(request, null);
  f.projection.publishWindowFocus(null);
  const intent = f.projection.acceptJumpIntent(request, f.projection.getInteractionEpoch());
  assert.ok(intent);
  assert.equal(intent.windowId, 46);
  assert.equal(intent.isCurrent(), true);
  const view = (focused, extra = []) =>
    resolveWorkspaceView(
      [agentWindow, shellWindow, vaultWindow, browserWindow].map((window) => ({
        ...window,
        is_focused: window.id === focused,
      })),
      workspace,
      [raw, ...extra],
      options,
    );
  assert.equal(intent.matchesSource(view(null)), true, "panel holds the keyboard");
  assert.equal(intent.matchesSource(view(46)), true, "source focused again");
  assert.equal(intent.matchesSource(view(45)), false, "another neutral window is another source");
  assert.equal(intent.matchesSource(view(44)), false, "an agent window is another source");
  assert.equal(
    f.projection.acceptJumpIntent(request, f.projection.getInteractionEpoch()),
    null,
    "one jump",
  );
});
