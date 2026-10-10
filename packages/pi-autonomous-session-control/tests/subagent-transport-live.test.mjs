import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { EventEmitter, once } from "node:events";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readdir, readFile, rm, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PassThrough } from "node:stream";
import test from "node:test";
import { createSubagentState, spawnSubagentWithSpawn } from "../extensions/self/subagent.ts";
import { reserveSharedSubagentCapacity } from "../extensions/self/subagent-capacity.ts";
import { createAscExecutionRuntime } from "../extensions/self/subagent-runtime.ts";
import { getProcessStartTicks } from "../extensions/self/subagent-session-status.ts";
import {
  processIsAlive,
  withFakePiOnPath,
  withTemporaryEnv,
} from "./subagent-transport-harness.mjs";

test("end-to-end: helper enforces raw pi line size even when the newline arrives in the same chunk", async () => {
  const oversizedRawPiLine = JSON.stringify({
    type: "message_end",
    message: {
      role: "assistant",
      content: [{ type: "text", text: "x".repeat(512) }],
      stopReason: "stop",
    },
  });

  await withFakePiOnPath(
    `#!/usr/bin/env bash\nprintf '%s\\n' '${oversizedRawPiLine}'\n`,
    async (tempRoot) => {
      await withTemporaryEnv({ PI_SUBAGENT_RAW_PI_EVENT_BUFFER_BYTES: "64" }, async () => {
        const state = createSubagentState(join(tempRoot, "sessions"));
        const result = await spawnSubagentWithSpawn(
          {
            name: "raw-line-too-large",
            objective: "Review changes",
            tools: "read,bash",
            sessionFile: join(state.sessionsDir, "raw-line-too-large.json"),
          },
          "test/model",
          { cwd: tempRoot },
          state,
        );

        assert.equal(result.status, "error");
        assert.equal(result.exitCode, 1);
        assert.equal(result.output, "Raw pi JSON event line exceeded 64 bytes.");
        assert.deepEqual(result.executionState?.protocol, {
          kind: "assistant_protocol_parse_error",
          errorMessage: "Raw pi JSON event line exceeded 64 bytes.",
        });
      });
    },
  );
});

test("end-to-end: helper forwards noSkills and skillSources to raw pi args", async () => {
  await withFakePiOnPath(
    [
      "#!/usr/bin/env node",
      "console.log(JSON.stringify({",
      '  type: "message_end",',
      "  message: {",
      '    role: "assistant",',
      '    content: [{ type: "text", text: JSON.stringify(process.argv.slice(2)) }],',
      '    stopReason: "stop",',
      "  },",
      "}));",
      'console.log(JSON.stringify({ type: "agent_settled" }));',
      "",
    ].join("\n"),
    async (tempRoot) => {
      const state = createSubagentState(join(tempRoot, "sessions"));
      const skillSource = join(tempRoot, "skills");
      await mkdir(skillSource, { recursive: true });

      const result = await spawnSubagentWithSpawn(
        {
          name: "skill-args",
          objective: "Review changes",
          tools: "read,bash",
          sessionFile: join(state.sessionsDir, "skill-args.json"),
          noSkills: true,
          skillSources: [skillSource],
        },
        "test/model",
        { cwd: tempRoot },
        state,
      );

      const args = JSON.parse(result.output);
      const noSkillsIndex = args.indexOf("--no-skills");
      const skillIndex = args.indexOf("--skill");

      assert.equal(result.status, "done");
      assert.notEqual(noSkillsIndex, -1);
      assert.notEqual(args[noSkillsIndex + 1], "true");
      assert.notEqual(skillIndex, -1);
      assert.equal(args[skillIndex + 1], skillSource);
    },
  );
});

