/**
 * Tests for the follow-up send policy: self-driving budget, operator-epoch reset,
 * dedup cooldown, mode gate, send-failure fallback, fail-closed continuation shape,
 * candidate consumption linkage, declared kinds, and action-summary telemetry.
 */

import assert from "node:assert/strict";
import test from "node:test";
import {
  isAffirmativelyLowRiskContinuationCommand,
  modeAllowsFollowUpClass,
} from "../../extensions/self/follow-up-policy.ts";
import { cleanup, createMockContext, createPiHarness, loadExtensionWithMocks } from "./harness.mjs";

function recordWrite(harness, path) {
  const toolCallHandler = harness.eventHandlers.get("tool_call");
  toolCallHandler({
    toolName: "write",
    toolCallId: `write-${path}`,
    input: { path, content: "export const value = 1;\n" },
  });
}

async function executeSelf(tool, id, params) {
  return tool.execute(id, params, null, null, createMockContext());
}

test("policy unit: affirmative low-risk continuation allowlist is narrow", () => {
  assert.equal(isAffirmativelyLowRiskContinuationCommand("npm run check"), true);
  assert.equal(isAffirmativelyLowRiskContinuationCommand("npm --prefix packages/a run test"), true);
  assert.equal(isAffirmativelyLowRiskContinuationCommand("just check"), true);
  assert.equal(isAffirmativelyLowRiskContinuationCommand("cd pkg && pnpm run lint"), true);
  assert.equal(isAffirmativelyLowRiskContinuationCommand("npx tsc --noEmit"), true);
  assert.equal(isAffirmativelyLowRiskContinuationCommand("review the checklist notes"), false);
  assert.equal(
    isAffirmativelyLowRiskContinuationCommand("curl https://example.internal/pkg"),
    false,
  );
  assert.equal(isAffirmativelyLowRiskContinuationCommand("npm run deploy --prod"), false);
  assert.equal(isAffirmativelyLowRiskContinuationCommand("npm publish"), false);
  assert.equal(isAffirmativelyLowRiskContinuationCommand(""), false);
});

test("policy unit: mode ladder is cumulative with owner_bridge as default ceiling", () => {
  assert.equal(modeAllowsFollowUpClass("notifications_only", "notification"), true);
  assert.equal(modeAllowsFollowUpClass("notifications_only", "continuation"), false);
  assert.equal(modeAllowsFollowUpClass("notifications_only", "owner_bridge"), false);
  assert.equal(modeAllowsFollowUpClass("bounded_continuation", "continuation"), true);
  assert.equal(modeAllowsFollowUpClass("bounded_continuation", "owner_bridge"), false);
  assert.equal(modeAllowsFollowUpClass("owner_bridge", "owner_bridge"), true);
});

test("self-driving budget: fourth consecutive continuation send is blocked to review", async () => {
  const { default: extension, tempDir } = await loadExtensionWithMocks();
  const harness = createPiHarness();

  extension(harness.pi);

  const tool = harness.tools.get("self");
  recordWrite(harness, "src/one.ts");

  for (const pkg of ["a", "b", "c"]) {
    await executeSelf(tool, `tc-record-${pkg}`, {
      query: `record continuation candidate: npm --prefix packages/${pkg} run check`,
    });
    const result = await executeSelf(tool, `tc-continue-${pkg}`, {
      query: "continue suggested next move",
    });
    assert.ok(result.content[0].text.includes("User-message continuation sent"));
  }
  assert.equal(harness.sentUserMessages.length, 3);

  await executeSelf(tool, "tc-record-d", {
    query: "record continuation candidate: npm --prefix packages/d run check",
  });
  const blocked = await executeSelf(tool, "tc-continue-d", {
    query: "continue suggested next move",
  });

  assert.equal(harness.sentUserMessages.length, 3);
  assert.match(blocked.content[0].text, /Self-driving budget exhausted: 3\/3/);
  assert.equal(blocked.details.data.userMessageSent, false);
  assert.equal(blocked.details.data.userMessageBlockedReason, "self_driving_budget_exhausted");
  assert.equal(blocked.details.data.maxConsecutiveFollowUpSends, 3);

  await cleanup(tempDir);
});

