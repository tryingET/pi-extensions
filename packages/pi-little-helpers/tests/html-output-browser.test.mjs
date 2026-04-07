import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";

import { createHtmlOutputBrowserExtension } from "../extensions/html-output-browser.ts";

function registerExtension(extension) {
  const handlers = new Map();

  extension({
    on(eventName, handler) {
      const existing = handlers.get(eventName) ?? [];
      existing.push(handler);
      handlers.set(eventName, existing);
    },
  });

  return {
    handlers,
    toolResultHandler: handlers.get("tool_result")?.[0],
  };
}

function createUiHarness() {
  const notifications = [];
  const widgets = [];

  return {
    notifications,
    widgets,
    ui: {
      notify(message, type = "info") {
        notifications.push({ message, type });
      },
      setWidget(key, content, options) {
        widgets.push({ key, content, options });
      },
    },
  };
}

function createSpawnStub({ error } = {}) {
  const calls = [];

  const spawnImpl = (command, args, options) => {
    calls.push({ command, args, options });

    const child = new EventEmitter();
    child.unrefCalled = false;
    child.unref = () => {
      child.unrefCalled = true;
    };

    queueMicrotask(() => {
      if (error) {
        const spawnError = Object.assign(new Error(error), { code: "ENOENT" });
        child.emit("error", spawnError);
        return;
      }
      child.emit("spawn");
    });

    return child;
  };

  return { calls, spawnImpl };
}

function createContext(cwd, uiHarness) {
  return {
    cwd,
    hasUI: true,
    ui: uiHarness.ui,
  };
}

function createTempDir() {
  return mkdtempSync(join(tmpdir(), "html-output-browser-"));
}

function expectedOpenCommand() {
  if (process.platform === "darwin") return "open";
  if (process.platform === "win32") return "cmd";
  return "xdg-open";
}

test("html output browser only registers the tool_result hook", () => {
  const { handlers, toolResultHandler } = registerExtension(createHtmlOutputBrowserExtension());

  assert.equal(typeof toolResultHandler, "function");
  assert.deepEqual([...handlers.keys()], ["tool_result"]);
});

test("successful HTML write opens the exact file, updates the widget, and appends a notice", async () => {
  const dir = createTempDir();
  const htmlPath = join(dir, "@preview.html");
  writeFileSync(htmlPath, "<html><body>preview</body></html>");

  try {
    const spawnStub = createSpawnStub();
    const uiHarness = createUiHarness();
    const { toolResultHandler } = registerExtension(
      createHtmlOutputBrowserExtension({ spawn: spawnStub.spawnImpl }),
    );

    const result = await toolResultHandler(
      {
        isError: false,
        toolName: "write",
        input: { path: "@preview.html" },
        content: [{ type: "text", text: "Saved HTML" }],
      },
      createContext(dir, uiHarness),
    );

    assert.equal(spawnStub.calls.length, 1);
    assert.equal(spawnStub.calls[0].command, expectedOpenCommand());
    assert.deepEqual(spawnStub.calls[0].options, {
      detached: true,
      stdio: "ignore",
    });
    assert.equal(spawnStub.calls[0].args.at(-1), pathToFileURL(htmlPath).href);

    assert.equal(uiHarness.widgets.length, 1);
    assert.equal(uiHarness.widgets[0].key, "html-output-browser");
    assert.equal(uiHarness.widgets[0].options.placement, "belowEditor");
    assert.match(uiHarness.widgets[0].content[0], /Latest HTML preview/);
    assert.match(uiHarness.widgets[0].content[1], /@preview\.html/);

    assert.equal(uiHarness.notifications.length, 1);
    assert.equal(uiHarness.notifications[0].type, "info");
    assert.match(uiHarness.notifications[0].message, /Opened HTML in browser: @preview\.html/);

    assert.equal(result.content[0].text, "Saved HTML");
    assert.match(result.content[1].text, /HTML preview:/);
    assert.match(result.content[1].text, /@preview\.html/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("bash results mentioning HTML are ignored", async () => {
  const dir = createTempDir();
  writeFileSync(join(dir, "report.html"), "<html>report</html>");

  try {
    const spawnStub = createSpawnStub();
    const uiHarness = createUiHarness();
    const { toolResultHandler } = registerExtension(
      createHtmlOutputBrowserExtension({ spawn: spawnStub.spawnImpl }),
    );

    const result = await toolResultHandler(
      {
        isError: false,
        toolName: "bash",
        input: { command: "printf ./report.html" },
        content: [{ type: "text", text: "./report.html" }],
      },
      createContext(dir, uiHarness),
    );

    assert.equal(result, undefined);
    assert.equal(spawnStub.calls.length, 0);
    assert.equal(uiHarness.widgets.length, 0);
    assert.equal(uiHarness.notifications.length, 0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("non-HTML writes clear the preview widget instead of leaving stale state behind", async () => {
  const dir = createTempDir();
  writeFileSync(join(dir, "preview.html"), "<html>preview</html>");

  try {
    const spawnStub = createSpawnStub();
    const uiHarness = createUiHarness();
    const { toolResultHandler } = registerExtension(
      createHtmlOutputBrowserExtension({ spawn: spawnStub.spawnImpl }),
    );

    await toolResultHandler(
      {
        isError: false,
        toolName: "write",
        input: { path: "preview.html" },
        content: [{ type: "text", text: "Saved HTML" }],
      },
      createContext(dir, uiHarness),
    );

    const secondResult = await toolResultHandler(
      {
        isError: false,
        toolName: "edit",
        input: { path: "notes.txt" },
        content: [{ type: "text", text: "Saved text" }],
      },
      createContext(dir, uiHarness),
    );

    assert.equal(secondResult, undefined);
    assert.equal(uiHarness.widgets.length, 2);
    assert.equal(uiHarness.widgets[1].key, "html-output-browser");
    assert.equal(uiHarness.widgets[1].content, undefined);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("opener failures warn without dropping the HTML notice", async () => {
  const dir = createTempDir();
  writeFileSync(join(dir, "preview.html"), "<html>preview</html>");

  try {
    const spawnStub = createSpawnStub({ error: "spawn xdg-open ENOENT" });
    const uiHarness = createUiHarness();
    const { toolResultHandler } = registerExtension(
      createHtmlOutputBrowserExtension({ spawn: spawnStub.spawnImpl }),
    );

    const result = await toolResultHandler(
      {
        isError: false,
        toolName: "write",
        input: { path: "preview.html" },
        content: [{ type: "text", text: "Saved HTML" }],
      },
      createContext(dir, uiHarness),
    );

    assert.equal(spawnStub.calls.length, 1);
    assert.equal(uiHarness.widgets.length, 1);
    assert.equal(uiHarness.notifications.length, 1);
    assert.equal(uiHarness.notifications[0].type, "warning");
    assert.match(uiHarness.notifications[0].message, /auto-open failed/i);
    assert.match(result.content[1].text, /HTML preview:/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
