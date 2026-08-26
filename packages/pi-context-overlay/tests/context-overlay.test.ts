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
import {
  allocateFrameCells,
  buildIcicleView,
  INITIAL_ICICLE_CURSOR,
  layoutOccupancyBar,
  moveIcicleCursor,
} from "../src/icicle-layout.ts";
import { planOpenFile, resolveEditorCommand } from "../src/open-file.ts";
import type { ContextGroup, ContextItem, ContextSnapshot } from "../src/types.ts";

initTheme();

const KEY = {
  tab: "\t",
  g: "g",
  i: "i",
  left: "\x1b[D",
  right: "\x1b[C",
  up: "\x1b[A",
  down: "\x1b[B",
  enter: "\r",
};

const themeStub = { fg: (_name: string, value: string) => value };
const tuiStub = { requestRender() {} };

const sampleItem = (
  overrides: Partial<ContextItem> & Pick<ContextItem, "id" | "groupId">,
): ContextItem => ({
  label: overrides.label ?? overrides.id,
  tokens: 10,
  chars: 40,
  preview: "preview",
  ...overrides,
});

const sampleGroup = (
  overrides: Partial<ContextGroup> & Pick<ContextGroup, "id" | "label">,
): ContextGroup => ({
  tokens: 10,
  percent: 10,
  count: overrides.items?.length ?? 1,
  items: overrides.items ?? [
    sampleItem({ id: `${overrides.id}:0`, groupId: overrides.id, label: overrides.label }),
  ],
  ...overrides,
});

const sampleSnapshot = (overrides: Partial<ContextSnapshot> = {}): ContextSnapshot => ({
  timestamp: Date.now(),
  modelLabel: "provider/model",
  systemPrompt: "",
  messages: [],
  totalEstimatedTokens: 30,
  groups: [
    sampleGroup({
      id: "message.user",
      label: "User messages",
      tokens: 10,
      percent: 10,
      items: [sampleItem({ id: "u0", groupId: "message.user", label: "user", tokens: 10 })],
    }),
    sampleGroup({
      id: "tool.call",
      label: "Tool calls",
      tokens: 20,
      percent: 20,
      items: [
        sampleItem({
          id: "t0",
          groupId: "tool.call",
          label: "read",
          tokens: 12,
          toolName: "read",
          path: "/repo/a.ts",
        }),
        sampleItem({
          id: "t1",
          groupId: "tool.call",
          label: "read",
          tokens: 8,
          toolName: "read",
          path: "/repo/b.ts",
        }),
      ],
    }),
  ],
  ...overrides,
});

const makeComponent = (options?: {
  snapshot?: ContextSnapshot;
  freezeOnInput?: boolean;
  openPath?: (path: string) => Promise<boolean>;
  notify?: (message: string, level?: "info" | "warning" | "error") => void;
}) => {
  const freezeOnInput = options?.freezeOnInput ?? false;
  return new ContextOverlayComponent(
    tuiStub as never,
    themeStub as never,
    {
      matches(_data: string, binding: string) {
        return freezeOnInput && binding === "app.tools.expand";
      },
    } as never,
    options?.snapshot ?? sampleSnapshot(),
    () => {},
    options?.openPath ?? (async () => false),
    options?.notify ?? (() => {}),
  );
};

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

test("buildGroups extracts tool paths and anchors percent to usage tokens", () => {
  const withUsage = buildGroups(
    "abcd",
    [
      {
        role: "assistant",
        content: [
          { type: "toolCall", id: "tc1", name: "read", arguments: { path: "/repo/file.ts" } },
        ],
      },
      {
        role: "toolResult",
        toolName: "read",
        toolCallId: "tc1",
        content: [{ type: "text", text: "ok" }],
      },
    ] as never,
    200,
  );

  const base = withUsage.find((group) => group.id === "system.base");
  assert.equal(base?.tokens, 1);
  assert.equal(base?.percent, 0.5);

  const call = withUsage.find((group) => group.id === "tool.call")?.items[0];
  assert.equal(call?.path, "/repo/file.ts");
  const result = withUsage.find((group) => group.id === "tool.result")?.items[0];
  assert.equal(result?.path, "/repo/file.ts");
  assert.equal(result?.toolName, "read");

  const withoutUsage = buildGroups("abcd", [], undefined);
  assert.equal(withoutUsage[0]?.percent, 100);
});