test("end-to-end: raw pi buffering no longer inherits the filtered protocol buffer env", async () => {
  const oversizedRawPiLine = JSON.stringify({
    type: "message_end",
    message: {
      role: "assistant",
      content: [{ type: "text", text: "x".repeat(512) }],
      stopReason: "stop",
    },
  });

  await withFakePiOnPath(
    `#!/usr/bin/env bash\nprintf '%s\\n' '${oversizedRawPiLine}'\nprintf '%s\\n' '{"type":"agent_settled"}'\n`,
    async (tempRoot) => {
      await withTemporaryEnv(
        {
          PI_SUBAGENT_EVENT_BUFFER_BYTES: "128",
          PI_SUBAGENT_OUTPUT_CHARS: "1",
          PI_SUBAGENT_RAW_PI_EVENT_BUFFER_BYTES: undefined,
          PI_ORCH_SUBAGENT_RAW_PI_EVENT_BUFFER_BYTES: undefined,
        },
        async () => {
          const state = createSubagentState(join(tempRoot, "sessions"));
          const result = await spawnSubagentWithSpawn(
            {
              name: "raw-buffer-env-separated",
              objective: "Review changes",
              tools: "read,bash",
              sessionFile: join(state.sessionsDir, "raw-buffer-env-separated.json"),
            },
            "test/model",
            { cwd: tempRoot },
            state,
          );

          assert.equal(result.status, "done");
          assert.equal(result.exitCode, 0);
          assert.equal(result.output, "x\n\n...[assistant output truncated]");
          assert.equal(result.outputTruncated, true);
          assert.match(result.stderr || "", /Assistant output truncated to 1 characters\./);
          assert.deepEqual(result.executionState?.protocol, {
            kind: "assistant_protocol",
            stopReason: "stop",
            errorMessage: undefined,
          });
        },
      );
    },
  );
});

test("end-to-end: helper isolates the raw child agent dir and cleans it up after execution", async () => {
  await withFakePiOnPath(
    [
      "#!/usr/bin/env node",
      'const { existsSync, readFileSync } = require("node:fs");',
      'const { join } = require("node:path");',
      "const agentDir = process.env.PI_CODING_AGENT_DIR;",
      "const payload = {",
      "  agentDir,",
      '  settings: readFileSync(join(agentDir, "settings.json"), "utf-8").trim(),',
      '  authExists: existsSync(join(agentDir, "auth.json")),',
      '  multiPassExists: existsSync(join(agentDir, "multi-pass.json")),',
      "};",
      "console.log(JSON.stringify({",
      '  type: "message_end",',
      "  message: {",
      '    role: "assistant",',
      '    content: [{ type: "text", text: JSON.stringify(payload) }],',
      '    stopReason: "stop",',
      "  },",
      "}));",
      'console.log(JSON.stringify({ type: "agent_settled" }));',
      "",
    ].join("\n"),
    async (tempRoot, { agentDir: sourceAgentDir }) => {
      await writeFile(
        join(sourceAgentDir, "settings.json"),
        `${JSON.stringify({ defaultProvider: "openai-codex-2", defaultModel: "gpt-5.4" })}\n`,
      );
      await writeFile(join(sourceAgentDir, "auth.json"), '{"token":"test"}\n');
      await writeFile(join(sourceAgentDir, "multi-pass.json"), '{"subscriptions":[]}\n');
      const state = createSubagentState(join(tempRoot, "sessions"));
      const result = await spawnSubagentWithSpawn(
        {
          name: "isolated-child-agent-dir",
          objective: "Review changes",
          tools: "read,bash",
          sessionFile: join(state.sessionsDir, "isolated-child-agent-dir.json"),
        },
        "test/model",
        { cwd: tempRoot },
        state,
      );

      const payload = JSON.parse(result.output);
      assert.equal(result.status, "done");
      assert.equal(payload.settings, "{}");
      assert.equal(payload.authExists, true);
      assert.equal(payload.multiPassExists, true);
      assert.notEqual(payload.agentDir, sourceAgentDir);
      assert.equal(existsSync(payload.agentDir), false);
      assert.doesNotMatch(result.stderr || "", /openai-codex-2\/gpt-5\.4/);
    },
  );
});

