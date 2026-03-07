import assert from "node:assert/strict";
import test from "node:test";
import { rankCandidatesFallback, selectFuzzyCandidate } from "../src/fuzzySelector.js";

const CANDIDATES = [
  { id: "nexus", label: "/vault:nexus", detail: "[cognitive] highest leverage", source: "vault" },
  {
    id: "inversion",
    label: "/vault:inversion",
    detail: "[cognitive] shadow analysis",
    source: "vault",
  },
  { id: "audit", label: "/vault:audit", detail: "[task] review checklist", source: "vault" },
];

test("rankCandidatesFallback prioritizes prefix matches", () => {
  const ranked = rankCandidatesFallback(CANDIDATES, "inv");
  assert.equal(ranked[0].id, "inversion");
});

test("selectFuzzyCandidate maps chosen option to candidate", async () => {
  const selection = await selectFuzzyCandidate(CANDIDATES, {
    query: "",
    ui: {
      async select(_title, options) {
        return options.find((option) => option.includes("/vault:nexus"));
      },
    },
  });

  assert.ok(selection.selected);
  assert.equal(selection.selected.id, "nexus");
});

test("selectFuzzyCandidate returns explicit empty-candidates reason", async () => {
  const selection = await selectFuzzyCandidate([], { query: "nex" });
  assert.equal(selection.selected, null);
  assert.equal(selection.reason, "empty-candidates");
  assert.equal(selection.mode, "fallback");
});

test("selectFuzzyCandidate falls back when fzf is unavailable", async () => {
  const previousPath = process.env.PATH;
  process.env.PATH = "/__missing_fzf_path__";

  try {
    const selection = await selectFuzzyCandidate(CANDIDATES, { query: "nex" });
    assert.ok(selection.selected);
    assert.equal(selection.selected.id, "nexus");
    assert.equal(selection.mode, "fallback");
    assert.equal(selection.reason, "fzf-not-installed");
  } finally {
    process.env.PATH = previousPath;
  }
});

test("selectFuzzyCandidate auto-selects in non-tty mode", async () => {
  const selection = await selectFuzzyCandidate(CANDIDATES, { query: "nex" });
  assert.ok(selection.selected);
  assert.equal(selection.selected.id, "nexus");
  assert.ok(
    selection.reason === "non-tty-auto-selected" || selection.reason === "fzf-not-installed",
  );
});

test("selectFuzzyCandidate annotates picker title with mode and counts", async () => {
  const previousPath = process.env.PATH;
  process.env.PATH = "/__missing_fzf_path__";

  try {
    let seenTitle = "";
    const selection = await selectFuzzyCandidate(CANDIDATES, {
      query: "nex",
      ui: {
        async select(title, options) {
          seenTitle = title;
          return options[0];
        },
      },
    });

    assert.ok(selection.selected);
    assert.match(seenTitle, /mode=fallback/);
    assert.match(seenTitle, /\[\d+\/3\]/);
  } finally {
    process.env.PATH = previousPath;
  }
});
