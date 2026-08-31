// ---
// summary: "converts Pi lifecycle and tool events into throttled session snapshots for the broker"
// read_when:
//   - "changing session state transitions, heartbeat delivery, or event-derived telemetry"
// ---

/** @typedef {import("../common/contracts.ts").SessionSnapshot} SessionSnapshot */
/** @typedef {import("../common/contracts.ts").TurnEndEventLike} TurnEndEventLike */
/** @typedef {import("../common/contracts.ts").SessionTelemetryOptions} SessionTelemetryOptions */
/** @typedef {import("../common/contracts.ts").SessionStartContextLike} SessionStartContextLike */
/** @typedef {import("../common/contracts.ts").BeforeAgentStartEventLike} BeforeAgentStartEventLike */
/** @typedef {import("../common/contracts.ts").TurnStartEventLike} TurnStartEventLike */
/** @typedef {import("../common/contracts.ts").MessageUpdateEventLike} MessageUpdateEventLike */
/** @typedef {import("../common/contracts.ts").ToolExecutionEventLike} ToolExecutionEventLike */
import {
  ACTIVITY_STRIP_FLUSH_RETRY_DELAYS_MS,
  ACTIVITY_STRIP_HEARTBEAT_MS,
  ACTIVITY_STRIP_SEND_THROTTLE_MS,
} from "../common/constants.mjs";
import {
  compactWhitespace,
  formatRepoLabel,
  previewPath,
  previewText,
  truncate,
} from "../common/format.mjs";
import {
  createInitialSnapshot,
  describeToolCall,
  extractToolResultText,
  summarizeToolResult,
} from "../common/telemetry.mjs";
import { resolveTerminalIdentity as resolveTerminalIdentityDefault } from "../common/terminal-identity.mjs";
import { publishSessionSnapshot, removeSession } from "./broker-client.mjs";

function now() {
  return Date.now();
}

/** @param {MessageUpdateEventLike} event */
function extractAssistantDelta(event) {
  if (event?.assistantMessageEvent?.type !== "text_delta") return "";
  return String(event.assistantMessageEvent.delta ?? "");
}

