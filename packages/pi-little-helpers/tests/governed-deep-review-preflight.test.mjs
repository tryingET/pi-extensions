import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import test from "node:test";
import { runOwnerVisibleLoopGovernedPreflight } from "../src/governedDeepReviewPreflight.ts";
import {
  createVisibleLoopRunConfig,
  GOVERNED_DEEP_REVIEW_PROMPT,
  resetVisibleLoopRuntimeForRecoveryTest,
  startVisibleLoopChildRunner,
  writeVisibleLoopRunConfig,
} from "../src/visibleLoop.ts";
import { readVisibleLoopIterationLease } from "../src/visibleLoopContinuationClaim.ts";
import { createContext, createGovernedDeepReviewPreflightStub } from "./sidequest-harness.mjs";

test("a forged process-global preflight runtime cannot mint an owner-branded receipt", async () => {
  const symbol = Symbol.for("tryinget.pi.governed-deep-review-preflight.v1");
  const previous = globalThis[symbol];
  let prepareCalls = 0;
  try {
    globalThis[symbol] = {
      generation: 999,
      runtime: {
        ownerModuleUrl: new URL("../src/governedDeepReviewPreflight.ts", import.meta.url).href,
        verifyReceipt: () => true,
        bindToolCall: () => true,
        cancel: () => true,
        async prepare() {
          prepareCalls += 1;
          throw new Error("forged prepare must not run");
        },
      },
    };
    const result = await runOwnerVisibleLoopGovernedPreflight({
      nonce: "55555555-5555-4555-8555-555555555555",
      runId: "forged-owner",
      cwd: process.cwd(),
    });
    assert.equal(result.ok, false);
    assert.equal(result.failureClass, "preflight_owner_attestation_failed");
    assert.equal(prepareCalls, 0);
  } finally {
    if (previous === undefined) delete globalThis[symbol];
    else globalThis[symbol] = previous;
  }
});

test("governed preflight failure invalidates the run before lease, child_started, ACK, or prompt", async () => {
  const stateHome = mkdtempSync(`${tmpdir()}/governed-preflight-failure-`);
  try {
    const env = { ...process.env, XDG_STATE_HOME: stateHome };
    const harness = createContext({ cwd: `${stateHome}/repo` });
    const userMessages = [];
    const intercomMessages = [];
    const pi = { sendUserMessage: (message) => userMessages.push(message) };
    const config = createVisibleLoopRunConfig({
      loopCount: 1,
      cwd: harness.ctx.cwd,
      reportBack: "intercom",
      parentPeerTarget: "session-parent",
      runId: "governed-preflight-failure",
      prompts: [GOVERNED_DEEP_REVIEW_PROMPT, "must-not-run"],
    });
    const configPath = writeVisibleLoopRunConfig(config, env);
    const options = {
      governedDeepReviewPreflight: async () => ({
        ok: false,
        error: "injected owner root mismatch",
        failureClass: "registered_tool_source_root_mismatch",
        rollbackAttempted: true,
        rollbackSucceeded: true,
      }),
      createPeerRuntime: () => ({
        send: async ({ message }) => {
          intercomMessages.push(message.content.text);
          return { delivered: true };
        },
      }),
    };

    await startVisibleLoopChildRunner(configPath, pi, harness.ctx, env, options);

    assert.deepEqual(userMessages, []);
    assert.deepEqual(intercomMessages, []);
    const lease = readVisibleLoopIterationLease(config.runId, env);
    assert.equal(lease.ok, true);
    assert.equal(lease.value, null);
    const statusPath = `${stateHome}/pi-little-helpers/visible-loop/${config.runId}.status.jsonl`;
    assert.equal(existsSync(statusPath), true);
    const status = readFileSync(statusPath, "utf8");
    assert.match(status, /governed_deep_review_preflight_failed_closed/);
    assert.doesNotMatch(status, /child_started|prompt_submitted|PEER_ACK/);

    await startVisibleLoopChildRunner(configPath, pi, harness.ctx, env, options);
    assert.deepEqual(userMessages, []);
    assert.ok(
      harness.notifications.some((entry) => entry.message.includes("run config was invalidated")),
    );
  } finally {
    resetVisibleLoopRuntimeForRecoveryTest();
    rmSync(stateHome, { recursive: true, force: true });
  }
});

test("successful owner preflight is cancelled when later startup validation fails", async () => {
  const stateHome = mkdtempSync(`${tmpdir()}/governed-preflight-cancel-`);
  let cancelledNonce = null;
  try {
    const env = { ...process.env, XDG_STATE_HOME: stateHome };
    const harness = createContext({ cwd: `${stateHome}/repo` });
    harness.ctx.sessionManager.getSessionId = () => "";
    const prepare = createGovernedDeepReviewPreflightStub();
    prepare.cancel = (nonce) => {
      cancelledNonce = nonce;
      return true;
    };
    const userMessages = [];
    const pi = { sendUserMessage: (message) => userMessages.push(message) };
    const config = createVisibleLoopRunConfig({
      loopCount: 1,
      cwd: harness.ctx.cwd,
      reportBack: "manual",
      runId: "governed-preflight-cancel",
      prompts: [GOVERNED_DEEP_REVIEW_PROMPT],
    });
    const configPath = writeVisibleLoopRunConfig(config, env);

    await startVisibleLoopChildRunner(configPath, pi, harness.ctx, env, {
      governedDeepReviewPreflight: prepare,
    });

    assert.deepEqual(userMessages, []);
    assert.match(cancelledNonce, /^[a-f0-9-]{16,64}$/i);
    const lease = readVisibleLoopIterationLease(config.runId, env);
    assert.equal(lease.ok, true);
    assert.equal(lease.value, null);
    const status = readFileSync(
      `${stateHome}/pi-little-helpers/visible-loop/${config.runId}.status.jsonl`,
      "utf8",
    );
    assert.match(status, /governed_deep_review_preflight_succeeded/);
    assert.doesNotMatch(status, /child_started|prompt_submitted/);
  } finally {
    resetVisibleLoopRuntimeForRecoveryTest();
    rmSync(stateHome, { recursive: true, force: true });
  }
});
