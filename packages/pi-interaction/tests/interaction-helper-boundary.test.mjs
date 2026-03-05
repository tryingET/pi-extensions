import assert from "node:assert/strict";
import test from "node:test";

import { registerPickerInteraction, selectFuzzyCandidate } from "../src/InteractionHelper.js";
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

test("registerPickerInteraction rejects unknown config keys", () => {
  const broker = new TriggerBroker();

  assert.throws(
    () =>
      registerPickerInteraction(
        {
          id: "unit-unknown-config",
          description: "Invalid",
          match: /^\/vault:(.*)$/,
          debouceMs: 50,
          loadCandidates: () => ({ candidates: [] }),
          applySelection: () => {
            // no-op
          },
        },
        { broker },
      ),
    /unknown config keys: debouceMs/i,
  );
});

test("registerPickerInteraction rejects unsupported handler key", () => {
  const broker = new TriggerBroker();

  assert.throws(
    () =>
      registerPickerInteraction(
        {
          id: "unit-handler-key",
          description: "Invalid",
          match: /^\/vault:(.*)$/,
          handler: () => {
            // not supported in registerPickerInteraction config
          },
          loadCandidates: () => ({ candidates: [] }),
          applySelection: () => {
            // no-op
          },
        },
        { broker },
      ),
    /unknown config keys: handler/i,
  );
});

test("registerPickerInteraction rejects malformed candidate payloads", async () => {
  const broker = new TriggerBroker();
  const errors = [];
  let applied = false;

  broker.setAPI({
    setText() {
      // no-op
    },
    notify() {
      // no-op
    },
  });

  registerPickerInteraction(
    {
      id: "unit-malformed-candidates",
      description: "Malformed candidates",
      match: /^\/vault:(.*)$/,
      debounceMs: 0,
      disableFzf: true,
      loadCandidates: () => ({
        candidates: [
          {
            id: "bad-candidate",
            label: { bad: true },
            detail: "still-string",
            source: "vault",
          },
        ],
      }),
      applySelection: () => {
        applied = true;
      },
      onError: ({ error }) => {
        errors.push(error.message);
      },
    },
    { broker },
  );

  await broker.checkAndFire(contextFromText("/vault:any"));

  assert.equal(applied, false);
  assert.ok(errors.some((message) => message.includes("invalid sanitized candidates")));
});

test("registerPickerInteraction rejects malformed loadCandidates contract", async () => {
  const broker = new TriggerBroker();
  const errors = [];
  let applied = false;

  broker.setAPI({
    setText() {
      // no-op
    },
    notify() {
      // no-op
    },
  });

  registerPickerInteraction(
    {
      id: "unit-malformed-loader",
      description: "Malformed loadCandidates return",
      match: /^\/vault:(.*)$/,
      debounceMs: 0,
      disableFzf: true,
      loadCandidates: () => "not-an-array-or-object",
      applySelection: () => {
        applied = true;
      },
      onError: ({ error }) => {
        errors.push(error.message);
      },
    },
    { broker },
  );

  await broker.checkAndFire(contextFromText("/vault:any"));

  assert.equal(applied, false);
  assert.ok(errors.some((message) => message.includes("loadCandidates must return")));
});

test("registerPickerInteraction rejects malformed candidate ids instead of dropping them", async () => {
  const broker = new TriggerBroker();
  const errors = [];
  let applied = false;

  broker.setAPI({
    setText() {
      // no-op
    },
    notify() {
      // no-op
    },
  });

  registerPickerInteraction(
    {
      id: "unit-malformed-id",
      description: "Malformed id",
      match: /^\/vault:(.*)$/,
      debounceMs: 0,
      disableFzf: true,
      loadCandidates: () => ({
        candidates: [
          {
            id: 42,
            label: "/vault:number-id",
            detail: "invalid id type",
            source: "vault",
          },
        ],
      }),
      applySelection: () => {
        applied = true;
      },
      onError: ({ error }) => {
        errors.push(error.message);
      },
    },
    { broker },
  );

  await broker.checkAndFire(contextFromText("/vault:any"));

  assert.equal(applied, false);
  assert.ok(errors.some((message) => message.includes("invalid sanitized candidates")));
});

test("selectFuzzyCandidate custom overlay reports fallback mode when inline filtering is active", async () => {
  const candidates = [
    { id: "inversion", label: "/vault:inversion", detail: "shadow", source: "vault" },
    { id: "nexus", label: "/vault:nexus", detail: "leverage", source: "vault" },
  ];

  const selection = await selectFuzzyCandidate(candidates, {
    title: "Overlay mode test",
    query: "",
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

          component.handleInput("\r");
        }),
    },
  });

  assert.ok(selection.selected);
  assert.equal(selection.mode, "fallback");
  assert.equal(selection.reason, "inline-overlay-fallback");
});

test("selectFuzzyCandidate inline overlay reports no-match when initial query has no matches", async () => {
  const candidates = [
    { id: "inversion", label: "/vault:inversion", detail: "shadow", source: "vault" },
    { id: "nexus", label: "/vault:nexus", detail: "leverage", source: "vault" },
  ];

  const selection = await selectFuzzyCandidate(candidates, {
    title: "Overlay no-match reason test",
    query: "definitely-no-match",
    ui: {
      custom: async () => {
        throw new Error("custom UI should not be called for immediate no-match");
      },
    },
  });

  assert.equal(selection.selected, null);
  assert.equal(selection.mode, "fallback");
  assert.equal(selection.reason, "no-match");
});

test("selectFuzzyCandidate custom overlay uses maxOptions as visible row cap, not search-space cap", async () => {
  const candidates = Array.from({ length: 50 }).map((_, index) => ({
    id: `template-${index + 1}`,
    label: `/vault:template-${index + 1}`,
    detail: "candidate",
    source: "vault",
  }));

  const selection = await selectFuzzyCandidate(candidates, {
    title: "Overlay maxOptions cap",
    query: "",
    disableFzf: true,
    maxOptions: 5,
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

          const initialLines = component.render(120);
          const visibleCandidateLines = initialLines.filter((line) =>
            line.includes("/vault:template-"),
          ).length;
          assert.equal(visibleCandidateLines, 5);

          for (const char of "template-40") {
            component.handleInput(char);
          }
          component.handleInput("\r");
        }),
    },
  });

  assert.ok(selection.selected);
  assert.equal(selection.selected.id, "template-40");
});
