import assert from "node:assert/strict";
import test from "node:test";
import { cleanup, createMockContext, createPiHarness, loadExtensionWithMocks } from "./harness.mjs";

function recordBash(harness, id, command, options = {}) {
  const toolCallHandler = harness.eventHandlers.get("tool_call");
  const toolResultHandler = harness.eventHandlers.get("tool_result");
  toolCallHandler({ toolName: "bash", toolCallId: id, input: { command } });
  toolResultHandler({
    toolName: "bash",
    toolCallId: id,
    isError: options.isError ?? false,
    content: [{ type: "text", text: options.text ?? "ok" }],
  });
}

test("self query: live runtime proof guard rejects package-check-only active behavior claims", async () => {
  const { default: extension, tempDir } = await loadExtensionWithMocks();
  const harness = createPiHarness();

  extension(harness.pi);

  const tool = harness.tools.get("self");
  const ctx = createMockContext();

  recordBash(
    harness,
    "cmd-live-proof-package-check",
    "cd packages/pi-autonomous-session-control && npm run check",
  );

  const result = await tool.execute(
    "tc-live-runtime-proof-package-check-only",
    {
      query: "self-evolution closeout claims active self runtime behavior is proven",
      context: {
        liveBehaviorClaim: true,
        packageCheckStatus: "observed",
        packageCheck: "package check passed",
      },
    },
    null,
    null,
    ctx,
  );

  const guard = result.details.data.evolutionCandidate.liveRuntimeProofGuard;
  assert.equal(guard.kind, "self.live_runtime_proof_guard.v1");
  assert.equal(guard.packageCheckStatus, "observed");
  assert.equal(guard.installStatus, "unknown");
  assert.equal(guard.reloadStatus, "unknown");
  assert.equal(guard.postReloadDogfoodStatus, "unknown");
  assert.equal(guard.liveBehaviorClaimAllowed, false);
  assert.equal(guard.requiredBeforeCompletion, true);
  assert.deepEqual(guard.missingTiers, ["install", "reload", "postReloadDogfood"]);
  assert.match(guard.nextAction, /install the package into Pi/);
  assert.match(result.content[0].text, /Live runtime proof guard/);
  assert.match(result.content[0].text, /liveBehaviorClaimAllowed=false/);
  assert.equal(harness.sentUserMessages.length, 0, "guard must not send hidden messages");

  await cleanup(tempDir);
});

test("self query: live runtime proof guard rejects install-only proof without reload dogfood", async () => {
  const { default: extension, tempDir } = await loadExtensionWithMocks();
  const harness = createPiHarness();

  extension(harness.pi);

  const tool = harness.tools.get("self");
  const ctx = createMockContext();

  recordBash(
    harness,
    "cmd-live-proof-install",
    "pi install /home/tryinget/ai-society/softwareco/owned/pi-extensions/packages/pi-autonomous-session-control",
  );

  const result = await tool.execute(
    "tc-live-runtime-proof-install-only",
    {
      query: "self-evolution closeout claims live behavior after install",
      context: {
        liveBehaviorClaim: true,
        installStatus: "observed",
        piInstall: "pi install completed",
      },
    },
    null,
    null,
    ctx,
  );

  const guard = result.details.data.evolutionCandidate.liveRuntimeProofGuard;
  assert.equal(guard.installStatus, "observed");
  assert.equal(guard.packageCheckStatus, "unknown");
  assert.equal(guard.reloadStatus, "unknown");
  assert.equal(guard.postReloadDogfoodStatus, "unknown");
  assert.equal(guard.liveBehaviorClaimAllowed, false);
  assert.equal(guard.requiredBeforeCompletion, true);
  assert.ok(guard.missingTiers.includes("reload"));
  assert.ok(guard.missingTiers.includes("postReloadDogfood"));
  assert.equal(harness.sentUserMessages.length, 0, "guard remains mirror-only");

  await cleanup(tempDir);
});

