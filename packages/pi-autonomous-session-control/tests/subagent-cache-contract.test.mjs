// summary: "Proves stable-prefix child launch ordering and cache-measurement accounting."
// read_when:
//   - "Changing ASC child prompt placement or usage/cache reporting."

import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createSubagentState, spawnSubagentWithSpawn } from "../extensions/self/subagent.ts";

async function withFakePiOnPath(scriptBody, run) {
  const tempDir = await mkdtemp(join(tmpdir(), "subagent-cache-contract-"));
  const binDir = join(tempDir, "bin");
  const fakePiPath = join(binDir, "pi");
  const scenarioPath = join(binDir, "pi-scenario");
  const previousPath = process.env.PATH;

  await mkdir(binDir, { recursive: true });
  await writeFile(scenarioPath, scriptBody, { mode: 0o755 });
  await writeFile(
    fakePiPath,
    `#!/usr/bin/env bash\nif [[ "$1" == "--version" ]]; then printf '%s\\n' 0.80.6; exit 0; fi\nexec ${JSON.stringify(scenarioPath)} "$@"\n`,
    { mode: 0o755 },
  );
  process.env.PATH = `${binDir}:${previousPath || ""}`;

  try {
    return await run(tempDir);
  } finally {
    if (previousPath === undefined) delete process.env.PATH;
    else process.env.PATH = previousPath;
    await rm(tempDir, { recursive: true, force: true });
  }
}

test("raw child receives role/task variation once as the initial user message", async () => {
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
      const userPrompt = [
        "You are the reviewer.",
        "",
        "DISPATCH TASK CONTRACT",
        '{"objective":"Review changes"}',
      ].join("\n");

      const result = await spawnSubagentWithSpawn(
        {
          name: "stable-prefix",
          objective: "Review changes",
          userPrompt,
          tools: "read,bash",
          sessionFile: join(state.sessionsDir, "stable-prefix.jsonl"),
        },
        "test/model",
        { cwd: tempRoot },
        state,
      );

      const args = JSON.parse(result.output);
      assert.equal(result.status, "done");
      assert.equal(args.includes("--append-system-prompt"), false);
      assert.equal(args.at(-1), userPrompt);
      assert.equal(args.filter((value) => value === userPrompt).length, 1);
    },
  );
});

test("transport reports first-turn and aggregate prompt-cache measurements", async () => {
  const rawEvents = [
    {
      type: "message_end",
      message: {
        role: "assistant",
        content: [],
        stopReason: "toolUse",
        usage: {
          input: 100,
          output: 5,
          cacheRead: 0,
          cacheWrite: 20,
          totalTokens: 125,
          cost: { total: 0.02 },
        },
      },
    },
    {
      type: "message_end",
      message: {
        role: "assistant",
        content: [{ type: "text", text: "measured" }],
        stopReason: "stop",
        usage: {
          input: 10,
          output: 2,
          cacheRead: 90,
          cacheWrite: 0,
          totalTokens: 102,
          cost: { total: 0.01 },
        },
      },
    },
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
        name: "cache-measurement",
        objective: "Measure cache behavior",
        tools: "read,bash",
        sessionFile: join(state.sessionsDir, "cache-measurement.jsonl"),
      },
      "test/model",
      { cwd: tempRoot },
      state,
    );

    assert.equal(result.status, "done");
    assert.deepEqual(result.usage?.cache?.firstTurn, {
      promptTokens: 120,
      freshInputTokens: 100,
      cacheReadTokens: 0,
      cacheWriteTokens: 20,
      uncachedTokens: 120,
      cacheReadRatio: 0,
      outputTokens: 5,
      cost: 0.02,
    });
    assert.deepEqual(result.usage?.cache?.aggregate, {
      promptTokens: 220,
      freshInputTokens: 110,
      cacheReadTokens: 90,
      cacheWriteTokens: 20,
      uncachedTokens: 130,
      cacheReadRatio: 90 / 220,
      outputTokens: 7,
      cost: 0.03,
    });
  });
});
