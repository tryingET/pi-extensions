// Builtins only before the real host-entry adopts native custody. Never import SDK here.
import fs, { appendFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { syncBuiltinESMExports } from "node:module";
import os from "node:os";
import { join } from "node:path";
import { zstdDecompressSync } from "node:zlib";

const root = process.env.TASK5480_FIXTURE_ROOT,
  c = JSON.parse(readFileSync(join(root, "public-fixture.json")));
const account = os.userInfo();
os.userInfo = () => ({ ...account, homedir: c.home });
// Audit only: owner subprocesses may read their policy; the Pi consumer must not.
for (const key of ["readFileSync", "openSync"]) {
  const original = fs[key];
  fs[key] = function (path, ...args) {
    const value = path instanceof URL ? path.pathname : String(path);
    if (
      value === join(c.owner, "policy/ak-runtime-access.json") ||
      value.startsWith(c.databasePath)
    )
      throw Error("consumer_owner_storage_read_forbidden");
    return original.call(this, path, ...args);
  };
}
syncBuiltinESMExports();
writeFileSync(
  join(root, "public-host-pid.json"),
  JSON.stringify({
    pid: process.pid,
    start: readFileSync("/proc/self/stat", "utf8").split(") ")[1].split(" ")[19],
  }),
);
let sends = 0;
globalThis.fetch = async (url, init) => {
  const h = new Headers(init.headers),
    body = JSON.parse(
      h.get("content-encoding") === "zstd"
        ? zstdDecompressSync(init.body).toString()
        : Buffer.from(init.body).toString(),
    );
  sends++;
  appendFileSync(
    join(root, "public-sends.jsonl"),
    `${JSON.stringify({
      sends,
      url: String(url),
      model: body.model,
      reasoning: body.reasoning,
      account: h.get("chatgpt-account-id") === "synthetic-account",
      authorization: h.get("authorization") === `Bearer ${c.syntheticAccess}`,
      hasObjective: JSON.stringify(body.input).includes(c.objective),
      hasToolResult: JSON.stringify(body.input).includes("function_call_output"),
    })}\n`,
  );
  if (c.scenario === "stop")
    while (!existsSync(join(root, "public-stop-issued")))
      await new Promise((r) => setTimeout(r, 20));
  if (sends === 1) await new Promise((r) => setTimeout(r, 750));
  const args = JSON.stringify({
      path: join(c.checkout, "src/proof.txt"),
      content: "task5480 public SDK proof",
    }),
    item = {
      type: "function_call",
      id: "fc_public",
      call_id: "call_public",
      name: "write",
      arguments: args,
    };
  const events =
    sends === 1
      ? [
          {
            type: "response.output_item.added",
            output_index: 0,
            item: { ...item, arguments: "" },
          },
          {
            type: "response.function_call_arguments.delta",
            item_id: item.id,
            output_index: 0,
            delta: args,
          },
          { type: "response.output_item.done", output_index: 0, item },
        ]
      : [];
  events.push({
    type: "response.completed",
    response: {
      status: "completed",
      output: [],
      usage: { input_tokens: 1, output_tokens: 1 },
    },
  });
  return new Response(events.map((e) => `data: ${JSON.stringify(e)}\n\n`).join(""), {
    headers: { "content-type": "text/event-stream" },
  });
};
