import { native } from "../../../dist/task-session/native.js";

native().adoptCustody(); // identical first capability operation to the emitted fixed bootstrap
const { readFileSync, writeFileSync, existsSync } = await import("node:fs");
const { join } = await import("node:path");
const { zstdDecompressSync } = await import("node:zlib");
const root = process.argv[2];
const config = JSON.parse(readFileSync(join(root, "fixture.json"), "utf8"));
const { openAdoptedChannel } = await import("../../../dist/task-session/socket-channel.js");
const { runHost } = await import("../../../dist/task-session/startup.js");
const { interpretTaskSessionMessage } = await import(
  "../../../dist/task-session/producer-adapter.js"
);
let sends = 0;
const result = await runHost(
  openAdoptedChannel(),
  config.locator,
  {
    send: async (_url, init) => {
      const body = JSON.parse(zstdDecompressSync(init.body));
      sends++;
      writeFileSync(
        join(root, "send.json"),
        JSON.stringify({ sends, model: body.model, transport: "sse" }),
      );
      if (config.stop) {
        writeFileSync(join(root, "viewer-action"), "s");
        await new Promise((r) => setTimeout(r, 250));
      }
      const events =
        sends === 1
          ? [
              {
                type: "response.output_item.added",
                output_index: 0,
                item: {
                  type: "function_call",
                  id: "fc_proof",
                  call_id: "call_proof",
                  name: "write",
                  arguments: "",
                },
              },
              {
                type: "response.function_call_arguments.delta",
                item_id: "fc_proof",
                output_index: 0,
                delta: JSON.stringify({
                  path: join(config.checkout, "proof.txt"),
                  content: "synthetic e2e",
                }),
              },
              {
                type: "response.output_item.done",
                output_index: 0,
                item: {
                  type: "function_call",
                  id: "fc_proof",
                  call_id: "call_proof",
                  name: "write",
                  arguments: JSON.stringify({
                    path: join(config.checkout, "proof.txt"),
                    content: "synthetic e2e",
                  }),
                },
              },
            ]
          : [];
      events.push({
        type: "response.completed",
        response: { status: "completed", output: [], usage: { input_tokens: 1, output_tokens: 1 } },
      });
      return new Response(events.map((e) => `data: ${JSON.stringify(e)}\n\n`).join(""), {
        headers: { "content-type": "text/event-stream" },
      });
    },
  },
  interpretTaskSessionMessage,
);
writeFileSync(join(root, "host-result.json"), JSON.stringify({ ...result, sends }));
if (!result.closedVerified)
  while (!existsSync(join(root, "fixture-release"))) await new Promise((r) => setTimeout(r, 20));
native().closeCustody();
