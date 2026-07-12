// ---
// summary: "Tests context overlay rendering bounds, command wiring, RPC handling, and project-context classification."
// read_when:
//   - "Changing context-overlay UI behavior, extension events, or system context parsing."
// ---
import assert from "node:assert/strict";
import test from "node:test";

import { initTheme } from "@earendil-works/pi-coding-agent";
import { visibleWidth } from "@earendil-works/pi-tui";
import contextOverlayExtension from "../extensions/context-overlay.ts";
import { buildGroups } from "../src/classifier.ts";
import { ContextOverlayComponent } from "../src/context-overlay-component.ts";

initTheme();

type CommandHandler = (args: string, ctx: unknown) => Promise<void> | void;
type RegisteredCommand = { description?: string; handler: CommandHandler };
type EventHandler = (...args: never[]) => unknown;
type OverlayHandle = {
  render(width: number): string[];
  handleInput(data: string): void;
  invalidate(): void;
  dispose(): void;
};
type CustomFactory = (
  tui: { requestRender(): void },
  theme: { fg(name: string, value: string): string },
  keybindings: { matches(): boolean },
  done: () => void,
) => OverlayHandle;

test("ContextOverlayComponent renders footer without legacy appKeyHint export", () => {
  const component = new ContextOverlayComponent(
    { requestRender() {} } as never,
    { fg: (_name: string, value: string) => value } as never,
    {
      matches() {
        return false;
      },
    } as never,
    {
      timestamp: Date.now(),
      modelLabel: "provider/model",
      systemPrompt: "",
      messages: [],
      totalEstimatedTokens: 0,
      groups: [],
    },
    () => {},
    async () => false,
    () => {},
  );

  const output = component.render(100).join("\n");
  assert.match(output, /close/);
  assert.match(output, /freeze\/live/);
});

test("ContextOverlayComponent never exceeds the requested width", () => {
  const component = new ContextOverlayComponent(
    { requestRender() {} } as never,
    { fg: (_name: string, value: string) => value } as never,
    {
      matches() {
        return false;
      },
    } as never,
    {
      timestamp: Date.now(),
      modelLabel: "provider/model",
      systemPrompt: "",
      messages: [],
      totalEstimatedTokens: 321,
      groups: [
        {
          id: "system.otherFiles",
          label: "Project Context",
          tokens: 200,
          percent: 62.3,
          count: 1,
          items: [
            {
              id: "1",
              groupId: "system.otherFiles",
              label: "Very long context item label that used to pressure narrow overlays",
              tokens: 120,
              chars: 240,
              preview:
                "Long preview line one\nLong preview line two\nLong preview line three\nLong preview line four",
              path: "/tmp/some/really/long/path/to/a/context/file/that/needs/truncation.md",
            },
          ],
        },
      ],
    },
    () => {},
    async () => false,
    () => {},
  );

  for (const width of [1, 2, 3, 4, 8, 20, 40, 80]) {
    const lines = component.render(width);
    for (const line of lines) {
      assert.ok(
        visibleWidth(line) <= width,
        `expected line width <= ${width}, got ${visibleWidth(line)} for ${JSON.stringify(line)}`,
      );
    }
  }
});

test("context overlay extension registers /c and opens an overlay", async () => {
  const commands = new Map<string, RegisteredCommand>();
  const handlers = new Map<string, EventHandler[]>();

  contextOverlayExtension({
    on(eventName: string, handler: EventHandler) {
      const existing = handlers.get(eventName) ?? [];
      existing.push(handler);
      handlers.set(eventName, existing);
    },
    registerCommand(name: string, command: RegisteredCommand) {
      commands.set(name, command);
    },
    async exec() {
      return { code: 1, stdout: "", stderr: "disabled in test" };
    },
  } as never);

  assert.equal(typeof commands.get("c")?.handler, "function");
  assert.ok(handlers.has("before_agent_start"));
  assert.ok(handlers.has("context"));
  assert.ok(handlers.has("session_start"));
  assert.ok(handlers.has("session_tree"));
  assert.ok(handlers.has("session_compact"));
  assert.equal(handlers.has("session_switch"), false);

  let overlay: OverlayHandle | undefined;
  let overlayOptions: unknown;

  const ctx = {
    hasUI: true,
    mode: "tui",
    cwd: process.cwd(),
    model: { provider: "test", id: "model" },
    sessionManager: {
      getEntries() {
        return [];
      },
      getLeafId() {
        return undefined;
      },
    },
    getSystemPrompt() {
      return "system prompt";
    },
    getContextUsage() {
      return undefined;
    },
    ui: {
      notify() {},
      async custom<T>(factory: CustomFactory, options: unknown): Promise<T> {
        overlayOptions = options;
        overlay = factory(
          { requestRender() {} },
          { fg: (_name: string, value: string) => value },
          {
            matches() {
              return false;
            },
          },
          () => undefined,
        );
        return undefined as T;
      },
    },
  };

  await commands.get("c")?.handler("", ctx);

  assert.ok(overlay);
  assert.equal(typeof overlay?.render, "function");
  assert.deepEqual(overlayOptions, {
    overlay: true,
    overlayOptions: {
      anchor: "center",
      width: "82%",
      maxHeight: "86%",
      margin: 1,
    },
  });

  const rendered = overlay?.render(100).join("\n") ?? "";
  assert.match(rendered, /Context Inspector/);
});

test("context overlay explains unsupported RPC mode instead of silently opening no UI", async () => {
  const commands = new Map<string, RegisteredCommand>();
  contextOverlayExtension({
    on() {},
    registerCommand(name: string, command: RegisteredCommand) {
      commands.set(name, command);
    },
  } as never);

  const notifications: Array<{ message: string; level: string }> = [];
  let customCalled = false;
  await commands.get("c")?.handler("", {
    hasUI: true,
    mode: "rpc",
    ui: {
      notify(message: string, level: string) {
        notifications.push({ message, level });
      },
      async custom() {
        customCalled = true;
      },
    },
  });

  assert.equal(customCalled, false);
  assert.deepEqual(notifications, [
    { message: "Context inspector requires interactive TUI mode", level: "warning" },
  ]);
});

test("buildGroups splits AGENTS files out of markdown project context payload", () => {
  const groups = buildGroups(
    [
      "System base",
      "# Project Context",
      "## /repo/AGENTS.md",
      "Repo guidance",
      "## /repo/docs/notes.md",
      "Other note",
    ].join("\n"),
    [],
    100,
  );

  const ids = groups.map((group) => group.id);
  assert.ok(ids.includes("system.base"));
  assert.ok(ids.includes("system.agents"));
  assert.ok(ids.includes("system.otherFiles"));
});

test("buildGroups splits AGENTS files out of XML project context payload", () => {
  const groups = buildGroups(
    [
      "System base",
      "<project_context>",
      "Project-specific instructions and guidelines:",
      '<project_instructions path="/repo/AGENTS.md">',
      "Repo guidance",
      "</project_instructions>",
      '<project_instructions path="/repo/docs/notes.md">',
      "Other note",
      "</project_instructions>",
      "</project_context>",
      "Current date: 2026-05-28",
    ].join("\n"),
    [],
    100,
  );

  const ids = groups.map((group) => group.id);
  assert.ok(ids.includes("system.base"));
  assert.ok(ids.includes("system.agents"));
  assert.ok(ids.includes("system.otherFiles"));
});