test("self query: live runtime proof guard rejects reload-only proof without post-reload self dogfood", async () => {
  const { default: extension, tempDir } = await loadExtensionWithMocks();
  const harness = createPiHarness();

  extension(harness.pi);

  const tool = harness.tools.get("self");
  const ctx = createMockContext();

  const result = await tool.execute(
    "tc-live-runtime-proof-reload-only",
    {
      query: "self-evolution closeout claims active runtime behavior after reload",
      context: {
        liveBehaviorClaim: true,
        reloadStatus: "observed",
        reloadSignal: "/reload completed",
        reloadCommand: "operator /reload receipt",
      },
    },
    null,
    null,
    ctx,
  );

  const guard = result.details.data.evolutionCandidate.liveRuntimeProofGuard;
  assert.equal(guard.reloadStatus, "observed");
  assert.equal(guard.postReloadDogfoodStatus, "unknown");
  assert.equal(guard.liveBehaviorClaimAllowed, false);
  assert.equal(guard.requiredBeforeCompletion, true);
  assert.match(guard.nextAction, /package check|install|reload|dogfood/);
  assert.equal(harness.sentUserMessages.length, 0, "guard remains mirror-only");

  await cleanup(tempDir);
});

test("self query: live runtime proof guard accepts slash reload receipt text", async () => {
  const { default: extension, tempDir } = await loadExtensionWithMocks();
  const harness = createPiHarness();

  extension(harness.pi);

  const tool = harness.tools.get("self");
  const ctx = createMockContext();

  const result = await tool.execute(
    "tc-live-runtime-proof-slash-reload-receipt",
    {
      query: "self-evolution closeout claims active runtime behavior after reload",
      context: {
        liveBehaviorClaim: true,
        reloadStatus: "observed",
        reloadSignal: "/reload completed",
        reloadCommand: "/reload completed",
      },
    },
    null,
    null,
    ctx,
  );

  const guard = result.details.data.evolutionCandidate.liveRuntimeProofGuard;
  assert.equal(guard.reloadStatus, "observed");
  assert.equal(guard.liveBehaviorClaimAllowed, false);
  assert.equal(guard.requiredBeforeCompletion, true);
  assert.equal(harness.sentUserMessages.length, 0, "slash reload receipt remains mirror-only");

  await cleanup(tempDir);
});

test("self query: live runtime proof guard uses host reload lifecycle as reload-tier evidence only", async () => {
  const { default: extension, tempDir } = await loadExtensionWithMocks();
  const harness = createPiHarness();

  extension(harness.pi);

  const sessionStartHandler = harness.eventHandlers.get("session_start");
  sessionStartHandler({ type: "session_start", reason: "reload" });

  const tool = harness.tools.get("self");
  const ctx = createMockContext();

  const result = await tool.execute(
    "tc-live-runtime-proof-lifecycle-reload",
    {
      query: "self-evolution closeout claims active runtime behavior after reload",
      context: {
        liveBehaviorClaim: true,
      },
    },
    null,
    null,
    ctx,
  );

  const guard = result.details.data.evolutionCandidate.liveRuntimeProofGuard;
  assert.equal(guard.reloadStatus, "observed");
  assert.equal(guard.packageCheckStatus, "unknown");
  assert.equal(guard.installStatus, "unknown");
  assert.equal(guard.postReloadDogfoodStatus, "unknown");
  assert.equal(guard.liveBehaviorClaimAllowed, false);
  assert.equal(guard.requiredBeforeCompletion, true);
  assert.ok(guard.missingTiers.includes("packageCheck"));
  assert.ok(
    guard.tiers.reload.provenance.some((entry) => /session_start reason=reload/.test(entry)),
  );
  assert.match(result.content[0].text, /reloadStatus=observed/);
  assert.equal(harness.sentUserMessages.length, 0, "lifecycle proof remains mirror-only");

  await cleanup(tempDir);
});

test("self query: live runtime proof guard ignores non-reload lifecycle starts", async () => {
  const { default: extension, tempDir } = await loadExtensionWithMocks();
  const harness = createPiHarness();

  extension(harness.pi);

  const sessionStartHandler = harness.eventHandlers.get("session_start");
  sessionStartHandler({ type: "session_start", reason: "startup" });

  const tool = harness.tools.get("self");
  const ctx = createMockContext();

  const result = await tool.execute(
    "tc-live-runtime-proof-lifecycle-startup",
    {
      query: "self-evolution closeout claims active runtime behavior after reload",
      context: {
        liveBehaviorClaim: true,
      },
    },
    null,
    null,
    ctx,
  );

  const guard = result.details.data.evolutionCandidate.liveRuntimeProofGuard;
  assert.equal(guard.reloadStatus, "unknown");
  assert.equal(guard.liveBehaviorClaimAllowed, false);
  assert.equal(guard.requiredBeforeCompletion, true);
  assert.equal(harness.sentUserMessages.length, 0, "startup lifecycle proof remains mirror-only");

  await cleanup(tempDir);
});

