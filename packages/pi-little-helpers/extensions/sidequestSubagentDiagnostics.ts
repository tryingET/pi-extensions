// Content-free explicit diagnostic relay; no ASC runtime/private imports.
import { isAbsolute, resolve } from "node:path";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import type {
  AscExecutionObserverController,
  AscObserverCommandOutcome,
} from "../src/ascExecutionObserver.ts";

export const ASC_SUBAGENT_OBSERVER_DIAGNOSE_EVENT = "asc:subagent-observer:diagnose:v1";
type DiagnosticRequest = {
  schema: "asc.subagent-observer.diagnose.v1";
  requestId: string;
  cwd: string;
  parentSessionKey: string;
  action: "open" | "status";
  reply(result: { requestId: string; message: string; level: "info" | "warning" }): void;
};

// Original-object identity, shared across module copies and reloads, without retaining requests.
const fenceKey = Symbol.for("pi-little-helpers.asc.subagent-observer.diagnose.v1.fence");
const shared = globalThis as typeof globalThis & { [fenceKey]?: WeakSet<object> };
shared[fenceKey] ??= new WeakSet<object>();
const claimed = shared[fenceKey];
const fields = ["schema", "requestId", "cwd", "parentSessionKey", "action", "reply"];
function text(value: unknown, max: number): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= max &&
    !Array.from(value).some((char) => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127)
  );
}
function parse(value: unknown): DiagnosticRequest | undefined {
  try {
    if (
      !value ||
      typeof value !== "object" ||
      Array.isArray(value) ||
      ![Object.prototype, null].includes(Object.getPrototypeOf(value))
    )
      return;
    const descriptors = Object.getOwnPropertyDescriptors(value);
    if (
      Reflect.ownKeys(value).length !== fields.length ||
      !fields.every((key) => Object.hasOwn(descriptors, key) && "value" in descriptors[key])
    )
      return;
    // Read descriptor values only; snapshot before awaits and callback execution.
    const data = Object.fromEntries(fields.map((key) => [key, descriptors[key].value]));
    if (
      data.schema !== "asc.subagent-observer.diagnose.v1" ||
      !text(data.requestId, 256) ||
      !text(data.parentSessionKey, 256) ||
      !text(data.cwd, 4096) ||
      !isAbsolute(data.cwd) ||
      resolve(data.cwd) !== data.cwd ||
      (data.action !== "open" && data.action !== "status") ||
      typeof data.reply !== "function"
    )
      return;
    return data as DiagnosticRequest;
  } catch {
    return;
  }
}
function result(outcome: AscObserverCommandOutcome): {
  message: string;
  level: "info" | "warning";
} {
  const explanation =
    outcome.status === "armed"
      ? "waiting for valid bounded ASC progress; no launch yet"
      : outcome.status === "launched"
        ? "renderer ACK verified; visibility/placement and execution are not proven"
        : outcome.status === "pending" || outcome.status === "unconfirmed"
          ? "no verified renderer startup; no retry"
          : outcome.status === "closed" || outcome.status === "failed"
            ? "session launch slot cannot be reused"
            : outcome.status === "idle"
              ? "not armed; no launch requested"
              : outcome.status === "unavailable" || outcome.status === "disposed"
                ? "observer unavailable; startup not proven"
                : "no launch requested";
  return {
    message:
      `ASC observer: ${outcome.status}${outcome.effectDisposition ? ` (${outcome.effectDisposition})` : ""} — ${explanation}${outcome.detail ? `. ${outcome.detail}` : ""}`.slice(
        0,
        4096,
      ),
    level:
      outcome.status === "launched" || outcome.status === "armed" || outcome.status === "idle"
        ? "info"
        : "warning",
  };
}

export function createSidequestSubagentDiagnostics(pi: ExtensionAPI) {
  let generation = 0;
  let context: ExtensionContext | undefined;
  let controller: AscExecutionObserverController | undefined;
  let cwd: string | undefined;
  let sessionKey: string | undefined;
  let unsubscribe: (() => void) | undefined;
  function stop() {
    generation++;
    context = undefined;
    controller = undefined;
    unsubscribe?.();
    unsubscribe = undefined;
  }
  function subscribe() {
    const epoch = generation;
    unsubscribe = pi.events?.on?.(ASC_SUBAGENT_OBSERVER_DIAGNOSE_EVENT, async (original) => {
      const request = parse(original);
      const ctx = context;
      const observer = controller;
      const eligible = () => {
        try {
          return (
            epoch === generation &&
            context === ctx &&
            !!ctx &&
            ctx.mode === "tui" &&
            ctx.hasUI &&
            ctx.cwd === cwd &&
            ctx.sessionManager.getSessionId?.() === sessionKey &&
            request?.cwd === cwd &&
            request?.parentSessionKey === sessionKey
          );
        } catch {
          return false;
        }
      };
      if (!request || !observer || !ctx || !eligible() || claimed.has(original as object)) return;
      // Claim before open (and before a reentrant reply): ineligible listeners never claim.
      claimed.add(original as object);
      let response: ReturnType<typeof result>;
      try {
        observer.setHostContext({
          mode: ctx.mode,
          hasUI: ctx.hasUI,
          cwd: request.cwd,
          sessionId: sessionKey,
        });
        response = result(request.action === "status" ? observer.status() : await observer.open());
      } catch {
        response = {
          message: "ASC observer: unavailable — startup not proven; no retry",
          level: "warning",
        };
      }
      if (!eligible()) return;
      try {
        request.reply({ requestId: request.requestId, ...response });
      } catch {
        /* no retry */
      }
    });
  }
  subscribe(); // No context until session_start; safe in resource-only loads.
  return {
    stop,
    start(ctx: ExtensionContext, observer: AscExecutionObserverController) {
      stop();
      context = ctx;
      controller = observer;
      cwd = ctx.cwd;
      sessionKey = ctx.sessionManager.getSessionId?.();
      subscribe();
    },
  };
}
