import {
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
  summarizeToolResult,
} from "../common/telemetry.mjs";
import { publishSessionSnapshot, removeSession } from "./broker-client.mjs";

function now() {
  return Date.now();
}

function extractAssistantDelta(event) {
  if (event?.assistantMessageEvent?.type !== "text_delta") return "";
  return String(event.assistantMessageEvent.delta ?? "");
}

export function createSessionTelemetry({ pi, cwd = process.cwd(), sessionName = "" } = {}) {
  let snapshot = createInitialSnapshot({ cwd, sessionName });
  let heartbeatTimer = null;
  let flushTimer = null;
  let disposed = false;
  let pendingAssistant = "";

  async function flush() {
    flushTimer = null;
    if (disposed) return;
    snapshot.updatedAt = now();
    snapshot.repoLabel = formatRepoLabel(
      snapshot.cwd,
      pi?.getSessionName?.() ?? snapshot.sessionName,
    );
    snapshot.sessionName = compactWhitespace(pi?.getSessionName?.() ?? snapshot.sessionName);
    try {
      await publishSessionSnapshot(snapshot);
    } catch {
      // Broker is optional at runtime; silent failure keeps pi stable.
    }
  }

  function scheduleFlush(delayMs = ACTIVITY_STRIP_SEND_THROTTLE_MS) {
    if (disposed) return;
    if (flushTimer) return;
    flushTimer = setTimeout(() => {
      flush().catch(() => {});
    }, delayMs);
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

  function update(partial) {
    snapshot = {
      ...snapshot,
      ...partial,
      updatedAt: now(),
    };
    scheduleFlush();
  }

  return {
    getSnapshot() {
      return snapshot;
    },
    async onSessionStart(ctx) {
      update({
        cwd: ctx?.cwd ?? snapshot.cwd,
        sessionName: pi?.getSessionName?.() ?? snapshot.sessionName,
        detail: previewPath(ctx?.cwd ?? snapshot.cwd, 72) || "Ready",
      });
      startHeartbeat();
      await flush();
    },
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
    onTurnStart(event) {
      update({
        turnIndex: Number(event?.turnIndex ?? snapshot.turnIndex + 1) || snapshot.turnIndex + 1,
        state: snapshot.agentActive ? snapshot.state : "thinking",
      });
    },
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
    onToolExecutionUpdate(event) {
      if (snapshot.state !== "tool" && snapshot.state !== "waiting") return;
      const partial = previewText(event?.partialResult, 104);
      if (!partial) return;
      update({
        detail: partial,
      });
    },
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
    onTurnEnd() {
      if (!snapshot.agentActive) return;
      update({
        state: snapshot.errorMessage ? "error" : "thinking",
        phase: snapshot.errorMessage ? "Needs attention" : "Thinking",
        detail: snapshot.assistantPreview || snapshot.detail || "Thinking…",
      });
    },
    onAgentEnd() {
      const detail =
        snapshot.errorMessage || snapshot.assistantPreview || snapshot.lastPromptPreview || "Done";
      update({
        agentActive: false,
        agentStartedAt: null,
        state: snapshot.errorMessage ? "error" : "success",
        phase: snapshot.errorMessage ? "Stopped" : "Done",
        detail,
        toolName: "",
        toolTarget: "",
      });
    },
    async shutdown() {
      disposed = true;
      stopHeartbeat();
      if (flushTimer) {
        clearTimeout(flushTimer);
        flushTimer = null;
      }
      try {
        await removeSession(snapshot.sessionId);
      } catch {
        // ignore broker absence on shutdown
      }
    },
  };
}
