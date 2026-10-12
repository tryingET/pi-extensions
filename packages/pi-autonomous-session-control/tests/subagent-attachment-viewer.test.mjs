import "./subagent-attachment-viewer-harness.mjs";
import "./subagent-cockpit-ui-loader.mjs";
import assert from "node:assert/strict";
import test from "node:test";
import { CustomEditor, getSelectListTheme, initTheme } from "@earendil-works/pi-coding-agent";
import { Editor, TuiAltScreen, visibleWidth } from "@earendil-works/pi-tui";
import { KeybindingsManager } from "../node_modules/@earendil-works/pi-coding-agent/dist/core/keybindings.js";

const { default: viewer, AttachmentTranscript } = await import(
  "../extensions/self/subagent-attachment-viewer.ts"
);

initTheme("dark", false);
const baseSnapshot = () => ({
  sessionName: "child",
  dispatchId: "dispatch",
  attemptId: "attempt",
  status: "running",
  steeringSupported: true,
  events: [{ id: "a", kind: "assistant", timestamp: "now", text: "first", detail: "" }],
  receipts: [],
});
function harness() {
  const handlers = new Map(),
    commands = new Map(),
    renderers = new Map(),
    providers = new Map();
  const messages = [],
    activeTools = [],
    models = [],
    notifications = [],
    confirmations = [],
    sessionNames = [];
  let editor,
    rendered = 0,
    shutdowns = 0,
    inheritedSubmit = 0,
    confirmation = false;
  const unsafeActions = [];
  let clears = 0,
    aborts = 0;
  let poll;
  const oldSet = globalThis.setInterval,
    oldClear = globalThis.clearInterval;
  globalThis.setInterval = (action) => {
    poll = action;
    return { unref() {} };
  };
  globalThis.clearInterval = () => {
    poll = undefined;
  };
  globalThis.__viewerTicket = {
    sessionName: "child",
    dispatchId: "dispatch",
    attemptId: "attempt",
    sessionsDir: "/private/sessions",
    parentSessionKey: "parent",
    parentRepoRoot: "/repo",
  };
  globalThis.__viewerBound = true;
  globalThis.__viewerEditorInstalled = false;
  globalThis.__viewerAcks = 0;
  globalThis.__viewerBootstrapGate = undefined;
  globalThis.__viewerSafetySnapshots = [];
  globalThis.__viewerSafetyBusy = false;
  globalThis.__viewerDetaches = 0;
  globalThis.__ascUiReadSnapshots = new Map([["child", baseSnapshot()]]);
  globalThis.__ascUiSteeringCalls = [];
  globalThis.__ascUiCancelCalls = [];
  const pi = {
    on: (name, handler) => handlers.set(name, handler),
    registerCommand: (name, definition) => commands.set(name, definition),
    registerMessageRenderer: (name, renderer) => renderers.set(name, renderer),
    registerProvider: (name, definition) => providers.set(name, definition),
    registerFlag() {},
    getFlag: () => "/private/ticket.json",
    setSessionName: (name) => sessionNames.push(name),
    setActiveTools: (tools) => activeTools.push(tools),
    getActiveTools: () => activeTools.at(-1),
    setModel: async (model) => {
      models.push(model);
      return true;
    },
    sendMessage: (message, opts) => {
      assert.equal(opts.triggerTurn, false);
      messages.push(message);
    },
  };
  const ctx = {
    mode: "tui",
    hasUI: true,
    cwd: "/repo",
    sessionManager: { getSessionFile: () => undefined },
    modelRegistry: { find: (provider, id) => ({ provider, id, api: "asc-attachment-inert" }) },
    get model() {
      return models.at(-1);
    },
    abort() {
      aborts++;
    },
    shutdown: () => {
      shutdowns++;
    },
    ui: {
      setTitle() {},
      notify: (...args) => notifications.push(args),
      confirm: async (...args) => {
        confirmations.push(args);
        return confirmation;
      },
      custom: () => {
        throw new Error("No overlay allowed");
      },
      setEditorComponent(factory) {
        const host = new TuiAltScreen({ columns: 80, rows: 24, write() {} });
        host.requestRender = () => {
          rendered++;
        };
        editor = factory(
          host,
          { borderColor: (s) => s, selectList: getSelectListTheme() },
          new KeybindingsManager(),
        );
        assert.ok(editor instanceof Editor);
        assert.ok(editor instanceof CustomEditor);
        // Native host action copying occurs after the factory, not before.
        editor.actionHandlers.set("app.clear", () => {
          clears++;
          editor.setText("");
        });
        for (const action of [
          "app.editor.external",
          "app.model.select",
          "app.model.cycleForward",
          "app.message.followUp",
          "app.session.resume",
        ]) {
          editor.actionHandlers.set(action, () => unsafeActions.push(action));
        }
        editor.onSubmit = () => {
          inheritedSubmit++;
        }; // Actual native host callback installation order.
        globalThis.__viewerEditorInstalled = true;
      },
    },
  };
  viewer(pi);
  return {
    pi,
    ctx,
    handlers,
    commands,
    providers,
    renderers,
    messages,
    notifications,
    confirmations,
    activeTools,
    models,
    unsafeActions,
    sessionNames,
    clears: () => clears,
    aborts: () => aborts,
    editor: () => editor,
    renderCount: () => rendered,
    shutdowns: () => shutdowns,
    inheritedSubmit: () => inheritedSubmit,
    confirm: (value) => {
      confirmation = value;
    },
    tick: () => poll?.(),
    cleanup: async () => {
      await handlers.get("session_shutdown")?.({}, ctx);
      globalThis.setInterval = oldSet;
      globalThis.clearInterval = oldClear;
    },
  };
}