test("buildGroups stamps turnIndex and ordinal in emission order", () => {
  const groups = buildGroups(
    [
      "System base",
      "# Project Context",
      "## /repo/AGENTS.md",
      "Repo guidance",
      "## /repo/docs/notes.md",
      "Other note",
    ].join("\n"),
    [
      { role: "user", content: [{ type: "text", text: "hi" }] },
      {
        role: "assistant",
        content: [
          { type: "toolCall", id: "tc1", name: "read", arguments: { path: "/repo/file.ts" } },
          { type: "text", text: "done" },
        ],
      },
      {
        role: "toolResult",
        toolName: "read",
        toolCallId: "tc1",
        content: [{ type: "text", text: "ok" }],
      },
      { role: "user", content: [{ type: "text", text: "again" }] },
    ] as never,
    1000,
  );

  const allItems = groups
    .flatMap((group) => group.items)
    .sort((a, b) => (a.ordinal ?? 0) - (b.ordinal ?? 0));
  assert.ok(allItems.length >= 6);
  assert.equal(allItems[0]?.ordinal, 0);
  for (const item of allItems.filter((entry) => entry.groupId.startsWith("system."))) {
    assert.equal(item.turnIndex, 0);
  }

  const users = allItems.filter((item) => item.groupId === "message.user");
  assert.equal(users[0]?.turnIndex, 0);
  assert.equal(users[1]?.turnIndex, 1);
  assert.ok((users[0]?.ordinal ?? 0) < (users[1]?.ordinal ?? 0));

  const afterFirstUser = allItems.filter(
    (item) => item.groupId === "tool.call" || item.groupId === "message.assistantText",
  );
  assert.ok(afterFirstUser.length > 0);
  for (const item of afterFirstUser) {
    assert.equal(item.turnIndex, 1);
  }
});

test("icicle layout clamps cursor and stays empty-safe", () => {
  assert.deepEqual(allocateFrameCells([{ tokens: 80 }, { tokens: 20 }], 10), [8, 2]);
  assert.deepEqual(allocateFrameCells([{ tokens: 80 }, { tokens: 20 }], 10, 200), [4, 1]);
  assert.deepEqual(allocateFrameCells([], 10), []);
  assert.deepEqual(layoutOccupancyBar(50, 100, 10), { known: true, filled: 5, empty: 5 });
  assert.deepEqual(layoutOccupancyBar(null, 100, 10), { known: false, filled: 0, empty: 10 });

  const empty = buildIcicleView([], INITIAL_ICICLE_CURSOR);
  assert.equal(empty.levels[0].length, 0);
  assert.equal(empty.selectedGroup, 0);
  assert.deepEqual(moveIcicleCursor([], INITIAL_ICICLE_CURSOR, "left").indexByDepth, [0, 0, 0]);

  const groups = sampleSnapshot().groups;
  let cursor = INITIAL_ICICLE_CURSOR;
  cursor = moveIcicleCursor(groups, cursor, "left");
  assert.equal(cursor.indexByDepth[0], 0);
  cursor = moveIcicleCursor(groups, cursor, "right");
  cursor = moveIcicleCursor(groups, cursor, "right");
  assert.equal(cursor.indexByDepth[0], groups.length - 1);
  cursor = moveIcicleCursor(groups, cursor, "down");
  assert.equal(cursor.depth, 1);
  cursor = moveIcicleCursor(groups, cursor, "down");
  assert.equal(cursor.depth, 2);
  cursor = moveIcicleCursor(groups, cursor, "down");
  assert.equal(cursor.depth, 2);
});

test("planOpenFile prefers zellij in zellij and Ghostty editor launch otherwise", () => {
  assert.deepEqual(resolveEditorCommand({ EDITOR: "micro" }), ["micro"]);
  const zellij = planOpenFile({
    filePath: "/repo/a.ts",
    cwd: "/repo",
    env: { ZELLIJ: "0", EDITOR: "micro" },
  });
  assert.equal(zellij[0]?.command, "zellij");
  assert.ok(zellij.some((attempt) => attempt.label === "zellij-run"));

  const ghostty = planOpenFile({
    filePath: "/repo/a.ts",
    cwd: "/repo",
    env: { TERM_PROGRAM: "ghostty", EDITOR: "micro" },
  });
  assert.equal(ghostty[0]?.command, "ghostty");
  assert.ok(ghostty.some((attempt) => attempt.label === "ghostty-new-window"));
  assert.ok(
    ghostty.some((attempt) => attempt.args.includes("-e") && attempt.args.includes("micro")),
  );
  assert.equal(
    ghostty.some((attempt) => attempt.command === "zellij"),
    false,
  );
});

