import assert from "node:assert/strict";
import registerCanary from "../extensions/agent-interaction-canary.ts";

const provider = process.argv[2];
const chunks = [];
for await (const chunk of process.stdin) chunks.push(chunk);
const receipt_json = Buffer.concat(chunks).toString("utf8");
const receipt = JSON.parse(receipt_json);
let source_identity;
if (provider === "ts_quality_p1_retention") {
  source_identity = `ts-quality:retention:${receipt.policy.validity_context.fixture_root_coordinate}`;
  assert.equal(receipt.pilot.schema_version, 4);
} else if (provider === "agent_kernel_p2_task_projection") {
  source_identity = `agent-kernel:task:${receipt.structured_authorized_expansion.payload.task.id}`;
  assert.equal(source_identity, "agent-kernel:task:4666");
  assert.equal(receipt.pilot.schema_version, 3);
  assert.equal(receipt.applied_policy.policy_version, 2);
} else throw new Error("unsupported direct-probe provider");
const tools = [];
registerCanary({
  registerTool(tool) {
    tools.push(tool);
  },
  registerCommand() {},
});
assert.equal(tools.length, 1);
const compactResult = await tools[0].execute("direct-owner-compact", {
  provider,
  source_identity,
  receipt_json,
});
const compact = compactResult.details;
const expandedResult = await tools[0].execute("direct-owner-expand", {
  provider,
  source_identity,
  receipt_json,
  view: "expand",
  expected_source_identity: compact.binding.source_identity,
  expected_generation: compact.binding.generation,
  expected_source_digest: compact.binding.source_digest,
  expected_policy_digest: compact.binding.policy_digest,
});
const expanded = expandedResult.details;
assert.equal(expanded.same_generation_expansion, true);
assert.equal(compact.execution_provenance.observed_pi_invocation, "pi_tool");
assert.equal(compact.execution_provenance.cryptographic_caller_authentication, false);
process.stdout.write(`${provider}: current owner receipt compatible\n`);
