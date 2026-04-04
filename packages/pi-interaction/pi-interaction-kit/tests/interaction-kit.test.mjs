import assert from "node:assert/strict";
import test from "node:test";

import { rankCandidatesFallback, selectFuzzyCandidate, splitQueryAndContext } from "../index.js";

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

test("selectFuzzyCandidate custom overlay treats tab as confirm", async () => {
  const candidates = [
    { id: "inversion", label: "/vault:inversion", detail: "shadow", source: "vault" },
    { id: "nexus", label: "/vault:nexus", detail: "leverage", source: "vault" },
  ];

  const selection = await selectFuzzyCandidate(candidates, {
    title: "Overlay tab confirm",
    query: "nex",
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

          component.handleInput("\t");
        }),
    },
  });

  assert.ok(selection.selected);
  assert.equal(selection.selected.id, "nexus");
});

test("selectFuzzyCandidate custom overlay ignores raw control characters in the query input", async () => {
  const candidates = [
    { id: "inversion", label: "/vault:inversion", detail: "shadow", source: "vault" },
    { id: "nexus", label: "/vault:nexus", detail: "leverage", source: "vault" },
  ];

  const selection = await selectFuzzyCandidate(candidates, {
    title: "Overlay control-char guard",
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

          component.handleInput("\u0001");
          component.handleInput("\r");
        }),
    },
  });

  assert.ok(selection.selected);
  assert.equal(selection.selected.id, "inversion");
});

test("selectFuzzyCandidate custom overlay treats raw ctrl-u as clear-query", async () => {
  const candidates = [
    { id: "inversion", label: "/vault:inversion", detail: "shadow", source: "vault" },
    { id: "nexus", label: "/vault:nexus", detail: "leverage", source: "vault" },
  ];

  const selection = await selectFuzzyCandidate(candidates, {
    title: "Overlay ctrl-u clear",
    query: "nex",
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

          component.handleInput("\u0015");
          component.handleInput("\r");
        }),
    },
  });

  assert.ok(selection.selected);
  assert.equal(selection.selected.id, "inversion");
});