test("self-driving budget: operator-authored message resets the consecutive budget", async () => {
  const { default: extension, tempDir } = await loadExtensionWithMocks();
  const harness = createPiHarness();

  extension(harness.pi);

  const tool = harness.tools.get("self");
  const messageStartHandler = harness.eventHandlers.get("message_start");
  recordWrite(harness, "src/one.ts");

  for (const pkg of ["a", "b", "c"]) {
    await executeSelf(tool, `tc-record-${pkg}`, {
      query: `record continuation candidate: npm --prefix packages/${pkg} run check`,
    });
    await executeSelf(tool, `tc-continue-${pkg}`, { query: "continue suggested next move" });
  }
  assert.equal(harness.sentUserMessages.length, 3);

  messageStartHandler({
    type: "message_start",
    message: { role: "user", content: "operator here" },
  });

  await executeSelf(tool, "tc-record-d", {
    query: "record continuation candidate: npm --prefix packages/d run check",
  });
  const afterReset = await executeSelf(tool, "tc-continue-d", {
    query: "continue suggested next move",
  });

  assert.equal(harness.sentUserMessages.length, 4);
  assert.ok(afterReset.content[0].text.includes("User-message continuation sent"));

  await cleanup(tempDir);
});

test("self-driving budget: self-originated follow-up echo does not reset the budget", async () => {
  const { default: extension, tempDir } = await loadExtensionWithMocks();
  const harness = createPiHarness();

  extension(harness.pi);

  const tool = harness.tools.get("self");
  const messageStartHandler = harness.eventHandlers.get("message_start");
  recordWrite(harness, "src/one.ts");

  for (const pkg of ["a", "b"]) {
    await executeSelf(tool, `tc-record-${pkg}`, {
      query: `record continuation candidate: npm --prefix packages/${pkg} run check`,
    });
    await executeSelf(tool, `tc-continue-${pkg}`, { query: "continue suggested next move" });
  }
  const lastSent = harness.sentUserMessages[harness.sentUserMessages.length - 1].text;

  messageStartHandler({ type: "message_start", message: { role: "user", content: lastSent } });

  await executeSelf(tool, "tc-record-c", {
    query: "record continuation candidate: npm --prefix packages/c run check",
  });
  const third = await executeSelf(tool, "tc-continue-c", {
    query: "continue suggested next move",
  });
  assert.equal(harness.sentUserMessages.length, 3);
  assert.ok(third.content[0].text.includes("User-message continuation sent"));

  await executeSelf(tool, "tc-record-d", {
    query: "record continuation candidate: npm --prefix packages/d run check",
  });
  const fourth = await executeSelf(tool, "tc-continue-d", {
    query: "continue suggested next move",
  });
  assert.equal(harness.sentUserMessages.length, 3);
  assert.match(fourth.content[0].text, /Self-driving budget exhausted: 3\/3/);

  await cleanup(tempDir);
});

test("dedup cooldown: identical follow-up text is suppressed instead of re-sent", async () => {
  const { default: extension, tempDir } = await loadExtensionWithMocks();
  const harness = createPiHarness();

  extension(harness.pi);

  const tool = harness.tools.get("self");

  await executeSelf(tool, "tc-notify-1", {
    query: "notify operator: finished the verified local slice",
  });
  assert.equal(harness.sentUserMessages.length, 1);

  const suppressed = await executeSelf(tool, "tc-notify-2", {
    query: "notify operator: finished the verified local slice",
  });

  assert.equal(harness.sentUserMessages.length, 1);
  assert.match(suppressed.content[0].text, /Identical follow-up text was already sent/);
  assert.equal(suppressed.details.data.userMessageBlockedReason, "self_driving_dedup_suppressed");

  await cleanup(tempDir);
});

test("send failure: a failing pi.sendUserMessage seam reports failure without throwing", async () => {
  const { default: extension, tempDir } = await loadExtensionWithMocks();
  const harness = createPiHarness();

  extension(harness.pi);

  const tool = harness.tools.get("self");
  const original = harness.pi.sendUserMessage;
  harness.pi.sendUserMessage = () => {
    throw new Error("send seam unavailable");
  };

  const result = await executeSelf(tool, "tc-fail", {
    query: "notify operator: finished the verified local slice",
  });

  harness.pi.sendUserMessage = original;
  assert.equal(harness.sentUserMessages.length, 0);
  assert.match(result.content[0].text, /failed at the pi\.sendUserMessage seam/);
  assert.equal(result.details.data.userMessageSendFailed, true);
  assert.equal(result.details.data.userMessageSent, false);

  const summary = await executeSelf(tool, "tc-summary-fail", { query: "action summary" });
  assert.match(summary.content[0].text, /failed=1/);

  await cleanup(tempDir);
});

