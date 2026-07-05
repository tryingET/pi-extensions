import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  type PiAutoresearchExtensionOptions,
  registerPiAutoresearchExtension,
} from "../extensions/pi-autoresearch.ts";
import {
  AUTORESEARCH_LLAMACPP_CAMPAIGN_CONTROL_TOOL_NAME,
  AUTORESEARCH_LLAMACPP_CAMPAIGN_TOOL_NAME,
} from "../src/core/llamacppCampaign.ts";
import {
  AUTORESEARCH_AUTOPLAN_TOOL_NAME,
  AUTORESEARCH_CAMPAIGN_START_TOOL_NAME,
  AUTORESEARCH_CANDIDATE_DECISION_TOOL_NAME,
  AUTORESEARCH_COMMAND_NAME,
  AUTORESEARCH_CONTROL_TOOL_NAME,
  AUTORESEARCH_FINALIZE_TOOL_NAME,
  AUTORESEARCH_LOOP_TOOL_NAME,
  AUTORESEARCH_PEER_ASSIST_TOOL_NAME,
  AUTORESEARCH_RESUME_APPLY_TOOL_NAME,
  AUTORESEARCH_RUN_TOOL_NAME,
  AUTORESEARCH_SETUP_TOOL_NAME,
  AUTORESEARCH_STATUS_TOOL_NAME,
  appendReceipt,
  buildAutoresearchRuntimeStatus,
  createConfigReceipt,
  createRunReceipt,
} from "../src/core/runtime.ts";
import { AUTORESEARCH_SELF_HOSTING_TOOL_NAME } from "../src/core/selfHosting.ts";

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
    editor(title: string, text: string): Promise<string | undefined> | string | undefined;
    notify(message: string, level?: string): void;
    setWidget?(id: string, widget: unknown, options?: unknown): void;
    setEditorText?(text: string): void;
    custom?<T>(factory: (...args: unknown[]) => unknown, options?: unknown): Promise<T>;
  };
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

test("extension registers /autoresearch plus the supervised campaign front door and bounded runtime tools", () => {
  const { commands, tools } = registerHarness();

  assert.equal(typeof commands.get(AUTORESEARCH_COMMAND_NAME)?.handler, "function");
  assert.equal(typeof tools.get(AUTORESEARCH_CAMPAIGN_START_TOOL_NAME)?.execute, "function");
  assert.equal(typeof tools.get(AUTORESEARCH_STATUS_TOOL_NAME)?.execute, "function");
  assert.equal(typeof tools.get(AUTORESEARCH_CANDIDATE_DECISION_TOOL_NAME)?.execute, "function");
  assert.equal(typeof tools.get(AUTORESEARCH_CONTROL_TOOL_NAME)?.execute, "function");
  assert.equal(typeof tools.get(AUTORESEARCH_FINALIZE_TOOL_NAME)?.execute, "function");
  assert.equal(typeof tools.get(AUTORESEARCH_RUN_TOOL_NAME)?.execute, "function");
  assert.equal(typeof tools.get(AUTORESEARCH_PEER_ASSIST_TOOL_NAME)?.execute, "function");
  assert.equal(typeof tools.get(AUTORESEARCH_LOOP_TOOL_NAME)?.execute, "function");
  assert.equal(typeof tools.get(AUTORESEARCH_RESUME_APPLY_TOOL_NAME)?.execute, "function");
  assert.equal(typeof tools.get(AUTORESEARCH_AUTOPLAN_TOOL_NAME)?.execute, "function");
  assert.equal(typeof tools.get(AUTORESEARCH_SETUP_TOOL_NAME)?.execute, "function");
  assert.equal(typeof tools.get(AUTORESEARCH_SELF_HOSTING_TOOL_NAME)?.execute, "function");
  assert.equal(typeof tools.get(AUTORESEARCH_LLAMACPP_CAMPAIGN_TOOL_NAME)?.execute, "function");
  assert.equal(
    typeof tools.get(AUTORESEARCH_LLAMACPP_CAMPAIGN_CONTROL_TOOL_NAME)?.execute,
    "function",
  );
});

