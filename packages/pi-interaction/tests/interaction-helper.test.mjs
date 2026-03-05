import assert from "node:assert/strict";
import test from "node:test";

import {
  rankCandidatesFallback,
  registerPickerInteraction,
  selectFuzzyCandidate,
  splitQueryAndContext,
} from "../src/InteractionHelper.js";
import { TriggerBroker } from "../src/TriggerBroker.js";

function contextFromText(text) {
  return {
    fullText: text,
    textBeforeCursor: text,
    textAfterCursor: "",
    cursorLine: 0,
    cursorColumn: text.length,
    totalLines: 1,
    isLive: true,
  };
}

test("splitQueryAndContext parses :: suffix", () => {
  assert.deepEqual(splitQueryAndContext("nexus::incident triage"), {
    query: "nexus",
    context: "incident triage",
  });
  assert.deepEqual(splitQueryAndContext("nexus"), {
    query: "nexus",
    context: "",
  });
});

test("rankCandidatesFallback prioritizes exact/prefix matches", () => {
  const ranked = rankCandidatesFallback(
    [
      { id: "inversion", label: "/vault:inversion", detail: "shadow", source: "vault" },
      { id: "nexus", label: "/vault:nexus", detail: "leverage", source: "vault" },
    ],
    "nex",
  );

  assert.equal(ranked[0].id, "nexus");
});

test("registerPickerInteraction wires parse/load/select/apply with telemetry", async () => {
  const broker = new TriggerBroker();
  const telemetry = [];
  const applied = [];
  const editorState = { text: "" };

  broker.setAPI({
    setText(text) {
      editorState.text = text;
    },
    notify() {
      // no-op
    },
  });

  const registration = registerPickerInteraction(
    {
      id: "unit-vault-picker",
      description: "Unit picker",
      match: /^\/vault:(.*)$/,
      debounceMs: 0,
      disableFzf: true,
      parseInput: (match) => {
        const parsed = splitQueryAndContext(String(match?.groups?.[0] ?? ""));
        return {
          query: parsed.query,
          context: parsed.context,
          raw: String(match?.groups?.[0] ?? ""),
        };
      },
      minQueryLength: 1,
      loadCandidates: () => ({
        candidates: [
          {
            id: "nexus",
            label: "/vault:nexus",
            detail: "leverage",
            source: "vault",
          },
        ],
      }),
      applySelection: ({ selected, parsed, api }) => {
        applied.push({ selected: selected.id, context: parsed.context });
        api.setText(`${selected.id}:${parsed.context}`);
      },
      telemetry: (event) => telemetry.push(event),
    },
    { broker },
  );

  assert.equal(registration.success, true);

  await broker.checkAndFire(contextFromText("/vault:nex::incident"));

  assert.equal(editorState.text, "nexus:incident");
  assert.deepEqual(applied[0], { selected: "nexus", context: "incident" });

  const eventNames = telemetry.map((event) => event.event);
  assert.ok(eventNames.includes("trigger-matched"));
  assert.ok(eventNames.includes("selection-applied"));
});

test("registerPickerInteraction prompts for query when empty", async () => {
  const broker = new TriggerBroker();
  const telemetry = [];
  const editorState = { text: "" };
  let inputCalls = 0;

  broker.setAPI({
    setText(text) {
      editorState.text = text;
    },
    async input() {
      inputCalls += 1;
      return "nex";
    },
    async select(_title, options) {
      return options[0] ?? null;
    },
    notify() {
      // no-op
    },
  });

  registerPickerInteraction(
    {
      id: "unit-query-prompt",
      description: "Query prompt",
      match: /^\/vault:(.*)$/,
      debounceMs: 0,
      disableFzf: true,
      minQueryLength: 0,
      promptForQueryWhenEmpty: true,
      promptQueryThreshold: 1,
      loadCandidates: () => ({
        candidates: [
          {
            id: "nexus",
            label: "/vault:nexus",
            detail: "leverage",
            source: "vault",
          },
          {
            id: "inversion",
            label: "/vault:inversion",
            detail: "shadow",
            source: "vault",
          },
        ],
      }),
      applySelection: ({ selected, api }) => {
        api.setText(selected.id);
      },
      telemetry: (event) => telemetry.push(event),
    },
    { broker },
  );

  await broker.checkAndFire(contextFromText("/vault:"));

  assert.equal(inputCalls, 1);
  assert.equal(editorState.text, "nexus");
  assert.ok(telemetry.some((event) => event.event === "query-prompt-submitted"));
});

