/**
summary: "Tests branch-summary instruction composition, config selection, runtime skip paths, and failure warnings."
read_when:
  - "Changing branch-summary augmentation contracts, files-touched inclusion rules, or error handling."
*/
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  buildBranchSummaryInstructions,
  includeFilesTouchedInBranchSummary,
  runSessionTreeAugmentation,
} from "../extensions/session-compaction/branch-summary.js";

function userEntry(id, text, timestamp = 1000) {
  return {
    id,
    type: "message",
    message: {
      role: "user",
      content: [{ type: "text", text }],
      timestamp,
    },
  };
}

function assistantEntryWithRead(id, toolCallId, path) {
  return {
    id,
    type: "message",
    message: {
      role: "assistant",
      content: [{ type: "toolCall", id: toolCallId, name: "read", arguments: { path } }],
      timestamp: 1100,
    },
  };
}

function toolResultEntry(id, timestamp = 1200) {
  return {
    id: `result-${id}`,
    type: "message",
    message: {
      role: "toolResult",
      toolCallId: id,
      content: [{ type: "text", text: "ok" }],
      isError: false,
      timestamp,
    },
  };
}

function createTreeEvent(overrides = {}) {
  const entriesToSummarize = [userEntry("tree-user", "Inspect branch")];
  return {
    type: "session_before_tree",
    signal: new AbortController().signal,
    preparation: {
      targetId: "target-1",
      oldLeafId: "old-leaf",
      commonAncestorId: "ancestor",
      entriesToSummarize,
      userWantsSummary: true,
      customInstructions: undefined,
      replaceInstructions: false,
      label: undefined,
    },
    ...overrides,
  };
}

function createContext() {
  const notifications = [];
  return {
    notifications,
    ctx: {
      hasUI: true,
      ui: {
        notify(message) {
          notifications.push(message);
        },
      },
      cwd: "/repo",
    },
  };
}

describe("branch summary instruction builder", () => {
  it("returns undefined when neither prompt contract nor files manifest exists", () => {
    assert.equal(buildBranchSummaryInstructions({ focusText: "keep detail" }), undefined);
  });

  it("uses replaceInstructions when a branch-summary prompt contract exists", () => {
    const result = buildBranchSummaryInstructions({
      promptContract: "# Branch prompt\nUse this exact outline",
      focusText: "Focus on parser regressions",
      filesTouchedManifestBlock:
        "## Files touched\nR=read, W=write, E=edit, M=move/rename, D=delete\n\n```text\nR  src/a.ts\n```",
    });

    assert.ok(result);
    assert.equal(result.replaceInstructions, true);
    assert.match(result.customInstructions, /# Branch prompt/);
    assert.match(result.customInstructions, /## Additional focus/);
    assert.match(result.customInstructions, /Focus on parser regressions/);
    assert.match(result.customInstructions, /## Authoritative files touched/);
    assert.match(result.customInstructions, /Reproduce it verbatim/);
  });

  it("uses additive instructions when only files-touched augmentation is active", () => {
    const result = buildBranchSummaryInstructions({
      focusText: "Preserve command history detail",
      filesTouchedManifestBlock:
        "## Files touched\nR=read, W=write, E=edit, M=move/rename, D=delete\n\n```text\nE  src/tree.ts\n```",
    });

    assert.ok(result);
    assert.equal(result.replaceInstructions, false);
    assert.match(
      result.customInstructions,
      /^Also include the authoritative files-touched block below/,
    );
    assert.match(result.customInstructions, /User focus:/);
    assert.match(result.customInstructions, /Preserve command history detail/);
    assert.match(result.customInstructions, /E {2}src\/tree\.ts/);
  });
});

describe("branch summary config selection", () => {
  it("supports boolean, branch-specific, object, and default-disabled files-touched settings", () => {
    assert.equal(includeFilesTouchedInBranchSummary({ includeFilesTouched: true }), true);
    assert.equal(includeFilesTouchedInBranchSummary({ includeFilesTouched: false }), false);
    assert.equal(includeFilesTouchedInBranchSummary({ includeBranchFilesTouched: true }), true);
    assert.equal(
      includeFilesTouchedInBranchSummary({
        includeFilesTouched: { inCompactionSummary: true, inBranchSummary: false },
      }),
      false,
    );
    assert.equal(includeFilesTouchedInBranchSummary({}), false);
  });
});

describe("branch summary augmentation runtime", () => {
  it("returns undefined when the user did not request a summary or no entries are available", async () => {
    const { ctx } = createContext();
    assert.equal(
      await runSessionTreeAugmentation(
        createTreeEvent({
          preparation: { ...createTreeEvent().preparation, userWantsSummary: false },
        }),
        ctx,
      ),
      undefined,
    );
    assert.equal(
      await runSessionTreeAugmentation(
        createTreeEvent({
          preparation: { ...createTreeEvent().preparation, entriesToSummarize: [] },
        }),
        ctx,
      ),
      undefined,
    );
  });

  it("uses entriesToSummarize for files-touched recovery", async () => {
    const { ctx } = createContext();
    const entriesToSummarize = [
      assistantEntryWithRead("assistant-read", "read-1", "src/tree.ts"),
      toolResultEntry("read-1"),
    ];
    let capturedEntries = [];
    const result = await runSessionTreeAugmentation(
      createTreeEvent({
        preparation: { ...createTreeEvent().preparation, entriesToSummarize },
      }),
      ctx,
      {
        collectFilesTouched: (entries) => {
          capturedEntries = entries;
          return [
            {
              path: "/repo/src/tree.ts",
              displayPath: "src/tree.ts",
              operations: new Set(["read"]),
              lastTimestamp: 1,
            },
          ];
        },
        loadConfig: async () => ({ includeFilesTouched: true }),
        loadBranchSummaryPrompt: async () => undefined,
      },
    );

    assert.deepEqual(capturedEntries, entriesToSummarize);
    assert.ok(result);
    assert.equal(result.replaceInstructions, false);
    assert.match(result.customInstructions, /R {2}src\/tree\.ts/);
  });

  it("combines prompt contract, focus, and files manifest", async () => {
    const { ctx } = createContext();
    const result = await runSessionTreeAugmentation(createTreeEvent(), ctx, {
      collectFilesTouched: () => [
        {
          path: "/repo/src/tree.ts",
          displayPath: "src/tree.ts",
          operations: new Set(["edit"]),
          lastTimestamp: 1,
        },
      ],
      loadConfig: async () => ({ includeFilesTouched: { inBranchSummary: true } }),
      loadBranchSummaryPrompt: async () => "# Branch prompt\nUse this exact outline",
    });

    assert.ok(result);
    assert.equal(result.replaceInstructions, true);
    assert.match(result.customInstructions, /# Branch prompt/);
    assert.match(result.customInstructions, /E {2}src\/tree\.ts/);
  });

  it("warns and returns undefined on augmentation failure", async () => {
    const { ctx, notifications } = createContext();
    const result = await runSessionTreeAugmentation(createTreeEvent(), ctx, {
      loadConfig: async () => {
        throw new Error("broken config");
      },
    });

    assert.equal(result, undefined);
    assert.equal(notifications.length, 1);
    assert.match(notifications[0], /Session tree summary augmentation failed: broken config/);
  });
});