test("end-to-end: raw Pi automatic retry settles once at agent_settled", async () => {
  const rawEvents = [
    {
      type: "message_end",
      message: {
        role: "assistant",
        stopReason: "error",
        errorMessage: "retryable",
        content: [],
      },
    },
    { type: "agent_end", messages: [] },
    {
      type: "message_end",
      message: {
        role: "assistant",
        stopReason: "stop",
        content: [{ type: "text", text: "recovered" }],
      },
    },
    { type: "agent_end", messages: [] },
    { type: "agent_settled" },
  ];
  const script = [
    "#!/usr/bin/env bash",
    ...rawEvents.map((event) => `printf '%s\\n' '${JSON.stringify(event)}'`),
    "",
  ].join("\n");

  await withFakePiOnPath(script, async (tempRoot) => {
    const state = createSubagentState(join(tempRoot, "sessions"));
    const result = await spawnSubagentWithSpawn(
      {
        name: "retry-settles-once",
        objective: "Accept recovered final outcome",
        tools: "read,bash",
        sessionFile: join(state.sessionsDir, "retry-settles-once.jsonl"),
        timeout: 1_000,
        startupTimeout: 1_000,
      },
      "test/model",
      { cwd: tempRoot },
      state,
    );

    assert.equal(result.status, "done");
    assert.equal(result.output, "recovered");
    assert.equal(result.assistantStopReason, "stop");
    assert.equal(result.usage?.turns, 2);
    const completedStatus = JSON.parse(
      await readFile(join(state.sessionsDir, "retry-settles-once.status.json"), "utf8"),
    );
    assert.equal(typeof completedStatus.rawChildPid, "number");
    assert.equal(typeof completedStatus.rawChildPidStartedAt, "number");
    assert.equal(completedStatus.rawChildProcessGroupId, completedStatus.rawChildPid);
  });
});

test("end-to-end: legacy Pi 0.76 raw retry stream settles on clean JSON-mode exit", async () => {
  const rawEvents = [
    {
      type: "message_end",
      message: {
        role: "assistant",
        stopReason: "error",
        errorMessage: "retryable",
        content: [],
      },
    },
    { type: "agent_end", messages: [], willRetry: true },
    {
      type: "message_end",
      message: {
        role: "assistant",
        stopReason: "stop",
        content: [{ type: "text", text: "legacy recovered" }],
      },
    },
    { type: "auto_retry_end", success: true, attempt: 1 },
    { type: "agent_end", messages: [], willRetry: false },
  ];
  const script = [
    "#!/usr/bin/env bash",
    ...rawEvents.map((event) => `printf '%s\\n' '${JSON.stringify(event)}'`),
    "",
  ].join("\n");

  await withFakePiOnPath(
    script,
    async (tempRoot) => {
      const state = createSubagentState(join(tempRoot, "sessions"));
      const result = await spawnSubagentWithSpawn(
        {
          name: "legacy-retry-settles-on-exit",
          objective: "Accept the pinned host's final retry outcome",
          tools: "read,bash",
          sessionFile: join(state.sessionsDir, "legacy-retry-settles-on-exit.jsonl"),
          timeout: 1_000,
          startupTimeout: 1_000,
        },
        "test/model",
        { cwd: tempRoot },
        state,
      );

      assert.equal(result.status, "done");
      assert.equal(result.output, "legacy recovered");
      assert.equal(result.assistantStopReason, "stop");
      assert.equal(result.usage?.turns, 2);
    },
    "0.76.0",
  );
});

test("end-to-end: raw stdout noise does not satisfy startup readiness", async () => {
  await withFakePiOnPath(
    [
      "#!/usr/bin/env bash",
      "printf 'startup banner\\n'",
      "trap '' TERM INT",
      "while true; do sleep 1; done",
      "",
    ].join("\n"),
    async (tempRoot) => {
      const state = createSubagentState(join(tempRoot, "sessions"));
      const result = await spawnSubagentWithSpawn(
        {
          name: "noise-does-not-ready",
          objective: "Wait for recognized Pi readiness",
          tools: "read,bash",
          sessionFile: join(state.sessionsDir, "noise-does-not-ready.jsonl"),
          timeout: 5_000,
          startupTimeout: 250,
        },
        "test/model",
        { cwd: tempRoot },
        state,
      );

      assert.equal(result.status, "timeout");
      assert.equal(result.timeoutPhase, "startup");
      assert.equal(result.output, "Subagent timed out during startup after 250ms");
      assert.match(result.stderr, /raw pi stdout noise: startup banner/);
    },
  );
});