test("registerPickerInteraction validates primitive config boundaries", () => {
  const broker = new TriggerBroker();

  assert.throws(
    () =>
      registerPickerInteraction(
        {
          id: "unit-invalid-config",
          description: "Invalid",
          match: /^\/vault:(.*)$/,
          debounceMs: "fast",
          loadCandidates: () => ({ candidates: [] }),
          applySelection: () => {
            // no-op
          },
        },
        { broker },
      ),
    /invalid config option type|debounceMs/i,
  );
});

test("registerPickerInteraction rejects non-finite number options", () => {
  const broker = new TriggerBroker();

  assert.throws(
    () =>
      registerPickerInteraction(
        {
          id: "unit-non-finite-config",
          description: "Invalid",
          match: /^\/vault:(.*)$/,
          timeoutMs: Number.POSITIVE_INFINITY,
          loadCandidates: () => ({ candidates: [] }),
          applySelection: () => {
            // no-op
          },
        },
        { broker },
      ),
    /invalid config option type|must be a finite number/i,
  );
});

test("selectFuzzyCandidate supports inline typing via custom overlay", async () => {
  const candidates = [
    { id: "inversion", label: "/vault:inversion", detail: "shadow", source: "vault" },
    { id: "nexus", label: "/vault:nexus", detail: "leverage", source: "vault" },
  ];

  const selection = await selectFuzzyCandidate(candidates, {
    title:
      "This title is intentionally very long to ensure the custom picker line truncation is always width-safe",
    query: "",
    disableFzf: true,
    ui: {
      custom: async (factory, _options) => {
        return new Promise((resolve) => {
          const component = factory(
            { requestRender() {} },
            {
              fg: (_name, text) => `\u001b[38;2;120;120;120m${text}\u001b[39m`,
              bold: (text) => `\u001b[1m${text}\u001b[22m`,
            },
            {},
            (value) => resolve(value),
          );

          const stripAnsi = (value) => {
            const esc = String.fromCharCode(27);
            let result = "";
            let index = 0;

            while (index < value.length) {
              if (value[index] === esc && value[index + 1] === "[") {
                index += 2;
                while (index < value.length && !/[A-Za-z]/.test(value[index])) {
                  index += 1;
                }
                if (index < value.length) {
                  index += 1;
                }
                continue;
              }

              result += value[index];
              index += 1;
            }

            return result;
          };

          const rendered = component.render(40);
          for (const line of rendered) {
            const visible = stripAnsi(line).length;
            assert.ok(visible <= 40);
          }

          component.handleInput("n");
          component.handleInput("e");
          component.handleInput("x");
          component.handleInput("\r");
        });
      },
    },
  });

  assert.ok(selection.selected);
  assert.equal(selection.selected.id, "nexus");
});

test("selectFuzzyCandidate overlay handles Backspace/Delete while filtering", async () => {
  const candidates = [
    { id: "inversion", label: "/vault:inversion", detail: "shadow", source: "vault" },
    { id: "nexus", label: "/vault:nexus", detail: "leverage", source: "vault" },
  ];

  const selection = await selectFuzzyCandidate(candidates, {
    title: "Backspace/Delete test",
    query: "",
    disableFzf: true,
    ui: {
      custom: async (factory, _options) =>
        new Promise((resolve) => {
          const component = factory(
            { requestRender() {} },
            {
              fg: (_name, text) => text,
              bold: (text) => text,
            },
            {},
            (value) => resolve(value),
          );

          component.handleInput("n");
          component.handleInput("e");
          component.handleInput("x");
          component.handleInput("\x7f"); // Backspace => "ne"
          component.handleInput("\x1b[3~"); // Delete => "n"
          component.handleInput("\r");
        }),
    },
  });

  assert.ok(selection.selected);
  assert.equal(selection.selected.id, "nexus");
});

