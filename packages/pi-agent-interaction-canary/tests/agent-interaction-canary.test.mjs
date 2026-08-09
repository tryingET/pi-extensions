import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";
import extension, {
  CANARY_POLICY,
  CANARY_POLICY_DIGEST,
  COMMAND_NAME,
  runCanary,
  TOOL_NAME,
  TRANSIENT_AUTHORITY_NOTICE,
} from "../extensions/agent-interaction-canary.ts";

const p1Text = await readFile(
  new URL("./fixtures/current-ts-quality-p1-retention-receipt.json", import.meta.url),
  "utf8",
);
const p2Text = await readFile(
  new URL("./fixtures/current-agent-kernel-p2-task-receipt.json", import.meta.url),
  "utf8",
);
const p1 = JSON.parse(p1Text);
const p2 = JSON.parse(p2Text);
const p1Source = `ts-quality:retention:${p1.policy.validity_context.fixture_root_coordinate}`;
const p2Source = `agent-kernel:task:${p2.structured_authorized_expansion.payload.task.id}`;
const canonical = (value) =>
  value === null || typeof value !== "object"
    ? JSON.stringify(value)
    : Array.isArray(value)
      ? `[${value.map(canonical).join(",")}]`
      : `{${Object.keys(value)
          .sort()
          .map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`)
          .join(",")}}`;
const sha = (value) => `sha256:${createHash("sha256").update(value).digest("hex")}`;
const request = (provider, source_identity, value, extra = {}) => ({
  provider,
  source_identity,
  receipt_json: typeof value === "string" ? value : JSON.stringify(value),
  ...extra,
});
const compactP1 = () => runCanary(request("ts_quality_p1_retention", p1Source, p1Text));
const compactP2 = () => runCanary(request("agent_kernel_p2_task_projection", p2Source, p2Text));
const expansionRequest = (base, compact, changes = {}) => ({
  ...base,
  view: "expand",
  expected_source_identity: compact.binding.source_identity,
  expected_generation: compact.binding.generation,
  expected_source_digest: compact.binding.source_digest,
  expected_policy_digest: compact.binding.policy_digest,
  ...changes,
});

function rocsPacket(text = "ROCS semantic text") {
  const payload = {
    schema: "semantic-pack-result.v0",
    corpus_snapshot_digest: `sha256:${"1".repeat(64)}`,
    root_id: "core.Secret",
    root_document_digest: `sha256:${"2".repeat(64)}`,
    config: {
      max_depth: 0,
      rel_types: [],
      include_relation_defs: false,
      max_docs: 1,
      max_bytes: 4096,
    },
    documents: [
      {
        ont_id: "core.Secret",
        kind: "concept",
        logical_path: "ontology/core.Secret.md",
        document_digest: `sha256:${"3".repeat(64)}`,
        text,
      },
    ],
  };
  payload.pack_digest = `sha256:${createHash("sha256").update("rocs.pack.v0\0").update(canonical(payload)).digest("hex")}`;
  const policy = {
    id: "rocs.semantic-pack.pi-canary",
    version: 1,
    owner: "ROCS",
    payload_schema: "semantic-pack-result.v0",
  };
  return {
    packet_schema: "rocs.owner-packet.v1",
    owner: "ROCS",
    source_identity: "rocs:pack:core.Secret",
    policy: { ...policy, digest_sha256: sha(canonical(policy)) },
    generation: {
      corpus_snapshot_digest: payload.corpus_snapshot_digest,
      root_document_digest: payload.root_document_digest,
    },
    payload,
  };
}

test("registers the injected-receipt-only tool and command", () => {
  const tools = [];
  const commands = [];
  extension({
    registerTool(value) {
      tools.push(value);
    },
    registerCommand(name, value) {
      commands.push({ name, value });
    },
  });
  assert.equal(tools[0].name, TOOL_NAME);
  assert.equal(commands[0].name, COMMAND_NAME);
  assert.match(tools[0].description, /No process or filesystem acquisition exists/u);
  assert.deepEqual(tools[0].parameters.required, ["provider", "source_identity", "receipt_json"]);
});

test("accepts an exact generated current ts-quality P1 retention receipt", async () => {
  const result = await compactP1();
  assert.equal(result.provider, "ts_quality_p1_retention");
  assert.equal(result.owner, "ts-quality");
  assert.equal(
    result.binding.owner_generation,
    `sha256:${p1.generation.plan_generation_digest_sha256}`,
  );
  assert.equal(
    result.binding.owner_source_digest,
    `sha256:${p1.generation.plan_generation_digest_sha256}`,
  );
  assert.equal(p1.generation.digest_basis, "authorized-view-after-redaction");
  assert.equal(p1.policy.declared_policy_target, "pi-agent-interaction-canary");
  assert.equal(result.binding.owner_policy_digest, `sha256:${p1.policy.digest_sha256}`);
  assert.equal(result.binding.source_identity, p1Source);
  assert.equal(result.pi_role, TRANSIENT_AUTHORITY_NOTICE);
});

test("accepts an exact generated current Agent Kernel P2 task receipt and binds task source ID", async () => {
  const result = await compactP2();
  assert.equal(result.provider, "agent_kernel_p2_task_projection");
  assert.equal(result.owner, "Agent Kernel");
  assert.equal(result.binding.source_identity, "agent-kernel:task:4666");
  assert.equal(
    result.binding.owner_source_digest,
    `sha256:${p2.compact_projection.source_coordinate.authorized_source_digest_sha256}`,
  );
  await assert.rejects(
    () => runCanary(request("agent_kernel_p2_task_projection", "agent-kernel:task:4665", p2Text)),
    /task source id/u,
  );
  const forged = structuredClone(p2);
  forged.verification.selected_source_values.id = 4665;
  await assert.rejects(
    () => runCanary(request("agent_kernel_p2_task_projection", p2Source, forged)),
    /selected value id|compact task source id/u,
  );
});

test("accepts and verifies a closed ROCS owner packet", async () => {
  const packet = rocsPacket();
  const result = await runCanary(request("rocs_owner_packet", packet.source_identity, packet));
  assert.equal(result.owner, "ROCS");
  assert.equal(result.binding.owner_source_digest, packet.payload.pack_digest);
  const forged = structuredClone(packet);
  forged.payload.documents[0].text = "forged";
  await assert.rejects(
    () => runCanary(request("rocs_owner_packet", packet.source_identity, forged)),
    /pack digest join/u,
  );
});

test("expand requires and exactly matches all four compact bindings", async () => {
  const compact = await compactP1();
  const base = request("ts_quality_p1_retention", p1Source, p1Text);
  const expanded = await runCanary(expansionRequest(base, compact));
  assert.equal(expanded.same_generation_expansion, true);
  for (const missing of [
    "expected_source_identity",
    "expected_generation",
    "expected_source_digest",
    "expected_policy_digest",
  ]) {
    const attempt = expansionRequest(base, compact);
    delete attempt[missing];
    await assert.rejects(() => runCanary(attempt), /expand requires/u);
  }
  for (const [field, value] of [
    ["expected_source_identity", `${p1Source}-switched`],
    ["expected_generation", `sha256:${"9".repeat(64)}`],
    ["expected_source_digest", `sha256:${"8".repeat(64)}`],
    ["expected_policy_digest", `sha256:${"7".repeat(64)}`],
  ]) {
    await assert.rejects(
      () => runCanary(expansionRequest(base, compact, { [field]: value })),
      /join rejected/u,
    );
  }
});

test("source-switch and stale owner receipts cannot reuse a compact binding", async () => {
  const compact = await compactP2();
  const changed = structuredClone(p2);
  changed.pilot.compatibility_promise = true;
  await assert.rejects(
    () =>
      runCanary(
        expansionRequest(request("agent_kernel_p2_task_projection", p2Source, changed), compact),
      ),
    /generation|source digest|compatibility posture/u,
  );
  await assert.rejects(
    () =>
      runCanary(expansionRequest(request("ts_quality_p1_retention", p2Source, p1Text), compact)),
    /P1 source identity/u,
  );
});

test("pointer-aware inherited withholding never leaks nested sensitive or control keys in compact or expansion", async () => {
  const hostile = structuredClone(p1);
  hostile.measurements.hostile = {
    "api_token\nsegment": {
      nested: { password: "value-never-visible", ordinary: "sk_live_DO_NOT_DISCLOSE" },
    },
    "control\tkey": { child: "also-never-visible" },
  };
  const base = request("ts_quality_p1_retention", p1Source, hostile);
  const compact = await runCanary(base);
  const expanded = await runCanary(expansionRequest(base, compact));
  for (const output of [compact, expanded]) {
    const serialized = JSON.stringify(output);
    assert.doesNotMatch(
      serialized,
      /api_token|control\\tkey|password|value-never-visible|also-never-visible|DO_NOT_DISCLOSE/u,
    );
    assert.match(serialized, /<redacted-key>/u);
    assert.ok(
      output.omissions.some(
        (item) => item.pointer.includes("<redacted-key>") && item.reason === "policy-withheld",
      ),
    );
  }
});

test("value redaction is monotonic across compact and expansion", async () => {
  const packet = rocsPacket("nested sk_live_DO_NOT_DISCLOSE\n/home/alice/private");
  const base = request("rocs_owner_packet", packet.source_identity, packet);
  const compact = await runCanary(base);
  const expanded = await runCanary(expansionRequest(base, compact));
  for (const output of [compact, expanded]) {
    const serialized = JSON.stringify(output);
    assert.doesNotMatch(serialized, /DO_NOT_DISCLOSE|\/home\/alice|\\n\/home/u);
    assert.match(serialized, /<redacted-secret>|<home>/u);
  }
});

test("forged P1 policy, generation, compact, and authorized-view joins fail closed", async () => {
  const variants = [
    (x) => {
      x.policy.digest_sha256 = "0".repeat(64);
    },
    (x) => {
      x.compact_projection.plan_generation_digest_sha256 = "1".repeat(64);
    },
    (x) => {
      x.compact_projection.text += "forged";
    },
    (x) => {
      x.structured_owner_plan.rootDir = "forged";
    },
  ];
  for (const mutate of variants) {
    const forged = structuredClone(p1);
    mutate(forged);
    await assert.rejects(
      () => runCanary(request("ts_quality_p1_retention", p1Source, forged)),
      /rejected/u,
    );
  }
});

test("policy digest covers every enforced control and compact cap is exact", async () => {
  assert.equal(CANARY_POLICY_DIGEST, sha(canonical(CANARY_POLICY)));
  assert.equal(CANARY_POLICY.acquisition.process_execution, false);
  assert.equal(CANARY_POLICY.limits.compact_emitted_leaves, 32);
  assert.equal(CANARY_POLICY.pointer_policy.withheld_content_never_expandable, true);
  const result = await compactP1();
  assert.equal(result.represented.length, 32);
  assert.ok(result.omissions.some((item) => item.reason === "compact-leaf-cap"));
});

test("byte, leaf, and depth oversize receipts fail closed", async () => {
  await assert.rejects(
    () => runCanary(request("ts_quality_p1_retention", p1Source, "x".repeat(65 * 1024))),
    /byte cap/u,
  );
  const many = structuredClone(p1);
  many.effects.reads = Array.from({ length: 1_100 }, () => 0);
  await assert.rejects(
    () => runCanary(request("ts_quality_p1_retention", p1Source, many)),
    /leaf cap/u,
  );
  const deep = structuredClone(p1);
  const root = {};
  deep.effects.reads = [root];
  let cursor = root;
  for (let i = 0; i < 40; i++) cursor = cursor.next = {};
  await assert.rejects(
    () => runCanary(request("ts_quality_p1_retention", p1Source, deep)),
    /depth cap/u,
  );
});

test("P1 rejects every degraded mandatory check and policy/compact omission drift", async () => {
  for (const key of Object.keys(p1.checks)) {
    const degraded = structuredClone(p1);
    degraded.checks[key] = false;
    await assert.rejects(
      () => runCanary(request("ts_quality_p1_retention", p1Source, degraded)),
      /mandatory check/u,
    );
  }
  const missing = structuredClone(p1);
  delete missing.checks.views_share_plan_generation;
  await assert.rejects(
    () => runCanary(request("ts_quality_p1_retention", p1Source, missing)),
    /checks shape/u,
  );
  const extra = structuredClone(p1);
  extra.checks.unreviewed = true;
  await assert.rejects(
    () => runCanary(request("ts_quality_p1_retention", p1Source, extra)),
    /checks shape/u,
  );
  for (const mutate of [
    (value) => value.policy.compact_omissions.reverse(),
    (value) => value.compact_projection.omissions.reverse(),
    (value) => (value.compact_projection.recoverable_omissions[0].expansion_pointer = "/wrong"),
  ]) {
    const drifted = structuredClone(p1);
    mutate(drifted);
    await assert.rejects(
      () => runCanary(request("ts_quality_p1_retention", p1Source, drifted)),
      /omission|pointer|equality/u,
    );
  }
});

test("P1 rejects failed posture and nested shape drift", async () => {
  const variants = [
    (value) => (value.pilot.read_only = false),
    (value) => (value.pilot.experimental = false),
    (value) => (value.pilot.compatibility_promise = true),
    (value) => (value.redaction.monotonic = false),
    (value) => (value.effects.classification = "G3-not-observed"),
    (value) => (value.effects.all_observed_reads_within_policy_boundary = false),
    (value) => (value.effects.writes_requested_by_pilot = true),
    (value) => (value.structured_owner_plan.config.extra = true),
    (value) => (value.structured_owner_plan.keep[0].extra = true),
  ];
  for (const mutate of variants) {
    const degraded = structuredClone(p1);
    mutate(degraded);
    await assert.rejects(
      () => runCanary(request("ts_quality_p1_retention", p1Source, degraded)),
      /rejected/u,
    );
  }
});

test("P2 rejects ungranted envelope/task fields and all selected/omission/verification drift", async () => {
  const variants = [
    (value) => (value.structured_authorized_expansion.ungranted = true),
    (value) => (value.structured_authorized_expansion.payload.task.ungranted = true),
    (value) => (value.verification.selected_source_values.title = "modified"),
    (value) =>
      (value.verification.policy_enforcement.selected_fields = [
        ...value.verification.policy_enforcement.selected_fields,
      ].reverse()),
    (value) => (value.verification.policy_enforcement.caller_supplied_grants_accepted = true),
    (value) => (value.verification.redaction.withheld_fields = ["description"]),
    (value) => (value.verification.redaction.withheld_values_emitted = true),
    (value) => (value.compact_projection.compact_omitted_expandable_fields = []),
    (value) => (value.compact_projection.policy_withheld_source_fields = []),
    (value) => (value.compact_projection.expansion.same_generation = false),
    (value) => (value.compact_projection.text += "modified\n"),
  ];
  for (const mutate of variants) {
    const drifted = structuredClone(p2);
    mutate(drifted);
    await assert.rejects(
      () => runCanary(request("agent_kernel_p2_task_projection", p2Source, drifted)),
      /rejected/u,
    );
  }
});

test("P2 rejects degraded envelope and every mandatory check drift", async () => {
  for (const key of Object.keys(p2.checks)) {
    const degraded = structuredClone(p2);
    degraded.checks[key] = key === "mutation_command_requested";
    await assert.rejects(
      () => runCanary(request("agent_kernel_p2_task_projection", p2Source, degraded)),
      /mandatory check/u,
    );
  }
  for (const mutate of [
    (value) => (value.structured_authorized_expansion.ok = false),
    (value) => (value.structured_authorized_expansion.error = { message: "failed" }),
  ]) {
    const failed = structuredClone(p2);
    mutate(failed);
    await assert.rejects(
      () => runCanary(request("agent_kernel_p2_task_projection", p2Source, failed)),
      /owner envelope/u,
    );
  }
});

test("bounded execution provenance distinguishes observed Pi tool invocation from authentication", async () => {
  const tools = [];
  const commands = [];
  extension({
    registerTool(value) {
      tools.push(value);
    },
    registerCommand(name, value) {
      commands.push({ name, value });
    },
  });
  const toolResult = await tools[0].execute(
    "call-1",
    request("ts_quality_p1_retention", p1Source, p1Text),
  );
  const provenance = toolResult.details.execution_provenance;
  assert.equal(
    provenance.extension,
    "@tryinget/pi-agent-interaction-canary/extensions/agent-interaction-canary.ts",
  );
  assert.equal(provenance.tool, TOOL_NAME);
  assert.equal(provenance.command, `/${COMMAND_NAME}`);
  assert.equal(provenance.observed_pi_invocation, "pi_tool");
  assert.equal(provenance.observation_scope, "registered_handler_entry_only");
  assert.equal(provenance.cryptographic_caller_authentication, false);
  assert.equal(provenance.observed_invocation_does_not_authenticate_caller, true);
  assert.equal(
    provenance.owner_identity_interpretation,
    "declared_policy_target_only_not_authenticated_caller",
  );
  const direct = await compactP1();
  assert.equal(
    direct.execution_provenance.observed_pi_invocation,
    "direct_function_not_pi_observed",
  );
  assert.equal(direct.execution_provenance.declared_policy_target, "pi-agent-interaction-canary");
});

test("implementation contains no process execution, PATH, filesystem, cache, evidence, or session-memory surface", async () => {
  const source = await readFile(
    new URL("../extensions/agent-interaction-canary.ts", import.meta.url),
    "utf8",
  );
  assert.doesNotMatch(
    source,
    /node:child_process|execFile|\bspawn\b|\bexec\s*\(|shell\s*:|executable|\bPATH\b|node:fs|readFile|writeFile|appendFile|mkdir|appendEntry|sendMessage|sendUserMessage|sessionManager|cache|evidence\s*:/u,
  );
  assert.match(source, /injected_owner_receipts_only: true/u);
});

test("rejects obsolete P1/P2 schemas, policies, and stale production coordinates", async () => {
  const oldP1 = structuredClone(p1);
  oldP1.pilot.schema_version = 3;
  await assert.rejects(
    () => runCanary(request("ts_quality_p1_retention", p1Source, oldP1)),
    /pilot schema/u,
  );
  const staleP1 = structuredClone(p1);
  staleP1.generation.digest_basis = "raw-plan-before-redaction";
  await assert.rejects(
    () => runCanary(request("ts_quality_p1_retention", p1Source, staleP1)),
    /generation basis/u,
  );
  const oldP2Schema = structuredClone(p2);
  oldP2Schema.pilot.schema_version = 2;
  await assert.rejects(
    () => runCanary(request("agent_kernel_p2_task_projection", p2Source, oldP2Schema)),
    /pilot schema/u,
  );
  const oldP2Policy = structuredClone(p2);
  oldP2Policy.applied_policy.policy_version = 1;
  await assert.rejects(
    () => runCanary(request("agent_kernel_p2_task_projection", p2Source, oldP2Policy)),
    /policy version/u,
  );
  const wrongResource = structuredClone(p2);
  wrongResource.applied_policy.resource = "task:4665";
  await assert.rejects(
    () => runCanary(request("agent_kernel_p2_task_projection", p2Source, wrongResource)),
    /policy resource/u,
  );
});
