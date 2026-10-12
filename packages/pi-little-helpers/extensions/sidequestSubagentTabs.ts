// LH hosts one fixed view-only native Pi transport. ASC callbacks own attachment truth.
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { findGhosttyAncestor } from "./sidequestGhostty.ts";
import { launchPiQuestSession, type SidequestLaunchOptions } from "./sidequestLaunch.ts";
import {
  ASC_SUBAGENT_TABS_EVENT,
  boundedText,
  nativeViewerArgs,
  parseTabRequest,
  safeTabPaths,
  sameTabContext,
  type TabItem,
  type TabRequest,
  type TabResult,
  type TabSettlement,
  tabDetail,
} from "./sidequestSubagentTabsProtocol.ts";

type Launch = typeof launchPiQuestSession;
export type SubagentTabsOptions = SidequestLaunchOptions & {
  /** Source-test seam only, never event-provided. */
  subagentTabsLaunch?: Launch;
};
const TRANSPORT_TIMEOUT_MS = 20000;
const READY_TIMEOUT_MS = 4000;
const QUEUE_TIMEOUT_MS = 16 * (TRANSPORT_TIMEOUT_MS + READY_TIMEOUT_MS + 1000);
const NO_RETRY = "Native viewer readiness unconfirmed; no retry. Placement/visibility not proven.";

// Pi wraps the same underlying event bus in distinct per-extension API/events objects.
// Original payload identity, not API identity or requestId, elects exactly one completion owner.
// The process-wide weak fence also survives module reload/copies without retaining requests.
const DELIVERY_FENCE = Symbol.for("tryinget.pi.asc-subagent-tabs.delivery.v1");
const processState = globalThis as typeof globalThis & { [DELIVERY_FENCE]?: WeakSet<object> };
processState[DELIVERY_FENCE] ??= new WeakSet<object>();
const consumedDeliveries = processState[DELIVERY_FENCE];

type Work = {
  request: TabRequest;
  item: TabItem;
  abort: AbortController;
  fence: AbortSignal;
  admitted: boolean;
  settled: boolean;
};
function settle(work: Work, result: TabSettlement): boolean {
  if (work.settled) return true;
  work.settled = true; // Callback throw must not cause a second settlement or transport.
  try {
    work.request.settle(work.item.key, result);
    return true;
  } catch {
    return false;
  }
}
function readResult(request: TabRequest, item: TabItem, reused: boolean): TabResult {
  try {
    const state = request.read(item.key);
    if (!state || !boundedText(state.status, 64)) throw new Error("invalid owner read");
    return {
      key: item.key,
      status: state.status === "ready" ? (reused ? "reuse" : "ready") : state.status,
      detail:
        state.status === "ready"
          ? "ASC native-ready ACK verified; actual tab/window placement and visibility not proven."
          : (tabDetail(state.detail) ?? NO_RETRY),
    };
  } catch {
    return { key: item.key, status: "unconfirmed", detail: "Owner read unavailable; no retry." };
  }
}

/** Bound waits, consume late rejection, and cancel pre-dispatch admission on timeout/disposal. */
async function bounded<T>(
  pending: Promise<T>,
  ms: number,
  signal: AbortSignal,
): Promise<T | undefined> {
  if (signal.aborted) {
    void pending.catch(() => undefined);
    return;
  }
  let timer: ReturnType<typeof setTimeout> | undefined;
  let wake!: () => void;
  const stopped = new Promise<undefined>((resolve) => {
    wake = () => resolve(undefined);
    timer = setTimeout(wake, ms);
    signal.addEventListener("abort", wake, { once: true });
  });
  try {
    return await Promise.race([pending, stopped]);
  } finally {
    clearTimeout(timer);
    signal.removeEventListener("abort", wake);
  }
}
async function pause(signal: AbortSignal): Promise<void> {
  await bounded(new Promise<never>(() => {}), 100, signal);
}