test("extension-originated sendUserMessage slash input executes exact ASC plan-only bridge", async () => {
  const { eventHandlers } = registerHarness();
  const inputHandler = eventHandlers.get("input");
  const editorTitles: string[] = [];
  const editorTexts: string[] = [];
  const notifications: Array<{ message: string; level?: string }> = [];

  const result = (await inputHandler?.(
    {
      source: "extension",
      text: "/autoresearch Evaluate ASC self-evolution harness: metric=operator_nudge_count lower-is-better target=0 for post-compaction continuation; guardrail_boundary_violations target=0",
    },
    {
      cwd: "/repo",
      hasUI: true,
      ui: {
        async editor(title: string, text: string) {
          editorTitles.push(title);
          editorTexts.push(text);
          return text;
        },
        notify(message: string, level?: string) {
          notifications.push({ message, level });
        },
      },
    },
  )) as { action: string };

  assert.deepEqual(result, { action: "handled" });
  assert.match(editorTitles[0] ?? "", /Autoresearch campaign start result/);
  assert.match(editorTexts[0] ?? "", /PI-AUTORESEARCH CAMPAIGN START/);
  assert.match(editorTexts[0] ?? "", /Evaluate ASC self-evolution harness/);
  assert.match(editorTexts[0] ?? "", /run mode: plan_only/);
  assert.equal(notifications.length, 1);
  assert.match(
    notifications[0]?.message ?? "",
    /Executed exact ASC autoresearch bridge as a plan-only campaign start/,
  );
});

test("extension-originated autoresearch bridge ignores bare /autoresearch status", async () => {
  const { eventHandlers } = registerHarness();
  const inputHandler = eventHandlers.get("input");

  const result = (await inputHandler?.(
    { source: "extension", text: "/autoresearch" },
    { cwd: "/repo" },
  )) as { action: string };

  assert.deepEqual(result, { action: "continue" });
});

test("extension-originated autoresearch bridge ignores run commands", async () => {
  const { eventHandlers } = registerHarness();
  const inputHandler = eventHandlers.get("input");

  const result = (await inputHandler?.(
    { source: "extension", text: "/autoresearch run Improve the harness" },
    { cwd: "/repo" },
  )) as { action: string };

  assert.deepEqual(result, { action: "continue" });
});

test("extension-originated autoresearch bridge ignores non-autoresearch slash input", async () => {
  const { eventHandlers } = registerHarness();
  const inputHandler = eventHandlers.get("input");

  const result = (await inputHandler?.(
    { source: "extension", text: "/visible-loop --count 1" },
    { cwd: "/repo" },
  )) as { action: string };

  assert.deepEqual(result, { action: "continue" });
});

test("autoresearch input bridge ignores non-extension slash input", async () => {
  const { eventHandlers } = registerHarness();
  const inputHandler = eventHandlers.get("input");

  const result = (await inputHandler?.(
    { source: "interactive", text: "/autoresearch Evaluate ASC self-evolution harness" },
    { cwd: "/repo" },
  )) as { action: string };

  assert.deepEqual(result, { action: "continue" });
});

test("/autoresearch without an objective reports status", async () => {
  const { commands } = registerHarness();
  let editorOpened = false;
  const notifications: Array<{ message: string; level?: string }> = [];

  await commands.get(AUTORESEARCH_COMMAND_NAME)?.handler("status", {
    cwd: "/repo",
    hasUI: true,
    ui: {
      async editor(_title: string, _text: string) {
        editorOpened = true;
      },
      notify(message: string, level?: string) {
        notifications.push({ message, level });
      },
    },
  });

  assert.equal(editorOpened, false);
  assert.equal(notifications.length, 1);
  assert.equal(notifications[0]?.level, "info");
  assert.match(notifications[0]?.message ?? "", /pi-autoresearch:/);
  assert.match(notifications[0]?.message ?? "", /autoresearch_campaign_start/);
});

