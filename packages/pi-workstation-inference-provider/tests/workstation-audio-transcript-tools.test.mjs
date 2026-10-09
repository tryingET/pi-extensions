// summary: "An audio dispatch sends no tools, whatever the host's transcript declares (Pi >= 0.86 puts tools in system messages)."
// read_when:
//   - "Changing how the audio path removes tools, or after a Pi host upgrade that changes the provider context."

import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import extension from "../extensions/workstation-inference.ts";
import { clearWorkstationHealthCache } from "../extensions/workstation-inference-contract.ts";
import {
  inklingContract,
  inklingModel,
  schedulerConsumerResponse,
  schedulerHandoffPayload,
  withInlineContract,
} from "./workstation-inference-test-helpers.mjs";

test("an audio dispatch strips the tools a Pi >= 0.86 transcript declares in its system message", async () => {
  const oldFetch = globalThis.fetch;
  const root = await mkdtemp(join(tmpdir(), "workstation-audio-tools-"));
  const audioPath = join(root, "question.wav");
  const handoffPath = join(root, "handoff.json");
  const commands = new Map();
  const providers = [];
  const handoffPayload = schedulerHandoffPayload();
  const posts = [];
  let sent = "";
  globalThis.fetch = async (_url, init = {}) => {
    if (init.method === "POST") {
      posts.push(JSON.parse(String(init.body)));
      const body = [
        'data: {"id":"a","object":"chat.completion.chunk","created":1,"model":"thinkingmachines/Inkling-Small","choices":[{"index":0,"delta":{"role":"assistant","content":"heard"},"finish_reason":null}]}',
        'data: {"id":"a","object":"chat.completion.chunk","created":1,"model":"thinkingmachines/Inkling-Small","choices":[{"index":0,"delta":{},"finish_reason":"stop"}],"usage":{"prompt_tokens":1,"completion_tokens":1,"total_tokens":2}}',
        "data: [DONE]",
        "",
      ].join("\n\n");
      return new Response(body, { status: 200, headers: { "content-type": "text/event-stream" } });
    }
    return Response.json({ status: "ok" });
  };
  try {
    await writeFile(audioPath, Buffer.from("RIFF0000WAVE", "ascii"));
    await writeFile(handoffPath, JSON.stringify(handoffPayload));
    clearWorkstationHealthCache();
    await withInlineContract(inklingContract(), async () => {
      const pi = {
        on() {},
        registerCommand(name, command) {
          commands.set(name, command);
        },
        registerProvider(name, config) {
          providers.push({ name, config });
        },
        sendUserMessage(message) {
          sent = message;
        },
        async exec(_command, args) {
          const action = args[args.indexOf("external-effect") + 1];
          const phase = action === "consume" ? args[args.indexOf("--phase") + 1] : undefined;
          return {
            code: 0,
            stdout: JSON.stringify(schedulerConsumerResponse(handoffPayload, action, phase)),
            stderr: "",
            killed: false,
          };
        },
      };
      await extension(pi);
      await commands
        .get("workstation-inference")
        .handler(
          `audio-send --handoff ${handoffPath} --scheduler-db ${join(root, "s.sqlite3")} ${audioPath} -- Explain`,
          {
            cwd: root,
            model: inklingModel(),
            signal: undefined,
            isIdle: () => true,
            hasUI: true,
            ui: { notify() {} },
          },
        );
      // What a Pi >= 0.86 host hands a provider: tools live in the transcript's system message.
      const tool = {
        name: "read",
        description: "Read a file",
        parameters: {
          type: "object",
          properties: { path: { type: "string" } },
          required: ["path"],
        },
      };
      const stream = providers[0].config.streamSimple(
        inklingModel(),
        {
          messages: [
            { role: "system", content: "You are helpful.", toolsAdded: [tool], timestamp: 0 },
            { role: "user", content: sent, timestamp: 0 },
          ],
        },
        { apiKey: "workstation-local" },
      );
      const events = [];
      for await (const event of stream) events.push(event);
      const error = events.find((event) => event.type === "error");
      assert.equal(error, undefined, error?.error?.errorMessage);
      assert.equal(posts.length, 1);
      assert.ok(
        !Array.isArray(posts[0].tools) || posts[0].tools.length === 0,
        "the audio request carries tools",
      );
      assert.equal(posts[0].tool_choice, undefined);
      assert.ok(JSON.stringify(posts[0].messages).includes("input_audio"));
    });
  } finally {
    globalThis.fetch = oldFetch;
    await rm(root, { recursive: true, force: true });
  }
});