test("parent startup deadline fires at 250ms even while helper startup is blocked", async (t) => {
  const tempRoot = await mkdtemp(join(tmpdir(), "subagent-blocked-helper-"));
  const helper = new EventEmitter();
  helper.stdout = new PassThrough();
  helper.stderr = new PassThrough();
  const signals = [];
  helper.kill = (signal) => {
    signals.push(signal);
    return true;
  };
  // Deliberately hold the helper before any protocol/spawn-intent event. Mock only
  // the parent's clock: subagent-supervisor-live proves teardown with real processes.
  t.mock.timers.enable({ apis: ["setTimeout", "Date"] });
  try {
    const state = createSubagentState(join(tempRoot, "sessions"));
    const resultPromise = spawnSubagentWithSpawn(
      {
        name: "timeout-before-helper-startup",
        objective: "Review changes",
        tools: "read,bash",
        sessionFile: join(state.sessionsDir, "timeout-before-helper-startup.json"),
        timeout: 5_000,
        startupTimeout: 250,
      },
      "test/model",
      { cwd: tempRoot },
      state,
      (_command, args) => {
        assert.equal(args[args.indexOf("--startup-timeout-ms") + 1], "250");
        return helper;
      },
    );
    t.mock.timers.tick(249);
    assert.deepEqual(signals, []);
    t.mock.timers.tick(1);
    assert.deepEqual(signals, ["SIGTERM"]);
    helper.emit("close", 143, null);
    const result = await resultPromise;

    assert.equal(result.status, "timeout");
    assert.equal(result.timedOut, true);
    assert.equal(result.timeoutPhase, "startup");
    assert.equal(result.output, "Subagent timed out during startup after 250ms");
    assert.equal(result.elapsed, 250);
    assert.ok(result.elapsed < 750, `expected timeout teardown under 750ms, got ${result.elapsed}`);
    assert.equal(state.activeCount, 0);
    t.mock.timers.tick(500);
    assert.deepEqual(signals, ["SIGTERM"], "closed helper must not be force-killed later");
  } finally {
    t.mock.timers.reset();
    helper.stdout.destroy();
    helper.stderr.destroy();
    await rm(tempRoot, { recursive: true, force: true });
  }
});

test("helper self-terminates when its parent never drains protocol stdout", async () => {
  await withFakePiOnPath(
    [
      "#!/usr/bin/env node",
      'const event = JSON.stringify({ type: "tool_execution_start", toolName: "read" });',
      "for (let index = 0; index < 20000; index += 1) console.log(event);",
      "setInterval(() => {}, 1000);",
      "",
    ].join("\n"),
    async (tempRoot) => {
      const helperPath = join(process.cwd(), "extensions/self/subagent-pi-json-filter-v2.ts");
      const helper = spawn(
        process.execPath,
        [
          helperPath,
          "--cwd",
          tempRoot,
          "--model",
          "test/model",
          "--tools",
          "read,bash",
          "--thinking",
          "off",
          "--session-file",
          join(tempRoot, "backpressured.jsonl"),
          "--objective",
          "Exercise unread helper stdout",
          "--startup-timeout-ms",
          "250",
          "--execution-timeout-ms",
          "100",
        ],
        { cwd: tempRoot, env: process.env, stdio: ["ignore", "pipe", "pipe"] },
      );

      try {
        // Intentionally attach no stdout data listener: this reproduces a live parent that
        // stopped draining the helper transport after dispatch.
        const exit = Promise.race([
          once(helper, "exit"),
          new Promise((_, reject) =>
            setTimeout(
              () => reject(new Error("backpressured helper did not self-terminate")),
              3_000,
            ),
          ),
        ]);
        const [code, signal] = await exit;
        assert.equal(code, 124);
        assert.equal(signal, null);
      } finally {
        if (helper.exitCode === null && helper.signalCode === null) helper.kill("SIGKILL");
        helper.stdout?.destroy();
        helper.stderr?.destroy();
      }
    },
  );
});

test("unlimited execution retains a finite helper backpressure watchdog", async () => {
  await withFakePiOnPath(
    [
      "#!/usr/bin/env node",
      'const event = JSON.stringify({ type: "tool_execution_start", toolName: "read" });',
      "for (let index = 0; index < 20000; index += 1) console.log(event);",
      "setInterval(() => {}, 1000);",
      "",
    ].join("\n"),
    async (tempRoot) => {
      const helperPath = join(process.cwd(), "extensions/self/subagent-pi-json-filter-v2.ts");
      const helper = spawn(
        process.execPath,
        [
          helperPath,
          "--cwd",
          tempRoot,
          "--model",
          "test/model",
          "--tools",
          "read,bash",
          "--thinking",
          "off",
          "--session-file",
          join(tempRoot, "unlimited-backpressured.jsonl"),
          "--objective",
          "Exercise the independent backpressure watchdog",
          "--startup-timeout-ms",
          "5000",
          "--execution-timeout-ms",
          "0",
        ],
        {
          cwd: tempRoot,
          env: { ...process.env, PI_SUBAGENT_HELPER_BACKPRESSURE_TIMEOUT_MS: "100" },
          stdio: ["ignore", "pipe", "pipe"],
        },
      );

      try {
        const [code, signal] = await Promise.race([
          once(helper, "exit"),
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error("unlimited backpressured helper leaked")), 3_000),
          ),
        ]);
        assert.equal(code, 125);
        assert.equal(signal, null);
      } finally {
        if (helper.exitCode === null && helper.signalCode === null) helper.kill("SIGKILL");
        helper.stdout?.destroy();
        helper.stderr?.destroy();
      }
    },
  );
});