/** @param {SessionTelemetryOptions} [options] */
export function createSessionTelemetry({
  pi,
  cwd = process.cwd(),
  sessionName = "",
  env = process.env,
  stdinIsTTY = Boolean(process.stdin.isTTY),
  resolveTerminalIdentity = resolveTerminalIdentityDefault,
  transport,
} = {}) {
  const publish = transport?.publish ?? publishSessionSnapshot;
  const removePublisher = transport?.remove ?? removeSession;
  /** @type {SessionSnapshot} */
  let snapshot = createInitialSnapshot({ cwd, sessionName });
  /** @type {NodeJS.Timeout | null} */
  let heartbeatTimer = null;
  /** @type {NodeJS.Timeout | null} */
  let flushTimer = null;
  let disposed = false;
  let pendingAssistant = "";
  let lastStopReason = "";
  let confirmedSignature = "";
  let retryIndex = 0;
  /** @type {Promise<void> | null} */
  let flushPromise = null;
  let flushAgain = false;

  /** Signature of the display-relevant fields, used to detect lost transitions. */
  function publishSignature() {
    return [
      snapshot.sessionId,
      snapshot.state,
      snapshot.phase,
      snapshot.detail,
      snapshot.agentActive,
      snapshot.turnIndex,
      snapshot.toolName,
      snapshot.toolTarget,
      snapshot.errorMessage,
      snapshot.terminalKey,
    ].join("\u001f");
  }

  function clearScheduledFlush() {
    if (!flushTimer) return;
    clearTimeout(flushTimer);
    flushTimer = null;
  }

  async function publishLatest() {
    // Heartbeats refresh transport liveness only; lastEventAt remains the last real event.
    snapshot.updatedAt = now();
    snapshot.publisherSequence += 1;
    snapshot.repoLabel = formatRepoLabel(
      snapshot.cwd,
      pi?.getSessionName?.() ?? snapshot.sessionName,
    );
    snapshot.sessionName = compactWhitespace(pi?.getSessionName?.() ?? snapshot.sessionName);
    const signature = publishSignature();
    try {
      await publish({ ...snapshot });
      confirmedSignature = signature;
      retryIndex = 0;
    } catch {
      if (
        !disposed &&
        signature !== confirmedSignature &&
        retryIndex < ACTIVITY_STRIP_FLUSH_RETRY_DELAYS_MS.length
      ) {
        const delayMs = ACTIVITY_STRIP_FLUSH_RETRY_DELAYS_MS[retryIndex];
        retryIndex += 1;
        scheduleFlush(delayMs);
      }
    }
  }

  async function flush() {
    clearScheduledFlush();
    if (disposed) return;
    if (flushPromise) {
      flushAgain = true;
      return flushPromise;
    }
    flushPromise = (async () => {
      do {
        flushAgain = false;
        if (disposed) break;
        await publishLatest();
      } while (flushAgain && !disposed);
    })().finally(() => {
      flushPromise = null;
    });
    return flushPromise;
  }

  function scheduleFlush(delayMs = ACTIVITY_STRIP_SEND_THROTTLE_MS) {
    if (disposed || flushTimer) return;
    flushTimer = setTimeout(() => {
      flushTimer = null;
      flush().catch(() => {});
    }, delayMs);
    flushTimer.unref?.();
  }

  function startHeartbeat() {
    if (heartbeatTimer) return;
    heartbeatTimer = setInterval(() => {
      scheduleFlush(0);
    }, ACTIVITY_STRIP_HEARTBEAT_MS);
    heartbeatTimer.unref?.();
  }

  function stopHeartbeat() {
    if (!heartbeatTimer) return;
    clearInterval(heartbeatTimer);
    heartbeatTimer = null;
  }

  /** @param {Partial<SessionSnapshot>} partial */
  function update(partial) {
    snapshot = {
      ...snapshot,
      ...partial,
      updatedAt: now(),
      lastEventAt: now(),
    };
    scheduleFlush();
  }

  return {
    getSnapshot() {
      return snapshot;
    },
    /** @param {SessionStartContextLike} ctx */
    async onSessionStart(ctx) {
      const exactSessionId = String(ctx?.sessionManager?.getSessionId?.() ?? "").trim();
      const nextCwd = ctx?.cwd ?? snapshot.cwd;
      const terminalIdentity = resolveTerminalIdentity({
        env,
        hasUI: Boolean(ctx?.hasUI),
        stdinIsTTY,
        processId: process.pid,
      });
      update({
        ...(exactSessionId ? { sessionId: exactSessionId } : {}),
        ...terminalIdentity,
        cwd: nextCwd,
        sessionName: pi?.getSessionName?.() ?? snapshot.sessionName,
        detail: previewPath(nextCwd, 72) || "Ready",
      });
      startHeartbeat();
      await flush();
    },
    /** @param {BeforeAgentStartEventLike} event */
    onBeforeAgentStart(event) {
      pendingAssistant = "";
      update({
        agentActive: true,
        agentStartedAt: now(),
        state: "thinking",
        phase: "Thinking",
        lastPromptPreview: previewText(event?.prompt, 96),
        detail: previewText(event?.prompt, 104) || "Thinking…",
        errorMessage: "",
        toolName: "",
        toolTarget: "",
      });
    },
    /** @param {TurnStartEventLike} event */
    onTurnStart(event) {
      update({
        turnIndex: Number(event?.turnIndex ?? snapshot.turnIndex + 1) || snapshot.turnIndex + 1,
        state: snapshot.agentActive ? snapshot.state : "thinking",
      });
    },
    /** @param {MessageUpdateEventLike} event */
    onMessageUpdate(event) {
      const delta = extractAssistantDelta(event);
      if (!delta) return;
      pendingAssistant = truncate(`${pendingAssistant}${delta}`, 240);
      if (snapshot.state === "tool" || snapshot.state === "waiting") return;
      update({
        state: "thinking",
        phase: "Thinking",
        assistantPreview: previewText(pendingAssistant, 104),
        detail: previewText(pendingAssistant, 104) || snapshot.detail,
      });
    },
    /** @param {ToolExecutionEventLike} event */
    onToolExecutionStart(event) {
      const toolName = String(event?.toolName ?? "tool");
      const description = describeToolCall(toolName, event?.args ?? {});
      update({
        state: description.state,
        phase: description.phase,
        detail: description.detail,
        toolName,
        toolTarget: description.toolTarget,
        errorMessage: "",
      });
    },
    /** @param {ToolExecutionEventLike} event */
    onToolExecutionUpdate(event) {
      if (snapshot.state !== "tool" && snapshot.state !== "waiting") return;
      const partial = previewText(extractToolResultText(event?.partialResult), 104);
      if (!partial) return;
      update({
        detail: partial,
      });
    },
    /** @param {ToolExecutionEventLike} event */
    onToolExecutionEnd(event) {
      const toolName = String(event?.toolName ?? snapshot.toolName ?? "tool");
      const summary = summarizeToolResult(toolName, event?.result, Boolean(event?.isError));
      update({
        state: summary.state,
        phase: summary.phase,
        detail: summary.detail,
        errorMessage: summary.errorMessage,
        toolName,
      });
    },
    /** @param {TurnEndEventLike} event */
    onTurnEnd(event) {
      if (!snapshot.agentActive) return;
      const rawMessage = event?.message;
      const message =
        rawMessage && typeof rawMessage === "object"
          ? /** @type {Record<string, unknown>} */ (rawMessage)
          : null;
      const stopReason = String(message?.stopReason ?? "");
      if (stopReason) lastStopReason = stopReason;
      if (stopReason === "error") {
        const errorText = previewText(message?.errorMessage, 104) || "Provider error";
        update({
          state: "error",
          phase: "Needs attention",
          detail: errorText,
          errorMessage: errorText,
        });
        return;
      }
      if (stopReason === "aborted") {
        update({
          detail: snapshot.assistantPreview || snapshot.detail || "Stopped",
        });
        return;
      }
      update({
        state: snapshot.errorMessage ? "error" : "thinking",
        phase: snapshot.errorMessage ? "Needs attention" : "Thinking",
        detail: snapshot.assistantPreview || snapshot.detail || "Thinking…",
      });
    },
    onAgentSettled() {
      const detail =
        snapshot.errorMessage || snapshot.assistantPreview || snapshot.lastPromptPreview || "Done";
      const aborted = !snapshot.errorMessage && lastStopReason === "aborted";
      update({
        agentActive: false,
        agentStartedAt: null,
        state: snapshot.errorMessage ? "error" : "success",
        phase: snapshot.errorMessage ? "Stopped" : aborted ? "Stopped" : "Done",
        detail,
        toolName: "",
        toolTarget: "",
      });
    },
    async shutdown() {
      disposed = true;
      stopHeartbeat();
      clearScheduledFlush();
      try {
        await flushPromise;
      } catch {
        // Broker absence remains non-fatal; publisher removal is still attempted below.
      }
      try {
        await removePublisher({
          sessionId: snapshot.sessionId,
          publisherId: snapshot.publisherId,
        });
      } catch {
        // ignore broker absence on shutdown
      }
    },
  };
}
