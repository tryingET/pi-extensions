import assert from "node:assert/strict";
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import piAutoresearchExtension from "../extensions/pi-autoresearch.ts";
import {
  AUTORESEARCH_COMMAND_NAME,
  AUTORESEARCH_LOCAL_ARTIFACTS,
  AUTORESEARCH_RUN_TOOL_NAME,
  AUTORESEARCH_STATUS_TOOL_NAME,
  appendReceipt,
  buildAutoresearchRuntimeStatus,
  createConfigReceipt,
  createRunReceipt,
  formatAutoresearchStatusText,
  loadReceiptLog,
  parseMetricLines,
  parseReceiptLine,
  serializeReceipt,
} from "../src/core/runtime.ts";

type RegisteredCommand = {
  description?: string;
  handler: (args: string, ctx: CommandContext) => Promise<void> | void;
};

type RegisteredTool = {
  name: string;
  description?: string;
  execute: (
    toolCallId: string,
    params: unknown,
    signal: AbortSignal | undefined,
    onUpdate: unknown,
    ctx: { cwd?: string },
  ) => Promise<{ content: Array<{ type: string; text: string }>; details: unknown }>;
};

type CommandContext = {
  cwd: string;
  hasUI: boolean;
  ui: {
    editor(title: string, text: string): Promise<void>;
    notify(message: string, level?: string): void;
  };
};

function registerHarness() {
  const commands = new Map<string, RegisteredCommand>();
  const tools = new Map<string, RegisteredTool>();

  piAutoresearchExtension({
    registerCommand(name: string, command: RegisteredCommand) {
      commands.set(name, command);
    },
    registerTool(tool: RegisteredTool) {
      tools.set(tool.name, tool);
    },
  } as never);

  return { commands, tools };
}

