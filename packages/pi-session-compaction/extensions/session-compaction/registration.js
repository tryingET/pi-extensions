/**
summary: "Guards and registers compaction with runtime ownership arbitration and status."
read_when:
  - "Changing live registration, duplicate-owner protection, command cleanup, or status."
*/

import { runGuardedSessionCompaction } from "./guarded-handler.js";
import {
  claimCompactionOwnership,
  formatCompactionOwnershipStatus,
  getCompactionOwnershipStatus,
  releaseCompactionOwnership,
  SESSION_BEFORE_COMPACT_EVENT,
} from "./ownership.js";
import { createTrackedCommandStore } from "./user-prompts.js";

export { SESSION_BEFORE_COMPACT_EVENT };
/** pi >= 0.84.3 (#8175): fired after context compaction fails or is aborted. */
export const HOST_COMPACTION_FAILED_EVENT = "session_compact_failed";
export const INPUT_EVENT = "input";

export function createCompactionRegistrationState() {
  return {
    sessionBeforeCompactRegistered: false,
    inputTrackingRegistered: false,
    hostCompactionFailureSubscriptionRegistered: false,
    hostCompactionFailures: 0,
    lastHostCompactionFailure: undefined,
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

  const claim = options.claimCompactionOwnership ?? claimCompactionOwnership;
  const ownership = claim(pi, options.owner);
  if (!ownership.ok) {
    return {
      ok: false,
      reason: ownership.reason,
      message: ownership.message,
      ownership,
    };
  }

  const handler = options.handler ?? runGuardedSessionCompaction;
  const handlerDeps = options.handlerDeps ?? {};
  const getTrackedCommands =
    options.getTrackedCommands ??
    (options.trackedCommandStore
      ? () => options.trackedCommandStore.trackedCommands
      : handlerDeps.getTrackedCommands);

  try {
    pi.on(SESSION_BEFORE_COMPACT_EVENT, async (event, ctx) => {
      // Re-acquire ownership through the normal path if a prior host-reported
      // failure released the lease (ADR 2026-08-24-pi-0.84.x-adoption P1-A).
      // Best-effort: if another owner claimed in between, keep handling this
      // attempt (we are still registered) but do not fight over the lease.
      if (!state.ownershipLease) {
        try {
          const reacquired = claim(pi, options.owner);
          if (reacquired.ok) state.ownershipLease = reacquired.lease;
        } catch {
          // Ownership is cooperative; handling continues regardless.
        }
      }

      const result = await handler(event, ctx, {
        ...handlerDeps,
        ...(getTrackedCommands ? { getTrackedCommands } : {}),
      });

      if (
        result?.compaction &&
        options.trackedCommandStore &&
        Array.isArray(event?.branchEntries)
      ) {
        const messages = event.branchEntries
          .filter((entry) => entry?.type === "message")
          .map((entry) => entry.message);
        options.trackedCommandStore.clearMatched(messages);
      }

      return result;
    });
  } catch (error) {
    releaseCompactionOwnership(pi, ownership.lease);
    throw error;
  }

  // Host-reported compaction failure observer (pi >= 0.84.3, upstream #8175).
  // Decision (ADR P1-A): a failed compaction leaves context state indeterminate,
  // so ALL ownership claims are released regardless of `fromExtension` —
  // downstream consumers of ownership status must never act on stale
  // arbitration. Re-acquisition happens via the normal claim path on the next
  // session_before_compact attempt above.
  try {
    pi.on(HOST_COMPACTION_FAILED_EVENT, (event) => {
      state.hostCompactionFailures += 1;
      state.lastHostCompactionFailure = Object.freeze({
        reason: typeof event?.reason === "string" ? event.reason : "unknown",
        aborted: event?.aborted === true,
        willRetry: event?.willRetry === true,
        fromExtension: event?.fromExtension === true,
        at: new Date().toISOString(),
      });
      if (state.ownershipLease) {
        try {
          releaseCompactionOwnership(pi, state.ownershipLease);
        } catch {
          // Cooperative lease; release failure must not mask the host error path.
        }
        state.ownershipLease = undefined;
      }
      return { action: "continue" };
    });
    state.hostCompactionFailureSubscriptionRegistered = true;
  } catch {
    // Failure observation is additive observability; registration succeeds
    // without it on hosts that predate the event (pi < 0.84.3).
  }

  state.sessionBeforeCompactRegistered = true;
  state.ownershipLease = ownership.lease;
  return {
    ...evaluation,
    ownership,
  };
}

export function registerCompactionStatusCommand(
  pi,
  options = {},
  state = createCompactionRegistrationState(),
) {
  if (options.enabled !== true) {
    return { ok: false, reason: "disabled" };
  }
  if (state.statusCommandRegistered) {
    return { ok: false, reason: "already_registered_by_this_package" };
  }
  try {
    pi.registerCommand("compaction-status", {
      description: "Show custom compaction ownership and handler-introspection posture",
      handler: async (_args, ctx) => {
        const status = getCompactionOwnershipStatus(pi);
        const message = formatCompactionOwnershipStatus(status);
        ctx?.ui?.notify?.(message, status.claimed ? "info" : "warning");
        return message;
      },
    });
  } catch (error) {
    return {
      ok: false,
      reason: "registration_failed",
      message: error instanceof Error ? error.message : String(error),
    };
  }
  state.statusCommandRegistered = true;
  return { ok: true, command: "compaction-status" };
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
    const statusCommand = registerCompactionStatusCommand(
      pi,
      { enabled: options.enableSessionBeforeCompact === true },
      state,
    );

    return {
      inputTracking,
      compaction,
      statusCommand,
      ownership: getCompactionOwnershipStatus(pi),
    };
  };
}
