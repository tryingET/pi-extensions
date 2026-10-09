import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { registerHooks } from "node:module";
import test from "node:test";
import {
  type BuildSystemPromptOptions,
  createExtensionRuntime,
  type Extension,
  type ExtensionAPI,
  type ExtensionContext,
  ExtensionRunner,
  SessionManager,
} from "@earendil-works/pi-coding-agent";
import ontology from "../extensions/ontology-workflows.ts";
import {
  ONTOLOGY_GUIDANCE,
  ONTOLOGY_GUIDANCE_SECTION,
  registerOntologyPromptGuidance,
} from "../src/semantic/prompt-guidance.ts";

// Test wiring only: sibling modes has no install in this borrowed-dependency worktree.
// Bind its host import to this package's pinned host, never edit its source or links.
const resolution = registerHooks({
  resolve(specifier, context, nextResolve) {
    if (
      specifier === "@earendil-works/pi-coding-agent" &&
      context.parentURL?.includes("/packages/pi-modes/")
    )
      return nextResolve(import.meta.resolve(specifier), context);
    return nextResolve(specifier, context);
  },
});
const { composeModeSelection } = await import(
  new URL("../../pi-modes/src/prompt-composition.ts", import.meta.url).href
);
const { default: toolbox } = await import(
  new URL("../../pi-toolbox-discovery/extensions/toolbox.ts", import.meta.url).href
);
const { ALWAYS_ACTIVE_TOOLS } = await import(
  new URL("../../pi-toolbox-discovery/src/toolbox-contract.ts", import.meta.url).href
);
resolution.deregister();
assert.equal(
  JSON.parse(
    readFileSync(
      new URL("../package.json", import.meta.resolve("@earendil-works/pi-coding-agent")),
      "utf8",
    ),
  ).version,
  "1.1.0",
);
const { buildSystemPrompt, buildSystemPromptSections } = (await import(
  new URL("./core/system-prompt.js", import.meta.resolve("@earendil-works/pi-coding-agent")).href
)) as {
  buildSystemPrompt(options: BuildSystemPromptOptions): string;
  buildSystemPromptSections(options: BuildSystemPromptOptions): Record<string, string>;
};

type Handler = (event: never, ctx: never) => unknown;
function harness() {
  const handlers = new Map<string, Handler[]>();
  const toolboxHandlers = new Map<string, Handler[]>();
  const guidelines: Record<string, string[]> = {};
  const errors: unknown[] = [];
  const notices: string[] = [];
  const commands = new Map<string, { handler: (args: string, ctx: never) => Promise<void> }>();
  let active = [...ALWAYS_ACTIVE_TOOLS, "ontology_inspect", "ontology_proposal", "ontology_change"];
  const api = {
    on(name: string, handler: Handler) {
      handlers.set(name, [...(handlers.get(name) ?? []), handler]);
    },
    registerCommand(
      name: string,
      command: { handler: (args: string, ctx: never) => Promise<void> },
    ) {
      commands.set(name, command);
    },
    registerTool(tool: { name: string; promptGuidelines?: string[] }) {
      guidelines[tool.name] = tool.promptGuidelines ?? [];
    },
    getAllTools() {
      return [...new Set([...ALWAYS_ACTIVE_TOOLS, ...Object.keys(guidelines)])].map((name) => ({
        name,
      }));
    },
    getActiveTools() {
      return [...active];
    },
    setActiveTools(names: string[]) {
      active = [...names];
    },
  };
  ontology(api as unknown as ExtensionAPI);
  toolbox({
    ...api,
    on(name: string, handler: Handler) {
      toolboxHandlers.set(name, [...(toolboxHandlers.get(name) ?? []), handler]);
    },
  });
  const ctx = {
    cwd: "/workspace/repo",
    mode: "tui",
    hasUI: true,
    ui: {
      notify(text: string) {
        notices.push(text);
      },
      setStatus() {},
    },
  };
  for (const handler of toolboxHandlers.get("session_start") ?? [])
    handler({} as never, ctx as never);
  assert.deepEqual(active, ALWAYS_ACTIVE_TOOLS);
  assert.ok(!active.some((name) => name.startsWith("ontology_")));
  const session = SessionManager.inMemory(ctx.cwd);
  const runner = new ExtensionRunner(
    [{ path: "test-ontology", handlers } as unknown as Extension],
    createExtensionRuntime(),
    ctx.cwd,
    session,
    {} as never,
  );
  runner.createContext = () => ctx as unknown as ExtensionContext;
  runner.onError((error) => errors.push(error));
  const options: BuildSystemPromptOptions = {
    cwd: ctx.cwd,
    selectedTools: active,
    toolGuidelines: guidelines,
    appendSystemPrompt: "OPERATOR APPENDIX",
    sections: { existing: "EXISTING SECTION" },
    contextFiles: [{ path: "/workspace/AGENTS.md", content: "PROJECT CONTEXT" }],
  };
  return { runner, options, session, handlers, commands, ctx, errors, notices };
}