test("unlimited execution retains a finite helper stderr backpressure watchdog", async () => {
  await withFakePiOnPath(
    [
      "#!/usr/bin/env node",
      `console.log(${JSON.stringify(JSON.stringify({ type: "agent_start" }))});`,
      `const chunk = ${JSON.stringify("x".repeat(8 * 1024))};`,
      "for (let index = 0; index < 20000; index += 1) process.stderr.write(chunk);",
      "setInterval(() => {}, 1000);",
      "",
    ].join("\n"),
    async (tempRoot) => {
      const helperPath = join(process.cwd(), "extensions/self/subagent-pi-json-filter-v2.ts");
      const helper = spawn(
        process.execPath,
        [
          helperPath,
          "--cwd",
          tempRoot,
          "--model",
          "test/model",
          "--tools",
          "read,bash",
          "--thinking",
          "off",
          "--session-file",
          join(tempRoot, "unlimited-stderr-backpressured.jsonl"),
          "--objective",
          "Exercise the stderr backpressure watchdog",
          "--startup-timeout-ms",
          "5000",
          "--execution-timeout-ms",
          "0",
        ],
        {
          cwd: tempRoot,
          env: { ...process.env, PI_SUBAGENT_HELPER_BACKPRESSURE_TIMEOUT_MS: "100" },
          stdio: ["ignore", "pipe", "pipe"],
        },
      );
      helper.stdout?.resume();

      try {
        const [code, signal] = await Promise.race([
          once(helper, "exit"),
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error("stderr-backpressured helper leaked")), 3_000),
          ),
        ]);
        assert.equal(code, 125);
        assert.equal(signal, null);
      } finally {
        if (helper.exitCode === null && helper.signalCode === null) helper.kill("SIGKILL");
        helper.stdout?.destroy();
        helper.stderr?.destroy();
      }
    },
  );
});

test("helper publishes raw custody directly before parent transport parsing", async () => {
  await withFakePiOnPath(
    [
      "#!/usr/bin/env bash",
      'test -s "$PI_PROVENANCE_CUSTODY_PATH"',
      'test -s "$PI_PROVENANCE_SPAWN_MARKER_PATH"',
      `printf '%s\\n' '${JSON.stringify({ type: "agent_start" })}'`,
      `printf '%s\\n' '${JSON.stringify({
        type: "message_end",
        message: {
          role: "assistant",
          stopReason: "stop",
          content: [{ type: "text", text: "done" }],
        },
      })}'`,
      `printf '%s\\n' '${JSON.stringify({ type: "agent_settled" })}'`,
      "",
    ].join("\n"),
    async (tempRoot) => {
      const helperPath = join(process.cwd(), "extensions/self/subagent-pi-json-filter-v2.ts");
      const sessionsDir = join(tempRoot, "sessions");
      await mkdir(sessionsDir, { recursive: true });
      const lease = reserveSharedSubagentCapacity(sessionsDir, 1, {
        leaseMetadata: {
          dispatchId: "dispatch-custody",
          attemptId: "attempt-custody",
          sessionName: "custody",
          custodyMode: "helper_owned",
        },
      });
      assert.ok(lease?.custodyBinding);
      const binding = lease.custodyBinding;
      const custodyPath = binding.path;
      const spawnCommittedPath = binding.spawnCommittedPath;
      const parentPidStartedAt = getProcessStartTicks(process.pid);
      assert.equal(typeof parentPidStartedAt, "number");
      const helper = spawn(
        process.execPath,
        [
          helperPath,
          "--cwd",
          tempRoot,
          "--model",
          "test/model",
          "--tools",
          "read,bash",
          "--thinking",
          "off",
          "--session-file",
          join(tempRoot, "custody.jsonl"),
          "--objective",
          "Publish custody",
          "--startup-timeout-ms",
          "1000",
          "--execution-timeout-ms",
          "1000",
          "--parent-pid",
          String(process.pid),
          "--parent-pid-started-at",
          String(parentPidStartedAt),
          "--capacity-custody-path",
          custodyPath,
          "--capacity-path",
          binding.capacityPath,
          "--capacity-spawn-committed-path",
          spawnCommittedPath,
          "--capacity-slot",
          "0",
          "--capacity-token",
          binding.token,
          "--capacity-dispatch-id",
          "dispatch-custody",
          "--capacity-attempt-id",
          "attempt-custody",
          "--capacity-parent-pid",
          String(process.pid),
          "--capacity-parent-pid-started-at",
          String(parentPidStartedAt),
        ],
        {
          cwd: tempRoot,
          env: {
            ...process.env,
            PI_PROVENANCE_CUSTODY_PATH: custodyPath,
            PI_PROVENANCE_SPAWN_MARKER_PATH: spawnCommittedPath,
          },
          stdio: ["ignore", "pipe", "pipe"],
        },
      );
      helper.stdout?.resume();
      helper.stderr?.resume();
      const [code] = await once(helper, "exit");
      assert.equal(code, 0);
      const custody = JSON.parse(await readFile(custodyPath, "utf8"));
      assert.equal(custody.kind, "asc.subagent_capacity_custody.v1");
      assert.equal(custody.dispatchId, "dispatch-custody");
      assert.equal(custody.attemptId, "attempt-custody");
      assert.equal(custody.parentPid, process.pid);
      assert.equal(typeof custody.helperPidStartedAt, "number");
      assert.equal(typeof custody.rawChildPidStartedAt, "number");
      assert.equal(custody.rawChildProcessGroupId, custody.rawChildPid);
      lease.release();
    },
  );
});

