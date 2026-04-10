import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { KAIZEN_PLUGIN, LoopExecutor, STRATEGIC_PLUGIN } from "../src/loops/engine.ts";

function createExecutor(plugin, operatorCwd, packageRoot) {
  return new LoopExecutor(plugin, operatorCwd, "/tmp/unused-vault", {
    packageRoot,
    ak: {
      async evidenceRecord() {
        return { ok: true, via: "ak" };
      },
    },
  });
}

function readAllFiles(dir) {
  return fs
    .readdirSync(dir)
    .sort()
    .map((file) => ({
      file,
      content: fs.readFileSync(path.join(dir, file), "utf8"),
    }));
}

test("LoopExecutor writes package-owned KES artifacts and stages candidate-only learnings for crystallization phases", async () => {
  const operatorCwd = fs.mkdtempSync(path.join(os.tmpdir(), "pi-orch-loop-operator-"));
  const packageRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pi-orch-loop-package-"));
  let phaseIndex = 0;

  try {
    const executor = createExecutor(KAIZEN_PLUGIN, operatorCwd, packageRoot);
    const phaseOutputs = {
      plan: "Planned a bounded evidence-reporting pass.",
      do: "Implemented the smaller evidence-reporting change.",
      check: "Verified the smaller change against the bounded runtime contract.",
      act: "Reusable pattern: crystallize only the bounded evidence surface after the raw diary capture is stable.",
    };

    const result = await executor.execute(
      "Improve evidence reporting",
      async ({ cognitiveTool }) => {
        const phase = KAIZEN_PLUGIN.phases[phaseIndex++];
        assert.equal(cognitiveTool, KAIZEN_PLUGIN.cognitiveTools[phase][0]);
        return {
          output: phaseOutputs[phase],
          exitCode: 0,
          elapsed: 12,
        };
      },
    );

    assert.equal(result.success, true);
    assert.equal(result.phases.length, KAIZEN_PLUGIN.phases.length);
    assert.equal(result.artifacts.filter((artifact) => artifact.type === "kes_diary").length, 6);
    assert.equal(
      result.artifacts.filter((artifact) => artifact.type === "kes_learning_candidate").length,
      1,
    );
    for (const artifact of result.artifacts) {
      assert.match(artifact.content, /^(diary|docs\/learnings)\//);
    }

    assert.equal(fs.existsSync(path.join(operatorCwd, "diary")), false);
    assert.equal(fs.existsSync(path.join(operatorCwd, "docs", "learnings")), false);

    const diaryDir = path.join(packageRoot, "diary");
    const learningsDir = path.join(packageRoot, "docs", "learnings");
    const diaryFiles = readAllFiles(diaryDir);
    const learningFiles = readAllFiles(learningsDir);

    assert.equal(diaryFiles.length, 6);
    assert.equal(learningFiles.length, 1);
    assert.ok(
      diaryFiles.some((entry) => entry.content.includes("knowledge-crystallization")),
      "expected one KES diary entry to record the crystallization-oriented phase",
    );
    assert.match(learningFiles[0].content, /State: candidate-only/);
    assert.match(learningFiles[0].content, /Loop: kaizen/);
    assert.match(learningFiles[0].content, /Primary cognitive tool: knowledge-crystallization/);
  } finally {
    fs.rmSync(operatorCwd, { recursive: true, force: true });
    fs.rmSync(packageRoot, { recursive: true, force: true });
  }
});

test("LoopExecutor does not materialize package-owned KES artifacts when the signal is already aborted", async () => {
  const operatorCwd = fs.mkdtempSync(path.join(os.tmpdir(), "pi-orch-loop-operator-"));
  const packageRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pi-orch-loop-package-"));
  const controller = new AbortController();
  controller.abort();

  try {
    const executor = createExecutor(STRATEGIC_PLUGIN, operatorCwd, packageRoot);
    const result = await executor.execute(
      "Plan the migration",
      async () => {
        throw new Error("dispatch should not run when the loop is already aborted");
      },
      controller.signal,
    );

    assert.equal(result.success, false);
    assert.equal(result.phases.length, 0);
    assert.equal(result.artifacts.length, 0);
    assert.equal(fs.existsSync(path.join(packageRoot, "diary")), false);
    assert.equal(fs.existsSync(path.join(packageRoot, "docs", "learnings")), false);
  } finally {
    fs.rmSync(operatorCwd, { recursive: true, force: true });
    fs.rmSync(packageRoot, { recursive: true, force: true });
  }
});

test("LoopExecutor keeps non-crystallization loops diary-only even when KES roots are package-owned", async () => {
  const operatorCwd = fs.mkdtempSync(path.join(os.tmpdir(), "pi-orch-loop-operator-"));
  const packageRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pi-orch-loop-package-"));
  let phaseIndex = 0;

  try {
    const executor = createExecutor(STRATEGIC_PLUGIN, operatorCwd, packageRoot);

    const result = await executor.execute("Plan the migration", async ({ cognitiveTool }) => {
      const phase = STRATEGIC_PLUGIN.phases[phaseIndex++];
      assert.equal(cognitiveTool, STRATEGIC_PLUGIN.cognitiveTools[phase][0]);
      return {
        output: `Phase ${phase} stayed bounded and completed successfully.`,
        exitCode: 0,
        elapsed: 8,
      };
    });

    assert.equal(result.success, true);
    assert.equal(result.artifacts.filter((artifact) => artifact.type === "kes_diary").length, 6);
    assert.equal(
      result.artifacts.filter((artifact) => artifact.type === "kes_learning_candidate").length,
      0,
    );

    const diaryDir = path.join(packageRoot, "diary");
    const learningsDir = path.join(packageRoot, "docs", "learnings");
    assert.equal(readAllFiles(diaryDir).length, 6);
    assert.equal(readAllFiles(learningsDir).length, 0);
  } finally {
    fs.rmSync(operatorCwd, { recursive: true, force: true });
    fs.rmSync(packageRoot, { recursive: true, force: true });
  }
});
