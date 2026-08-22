import assert from "node:assert/strict";
import { access } from "node:fs/promises";
import { create, fromBinary, toBinary } from "@bufbuild/protobuf";

const generated = new URL(
  "../protocol/generated/pi/tool_boundary/v1/boundary_pb.js",
  import.meta.url,
);
await access(generated);
const module = await import(generated.href);
const call = create(module.RequestedCallV1Schema, {
  callId: "018f0000-0000-7000-8000-000000000001",
  clientSessionId: "session-1",
  clientEpoch: "epoch-1",
  leaseId: "lease-1",
  requestedTimeoutMs: 1000n,
  expectedWorkspaceGeneration: 1n,
  operation: {
    case: "read",
    value: {
      path: { segments: ["src", "main.ts"] },
      offset: 0n,
      limit: 4096n,
    },
  },
});
const bytes = toBinary(module.RequestedCallV1Schema, call);
const decoded = fromBinary(module.RequestedCallV1Schema, bytes);
assert.equal(decoded.callId, call.callId);
assert.equal(decoded.operation.case, "read");
assert.deepEqual(decoded.operation.value.path?.segments, ["src", "main.ts"]);
assert.equal("effectClass" in decoded, false);
assert.equal("durabilityClass" in decoded, false);
console.log(JSON.stringify({ generated: true, bytes: bytes.length, status: "ok" }));
