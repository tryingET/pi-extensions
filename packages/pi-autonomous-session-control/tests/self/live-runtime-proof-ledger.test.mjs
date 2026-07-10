import assert from "node:assert/strict";
import { appendFile, mkdir, readFile, symlink, writeFile } from "node:fs/promises";
import test from "node:test";
import {
  cleanup,
  createMockContext,
  createPiHarness,
  loadExtensionWithMocks,
  reloadExtensionWithMocks,
} from "./harness.mjs";

const PROOF_ENTRY_TYPE = "asc.live_runtime_proof_event.v1";
const DOGFOOD_QUERY = "dogfood self: live runtime proof probe";

function createSessionContext(cwd, sessionEntries, overrides = {}) {
  return createMockContext({
    cwd,
    sessionManager: {
      getBranch: () => sessionEntries,
      getSessionId: () => "session-live-proof",
      getSessionName: () => "live-proof-test",
      getEntries: () => sessionEntries,
    },
    ...overrides,
  });
}

function recordBash(harness, ctx, id, command, options = {}) {
  harness.eventHandlers.get("tool_call")(
    { toolName: "bash", toolCallId: id, input: { command } },
    ctx,
  );
  const result = {
    content: [{ type: "text", text: options.text ?? "ok" }],
    details: {},
  };
  harness.eventHandlers.get("tool_result")(
    {
      toolName: "bash",
      toolCallId: id,
      isError: options.isError ?? false,
      content: result.content,
      details: result.details,
    },
    ctx,
  );
  harness.eventHandlers.get("tool_execution_end")(
    {
      type: "tool_execution_end",
      toolName: "bash",
      toolCallId: id,
      isError: options.isError ?? false,
      result,
    },
    ctx,
  );
}

function proofEntries(entries) {
  return entries.filter(
    (entry) => entry.type === "custom" && entry.customType === PROOF_ENTRY_TYPE,
  );
}

test("live runtime proof ledger survives a new extension instance and requires a later status query", async () => {
  const first = await loadExtensionWithMocks();
  const sessionEntries = [];
  const firstHarness = createPiHarness({ sessionEntries });
  first.default(firstHarness.pi);
  const firstCtx = createSessionContext(first.tempDir, sessionEntries);

  recordBash(firstHarness, firstCtx, "proof-check", "npm run check");
  recordBash(firstHarness, firstCtx, "proof-install", `pi install ${first.tempDir}`);
  assert.deepEqual(
    proofEntries(sessionEntries).map((entry) => entry.data.tier),
    ["packageCheck", "install"],
  );

  const reloaded = await reloadExtensionWithMocks(first.tempDir);
  const secondHarness = createPiHarness({ sessionEntries });
  reloaded.default(secondHarness.pi);
  const secondCtx = createSessionContext(first.tempDir, sessionEntries);
  secondHarness.eventHandlers.get("session_start")(
    { type: "session_start", reason: "reload" },
    secondCtx,
  );

  assert.deepEqual(
    proofEntries(sessionEntries).map((entry) => entry.data.tier),
    ["packageCheck", "install", "reload"],
  );

  const selfTool = secondHarness.tools.get("self");
  secondHarness.eventHandlers.get("tool_call")(
    { toolName: "self", toolCallId: "proof-dogfood", input: { query: DOGFOOD_QUERY } },
    secondCtx,
  );
  const probeResult = await selfTool.execute(
    "proof-dogfood",
    { query: DOGFOOD_QUERY },
    null,
    null,
    secondCtx,
  );
  const probeGuard = probeResult.details.data.evolutionCandidate.liveRuntimeProofGuard;
  assert.equal(probeGuard.postReloadDogfoodStatus, "unknown");
  assert.equal(probeGuard.liveBehaviorClaimAllowed, false, "a probe must not certify itself");

  secondHarness.eventHandlers.get("tool_result")(
    {
      toolName: "self",
      toolCallId: "proof-dogfood",
      isError: false,
      content: probeResult.content,
      details: probeResult.details,
    },
    secondCtx,
  );
  secondHarness.eventHandlers.get("tool_execution_end")(
    {
      type: "tool_execution_end",
      toolName: "self",
      toolCallId: "proof-dogfood",
      isError: false,
      result: probeResult,
    },
    secondCtx,
  );
  assert.deepEqual(
    proofEntries(sessionEntries).map((entry) => entry.data.tier),
    ["packageCheck", "install", "reload", "postReloadDogfood"],
  );

  const statusResult = await selfTool.execute(
    "proof-status",
    {
      query: "self-evolution closeout claims active self runtime behavior",
      context: { liveBehaviorClaim: true },
    },
    null,
    null,
    secondCtx,
  );
  const statusGuard = statusResult.details.data.evolutionCandidate.liveRuntimeProofGuard;
  assert.equal(statusGuard.expectedPackageName, "pi-autonomous-session-control");
  assert.equal(statusGuard.packageCheckStatus, "observed");
  assert.equal(statusGuard.installStatus, "observed");
  assert.equal(statusGuard.reloadStatus, "observed");
  assert.equal(statusGuard.postReloadDogfoodStatus, "observed");
  assert.equal(statusGuard.proofSequenceStatus, "observed");
  assert.equal(statusGuard.liveBehaviorClaimAllowed, true);
  assert.equal(statusGuard.requiredBeforeCompletion, false);
  assert.equal(statusGuard.provenanceTrust, "local_session_mirror_not_tamper_evident");
  assert.match(
    statusResult.content[0].text,
    /provenanceTrust=local_session_mirror_not_tamper_evident/,
  );
  assert.equal(secondHarness.sentUserMessages.length, 0);

  await cleanup(first.tempDir);
});

