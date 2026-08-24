/**
summary: "Tests guarded compaction registration, input tracking, command cleanup, and live command and tool surfaces."
read_when:
  - "Changing registration preflights, extension activation, input handlers, compact commands, or handoff tools."
*/
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { getCompactionOwnershipStatus } from "../extensions/session-compaction/ownership.js";
import {
  createCompactionRegistrationState,
  createSessionCompactionExtension,
  evaluateSessionCompactionRegistration,
  HOST_COMPACTION_FAILED_EVENT,
  registerCompactionStatusCommand,
  registerInputTracking,
  registerSessionBeforeCompact,
  SESSION_BEFORE_COMPACT_EVENT,
} from "../extensions/session-compaction/registration.js";
import { createTrackedCommandStore } from "../extensions/session-compaction/user-prompts.js";
import sessionCompactionExtension from "../extensions/session-compaction.js";

function createPiRecorder() {
  const handlers = [];
  const commands = new Map();
  const tools = new Map();
  return {
    commands,
    handlers,
    tools,
    pi: {
      on(event, handler) {
        handlers.push({ event, handler });
      },
      registerCommand(name, definition) {
        commands.set(name, definition);
      },
      registerTool(definition) {
        tools.set(definition.name, definition);
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
    assert.equal(state.hostCompactionFailureSubscriptionRegistered, true);
    assert.deepEqual(
      handlers.map((handler) => handler.event),
      [SESSION_BEFORE_COMPACT_EVENT, HOST_COMPACTION_FAILED_EVENT],
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
    assert.equal(handlers.length, 2);
  });

  it("joins the internal stage chain with the host cause and surfaces it in compaction-status", async () => {
    const { pi, handlers, commands } = createPiRecorder();
    const state = createCompactionRegistrationState();
    const userTelemetry = [];
    registerSessionBeforeCompact(
      pi,
      {
        enableSessionBeforeCompact: true,
        handlerTestsPassed: true,
        noDoubleCompactionPreflight: true,
        existingCompactionHandlerCount: 0,
        handlerDeps: {
          recordFailureTelemetry: async (input) => {
            userTelemetry.push(input);
          },
        },
        handler: async (_event, _ctx, deps) => {
          await deps.recordFailureTelemetry({
            stage: "preset",
            error: new Error("provider exploded with 529"),
          });
          await deps.recordFailureTelemetry({
            stage: "final",
            error: new Error("summarization failed"),
          });
          return undefined;
        },
      },
      state,
    );
    registerCompactionStatusCommand(pi, { enabled: true }, state);

    // Failed attempt: internal chain recorded, caller's telemetry dep still invoked.
    await handlers[0].handler({ type: SESSION_BEFORE_COMPACT_EVENT }, { cwd: "/repo" });
    assert.equal(userTelemetry.length, 2);
    assert.equal(state.internalFailureChain.length, 2);

    // Host reports the failure; chain is joined into the last-failure record.
    const failureHandler = handlers.find((h) => h.event === HOST_COMPACTION_FAILED_EVENT);
    failureHandler.handler({
      type: HOST_COMPACTION_FAILED_EVENT,
      reason: "overflow",
      errorMessage: "Context overflow recovery failed",
      aborted: false,
      willRetry: false,
      fromExtension: false,
    });

    const last = state.lastHostCompactionFailure;
    assert.equal(last.internalChain.length, 2);
    assert.equal(last.internalChain[0].stage, "preset");
    assert.equal(last.internalChain[0].errorSignature, "provider exploded with 529");
    assert.equal(last.internalChain[1].stage, "final");
    assert.equal(state.internalFailureChain.length, 0);

    // compaction-status surfaces the combined cause + chain.
    const statusHandler = commands.get("compaction-status").handler;
    const message = await statusHandler({}, { ui: { notify() {} } });
    assert.match(message, /reason=overflow/);
    assert.match(
      message,
      /Internal failure chain: preset: provider exploded with 529 \| final: summarization failed/,
    );
  });

  it("releases ownership on host-reported compaction failure and re-claims on the next attempt", async () => {
    const { pi, handlers } = createPiRecorder();
    const state = createCompactionRegistrationState();
    registerSessionBeforeCompact(
      pi,
      {
        enableSessionBeforeCompact: true,
        handlerTestsPassed: true,
        noDoubleCompactionPreflight: true,
        existingCompactionHandlerCount: 0,
        handler: async () => ({ compaction: { summary: "ok", firstKeptEntryId: "k" } }),
      },
      state,
    );

    // Lease held after registration.
    assert.equal(getCompactionOwnershipStatus(pi).claimed, true);

    // Host reports a failed compaction (fromExtension false — provider-side).
    const failureHandler = handlers.find((h) => h.event === HOST_COMPACTION_FAILED_EVENT);
    assert.ok(failureHandler);
    failureHandler.handler({
      type: HOST_COMPACTION_FAILED_EVENT,
      reason: "overflow",
      errorMessage: "provider exploded",
      aborted: false,
      willRetry: false,
      fromExtension: false,
    });

    assert.equal(state.hostCompactionFailures, 1);
    assert.equal(state.lastHostCompactionFailure.reason, "overflow");
    assert.equal(state.ownershipLease, undefined);
    assert.equal(getCompactionOwnershipStatus(pi).claimed, false);

    // Next before_compact attempt re-acquires via the normal claim path.
    await handlers[0].handler({ type: SESSION_BEFORE_COMPACT_EVENT }, { cwd: "/repo" });
    assert.equal(getCompactionOwnershipStatus(pi).claimed, true);
    assert.equal(state.hostCompactionFailures, 1);
  });

  it("releases ownership regardless of fromExtension and tolerates hosts without the failure event", () => {
    const { pi, handlers } = createPiRecorder();
    const state = createCompactionRegistrationState();
    registerSessionBeforeCompact(
      pi,
      {
        enableSessionBeforeCompact: true,
        handlerTestsPassed: true,
        noDoubleCompactionPreflight: true,
        existingCompactionHandlerCount: 0,
        handler: async () => ({ cancel: true }),
      },
      state,
    );

    const failureHandler = handlers.find((h) => h.event === HOST_COMPACTION_FAILED_EVENT);
    failureHandler.handler({ type: HOST_COMPACTION_FAILED_EVENT, fromExtension: true });
    assert.equal(state.ownershipLease, undefined);
    assert.equal(getCompactionOwnershipStatus(pi).claimed, false);
    assert.equal(state.lastHostCompactionFailure.fromExtension, true);
  });

  it("clears matched commands only after successful custom compaction", async () => {
    for (const outcome of [undefined, { cancel: true }, new Error("summary failed")]) {
      const { pi, handlers } = createPiRecorder();
      const store = createTrackedCommandStore();
      store.trackInput("/review --strict", 1000);
      registerSessionBeforeCompact(pi, {
        enableSessionBeforeCompact: true,
        handlerTestsPassed: true,
        noDoubleCompactionPreflight: true,
        existingCompactionHandlerCount: 0,
        trackedCommandStore: store,
        handler: async () => {
          if (outcome instanceof Error) throw outcome;
          return outcome;
        },
      });
      const event = {
        branchEntries: [
          { type: "message", message: { role: "user", content: "expanded", timestamp: 1000 } },
        ],
      };

      if (outcome instanceof Error) {
        await assert.rejects(handlers[0].handler(event, {}), /summary failed/);
      } else {
        await handlers[0].handler(event, {});
      }
      assert.deepEqual(
        store.trackedCommands.map((command) => command.original),
        ["/review --strict"],
      );
    }

    const { pi, handlers } = createPiRecorder();
    const store = createTrackedCommandStore();
    store.trackInput("/review --strict", 1000);
    registerSessionBeforeCompact(pi, {
      enableSessionBeforeCompact: true,
      handlerTestsPassed: true,
      noDoubleCompactionPreflight: true,
      existingCompactionHandlerCount: 0,
      trackedCommandStore: store,
      handler: async () => ({ compaction: { summary: "ok" } }),
    });
    await handlers[0].handler(
      {
        branchEntries: [
          { type: "message", message: { role: "user", content: "expanded", timestamp: 1000 } },
        ],
      },
      {},
    );
    assert.deepEqual(store.trackedCommands, []);
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
      ["input", SESSION_BEFORE_COMPACT_EVENT, HOST_COMPACTION_FAILED_EVENT],
    );
  });

  it("live entrypoint registers input tracking, compaction, handoff surfaces, and startup visibility", async () => {
    const { pi, handlers, commands, tools } = createPiRecorder();
    const result = sessionCompactionExtension(pi);

    assert.equal(result.inputTracking.ok, true);
    assert.equal(result.compaction.ok, true);
    assert.deepEqual(
      handlers.map((handler) => handler.event),
      ["input", SESSION_BEFORE_COMPACT_EVENT, HOST_COMPACTION_FAILED_EVENT, "session_start"],
    );
    assert.equal(commands.has("compact-focus"), true);
    assert.equal(commands.has("compact-handoff"), true);
    assert.equal(tools.has("session_compaction_handoff"), true);

    const notices = [];
    await handlers[3].handler(
      {},
      {
        ui: {
          notify(message, level) {
            notices.push({ message, level });
          },
        },
      },
    );
    assert.deepEqual(notices, [
      {
        message: "pi-session-compaction: input tracking enabled; session_before_compact enabled",
        level: "info",
      },
    ]);
  });

  it("live compact-handoff command prefills a fresh-session prompt", async () => {
    const { pi, commands } = createPiRecorder();
    sessionCompactionExtension(pi);

    let editorText = "";
    const notices = [];
    const result = await commands.get("compact-handoff").handler("task 3483", {
      cwd: "/repo/example",
      hasUI: true,
      ui: {
        setEditorText(text) {
          editorText = text;
        },
        notify(message, level) {
          notices.push({ message, level });
        },
      },
    });

    assert.equal(result, "Fresh-session handoff prompt prefilled by pi-session-compaction.");
    assert.match(editorText, /^You are a fresh, stateless Pi coding session\./);
    assert.match(editorText, /Work in:\n`\/repo\/example`/);
    assert.match(editorText, /pi-session-compaction owned/);
    assert.match(editorText, /task 3483/);
    assert.match(editorText, /Exact token\/context-window telemetry: unavailable/);
    assert.deepEqual(notices, [
      { message: "Fresh-session handoff prompt prefilled", level: "info" },
    ]);
  });

  it("live handoff tool shows or prefills the owner-owned prompt", async () => {
    const { pi, tools } = createPiRecorder();
    sessionCompactionExtension(pi);

    const show = await tools.get("session_compaction_handoff").execute(
      "tc-show",
      {
        mode: "show",
        cwd: "/repo/example",
        akTaskIds: ["3483"],
        discoveryRecords: [
          {
            discovery:
              "Deep-review found ASC/self should pass mirror cues, not own compaction shape.",
            source: "deep-review",
            ownerSurface: "packages/pi-session-compaction",
            promotionStatus: "Deferred",
            nextPromotionAction: "Promote through pi-session-compaction handoff schema.",
            metric: "Fresh-session prompt names discovery owner and next promotion action.",
            falsifier:
              "Prompt omits supplied discovery or implies compaction text is durable authority.",
            nonAuthorization: "Do not mutate AK/KES/evidence from this handoff.",
          },
        ],
      },
      null,
      null,
      {
        cwd: "/fallback",
        hasUI: false,
      },
    );
    assert.match(show.content[0].text, /Known AK task ids: 3483/);
    assert.match(show.content[0].text, /Valuable discoveries \/ promotion status/);
    assert.match(show.content[0].text, /Deep-review found ASC\/self should pass mirror cues/);
    assert.match(show.content[0].text, /Source: deep-review/);
    assert.match(show.content[0].text, /Promotion status: Deferred/);
    assert.match(
      show.content[0].text,
      /Next promotion action: Promote through pi-session-compaction/,
    );
    assert.match(show.content[0].text, /Do not mutate AK\/KES\/evidence from this handoff/);
    assert.equal(show.details.authority, "pi_session_compaction_owned");
    assert.equal(show.details.prefill, false);

    let editorText = "";
    const prefill = await tools
      .get("session_compaction_handoff")
      .execute(
        "tc-prefill",
        { mode: "prefill", cwd: "/repo/example", gitStatusSummary: "clean" },
        null,
        null,
        {
          cwd: "/fallback",
          hasUI: true,
          ui: {
            setEditorText(text) {
              editorText = text;
            },
          },
        },
      );
    assert.match(prefill.content[0].text, /prefilled by pi-session-compaction/);
    assert.match(editorText, /Git status: clean/);
    assert.equal(prefill.details.prefill, true);
  });

  it("live focus command opens a menu and starts compaction with selected instructions", async () => {
    const { pi, commands } = createPiRecorder();
    sessionCompactionExtension(pi);

    const compactCalls = [];
    const notices = [];
    await commands.get("compact-focus").handler("", {
      hasUI: true,
      sessionManager: {
        getEntries() {
          return [{ type: "message" }, { type: "message" }];
        },
      },
      ui: {
        async select(title, options) {
          assert.equal(title, "Choose compaction focus");
          assert.deepEqual(options, [
            "Continue safely",
            "Verify live behavior",
            "Clean handoff",
            "Release readiness",
          ]);
          return "Verify live behavior";
        },
        notify(message, level) {
          notices.push({ message, level });
        },
      },
      compact(options) {
        compactCalls.push(options);
      },
    });

    assert.equal(compactCalls.length, 1);
    assert.match(compactCalls[0].customInstructions, /^Verify live behavior:/);
    assert.deepEqual(notices, [
      { message: "Compaction started: Verify live behavior", level: "info" },
    ]);
  });
});
