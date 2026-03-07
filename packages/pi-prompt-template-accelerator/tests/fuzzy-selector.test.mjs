import assert from "node:assert/strict";
import test from "node:test";
import { rankCandidatesFallback, selectFuzzyCandidate } from "../src/fuzzySelector.js";

const CANDIDATES = [
  { id: "inversion", label: "/inversion", detail: "shadow analysis", source: "ptx" },
  { id: "nexus", label: "/nexus", detail: "highest leverage", source: "ptx" },
  { id: "first-principles", label: "/first-principles", detail: "axiomatic rebuild", source: "ptx" },
];

test("rankCandidatesFallback prefers exact and prefix matches", () => {
  const ranked = rankCandidatesFallback(CANDIDATES, "inv");
  assert.equal(ranked[0].id, "inversion");
});

test("selectFuzzyCandidate maps UI selection back to candidate", async () => {
  const selection = await selectFuzzyCandidate(CANDIDATES, {
    query: "",
    ui: {
      async select(_title, options) {
        return options.find((option) => option.includes("/nexus"));
      },
    },
  });

  assert.ok(selection.selected);
  assert.equal(selection.selected.id, "nexus");
});

test("selectFuzzyCandidate returns explicit empty-candidates reason", async () => {
  const selection = await selectFuzzyCandidate([], { query: "inv" });
  assert.equal(selection.selected, null);
  assert.equal(selection.reason, "empty-candidates");
  assert.equal(selection.mode, "fallback");
});

test("selectFuzzyCandidate falls back when fzf is unavailable", async () => {
  const previousPath = process.env.PATH;
  process.env.PATH = "/__missing_fzf_path__";

  try {
    const selection = await selectFuzzyCandidate(CANDIDATES, { query: "inv" });
    assert.ok(selection.selected);
    assert.equal(selection.selected.id, "inversion");
    assert.equal(selection.mode, "fallback");
    assert.equal(selection.reason, "fzf-not-installed");
  } finally {
    process.env.PATH = previousPath;
  }
});