test("self query: live runtime proof guard keeps mixed lifecycle and caller sequence ordering unresolved", async () => {
  const { default: extension, tempDir } = await loadExtensionWithMocks();
  const harness = createPiHarness();

  extension(harness.pi);

  const sessionStartHandler = harness.eventHandlers.get("session_start");
  sessionStartHandler({ type: "session_start", reason: "reload" });

  const tool = harness.tools.get("self");
  const ctx = createMockContext();

  const result = await tool.execute(
    "tc-live-runtime-proof-lifecycle-mixed-order",
    {
      query: "self-evolution closeout claims active self runtime behavior after reload dogfood",
      context: {
        liveBehaviorClaim: true,
        packageName: "pi-autonomous-session-control",
        packageCheckStatus: "observed",
        packageCheck: "package check passed",
        packageCheckCommand: {
          command: "cd packages/pi-autonomous-session-control && npm run check",
          packageName: "pi-autonomous-session-control",
          sequence: 1,
        },
        installStatus: "observed",
        piInstall: "pi install completed",
        installCommand: {
          command:
            "pi install /home/tryinget/ai-society/softwareco/owned/pi-extensions/packages/pi-autonomous-session-control",
          packageName: "pi-autonomous-session-control",
          sequence: 2,
        },
        postReloadDogfoodStatus: "observed",
        postReloadDogfood: "post-reload self dogfood passed",
        postReloadDogfoodCommand: {
          command: 'post-reload dogfood query: self({ query: "self-evolution" })',
          packageName: "pi-autonomous-session-control",
          sequence: 4,
        },
      },
    },
    null,
    null,
    ctx,
  );

  const guard = result.details.data.evolutionCandidate.liveRuntimeProofGuard;
  assert.equal(guard.reloadStatus, "observed");
  assert.deepEqual(guard.missingTiers, []);
  assert.equal(guard.proofSequenceStatus, "unknown");
  assert.match(guard.proofSequenceReason, /mixed order-token domains/);
  assert.equal(guard.liveBehaviorClaimAllowed, false);
  assert.equal(guard.requiredBeforeCompletion, true);
  assert.equal(harness.sentUserMessages.length, 0, "mixed ordering remains mirror-only");

  await cleanup(tempDir);
});

test("self query: live runtime proof guard does not pair lifecycle observation with caller sequence", async () => {
  const { default: extension, tempDir } = await loadExtensionWithMocks();
  const harness = createPiHarness();

  extension(harness.pi);

  const sessionStartHandler = harness.eventHandlers.get("session_start");
  sessionStartHandler({ type: "session_start", reason: "reload" });

  const tool = harness.tools.get("self");
  const ctx = createMockContext();

  const result = await tool.execute(
    "tc-live-runtime-proof-lifecycle-caller-sequence",
    {
      query: "self-evolution closeout claims active self runtime behavior after reload dogfood",
      context: {
        liveBehaviorClaim: true,
        packageName: "pi-autonomous-session-control",
        packageCheckStatus: "observed",
        packageCheck: "package check passed",
        packageCheckCommand: {
          command: "cd packages/pi-autonomous-session-control && npm run check",
          packageName: "pi-autonomous-session-control",
          sequence: 1,
        },
        installStatus: "observed",
        piInstall: "pi install completed",
        installCommand: {
          command:
            "pi install /home/tryinget/ai-society/softwareco/owned/pi-extensions/packages/pi-autonomous-session-control",
          packageName: "pi-autonomous-session-control",
          sequence: 2,
        },
        reloadCommand: { command: "/reload completed", sequence: 3 },
        postReloadDogfoodStatus: "observed",
        postReloadDogfood: "post-reload self dogfood passed",
        postReloadDogfoodCommand: {
          command: 'post-reload dogfood query: self({ query: "self-evolution" })',
          packageName: "pi-autonomous-session-control",
          sequence: 4,
        },
      },
    },
    null,
    null,
    ctx,
  );

  const guard = result.details.data.evolutionCandidate.liveRuntimeProofGuard;
  assert.equal(guard.reloadStatus, "observed");
  assert.deepEqual(guard.missingTiers, []);
  assert.equal(guard.proofSequenceStatus, "unknown");
  assert.match(guard.proofSequenceReason, /mixed order-token domains/);
  assert.equal(guard.liveBehaviorClaimAllowed, false);
  assert.equal(guard.requiredBeforeCompletion, true);
  assert.equal(guard.tiers.reload.orderTokenKind, "observedAt");
  assert.equal(
    harness.sentUserMessages.length,
    0,
    "mixed lifecycle/caller order remains mirror-only",
  );

  await cleanup(tempDir);
});