export function registerSubagentTabHost(
  pi: ExtensionAPI,
  options: SubagentTabsOptions,
  defaultPiBin: string,
): void {
  const env = options.env ?? process.env;
  const launch = options.subagentTabsLaunch ?? launchPiQuestSession;
  let ctx: ExtensionContext | undefined;
  let disposed = true;
  let unsubscribe: (() => void) | undefined;
  let tail: Promise<unknown> = Promise.resolve();
  const workSet = new Set<Work>();
  const replies = new Map<TabRequest, (items: TabResult[]) => void>();

  const allowed = (request: TabRequest) => !disposed && sameTabContext(request, ctx, env);
  const run = async (work: Work): Promise<TabResult> => {
    const { request, item, abort } = work;
    const failed = (detail: string): TabResult => ({ key: item.key, status: "failed", detail });
    if (
      work.fence.aborted ||
      !allowed(request) ||
      !safeTabPaths(item, request) ||
      abort.signal.aborted
    ) {
      if (!work.fence.aborted && !disposed)
        settle(work, {
          ok: false,
          effectDisposition: "confirmed_no_effects",
          detail: "Host admission expired before dispatch.",
        });
      return failed("Host admission expired; no dispatch.");
    }
    const deadline = Date.now() + TRANSPORT_TIMEOUT_MS;
    let outcome: Awaited<ReturnType<Launch>> | undefined;
    try {
      outcome = await bounded(
        launch({
          pi,
          ctx: { cwd: request.cwd },
          options: {
            ...options,
            currentGhosttyAncestor:
              options.currentGhosttyAncestor ??
              (options.exec ? undefined : findGhosttyAncestor(options.processId ?? process.pid)),
            // Every external call is fenced, not only the final Activate. Native exec also aborts in-flight work.
            exec: async (command, args, execOptions) => {
              if (work.fence.aborted || abort.signal.aborted || Date.now() >= deadline)
                throw new Error("Native tab host disposed or expired");
              const boundedOptions = {
                ...execOptions,
                timeout: Math.min(
                  execOptions?.timeout ?? TRANSPORT_TIMEOUT_MS,
                  deadline - Date.now(),
                ),
              };
              return options.exec
                ? options.exec(command, args, boundedOptions)
                : pi.exec(command, args, { ...boundedOptions, signal: abort.signal });
            },
            // Preserve existing serialized launch policy, but never inherit an unbounded env delay.
            env: { ...env, PI_SIDEQUEST_LAUNCH_STAGGER_MS: "1000" },
          },
          defaultPiBin,
          prompt: "",
          titlePrompt: item.sessionName,
          titlePrefix: "ASC view",
          cwd: request.cwd,
          placementPolicy: "controller-tab-only",
          shellExitPolicy: "fail-closed",
          command: { command: defaultPiBin, args: nativeViewerArgs(item) },
          signal: abort.signal,
          dispatchDeadlineMs: deadline,
          beforeDispatch: async () => {
            const valid =
              !work.fence.aborted &&
              allowed(request) &&
              !abort.signal.aborted &&
              safeTabPaths(item, request);
            if (valid) work.admitted = true;
            return valid;
          },
        }),
        TRANSPORT_TIMEOUT_MS,
        abort.signal,
      );
    } catch {
      /* A transport throw never proves no effects. */
    }
    if (work.fence.aborted || disposed) return failed("Host disposed; no retry.");
    if (!outcome) abort.abort(); // Late inspection can never dispatch after the deadline.
    const disposition = outcome?.ok
      ? "settled"
      : outcome?.effectDisposition === "confirmed_no_effects"
        ? "confirmed_no_effects"
        : "effect_indeterminate";
    const settlementOk = settle(work, {
      ok: outcome?.ok === true,
      effectDisposition: disposition,
      detail: outcome?.ok
        ? "Transport accepted; native readiness and placement not proven."
        : disposition === "confirmed_no_effects"
          ? "Transport refused before effects; no retry."
          : "Transport indeterminate; no retry.",
    });
    if (!settlementOk)
      return {
        key: item.key,
        status: "unconfirmed",
        detail: "Owner settlement unavailable; no retry.",
      };
    if (disposition === "confirmed_no_effects")
      return failed("Transport refused with confirmed no effects; no retry.");
    // Separate polling fence from the transport abort: a timeout may still have a native ACK.
    const readyDeadline = Date.now() + READY_TIMEOUT_MS;
    while (!work.fence.aborted && !disposed && allowed(request)) {
      const state = readResult(request, item, false);
      if (
        state.status === "ready" ||
        state.status === "closed" ||
        state.status === "viewer_dead" ||
        state.status === "failed" ||
        state.status === "blocked"
      )
        return state;
      if (Date.now() >= readyDeadline) break;
      await pause(work.fence);
    }
    return { key: item.key, status: "unconfirmed", detail: NO_RETRY };
  };

  let shutdown = new AbortController();
  const handle = (value: unknown): void => {
    if (value && typeof value === "object" && consumedDeliveries.has(value)) return;
    const request = parseTabRequest(value);
    if (!request) return; // No trusted correlation/reply shape; no callbacks or external effects.
    const fence = shutdown.signal;
    const reply = (items: TabResult[]) => {
      if (disposed || fence.aborted) return;
      try {
        request.reply({ requestId: request.requestId, items });
      } catch {
        /* bounded owner boundary */
      }
    };
    // An ineligible listener is not this request's completion owner. In particular it
    // cannot send a first-wins blocked reply before another listener with the right ctx.
    if (!allowed(request)) return;
    const delivery = value as object; // parseTabRequest admitted an object, not its snapshot identity.
    const reject = (detail: string) => {
      // Let every synchronous listener try admission first. A valid consumer's election
      // suppresses these fallback diagnostics; multiple refusals still reply only once.
      queueMicrotask(() => {
        if (disposed || fence.aborted || !allowed(request) || consumedDeliveries.has(delivery))
          return;
        consumedDeliveries.add(delivery);
        reply(request.items.map((item) => ({ key: item.key, status: "blocked", detail })));
      });
    };
    if (request.items.some((item) => !safeTabPaths(item, request))) {
      reject("Invalid private ASC viewer/ticket path; no effects.");
      return;
    }
    if (workSet.size + request.items.length > 16 || replies.size >= 16) {
      reject("Host launch queue full; no effects.");
      return;
    }
    // Election is synchronous and precedes even the first owner claim or transport await.
    consumedDeliveries.add(delivery);
    const results: Array<TabResult | Promise<TabResult>> = [];
    // All durable claims happen synchronously, before any transport await or queue admission.
    for (const item of request.items) {
      let claim: ReturnType<TabRequest["claim"]>;
      try {
        claim = request.claim(item.key);
      } catch {
        results.push({
          key: item.key,
          status: "blocked",
          detail: "Owner claim unavailable; no dispatch or retry.",
        });
        continue;
      }
      if (
        !claim ||
        !["launch", "reuse", "blocked"].includes(claim.action) ||
        !boundedText(claim.status, 64)
      ) {
        results.push({
          key: item.key,
          status: "blocked",
          detail: "Invalid owner claim; no dispatch or retry.",
        });
      } else if (claim.action === "reuse") {
        results.push(readResult(request, item, true)); // Exactly zero launches, including pending/unknown.
      } else if (claim.action === "blocked") {
        results.push({
          key: item.key,
          status: "blocked",
          detail: tabDetail(claim.detail) ?? claim.status,
        });
      } else {
        const work: Work = {
          request,
          item,
          abort: new AbortController(),
          fence,
          admitted: false,
          settled: false,
        };
        workSet.add(work);
        const queuedAt = Date.now();
        const job = tail.then(async () => {
          if (Date.now() - queuedAt >= QUEUE_TIMEOUT_MS) work.abort.abort();
          try {
            return await run(work);
          } catch {
            if (!work.fence.aborted && !disposed)
              settle(work, {
                ok: false,
                effectDisposition: "effect_indeterminate",
                detail: "Host launch unavailable; no retry.",
              });
            return { key: item.key, status: "unconfirmed", detail: NO_RETRY };
          } finally {
            workSet.delete(work);
          }
        });
        tail = job.catch(() => undefined);
        results.push(job);
      }
    }
    replies.set(request, reply);
    void Promise.all(results).then((items) => {
      if (!disposed && replies.delete(request)) reply(items);
    });
  };
  const dispose = () => {
    unsubscribe?.();
    unsubscribe = undefined;
    if (disposed) return;
    // Fence first: callback reentrancy cannot admit more work during disposal.
    disposed = true;
    ctx = undefined;
    shutdown.abort();
    for (const work of workSet) {
      settle(work, {
        ok: false,
        effectDisposition: work.admitted ? "effect_indeterminate" : "confirmed_no_effects",
        detail: "Host disposed; no retry.",
      });
      work.abort.abort();
    }
    for (const request of replies.keys()) {
      try {
        request.reply({
          requestId: request.requestId,
          items: request.items.map((item) => ({
            key: item.key,
            status: "unconfirmed",
            detail: "Host disposed; readiness not proven; no retry.",
          })),
        });
      } catch {
        /* owner unavailable */
      }
    }
    replies.clear();
  };
  pi.on("session_start", (_event, context) => {
    dispose();
    shutdown = new AbortController();
    ctx = context;
    disposed = false;
    unsubscribe = pi.events.on(ASC_SUBAGENT_TABS_EVENT, handle);
  });
  pi.on("session_shutdown", dispose);
}
