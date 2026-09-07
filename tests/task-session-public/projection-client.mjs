// Actual shipped Pi-tool definition/execution; only registration is collected, not a live Pi reload.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const c = JSON.parse(readFileSync(join(process.env.TASK5480_FIXTURE_ROOT, "public-fixture.json")));
let definition;
const { default: register } = await import(
  pathToFileURL(join(c.runtime, "dist/task-session/pi-tool.js"))
);
register({
  registerTool: (d) => {
    assert.equal(definition, undefined);
    definition = d;
  },
});
const [operation, requestId] = process.argv.slice(2),
  chunks = [];
for await (const b of process.stdin) chunks.push(b);
const request = Buffer.concat(chunks).toString();
const result = await definition.execute("synthetic-tool-call", {
  operation,
  ...(request ? { request } : {}),
  ...(requestId ? { requestId } : {}),
});
assert.deepEqual(JSON.parse(result.content[0].text), result.details);
console.log(result.content[0].text);
if (result.details.schema === "pi.task-session.error.v1") process.exitCode = 2;
