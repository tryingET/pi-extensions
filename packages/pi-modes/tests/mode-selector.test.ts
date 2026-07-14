import assert from "node:assert/strict";
import test from "node:test";
import type { ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import { selectModeComposition } from "../src/mode-selector.ts";
import { type ModeSelection, parseModeDefinition, type ResolvedMode } from "../src/modes.ts";

function mode(
  key: string,
  promptStrategy: "append" | "replace_base" | "replace_final",
): ResolvedMode {
  return {
    ...parseModeDefinition({ key, label: key, promptStrategy, systemPrompt: key }),
    scope: "global",
  };
}

const modes = [
  mode("builder", "replace_base"),
  mode("exact", "replace_final"),
  mode("review", "append"),
  mode("explain", "append"),
];

interface TestSelectorComponent {
  render(width: number): string[];
  handleInput(data: string): void;
}

type TestSelectorFactory = (
  tui: { requestRender(): void },
  theme: {
    fg(color: string, text: string): string;
    bg(color: string, text: string): string;
    bold(text: string): string;
  },
  keybindings: { matches(data: string, action: string): boolean },
  done: (value: ModeSelection | null) => void,
) => TestSelectorComponent;

async function runSelector(
  initial: ModeSelection,
  inputs: string[],
): Promise<ModeSelection | null> {
  const ctx = {
    mode: "tui",
    ui: {
      custom: async (factory: TestSelectorFactory) => {
        let result: ModeSelection | null | undefined;
        const component = factory(
          { requestRender() {} },
          {
            fg: (_color: string, text: string) => text,
            bg: (_color: string, text: string) => text,
            bold: (text: string) => text,
          },
          {
            matches(data: string, action: string) {
              return (
                (data === "U" && action === "tui.select.up") ||
                (data === "D" && action === "tui.select.down") ||
                (data === "E" && action === "tui.select.confirm") ||
                (data === "X" && action === "tui.select.cancel")
              );
            },
          },
          (value: ModeSelection | null) => {
            result = value;
          },
        );
        component.render(100);
        for (const input of inputs) component.handleInput(input);
        return result;
      },
    },
  } as unknown as ExtensionCommandContext;
  return selectModeComposition(ctx, modes, initial);
}

async function renderAfterFilter(
  filter: string | string[],
  availableModes: readonly ResolvedMode[] = modes,
): Promise<string[]> {
  let rendered: string[] = [];
  const ctx = {
    mode: "tui",
    ui: {
      custom: async (factory: TestSelectorFactory) => {
        const component = factory(
          { requestRender() {} },
          {
            fg: (_color: string, text: string) => text,
            bg: (_color: string, text: string) => text,
            bold: (text: string) => text,
          },
          { matches: () => false },
          () => {},
        );
        for (const input of Array.isArray(filter) ? filter : [...filter]) {
          component.handleInput(input);
        }
        rendered = component.render(100);
        return null;
      },
    },
  } as unknown as ExtensionCommandContext;
  await selectModeComposition(
    ctx,
    availableModes,
    { baseKey: "builder", overlayKeys: ["review"] },
    { preview: () => ["123 B · ~31 tokens · sha256:abcdef", "Δ host: +10 B"] },
  );
  return rendered;
}

test("selector applies base plus multiple overlays atomically", async () => {
  const result = await runSelector({ baseKey: "builder", overlayKeys: ["review"] }, [
    "D",
    "D",
    "D",
    "D",
    "E",
    "D",
    "E",
  ]);
  assert.deepEqual(result, { baseKey: "builder", overlayKeys: ["review", "explain"] });
});

test("selector cancel returns no draft", async () => {
  assert.equal(await runSelector({ baseKey: "builder", overlayKeys: ["review"] }, ["X"]), null);
});

test("selector search filters large lists while retaining details and live diff", async () => {
  const rendered = (await renderAfterFilter("rev")).join("\n");
  assert.match(rendered, /filter: rev/);
  assert.match(rendered, /review/);
  assert.doesNotMatch(rendered, /exact \[/);
  assert.match(rendered, /Details \/ live composition diff/);
  assert.match(rendered, /sha256:abcdef/);
  const kitty = (await renderAfterFilter(["\u001b[114u", "\u001b[101u", "\u001b[118u"])).join("\n");
  assert.match(kitty, /filter: rev/);
});

test("selector rendering remains bounded at large discovery sizes", async () => {
  const many = [
    mode("builder", "replace_base"),
    mode("review", "append"),
    ...Array.from({ length: 100 }, (_, index) =>
      mode(`o${String(index).padStart(3, "0")}`, "append"),
    ),
  ];
  const rendered = await renderAfterFilter("", many);
  assert.ok(rendered.length < 40, `selector rendered ${rendered.length} lines`);
  assert.match(rendered.join("\n"), /Choices 1-18 of 105/);
});

test("selector drafts replace_final atomically and leaves confirmation to the command gate", async () => {
  const result = await runSelector({ baseKey: "builder", overlayKeys: ["review"] }, [
    "D",
    "D",
    "E",
    "D",
    "D",
    "D",
    "E",
  ]);
  assert.deepEqual(result, { baseKey: "exact", overlayKeys: [] });
});
