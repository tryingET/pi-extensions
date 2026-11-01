import assert from "node:assert/strict";
import test from "node:test";
import { isPresenceApp, presenceAppsFor } from "../src/common/presence-apps.mjs";
import {
  classifyWorkspaceFocus,
  resolveWindowDirectory,
  resolveWorkspaceView,
} from "../src/common/workspace-view.mjs";
import { createNativePanelProjection } from "../src/native/panel-projection.mjs";
import { createPanelWindowJump } from "../src/native/panel-window-jump.mjs";

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

const sourceChanges = [
  ["disappears", (facts) => facts.delete(46)],
  ["moves workspace", (facts) => facts.set(46, { ...facts.get(46), workspace_id: 8 })],
  [
    "loses presence admission",
    (facts) => facts.set(46, { ...facts.get(46), app_id: "brave-browser" }),
  ],
  ["changes process", (facts) => facts.set(46, { ...facts.get(46), pid: 9999 })],
  [
    "changes presence application",
    (facts) => facts.set(46, { ...facts.get(46), app_id: "com.mitchellh.ghostty" }),
  ],
];

for (const sourceId of [44, 46]) {
  for (const mode of ["hover", "explicit"]) {
    for (const selection of ["absent", null, 47, 777, "bad-id", sourceId]) {
      test(`Given accepted ${mode} jump from${sourceId} after own release, When unpublished fresh workspace selection is${selection}, Then dispatch only for the same source or legacy absence`, async () => {
        const f = setup();
        f.focusOn(sourceId);
        const epoch = f.projection.getInteractionEpoch();
        const request =
          mode === "hover"
            ? f.projection.requestHoverKeyboard(epoch, 55, false)
            : f.projection.requestKeyboard();
        assert.ok(request);
        f.projection.keyboardChanged(request, true);
        f.focusOn(null);
        f.projection.setDirectory(
          resolveWindowDirectory([...f.facts.values()], [workspace], [raw], options),
        );
        const reading = Promise.withResolvers();
        const resume = Promise.withResolvers();
        const { jump, focused } = panelJump(
          f,
          async () => {
            reading.resolve();
            await resume.promise;
            return [...f.facts.values()];
          },
          async () => [
            { ...workspace, ...(selection === "absent" ? {} : { active_window_id: selection }) },
            { id: 8, idx: 2, is_focused: false, active_window_id: 777 },
          ],
        );
        const pending = jump({ windowId: 44, request, epoch });
        await reading.promise;
        assert.equal(
          f.projection.keyboardChanged(request, false),
          true,
          "own key release does not invalidate the accepted action",
        );
        resume.resolve();
        const allowed = selection === "absent" || selection === sourceId;
        assert.equal(
          (await pending).ok,
          allowed,
          "fresh selection is checked before actual focus dispatch, without publishing a view or receiving an event",
        );
        assert.deepEqual(focused, allowed ? [44] : []);
      });
    }
  }
}

for (const mode of ["hover", "explicit"]) {
  for (const [change, mutate] of [
    ...sourceChanges,
    ["only changes title", (facts) => facts.set(46, { ...facts.get(46), title: "Updated title" })],
  ]) {
    test(
      `Given an accepted neutral ${mode} jump awaiting IPC, When its source ${change} and keys are released, Then only a still-identical source may dispatch`,
      { timeout: 5000 },
      async () => {
        const f = setup();
        f.focusOn(46);
        const epoch = f.projection.getInteractionEpoch();
        const request =
          mode === "hover"
            ? f.projection.requestHoverKeyboard(epoch, 55, false)
            : f.projection.requestKeyboard();
        f.focusOn(null);
        f.projection.setDirectory(
          resolveWindowDirectory([...f.facts.values()], [workspace], [raw], options),
        );
        const reading = Promise.withResolvers();
        const resume = Promise.withResolvers();
        const { jump, focused } = panelJump(f, async () => {
          reading.resolve();
          await resume.promise;
          return [...f.facts.values()];
        });
        const pending = jump({ windowId: 44, request, epoch });
        await reading.promise;
        mutate(f.facts);
        f.projection.keyboardChanged(request, false);
        resume.resolve();
        const result = await pending;
        const valid = change === "only changes title";
        assert.equal(result.ok, valid);
        assert.deepEqual(focused, valid ? [44] : []);
      },
    );
  }
}