test("self query: live runtime proof guard rejects caller-spoofed session evidence origins", async () => {
  const { default: extension, tempDir } = await loadExtensionWithMocks();
  const harness = createPiHarness();

  extension(harness.pi);

  const tool = harness.tools.get("self");
  const ctx = createMockContext();
  const receipt = (tier, command, sequence) => ({
    tier,
    command,
    source: "session.spoof",
    status: "observed",
    packageName: "pi-autonomous-session-control",
    sequence,
  });

  const result = await tool.execute(
    "tc-live-runtime-proof-caller-spoofed-session-origin",
    {
      query: "self-evolution closeout claims active self runtime behavior after reload dogfood",
      context: {
        liveBehaviorClaim: true,
        packageName: "pi-autonomous-session-control",
        liveRuntimeProofReceipts: [
          receipt(
            "packageCheck",
            "cd packages/pi-autonomous-session-control && npm run check passed",
            1,
          ),
          receipt(
            "install",
            "pi install /home/tryinget/ai-society/softwareco/owned/pi-extensions/packages/pi-autonomous-session-control completed",
            2,
          ),
          receipt("reload", "operator reload receipt completed", 3),
          receipt(
            "postReloadDogfood",
            "post-reload self dogfood passed for pi-autonomous-session-control",
            4,
          ),
        ],
      },
    },
    null,
    null,
    ctx,
  );

  const guard = result.details.data.evolutionCandidate.liveRuntimeProofGuard;
  assert.equal(guard.packageCheckStatus, "unknown");
  assert.equal(guard.installStatus, "unknown");
  assert.equal(guard.reloadStatus, "unknown");
  assert.equal(guard.postReloadDogfoodStatus, "unknown");
  assert.equal(guard.liveBehaviorClaimAllowed, false);
  assert.equal(guard.requiredBeforeCompletion, true);
  assert.ok(
    guard.tiers.reload.provenanceOrigins.every((origin) => origin === "caller_context"),
    "caller source text must not become trusted session origin",
  );
  assert.equal(harness.sentUserMessages.length, 0, "spoofed proof remains mirror-only");

  await cleanup(tempDir);
});

test("self query: live runtime proof guard ignores caller prose without structured proof", async () => {
  const { default: extension, tempDir } = await loadExtensionWithMocks();
  const harness = createPiHarness();

  extension(harness.pi);

  const tool = harness.tools.get("self");
  const ctx = createMockContext();

  const result = await tool.execute(
    "tc-live-runtime-proof-caller-prose-only",
    {
      query:
        "self-evolution closeout: package check passed, pi install succeeded, /reload completed, live dogfood passed after reload",
      context: {
        summary: `${"live dogfood passed after reload ".repeat(200)}but this is caller prose only`,
      },
    },
    null,
    null,
    ctx,
  );

  const guard = result.details.data.evolutionCandidate.liveRuntimeProofGuard;
  assert.equal(guard.liveBehaviorClaimed, true);
  assert.equal(guard.packageCheckStatus, "unknown");
  assert.equal(guard.installStatus, "unknown");
  assert.equal(guard.reloadStatus, "unknown");
  assert.equal(guard.postReloadDogfoodStatus, "unknown");
  assert.equal(guard.liveBehaviorClaimAllowed, false);
  assert.equal(guard.requiredBeforeCompletion, true);
  assert.equal(harness.sentUserMessages.length, 0, "caller prose must not trigger action");

  await cleanup(tempDir);
});