test("/autoresearch dashboard opens a read-only operator dashboard", async () => {
  const { commands } = registerHarness();
  let editorTitle = "";
  let editorText = "";
  const notifications: Array<{ message: string; level?: string }> = [];

  await commands.get(AUTORESEARCH_COMMAND_NAME)?.handler("dashboard", {
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

  assert.match(editorTitle, /Pi-autoresearch dashboard/);
  assert.match(editorText, /PI-AUTORESEARCH DASHBOARD/);
  assert.match(editorText, /Candidate lifecycle policy/);
  assert.match(editorText, /Resume apply plan-only proposal/);
  assert.match(editorText, /autoresearch\.resume_apply_plan\.v1/);
  assert.match(editorText, /execution authorized: no/);
  assert.match(editorText, /Authority handoff/);
  assert.match(editorText, /action: "closeout"/);
  assert.match(editorText, /action: "ak_evidence"/);
  assert.match(editorText, /evidence_record/);
  assert.match(editorText, /learning_export\/KES adapter/);
  assert.match(editorText, /oracle_evidence_export/);
  assert.match(editorText, /DSPx owner preflight/);
  assert.match(editorText, /does not run exports, call AK\/KES\/Oracle/);
  assert.match(editorText, /Learning handoff/);
  assert.match(editorText, /learning_export/);
  assert.match(editorText, /autoresearch_learning_kes_adapter/);
  assert.match(editorText, /Packet inventory before owner review/);
  assert.match(editorText, /measured packet inventory inspection/);
  assert.match(editorText, /final owner decision surface/);
  assert.match(editorText, /Next legal surfaces/);
  assert.equal(notifications.length, 1);
  assert.match(notifications[0]?.message ?? "", /Opened read-only pi-autoresearch dashboard/);
});

test("/autoresearch open candidates opens read-only review posture", async () => {
  await withTempDir(async (cwd) => {
    const { commands } = registerHarness();
    const cellDir = path.join(cwd, ".autoresearch", "matrix-campaign", "cell-01-01");
    mkdirSync(cellDir, { recursive: true });
    writeFileSync(
      path.join(cellDir, "candidate-01.candidate-result.json"),
      JSON.stringify({ packetKind: "autoresearch.candidate_result.v1" }),
    );

    let editorTitle = "";
    let editorText = "";
    const notifications: Array<{ message: string; level?: string }> = [];

    await commands.get(AUTORESEARCH_COMMAND_NAME)?.handler("open candidates", {
      cwd,
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

    assert.match(editorTitle, /Open autoresearch candidate review posture/);
    assert.match(editorText, /PI-AUTORESEARCH OPEN CANDIDATE REVIEW POSTURE/);
    assert.match(editorText, /open review cells: 1/);
    assert.match(editorText, /packet inventory references: 1/);
    assert.match(editorText, /explicit packet paths in review call: 1/);
    assert.match(editorText, /review_candidate_wave/);
    assert.match(editorText, /candidateResultPacketPaths/);
    assert.match(editorText, /candidate-01\.candidate-result\.json/);
    assert.match(
      editorText,
      /Do not keep, discard, finalize, merge, reset, or record AK\/KES\/evidence/,
    );
    assert.equal(notifications.length, 1);
    assert.match(notifications[0]?.message ?? "", /Opened read-only open candidate review posture/);
  });
});

test("$$ autoresearch open candidates prepares review posture text without mutation", async () => {
  await withTempDir(async (cwd) => {
    const { eventHandlers } = registerHarness();
    const inputHandler = eventHandlers.get("input");
    const cellDir = path.join(cwd, ".autoresearch", "matrix-campaign", "cell-01-01");
    mkdirSync(cellDir, { recursive: true });
    writeFileSync(
      path.join(cellDir, "candidate-01.candidate-result.json"),
      JSON.stringify({ packetKind: "autoresearch.candidate_result.v1" }),
    );

    const result = (await inputHandler?.(
      { source: "user", text: "$$ autoresearch open candidates" },
      { cwd },
    )) as { action: string; text: string };

    assert.equal(result.action, "transform");
    assert.match(result.text, /PI-AUTORESEARCH OPEN CANDIDATE REVIEW POSTURE/);
    assert.match(result.text, /open review cells: 1/);
    assert.match(result.text, /review_candidate_wave/);
    assert.match(result.text, /candidateResultPacketPaths/);
  });
});

test("/autoresearch integrate candidates prepares post-fan-in handoff without applying", async () => {
  await withTempDir(async (cwd) => {
    const { commands, eventHandlers } = registerHarness();
    const cellDir = path.join(cwd, ".autoresearch", "matrix-campaign", "cell-01-01");
    mkdirSync(cellDir, { recursive: true });
    writeFileSync(
      path.join(cellDir, "candidate-01.candidate-result.json"),
      JSON.stringify({ packetKind: "autoresearch.candidate_result.v1" }),
    );

    let editorTitle = "";
    let editorText = "";
    const notifications: Array<{ message: string; level?: string }> = [];

    await commands.get(AUTORESEARCH_COMMAND_NAME)?.handler("integrate candidates", {
      cwd,
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

    assert.match(editorTitle, /Integrate useful autoresearch candidates/);
    assert.match(editorText, /USEFUL CANDIDATE INTEGRATION HANDOFF/);
    assert.match(editorText, /review_candidate_wave/);
    assert.match(editorText, /post_fanin_finalizer/);
    assert.match(editorText, /finalize_post_fanin/);
    assert.match(editorText, /candidateResultPacketPaths/);
    assert.match(editorText, /does not merge, apply patches/);
    assert.equal(notifications.length, 1);

    const inputHandler = eventHandlers.get("input");
    const dollarResult = (await inputHandler?.(
      { source: "user", text: "$$ autoresearch integrate candidates" },
      { cwd },
    )) as { action: string; text: string };
    assert.equal(dollarResult.action, "transform");
    assert.match(dollarResult.text, /post_fanin_finalizer/);
    assert.match(dollarResult.text, /candidateResultPacketPaths/);
  });
});

test("/autoresearch review opens a candidate decision overlay before editor confirmation", async () => {
  const { commands } = registerHarness();
  let overlayText = "";
  let editorTitle = "";
  let editorText = "";
  const notifications: Array<{ message: string; level?: string }> = [];

  await commands.get(AUTORESEARCH_COMMAND_NAME)?.handler("review keep", {
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
      async custom<T>(factory: (...args: unknown[]) => unknown, options?: unknown): Promise<T> {
        assert.deepEqual((options as { overlay?: boolean }).overlay, true);
        let result: unknown = null;
        const component = factory({ requestRender() {} }, {}, {}, (value: unknown) => {
          result = value;
        }) as {
          render(width: number): string[];
          handleInput(data: string): void;
        };
        overlayText = component.render(110).join("\n");
        component.handleInput("\r");
        return result as T;
      },
    },
  });

  assert.match(overlayText, /Review autoresearch candidate decision/);
  assert.match(overlayText, /final owner decision after complete packet inventory/);
  assert.match(overlayText, /Plan keep/);
  assert.match(overlayText, /direct/);
  assert.match(editorTitle, /candidate decision/i);
  assert.match(editorText, /PI-AUTORESEARCH CANDIDATE DECISION CONFIRMATION/);
  assert.match(editorText, /action: "plan_keep"/);
  assert.match(editorText, /measured packet inventory is complete/);
  assert.match(editorText, /plan-only/);
  assert.equal(notifications.length, 1);
  assert.match(
    notifications[0]?.message ?? "",
    /Prepared autoresearch_candidate_decision plan_keep/,
  );
});

test("/autoresearch review falls back to editor when overlay is unavailable", async () => {
  const { commands } = registerHarness();
  let editorText = "";
  const notifications: Array<{ message: string; level?: string }> = [];

  await commands.get(AUTORESEARCH_COMMAND_NAME)?.handler("review", {
    cwd: "/repo",
    hasUI: true,
    ui: {
      async editor(_title: string, text: string) {
        editorText = text;
      },
      notify(message: string, level?: string) {
        notifications.push({ message, level });
      },
    },
  });

  assert.match(editorText, /PI-AUTORESEARCH CANDIDATE DECISION CONFIRMATION/);
  assert.match(editorText, /autoresearch_candidate_decision/);
  assert.equal(notifications[0]?.level, "warning");
  assert.match(notifications[0]?.message ?? "", /overlay unavailable/);
});

test("/autoresearch resume prepares a foreground resume review", async () => {
  await withTempDir(async (cwd) => {
    appendReceipt(
      cwd,
      createConfigReceipt({
        name: "slash-resume",
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
    buildAutoresearchRuntimeStatus(cwd, { persistSnapshot: true });

    const { commands } = registerHarness();
    let editorTitle = "";
    let editorText = "";
    let composerText = "";
    const notifications: Array<{ message: string; level?: string }> = [];

    await commands.get(AUTORESEARCH_COMMAND_NAME)?.handler("resume", {
      cwd,
      hasUI: true,
      ui: {
        async editor(title: string, text: string) {
          editorTitle = title;
          editorText = text;
          return text;
        },
        setEditorText(text: string) {
          composerText = text;
        },
        notify(message: string, level?: string) {
          notifications.push({ message, level });
        },
      },
    });

    assert.match(editorTitle, /foreground autoresearch resume/i);
    assert.match(editorText, /PI-AUTORESEARCH RESUME APPLY REVIEW/);
    assert.match(editorText, /autoresearch\.resume_apply_plan\.v1/);
    assert.match(editorText, /autoresearch_runtime_resume_apply/);
    assert.match(editorText, /operatorConfirmation: "RUN FOREGROUND RESUME"/);
    assert.match(editorText, /Replace `<explicit>` budgets/);
    assert.notEqual(composerText, editorText);
    assert.match(composerText, /^autoresearch_runtime_resume_apply\(/);
    assert.doesNotMatch(composerText, /PI-AUTORESEARCH RESUME APPLY REVIEW/);
    assert.match(composerText, /operatorConfirmation: "RUN FOREGROUND RESUME"/);
    assert.equal(notifications.length, 1);
    assert.match(
      notifications[0]?.message ?? "",
      /Accepted foreground resume call into the message editor/,
    );
  });
});

test("/autoresearch export off stops browser dashboard refresh without opening a browser", async () => {
  const { commands } = registerHarness();
  const notifications: Array<{ message: string; level?: string }> = [];

  await commands.get(AUTORESEARCH_COMMAND_NAME)?.handler("export off", {
    cwd: "/repo",
    hasUI: true,
    ui: {
      async editor() {},
      notify(message: string, level?: string) {
        notifications.push({ message, level });
      },
    },
  });

  assert.equal(notifications.length, 1);
  assert.match(
    notifications[0]?.message ?? "",
    /Stopped pi-autoresearch browser dashboard refresh/,
  );
});

test("/autoresearch overlay opens a read-only live dashboard overlay", async () => {
  const { commands } = registerHarness();
  let overlayOptions: unknown;
  let overlayText = "";
  const notifications: Array<{ message: string; level?: string }> = [];

  await commands.get(AUTORESEARCH_COMMAND_NAME)?.handler("overlay", {
    cwd: "/repo",
    hasUI: true,
    ui: {
      async editor() {},
      notify(message: string, level?: string) {
        notifications.push({ message, level });
      },
      async custom<T>(factory: (...args: unknown[]) => unknown, options?: unknown): Promise<T> {
        overlayOptions = options;
        const component = factory({ requestRender() {} }, {}, {}, () => {}) as {
          render(width: number): string[];
          dispose?: () => void;
        };
        overlayText = component.render(100).join("\n");
        component.dispose?.();
        return undefined as T;
      },
    },
  });

  const options = overlayOptions as {
    overlay: boolean;
    overlayOptions: {
      anchor: string;
      width: string;
      maxHeight: string;
      margin: number;
      visible: unknown;
    };
  };
  assert.equal(options.overlay, true);
  assert.equal(options.overlayOptions.anchor, "center");
  assert.equal(options.overlayOptions.width, "92%");
  assert.equal(options.overlayOptions.maxHeight, "85%");
  assert.equal(options.overlayOptions.margin, 1);
  assert.equal(typeof options.overlayOptions.visible, "function");
  assert.match(overlayText, /pi-autoresearch live dashboard/);
  assert.match(overlayText, /read-only/);
  assert.match(overlayText, /Candidate policy/);
  assert.equal(notifications.length, 0);
});

test("/autoresearch widget on and off controls the persistent status widget", async () => {
  const { commands } = registerHarness();
  const widgets = new Map<string, unknown>();
  const notifications: Array<{ message: string; level?: string }> = [];

  const ctx: CommandContext = {
    cwd: "/repo",
    hasUI: true,
    ui: {
      async editor() {},
      notify(message: string, level?: string) {
        notifications.push({ message, level });
      },
      setWidget(id: string, widget: unknown) {
        if (widget === undefined) {
          widgets.delete(id);
          return;
        }
        widgets.set(id, widget);
      },
    },
  };

  await commands.get(AUTORESEARCH_COMMAND_NAME)?.handler("widget on", ctx);
  assert.equal(widgets.size, 1);
  const widgetFactory = [...widgets.values()][0] as (tui: { requestRender?: () => void }) => {
    render(width: number): string[];
    dispose?: () => void;
  };
  const widget = widgetFactory({ requestRender() {} });
  const rendered = widget.render(120).join("\n");
  assert.match(rendered, /🔬 autoresearch/);
  assert.match(rendered, /0 runs\/0 ok/);
  widget.dispose?.();

  await commands.get(AUTORESEARCH_COMMAND_NAME)?.handler("widget off", ctx);
  assert.equal(widgets.size, 0);
  assert.match(notifications.at(-1)?.message ?? "", /Disabled the pi-autoresearch status widget/);
});

test("/autoresearch widget distinguishes candidate, kept-final, and checks-failed counts", async () => {
  const { commands } = registerHarness();

  await withTempDir(async (cwd) => {
    appendReceipt(
      cwd,
      createConfigReceipt({
        name: "widget-counts",
        metricName: "ux_blockers",
        metricUnit: "blocker(s)",
        direction: "lower",
        benchmarkCommand: "node bench.mjs",
        checksCommand: "node checks.mjs",
        createdAt: 10,
      }),
    );
    appendReceipt(
      cwd,
      createRunReceipt({
        status: "baseline",
        metric: 2,
        description: "baseline",
        timestamp: 20,
        iteration: 1,
        confidence: null,
        durationSeconds: 0.1,
        exitCode: 0,
        timedOut: false,
        benchmarkCommand: "node bench.mjs",
        checksCommand: "node checks.mjs",
        checksPassed: true,
        checksDurationSeconds: 0.1,
      }),
    );
    appendReceipt(
      cwd,
      createRunReceipt({
        status: "candidate",
        metric: 0,
        description: "successful candidate",
        timestamp: 30,
        iteration: 2,
        confidence: null,
        durationSeconds: 0.1,
        exitCode: 0,
        timedOut: false,
        benchmarkCommand: "node bench.mjs",
        checksCommand: "node checks.mjs",
        checksPassed: true,
        checksDurationSeconds: 0.1,
      }),
    );
    appendReceipt(
      cwd,
      createRunReceipt({
        status: "checks_failed",
        metric: 1,
        description: "historical failed check",
        timestamp: 40,
        iteration: 3,
        confidence: null,
        durationSeconds: 0.1,
        exitCode: 0,
        timedOut: false,
        benchmarkCommand: "node bench.mjs",
        checksCommand: "node checks.mjs",
        checksPassed: false,
        checksDurationSeconds: 0.1,
      }),
    );

    const widgets = new Map<string, unknown>();
    await commands.get(AUTORESEARCH_COMMAND_NAME)?.handler("widget on", {
      cwd,
      hasUI: true,
      ui: {
        async editor() {},
        notify() {},
        setWidget(id: string, widget: unknown) {
          if (widget === undefined) widgets.delete(id);
          else widgets.set(id, widget);
        },
      },
    });

    const widgetFactory = [...widgets.values()][0] as (tui: { requestRender?: () => void }) => {
      render(width: number): string[];
      dispose?: () => void;
    };
    const widget = widgetFactory({ requestRender() {} });
    const rendered = widget.render(140).join("\n");
    assert.match(rendered, /1 candidate/);
    assert.match(rendered, /0 kept\(final\)/);
    assert.match(rendered, /1 checks-failed/);
    assert.doesNotMatch(rendered, /0 kept(?!\()/);
    widget.dispose?.();
  });
});