async function withTempDir(fn: (cwd: string) => Promise<void> | void): Promise<void> {
  const cwd = mkdtempSync(path.join(os.tmpdir(), "pi-autoresearch-runtime-"));
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

test("parseMetricLines extracts structured METRIC entries and ignores unrelated lines", () => {
  const metrics = parseMetricLines(
    [
      "warmup",
      "METRIC total_ms=15200",
      "METRIC render_ms=9800",
      "METRIC invalid=abc",
      "METRIC __proto__=17",
      "METRIC total_ms=15100",
    ].join("\n"),
  );

  assert.deepEqual(metrics, {
    total_ms: 15100,
    render_ms: 9800,
  });
});

test("receipt helpers round-trip config and run entries", () => {
  const config = createConfigReceipt({
    name: "widget-speed",
    metricName: "total_ms",
    metricUnit: "ms",
    direction: "lower",
    createdAt: 10,
    benchmarkCommand: "bash autoresearch.sh",
    checksCommand: "bash autoresearch.checks.sh",
  });
  const run = createRunReceipt({
    status: "candidate",
    metric: 14000,
    metrics: { render_ms: 9200 },
    description: "cache layout lookups",
    timestamp: 20,
    iteration: 3,
    confidence: 1.4,
    durationSeconds: 0.52,
    exitCode: 0,
    timedOut: false,
    benchmarkCommand: "bash autoresearch.sh",
    checksCommand: "bash autoresearch.checks.sh",
    checksPassed: true,
    checksDurationSeconds: 0.14,
  });

  assert.deepEqual(parseReceiptLine(serializeReceipt(config)), config);
  assert.deepEqual(parseReceiptLine(serializeReceipt(run)), run);
});

test("buildAutoresearchRuntimeStatus reports the bounded runtime surface", () => {
  const status = buildAutoresearchRuntimeStatus("/repo");

  assert.equal(status.phase, "bounded_runtime_kernel");
  assert.equal(status.commandName, AUTORESEARCH_COMMAND_NAME);
  assert.deepEqual(status.toolNames, [AUTORESEARCH_STATUS_TOOL_NAME, AUTORESEARCH_RUN_TOOL_NAME]);
  assert.deepEqual(status.localArtifacts, [...AUTORESEARCH_LOCAL_ARTIFACTS]);
  assert.equal(status.currentSegment.configured, false);
  assert.equal(status.runtimeProjection.state, "segment_unconfigured");
  assert.equal(status.runtimeProjection.source, "receipt_fallback");
  assert.equal(status.runtimeProjection.hasLedger, false);
  assert.match(formatAutoresearchStatusText(status), /phase: bounded_runtime_kernel/);
  assert.match(formatAutoresearchStatusText(status), /machine state: segment_unconfigured/);
});

test("status builder summarizes best metric and confidence from appended receipts", () =>
  withTempDir((cwd) => {
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
    appendReceipt(
      cwd,
      createRunReceipt({
        status: "baseline",
        metric: 100,
        description: "baseline",
        timestamp: 2,
      }),
    );
    appendReceipt(
      cwd,
      createRunReceipt({
        status: "candidate",
        metric: 90,
        description: "candidate 1",
        timestamp: 3,
      }),
    );
    appendReceipt(
      cwd,
      createRunReceipt({
        status: "candidate",
        metric: 92,
        description: "candidate 2",
        timestamp: 4,
      }),
    );

    const status = buildAutoresearchRuntimeStatus(cwd);
    assert.equal(status.currentSegment.configured, true);
    assert.equal(status.currentSegment.runCount, 3);
    assert.equal(status.currentSegment.successfulRunCount, 3);
    assert.equal(status.currentSegment.baselineMetric, 100);
    assert.equal(status.currentSegment.bestMetric, 90);
    assert.equal(status.runtimeProjection.state, "ready");
    assert.equal(status.runtimeProjection.source, "receipt_fallback");
    assert.equal(status.runtimeProjection.hasLedger, false);
    assert.ok((status.currentSegment.confidence ?? 0) > 0);
  }));

test("extension registers /autoresearch, autoresearch_runtime_status, and autoresearch_runtime_run", () => {
  const { commands, tools } = registerHarness();

  assert.equal(typeof commands.get(AUTORESEARCH_COMMAND_NAME)?.handler, "function");
  assert.equal(typeof tools.get(AUTORESEARCH_STATUS_TOOL_NAME)?.execute, "function");
  assert.equal(typeof tools.get(AUTORESEARCH_RUN_TOOL_NAME)?.execute, "function");
});

test("/autoresearch opens the bounded-runtime overview", async () => {
  const { commands } = registerHarness();
  let editorTitle = "";
  let editorText = "";
  const notifications: Array<{ message: string; level?: string }> = [];

  await commands.get(AUTORESEARCH_COMMAND_NAME)?.handler("optimize startup", {
    cwd: "/repo",
    hasUI: true,
    ui: {
      async editor(title: string, text: string) {
        editorTitle = title;
        editorText = text;
      },
      notify(message: string, level?: string) {
        notifications.push({ message, level });
      },
    },
  });

  assert.equal(editorTitle, "pi-autoresearch");
  assert.match(editorText, /machine projection/);
  assert.equal(notifications.length, 1);
  assert.match(notifications[0].message, /machine\/ledger-backed run/);
});

test("autoresearch_runtime_run bootstraps config, executes benchmark, and appends receipts", async () => {
  await withTempDir(async (cwd) => {
    const { tools } = registerHarness();
    const tool = tools.get(AUTORESEARCH_RUN_TOOL_NAME);
    assert.ok(tool);

    writeExecutable(
      cwd,
      "autoresearch.sh",
      [
        "#!/usr/bin/env bash",
        "set -euo pipefail",
        'echo "METRIC total_ms=152"',
        'echo "METRIC render_ms=99"',
      ].join("\n"),
    );

    const result = await tool?.execute(
      "call-1",
      {
        cwd,
        description: "baseline run",
        name: "widget-speed",
        metricName: "total_ms",
        metricUnit: "ms",
        direction: "lower",
      },
      undefined,
      undefined,
      { cwd },
    );

    assert.ok(result);
    assert.match(result?.content[0]?.text ?? "", /run status: baseline/);
    assert.match(result?.content[0]?.text ?? "", /machine state: ready/);
    const details = result?.details as {
      createdConfig: boolean;
      parsedMetrics: Record<string, number>;
      runReceipt: { status: string; metric: number };
      status: {
        currentSegment: { baselineMetric: number; bestMetric: number; runCount: number };
        runtimeProjection: {
          state: string;
          source: string;
          hasLedger: boolean;
          eventCount: number;
          replayedEventCount: number;
          ledgerPath?: string;
        };
      };
      receiptPath: string;
    };
    assert.equal(details.createdConfig, true);
    assert.deepEqual(details.parsedMetrics, { total_ms: 152, render_ms: 99 });
    assert.equal(details.runReceipt.status, "baseline");
    assert.equal(details.runReceipt.metric, 152);
    assert.equal(details.status.currentSegment.baselineMetric, 152);
    assert.equal(details.status.currentSegment.bestMetric, 152);
    assert.equal(details.status.currentSegment.runCount, 1);
    assert.equal(details.status.runtimeProjection.state, "ready");
    assert.equal(details.status.runtimeProjection.source, "ledger");
    assert.equal(details.status.runtimeProjection.hasLedger, true);
    assert.equal(details.status.runtimeProjection.eventCount, 5);
    assert.equal(details.status.runtimeProjection.replayedEventCount, 5);

    const log = loadReceiptLog(cwd);
    assert.equal(log.invalidLineCount, 0);
    assert.equal(log.entries.length, 2);
    assert.equal(readFileSync(details.receiptPath, "utf8").trim().split("\n").length, 2);
    assert.ok(
      (details.status.runtimeProjection.ledgerPath ?? "").endsWith("autoresearch.events.jsonl"),
    );
    assert.equal(
      readFileSync(details.status.runtimeProjection.ledgerPath ?? "", "utf8")
        .trim()
        .split("\n").length,
      5,
    );
  });
});

test("autoresearch_runtime_run records checks_failed receipts without establishing a baseline", async () => {
  await withTempDir(async (cwd) => {
    const { tools } = registerHarness();
    const tool = tools.get(AUTORESEARCH_RUN_TOOL_NAME);
    assert.ok(tool);

    writeExecutable(
      cwd,
      "autoresearch.sh",
      ["#!/usr/bin/env bash", "set -euo pipefail", 'echo "METRIC total_ms=111"'].join("\n"),
    );
    writeExecutable(
      cwd,
      "autoresearch.checks.sh",
      ["#!/usr/bin/env bash", "set -euo pipefail", 'echo "typecheck failed" >&2', "exit 1"].join(
        "\n",
      ),
    );

    const result = await tool?.execute(
      "call-2",
      {
        cwd,
        description: "candidate with failing checks",
        name: "widget-speed",
        metricName: "total_ms",
        metricUnit: "ms",
        direction: "lower",
      },
      undefined,
      undefined,
      { cwd },
    );

    assert.ok(result);
    const details = result?.details as {
      runReceipt: { status: string };
      status: {
        currentSegment: {
          baselineMetric: number | null;
          successfulRunCount: number;
          runCount: number;
        };
        runtimeProjection: {
          state: string;
          source: string;
          hasLedger: boolean;
          eventCount: number;
        };
      };
    };
    assert.equal(details.runReceipt.status, "checks_failed");
    assert.equal(details.status.currentSegment.baselineMetric, null);
    assert.equal(details.status.currentSegment.successfulRunCount, 0);
    assert.equal(details.status.currentSegment.runCount, 1);
    assert.equal(details.status.runtimeProjection.state, "ready");
    assert.equal(details.status.runtimeProjection.source, "ledger");
    assert.equal(details.status.runtimeProjection.hasLedger, true);
    assert.equal(details.status.runtimeProjection.eventCount, 6);
  });
});

test("autoresearch_runtime_run backfills the event ledger from existing receipts before appending a new run", async () => {
  await withTempDir(async (cwd) => {
    const { tools } = registerHarness();
    const tool = tools.get(AUTORESEARCH_RUN_TOOL_NAME);
    assert.ok(tool);

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
    appendReceipt(
      cwd,
      createRunReceipt({
        status: "baseline",
        metric: 200,
        description: "historical baseline",
        timestamp: 2,
      }),
    );

    writeExecutable(
      cwd,
      "autoresearch.sh",
      ["#!/usr/bin/env bash", "set -euo pipefail", 'echo "METRIC total_ms=180"'].join("\n"),
    );

    const result = await tool?.execute(
      "call-3",
      {
        cwd,
        description: "candidate after ledger backfill",
      },
      undefined,
      undefined,
      { cwd },
    );

    const details = result?.details as {
      status: {
        currentSegment: { runCount: number; bestMetric: number | null };
        runtimeProjection: {
          state: string;
          source: string;
          eventCount: number;
          hasLedger: boolean;
          ledgerPath?: string;
        };
      };
    };

    assert.equal(details.status.currentSegment.runCount, 2);
    assert.equal(details.status.currentSegment.bestMetric, 180);
    assert.equal(details.status.runtimeProjection.state, "ready");
    assert.equal(details.status.runtimeProjection.source, "ledger");
    assert.equal(details.status.runtimeProjection.hasLedger, true);
    assert.equal(details.status.runtimeProjection.eventCount, 9);
    assert.equal(
      readFileSync(details.status.runtimeProjection.ledgerPath ?? "", "utf8")
        .trim()
        .split("\n").length,
      9,
    );
  });
});
