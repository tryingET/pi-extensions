import assert from "node:assert/strict";
import test from "node:test";

import { registerPickerInteraction } from "../src/register.js";
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
      parseInput: (match) => ({
        query: String(match?.groups?.[0] ?? "").split("::")[0] ?? "",
        context: String(match?.groups?.[0] ?? "").split("::")[1] ?? "",
        raw: String(match?.groups?.[0] ?? ""),
      }),
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
