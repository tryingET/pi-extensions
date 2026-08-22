import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile(new URL("../protocol/pi/tool_boundary/v1/boundary.proto", import.meta.url), "utf8");
assert.match(source, /^syntax = "proto3";/m);
assert.match(source, /package pi\.tool_boundary\.v1;/);
assert.match(source, /message RequestedCallV1[\s\S]*oneof operation/);
assert.match(source, /ReadFileV1 read = 10;/);
assert.match(source, /ExecProcessV1 exec = 16;/);
assert.doesNotMatch(source, /effect_class|durability_class|backend_id|host_path/i);
assert.match(source, /enum CallStateKindV1/);
assert.match(source, /message ProtocolErrorV1/);
console.log(JSON.stringify({ schema: "pi.tool_boundary.v1", status: "ok" }));
