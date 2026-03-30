import assert from "node:assert/strict";
import test from "node:test";

import {
  getDollarSlashAdaptation,
  wrapAutocompleteProviderForDollarPrefix,
} from "../src/ptxAutocompleteProvider.js";

test("getDollarSlashAdaptation rewrites $$ slash context for inner providers", () => {
  const adaptation = getDollarSlashAdaptation(["$$ /vault"], 0, 9);

  assert.deepEqual(adaptation, {
    prefix: "$$ ",
    cursorLine: 0,
    adaptedLines: ["/vault"],
    adaptedCursorCol: 6,
  });
});

test("wrapped PTX autocomplete provider forwards async host options and normalizes results", async () => {
  const calls = [];
  const provider = wrapAutocompleteProviderForDollarPrefix({
    async getSuggestions(lines, cursorLine, cursorCol, options) {
      calls.push({ lines, cursorLine, cursorCol, options });
      return {
        prefix: "/va",
        items: [{ value: "vault", label: "vault" }],
      };
    },
    applyCompletion(lines, cursorLine, cursorCol, item) {
      return {
        lines: [...lines.slice(0, cursorLine), `/${item.value}`],
        cursorLine,
        cursorCol: item.value.length + 1,
      };
    },
  });

  const signal = new AbortController().signal;
  const suggestions = await provider.getSuggestions(["$$ /va"], 0, 7, { signal, force: false });

  assert.deepEqual(suggestions, {
    prefix: "/va",
    items: [{ value: "vault", label: "vault" }],
  });
  assert.deepEqual(calls, [
    {
      lines: ["/va"],
      cursorLine: 0,
      cursorCol: 4,
      options: { signal, force: false },
    },
  ]);
});

test("wrapped PTX autocomplete provider returns null for malformed async payloads", async () => {
  const provider = wrapAutocompleteProviderForDollarPrefix({
    async getSuggestions() {
      return { prefix: "/broken" };
    },
    applyCompletion(lines, cursorLine, cursorCol) {
      return { lines, cursorLine, cursorCol };
    },
  });

  const result = await provider.getSuggestions(["$$ /broken"], 0, 11, {
    signal: new AbortController().signal,
    force: false,
  });

  assert.equal(result, null);
});

test("wrapped PTX autocomplete provider preserves applyCompletion prefix restoration", () => {
  const provider = wrapAutocompleteProviderForDollarPrefix({
    getSuggestions() {
      return {
        prefix: "/wo",
        items: [{ value: "workflow", label: "workflow" }],
      };
    },
    applyCompletion(_lines, cursorLine, _cursorCol, item) {
      return {
        lines: [`/${item.value}`],
        cursorLine,
        cursorCol: item.value.length + 1,
      };
    },
  });

  const result = provider.applyCompletion(["$$ /wo"], 0, 7, { value: "workflow", label: "workflow" }, "/wo");

  assert.deepEqual(result, {
    lines: ["$$ /workflow"],
    cursorLine: 0,
    cursorCol: 12,
  });
});
