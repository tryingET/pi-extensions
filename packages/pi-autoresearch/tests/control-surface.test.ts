import assert from "node:assert/strict";
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  type PiAutoresearchExtensionOptions,
  registerPiAutoresearchExtension,
} from "../extensions/pi-autoresearch.ts";
import { AUTORESEARCH_NEXT_HYPOTHESIS_TEMPLATE_NAME } from "../src/core/decisions.ts";
import {
  AUTORESEARCH_CONTROL_TOOL_NAME,
  AUTORESEARCH_RUN_TOOL_NAME,
  appendReceipt,
  buildAutoresearchRuntimeStatus,
  createConfigReceipt,
  createRunReceipt,
} from "../src/core/runtime.ts";

type RegisteredTool = {
  name: string;
  execute: (
    toolCallId: string,
    params: unknown,
    signal: AbortSignal | undefined,
    onUpdate: unknown,
    ctx: { cwd?: string },
  ) => Promise<{ content: Array<{ type: string; text: string }>; details: unknown }>;
};

function registerHarness(options: PiAutoresearchExtensionOptions = {}) {
  const tools = new Map<string, RegisteredTool>();

  registerPiAutoresearchExtension(
    {
      registerCommand() {},
      registerTool(tool: RegisteredTool) {
        tools.set(tool.name, tool);
      },
    } as never,
    options,
  );

  return { tools };
}