test("overlay occupancy strip uses host usage and stays unknown when tokens are null", () => {
  const known = makeComponent({
    snapshot: sampleSnapshot({
      usage: { tokens: 50, contextWindow: 100, percent: 50 },
    }),
  });
  const knownOut = known.render(80).join("\n");
  assert.match(knownOut, /50\/100 \(50\.0%\)/);
  assert.match(knownOut, /occupancy measured/);
  assert.match(knownOut, /GROUPS/);

  const unknown = makeComponent({
    snapshot: sampleSnapshot({
      usage: { tokens: null, contextWindow: 200000, percent: null },
    }),
  });
  const unknownOut = unknown.render(80).join("\n");
  assert.match(unknownOut, /\?\/200000 \(\?%\)/);
  assert.match(unknownOut, /occupancy unknown/);
  assert.doesNotMatch(unknownOut, /occupancy measured/);
  assert.doesNotMatch(unknownOut, /█/);

  const noUsage = makeComponent({ snapshot: sampleSnapshot({ usage: undefined }) });
  assert.doesNotMatch(noUsage.render(80).join("\n"), /occupancy /);
});

test("overlay toggles icicle without regressing groups/items/Enter-open", async () => {
  let opened: string | undefined;
  const component = makeComponent({
    openPath: async (path) => {
      opened = path;
      return true;
    },
  });

  assert.match(component.render(80).join("\n"), /GROUPS/);
  component.handleInput(KEY.i);
  const icicle = component.render(80).join("\n");
  assert.match(icicle, /ICICLE/);
  assert.match(icicle, /Icicle/);
  assert.match(icicle, /frame/);
  assert.match(icicle, /User messages items/);

  component.handleInput(KEY.right);
  assert.match(component.render(80).join("\n"), /Tool calls/);
  assert.match(component.render(80).join("\n"), /ICICLE/);

  component.handleInput(KEY.tab);
  assert.match(component.render(80).join("\n"), /ITEMS/);
  component.handleInput(KEY.enter);
  await Promise.resolve();
  assert.equal(opened, "/repo/a.ts");
  opened = undefined;

  component.handleInput(KEY.g);
  assert.match(component.render(80).join("\n"), /GROUPS/);
  assert.match(component.render(80).join("\n"), /Groups/);

  component.handleInput(KEY.tab);
  assert.match(component.render(80).join("\n"), /ICICLE/);
  component.handleInput(KEY.tab);
  assert.match(component.render(80).join("\n"), /ITEMS/);
  component.handleInput(KEY.tab);
  assert.match(component.render(80).join("\n"), /GROUPS/);

  component.handleInput(KEY.up);
  component.handleInput(KEY.right);
  assert.match(component.render(80).join("\n"), /ITEMS/);
  component.handleInput(KEY.enter);
  await Promise.resolve();
  assert.equal(opened, undefined);

  component.handleInput(KEY.left);
  component.handleInput(KEY.down);
  component.handleInput(KEY.right);
  component.handleInput(KEY.enter);
  await Promise.resolve();
  assert.equal(opened, "/repo/a.ts");
});

test("icicle Enter opens the selected file-backed item", async () => {
  let opened: string | undefined;
  const component = makeComponent({
    openPath: async (path) => {
      opened = path;
      return true;
    },
  });
  component.handleInput(KEY.i);
  component.handleInput(KEY.right);
  component.handleInput(KEY.down);
  component.handleInput(KEY.enter);
  await Promise.resolve();
  assert.equal(opened, "/repo/a.ts");
});

test("frozen overlay no-ops setSnapshot", () => {
  const component = makeComponent({ freezeOnInput: true });
  component.handleInput("x");
  assert.match(component.render(80).join("\n"), /FROZEN/);
  component.setSnapshot(sampleSnapshot({ modelLabel: "changed-model" }));
  const frozen = component.render(80).join("\n");
  assert.match(frozen, /FROZEN/);
  assert.doesNotMatch(frozen, /changed-model/);
});

test("icicle and occupancy rendering never exceed the requested width", () => {
  const component = makeComponent({
    snapshot: sampleSnapshot({
      usage: { tokens: 40, contextWindow: 100, percent: 40 },
    }),
  });
  component.handleInput(KEY.i);
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
