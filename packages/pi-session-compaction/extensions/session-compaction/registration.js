/**
 * Non-live registration guard for the future pi-session-compaction extension entrypoint.
 *
 * This file intentionally does not make the package live. It provides the
 * fail-closed controls that a future extension entrypoint must use before
 * registering `session_before_compact`.
 */

import { runSessionCompaction } from "./handler.js";
import { createTrackedCommandStore } from "./user-prompts.js";

export const SESSION_BEFORE_COMPACT_EVENT = "session_before_compact";
export const INPUT_EVENT = "input";

export function createCompactionRegistrationState() {
  return {
    sessionBeforeCompactRegistered: false,
    inputTrackingRegistered: false,
  };
}

function normalizeNonNegativeInteger(value) {
  if (value === undefined) return undefined;
  if (!Number.isInteger(value) || value < 0) {
    throw new Error("existingCompactionHandlerCount must be a non-negative integer");
  }
  return value;
}

export function evaluateSessionCompactionRegistration(options = {}, state = {}) {
  const enableSessionBeforeCompact = options.enableSessionBeforeCompact === true;
  const existingCompactionHandlerCount = normalizeNonNegativeInteger(
    options.existingCompactionHandlerCount,
  );

  if (!enableSessionBeforeCompact) {
    return {
      ok: false,
      reason: "disabled",
      message: "session_before_compact registration is disabled by default",
    };
  }

  if (state.sessionBeforeCompactRegistered) {
    return {
      ok: false,
      reason: "already_registered_by_this_package",
      message: "pi-session-compaction already registered session_before_compact in this runtime",
    };
  }

  if (options.handlerTestsPassed !== true) {
    return {
      ok: false,
      reason: "handler_tests_not_confirmed",
      message: "handler-level tests must be confirmed before live compaction registration",
    };
  }

  if (options.noDoubleCompactionPreflight !== true) {
    return {
      ok: false,
      reason: "missing_no_double_compaction_preflight",
      message: "no-double-compaction preflight must be confirmed before live registration",
    };
  }

  if (existingCompactionHandlerCount === undefined) {
    return {
      ok: false,
      reason: "unknown_existing_compaction_handlers",
      message:
        "existing session_before_compact handler count is unknown; provide an explicit zero-count preflight result",
    };
  }

  if (existingCompactionHandlerCount > 0) {
    return {
      ok: false,
      reason: "existing_compaction_handler",
      message: `refusing to register because ${existingCompactionHandlerCount} session_before_compact handler(s) already exist`,
    };
  }

  return {
    ok: true,
    event: SESSION_BEFORE_COMPACT_EVENT,
    message: "session_before_compact registration preflight passed",
  };
}

export function registerInputTracking(
  pi,
  options = {},
  state = createCompactionRegistrationState(),
) {
  if (options.enableInputTracking !== true) {
    return {
      ok: false,
      reason: "disabled",
      store: options.trackedCommandStore,
    };
  }

  if (state.inputTrackingRegistered) {
    return {
      ok: false,
      reason: "already_registered_by_this_package",
      store: options.trackedCommandStore,
    };
  }

  const store = options.trackedCommandStore ?? createTrackedCommandStore();
  pi.on(INPUT_EVENT, (event) => {
    if (event?.source === "interactive") {
      store.trackInput(event.text, Date.now());
    }
    return { action: "continue" };
  });
  state.inputTrackingRegistered = true;
  return { ok: true, event: INPUT_EVENT, store };
}

export function registerSessionBeforeCompact(
  pi,
  options = {},
  state = createCompactionRegistrationState(),
) {
  const evaluation = evaluateSessionCompactionRegistration(options, state);
  if (!evaluation.ok) return evaluation;

  const handler = options.handler ?? runSessionCompaction;
  const handlerDeps = options.handlerDeps ?? {};
  const getTrackedCommands =
    options.getTrackedCommands ??
    (options.trackedCommandStore
      ? () => options.trackedCommandStore.trackedCommands
      : handlerDeps.getTrackedCommands);

  pi.on(SESSION_BEFORE_COMPACT_EVENT, async (event, ctx) => {
    const result = await handler(event, ctx, {
      ...handlerDeps,
      ...(getTrackedCommands ? { getTrackedCommands } : {}),
    });

    if (result?.compaction && options.trackedCommandStore && Array.isArray(event?.branchEntries)) {
      const messages = event.branchEntries
        .filter((entry) => entry?.type === "message")
        .map((entry) => entry.message);
      options.trackedCommandStore.clearMatched(messages);
    }

    return result;
  });

  state.sessionBeforeCompactRegistered = true;
  return evaluation;
}

export function createSessionCompactionExtension(options = {}) {
  const state = options.state ?? createCompactionRegistrationState();
  const trackedCommandStore = options.trackedCommandStore ?? createTrackedCommandStore();

  return function sessionCompactionExtension(pi) {
    const inputTracking = registerInputTracking(
      pi,
      {
        enableInputTracking: options.enableInputTracking === true,
        trackedCommandStore,
      },
      state,
    );

    const compaction = registerSessionBeforeCompact(
      pi,
      {
        ...options,
        trackedCommandStore,
        getTrackedCommands: () => trackedCommandStore.trackedCommands,
      },
      state,
    );

    return {
      inputTracking,
      compaction,
    };
  };
}