test("Pi 1.1 actual toolbox startup keeps fixed SYSTEM authority with ontology tools inactive", async () => {
  const h = harness();
  const prefixes: string[] = [];
  for (const prompt of [
    "ordinary task",
    "ontology task",
    "concept relation invariant system4d semantic meaning bridge mapping",
    "",
  ]) {
    const result = await h.runner.emitBeforeAgentStart(prompt, undefined, h.options);
    assert.equal(result.systemPromptOptions.forceSystemPrompt, undefined);
    const sections = buildSystemPromptSections(result.systemPromptOptions);
    assert.equal(
      sections[ONTOLOGY_GUIDANCE_SECTION],
      `<ontology_workflow>\n${ONTOLOGY_GUIDANCE}\n</ontology_workflow>`,
    );
    assert.equal(sections.existing, "<existing>\nEXISTING SECTION\n</existing>");
    prefixes.push(buildSystemPrompt(result.systemPromptOptions));
    if (result.messages.length) {
      assert.equal(result.messages.length, 1);
      const message = result.messages[0];
      assert.equal(message.customType, "ontology-semantic-preflight");
      assert.equal(message.display, false);
      assert.match(String(message.content), /disabled; no semantic discovery/);
      assert.match(String(message.content), /active-prompt-run-only/);
      assert.doesNotMatch(String(message.content), /Use ontology_change/);
      h.session.appendCustomMessageEntry(
        message.customType,
        message.content,
        message.display,
        message.details,
      );
    }
  }
  assert.ok(prefixes.every((prefix) => prefix === prefixes[0]));
  assert.match(prefixes[0], /before inventing or changing concepts, relations, invariants/);
  assert.match(prefixes[0], /OPERATOR APPENDIX/);
  assert.match(prefixes[0], /PROJECT CONTEXT/);
  const header = h.session.getHeader();
  assert.ok(header);
  const replay = SessionManager.inMemory(h.ctx.cwd, undefined, [header, ...h.session.getEntries()]);
  assert.deepEqual(replay.buildSessionContext().messages, h.session.buildSessionContext().messages);
  assert.equal(replay.buildSessionContext().messages.length, 2);
  assert.deepEqual(h.errors, []);
  assert.deepEqual(h.notices, []);
});

