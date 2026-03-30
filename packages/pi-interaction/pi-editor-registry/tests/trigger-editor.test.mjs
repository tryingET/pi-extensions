import assert from "node:assert/strict";
import test from "node:test";

import { TriggerEditor } from "../index.js";

test("TriggerEditor includes session cwd and session key in trigger context and API ctx", () => {
  const sessionCtx = { cwd: "/tmp/softwareco/owned/demo", sessionKey: "session-1" };
  const editor = new TriggerEditor({}, {}, {}, { id: "pi" }, {}, sessionCtx);

  editor.getCursor = () => ({ line: 0, col: 7 });
  editor.getLines = () => ["/vault:"];

  const context = editor.getContext(true);
  const api = editor.createAPI();

  assert.equal(context.cwd, sessionCtx.cwd);
  assert.equal(context.sessionKey, sessionCtx.sessionKey);
  assert.equal(api.ctx.cwd, sessionCtx.cwd);
  assert.equal(api.ctx.sessionKey, sessionCtx.sessionKey);
  assert.deepEqual(api.ctx.pi, { id: "pi" });
  assert.equal(editor.createAPI(), api);
});

test("TriggerEditor supports async autocomplete providers from newer Pi hosts", async () => {
  const editor = new TriggerEditor(
    { requestRender() {} },
    { selectList: {} },
    {
      matches() {
        return false;
      },
    },
    { id: "pi" },
    {},
  );

  editor.setText("/");
  editor.setAutocompleteProvider({
    async getSuggestions() {
      return {
        prefix: "/",
        items: [{ value: "help", label: "help" }],
      };
    },
    applyCompletion(lines, cursorLine, _cursorCol, item) {
      return {
        lines: [...lines.slice(0, cursorLine), `/${item.value}`],
        cursorLine,
        cursorCol: item.value.length + 1,
      };
    },
    shouldTriggerFileCompletion() {
      return true;
    },
  });

  editor.tryTriggerAutocomplete();
  await new Promise((resolve) => setTimeout(resolve, 25));

  assert.equal(editor.autocompleteState, "regular");
  assert.equal(editor.autocompletePrefix, "/");
  assert.ok(editor.autocompleteList);
});

test("TriggerEditor gracefully ignores malformed autocomplete payloads", async () => {
  const editor = new TriggerEditor(
    { requestRender() {} },
    { selectList: {} },
    {
      matches() {
        return false;
      },
    },
    { id: "pi" },
    {},
  );

  editor.setText("/");
  editor.setAutocompleteProvider({
    async getSuggestions() {
      return { prefix: "/" };
    },
    applyCompletion(lines, cursorLine, cursorCol) {
      return { lines, cursorLine, cursorCol };
    },
    shouldTriggerFileCompletion() {
      return true;
    },
  });

  editor.tryTriggerAutocomplete();
  await new Promise((resolve) => setTimeout(resolve, 25));

  assert.equal(editor.autocompleteState, null);
  assert.equal(editor.autocompletePrefix, "");
  assert.equal(editor.autocompleteList, undefined);
});

test("TriggerEditor applies single async force-file completion on explicit tab", async () => {
  const editor = new TriggerEditor(
    { requestRender() {} },
    { selectList: {} },
    {
      matches() {
        return false;
      },
    },
    { id: "pi" },
    {},
  );

  editor.setText("@fi");
  editor.setAutocompleteProvider({
    async getSuggestions() {
      return {
        prefix: "@fi",
        items: [{ value: "file.txt", label: "file.txt" }],
      };
    },
    applyCompletion() {
      return {
        lines: ["file.txt"],
        cursorLine: 0,
        cursorCol: 8,
      };
    },
    shouldTriggerFileCompletion() {
      return true;
    },
  });

  editor.forceFileAutocomplete(true);
  await new Promise((resolve) => setTimeout(resolve, 25));

  assert.equal(editor.getText(), "file.txt");
  assert.equal(editor.autocompleteState, null);
});

test("TriggerEditor handles escape for modern host keybinding ids", () => {
  let interrupts = 0;
  let triggerChecks = 0;
  const editor = new TriggerEditor(
    { requestRender() {} },
    { selectList: {} },
    {
      matches(data, action) {
        return action === "app.interrupt" && data === "\u001b";
      },
    },
    { id: "pi" },
    {},
  );

  editor.onEscape = () => {
    interrupts += 1;
  };
  editor.broker.checkAndFire = async () => {
    triggerChecks += 1;
  };

  editor.handleInput("\u001b");

  assert.equal(interrupts, 1);
  assert.equal(triggerChecks, 0);
});

test("TriggerEditor escape cancels autocomplete without re-triggering broker", () => {
  let interrupts = 0;
  let triggerChecks = 0;
  const editor = new TriggerEditor(
    { requestRender() {} },
    { selectList: {} },
    {
      matches(data, action) {
        return action === "app.interrupt" && data === "\u001b";
      },
    },
    { id: "pi" },
    {},
  );

  editor.onEscape = () => {
    interrupts += 1;
  };
  editor.broker.checkAndFire = async () => {
    triggerChecks += 1;
  };
  editor.autocompleteState = "regular";
  editor.autocompleteList = {
    getSelectedItem() {
      return null;
    },
  };

  editor.handleInput("\u001b");

  assert.equal(interrupts, 0);
  assert.equal(triggerChecks, 0);
  assert.equal(editor.autocompleteState, null);
  assert.equal(editor.autocompleteList, undefined);
});
