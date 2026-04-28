import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { KesMaterializationError } from "../src/kes/index.ts";
import {
  KAIZEN_PLUGIN,
  LoopExecutor,
  STRATEGIC_PLUGIN,
  TRANSCENDENT_PLUGIN,
} from "../src/loops/engine.ts";

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

test("LoopExecutor fails closed with a typed error when the configured KES root is invalid", async () => {
  const operatorCwd = fs.mkdtempSync(path.join(os.tmpdir(), "pi-orch-loop-operator-"));
  const packageRootParent = fs.mkdtempSync(path.join(os.tmpdir(), "pi-orch-loop-bad-root-"));
  const invalidPackageRoot = path.join(packageRootParent, "not-a-dir");
  fs.writeFileSync(invalidPackageRoot, "not a directory", "utf8");

  try {
    const executor = createExecutor(KAIZEN_PLUGIN, operatorCwd, invalidPackageRoot);

    await assert.rejects(
      executor.execute("Improve evidence reporting", async () => ({
        output: "ok",
        exitCode: 0,
        elapsed: 1,
      })),
      (error) => {
        assert.equal(error instanceof KesMaterializationError, true);
        assert.equal(error.kind, "kes_root_invalid");
        assert.match(String(error), /configured KES root is invalid or not writable/i);
        assert.equal(String(error).includes(invalidPackageRoot), false);
        return true;
      },
    );
  } finally {
    fs.rmSync(operatorCwd, { recursive: true, force: true });
    fs.rmSync(packageRootParent, { recursive: true, force: true });
  }
});

test("Transcendent v3 targets debt before dissolve and uses closure-gate as final DoD phase", () => {
  assert.deepEqual(TRANSCENDENT_PLUGIN.phases, [
    "diagnose",
    "first-100x",
    "second-100x",
    "debt-targeting",
    "dissolve",
    "rebuild",
    "closure-gate",
  ]);
  assert.equal(TRANSCENDENT_PLUGIN.continueOnFailure, false);
  assert.equal(TRANSCENDENT_PLUGIN.phases.includes("name-debt"), false);
  assert.equal(
    TRANSCENDENT_PLUGIN.cognitiveTools["closure-gate"]?.[0],
    "knowledge-crystallization",
  );
});

test("Transcendent v3 fail-fast stops unresolved blocking debt before dissolve/rebuild", async () => {
  const operatorCwd = fs.mkdtempSync(path.join(os.tmpdir(), "pi-orch-loop-operator-"));
  const packageRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pi-orch-loop-package-"));
  let phaseIndex = 0;

  try {
    const executor = createExecutor(TRANSCENDENT_PLUGIN, operatorCwd, packageRoot);
    const result = await executor.execute(
      "Remove loop debt",
      async ({ cognitiveTool, context }) => {
        const phase = TRANSCENDENT_PLUGIN.phases[phaseIndex++];
        assert.equal(cognitiveTool, TRANSCENDENT_PLUGIN.cognitiveTools[phase][0]);
        if (phase === "debt-targeting") {
          assert.match(context, /Blocking in-scope debt must become dissolve\/rebuild input/);
          return {
            output:
              "Blocking debt remains: runtime cannot safely dissolve/rebuild without explicit scope.",
            exitCode: 1,
            elapsed: 9,
            failureKind: "blocking_debt_remaining",
          };
        }
        return {
          output: `Phase ${phase} completed and preserved debt-routing evidence.`,
          exitCode: 0,
          elapsed: 7,
        };
      },
    );

    assert.equal(result.success, false);
    assert.deepEqual(
      result.phases.map((phase) => phase.phase),
      ["diagnose", "first-100x", "second-100x", "debt-targeting"],
    );
    assert.equal(result.phases.at(-1)?.status, "error");
    assert.equal(result.phases.at(-1)?.failureKind, "blocking_debt_remaining");
    assert.equal(phaseIndex, 4);
  } finally {
    fs.rmSync(operatorCwd, { recursive: true, force: true });
    fs.rmSync(packageRoot, { recursive: true, force: true });
  }
});

test("Transcendent v3 closure-gate records incomplete debt instead of pretending success", async () => {
  const operatorCwd = fs.mkdtempSync(path.join(os.tmpdir(), "pi-orch-loop-operator-"));
  const packageRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pi-orch-loop-package-"));
  let phaseIndex = 0;

  try {
    const executor = createExecutor(TRANSCENDENT_PLUGIN, operatorCwd, packageRoot);
    const result = await executor.execute("Close only when debt is gone", async ({ context }) => {
      const phase = TRANSCENDENT_PLUGIN.phases[phaseIndex++];
      if (phase === "closure-gate") {
        assert.match(context, /Close only if no blocking in-scope debt remains/);
        return {
          output:
            "Decision: stop_incomplete. Next loop ceiling: closure gate still has blocking in-scope debt.",
          exitCode: 1,
          elapsed: 11,
          failureKind: "closure_gate_blocking_debt",
        };
      }
      return {
        output: `Phase ${phase} completed with evidence for the closure gate.`,
        exitCode: 0,
        elapsed: 6,
      };
    });

    assert.equal(result.success, false);
    assert.deepEqual(
      result.phases.map((phase) => phase.phase),
      TRANSCENDENT_PLUGIN.phases,
    );
    assert.equal(result.phases.at(-1)?.phase, "closure-gate");
    assert.equal(result.phases.at(-1)?.status, "error");
    assert.equal(result.phases.at(-1)?.failureKind, "closure_gate_blocking_debt");
    assert.equal(
      result.artifacts.filter((artifact) => artifact.type === "kes_learning_candidate").length,
      0,
    );
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
