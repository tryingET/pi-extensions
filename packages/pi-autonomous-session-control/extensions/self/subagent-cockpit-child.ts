import { resolve } from "node:path";
import {
  type AgentBeforeSettleEvent,
  type BoundaryResult,
  type ExtensionAPI,
  type ExtensionContext,
  type TurnEndEvent,
  VERSION,
} from "@earendil-works/pi-coding-agent";
import { getContextRepoRoot } from "./session-context.ts";
import {
  appendCockpitEvent,
  attemptIdentityLive,
  COCKPIT_CHANNEL_ENV,
  type CockpitChannel,
  liveChannel,
  mutateChannel,
  readCockpitStatus,
  reconcileReceipts,
  statusMatches,
} from "./subagent-cockpit-channel.ts";
import { retryCockpitMutation, writeCockpitFence } from "./subagent-cockpit-fence.ts";
import { boundedDescription, literalGuidance } from "./subagent-cockpit-io.ts";
import { GUIDANCE_CUSTOM_TYPE, type TraceEntry, textContent } from "./subagent-cockpit-trace.ts";
import { getProcessStartTicks } from "./subagent-session-status.ts";

// Loaded explicitly by the ASC spawn path, never via the package's main extension.
// No RPC transport, input event, command expansion, idle send, or stdout logging.
export default function subagentCockpitChild(pi: ExtensionAPI): void {
  const channelDirectory = process.env[COCKPIT_CHANNEL_ENV];
  if (!channelDirectory) return;
  const dir: string = channelDirectory;
  let started = false;
  let stopped = false;
  let nonce: string | undefined;
  let assistantOrdinal = 0;
  let lastStreamPublishAt = 0;
  let eventOrdinal = 0;
  const tools = new Map<string, { args: unknown; lastUpdateAt: number }>();

  function branch(ctx: ExtensionContext): TraceEntry[] {
    return ctx.sessionManager.getBranch() as TraceEntry[];
  }
  function bound(channel: CockpitChannel, ctx: ExtensionContext): boolean {
    return (
      channel.nonce === nonce &&
      channel.childPid === process.pid &&
      getProcessStartTicks(process.pid) === channel.childTicks &&
      resolve(ctx.cwd) === channel.cwd &&
      getContextRepoRoot(ctx) === channel.parentRepoRoot &&
      ctx.sessionManager.getSessionFile() === channel.sessionFile
    );
  }
  function update(ctx: ExtensionContext, action: (channel: CockpitChannel) => void): void {
    if (!started || stopped) return;
    try {
      mutateChannel(dir, (channel) => {
        if (channel.phase === "closed") {
          stopped = true;
          return;
        }
        if (!bound(channel, ctx) || !attemptIdentityLive(channel)) {
          reconcileReceipts(channel, branch(ctx), true);
          channel.phase = "closed";
          channel.reason = "Exact attempt identity lost";
          stopped = true;
          return;
        }
        reconcileReceipts(channel, branch(ctx));
        action(channel);
      });
    } catch {
      /* Busy or unsafe telemetry is unavailable, never an excuse to change the child task. */
    }
  }
  function finish(ctx: ExtensionContext, reason: string, rejected = false): void | Promise<void> {
    if (!started || stopped || !nonce) return;
    stopped = true;
    writeCockpitFence(dir, nonce, reason, rejected ? "rejected" : "expired");
    const close = () =>
      mutateChannel(dir, (channel) => {
        if (!bound(channel, ctx)) return;
        if (rejected) rejectPending(channel, reason);
        reconcileReceipts(channel, branch(ctx), true);
        channel.phase = "closed";
        channel.reason = reason;
      });
    try {
      close();
    } catch {
      return retryCockpitMutation(close)
        .then(() => undefined)
        .catch(() => undefined);
    }
  }
  function rejectPending(channel: CockpitChannel, reason: string): void {
    for (const request of channel.requests)
      if (request.status === "queued" && !request.staged) {
        request.status = "rejected";
        request.reason = reason;
        request.updatedAt = new Date().toISOString();
      }
  }

  pi.on("session_start", (_event, ctx) => {
    if (started || stopped) return;
    started = true;
    try {
      mutateChannel(dir, (channel) => {
        const ticks = getProcessStartTicks(process.pid);
        const [major, minor] = VERSION.split(".").map(Number);
        const supported = Number.isInteger(major) && (major > 1 || (major === 1 && minor >= 1));
        if (
          !supported ||
          ticks === null ||
          channel.phase !== "starting" ||
          ctx.mode !== "json" ||
          resolve(ctx.cwd) !== channel.cwd ||
          getContextRepoRoot(ctx) !== channel.parentRepoRoot ||
          ctx.sessionManager.getSessionFile() !== channel.sessionFile ||
          getProcessStartTicks(channel.parentPid) !== channel.parentTicks ||
          !statusMatches(channel, readCockpitStatus(channel.sessionsDir, channel.sessionName))
        ) {
          channel.phase = "closed";
          channel.reason = "Unsupported host or child/parent/repository binding";
          stopped = true;
          return;
        }
        nonce = channel.nonce;
        channel.childPid = process.pid;
        channel.childTicks = ticks;
        channel.phase = "open";
        appendCockpitEvent(channel, {
          id: `lifecycle-${++eventOrdinal}`,
          kind: "lifecycle",
          text: "Native child control ready",
        });
      });
    } catch {
      stopped = true;
    }
  });

  pi.on("message_start", (event, ctx) => {
    if (event.message.role === "assistant") {
      assistantOrdinal++;
      lastStreamPublishAt = 0;
    }
    if (event.message.role === "user") {
      const text = textContent(event.message.content, 2049);
      update(ctx, (channel) =>
        appendCockpitEvent(channel, {
          id: `user-${++eventOrdinal}`,
          kind: "user",
          text,
        }),
      );
    }
  });
  pi.on("message_update", (event, ctx) => {
    if (event.assistantMessageEvent.type !== "text_delta" || Date.now() - lastStreamPublishAt < 250)
      return;
    lastStreamPublishAt = Date.now();
    const text = textContent("content" in event.message ? event.message.content : undefined, 2049);
    update(ctx, (channel) =>
      appendCockpitEvent(channel, {
        id: `assistant-${assistantOrdinal}`,
        kind: "assistant_stream",
        text,
      }),
    );
  });
  pi.on("message_end", (event, ctx) => {
    if (event.message.role !== "assistant") return;
    const text = textContent(event.message.content, 2049);
    update(ctx, (channel) =>
      appendCockpitEvent(channel, {
        id: `assistant-${assistantOrdinal}`,
        kind: "assistant",
        text,
      }),
    );
  });
  pi.on("tool_execution_start", (event, ctx) => {
    const oldest = tools.keys().next().value;
    if (tools.size >= 32 && oldest !== undefined) tools.delete(oldest);
    tools.set(event.toolCallId, { args: event.args, lastUpdateAt: 0 });
    update(ctx, (channel) =>
      appendCockpitEvent(channel, {
        id: `tool-${event.toolCallId}`.slice(0, 120),
        kind: "tool_start",
        text: `${event.toolName} started`,
        toolName: event.toolName,
        detail: boundedDescription(event.args),
      }),
    );
  });
  pi.on("tool_execution_update", (event, ctx) => {
    const tool = tools.get(event.toolCallId);
    if (!tool || Date.now() - tool.lastUpdateAt < 250) return;
    tool.lastUpdateAt = Date.now();
    update(ctx, (channel) =>
      appendCockpitEvent(channel, {
        id: `tool-${event.toolCallId}`.slice(0, 120),
        kind: "tool_update",
        text: `${event.toolName} running`,
        toolName: event.toolName,
        detail: boundedDescription({ args: event.args, result: event.partialResult }),
      }),
    );
  });
  pi.on("tool_execution_end", (event, ctx) => {
    const args = tools.get(event.toolCallId)?.args;
    tools.delete(event.toolCallId);
    update(ctx, (channel) =>
      appendCockpitEvent(channel, {
        id: `tool-${event.toolCallId}`.slice(0, 120),
        kind: "tool_end",
        text: `${event.toolName} ${event.isError ? "failed" : "finished"}`,
        toolName: event.toolName,
        detail: boundedDescription({ args, result: event.result }),
      }),
    );
  });

  function boundary(
    event: TurnEndEvent | AgentBeforeSettleEvent,
    ctx: ExtensionContext,
  ): BoundaryResult | undefined | Promise<BoundaryResult | undefined> {
    if (!started || stopped) return;
    const consider = () =>
      mutateChannel(dir, (channel): BoundaryResult | undefined => {
        if (!bound(channel, ctx) || !attemptIdentityLive(channel)) {
          reconcileReceipts(channel, branch(ctx), true);
          channel.phase = "closed";
          channel.reason = "Exact attempt identity lost";
          stopped = true;
          return;
        }
        if (!liveChannel(channel)) return;
        reconcileReceipts(channel, branch(ctx));
        if (event.outcome !== "completed" || ctx.signal?.aborted) {
          // Pi retries/overflow-recovers after turn_end. Never inject guidance
          // into an error context or end the telemetry/authentication lifetime.
          if (
            event.type === "agent_before_settle" &&
            !event.continue &&
            event.context.pendingMessages.length === 0
          ) {
            rejectPending(channel, "Final unsuccessful boundary; guidance not injected");
            channel.phase = "closing";
            channel.reason = "Final unsuccessful native boundary";
          }
          return;
        }
        // A proposal removed by a later extension is never re-delivered. It
        // remains unconfirmed until closure, when its receipt expires.
        const queued = channel.requests.filter((r) => r.status === "queued" && !r.staged);
        const entries = [...event.entries];
        for (const request of queued) {
          if (!literalGuidance(request.message) || request.nonce !== nonce) {
            request.status = "rejected";
            request.reason = "Invalid literal guidance or authentication";
            request.updatedAt = new Date().toISOString();
            continue;
          }
          request.staged = true;
          entries.push({
            type: "custom_message",
            customType: GUIDANCE_CUSTOM_TYPE,
            content: request.message,
            display: false,
            details: {
              requestId: request.requestId,
              dispatchId: channel.dispatchId,
              attemptId: channel.attemptId,
            },
          });
        }
        if (
          event.type === "agent_before_settle" &&
          entries.length === event.entries.length &&
          !event.continue &&
          event.context.pendingMessages.length === 0
        ) {
          // Fence publication under the same lock as enqueue. A request that
          // won the race is included above; one arriving afterward is rejected.
          channel.phase = "closing";
          channel.reason = "Final native boundary passed";
        }
        return entries.length > event.entries.length ? { entries, continue: true } : undefined;
      });
    try {
      return consider();
    } catch {
      if (event.type !== "agent_before_settle") return;
      // Await only between lock attempts, never while holding the lock. Enqueue
      // winners are reconsidered; timeout makes rejection explicit and monotonic.
      return retryCockpitMutation(consider).catch(() => {
        if (nonce)
          writeCockpitFence(
            dir,
            nonce,
            "Final boundary control contention/unavailable; guidance rejected, not injected",
          );
        return undefined;
      });
    }
  }
  pi.on("turn_end", boundary);
  pi.on("agent_before_settle", boundary);
  pi.on("turn_start", (_event, ctx) => update(ctx, () => undefined));
  pi.on("agent_settled", (event, ctx) =>
    finish(ctx, event.aborted ? "Attempt aborted" : "Attempt settled", event.aborted),
  );
  pi.on("session_shutdown", (_event, ctx) => finish(ctx, "Child session shut down"));
}