test("settled raw leader teardown kills same-group descendants before capacity release", async () => {
  await withFakePiOnPath(
    [
      "#!/usr/bin/env bash",
      "node -e 'setInterval(() => {}, 1000)' </dev/null >/dev/null 2>&1 &",
      'printf \'%s\' "$!" > "$PI_PROVENANCE_OUTPUT_FILE"',
      `printf '%s\\n' '${JSON.stringify({ type: "agent_start" })}'`,
      `printf '%s\\n' '${JSON.stringify({
        type: "message_end",
        message: {
          role: "assistant",
          stopReason: "stop",
          content: [{ type: "text", text: "done" }],
        },
      })}'`,
      `printf '%s\\n' '${JSON.stringify({ type: "agent_settled" })}'`,
      "",
    ].join("\n"),
    async (tempRoot) => {
      const sessionsDir = join(tempRoot, "sessions");
      const descendantPidPath = join(tempRoot, "same-group-descendant.pid");
      const runtime = createAscExecutionRuntime({
        sessionsDir,
        modelProvider: () => "test/model",
      });
      const result = await runtime.execute(
        {
          profile: "reviewer",
          objective: "Settle while a same-group descendant exists",
          env: { PI_PROVENANCE_OUTPUT_FILE: descendantPidPath },
        },
        { cwd: tempRoot, sessionKey: "same-group-parent" },
      );

      assert.equal(result.ok, true);
      assert.equal(result.details.status, "done");
      const descendantPid = Number(await readFile(descendantPidPath, "utf8"));
      assert.equal(processIsAlive(descendantPid), false);
      const capacityFiles = (await readdir(sessionsDir)).filter((entry) =>
        /^\.asc-subagent-capacity-\d+\.lock/.test(entry),
      );
      assert.deepEqual(capacityFiles, []);
    },
  );
});