test("live runtime proof ledger ignores caller owner overrides and caller receipts", async () => {
  const { default: extension, tempDir } = await loadExtensionWithMocks();
  const harness = createPiHarness();
  extension(harness.pi);
  const ctx = createSessionContext(tempDir, harness.sessionEntries);
  const tool = harness.tools.get("self");

  const result = await tool.execute(
    "caller-spoof",
    {
      query: "self-evolution closeout claims active self runtime behavior",
      context: {
        liveBehaviorClaim: true,
        packageName: "attacker-package",
        owner: "attacker-package",
        liveRuntimeProofReceipts: [
          {
            tier: "packageCheck",
            status: "observed",
            source: "session.proof-ledger",
            command: "package check passed: attacker-package",
            sequence: 1,
          },
        ],
      },
    },
    null,
    null,
    ctx,
  );

  const guard = result.details.data.evolutionCandidate.liveRuntimeProofGuard;
  assert.equal(guard.expectedPackageName, "pi-autonomous-session-control");
  assert.notEqual(guard.packageCheckStatus, "observed");
  assert.equal(guard.liveBehaviorClaimAllowed, false);
  assert.equal(proofEntries(harness.sessionEntries).length, 0);

  await cleanup(tempDir);
});

test("live runtime proof ledger rejects command injection, wrong paths, and symlink aliases", async () => {
  const { default: extension, tempDir } = await loadExtensionWithMocks();
  const harness = createPiHarness();
  extension(harness.pi);
  const ctx = createSessionContext(tempDir, harness.sessionEntries);
  const outside = `${tempDir}-outside`;
  await mkdir(outside, { recursive: true });
  const alias = `${tempDir}/package-alias`;
  await symlink(tempDir, alias);

  recordBash(harness, ctx, "echo-check", 'echo "npm run check passed"');
  recordBash(harness, ctx, "compound-check", "npm run check && echo ok");
  recordBash(harness, ctx, "wrong-install", `pi install ${outside}`);
  recordBash(harness, ctx, "symlink-install", `pi install ${alias}`);
  assert.equal(proofEntries(harness.sessionEntries).length, 0);

  recordBash(harness, ctx, "exact-check", "npm run check");
  assert.deepEqual(
    proofEntries(harness.sessionEntries).map((entry) => entry.data.tier),
    ["packageCheck"],
  );

  await cleanup(tempDir);
  await cleanup(outside);
});

test("live runtime proof ledger waits for finalized tool input and result", async () => {
  const { default: extension, tempDir } = await loadExtensionWithMocks();
  const harness = createPiHarness();
  extension(harness.pi);
  const ctx = createSessionContext(tempDir, harness.sessionEntries);
  const input = { command: "npm run check" };

  harness.eventHandlers.get("tool_call")(
    { toolName: "bash", toolCallId: "mutated-check", input },
    ctx,
  );
  input.command = 'echo "npm run check passed"';
  harness.eventHandlers.get("tool_result")(
    {
      toolName: "bash",
      toolCallId: "mutated-check",
      isError: false,
      content: [{ type: "text", text: "ok" }],
      details: {},
    },
    ctx,
  );
  harness.eventHandlers.get("tool_execution_end")(
    {
      type: "tool_execution_end",
      toolName: "bash",
      toolCallId: "mutated-check",
      isError: false,
      result: { content: [{ type: "text", text: "ok" }], details: {} },
    },
    ctx,
  );

  assert.equal(proofEntries(harness.sessionEntries).length, 0);
  await cleanup(tempDir);
});