async function withTempDir(fn: (cwd: string) => Promise<void> | void): Promise<void> {
  const cwd = mkdtempSync(path.join(os.tmpdir(), "pi-autoresearch-control-"));
  try {
    await fn(cwd);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
}

function writeExecutable(cwd: string, name: string, content: string): void {
  const target = path.join(cwd, name);
  writeFileSync(target, content, "utf8");
  chmodSync(target, 0o755);
}

function seedConfiguredRuntime(cwd: string): void {
  appendReceipt(
    cwd,
    createConfigReceipt({
      name: "widget-speed",
      metricName: "total_ms",
      metricUnit: "ms",
      direction: "lower",
      createdAt: 1,
      benchmarkCommand: "bash autoresearch.sh",
    }),
  );
}

function seedFinalizeCandidate(cwd: string): void {
  seedConfiguredRuntime(cwd);
  appendReceipt(
    cwd,
    createRunReceipt({
      status: "baseline",
      metric: 100,
      description: "candidate is good enough to finalize",
      timestamp: 2,
      decision: {
        kind: "next_hypothesis",
        templateName: AUTORESEARCH_NEXT_HYPOTHESIS_TEMPLATE_NAME,
        status: "finalize_candidate",
        mappedDecision: "finalize",
        blockingReason: null,
        failureStage: null,
        stateRead: "The bounded runtime is stable and finalization is now plausible.",
        nextHypothesis: "Either finalize or explicitly continue with one more bounded run.",
        targetFiles: ["packages/pi-autoresearch/src/core/runtime.ts"],
        expectedPrimaryEffect: "Surface the finalize-worthy posture truthfully.",
        timestamp: 2,
      },
    }),
  );
}

function seedRebaselineNeeded(cwd: string): void {
  seedConfiguredRuntime(cwd);
  appendReceipt(
    cwd,
    createRunReceipt({
      status: "baseline",
      metric: 100,
      description: "baseline needs refresh",
      timestamp: 2,
      decision: {
        kind: "next_hypothesis",
        templateName: AUTORESEARCH_NEXT_HYPOTHESIS_TEMPLATE_NAME,
        status: "rebaseline_needed",
        mappedDecision: "rebaseline",
        blockingReason: null,
        failureStage: null,
        stateRead: "The benchmark contract drifted and needs a fresh baseline.",
        nextHypothesis: "Reconfigure before another ordinary run.",
        targetFiles: ["packages/pi-autoresearch/src/core/runtime.ts"],
        expectedPrimaryEffect: "Hold the runtime in rebaseline_needed.",
        timestamp: 2,
      },
    }),
  );
}

test("autoresearch_runtime_control can set continue and the next run consumes it", async () => {
  await withTempDir(async (cwd) => {
    const { tools } = registerHarness();
    const controlTool = tools.get(AUTORESEARCH_CONTROL_TOOL_NAME);
    const runTool = tools.get(AUTORESEARCH_RUN_TOOL_NAME);
    assert.ok(controlTool);
    assert.ok(runTool);

    seedFinalizeCandidate(cwd);
    writeExecutable(
      cwd,
      "autoresearch.sh",
      ["#!/usr/bin/env bash", "set -euo pipefail", 'echo "METRIC total_ms=92"'].join("\n"),
    );

    const before = buildAutoresearchRuntimeStatus(cwd);
    assert.equal(before.runtimeProjection.state, "finalize_candidate");
    assert.equal(before.control.kind, "awaiting_operator");

    const controlResult = await controlTool?.execute(
      "control-1",
      {
        cwd,
        action: "set",
        decision: "continue",
        reason: "Keep iterating once before finalization.",
      },
      undefined,
      undefined,
      { cwd },
    );

    const controlDetails = controlResult?.details as {
      status: { control: { kind: string; allowedActions: string[] } };
    };
    assert.equal(controlDetails.status.control.kind, "continue");
    assert.deepEqual(controlDetails.status.control.allowedActions, [
      "continue",
      "finalize",
      "stop",
    ]);

    const runResult = await runTool?.execute(
      "run-1",
      {
        cwd,
        description: "continue after finalize candidate",
      },
      undefined,
      undefined,
      { cwd },
    );

    const runDetails = runResult?.details as {
      status: {
        runtimeProjection: { state: string; source: string };
        control: { kind: string; allowedActions: string[] };
      };
      runReceipt: { status: string };
    };
    assert.equal(runDetails.runReceipt.status, "candidate");
    assert.equal(runDetails.status.runtimeProjection.state, "ready");
    assert.equal(runDetails.status.runtimeProjection.source, "ledger");
    assert.equal(runDetails.status.control.kind, "none");
    assert.deepEqual(runDetails.status.control.allowedActions, ["continue", "stop"]);

    const resumed = buildAutoresearchRuntimeStatus(cwd);
    assert.equal(resumed.control.kind, "none");
    assert.equal(resumed.runtimeProjection.state, "ready");
  });
});

test("autoresearch_runtime_control rejects continue from a rebaseline-needed posture", async () => {
  await withTempDir(async (cwd) => {
    const { tools } = registerHarness();
    const controlTool = tools.get(AUTORESEARCH_CONTROL_TOOL_NAME);
    assert.ok(controlTool);

    seedRebaselineNeeded(cwd);

    await assert.rejects(
      controlTool?.execute(
        "control-2-illegal",
        {
          cwd,
          action: "set",
          decision: "continue",
        },
        undefined,
        undefined,
        { cwd },
      ),
      /Cannot set autoresearch control to continue/,
    );
  });
});

test("autoresearch_runtime_control rejects finalize when the runtime is not finalize-worthy", async () => {
  await withTempDir(async (cwd) => {
    const { tools } = registerHarness();
    const controlTool = tools.get(AUTORESEARCH_CONTROL_TOOL_NAME);
    assert.ok(controlTool);

    seedConfiguredRuntime(cwd);

    await assert.rejects(
      controlTool?.execute(
        "control-2b-illegal",
        {
          cwd,
          action: "set",
          decision: "finalize",
        },
        undefined,
        undefined,
        { cwd },
      ),
      /Cannot set autoresearch control to finalize/,
    );
  });
});

test("autoresearch_runtime_control rebaseline blocks ordinary runs until reconfigure consumes it", async () => {
  await withTempDir(async (cwd) => {
    const { tools } = registerHarness();
    const controlTool = tools.get(AUTORESEARCH_CONTROL_TOOL_NAME);
    const runTool = tools.get(AUTORESEARCH_RUN_TOOL_NAME);
    assert.ok(controlTool);
    assert.ok(runTool);

    seedRebaselineNeeded(cwd);
    writeExecutable(
      cwd,
      "autoresearch.sh",
      ["#!/usr/bin/env bash", "set -euo pipefail", 'echo "METRIC total_ms=88"'].join("\n"),
    );

    await controlTool?.execute(
      "control-2",
      {
        cwd,
        action: "set",
        decision: "rebaseline",
        reason: "Baseline changed; refresh the segment first.",
      },
      undefined,
      undefined,
      { cwd },
    );

    await assert.rejects(
      runTool?.execute(
        "run-2",
        {
          cwd,
          description: "ordinary run should stay blocked",
        },
        undefined,
        undefined,
        { cwd },
      ),
      /control state rebaseline is selected/,
    );

    const reconfigured = await runTool?.execute(
      "run-3",
      {
        cwd,
        description: "reconfigure after rebaseline",
        reconfigure: true,
        name: "widget-speed-v2",
        metricName: "total_ms",
        metricUnit: "ms",
        direction: "lower",
      },
      undefined,
      undefined,
      { cwd },
    );

    const details = reconfigured?.details as {
      createdConfig: boolean;
      status: {
        currentSegment: { name: string | null; runCount: number };
        runtimeProjection: { state: string };
        control: { kind: string };
      };
    };
    assert.equal(details.createdConfig, true);
    assert.equal(details.status.currentSegment.name, "widget-speed-v2");
    assert.equal(details.status.currentSegment.runCount, 1);
    assert.equal(details.status.runtimeProjection.state, "ready");
    assert.equal(details.status.control.kind, "none");
  });
});

test("autoresearch_runtime_control finalize blocks ordinary runs and persists across status reload", async () => {
  await withTempDir(async (cwd) => {
    const { tools } = registerHarness();
    const controlTool = tools.get(AUTORESEARCH_CONTROL_TOOL_NAME);
    const runTool = tools.get(AUTORESEARCH_RUN_TOOL_NAME);
    assert.ok(controlTool);
    assert.ok(runTool);

    seedFinalizeCandidate(cwd);
    writeExecutable(
      cwd,
      "autoresearch.sh",
      ["#!/usr/bin/env bash", "set -euo pipefail", 'echo "METRIC total_ms=91"'].join("\n"),
    );

    const setResult = await controlTool?.execute(
      "control-3",
      {
        cwd,
        action: "set",
        decision: "finalize",
      },
      undefined,
      undefined,
      { cwd },
    );
    assert.match(setResult?.content[0]?.text ?? "", /control state: finalize/);
    assert.match(setResult?.content[0]?.text ?? "", /next step: .*finalize/i);

    await assert.rejects(
      runTool?.execute(
        "run-4",
        {
          cwd,
          description: "ordinary run should remain blocked by finalize",
        },
        undefined,
        undefined,
        { cwd },
      ),
      /control state finalize is selected/,
    );

    const statusResult = await controlTool?.execute(
      "control-4",
      {
        cwd,
        action: "status",
      },
      undefined,
      undefined,
      { cwd },
    );

    const statusDetails = statusResult?.details as {
      status: {
        control: { kind: string };
        runtimeSnapshot: { reuse: string };
      };
    };
    assert.equal(statusDetails.status.control.kind, "finalize");
    assert.equal(statusDetails.status.runtimeSnapshot.reuse, "reused");
  });
});

test("autoresearch_runtime_control stop persists across fresh-session reload and blocks runs", async () => {
  await withTempDir(async (cwd) => {
    const { tools } = registerHarness();
    const controlTool = tools.get(AUTORESEARCH_CONTROL_TOOL_NAME);
    const runTool = tools.get(AUTORESEARCH_RUN_TOOL_NAME);
    assert.ok(controlTool);
    assert.ok(runTool);

    seedConfiguredRuntime(cwd);
    writeExecutable(
      cwd,
      "autoresearch.sh",
      ["#!/usr/bin/env bash", "set -euo pipefail", 'echo "METRIC total_ms=95"'].join("\n"),
    );

    await controlTool?.execute(
      "control-5",
      {
        cwd,
        action: "set",
        decision: "stop",
        reason: "Pause the bounded runtime until a later operator choice.",
      },
      undefined,
      undefined,
      { cwd },
    );

    const resumed = buildAutoresearchRuntimeStatus(cwd);
    assert.equal(resumed.control.kind, "stop");
    assert.equal(resumed.runtimeSnapshot.reuse, "reused");

    await assert.rejects(
      runTool?.execute(
        "run-5",
        {
          cwd,
          description: "run should stay blocked by stop",
        },
        undefined,
        undefined,
        { cwd },
      ),
      /control state stop is selected/,
    );
  });
});
