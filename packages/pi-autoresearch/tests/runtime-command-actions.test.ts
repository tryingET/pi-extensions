import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  type PiAutoresearchExtensionOptions,
  registerPiAutoresearchExtension,
} from "../extensions/pi-autoresearch.ts";
import {
  AUTORESEARCH_COMMAND_NAME,
  appendReceipt,
  createConfigReceipt,
  createRunReceipt,
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
    editor(title: string, text: string): Promise<string | undefined> | string | undefined;
    notify(message: string, level?: string): void;
    setEditorText?(text: string): void;
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

function writeExecutable(cwd: string, name: string, content: string): void {
  const target = path.join(cwd, name);
  writeFileSync(target, content, "utf8");
  chmodSync(target, 0o755);
}

test("$$ autoresearch input fallback prepares exact tool calls without PTX", async () => {
  const { eventHandlers } = registerHarness();
  const inputHandler = eventHandlers.get("input");
  assert.equal(typeof inputHandler, "function");

  const rewindResult = (await inputHandler?.(
    { source: "user", text: "$$ autoresearch rewind" },
    {
      cwd: "/repo",
    },
  )) as { action: string; text: string };
  assert.equal(rewindResult.action, "transform");
  assert.match(rewindResult.text, /autoresearch_candidate_decision/);
  assert.match(rewindResult.text, /action: "plan_rewind"/);

  const bindResult = (await inputHandler?.(
    { source: "user", text: "$$ autoresearch bind current" },
    { cwd: "/repo" },
  )) as { action: string; text: string };
  assert.equal(bindResult.action, "transform");
  assert.match(bindResult.text, /autoresearch_candidate_bind/);
  assert.match(bindResult.text, /candidateWorktree: "\/repo"/);
  assert.doesNotMatch(bindResult.text, /<base-ref>/);

  const measureResult = (await inputHandler?.(
    { source: "user", text: "$$ autoresearch measure current" },
    { cwd: "/repo" },
  )) as { action: string; text: string };
  assert.equal(measureResult.action, "transform");
  assert.match(measureResult.text, /autoresearch_candidate_bind/);
  assert.match(measureResult.text, /candidateWorktree/);

  const nextResult = (await inputHandler?.(
    { source: "user", text: "$$ autoresearch next" },
    { cwd: "/repo" },
  )) as { action: string; text: string };
  assert.equal(nextResult.action, "transform");
  assert.match(nextResult.text, /autoresearch_candidate_bind/);

  const resumeResult = (await inputHandler?.(
    { source: "user", text: "$$ autoresearch resume" },
    { cwd: "/repo" },
  )) as { action: string; text: string };
  assert.equal(resumeResult.action, "transform");
  assert.match(resumeResult.text, /PI-AUTORESEARCH RESUME APPLY REVIEW/);
  assert.match(resumeResult.text, /resume_apply_plan/);

  const learningResult = (await inputHandler?.(
    { source: "user", text: "$$ autoresearch learning" },
    { cwd: "/repo" },
  )) as { action: string; text: string };
  assert.equal(learningResult.action, "transform");
  assert.match(learningResult.text, /autoresearch_runtime_status/);
  assert.match(learningResult.text, /action: "learning_export"/);
  assert.doesNotMatch(learningResult.text, /autoresearch_campaign_start/);

  const campaignResult = (await inputHandler?.(
    { source: "user", text: "$$ ar optimize startup" },
    { cwd: "/repo" },
  )) as { action: string; text: string };
  assert.equal(campaignResult.action, "transform");
  assert.match(campaignResult.text, /autoresearch_campaign_start/);
  assert.match(campaignResult.text, /optimize startup/);

  const slashResult = (await inputHandler?.(
    { source: "user", text: "$$ /100x mindset" },
    {
      cwd: "/repo",
    },
  )) as { action: string };
  assert.equal(slashResult.action, "continue");
});

test("/autoresearch next prioritizes open candidate review posture", async () => {
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

    await commands.get(AUTORESEARCH_COMMAND_NAME)?.handler("next", {
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

    assert.match(editorTitle, /Next autoresearch candidate action/);
    assert.match(editorText, /PI-AUTORESEARCH OPEN CANDIDATE REVIEW POSTURE/);
    assert.match(editorText, /open review cells: 1/);
    assert.match(editorText, /review_candidate_wave/);
    assert.match(editorText, /candidateResultPacketPaths/);
    assert.doesNotMatch(editorText, /autoresearch_candidate_bind/);
    assert.equal(notifications.length, 1);

    const inputHandler = eventHandlers.get("input");
    const dollarResult = (await inputHandler?.(
      { source: "user", text: "$$ autoresearch next" },
      { cwd },
    )) as { action: string; text: string };
    assert.equal(dollarResult.action, "transform");
    assert.match(dollarResult.text, /PI-AUTORESEARCH OPEN CANDIDATE REVIEW POSTURE/);
    assert.match(dollarResult.text, /review_candidate_wave/);
    assert.match(dollarResult.text, /candidateResultPacketPaths/);
  });
});

test("/autoresearch next prepares the current recommended candidate call", async () => {
  await withTempDir(async (cwd) => {
    const { commands } = registerHarness();
    let editorTitle = "";
    let editorText = "";
    const notifications: Array<{ message: string; level?: string }> = [];

    await commands.get(AUTORESEARCH_COMMAND_NAME)?.handler("next", {
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

    assert.match(editorTitle, /Next autoresearch candidate action/);
    assert.match(editorText, /autoresearch_candidate_bind/);
    assert.match(editorText, /candidateWorktree/);
    assert.equal(notifications.length, 1);

    appendReceipt(
      cwd,
      createConfigReceipt({
        name: "next-candidate",
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
        empiricalDecisionClass: "candidate_regression",
        metric: 150,
        description: "regression",
        timestamp: 3,
        experiment: {
          candidate: {
            source: "manual",
            worktreePath: path.join(cwd, "candidate"),
            branch: "candidate/next",
            baseRef: "HEAD~1",
            diffSummary: "regressed",
            filesChanged: ["src/value.ts"],
          },
        },
      }),
    );

    await commands.get(AUTORESEARCH_COMMAND_NAME)?.handler("candidate next", {
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

    assert.match(editorText, /autoresearch_runtime_run/);
    assert.match(editorText, /Collect another ordinary candidate sample/);
  });
});

test("/autoresearch measure prepares a candidate measurement run call", async () => {
  await withTempDir(async (cwd) => {
    const { commands, eventHandlers } = registerHarness();
    execFileSync("git", ["init"], { cwd, stdio: "ignore" });
    writeFileSync(path.join(cwd, "value.txt"), "base\n");
    execFileSync("git", ["add", "value.txt"], { cwd, stdio: "ignore" });
    execFileSync(
      "git",
      ["-c", "user.name=Test", "-c", "user.email=test@example.invalid", "commit", "-m", "base"],
      { cwd, stdio: "ignore" },
    );
    const candidateDir = mkdtempSync(path.join(os.tmpdir(), "pi-autoresearch-candidate-"));
    rmSync(candidateDir, { recursive: true, force: true });
    try {
      execFileSync("git", ["worktree", "add", "-b", "candidate/measure", candidateDir, "HEAD"], {
        cwd,
        stdio: "ignore",
      });
      writeFileSync(path.join(candidateDir, "value.txt"), "candidate\n");
      execFileSync("git", ["add", "value.txt"], { cwd: candidateDir, stdio: "ignore" });
      execFileSync(
        "git",
        [
          "-c",
          "user.name=Test",
          "-c",
          "user.email=test@example.invalid",
          "commit",
          "-m",
          "candidate",
        ],
        { cwd: candidateDir, stdio: "ignore" },
      );

      let editorTitle = "";
      let editorText = "";
      const notifications: Array<{ message: string; level?: string }> = [];

      await commands.get(AUTORESEARCH_COMMAND_NAME)?.handler(`measure ${candidateDir}`, {
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

      assert.match(editorTitle, /Measure autoresearch candidate/);
      assert.match(editorText, /autoresearch_runtime_run/);
      assert.match(editorText, /candidateWorktree/);
      assert.match(editorText, /candidateFilesChanged: \["value.txt"\]/);
      assert.equal(notifications.length, 1);
      assert.match(notifications[0]?.message ?? "", /Prepared candidate measurement/);

      const inputHandler = eventHandlers.get("input");
      const fallbackResult = (await inputHandler?.(
        { source: "user", text: `$$ autoresearch measure ${candidateDir}` },
        { cwd },
      )) as { action: string; text: string };
      assert.equal(fallbackResult.action, "transform");
      assert.match(fallbackResult.text, /autoresearch_runtime_run/);
      assert.doesNotMatch(fallbackResult.text, /autoresearch_candidate_bind/);
      assert.match(fallbackResult.text, /candidateFilesChanged: \["value.txt"\]/);
    } finally {
      execFileSync("git", ["worktree", "remove", "--force", candidateDir], {
        cwd,
        stdio: "ignore",
      });
    }
  });
});

test("/autoresearch bind prepares a candidate-bind tool call", async () => {
  const { commands } = registerHarness();
  let editorTitle = "";
  let editorText = "";
  const notifications: Array<{ message: string; level?: string }> = [];

  await commands.get(AUTORESEARCH_COMMAND_NAME)?.handler("bind current", {
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

  assert.match(editorTitle, /Bind autoresearch candidate/);
  assert.match(editorText, /autoresearch_candidate_bind/);
  assert.match(editorText, /candidateWorktree: "\/repo"/);
  assert.doesNotMatch(editorText, /<base-ref>/);
  assert.equal(notifications.length, 1);
  assert.match(notifications[0]?.message ?? "", /Prepared autoresearch_candidate_bind/);
});

test("/autoresearch keep/discard/rewind prepare candidate-decision tool calls", async () => {
  const { commands } = registerHarness();
  let editorTitle = "";
  let editorText = "";
  const notifications: Array<{ message: string; level?: string }> = [];

  await commands.get(AUTORESEARCH_COMMAND_NAME)?.handler("rewind", {
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

  assert.match(editorTitle, /candidate decision/);
  assert.match(editorText, /CANDIDATE DECISION CONFIRMATION/);
  assert.match(editorText, /Confirmation checklist/);
  assert.match(editorText, /autoresearch_candidate_decision/);
  assert.match(editorText, /action: "plan_rewind"/);
  assert.match(editorText, /candidatePolicy/);
  assert.equal(notifications.length, 1);
  assert.match(
    notifications[0]?.message ?? "",
    /Prepared autoresearch_candidate_decision plan_rewind/,
  );
});

test("/autoresearch learning prepares a learning-export handoff call", async () => {
  const { commands } = registerHarness();
  let editorTitle = "";
  let editorText = "";
  const notifications: Array<{ message: string; level?: string }> = [];

  await commands.get(AUTORESEARCH_COMMAND_NAME)?.handler("learning", {
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

  assert.match(editorTitle, /Export autoresearch learning packet/);
  assert.match(editorText, /autoresearch_runtime_status/);
  assert.match(editorText, /action: "learning_export"/);
  assert.doesNotMatch(editorText, /autoresearch_campaign_start/);
  assert.equal(notifications.length, 1);
  assert.match(notifications[0]?.message ?? "", /Prepared autoresearch learning export/);
});

test("/autoresearch with an objective prepares the campaign-start tool call", async () => {
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

  assert.match(editorTitle, /Start supervised autoresearch campaign/);
  assert.match(editorText, /autoresearch_campaign_start/);
  assert.match(editorText, /optimize startup/);
  assert.match(editorText, /runMode: "plan_only"/);
  assert.match(editorText, /candidatePolicy/);
  assert.match(editorText, /mode: "worktree"/);
  assert.equal(notifications.length, 1);
  assert.match(notifications[0]?.message ?? "", /Prepared autoresearch_campaign_start/);
});

test("/autoresearch run executes the bounded first-entrypoint campaign", async () => {
  await withTempDir(async (cwd) => {
    writeExecutable(cwd, "autoresearch.sh", '#!/usr/bin/env bash\necho "METRIC total_ms=7"\n');
    writeExecutable(cwd, "autoresearch.checks.sh", "#!/usr/bin/env bash\nexit 0\n");
    const { commands } = registerHarness();
    let editorTitle = "";
    let editorText = "";
    const notifications: Array<{ message: string; level?: string }> = [];

    await commands.get(AUTORESEARCH_COMMAND_NAME)?.handler("run optimize startup", {
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

    assert.match(editorTitle, /Autoresearch campaign result/);
    assert.match(editorText, /PI-AUTORESEARCH CAMPAIGN START/);
    assert.match(editorText, /run mode: bounded_loop/);
    assert.match(editorText, /completed iterations: 3\/3/);
    assert.match(editorText, /peer tool: candidate_peer_spawn/);
    assert.match(editorText, /peer call: candidate_peer_spawn/);
    assert.match(editorText, /peer launch handoff: not_requested/);
    assert.match(editorText, /Peer\/intercom messages are communication only/);
    assert.match(editorText, /machine state: ready/);
    assert.match(
      readFileSync(path.join(cwd, "autoresearch.jsonl"), "utf8"),
      /"status":"candidate"/,
    );
    assert.equal(notifications.length, 2);
    assert.match(notifications[0]?.message ?? "", /Starting bounded foreground autoresearch run/);
    assert.match(notifications[1]?.message ?? "", /Completed bounded foreground autoresearch run/);
  });
});

test("/autoresearch run is unavailable in the read toolbox profile", async () => {
  await withTempDir(async (cwd) => {
    writeExecutable(cwd, "autoresearch.sh", '#!/usr/bin/env bash\necho "METRIC total_ms=7"\n');
    const { commands } = registerHarness({ effectProfile: "read" });
    let editorTitle = "";
    let editorText = "";
    const notifications: Array<{ message: string; level?: string }> = [];

    await commands.get(AUTORESEARCH_COMMAND_NAME)?.handler("run optimize startup", {
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

    assert.match(editorTitle, /Autoresearch campaign blocked/);
    assert.match(editorText, /unavailable in the autoresearch read profile/);
    assert.equal(existsSync(path.join(cwd, "autoresearch.jsonl")), false);
    assert.equal(notifications.length, 1);
    assert.equal(notifications[0]?.level, "warning");
  });
});
