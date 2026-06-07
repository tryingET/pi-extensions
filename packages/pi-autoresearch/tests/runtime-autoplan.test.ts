import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  type PiAutoresearchExtensionOptions,
  registerPiAutoresearchExtension,
} from "../extensions/pi-autoresearch.ts";
import { AUTORESEARCH_AUTOPLAN_TOOL_NAME } from "../src/core/runtime.ts";

type RegisteredCommand = {
  description?: string;
  handler: (args: string, ctx: unknown) => Promise<void> | void;
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

type RegisteredEventHandler = (...args: unknown[]) => unknown;

function registerHarness(options: PiAutoresearchExtensionOptions = {}) {
  const commands = new Map<string, RegisteredCommand>();
  const tools = new Map<string, RegisteredTool>();
  const eventHandlers = new Map<string, RegisteredEventHandler>();

  registerPiAutoresearchExtension(
    {
      registerCommand(name: string, command: RegisteredCommand) {
        commands.set(name, command);
      },
      registerTool(tool: RegisteredTool) {
        tools.set(tool.name, tool);
      },
      on(event: string, handler: RegisteredEventHandler) {
        eventHandlers.set(event, handler);
      },
    } as never,
    options,
  );

  return { commands, tools, eventHandlers };
}

async function withTempDir(fn: (cwd: string) => Promise<void> | void): Promise<void> {
  const cwd = mkdtempSync(path.join(os.tmpdir(), "pi-autoresearch-runtime-"));
  try {
    await fn(cwd);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
}

function writeFile(target: string, content: string): void {
  mkdirSync(path.dirname(target), { recursive: true });
  writeFileSync(target, content, "utf8");
}

test("autoresearch_runtime_autoplan infers setup and can materialize DSPx intent handoff", async () => {
  await withTempDir(async (cwd) => {
    const { tools } = registerHarness();
    writeFile(
      path.join(cwd, "package.json"),
      JSON.stringify({
        name: "demo-speed",
        scripts: { bench: "node bench.js", check: "node check.js" },
      }),
    );
    writeFile(path.join(cwd, "src/index.ts"), "export const value = 1;\n");

    const dspxOutdir = path.join(cwd, ".autoresearch/dspx/generated/autosetup-planner");
    mkdirSync(dspxOutdir, { recursive: true });
    writeFile(
      path.join(dspxOutdir, "behavior_results.json"),
      JSON.stringify({
        summary: { status: "passed", total: 1, passed: 1, failed: 0, error: 0 },
        examples: [
          {
            index: 0,
            status: "passed",
            inputs: { objective: "reduce benchmark runtime" },
            observed_outputs: {
              campaign_name: "dspx-speed",
              metric_name: "total_ms",
              metric_unit: "ms",
              direction: "lower",
              benchmark_command: "npm run bench",
              checks_command: "npm run check",
              risks: "watch noisy timing",
              next_action: "apply via autoresearch_runtime_setup only",
            },
          },
        ],
      }),
    );

    const result = await tools.get(AUTORESEARCH_AUTOPLAN_TOOL_NAME)?.execute(
      "call-autoplan",
      {
        cwd,
        objective: "reduce benchmark runtime",
        planner: "dspx_program",
        materializeDspxIntent: true,
        dspxOutdir,
      },
      undefined,
      undefined,
      { cwd },
    );

    assert.ok(result);
    assert.match(result.content[0]?.text ?? "", /DSPx generated DSPy planner assembly/);
    const details = result.details as {
      config: { name: string; metricName: string; direction: string };
      benchmarkCommand: string;
      checksCommand: string;
      dspxProgramGen: { intentPath: string; materialized: boolean; command: string };
      dspxAdvisory: {
        available: boolean;
        status: string;
        matchedObjective: boolean;
        proposal: { campaignName: string; benchmarkCommand: string };
        nextToolCall: string;
      };
    };
    assert.equal(details.config.metricName, "total_ms");
    assert.equal(details.config.direction, "lower");
    assert.equal(details.benchmarkCommand, "npm run bench");
    assert.equal(details.checksCommand, "npm run check");
    assert.equal(details.dspxProgramGen.materialized, true);
    assert.equal(details.dspxAdvisory.available, true);
    assert.equal(details.dspxAdvisory.status, "passed");
    assert.equal(details.dspxAdvisory.matchedObjective, true);
    assert.equal(details.dspxAdvisory.proposal.campaignName, "dspx-speed");
    assert.equal(details.dspxAdvisory.proposal.benchmarkCommand, "npm run bench");
    assert.match(details.dspxAdvisory.nextToolCall, /autoresearch_runtime_setup/);
    assert.match(result.content[0]?.text ?? "", /DSPx advisory evidence/);
    assert.match(
      readFileSync(details.dspxProgramGen.intentPath, "utf8"),
      /AutoresearchSetupPlanner/,
    );
    assert.match(details.dspxProgramGen.command, /program-gen/);
  });
});

test("autoresearch_runtime_autoplan proposes duration script for generic total_ms benchmark", async () => {
  await withTempDir(async (cwd) => {
    const { tools } = registerHarness();
    writeFile(
      path.join(cwd, "package.json"),
      JSON.stringify({
        name: "demo-test",
        scripts: { test: "node test.js", check: "node check.js" },
      }),
    );

    const result = await tools.get(AUTORESEARCH_AUTOPLAN_TOOL_NAME)?.execute(
      "call-autoplan-duration-script",
      {
        cwd,
        objective: "reduce test runtime",
        metricName: "total_ms",
        direction: "lower",
      },
      undefined,
      undefined,
      { cwd },
    );

    assert.ok(result);
    const output = result.content[0]?.text ?? "";
    assert.match(output, /Measurement contract/);
    assert.match(output, /Benchmark script proposal/);
    assert.doesNotMatch(output, /may not print required METRIC total_ms=value/);
    const details = result.details as {
      risks: string[];
      nextToolCall: string;
      measurementContract: { optimizationAuthority: string; freshness: string };
      benchmarkScriptProposal: {
        benchmarkScript: string;
        source: string;
        measurementContract: { optimizationAuthority: string; freshness: string };
      };
    };
    assert.equal(details.measurementContract.optimizationAuthority, "baseline_allowed");
    assert.equal(details.measurementContract.freshness, "run_generated");
    assert.equal(details.benchmarkScriptProposal.source, "duration_wrapper");
    assert.equal(
      details.benchmarkScriptProposal.measurementContract.optimizationAuthority,
      "baseline_allowed",
    );
    assert.equal(details.benchmarkScriptProposal.measurementContract.freshness, "run_generated");
    assert.match(details.benchmarkScriptProposal.benchmarkScript, /npm test/);
    assert.match(
      details.benchmarkScriptProposal.benchmarkScript,
      /AUTORESEARCH_BENCHMARK_COMMAND=/,
    );
    assert.match(details.benchmarkScriptProposal.benchmarkScript, /METRIC total_ms=/);
    assert.doesNotMatch(details.benchmarkScriptProposal.benchmarkScript, /node -e 'console\.log/);
    assert.ok(
      !details.risks.some((risk) => risk.includes("METRIC total_ms=value")),
      "script proposal should resolve the generic metric-contract warning",
    );
    assert.match(details.nextToolCall, /action: "baseline"/);
    assert.match(details.nextToolCall, /benchmarkCommand: "bash autoresearch\.sh"/);
    assert.match(details.nextToolCall, /benchmarkScript:/);
    assert.match(details.nextToolCall, /allowOverwriteScripts: false/);
  });
});

test("autoresearch_runtime_autoplan omits inferred duplicate checks command", async () => {
  await withTempDir(async (cwd) => {
    const { tools } = registerHarness();
    writeFile(
      path.join(cwd, "package.json"),
      JSON.stringify({
        name: "demo-duplicate-checks",
        scripts: {
          test: "npm run quality:ci",
          check: "npm run quality:ci",
          "quality:ci": "node test.js",
        },
      }),
    );

    const result = await tools.get(AUTORESEARCH_AUTOPLAN_TOOL_NAME)?.execute(
      "call-autoplan-duplicate-checks",
      {
        cwd,
        objective: "reduce test runtime",
        benchmarkCommand: "npm test",
        metricName: "total_ms",
        direction: "lower",
      },
      undefined,
      undefined,
      { cwd },
    );

    assert.ok(result);
    const details = result.details as {
      checksCommand: null;
      risks: string[];
      nextToolCall: string;
    };
    assert.equal(details.checksCommand, null);
    assert.ok(details.risks.some((risk) => risk.includes("checks command omitted")));
    assert.match(details.nextToolCall, /checksCommand: null/);
    assert.match(details.nextToolCall, /action: "baseline"/);
  });
});

test("autoresearch_runtime_autoplan omits inferred duplicate checks for existing autoresearch wrapper", async () => {
  await withTempDir(async (cwd) => {
    const { tools } = registerHarness();
    writeFile(
      path.join(cwd, "package.json"),
      JSON.stringify({
        name: "demo-wrapper-duplicate-checks",
        scripts: {
          test: "npm run quality:ci",
          check: "npm run quality:ci",
          "quality:ci": "node test.js",
        },
      }),
    );
    writeFile(
      path.join(cwd, "autoresearch.sh"),
      [
        "#!/usr/bin/env bash",
        "set -euo pipefail",
        '# autoresearch-wrapped-command-json: "npm test"',
        "",
        "AUTORESEARCH_BENCHMARK_COMMAND='npm test' node <<'NODE'",
        'const { spawnSync } = require("node:child_process");',
        "const startedAt = Date.now();",
        "const result = spawnSync(process.env.AUTORESEARCH_BENCHMARK_COMMAND, { shell: true });",
        "const durationMs = Date.now() - startedAt;",
        "if (typeof result.status === 'number' && result.status !== 0) process.exit(result.status);",
        "console.log('METRIC total_ms=' + durationMs);",
        "NODE",
        "",
      ].join("\n"),
    );

    const result = await tools.get(AUTORESEARCH_AUTOPLAN_TOOL_NAME)?.execute(
      "call-autoplan-wrapper-duplicate-checks",
      {
        cwd,
        objective: "reduce test runtime",
        metricName: "total_ms",
        direction: "lower",
      },
      undefined,
      undefined,
      { cwd },
    );

    assert.ok(result);
    const details = result.details as {
      benchmarkCommand: string;
      checksCommand: null;
      risks: string[];
      nextToolCall: string;
    };
    assert.equal(details.benchmarkCommand, "bash autoresearch.sh");
    assert.equal(details.checksCommand, null);
    assert.ok(details.risks.some((risk) => risk.includes("checks command omitted")));
    assert.match(details.nextToolCall, /checksCommand: null/);
    assert.match(details.nextToolCall, /action: "baseline"/);
  });
});

test("autoresearch_runtime_autoplan does not invent score script without evidence", async () => {
  await withTempDir(async (cwd) => {
    const { tools } = registerHarness();
    writeFile(
      path.join(cwd, "package.json"),
      JSON.stringify({
        name: "demo-quality",
        scripts: { test: "node test.js", check: "node check.js" },
      }),
    );

    const result = await tools.get(AUTORESEARCH_AUTOPLAN_TOOL_NAME)?.execute(
      "call-autoplan-score-no-evidence",
      {
        cwd,
        objective: "improve setup quality",
        metricName: "setup_quality_score",
        direction: "higher",
      },
      undefined,
      undefined,
      { cwd },
    );

    assert.ok(result);
    assert.match(
      result.content[0]?.text ?? "",
      /may not print required METRIC setup_quality_score=value/,
    );
    const details = result.details as {
      risks: string[];
      nextToolCall: string;
      measurementContract: null;
      benchmarkScriptProposal: null;
    };
    assert.equal(details.measurementContract, null);
    assert.equal(details.benchmarkScriptProposal, null);
    assert.ok(details.risks.some((risk) => risk.includes("METRIC setup_quality_score=value")));
    assert.match(details.nextToolCall, /action: "plan"/);
    assert.doesNotMatch(details.nextToolCall, /benchmarkScript:/);
  });
});

test("autoresearch_runtime_autoplan keeps static DSPx behavior score advisory-only", async () => {
  await withTempDir(async (cwd) => {
    const { tools } = registerHarness();
    writeFile(
      path.join(cwd, "package.json"),
      JSON.stringify({
        name: "demo-quality",
        scripts: { test: "node test.js", check: "node check.js" },
      }),
    );
    const dspxOutdir = path.join(cwd, ".autoresearch/dspx/generated/autosetup-planner-real");
    const behaviorPath = path.join(dspxOutdir, "behavior_results.json");
    mkdirSync(dspxOutdir, { recursive: true });
    writeFile(
      behaviorPath,
      JSON.stringify({
        summary: { status: "passed", total: 4, passed: 3, failed: 1, error: 0 },
        examples: [
          {
            index: 0,
            status: "passed",
            inputs: { objective: "improve setup quality" },
            observed_outputs: {
              campaign_name: "setup-quality",
              metric_name: "setup_quality_score",
              metric_unit: "percent",
              direction: "higher",
              benchmark_command: "npm test",
              checks_command: "npm run check",
              risks: "quality score comes from DSPx behavior evidence",
              next_action: "apply setup through autoresearch_runtime_setup",
            },
          },
        ],
      }),
    );

    const result = await tools.get(AUTORESEARCH_AUTOPLAN_TOOL_NAME)?.execute(
      "call-autoplan-dspx-score-script",
      {
        cwd,
        objective: "improve setup quality",
        planner: "dspx_program",
        dspxOutdir,
        dspxBehaviorPath: behaviorPath,
        metricName: "setup_quality_score",
        direction: "higher",
      },
      undefined,
      undefined,
      { cwd },
    );

    assert.ok(result);
    const output = result.content[0]?.text ?? "";
    assert.match(output, /DSPx advisory evidence/);
    assert.match(output, /Advisory metric summary \(not baseline authority\)/);
    assert.doesNotMatch(output, /## Benchmark script proposal/);
    assert.match(output, /measurement authority: advisory_only/);
    const details = result.details as {
      risks: string[];
      nextToolCall: string;
      measurementContract: { optimizationAuthority: string; freshness: string };
      benchmarkScriptProposal: {
        benchmarkScript: string;
        source: string;
        measurementContract: { optimizationAuthority: string; freshness: string };
      };
      dspxAdvisory: {
        warnings: string[];
        nextToolCall: string;
        benchmarkScriptProposal: {
          benchmarkScript: string;
          source: string;
          measurementContract: { optimizationAuthority: string; freshness: string };
        };
      };
    };
    assert.equal(details.measurementContract.optimizationAuthority, "advisory_only");
    assert.equal(details.measurementContract.freshness, "static_existing_artifact");
    assert.equal(details.benchmarkScriptProposal.source, "dspx_behavior_score");
    assert.equal(
      details.benchmarkScriptProposal.measurementContract.optimizationAuthority,
      "advisory_only",
    );
    assert.equal(
      details.benchmarkScriptProposal.measurementContract.freshness,
      "static_existing_artifact",
    );
    assert.match(details.benchmarkScriptProposal.benchmarkScript, /behavior_results\.json/);
    assert.match(details.benchmarkScriptProposal.benchmarkScript, /METRIC setup_quality_score=/);
    assert.ok(details.risks.some((risk) => risk.includes("METRIC setup_quality_score=value")));
    assert.ok(details.risks.some((risk) => risk.includes("measurement contract is advisory_only")));
    assert.match(details.nextToolCall, /action: "plan"/);
    assert.match(details.nextToolCall, /benchmarkCommand: "npm test"/);
    assert.doesNotMatch(details.nextToolCall, /benchmarkScript:/);
    assert.equal(details.dspxAdvisory.benchmarkScriptProposal.source, "dspx_behavior_score");
    assert.equal(
      details.dspxAdvisory.benchmarkScriptProposal.measurementContract.optimizationAuthority,
      "advisory_only",
    );
    assert.match(details.dspxAdvisory.nextToolCall, /action: "plan"/);
    assert.ok(
      details.dspxAdvisory.warnings.some((warning) =>
        warning.includes("measurement contract is advisory_only"),
      ),
      "DSPx advisory must not become baseline authority when it reads static evidence",
    );
  });
});
