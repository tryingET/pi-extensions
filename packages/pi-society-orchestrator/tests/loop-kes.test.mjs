import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { KesMaterializationError } from "../src/kes/index.ts";
import {
  captureLoopPluginSemanticsHash,
  KAIZEN_PLUGIN,
  LoopExecutor,
  STRATEGIC_PLUGIN,
  TRANSCENDENT_PLUGIN,
} from "../src/loops/engine.ts";
import { LoopKesWriter } from "../src/loops/kes.ts";
import { LoopRunCheckpointStore } from "../src/loops/run-checkpoint.ts";
import { AGENT_PROFILES } from "../src/runtime/agent-profiles.ts";

function createExecutor(plugin, operatorCwd, packageRoot) {
  return new LoopExecutor(plugin, operatorCwd, "/tmp/unused-vault", {
    packageRoot,
    allowUnverifiedKesRoot: true,
    ak: {
      async evidenceRecord() {
        return { ok: true, via: "ak" };
      },
    },
    checkpointStore: new LoopRunCheckpointStore(path.join(operatorCwd, ".loop-runs")),
    captureStateFingerprint: () => "sha256:test-state",
    verifyEffectReceipt: (receipt) => receipt?.schema === "asc.dispatch_effect_receipt.v1",
  });
}

function settledResult(output, elapsed, consumerCorrelationId) {
  return {
    output,
    exitCode: 0,
    elapsed,
    assistantStopReason: "stop",
    executionState: {
      transport: { kind: "transport", exitCode: 0, aborted: false, timedOut: false },
      protocol: { kind: "assistant_protocol", stopReason: "stop" },
    },
    effectReceipt: {
      schema: "asc.dispatch_effect_receipt.v1",
      dispatchId: `dispatch-${consumerCorrelationId}`,
      attemptId: `asc-${consumerCorrelationId}`,
      sessionName: "loop-test",
      consumerCorrelationId,
      disposition: "settled",
      recordedAt: "2026-07-11T00:00:00.000Z",
      receiptPath: `/tmp/${consumerCorrelationId}.effect-receipt.json`,
    },
  };
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

test("LoopExecutor emits one terminal diary plus one explicitly claimed learning candidate", async () => {
  const operatorCwd = fs.mkdtempSync(path.join(os.tmpdir(), "pi-orch-loop-operator-"));
  const packageRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pi-orch-loop-package-"));
  let phaseIndex = 0;

  try {
    const executor = createExecutor(KAIZEN_PLUGIN, operatorCwd, packageRoot);
    const phaseOutputs = {
      plan: "Planned a bounded evidence-reporting pass.",
      do: "Implemented the smaller evidence-reporting change.",
      check: "Verified the smaller change against the bounded runtime contract.",
      act: [
        "Reusable pattern: crystallize only bounded terminal evidence.",
        "KES_CLAIM: Terminal-only KES emission prevents event-count growth while retaining attributable phase evidence.",
      ].join("\n"),
    };

    const result = await executor.execute(
      "Improve evidence reporting",
      async ({ cognitiveTool, effectCorrelationId }) => {
        const phase = KAIZEN_PLUGIN.phases[phaseIndex++];
        assert.equal(cognitiveTool, KAIZEN_PLUGIN.cognitiveTools[phase][0]);
        return settledResult(phaseOutputs[phase], 12, effectCorrelationId);
      },
    );

    assert.equal(result.success, true);
    assert.equal(result.phases.length, KAIZEN_PLUGIN.phases.length);
    assert.equal(result.artifacts.filter((artifact) => artifact.type === "kes_diary").length, 1);
    assert.equal(
      result.artifacts.filter((artifact) => artifact.type === "kes_learning_candidate").length,
      1,
    );
    assert.equal(result.artifacts.length, 2);
    for (const artifact of result.artifacts) {
      assert.match(artifact.content, /^(diary|docs\/learnings)\//);
    }

    assert.equal(fs.existsSync(path.join(operatorCwd, "diary")), false);
    assert.equal(fs.existsSync(path.join(operatorCwd, "docs", "learnings")), false);

    const diaryDir = path.join(packageRoot, "diary");
    const learningsDir = path.join(packageRoot, "docs", "learnings");
    const diaryFiles = readAllFiles(diaryDir);
    const learningFiles = readAllFiles(learningsDir);

    assert.equal(diaryFiles.length, 1);
    assert.equal(learningFiles.length, 1);
    assert.match(diaryFiles[0].content, /"primaryTool": "knowledge-crystallization"/);
    assert.doesNotMatch(diaryFiles[0].content, /Improve evidence reporting/);
    assert.match(diaryFiles[0].content, /Objective: sha256:[a-f0-9]{64}/);
    assert.doesNotMatch(learningFiles[0].content, /Improve evidence reporting/);
    assert.match(learningFiles[0].content, /State: candidate-only/);
    assert.match(learningFiles[0].content, /Loop: kaizen/);
    assert.match(
      learningFiles[0].content,
      /phase=act; agent=researcher; cognitive_tool=knowledge-crystallization/,
    );
    assert.doesNotMatch(
      learningFiles[0].content,
      /Terminal-only KES emission prevents event-count growth/,
    );
    assert.match(
      learningFiles[0].content,
      /Private attributable claim digest: sha256:[a-f0-9]{64}/,
    );
  } finally {
    fs.rmSync(operatorCwd, { recursive: true, force: true });
    fs.rmSync(packageRoot, { recursive: true, force: true });
  }
});

test("private checkpoints preserve exact raw bytes while public terminal KES contains only safe digests", async () => {
  const operatorCwd = fs.mkdtempSync(path.join(os.tmpdir(), "pi-orch-loop-private-"));
  const packageRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pi-orch-loop-public-"));
  const objective = "line one\nline two\nline three";
  const awsAccessKeyId = `AKIA${"A".repeat(16)}`;
  const secret = `Authorization:\u000bBearer ${awsAccessKeyId}`;
  let phaseIndex = 0;
  try {
    const executor = createExecutor(KAIZEN_PLUGIN, operatorCwd, packageRoot);
    const result = await executor.execute(objective, async ({ effectCorrelationId }) => {
      const phase = KAIZEN_PLUGIN.phases[phaseIndex++];
      const output = `${objective}\n${secret}\nraw-${phase}-é`;
      return settledResult(output, 1, effectCorrelationId);
    });
    const checkpointRoot = path.join(operatorCwd, ".loop-runs");
    assert.equal(fs.statSync(checkpointRoot).mode & 0o077, 0);
    const [checkpointFile] = fs
      .readdirSync(checkpointRoot)
      .filter((name) => name.endsWith(".run.json"));
    const checkpoint = JSON.parse(
      fs.readFileSync(path.join(operatorCwd, ".loop-runs", checkpointFile), "utf8"),
    );
    assert.equal(checkpoint.attempts.length, 4);
    for (const [index, attempt] of checkpoint.attempts.entries()) {
      const expected = `${objective}\n${secret}\nraw-${KAIZEN_PLUGIN.phases[index]}-é`;
      assert.equal(attempt.output, expected);
      assert.equal(attempt.outputBytes, Buffer.byteLength(expected));
      assert.equal(attempt.outputTruncated, false);
    }
    const publicBundle = result.artifacts
      .map((artifact) => fs.readFileSync(path.join(packageRoot, artifact.content), "utf8"))
      .join("\n");
    assert.equal(publicBundle.split(objective).length - 1, 0);
    assert.match(publicBundle, /Objective: sha256:[a-f0-9]{64}/);
    assert.doesNotMatch(publicBundle, /Authorization|Bearer|raw-plan/);
    assert.match(publicBundle, /"outputSha256": "[a-f0-9]{64}"/);
  } finally {
    fs.rmSync(operatorCwd, { recursive: true, force: true });
    fs.rmSync(packageRoot, { recursive: true, force: true });
  }
});

test("owner-truncated output fails closed before exact private evidence is claimed", async () => {
  const operatorCwd = fs.mkdtempSync(path.join(os.tmpdir(), "pi-orch-loop-truncated-"));
  const packageRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pi-orch-loop-truncated-public-"));

  try {
    const executor = createExecutor(KAIZEN_PLUGIN, operatorCwd, packageRoot);
    await assert.rejects(
      executor.execute("reject truncated evidence", async ({ effectCorrelationId }) => ({
        ...settledResult("partial owner output", 1, effectCorrelationId),
        outputTruncated: true,
      })),
      (error) =>
        error?.failureKind === "loop_private_evidence_truncated" &&
        /exact private evidence was not checkpointed or published/.test(error.message),
    );

    const [checkpointFile] = fs
      .readdirSync(path.join(operatorCwd, ".loop-runs"))
      .filter((name) => name.endsWith(".run.json"));
    const checkpoint = JSON.parse(
      fs.readFileSync(path.join(operatorCwd, ".loop-runs", checkpointFile), "utf8"),
    );
    assert.equal(checkpoint.status, "running");
    assert.equal(checkpoint.attempts.length, 1);
    assert.equal(checkpoint.attempts[0].failureKind, "loop_attempt_in_progress");
    assert.doesNotMatch(checkpoint.attempts[0].output, /partial owner output/);
    assert.equal(fs.existsSync(path.join(packageRoot, "diary")), false);
    assert.equal(fs.existsSync(path.join(packageRoot, "docs", "learnings")), false);
  } finally {
    fs.rmSync(operatorCwd, { recursive: true, force: true });
    fs.rmSync(packageRoot, { recursive: true, force: true });
  }
});

test("unknown secret formats remain private when an explicit claim is admitted by digest", async () => {
  const operatorCwd = fs.mkdtempSync(path.join(os.tmpdir(), "pi-orch-loop-claim-private-"));
  const packageRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pi-orch-loop-claim-public-"));
  const privateClaim = `glpat-${"unknownformatcredential"}`;
  let phaseIndex = 0;

  try {
    const executor = createExecutor(KAIZEN_PLUGIN, operatorCwd, packageRoot);
    const result = await executor.execute("keep arbitrary claims private", async (params) => {
      const phase = KAIZEN_PLUGIN.phases[phaseIndex++];
      const output = phase === "act" ? `KES_CLAIM: ${privateClaim}` : `done ${phase}`;
      return settledResult(output, 1, params.effectCorrelationId);
    });

    assert.equal(result.success, true);
    assert.equal(
      result.artifacts.filter((artifact) => artifact.type === "kes_learning_candidate").length,
      1,
    );
    const publicBundle = result.artifacts
      .map((artifact) => fs.readFileSync(path.join(packageRoot, artifact.content), "utf8"))
      .join("\n");
    assert.doesNotMatch(publicBundle, new RegExp(privateClaim, "u"));
    assert.match(publicBundle, /Private attributable claim digest: sha256:[a-f0-9]{64}/);

    const [checkpointFile] = fs
      .readdirSync(path.join(operatorCwd, ".loop-runs"))
      .filter((name) => name.endsWith(".run.json"));
    const checkpoint = JSON.parse(
      fs.readFileSync(path.join(operatorCwd, ".loop-runs", checkpointFile), "utf8"),
    );
    assert.match(checkpoint.attempts.at(-1).output, new RegExp(privateClaim, "u"));
  } finally {
    fs.rmSync(operatorCwd, { recursive: true, force: true });
    fs.rmSync(packageRoot, { recursive: true, force: true });
  }
});

test("run-wide claim admission rejects multiple, blank-plus-valid, and secret-bearing claims", async () => {
  const npmToken = `npm_${"a".repeat(26)}`;
  const awsAccessKeyId = `AKIA${"A".repeat(16)}`;
  const scenarios = [
    ["KES_CLAIM: earlier claim", "KES_CLAIM: final claim"],
    ["KES_CLAIM:", "KES_CLAIM: otherwise valid claim"],
    ["", `KES_CLAIM: Authorization Bearer ${npmToken}`],
    ["", `KES_CLAIM: AWS credential ${awsAccessKeyId} must stay private`],
  ];
  for (const [early, final] of scenarios) {
    const operatorCwd = fs.mkdtempSync(path.join(os.tmpdir(), "pi-orch-loop-claims-"));
    const packageRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pi-orch-loop-claims-public-"));
    let phaseIndex = 0;
    try {
      const executor = createExecutor(KAIZEN_PLUGIN, operatorCwd, packageRoot);
      const result = await executor.execute("claim uniqueness", async ({ effectCorrelationId }) => {
        const phase = KAIZEN_PLUGIN.phases[phaseIndex++];
        const output = phase === "plan" ? early : phase === "act" ? final : `done ${phase}`;
        return settledResult(output, 1, effectCorrelationId);
      });
      assert.equal(result.success, true);
      assert.equal(
        result.artifacts.filter((artifact) => artifact.type === "kes_learning_candidate").length,
        0,
      );
    } finally {
      fs.rmSync(operatorCwd, { recursive: true, force: true });
      fs.rmSync(packageRoot, { recursive: true, force: true });
    }
  }
});

test("producer semantic hashing is canonical and rejects relevant routing drift", () => {
  const reordered = {
    ...KAIZEN_PLUGIN,
    agents: Object.fromEntries(Object.entries(KAIZEN_PLUGIN.agents).reverse()),
    cognitiveTools: Object.fromEntries(Object.entries(KAIZEN_PLUGIN.cognitiveTools).reverse()),
  };
  assert.equal(
    captureLoopPluginSemanticsHash(reordered),
    captureLoopPluginSemanticsHash(KAIZEN_PLUGIN),
  );
  assert.notEqual(
    captureLoopPluginSemanticsHash({
      ...KAIZEN_PLUGIN,
      cognitiveTools: { ...KAIZEN_PLUGIN.cognitiveTools, act: ["audit"] },
    }),
    captureLoopPluginSemanticsHash(KAIZEN_PLUGIN),
  );
  assert.equal(
    captureLoopPluginSemanticsHash(KAIZEN_PLUGIN, AGENT_PROFILES),
    captureLoopPluginSemanticsHash(KAIZEN_PLUGIN),
  );
  assert.notEqual(
    captureLoopPluginSemanticsHash(KAIZEN_PLUGIN),
    captureLoopPluginSemanticsHash(KAIZEN_PLUGIN, {
      ...AGENT_PROFILES,
      researcher: {
        ...AGENT_PROFILES.researcher,
        systemPrompt: `${AGENT_PROFILES.researcher.systemPrompt}\nproducer drift`,
      },
    }),
  );
  assert.throws(
    () => captureLoopPluginSemanticsHash({ ...KAIZEN_PLUGIN, async onEnter() {} }),
    /producerHookSemantics/,
  );
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

test("LoopExecutor emits no artifacts when cancellation wins before first dispatch", async () => {
  const operatorCwd = fs.mkdtempSync(path.join(os.tmpdir(), "pi-orch-loop-operator-"));
  const packageRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pi-orch-loop-package-"));
  const controller = new AbortController();
  let fingerprintCalls = 0;

  try {
    const executor = new LoopExecutor(STRATEGIC_PLUGIN, operatorCwd, "/tmp/unused-vault", {
      packageRoot,
      allowUnverifiedKesRoot: true,
      checkpointStore: new LoopRunCheckpointStore(path.join(operatorCwd, ".loop-runs")),
      captureStateFingerprint: () => {
        fingerprintCalls += 1;
        if (fingerprintCalls === 1) controller.abort();
        return "sha256:test-state";
      },
    });
    const result = await executor.execute(
      "Cancel before dispatch",
      async () => {
        throw new Error("dispatch should not run after pre-dispatch cancellation");
      },
      controller.signal,
    );

    assert.equal(result.success, false);
    assert.equal(result.phases.length, 0);
    assert.equal(result.artifacts.length, 0);
    assert.equal(fs.existsSync(path.join(packageRoot, "diary")), false);
    const [checkpointName] = fs
      .readdirSync(path.join(operatorCwd, ".loop-runs"))
      .filter((name) => name.endsWith(".run.json"));
    const checkpoint = JSON.parse(
      fs.readFileSync(path.join(operatorCwd, ".loop-runs", checkpointName), "utf8"),
    );
    assert.equal(checkpoint.status, "aborted");
    assert.equal(checkpoint.terminalPublication, undefined);
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

test("LoopKesWriter accepts the scoped package manifest identity", () => {
  const packageRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pi-orch-loop-scoped-root-"));

  try {
    fs.writeFileSync(
      path.join(packageRoot, "package.json"),
      JSON.stringify({ name: "@tryinget/pi-society-orchestrator" }),
      "utf8",
    );
    const writer = new LoopKesWriter(packageRoot);
    const artifacts = writer.writeTerminal({
      plugin: "kaizen",
      sessionId: "loop-scoped",
      objective: "Accept scoped package manifest identity",
      success: true,
      elapsed: 1,
      resumed: false,
      phases: [],
      timestamp: new Date("2026-04-10T13:25:00Z"),
    });
    assert.equal(artifacts.length, 1);
    assert.equal(fs.existsSync(path.join(packageRoot, "diary")), true);
    assert.equal(fs.existsSync(path.join(packageRoot, "docs", "learnings")), true);
  } finally {
    fs.rmSync(packageRoot, { recursive: true, force: true });
  }
});

test("LoopKesWriter rejects unverified package roots by default", () => {
  const packageRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pi-orch-loop-unverified-root-"));

  try {
    const writer = new LoopKesWriter(packageRoot);
    assert.throws(
      () =>
        writer.writeTerminal({
          plugin: "kaizen",
          sessionId: "loop-unverified",
          objective: "Reject arbitrary KES root",
          success: false,
          elapsed: 0,
          resumed: false,
          phases: [],
          timestamp: new Date("2026-04-10T13:30:00Z"),
        }),
      (error) => error instanceof KesMaterializationError,
    );
    assert.equal(fs.existsSync(path.join(packageRoot, "diary")), false);
    assert.equal(fs.existsSync(path.join(packageRoot, "docs", "learnings")), false);
  } finally {
    fs.rmSync(packageRoot, { recursive: true, force: true });
  }
});

test("Transcendent v4 targets debt before dissolve, runs alien-pass, and uses closure-gate as final DoD phase", () => {
  assert.deepEqual(TRANSCENDENT_PLUGIN.phases, [
    "diagnose",
    "first-100x",
    "second-100x",
    "debt-targeting",
    "dissolve",
    "rebuild",
    "alien-pass",
    "closure-gate",
  ]);
  assert.equal(TRANSCENDENT_PLUGIN.continueOnFailure, false);
  assert.equal(TRANSCENDENT_PLUGIN.phases.includes("name-debt"), false);
  assert.equal(TRANSCENDENT_PLUGIN.cognitiveTools["alien-pass"]?.[0], "elevate");
  assert.equal(
    TRANSCENDENT_PLUGIN.cognitiveTools["closure-gate"]?.[0],
    "knowledge-crystallization",
  );
});

test("Transcendent v4 fail-fast stops unresolved blocking debt before dissolve/rebuild", async () => {
  const operatorCwd = fs.mkdtempSync(path.join(os.tmpdir(), "pi-orch-loop-operator-"));
  const packageRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pi-orch-loop-package-"));
  let phaseIndex = 0;

  try {
    const executor = createExecutor(TRANSCENDENT_PLUGIN, operatorCwd, packageRoot);
    const result = await executor.execute(
      "Remove loop debt",
      async ({ cognitiveTool, context, effectCorrelationId }) => {
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
        return settledResult(
          `Phase ${phase} completed and preserved debt-routing evidence.`,
          7,
          effectCorrelationId,
        );
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
    assert.equal(result.artifacts.length, 1);
    assert.equal(result.artifacts[0].type, "kes_diary");
    assert.match(result.artifacts[0].content, /terminal-failure/);
    const tombstone = fs.readFileSync(path.join(packageRoot, result.artifacts[0].content), "utf8");
    assert.doesNotMatch(tombstone, /runtime cannot safely dissolve\/rebuild/);
    assert.match(tombstone, /"outputSha256": "[a-f0-9]{64}"/);
  } finally {
    fs.rmSync(operatorCwd, { recursive: true, force: true });
    fs.rmSync(packageRoot, { recursive: true, force: true });
  }
});

test("successful eight-phase Transcendent run emits one diary plus one attributable candidate", async () => {
  const operatorCwd = fs.mkdtempSync(path.join(os.tmpdir(), "pi-orch-loop-operator-"));
  const packageRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pi-orch-loop-package-"));
  let phaseIndex = 0;

  try {
    const executor = createExecutor(TRANSCENDENT_PLUGIN, operatorCwd, packageRoot);
    const result = await executor.execute(
      "Prove the eight-phase terminal bundle",
      async ({ effectCorrelationId }) => {
        const phase = TRANSCENDENT_PLUGIN.phases[phaseIndex++];
        const output =
          phase === "closure-gate"
            ? [
                "Closure evidence is complete.",
                "KES_CLAIM: A prepared terminal bundle can be resumed without redispatching completed phases.",
                "CLOSURE_GATE: PASS",
              ].join("\n")
            : `Phase ${phase} completed with package-owned checkpoint evidence.`;
        return settledResult(output, 1, effectCorrelationId);
      },
    );

    assert.equal(result.success, true);
    assert.equal(result.phases.length, 8);
    assert.equal(result.artifacts.filter((artifact) => artifact.type === "kes_diary").length, 1);
    assert.equal(
      result.artifacts.filter((artifact) => artifact.type === "kes_learning_candidate").length,
      1,
    );
    assert.equal(readAllFiles(path.join(packageRoot, "diary")).length, 1);
    assert.equal(readAllFiles(path.join(packageRoot, "docs", "learnings")).length, 1);
  } finally {
    fs.rmSync(operatorCwd, { recursive: true, force: true });
    fs.rmSync(packageRoot, { recursive: true, force: true });
  }
});

test("Transcendent v4 closure-gate records incomplete debt instead of pretending success", async () => {
  const operatorCwd = fs.mkdtempSync(path.join(os.tmpdir(), "pi-orch-loop-operator-"));
  const packageRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pi-orch-loop-package-"));
  let phaseIndex = 0;

  try {
    const executor = createExecutor(TRANSCENDENT_PLUGIN, operatorCwd, packageRoot);
    const result = await executor.execute(
      "Close only when debt is gone",
      async ({ context, effectCorrelationId }) => {
        const phase = TRANSCENDENT_PLUGIN.phases[phaseIndex++];
        if (phase === "alien-pass") {
          assert.match(context, /old problem no longer appears as a problem/);
        }
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
        return settledResult(
          `Phase ${phase} completed with evidence for the closure gate.`,
          6,
          effectCorrelationId,
        );
      },
    );

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

test("Transcendent closure gate requires one explicit machine verdict", async () => {
  const scenarios = [
    { suffix: "No marker", expectedSuccess: false, failureKind: "closure_gate_verdict_missing" },
    {
      suffix: "CLOSURE_GATE: INCOMPLETE",
      expectedSuccess: false,
      failureKind: "closure_gate_incomplete",
    },
    { suffix: "CLOSURE_GATE: PASS", expectedSuccess: true, failureKind: undefined },
  ];

  for (const scenario of scenarios) {
    const operatorCwd = fs.mkdtempSync(path.join(os.tmpdir(), "pi-orch-loop-operator-"));
    const packageRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pi-orch-loop-package-"));
    let phaseIndex = 0;
    try {
      const executor = createExecutor(TRANSCENDENT_PLUGIN, operatorCwd, packageRoot);
      const result = await executor.execute(
        "Enforce truthful closure",
        async ({ effectCorrelationId }) => {
          const phase = TRANSCENDENT_PLUGIN.phases[phaseIndex++];
          const output =
            phase === "closure-gate"
              ? `Closure analysis complete.\n${scenario.suffix}`
              : `Phase ${phase} complete.`;
          return settledResult(output, 1, effectCorrelationId);
        },
      );
      assert.equal(result.success, scenario.expectedSuccess, scenario.suffix);
      assert.equal(result.phases.at(-1)?.failureKind, scenario.failureKind, scenario.suffix);
    } finally {
      fs.rmSync(operatorCwd, { recursive: true, force: true });
      fs.rmSync(packageRoot, { recursive: true, force: true });
    }
  }
});

test("LoopExecutor emits one terminal diary and no candidate for unmarked successful prose", async () => {
  const operatorCwd = fs.mkdtempSync(path.join(os.tmpdir(), "pi-orch-loop-operator-"));
  const packageRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pi-orch-loop-package-"));
  let phaseIndex = 0;

  try {
    const executor = createExecutor(STRATEGIC_PLUGIN, operatorCwd, packageRoot);

    const result = await executor.execute(
      "Plan the migration",
      async ({ cognitiveTool, effectCorrelationId }) => {
        const phase = STRATEGIC_PLUGIN.phases[phaseIndex++];
        assert.equal(cognitiveTool, STRATEGIC_PLUGIN.cognitiveTools[phase][0]);
        return settledResult(
          `Phase ${phase} stayed bounded and completed successfully.`,
          8,
          effectCorrelationId,
        );
      },
    );

    assert.equal(result.success, true);
    assert.equal(result.artifacts.filter((artifact) => artifact.type === "kes_diary").length, 1);
    assert.equal(
      result.artifacts.filter((artifact) => artifact.type === "kes_learning_candidate").length,
      0,
    );

    const diaryDir = path.join(packageRoot, "diary");
    const learningsDir = path.join(packageRoot, "docs", "learnings");
    assert.equal(readAllFiles(diaryDir).length, 1);
    assert.equal(readAllFiles(learningsDir).length, 0);
  } finally {
    fs.rmSync(operatorCwd, { recursive: true, force: true });
    fs.rmSync(packageRoot, { recursive: true, force: true });
  }
});