test("failed exact capacity deletion becomes an effect-indeterminate terminal error", async () => {
  await withFakePiOnPath(
    [
      "#!/usr/bin/env bash",
      "lock=$(find \"$PI_PROVENANCE_SESSIONS_DIR\" -maxdepth 1 -name '.asc-subagent-capacity-*.lock' | head -n 1)",
      'ln "$lock" "$lock.external-claim"',
      `printf '%s\\n' '${JSON.stringify({ type: "agent_start" })}'`,
      `printf '%s\\n' '${JSON.stringify({
        type: "message_end",
        message: {
          role: "assistant",
          stopReason: "stop",
          content: [{ type: "text", text: "done" }],
        },
      })}'`,
      `printf '%s\\n' '${JSON.stringify({ type: "agent_settled" })}'`,
      "",
    ].join("\n"),
    async (tempRoot) => {
      const sessionsDir = join(tempRoot, "sessions");
      const runtime = createAscExecutionRuntime({
        sessionsDir,
        modelProvider: () => "test/model",
      });
      const result = await runtime.execute(
        {
          profile: "reviewer",
          objective: "Exercise deferred exact capacity release",
          env: { PI_PROVENANCE_SESSIONS_DIR: sessionsDir },
        },
        { cwd: tempRoot, sessionKey: "deferred-release-parent" },
      );

      assert.equal(result.ok, false);
      assert.equal(result.details.status, "error");
      assert.equal(result.details.failureKind, "capacity_release_deferred");
      assert.equal(result.details.effectReceipt?.disposition, "effect_indeterminate");
      assert.match(result.text, /retained shared capacity/);
      const externalClaim = (await readdir(sessionsDir)).find((entry) =>
        entry.endsWith(".external-claim"),
      );
      assert.ok(externalClaim);
      await unlink(join(sessionsDir, externalClaim));
      const replacement = reserveSharedSubagentCapacity(sessionsDir, runtime.state.maxConcurrent);
      assert.ok(replacement);
      replacement.release();
    },
  );
});

test("supervised raw spawn failure releases exact custody without leaking capacity", async () => {
  await withFakePiOnPath("#!/usr/bin/env bash\nexit 1\n", async (tempRoot) => {
    const fakePiPath = join(tempRoot, "bin", "pi");
    await writeFile(
      fakePiPath,
      [
        "#!/usr/bin/env bash",
        'if [[ "$1" == "--version" ]]; then rm -- "$0"; printf \'0.80.6\\n\'; exit 0; fi',
        "exit 99",
        "",
      ].join("\n"),
      { mode: 0o755 },
    );
    const sessionsDir = join(tempRoot, "sessions");
    const runtime = createAscExecutionRuntime({
      sessionsDir,
      modelProvider: () => "test/model",
    });

    const result = await runtime.execute(
      { profile: "reviewer", objective: "Exercise supervised raw spawn failure" },
      { cwd: tempRoot, sessionKey: "raw-spawn-failure-parent" },
    );

    assert.equal(result.ok, false);
    assert.equal(result.details.effectReceipt?.disposition, "effect_indeterminate");
    const capacityFiles = (await readdir(sessionsDir)).filter((entry) =>
      /^\.asc-subagent-capacity-\d+\.lock/.test(entry),
    );
    assert.deepEqual(capacityFiles, []);
  });
});

test("helper terminates unlimited raw work after exact parent death", async () => {
  await withFakePiOnPath(
    [
      "#!/usr/bin/env bash",
      'printf \'%s\' "$$" > "$PI_PROVENANCE_OUTPUT_FILE"',
      "trap '' TERM INT",
      "while true; do sleep 1; done",
      "",
    ].join("\n"),
    async (tempRoot) => {
      const helperPath = join(process.cwd(), "extensions/self/subagent-pi-json-filter-v2.ts");
      const rawPidPath = join(tempRoot, "orphaned-raw.pid");
      const helper = spawn(
        process.execPath,
        [
          helperPath,
          "--cwd",
          tempRoot,
          "--model",
          "test/model",
          "--tools",
          "read,bash",
          "--thinking",
          "off",
          "--session-file",
          join(tempRoot, "parent-death.jsonl"),
          "--objective",
          "Stop when the recorded parent is gone",
          "--startup-timeout-ms",
          "5000",
          "--execution-timeout-ms",
          "0",
          "--parent-pid",
          "2147483647",
          "--parent-pid-started-at",
          "0",
        ],
        {
          cwd: tempRoot,
          env: { ...process.env, PI_PROVENANCE_OUTPUT_FILE: rawPidPath },
          stdio: ["ignore", "pipe", "pipe"],
        },
      );
      helper.stdout?.resume();
      helper.stderr?.resume();
      try {
        const [code, signal] = await Promise.race([
          once(helper, "exit"),
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error("helper ignored exact parent death")), 4_000),
          ),
        ]);
        assert.equal(code, 125);
        assert.equal(signal, null);
        const rawPid = Number(await readFile(rawPidPath, "utf8"));
        assert.equal(processIsAlive(rawPid), false);
      } finally {
        if (helper.exitCode === null && helper.signalCode === null) helper.kill("SIGKILL");
      }
    },
  );
});
