import assert from "node:assert/strict";
import test from "node:test";

import piAutoresearchExtension from "../extensions/pi-autoresearch.ts";
import {
  AUTORESEARCH_COMMAND_NAME,
  AUTORESEARCH_LOCAL_ARTIFACTS,
  AUTORESEARCH_STATUS_TOOL_NAME,
  buildAutoresearchScaffoldStatus,
  createConfigReceipt,
  createRunReceipt,
  parseMetricLines,
  parseReceiptLine,
  serializeReceipt,
} from "../src/runtime.ts";

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

test("parseMetricLines extracts structured METRIC entries and ignores unrelated lines", () => {
  const metrics = parseMetricLines(
    [
      "warmup",
      "METRIC total_ms=15200",
      "METRIC render_ms=9800",
      "METRIC invalid=abc",
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
  });
  const run = createRunReceipt({
    status: "keep",
    metric: 14000,
    metrics: { render_ms: 9200 },
    description: "cache layout lookups",
    timestamp: 20,
    commit: "abc1234",
    iteration: 3,
  });

  assert.deepEqual(parseReceiptLine(serializeReceipt(config)), config);
  assert.deepEqual(parseReceiptLine(serializeReceipt(run)), run);
});

test("buildAutoresearchScaffoldStatus reports the current shell boundary", () => {
  const status = buildAutoresearchScaffoldStatus("/repo");

  assert.equal(status.phase, "package_shell");
  assert.equal(status.commandName, AUTORESEARCH_COMMAND_NAME);
  assert.deepEqual(status.toolNames, [AUTORESEARCH_STATUS_TOOL_NAME]);
  assert.deepEqual(status.localArtifacts, [...AUTORESEARCH_LOCAL_ARTIFACTS]);
  assert.deepEqual(status.readyPromptVaultTemplates, [
    "pi-autoresearch-setup",
    "pi-autoresearch-next-hypothesis",
    "pi-autoresearch-finalize",
  ]);
  assert.deepEqual(status.blockedPromptVaultTemplates, ["pi-autoresearch-state-router"]);
});

test("extension registers /autoresearch and autoresearch_runtime_status", () => {
  const { commands, tools } = registerHarness();

  assert.equal(typeof commands.get(AUTORESEARCH_COMMAND_NAME)?.handler, "function");
  assert.equal(typeof tools.get(AUTORESEARCH_STATUS_TOOL_NAME)?.execute, "function");
});

test("/autoresearch opens the package-shell overview", async () => {
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
  assert.match(editorText, /# \/autoresearch/);
  assert.match(editorText, /package shell is installed/);
  assert.equal(notifications.length, 1);
  assert.match(notifications[0].message, /currently a package shell/);
});

test("autoresearch_runtime_status returns scaffold details", async () => {
  const { tools } = registerHarness();
  const tool = tools.get(AUTORESEARCH_STATUS_TOOL_NAME);

  const result = await tool?.execute("call-1", {}, undefined, undefined, { cwd: "/repo" });

  assert.ok(result);
  assert.equal(result?.content[0]?.type, "text");
  assert.match(result?.content[0]?.text ?? "", /PI-AUTORESEARCH STATUS/);
  assert.match(result?.content[0]?.text ?? "", /phase: package_shell/);
  assert.deepEqual(result?.details, buildAutoresearchScaffoldStatus("/repo"));
});