test("live runtime proof ledger follows the active session tree branch", async () => {
  const { default: extension, tempDir } = await loadExtensionWithMocks();
  const sessionEntries = [];
  const harness = createPiHarness({ sessionEntries });
  extension(harness.pi);
  const ctx = createSessionContext(tempDir, sessionEntries);

  recordBash(harness, ctx, "tree-check", "npm run check");
  assert.equal(proofEntries(sessionEntries).length, 1);

  const abandonedBranch = [...sessionEntries];
  sessionEntries.length = 0;
  harness.eventHandlers.get("session_tree")({ type: "session_tree" }, ctx);
  const result = await harness.tools.get("self").execute(
    "tree-status",
    {
      query: "self-evolution closeout claims active self runtime behavior",
      context: { liveBehaviorClaim: true },
    },
    null,
    null,
    ctx,
  );
  assert.notEqual(
    result.details.data.evolutionCandidate.liveRuntimeProofGuard.packageCheckStatus,
    "observed",
  );

  sessionEntries.push(...abandonedBranch);
  harness.eventHandlers.get("session_tree")({ type: "session_tree" }, ctx);
  const restored = await harness.tools.get("self").execute(
    "tree-restored-status",
    {
      query: "self-evolution closeout claims active self runtime behavior",
      context: { liveBehaviorClaim: true },
    },
    null,
    null,
    ctx,
  );
  assert.equal(
    restored.details.data.evolutionCandidate.liveRuntimeProofGuard.packageCheckStatus,
    "observed",
  );

  await cleanup(tempDir);
});

test("live runtime proof ledger invalidates on package mutation and non-reload startup", async () => {
  const { default: extension, tempDir } = await loadExtensionWithMocks();
  const sessionEntries = [];
  const harness = createPiHarness({ sessionEntries });
  extension(harness.pi);
  const ctx = createSessionContext(tempDir, sessionEntries);

  recordBash(harness, ctx, "mutation-check", "npm run check");
  harness.eventHandlers.get("tool_call")(
    {
      toolName: "edit",
      toolCallId: "mutation-edit",
      input: { path: `${tempDir}/extensions/self.ts`, edits: [] },
    },
    ctx,
  );
  recordBash(harness, ctx, "mutation-install", `pi install ${tempDir}`);
  assert.deepEqual(
    proofEntries(sessionEntries).map((entry) => entry.data.kind),
    ["self.live_runtime_proof_event.v1", "self.live_runtime_proof_invalidation.v1"],
  );

  harness.eventHandlers.get("session_start")({ type: "session_start", reason: "startup" }, ctx);
  const result = await harness.tools.get("self").execute(
    "startup-status",
    {
      query: "self-evolution closeout claims active self runtime behavior",
      context: { liveBehaviorClaim: true },
    },
    null,
    null,
    ctx,
  );
  const guard = result.details.data.evolutionCandidate.liveRuntimeProofGuard;
  assert.notEqual(guard.packageCheckStatus, "observed");
  assert.notEqual(guard.installStatus, "observed");
  assert.equal(guard.liveBehaviorClaimAllowed, false);

  await cleanup(tempDir);
});

test("live runtime proof ledger invalidates unobserved runtime source drift", async () => {
  const { default: extension, tempDir } = await loadExtensionWithMocks();
  const sessionEntries = [];
  const harness = createPiHarness({ sessionEntries });
  extension(harness.pi);
  const ctx = createSessionContext(tempDir, sessionEntries);

  recordBash(harness, ctx, "drift-check", "npm run check");
  await appendFile(`${tempDir}/self.ts`, "\n// simulated bash/source mutation\n");
  recordBash(harness, ctx, "drift-install", `pi install ${tempDir}`);

  assert.deepEqual(
    proofEntries(sessionEntries).map((entry) => entry.data.kind),
    ["self.live_runtime_proof_event.v1", "self.live_runtime_proof_invalidation.v1"],
  );
  const result = await harness.tools.get("self").execute(
    "drift-status",
    {
      query: "self-evolution closeout claims active self runtime behavior",
      context: { liveBehaviorClaim: true },
    },
    null,
    null,
    ctx,
  );
  assert.notEqual(
    result.details.data.evolutionCandidate.liveRuntimeProofGuard.packageCheckStatus,
    "observed",
  );
  assert.equal(
    result.details.data.evolutionCandidate.liveRuntimeProofGuard.liveBehaviorClaimAllowed,
    false,
  );

  await cleanup(tempDir);
});