const pause = () => new Promise((resolve) => setImmediate(resolve));

test("native viewer publishes SDK observations before/after input; blocked hook attempts counted privately with contention retry", async () => {
  const h = harness();
  try {
    await h.handlers.get("session_start")({}, h.ctx);
    const initial = globalThis.__viewerSafetySnapshots.at(-1);
    assert.deepEqual(h.sessionNames, ["Subagent · child · view only"]);
    assert.equal(initial.stage, "ready");
    assert.deepEqual(initial.sdk, {
      noSession: true,
      activeToolsCount: 0,
      inertModelSelected: true,
    });
    assert.deepEqual(Object.values(initial.attempts), [0, 0, 0, 0]);
    assert.ok(Object.values(initial.instrumented).every((v) => v === true));
    const start = globalThis.__viewerSafetySnapshots.length;
    h.editor().setText("PRIVATE_OPERATOR_GUIDANCE");
    h.editor().handleInput("\r");
    await pause();
    assert.deepEqual(
      globalThis.__viewerSafetySnapshots.slice(start).map((s) => s.stage),
      ["before_input", "after_input"],
    );
    assert.deepEqual(globalThis.__viewerSafetySnapshots.at(-1).inputObservations, {
      before: 1,
      after: 1,
    });
    const before = globalThis.__viewerSafetySnapshots.length;
    globalThis.__viewerSafetyBusy = true;
    // Direct blocked-handler unit invocations only: no SDK model requests or local shell execution.
    assert.equal(
      h.handlers.get("tool_call")(
        { toolName: "PRIVATE_TOOL", input: { secret: "PRIVATE_ARGS" } },
        h.ctx,
      ).block,
      true,
    );
    assert.equal(
      h.handlers.get("user_bash")({ command: "PRIVATE_COMMAND" }, h.ctx).result.exitCode,
      1,
    );
    assert.throws(() => h.providers.get("asc-attachment-inert").streamSimple(), /cannot execute/);
    await h.handlers.get("before_agent_start")({ prompt: "PRIVATE_PROMPT" }, h.ctx);
    assert.equal(globalThis.__viewerSafetySnapshots.length, before);
    globalThis.__viewerSafetyBusy = false;
    h.tick();
    const after = globalThis.__viewerSafetySnapshots.at(-1);
    assert.deepEqual(Object.values(after.attempts), [1, 1, 1, 1]);
    assert.ok(after.revision > initial.revision);
    assert.equal(h.aborts(), 0);
    assert.doesNotMatch(
      JSON.stringify(globalThis.__viewerSafetySnapshots),
      /PRIVATE_|prompt|toolName|nonce/,
    );
    const boundPublications = globalThis.__viewerSafetySnapshots.length;
    globalThis.__viewerBound = false;
    assert.equal(h.handlers.get("tool_call")({}, h.ctx).block, true);
    h.tick();
    assert.equal(globalThis.__viewerSafetySnapshots.length, boundPublications);
  } finally {
    await h.cleanup();
  }
});

