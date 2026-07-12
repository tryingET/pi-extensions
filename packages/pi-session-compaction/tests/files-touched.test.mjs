/**
summary: "Tests successful file-operation recovery, ignored results, path normalization, redirects, and manifest rendering."
read_when:
  - "Changing files-touched tool parsing, operation merging, display paths, or manifest output."
*/
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  collectFilesTouched,
  formatManifestOperations,
  renderFilesTouchedManifestBlock,
} from "../extensions/session-compaction/files-touched.js";

function toolCallEntry(id, name, args) {
  return {
    id: `call-entry-${id}`,
    type: "message",
    message: {
      role: "assistant",
      content: [
        {
          type: "toolCall",
          id,
          name,
          arguments: args,
        },
      ],
      timestamp: 1,
    },
  };
}

function toolResultEntry(id, text = "ok", timestamp = 10, isError = false) {
  return {
    id: `result-entry-${id}`,
    type: "message",
    message: {
      role: "toolResult",
      toolCallId: id,
      content: [{ type: "text", text }],
      isError,
      timestamp,
    },
  };
}

function touchedSummary(files) {
  return files.map((file) => ({
    displayPath: file.displayPath,
    operations: [...file.operations].sort(),
  }));
}

describe("files touched collection", () => {
  it("tracks Pi read/write/edit tool calls after successful tool results", () => {
    const files = collectFilesTouched(
      [
        toolCallEntry("read-1", "read", { path: "src/a.ts:1-20" }),
        toolResultEntry("read-1", "file contents", 10),
        toolCallEntry("write-1", "write", { path: "src/b.ts" }),
        toolResultEntry("write-1", "written", 20),
        toolCallEntry("edit-1", "edit", { path: "src/a.ts" }),
        toolResultEntry("edit-1", "applied: 1", 30),
      ],
      "/repo",
    );

    assert.deepEqual(touchedSummary(files), [
      { displayPath: "src/a.ts", operations: ["edit", "read"] },
      { displayPath: "src/b.ts", operations: ["write"] },
    ]);
  });

  it("ignores errored results and no-op edits", () => {
    const files = collectFilesTouched(
      [
        toolCallEntry("failed-read", "read", { path: "src/failed.ts" }),
        toolResultEntry("failed-read", "boom", 10, true),
        toolCallEntry("noop-edit", "edit", { path: "src/noop.ts" }),
        toolResultEntry("noop-edit", "applied: 0", 20),
      ],
      "/repo",
    );

    assert.deepEqual(files, []);
  });

  it("tracks bash writes, edits, moves, and deletes with move redirects", () => {
    const files = collectFilesTouched(
      [
        toolCallEntry("bash-1", "bash", {
          command: [
            "printf hi > src/new.txt",
            "sed -i 's/old/new/' src/edit.txt",
            "mv src/edit.txt src/renamed.txt",
            "rm src/delete.txt",
          ].join(" && "),
        }),
        toolResultEntry("bash-1", "ok", 10),
      ],
      "/repo",
    );

    assert.deepEqual(touchedSummary(files), [
      { displayPath: "src/new.txt", operations: ["write"] },
      { displayPath: "src/renamed.txt", operations: ["edit", "move"] },
      { displayPath: "src/delete.txt", operations: ["delete"] },
    ]);
  });

  it("tracks relative dev/null fd redirection as a repo artifact", () => {
    const files = collectFilesTouched(
      [
        toolCallEntry("bash-dev-null", "bash", {
          command:
            "node noisy.js 2>dev/null && node more.js 1>> logs/out.txt && node quiet.js 2>/dev/null",
        }),
        toolResultEntry("bash-dev-null", "ok", 10),
      ],
      "/repo",
    );

    assert.deepEqual(touchedSummary(files), [
      { displayPath: "dev/null", operations: ["write"] },
      { displayPath: "logs/out.txt", operations: ["write"] },
    ]);
  });

  it("ignores absolute dev targets and fd duplication redirects", () => {
    const files = collectFilesTouched(
      [
        toolCallEntry("bash-absolute-dev-null", "bash", {
          command: "node quiet.js >/dev/null 2>&1",
        }),
        toolResultEntry("bash-absolute-dev-null", "ok", 10),
      ],
      "/repo",
    );

    assert.deepEqual(files, []);
  });

  it("normalizes absolute paths under the current repo to display-relative paths", () => {
    const files = collectFilesTouched(
      [
        toolCallEntry("read-abs", "read", { path: "/repo/packages/pkg/src/index.ts" }),
        toolResultEntry("read-abs", "ok", 10),
      ],
      "/repo",
    );

    assert.equal(files[0].path, "/repo/packages/pkg/src/index.ts");
    assert.equal(files[0].displayPath, "packages/pkg/src/index.ts");
  });
});

describe("files touched manifest rendering", () => {
  it("renders stable operation codes and empty manifests", () => {
    assert.equal(
      formatManifestOperations({
        path: "/repo/src/a.ts",
        displayPath: "src/a.ts",
        operations: new Set(["read", "edit"]),
        lastTimestamp: 10,
      }),
      "RE",
    );

    assert.equal(
      renderFilesTouchedManifestBlock([
        {
          path: "/repo/src/a.ts",
          displayPath: "src/a.ts",
          operations: new Set(["read", "edit"]),
          lastTimestamp: 10,
        },
        {
          path: "/repo/src/b.ts",
          displayPath: "src/b.ts",
          operations: new Set(["write"]),
          lastTimestamp: 20,
        },
      ]),
      [
        "## Files touched",
        "R=read, W=write, E=edit, M=move/rename, D=delete",
        "",
        "```text",
        "RE src/a.ts",
        "W  src/b.ts",
        "```",
      ].join("\n"),
    );

    assert.equal(
      renderFilesTouchedManifestBlock([], "## Files touched (cumulative)"),
      [
        "## Files touched (cumulative)",
        "R=read, W=write, E=edit, M=move/rename, D=delete",
        "",
        "```text",
        "(no tracked files)",
        "```",
      ].join("\n"),
    );
  });
});