test("source drift status persists invalidation across restore and tree navigation", async () => {
  const { default: extension, tempDir } = await loadExtensionWithMocks();
  const sessionEntries = [];
  const harness = createPiHarness({ sessionEntries });
  extension(harness.pi);
  const ctx = createSessionContext(tempDir, sessionEntries);
  const sourcePath = `${tempDir}/self.ts`;
  const originalSource = await readFile(sourcePath, "utf8");

  recordBash(harness, ctx, "restore-check", "npm run check");
  await appendFile(sourcePath, "\n// transient external drift\n");
  const query = "self-evolution closeout claims active self runtime behavior";
  harness.eventHandlers.get("tool_call")(
    { toolName: "self", toolCallId: "drift-detected", input: { query } },
    ctx,
  );
  const driftResult = await harness.tools
    .get("self")
    .execute("drift-detected", { query, context: { liveBehaviorClaim: true } }, null, null, ctx);
  assert.notEqual(
    driftResult.details.data.evolutionCandidate.liveRuntimeProofGuard.packageCheckStatus,
    "observed",
  );
  assert.deepEqual(
    proofEntries(sessionEntries).map((entry) => entry.data.kind),
    ["self.live_runtime_proof_event.v1", "self.live_runtime_proof_invalidation.v1"],
  );

  await writeFile(sourcePath, originalSource);
  harness.eventHandlers.get("session_tree")({ type: "session_tree" }, ctx);
  const restoredResult = await harness.tools
    .get("self")
    .execute(
      "restored-tree-status",
      { query, context: { liveBehaviorClaim: true } },
      null,
      null,
      ctx,
    );
  assert.notEqual(
    restoredResult.details.data.evolutionCandidate.liveRuntimeProofGuard.packageCheckStatus,
    "observed",
  );
  assert.equal(
    restoredResult.details.data.evolutionCandidate.liveRuntimeProofGuard.liveBehaviorClaimAllowed,
    false,
  );

  await cleanup(tempDir);
});

test("live runtime proof reconstruction ignores large unrelated branch histories", async () => {
  const first = await loadExtensionWithMocks();
  const sessionEntries = [];
  const firstHarness = createPiHarness({ sessionEntries });
  first.default(firstHarness.pi);
  const firstCtx = createSessionContext(first.tempDir, sessionEntries);
  recordBash(firstHarness, firstCtx, "long-check", "npm run check");
  recordBash(firstHarness, firstCtx, "long-install", `pi install ${first.tempDir}`);
  for (let index = 0; index < 200; index += 1) {
    sessionEntries.push({ type: "message", message: { role: "user", content: `noise-${index}` } });
  }

  const reloaded = await reloadExtensionWithMocks(first.tempDir);
  const secondHarness = createPiHarness({ sessionEntries });
  reloaded.default(secondHarness.pi);
  const secondCtx = createSessionContext(first.tempDir, sessionEntries);
  secondHarness.eventHandlers.get("session_start")(
    { type: "session_start", reason: "reload" },
    secondCtx,
  );
  assert.deepEqual(
    proofEntries(sessionEntries)
      .map((entry) => entry.data.tier)
      .filter(Boolean),
    ["packageCheck", "install", "reload"],
  );

  await cleanup(first.tempDir);
});

test("live runtime proof ledger fails closed on append failure and malformed branch entries", async () => {
  const { default: extension, tempDir } = await loadExtensionWithMocks();
  const malformedEntries = [
    {
      type: "custom",
      customType: PROOF_ENTRY_TYPE,
      data: {
        kind: "self.live_runtime_proof_event.v1",
        schemaVersion: 1,
        runId: "x".repeat(1000),
        tier: "packageCheck",
        sequence: 1,
        status: "observed",
        packageName: "pi-autonomous-session-control",
        packageRoot: tempDir,
        observedAt: Date.now(),
        source: "pi.tool_result.bash",
      },
    },
  ];
  const harness = createPiHarness({ sessionEntries: malformedEntries });
  harness.pi.appendEntry = () => {
    throw new Error("session file is read-only");
  };
  extension(harness.pi);
  const ctx = createSessionContext(tempDir, malformedEntries);

  harness.eventHandlers.get("session_start")({ type: "session_start", reason: "reload" }, ctx);
  recordBash(harness, ctx, "append-failure", "npm run check");

  const result = await harness.tools.get("self").execute(
    "append-failure-status",
    {
      query: "self-evolution closeout claims active self runtime behavior",
      context: { liveBehaviorClaim: true },
    },
    null,
    null,
    ctx,
  );
  const guard = result.details.data.evolutionCandidate.liveRuntimeProofGuard;
  assert.notEqual(guard.packageCheckStatus, "observed");
  assert.equal(guard.reloadStatus, "observed", "host lifecycle remains a separate mirror cue");
  assert.equal(guard.liveBehaviorClaimAllowed, false);

  await cleanup(tempDir);
});