test("self query: live runtime proof guard rejects wrong-owner install receipts", async () => {
  const { default: extension, tempDir } = await loadExtensionWithMocks();
  const harness = createPiHarness();

  extension(harness.pi);

  const tool = harness.tools.get("self");
  const ctx = createMockContext();

  const result = await tool.execute(
    "tc-live-runtime-proof-wrong-owner-install",
    {
      query: "self-evolution closeout claims active self runtime behavior after reload dogfood",
      context: {
        liveBehaviorClaim: true,
        packageName: "pi-autonomous-session-control",
        packageCheckStatus: "observed",
        packageCheck: "package check passed",
        packageCheckCommand: {
          command: "cd packages/pi-autonomous-session-control && npm run check",
          packageName: "pi-autonomous-session-control",
          sequence: 1,
        },
        installStatus: "observed",
        piInstall: "pi install completed",
        installCommand: { command: "pi install /tmp/other-package", sequence: 2 },
        reloadStatus: "observed",
        reloadSignal: "/reload completed",
        reloadCommand: { command: "operator /reload receipt", sequence: 3 },
        postReloadDogfoodStatus: "observed",
        postReloadDogfood: "post-reload self dogfood passed",
        postReloadDogfoodCommand: {
          command: 'post-reload dogfood query: self({ query: "self-evolution" })',
          packageName: "pi-autonomous-session-control",
          sequence: 4,
        },
      },
    },
    null,
    null,
    ctx,
  );

  const guard = result.details.data.evolutionCandidate.liveRuntimeProofGuard;
  assert.equal(guard.installStatus, "failed");
  assert.equal(guard.liveBehaviorClaimAllowed, false);
  assert.equal(guard.requiredBeforeCompletion, true);
  assert.deepEqual(guard.ownerBindingFailures, ["install"]);
  assert.match(guard.nextAction, /owning package/);
  assert.match(result.content[0].text, /ownerBindingFailures=1/);
  assert.equal(harness.sentUserMessages.length, 0, "wrong-owner proof remains mirror-only");

  await cleanup(tempDir);
});

test("self query: live runtime proof guard rejects unordered dogfood proof", async () => {
  const { default: extension, tempDir } = await loadExtensionWithMocks();
  const harness = createPiHarness();

  extension(harness.pi);

  const tool = harness.tools.get("self");
  const ctx = createMockContext();

  const result = await tool.execute(
    "tc-live-runtime-proof-unordered-dogfood",
    {
      query: "self-evolution closeout claims active self runtime behavior after reload dogfood",
      context: {
        liveBehaviorClaim: true,
        packageName: "pi-autonomous-session-control",
        packageCheckStatus: "observed",
        packageCheck: "package check passed",
        packageCheckCommand: {
          command: "cd packages/pi-autonomous-session-control && npm run check",
          packageName: "pi-autonomous-session-control",
          sequence: 1,
        },
        installStatus: "observed",
        piInstall: "pi install completed",
        installCommand: {
          command:
            "pi install /home/tryinget/ai-society/softwareco/owned/pi-extensions/packages/pi-autonomous-session-control",
          packageName: "pi-autonomous-session-control",
          sequence: 2,
        },
        reloadStatus: "observed",
        reloadSignal: "/reload completed",
        reloadCommand: { command: "operator /reload receipt", sequence: 4 },
        postReloadDogfoodStatus: "observed",
        postReloadDogfood: "post-reload self dogfood passed",
        postReloadDogfoodCommand: {
          command: 'post-reload dogfood query: self({ query: "self-evolution" })',
          packageName: "pi-autonomous-session-control",
          sequence: 3,
        },
      },
    },
    null,
    null,
    ctx,
  );

  const guard = result.details.data.evolutionCandidate.liveRuntimeProofGuard;
  assert.equal(guard.proofSequenceStatus, "failed");
  assert.equal(guard.liveBehaviorClaimAllowed, false);
  assert.equal(guard.requiredBeforeCompletion, true);
  assert.match(guard.proofSequenceReason, /reload must be observed before postReloadDogfood/);
  assert.match(guard.nextAction, /ordered proof receipts/);
  assert.match(result.content[0].text, /proofSequenceStatus=failed/);
  assert.equal(harness.sentUserMessages.length, 0, "unordered proof remains mirror-only");

  await cleanup(tempDir);
});