test("actual later pi-modes composition retains guidance for native, append, and replace-base", async () => {
  for (const strategy of ["native", "append", "replace_base", "replace_final"]) {
    const h = harness();
    const mode = {
      schemaVersion: 2,
      key: "test",
      label: "Test",
      description: "",
      scope: "builtin",
      path: "builtin:test",
      promptStrategy: strategy,
      systemPrompt: "LATER MODE BYTES",
      requires: [],
      conflictsWith: [],
      before: [],
      after: [],
    };
    h.handlers.get("before_agent_start")?.push((raw) => {
      const event = raw as { systemPrompt: string; systemPromptOptions: BuildSystemPromptOptions };
      const selection =
        strategy === "append"
          ? { baseKey: null, overlayKeys: ["test"] }
          : strategy === "native"
            ? { baseKey: null, overlayKeys: [] }
            : { baseKey: "test", overlayKeys: [] };
      const composed = composeModeSelection(
        selection,
        strategy === "native" ? [] : [mode],
        event.systemPromptOptions,
        event.systemPrompt,
        new Map(),
      );
      assert.equal(composed.resolved.blocked, false, JSON.stringify(composed.resolved.diagnostics));
      const { customPrompt, sections, forceSystemPrompt } = composed.changes;
      if (forceSystemPrompt !== undefined) return { systemPrompt: forceSystemPrompt };
      if (customPrompt !== undefined) event.systemPromptOptions.customPrompt = customPrompt;
      if (sections)
        event.systemPromptOptions.sections = { ...event.systemPromptOptions.sections, ...sections };
    });
    const ordinary = await h.runner.emitBeforeAgentStart("ordinary", undefined, h.options);
    const triggered = await h.runner.emitBeforeAgentStart("ontology", undefined, h.options);
    assert.equal(
      buildSystemPrompt(ordinary.systemPromptOptions),
      buildSystemPrompt(triggered.systemPromptOptions),
    );
    const rendered = buildSystemPrompt(triggered.systemPromptOptions);
    if (strategy === "replace_final") {
      assert.equal(rendered, "LATER MODE BYTES"); // deliberate full replacement owns these bytes
    } else {
      assert.equal(triggered.systemPromptOptions.forceSystemPrompt, undefined);
      assert.match(rendered, /Ontology workflow routing directives/);
      assert.match(rendered, /PROJECT CONTEXT/);
      if (strategy !== "native") assert.match(rendered, /LATER MODE BYTES/);
    }
    assert.equal(triggered.messages.length, 1);
    assert.equal(ordinary.messages.length, 0);
    assert.deepEqual(h.errors, []);
  }
});

test("default guidance remains present after withdraw and in non-TUI modes", async () => {
  const h = harness();
  await h.commands.get("ontology-preflight")?.handler("disable", h.ctx as never);
  const withdrawn = await h.runner.emitBeforeAgentStart("ontology", undefined, h.options);
  assert.equal(withdrawn.systemPromptOptions.forceSystemPrompt, undefined);
  assert.match(String(withdrawn.messages[0]?.content), /disabled; no semantic discovery/);
  for (const mode of ["print", "json", "rpc"]) {
    h.ctx.mode = mode;
    const result = await h.runner.emitBeforeAgentStart("ontology", undefined, h.options);
    assert.equal(result.systemPromptOptions.sections[ONTOLOGY_GUIDANCE_SECTION], ONTOLOGY_GUIDANCE);
    assert.equal(result.messages.length, 0); // accepted non-TUI advisory posture remains unchanged
    assert.equal(result.systemPromptOptions.forceSystemPrompt, undefined);
  }
  assert.deepEqual(h.errors, []);
});

test("mutable append option fallback is fixed and idempotent; text-only hosts fail visibly", () => {
  let before!: Handler;
  registerOntologyPromptGuidance({
    on(_name: string, handler: Handler) {
      before = handler;
    },
  } as never);
  const options = { appendSystemPrompt: "EXISTING" };
  const event = { systemPromptOptions: options };
  before(event as never, {} as never);
  const first = options.appendSystemPrompt;
  before(event as never, {} as never);
  assert.equal(options.appendSystemPrompt, first);
  assert.equal(first, `EXISTING\n\n${ONTOLOGY_GUIDANCE}`);
  for (const unsupported of [{}, { systemPromptOptions: Object.freeze({ sections: {} }) }]) {
    const notices: string[] = [];
    assert.throws(
      () =>
        before(
          unsupported as never,
          {
            hasUI: true,
            ui: {
              notify(text: string) {
                notices.push(text);
              },
            },
          } as never,
        ),
      /hosts are unsupported/,
    );
    assert.match(notices[0], /SYSTEM guidance unavailable/);
  }
});