test("selectFuzzyCandidate overlay handles Ctrl+C cancel", async () => {
  const candidates = [
    { id: "inversion", label: "/vault:inversion", detail: "shadow", source: "vault" },
    { id: "nexus", label: "/vault:nexus", detail: "leverage", source: "vault" },
  ];

  const selection = await selectFuzzyCandidate(candidates, {
    title: "Ctrl+C cancel test",
    query: "",
    disableFzf: true,
    ui: {
      custom: async (factory, _options) =>
        new Promise((resolve) => {
          const component = factory(
            { requestRender() {} },
            {
              fg: (_name, text) => text,
              bold: (text) => text,
            },
            {},
            (value) => resolve(value),
          );

          component.handleInput("\x03"); // Ctrl+C
        }),
    },
  });

  assert.equal(selection.selected, null);
  assert.equal(selection.reason, "cancelled");
});

test("selectFuzzyCandidate overlay handles kitty Ctrl+C cancel", async () => {
  const candidates = [
    { id: "inversion", label: "/vault:inversion", detail: "shadow", source: "vault" },
    { id: "nexus", label: "/vault:nexus", detail: "leverage", source: "vault" },
  ];

  const selection = await selectFuzzyCandidate(candidates, {
    title: "Kitty Ctrl+C cancel test",
    query: "",
    disableFzf: true,
    ui: {
      custom: async (factory, _options) =>
        new Promise((resolve) => {
          const component = factory(
            { requestRender() {} },
            {
              fg: (_name, text) => text,
              bold: (text) => text,
            },
            {},
            (value) => resolve(value),
          );

          component.handleInput("\x1b[99;5u"); // kitty Ctrl+C
        }),
    },
  });

  assert.equal(selection.selected, null);
  assert.equal(selection.reason, "cancelled");
});

test("selectFuzzyCandidate overlay handles modified Delete sequence", async () => {
  const candidates = [
    { id: "inversion", label: "/vault:inversion", detail: "shadow", source: "vault" },
    { id: "nexus", label: "/vault:nexus", detail: "leverage", source: "vault" },
  ];

  const selection = await selectFuzzyCandidate(candidates, {
    title: "Modified delete test",
    query: "",
    disableFzf: true,
    ui: {
      custom: async (factory, _options) =>
        new Promise((resolve) => {
          const component = factory(
            { requestRender() {} },
            {
              fg: (_name, text) => text,
              bold: (text) => text,
            },
            {},
            (value) => resolve(value),
          );

          component.handleInput("n");
          component.handleInput("e");
          component.handleInput("x");
          component.handleInput("\x1b[3;5~"); // modified Delete sequence
          component.handleInput("\r");
        }),
    },
  });

  assert.ok(selection.selected);
  assert.equal(selection.selected.id, "nexus");
});

test("registerPickerInteraction enforces maxOptions cap", async () => {
  const broker = new TriggerBroker();
  let seenOptionCount = 0;

  const manyCandidates = Array.from({ length: 50 }).map((_, index) => ({
    id: `template-${index + 1}`,
    label: `/vault:template-${index + 1}`,
    detail: "candidate",
    source: "vault",
  }));

  broker.setAPI({
    setText() {
      // no-op
    },
    async select(_title, options) {
      seenOptionCount = options.length;
      return options[0] ?? null;
    },
    notify() {
      // no-op
    },
  });

  registerPickerInteraction(
    {
      id: "unit-max-options",
      description: "Max options",
      match: /^\/vault:(.*)$/,
      debounceMs: 0,
      disableFzf: true,
      minQueryLength: 0,
      maxOptions: 7,
      loadCandidates: () => ({ candidates: manyCandidates }),
      applySelection: () => {
        // no-op
      },
    },
    { broker },
  );

  await broker.checkAndFire(contextFromText("/vault:"));

  assert.equal(seenOptionCount, 7);
});
