import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  createCompactionRegistrationState,
  createSessionCompactionExtension,
  evaluateSessionCompactionRegistration,
  registerInputTracking,
  registerSessionBeforeCompact,
  SESSION_BEFORE_COMPACT_EVENT,
} from "../extensions/session-compaction/registration.js";
import { createTrackedCommandStore } from "../extensions/session-compaction/user-prompts.js";

function createPiRecorder() {
  const handlers = [];
  return {
    handlers,
    pi: {
      on(event, handler) {
        handlers.push({ event, handler });
      },
    },
  };
}

describe("session compaction registration guard", () => {
  it("fails closed when live compaction registration is not explicitly enabled", () => {
    assert.deepEqual(evaluateSessionCompactionRegistration(), {
      ok: false,
      reason: "disabled",
      message: "session_before_compact registration is disabled by default",
    });
  });

  it("requires handler-test and no-double-compaction proof before registration", () => {
    assert.equal(
      evaluateSessionCompactionRegistration({ enableSessionBeforeCompact: true }).reason,
      "handler_tests_not_confirmed",
    );
    assert.equal(
      evaluateSessionCompactionRegistration({
        enableSessionBeforeCompact: true,
        handlerTestsPassed: true,
      }).reason,
      "missing_no_double_compaction_preflight",
    );
    assert.equal(
      evaluateSessionCompactionRegistration({
        enableSessionBeforeCompact: true,
        handlerTestsPassed: true,
        noDoubleCompactionPreflight: true,
      }).reason,
      "unknown_existing_compaction_handlers",
    );
  });

  it("blocks known existing compaction handlers and duplicate package registration", () => {
    assert.equal(
      evaluateSessionCompactionRegistration({
        enableSessionBeforeCompact: true,
        handlerTestsPassed: true,
        noDoubleCompactionPreflight: true,
        existingCompactionHandlerCount: 1,
      }).reason,
      "existing_compaction_handler",
    );

    assert.equal(
      evaluateSessionCompactionRegistration(
        {
          enableSessionBeforeCompact: true,
          handlerTestsPassed: true,
          noDoubleCompactionPreflight: true,
          existingCompactionHandlerCount: 0,
        },
        { sessionBeforeCompactRegistered: true },
      ).reason,
      "already_registered_by_this_package",
    );
  });

  it("registers exactly one session_before_compact handler only after explicit zero-count preflight", async () => {
    const { pi, handlers } = createPiRecorder();
    const state = createCompactionRegistrationState();
    const calls = [];
    const result = registerSessionBeforeCompact(
      pi,
      {
        enableSessionBeforeCompact: true,
        handlerTestsPassed: true,
        noDoubleCompactionPreflight: true,
        existingCompactionHandlerCount: 0,
        handler: async (event, ctx, deps) => {
          calls.push({ event, ctx, deps });
          return { compaction: { summary: "ok", firstKeptEntryId: "keep", tokensBefore: 1 } };
        },
        handlerDeps: { marker: true },
      },
      state,
    );

    assert.equal(result.ok, true);
    assert.equal(result.event, SESSION_BEFORE_COMPACT_EVENT);
    assert.equal(state.sessionBeforeCompactRegistered, true);
    assert.deepEqual(
      handlers.map((handler) => handler.event),
      [SESSION_BEFORE_COMPACT_EVENT],
    );

    const handlerResult = await handlers[0].handler(
      { type: SESSION_BEFORE_COMPACT_EVENT },
      { cwd: "/repo" },
    );
    assert.equal(handlerResult.compaction.summary, "ok");
    assert.equal(calls[0].deps.marker, true);

    const duplicate = registerSessionBeforeCompact(
      pi,
      {
        enableSessionBeforeCompact: true,
        handlerTestsPassed: true,
        noDoubleCompactionPreflight: true,
        existingCompactionHandlerCount: 0,
      },
      state,
    );
    assert.equal(duplicate.reason, "already_registered_by_this_package");
    assert.equal(handlers.length, 1);
  });

  it("can track slash-command input without registering slash commands", async () => {
    const { pi, handlers } = createPiRecorder();
    const state = createCompactionRegistrationState();
    const store = createTrackedCommandStore();
    const result = registerInputTracking(
      pi,
      { enableInputTracking: true, trackedCommandStore: store },
      state,
    );

    assert.equal(result.ok, true);
    assert.deepEqual(
      handlers.map((handler) => handler.event),
      ["input"],
    );

    assert.deepEqual(
      await handlers[0].handler({ text: "/review --strict", source: "interactive" }),
      {
        action: "continue",
      },
    );
    assert.deepEqual(
      store.trackedCommands.map((command) => command.original),
      ["/review --strict"],
    );

    await handlers[0].handler({ text: "/rpc-command", source: "rpc" });
    assert.deepEqual(
      store.trackedCommands.map((command) => command.original),
      ["/review --strict"],
    );
  });

  it("creates a non-live extension factory that remains disabled by default", () => {
    const { pi, handlers } = createPiRecorder();
    const extension = createSessionCompactionExtension();
    const result = extension(pi);

    assert.equal(result.inputTracking.reason, "disabled");
    assert.equal(result.compaction.reason, "disabled");
    assert.deepEqual(handlers, []);
  });

  it("creates an explicitly guarded extension factory with input tracking and compaction registration", () => {
    const { pi, handlers } = createPiRecorder();
    const extension = createSessionCompactionExtension({
      enableInputTracking: true,
      enableSessionBeforeCompact: true,
      handlerTestsPassed: true,
      noDoubleCompactionPreflight: true,
      existingCompactionHandlerCount: 0,
      handler: async () => undefined,
    });
    const result = extension(pi);

    assert.equal(result.inputTracking.ok, true);
    assert.equal(result.compaction.ok, true);
    assert.deepEqual(
      handlers.map((handler) => handler.event),
      ["input", SESSION_BEFORE_COMPACT_EVENT],
    );
  });
});