for (const [change, mutate] of sourceChanges) {
  test(`Given a neutral-source keyboard grant, When its source ${change} during NULL focus and a poll publishes, Then authorization is revoked`, () => {
    const f = setup();
    f.focusOn(46);
    const epoch = f.projection.getInteractionEpoch();
    const request = f.projection.requestKeyboard();
    f.focusOn(null);
    mutate(f.facts);
    const view = resolveWorkspaceView([...f.facts.values()], workspace, [raw], options);
    f.projection.publishWorkspaceView(view);
    assert.equal(f.last().visible, false);
    assert.notEqual(f.projection.getInteractionEpoch(), epoch);
    assert.equal(f.projection.ownsKeyboardRequest(request), false);
    assert.equal(f.projection.requestKeyboard(), null);
    assert.equal(f.projection.acceptJumpIntent(request, epoch), null);
  });

  test(`Given a neutral-source jump grant, When its source ${change} before intent acceptance, Then no window is focused`, async () => {
    const f = setup();
    f.focusOn(46);
    const request = f.projection.requestKeyboard();
    const epoch = f.projection.getInteractionEpoch();
    f.focusOn(null);
    f.projection.setDirectory(
      resolveWindowDirectory([...f.facts.values()], [workspace], [raw], options),
    );
    const { jump, focused } = panelJump(f);
    mutate(f.facts);
    const result = await jump({ windowId: 44, request, epoch });
    assert.equal(result.ok, false);
    assert.deepEqual(focused, []);
  });
}

test("Given valid neutral NULL continuation, When only its title changes, Then keyboard authorization remains current", () => {
  const f = setup();
  f.focusOn(46);
  const epoch = f.projection.getInteractionEpoch();
  const request = f.projection.requestKeyboard();
  f.focusOn(null);
  f.facts.set(46, { ...f.facts.get(46), title: "New title" });
  f.projection.publishWorkspaceView(
    resolveWorkspaceView([...f.facts.values()], workspace, [raw], options),
  );
  assert.equal(f.last().visible, true);
  assert.equal(f.projection.getInteractionEpoch(), epoch);
  assert.equal(f.projection.ownsKeyboardRequest(request), true);
});

// Niri reports `pid: null` when it does not know a client's process. Window ids are never reused,
// so the window, its app and workspace still pin the source; a pid that appears later revokes it.
const pidless = { 46: { pid: null } };

test("Given a presence window whose PID niri does not report, When it is the source during panel NULL focus, Then the strip and keyboard stay until its identity changes", () => {
  const f = setup();
  assert.equal(f.focusOn(46, pidless).published.visible, true, "presence keeps the strip");
  const epoch = f.projection.getInteractionEpoch();
  const request = f.projection.requestKeyboard();
  assert.notEqual(request, null, "the hotkey works over a pid-less presence window");
  f.focusOn(null, pidless);
  assert.equal(f.last().visible, true);
  assert.equal(f.projection.getInteractionEpoch(), epoch, "panel NULL is a continuation");
  assert.equal(f.projection.ownsKeyboardRequest(request), true);
  f.facts.set(46, { ...f.facts.get(46), pid: 4200 });
  f.projection.publishWorkspaceView(
    resolveWorkspaceView([...f.facts.values()], workspace, [raw], options),
  );
  assert.equal(f.last().visible, false, "another process identity is another source");
  assert.notEqual(f.projection.getInteractionEpoch(), epoch);
  assert.equal(f.projection.ownsKeyboardRequest(request), false);
});

test("Given a pid-less presence source, When its accepted jump reaches IPC, Then exactly its target is focused", async () => {
  const f = setup();
  f.focusOn(46, pidless);
  const request = f.projection.requestKeyboard();
  const epoch = f.projection.getInteractionEpoch();
  f.focusOn(null, pidless);
  f.projection.setDirectory(
    resolveWindowDirectory([...f.facts.values()], [workspace], [raw], options),
  );
  const { jump, focused } = panelJump(f);
  const result = await jump({ windowId: 44, request, epoch });
  assert.equal(result.ok, true);
  assert.deepEqual(focused, [44]);
});

for (const [name, pid] of [
  ["a string", "4200"],
  ["undefined", undefined],
]) {
  test(`Given a presence window whose PID fact is ${name}, When it would become the source, Then it authorizes nothing`, () => {
    const f = setup();
    assert.equal(f.focusOn(46, { 46: { pid } }).published.visible, false, "a malformed fact");
    assert.equal(f.projection.requestKeyboard(), null);
  });
}

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
  /** @param {number | null} focused @param {Record<number, Record<string, unknown>>} [overrides] */
  const focusOn = (focused, overrides = {}) => {
    const windows = [agentWindow, shellWindow, vaultWindow, browserWindow].map((window) => ({
      ...window,
      ...overrides[window.id],
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

/** The production jump binding over the fixture's live window facts.
 * @param {ReturnType<typeof setup>} f @param {() => Promise<Record<string, unknown>[]>} [readWindows]
 * @param {() => Promise<Record<string, unknown>[]>} [readWorkspaces] */
function panelJump(
  f,
  readWindows = async () => [...f.facts.values()],
  readWorkspaces = async () => [workspace, { id: 8, idx: 2, is_focused: false }],
) {
  /** @type {number[]} */
  const focused = [];
  const jump = createPanelWindowJump({
    projection: f.projection,
    getWindowFacts: (id) => f.facts.get(id) ?? null,
    placementOptions: options,
    isNiriSession: () => true,
    readWindows,
    readWorkspaces,
    focusWindow: async (id) => focused.push(id),
    reconcile: () => {},
  });
  return { jump, focused };
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