test("continuation posture is fail-closed: non-validation action lines stay prefilled", async () => {
  const { default: extension, tempDir } = await loadExtensionWithMocks();
  const harness = createPiHarness();

  extension(harness.pi);

  const tool = harness.tools.get("self");
  recordWrite(harness, "src/one.ts");

  await executeSelf(tool, "tc-record-open", {
    query: "record continuation candidate: review the checklist notes",
  });
  const result = await executeSelf(tool, "tc-continue-open", {
    query: "continue suggested next move",
  });

  assert.equal(harness.sentUserMessages.length, 0);
  assert.equal(result.details.data.sendUserMessage, false);
  assert.equal(result.details.data.prefill, true);
  assert.match(result.details.data.reason, /fail-closed/);

  await cleanup(tempDir);
});

test("mode gate: notifications_only blocks continuation sends but not notifications", async () => {
  const { default: extension, tempDir } = await loadExtensionWithMocks();
  const harness = createPiHarness();

  process.env.PI_SELF_SEND_USER_MESSAGE_MODE = "notifications_only";
  try {
    extension(harness.pi);

    const tool = harness.tools.get("self");
    recordWrite(harness, "src/one.ts");

    const notification = await executeSelf(tool, "tc-notify", {
      query: "notify operator: finished the verified local slice",
    });
    assert.equal(harness.sentUserMessages.length, 1);
    assert.ok(notification.content[0].text.includes("User-message dispatch sent"));

    await executeSelf(tool, "tc-record", {
      query: "record continuation candidate: npm --prefix packages/a run check",
    });
    const continuation = await executeSelf(tool, "tc-continue", {
      query: "continue suggested next move",
    });

    assert.equal(harness.sentUserMessages.length, 1);
    assert.match(continuation.content[0].text, /does not allow 'continuation'/);
    assert.equal(continuation.details.data.userMessageBlockedReason, "self_driving_mode_gate");
  } finally {
    delete process.env.PI_SELF_SEND_USER_MESSAGE_MODE;
    await cleanup(tempDir);
  }
});

test("effect loop: a delivered continuation marks its candidate consumed and links telemetry", async () => {
  const { default: extension, tempDir } = await loadExtensionWithMocks();
  const harness = createPiHarness();

  extension(harness.pi);

  const tool = harness.tools.get("self");
  recordWrite(harness, "src/one.ts");

  const recorded = await executeSelf(tool, "tc-record", {
    query: "record continuation candidate: npm --prefix packages/a run check",
  });
  const candidateId = recorded.details.data.continuationCandidate.id;

  await executeSelf(tool, "tc-continue", { query: "continue suggested next move" });
  assert.equal(harness.sentUserMessages.length, 1);

  const summary = await executeSelf(tool, "tc-summary", { query: "action summary" });
  const telemetry = summary.details.data.followUpPolicy;
  assert.equal(telemetry.totalSent, 1);
  assert.equal(
    telemetry.recentSends[telemetry.recentSends.length - 1].continuationCandidateId,
    candidateId,
  );
  assert.match(
    summary.content[0].text,
    /consecutive self-driving follow-ups since last operator message=1\/3 continuations/,
  );

  await cleanup(tempDir);
});

test("declared continuation kind fails closed without a low-risk action line", async () => {
  const { default: extension, tempDir } = await loadExtensionWithMocks();
  const harness = createPiHarness();

  extension(harness.pi);

  const tool = harness.tools.get("self");

  const blocked = await executeSelf(tool, "tc-declared-continuation", {
    query: "send user message: continuing with the wider refactor now",
    context: { kind: "continuation" },
  });
  assert.equal(harness.sentUserMessages.length, 0);
  assert.equal(blocked.details.data.prefill, true);
  assert.equal(blocked.details.data.declaredKind, "continuation");

  const allowed = await executeSelf(tool, "tc-declared-notification", {
    query: "send user message: continuing with the wider refactor now",
    context: { kind: "notification" },
  });
  assert.equal(harness.sentUserMessages.length, 1);
  assert.equal(allowed.details.data.declaredKind, "notification");
  assert.equal(allowed.details.data.userMessageSent, true);

  await cleanup(tempDir);
});