test("CustomEditor retains copied native clear/exit while unsafe copied actions are inert; before_agent_start is not a veto", async () => {
  const h = harness();
  try {
    await h.handlers.get("session_start")({}, h.ctx);
    h.editor().setText("native draft");
    h.editor().handleInput("\x03");
    assert.equal(h.clears(), 1);
    assert.equal(h.editor().getText(), "");
    for (const name of [
      "app.editor.external",
      "app.model.select",
      "app.model.cycleForward",
      "app.message.followUp",
      "app.session.resume",
    ])
      h.editor().actionHandlers.get(name)();
    h.editor().handleInput("\x10"); // Native model-cycle shortcut; never switches/executes.
    assert.deepEqual(h.unsafeActions, []);
    await h.handlers.get("model_select")(
      { model: { provider: "asc-attachment-inert", id: "other", api: "openai-completions" } },
      h.ctx,
    );
    assert.equal(h.models.at(-1).id, "view-only");
    await h.handlers.get("before_agent_start")({}, h.ctx);
    assert.equal(h.aborts(), 0); // abort is not used as a fictional start-veto.
    h.editor().handleInput("\x04");
    assert.equal(h.shutdowns(), 1);
    assert.equal(globalThis.__ascUiCancelCalls.length, 0);
  } finally {
    await h.cleanup();
  }
});

test("models.json/API override cannot turn the inert model selection into a remote stream", async () => {
  const h = harness();
  try {
    h.ctx.modelRegistry.find = (provider, id) => ({ provider, id, api: "openai-completions" });
    await h.handlers.get("session_start")({}, h.ctx);
    assert.equal(globalThis.__viewerAcks, 0);
    assert.equal(h.models.length, 0);
    assert.equal(h.shutdowns(), 1);
    assert.match(h.notifications[0][0], /overridden/);
    assert.equal(
      (await h.handlers.get("input")({ source: "interactive", text: "no execution" }, h.ctx))
        .action,
      "handled",
    );
    assert.equal(globalThis.__ascUiSteeringCalls.length, 0);
  } finally {
    await h.cleanup();
  }
});

test("native exit during bootstrap contention aborts pending ACK; ready never precedes input installation or survives detach", async () => {
  const h = harness();
  let release;
  try {
    globalThis.__viewerBootstrapGate = new Promise((resolve) => {
      release = resolve;
    });
    const startup = h.handlers.get("session_start")({}, h.ctx);
    await pause();
    assert.equal(globalThis.__viewerEditorInstalled, true);
    assert.equal(globalThis.__viewerAcks, 0);
    h.editor().setText("");
    h.editor().handleInput("\x04");
    release();
    await startup;
    assert.equal(h.shutdowns(), 1);
    assert.equal(globalThis.__viewerAcks, 0);
    assert.equal(h.messages.length, 0);
    assert.equal(globalThis.__ascUiCancelCalls.length, 0);
  } finally {
    release?.();
    await h.cleanup();
  }
});
test("native transcript/main Editor intercept literal submission BEFORE built-ins; one mutable transcript message, no delta flood", async () => {
  const h = harness();
  try {
    await h.handlers.get("session_start")({}, h.ctx);
    assert.equal(globalThis.__viewerAcks, 1, JSON.stringify(h.notifications));
    assert.equal(h.messages.length, 1);
    assert.deepEqual(h.activeTools, [[]]);
    for (const text of [
      "literal guidance",
      "/reload\n/skill:whatever @path <directive>inert</directive>",
      "!not user_bash",
    ]) {
      h.editor().setText(text);
      h.editor().handleInput("\r");
      await pause();
      assert.equal(globalThis.__ascUiSteeringCalls.at(-1).message, text);
    }
    assert.equal(h.inheritedSubmit(), 0);
    assert.equal(globalThis.__ascUiSteeringCalls.at(-1).parentSessionKey, "parent");
    assert.equal(globalThis.__ascUiSteeringCalls.at(-1).attemptId, "attempt");
    const component = h.renderers.get(h.messages[0].customType)(h.messages[0], {}, {});
    for (let i = 0; i < 100; i++) {
      globalThis.__ascUiReadSnapshots.set("child", {
        ...baseSnapshot(),
        events: [{ ...baseSnapshot().events[0], text: `delta-${i}` }],
      });
      h.tick();
    }
    assert.equal(h.messages.length, 1);
    assert.match(component.render(80).join("\n"), /delta-99/);
    assert.match(component.render(80).join("\n"), /queued is NOT delivered/);
    assert.ok(h.renderCount() >= 100);
    for (const width of [1, 10, 40, 80]) {
      assert.ok(component.render(width).every((line) => visibleWidth(line) <= width));
      assert.ok(
        h
          .editor()
          .render(width)
          .every((line) => visibleWidth(line) <= width),
      );
    }
    const bash = h.handlers.get("user_bash")({ command: "touch forbidden" }, h.ctx);
    assert.equal(bash.result.exitCode, 1);
    assert.equal(h.handlers.get("tool_call")({}, h.ctx).block, true);
    assert.equal(h.handlers.get("cache_warming_decision")({}, h.ctx).action, "stop");
    for (const name of [
      "session_before_switch",
      "session_before_fork",
      "session_before_tree",
      "session_before_compact",
    ])
      assert.equal(h.handlers.get(name)({}, h.ctx).cancel, true);
    assert.throws(() => h.providers.get("asc-attachment-inert").streamSimple(), /cannot execute/);
    await h.handlers.get("model_select")({ model: { provider: "remote" } }, h.ctx);
    assert.equal(h.models.at(-1).provider, "asc-attachment-inert");
    await h.handlers.get("input")({ source: "extension", text: "do not send" }, h.ctx);
    assert.equal(globalThis.__ascUiSteeringCalls.length, 3);
  } finally {
    await h.cleanup();
  }
});