test("self query: live runtime proof guard detects active claims in objective context", async () => {
  const { default: extension, tempDir } = await loadExtensionWithMocks();
  const harness = createPiHarness();

  extension(harness.pi);

  const tool = harness.tools.get("self");
  const ctx = createMockContext();

  const result = await tool.execute(
    "tc-live-runtime-proof-objective-claim",
    {
      query: "self-evolution",
      context: {
        objective: "claim active self runtime behavior after reload",
      },
    },
    null,
    null,
    ctx,
  );

  const guard = result.details.data.evolutionCandidate.liveRuntimeProofGuard;
  assert.equal(guard.liveBehaviorClaimed, true);
  assert.equal(guard.liveBehaviorClaimAllowed, false);
  assert.equal(guard.requiredBeforeCompletion, true);
  assert.equal(harness.sentUserMessages.length, 0, "objective claim remains mirror-only");

  await cleanup(tempDir);
});

test("self query: live runtime proof guard allows active behavior claim only with all ordered owner-bound tiers", async () => {
  const { default: extension, tempDir } = await loadExtensionWithMocks();
  const harness = createPiHarness();

  extension(harness.pi);

  const tool = harness.tools.get("self");
  const ctx = createMockContext();

  recordBash(
    harness,
    "cmd-live-proof-package-check-ok",
    "cd packages/pi-autonomous-session-control && npm run check",
  );
  recordBash(
    harness,
    "cmd-live-proof-install-ok",
    "pi install /home/tryinget/ai-society/softwareco/owned/pi-extensions/packages/pi-autonomous-session-control",
  );

  const result = await tool.execute(
    "tc-live-runtime-proof-positive",
    {
      query: "self-evolution closeout claims active self runtime behavior after reload dogfood",
      context: {
        liveBehaviorClaim: true,
        packageName: "pi-autonomous-session-control",
        packageCheckStatus: "observed",
        packageCheck: "package check passed",
        packageCheckCommand: {
          command: "cd packages/pi-autonomous-session-control && npm run check",
          packageName: "pi-autonomous-session-control",
          sequence: 1,
        },
        installStatus: "observed",
        piInstall: "pi install completed",
        installCommand: {
          command:
            "pi install /home/tryinget/ai-society/softwareco/owned/pi-extensions/packages/pi-autonomous-session-control",
          packageName: "pi-autonomous-session-control",
          sequence: 2,
        },
        reloadStatus: "observed",
        reloadSignal: "/reload completed",
        reloadCommand: { command: "operator /reload receipt", sequence: 3 },
        postReloadDogfoodStatus: "observed",
        postReloadDogfood: "post-reload self dogfood passed",
        postReloadDogfoodCommand: {
          command: 'post-reload dogfood query: self({ query: "self-evolution" })',
          packageName: "pi-autonomous-session-control",
          sequence: 4,
        },
      },
    },
    null,
    null,
    ctx,
  );

  const guard = result.details.data.evolutionCandidate.liveRuntimeProofGuard;
  assert.equal(guard.packageCheckStatus, "observed");
  assert.equal(guard.installStatus, "observed");
  assert.equal(guard.reloadStatus, "observed");
  assert.equal(guard.postReloadDogfoodStatus, "observed");
  assert.deepEqual(guard.missingTiers, []);
  assert.equal(guard.liveBehaviorClaimAllowed, true);
  assert.equal(guard.requiredBeforeCompletion, false);
  assert.match(
    guard.nextAction,
    /cite ordered package-check, install, reload, and post-reload self dogfood/,
  );
  assert.match(result.content[0].text, /proofSequenceStatus=observed/);
  assert.match(result.content[0].text, /ownerBindingFailures=0/);
  assert.match(result.content[0].text, /liveBehaviorClaimAllowed=true/);
  assert.equal(harness.sentUserMessages.length, 0, "positive proof remains mirror-only");

  await cleanup(tempDir);
});
