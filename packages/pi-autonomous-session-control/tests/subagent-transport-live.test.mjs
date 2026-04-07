import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createSubagentState, spawnSubagentWithSpawn } from "../extensions/self/subagent.ts";

async function withFakePiOnPath(scriptBody, run) {
  const tempDir = await mkdtemp(join(tmpdir(), "subagent-transport-live-fake-pi-"));
  const binDir = join(tempDir, "bin");
  const fakePiPath = join(binDir, "pi");
  const previousPath = process.env.PATH;

  await mkdir(binDir, { recursive: true });
  await writeFile(fakePiPath, scriptBody, { mode: 0o755 });
  process.env.PATH = `${binDir}:${previousPath || ""}`;

  try {
    return await run(tempDir);
  } finally {
    if (previousPath === undefined) {
      delete process.env.PATH;
    } else {
      process.env.PATH = previousPath;
    }
    await rm(tempDir, { recursive: true, force: true });
  }
}

async function withTemporaryEnv(overrides, run) {
  const previous = new Map();
  for (const [key, value] of Object.entries(overrides)) {
    previous.set(key, process.env[key]);
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }

  try {
    return await run();
  } finally {
    for (const [key, value] of previous.entries()) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }
}

function processIsAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) {
    return false;
  }

  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

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
    `#!/usr/bin/env bash\nprintf '%s\\n' '${oversizedRawPiLine}'\n`,
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
  const sourceAgentDir = await mkdtemp(join(tmpdir(), "subagent-child-agent-dir-source-"));

  try {
    await writeFile(
      join(sourceAgentDir, "settings.json"),
      `${JSON.stringify({ defaultProvider: "openai-codex-2", defaultModel: "gpt-5.4" })}\n`,
    );
    await writeFile(join(sourceAgentDir, "auth.json"), '{"token":"test"}\n');
    await writeFile(join(sourceAgentDir, "multi-pass.json"), '{"subscriptions":[]}\n');

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
        "",
      ].join("\n"),
      async (tempRoot) => {
        await withTemporaryEnv({ PI_CODING_AGENT_DIR: sourceAgentDir }, async () => {
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
        });
      },
    );
  } finally {
    await rm(sourceAgentDir, { recursive: true, force: true });
  }
});

test("end-to-end: timeout tears down the raw pi child before the helper is force-killed", async () => {
  await withFakePiOnPath(
    ["#!/usr/bin/env bash", "trap '' TERM INT", "while true; do sleep 1; done", ""].join("\n"),
    async (tempRoot) => {
      const state = createSubagentState(join(tempRoot, "sessions"));
      const result = await spawnSubagentWithSpawn(
        {
          name: "timeout-reaps-raw-pi",
          objective: "Review changes",
          tools: "read,bash",
          sessionFile: join(state.sessionsDir, "timeout-reaps-raw-pi.json"),
          timeout: 50,
        },
        "test/model",
        { cwd: tempRoot },
        state,
      );

      const rawPiPid = result.executionState?.transport.rawChildPid;

      assert.equal(result.status, "timeout");
      assert.equal(result.timedOut, true);
      assert.equal(result.output, "Subagent timed out after 50ms");
      assert.ok(
        result.elapsed < 500,
        `expected timeout teardown under 500ms, got ${result.elapsed}`,
      );
      assert.equal(typeof rawPiPid, "number");
      assert.equal(processIsAlive(rawPiPid), false);
    },
  );
});