test("confirmed native cancel exact binding; terminal/stale input read-only; /detach and shutdown never cancel original", async () => {
  const h = harness();
  try {
    await h.handlers.get("session_start")({}, h.ctx);
    assert.equal(globalThis.__viewerAcks, 1, JSON.stringify(h.notifications));
    await h.commands.get("cancel").handler("", h.ctx);
    assert.equal(globalThis.__ascUiCancelCalls.length, 0);
    assert.match(h.confirmations[0].join(" "), /ORIGINAL child/);
    h.confirm(true);
    await h.commands.get("cancel").handler("", h.ctx);
    assert.equal(globalThis.__ascUiCancelCalls.length, 1);
    const call = globalThis.__ascUiCancelCalls[0];
    assert.equal(call.expectedAttemptId, "attempt");
    assert.equal(call.expectedParentSessionKey, "parent");
    assert.equal(call.expectedSessionName, "child");
    assert.equal(call.parentRepoRoot, "/repo");
    globalThis.__ascUiReadSnapshots.set("child", { ...baseSnapshot(), status: "done" });
    h.tick();
    await h.handlers.get("input")({ source: "interactive", text: "terminal must not send" }, h.ctx);
    await h.commands.get("cancel").handler("", h.ctx);
    assert.equal(globalThis.__ascUiSteeringCalls.length, 0);
    assert.equal(globalThis.__ascUiCancelCalls.length, 1);
    globalThis.__viewerBound = false;
    h.tick();
    await h.handlers.get("input")({ source: "interactive", text: "/detach" }, h.ctx);
    assert.equal(h.shutdowns(), 1);
    assert.equal(globalThis.__viewerDetaches, 1);
    assert.equal(globalThis.__ascUiCancelCalls.length, 1);
  } finally {
    await h.cleanup();
  }
});

test("mutable native per-event components preserve identity; bounds/clipping/receipts and frozen replacement are truthful", () => {
  const component = new AttachmentTranscript();
  component.update(baseSnapshot(), "notice");
  const first = component.children[2].children[0];
  component.update(
    { ...baseSnapshot(), events: [{ ...baseSnapshot().events[0], text: "updated 界🙂" }] },
    "notice",
  );
  assert.equal(component.children[2].children[0], first);
  component.update(
    {
      ...baseSnapshot(),
      truncated: true,
      events: Array.from({ length: 1000 }, (_, i) => ({
        id: `e-${i}`,
        timestamp: "now",
        kind: "tool",
        text: `latest-${i} ${"x".repeat(8000)}`,
        detail: "y".repeat(8000),
      })),
      receipts: ["queued", "delivered", "expired", "rejected"].map((status) => ({
        requestId: status,
        status,
        message: "literal",
        reason: "truthful",
        updatedAt: "now",
      })),
    },
    "bounded",
  );
  assert.equal(component.children[2].children.length, 160);
  const text = component.render(80).join("\n");
  assert.match(text, /History clipped/);
  for (const status of ["queued", "delivered", "expired", "rejected"])
    assert.match(text, new RegExp(`Guidance ${status}: ${status}`));
  for (const width of [1, 12, 80])
    assert.ok(component.render(width).every((line) => visibleWidth(line) <= width));
});
