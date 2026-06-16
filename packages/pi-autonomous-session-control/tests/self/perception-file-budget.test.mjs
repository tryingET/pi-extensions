import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { analyzeTouchedFileBudgets } from "../../extensions/self/file-budget.ts";
import { cleanup, createMockContext, createPiHarness, loadExtensionWithMocks } from "./harness.mjs";

test("self query: files touched includes mirror-only file budget cues", async () => {
  const { default: extension, tempDir } = await loadExtensionWithMocks();
  const workspace = await mkdtemp(join(tmpdir(), "self-file-budget-"));
  const harness = createPiHarness();

  try {
    await mkdir(join(workspace, "src"), { recursive: true });
    await writeFile(join(workspace, "src", "large.ts"), `${"x\n".repeat(501)}`, "utf8");
    extension(harness.pi);
    harness.eventHandlers.get("tool_call")({
      toolName: "edit",
      input: { path: "src/large.ts", oldText: "x", newText: "x\ny" },
    });

    const result = await harness.tools
      .get("self")
      .execute(
        "tc-file-budget",
        { query: "What files have I touched?" },
        null,
        null,
        createMockContext({ cwd: workspace }),
      );

    assert.match(result.content[0].text, /File-budget cues/);
    assert.match(result.content[0].text, /src\/large\.ts exceeds code budget/);
    assert.equal(result.details.data.fileBudgetObservations[0].kind, "code");
    assert.equal(result.details.data.fileBudgetObservations[0].growing, true);
  } finally {
    await cleanup(tempDir);
    await rm(workspace, { recursive: true, force: true });
  }
});
test("self file-budget cues classify absolute in-cwd paths relative to cwd", async () => {
  const workspace = await mkdtemp(join(tmpdir(), "self-file-budget-absolute-"));

  try {
    await mkdir(join(workspace, "src"), { recursive: true });
    const absolutePath = join(workspace, "src", "large.ts");
    await writeFile(absolutePath, `${"x\n".repeat(501)}`, "utf8");

    const observations = analyzeTouchedFileBudgets([{ path: absolutePath, netLinesDelta: 1 }], {
      cwd: workspace,
    });

    assert.equal(observations.length, 1);
    assert.equal(observations[0].path, "src/large.ts");
    assert.equal(observations[0].kind, "code");
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});
test("self file-budget cues ignore touched paths outside cwd", async () => {
  const workspace = await mkdtemp(join(tmpdir(), "self-file-budget-workspace-"));
  const outside = await mkdtemp(join(tmpdir(), "self-file-budget-outside-"));

  try {
    await mkdir(join(outside, "src"), { recursive: true });
    await writeFile(join(outside, "src", "large.ts"), `${"x\n".repeat(501)}`, "utf8");

    assert.deepEqual(
      analyzeTouchedFileBudgets([{ path: join(outside, "src", "large.ts"), netLinesDelta: 1 }], {
        cwd: workspace,
      }),
      [],
    );
    assert.deepEqual(
      analyzeTouchedFileBudgets([{ path: "../src/large.ts", netLinesDelta: 1 }], {
        cwd: join(outside, "child"),
      }),
      [],
    );
    assert.deepEqual(
      analyzeTouchedFileBudgets([{ path: "node_modules/pkg/large.ts", netLinesDelta: 1 }], {
        cwd: workspace,
      }),
      [],
    );
  } finally {
    await rm(workspace, { recursive: true, force: true });
    await rm(outside, { recursive: true, force: true });
  }
});
