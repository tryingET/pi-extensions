// summary: orchestrates visible Pi session launch through existing Ghostty and detached-window owners with exact-target refusal before session dispatch.
// read_when:
//   - changing Ghostty launch routing, model/thinking/cwd propagation, fallback, or observer session launch.

import { existsSync } from "node:fs";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import type { AscObserverLaunchRequest } from "../src/ascExecutionObserver.ts";
import {
  assertBoundedLaunchArgv,
  assertDispatchWindow,
  invalidLaunchOutcome,
  prepareLaunchArguments,
  runAdmittedLaunch,
  type SidequestLaunchOutcome,
  settleLaunchOutcome,
  validLaunchArgv,
} from "./sidequestLaunchAdmission.ts";

export {
  assertBoundedLaunchArgv,
  type SidequestLaunchOutcome,
} from "./sidequestLaunchAdmission.ts";

import { launchDetachedGhosttyWindow } from "./sidequestDetachedWindow.ts";
import {
  buildControllerGhosttyDbusArgs,
  buildGhosttyArgs,
  buildGhosttyExecArgs,
  type ExecRunner,
  findGhosttyAncestor,
  GHOSTTY_PROBE_TIMEOUT_MS,
  getGhosttySurfaceId,
  isGhosttySession,
  type LaunchMode,
  type LaunchResult,
  LOCAL_GHOSTTY_WRAPPER,
  resolveControllerGhosttyDbusTarget,
  resolveGhosttyBin,
} from "./sidequestGhostty.ts";
import { detectPostLaunchPlacementMismatch } from "./sidequestLaunchPlacement.ts";
import {
  describeWindowFallback,
  joinLaunchNotes,
  type ModelLike,
  runGhosttyLaunch,
  summarizeLaunchFailure,
  summarizePrompt,
} from "./sidequestLaunchResult.ts";
import type { SidequestLaunchOptions, SidequestLaunchRequest } from "./sidequestLaunchTypes.ts";

export type { SidequestLaunchOptions } from "./sidequestLaunchTypes.ts";

export const STANDING_AGENT_TRANSPORT_VERSION = 1;
export const STANDING_AGENT_DISPATCH_GUARD_VERSION = 1;
const DEFAULT_PEER_LAUNCH_STAGGER_MS = 1000;

type QuestSessionMode = "fork" | "clean";
let peerLaunchStaggerTail: Promise<void> = Promise.resolve();
let lastPeerLaunchStartedAt = 0;

function sleep(ms: number): Promise<void> {
  return new Promise((resolveSleep) => setTimeout(resolveSleep, ms));
}

function resolvePeerLaunchStaggerMs({
  env,
  hasCustomExec,
}: {
  env: NodeJS.ProcessEnv;
  hasCustomExec: boolean;
}): number {
  const raw = env.PI_SIDEQUEST_LAUNCH_STAGGER_MS?.trim();
  if (raw) {
    const parsed = Number.parseInt(raw, 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
  }

  // Unit tests and dry harnesses usually provide a custom exec stub. Keep them fast unless
  // they explicitly opt into exercising the stagger behavior.
  return hasCustomExec ? 0 : DEFAULT_PEER_LAUNCH_STAGGER_MS;
}

async function reservePeerLaunchStagger(options: {
  env: NodeJS.ProcessEnv;
  hasCustomExec: boolean;
}): Promise<(dispatchAttempted?: boolean) => void> {
  const staggerMs = resolvePeerLaunchStaggerMs(options);
  if (staggerMs <= 0) return () => {};
  const previous = peerLaunchStaggerTail.catch(() => undefined);
  let unlock!: () => void;
  peerLaunchStaggerTail = new Promise<void>((resolveSlot) => {
    unlock = resolveSlot;
  });
  await previous;
  // The slot stays held through Describe and final identity checks. Time is monotonic.
  while (lastPeerLaunchStartedAt > 0) {
    const remaining = staggerMs - (performance.now() - lastPeerLaunchStartedAt);
    if (remaining <= 0) break;
    await sleep(remaining);
  }
  let released = false;
  return (dispatchAttempted = false) => {
    if (released) return;
    released = true;
    // Record after transport invocation (including synchronous throw), not before async inspection.
    if (dispatchAttempted) lastPeerLaunchStartedAt = performance.now();
    unlock();
  };
}

export async function launchPiQuestSession({
  pi,
  ctx,
  options,
  defaultPiBin,
  prompt,
  titlePrompt,
  cwd,
  sourceSessionFile,
  titlePrefix = "Sidequest",
  command,
  placementPolicy = "visible-fallback",
  modelArgs: modelArgsOverride,
  extraPiArgs,
  childProvenanceEnv,
  signal,
  beforeDispatch,
  dispatchDeadlineMs,
}: SidequestLaunchRequest): Promise<SidequestLaunchOutcome> {
  const env = options.env ?? process.env;
  const prepared = prepareLaunchArguments({
    env,
    parentCwd: ctx.cwd,
    model: ctx.model as ModelLike | undefined,
    thinkingLevel: pi.getThinkingLevel(),
    defaultPiBin,
    prompt,
    titlePrompt,
    titlePrefix,
    cwd,
    sourceSessionFile,
    command,
    modelArgs: modelArgsOverride,
    extraPiArgs,
    childProvenanceEnv,
    signal,
    beforeDispatch,
    dispatchDeadlineMs,
  });
  if (!prepared.ok) return invalidLaunchOutcome(Boolean(sourceSessionFile));
  const { title, piArgs } = prepared;
  const pathExists = options.pathExists ?? existsSync;
  const execRunner: ExecRunner = options.exec ?? ((cmd, args, opts) => pi.exec(cmd, args, opts));
  const controllerGhostty =
    options.currentGhosttyAncestor ??
    (options.exec ? undefined : findGhosttyAncestor(options.processId ?? process.pid));
  const currentSessionGhosttyBin = options.currentSessionGhosttyBin ?? controllerGhostty?.exe;
  const strictControllerBin = currentSessionGhosttyBin?.trim();
  let ghosttyBin =
    placementPolicy === "controller-tab-only"
      ? strictControllerBin && pathExists(strictControllerBin)
        ? strictControllerBin
        : ""
      : resolveGhosttyBin({ env, pathExists, currentSessionGhosttyBin });
  if (!validLaunchArgv([ghosttyBin])) return invalidLaunchOutcome(Boolean(sourceSessionFile));
  // +help is command-capability inspection, not a session launch. Unknown is NOT unsupported.
  const refuseBeforeDispatch = (
    failure: string,
  ): Extract<SidequestLaunchOutcome, { ok: false }> => ({
    ok: false,
    failure,
    effectDisposition: "confirmed_no_effects",
    launchMode: "tab",
    sessionMode: sourceSessionFile ? "fork" : "clean",
    cwd,
    sourceSessionFile,
    titleBase: title,
    promptSummary: summarizePrompt(titlePrompt),
    launchNote:
      "No session/tab/window dispatch attempted by this launch; inspection and prior bookkeeping are not global no-effects.",
  });
  const inspectNewTab = async (bin: string): Promise<boolean | undefined> => {
    try {
      const result = await execRunner(bin, ["+help"], { timeout: GHOSTTY_PROBE_TIMEOUT_MS });
      if (result.killed || result.code !== 0 || !result.stdout?.trim()) return undefined;
      if (result.stdout.includes("+new-tab")) return true;
      return result.stdout.includes("+new-window") ? false : undefined;
    } catch {
      return undefined;
    }
  };
  let supportsNewTab =
    process.platform === "linux" && ghosttyBin ? await inspectNewTab(ghosttyBin) : false;
  if (supportsNewTab === undefined)
    return refuseBeforeDispatch("Ghostty capability inspection unavailable; no launch attempted");
  let wrapperTabAttachNote: string | undefined;
  if (
    placementPolicy === "visible-fallback" &&
    process.platform === "linux" &&
    isGhosttySession(env) &&
    !supportsNewTab &&
    pathExists(LOCAL_GHOSTTY_WRAPPER) &&
    ghosttyBin !== LOCAL_GHOSTTY_WRAPPER
  ) {
    const wrapperSupportsNewTab = await inspectNewTab(LOCAL_GHOSTTY_WRAPPER);
    if (wrapperSupportsNewTab === undefined)
      return refuseBeforeDispatch("Ghostty wrapper inspection unavailable; no launch attempted");
    if (wrapperSupportsNewTab) {
      ghosttyBin = LOCAL_GHOSTTY_WRAPPER;
      supportsNewTab = true;
      wrapperTabAttachNote = "wrapper advertises tabs; exact controller action still required";
    }
  }
  const requestedSurfaceId = getGhosttySurfaceId(env);
  // Do not run +new-tab, even with invalid argv, to discover surface targeting.
  const surfaceId = requestedSurfaceId;
  const windowFallbackReason = describeWindowFallback({ supportsNewTab, env });

  const sessionMode: QuestSessionMode = sourceSessionFile ? "fork" : "clean";
  let launchMode: LaunchMode = windowFallbackReason ? "window" : "tab";
  const controllerDbusTarget =
    launchMode === "tab"
      ? await resolveControllerGhosttyDbusTarget({
          execRunner,
          controllerGhostty,
          surfaceId,
          readProcessExecutable: options.readProcessExecutable,
        })
      : undefined;
  if (placementPolicy === "controller-tab-only" && !controllerDbusTarget) {
    const reason =
      windowFallbackReason ??
      (!controllerGhostty
        ? "controller Ghostty process could not be resolved"
        : !requestedSurfaceId
          ? "controller Ghostty surface id is unavailable"
          : !surfaceId
            ? "controller Ghostty surface targeting is unsupported"
            : "Ghostty single-instance D-Bus target could not be proven");
    return refuseBeforeDispatch(`exact controller Ghostty tab unavailable: ${reason}`);
  }
  if (launchMode === "tab" && !controllerDbusTarget)
    return refuseBeforeDispatch(
      "exact controller Ghostty tab unavailable: D-Bus target could not be proven",
    );
  const promptSummary = summarizePrompt(titlePrompt);
  const detachedWindowLauncher = options.detachedGhosttyWindowLaunch ?? launchDetachedGhosttyWindow;
  const useDetachedWindowLaunch =
    placementPolicy === "visible-fallback" &&
    (!options.exec || Boolean(options.detachedGhosttyWindowLaunch));
  const dispatchGuard = { beforeDispatch, dispatchDeadlineMs, signal };
  let launchedAfterMs = Date.now();
  const runWindowLaunch = (onInvoked?: () => void) => {
    const args = buildGhosttyArgs({ cwd, title, launchMode: "window", piArgs });
    return runAdmittedLaunch({
      ...dispatchGuard,
      argv: [ghosttyBin, ...args],
      onInvoked,
      invoke: () => {
        launchedAfterMs = Date.now();
        return useDetachedWindowLaunch
          ? detachedWindowLauncher({
              command: ghosttyBin,
              cwd,
              buildArgs: (launchHandshake) => {
                const complete = buildGhosttyArgs({
                  cwd,
                  title,
                  launchMode: "window",
                  piArgs,
                  launchHandshake,
                });
                assertBoundedLaunchArgv([ghosttyBin, ...complete]);
                assertDispatchWindow(dispatchGuard);
                return complete;
              },
            })
          : runGhosttyLaunch(execRunner, ghosttyBin, args, cwd);
      },
    });
  };
  const releaseLaunchSlot = await reservePeerLaunchStagger({
    env,
    hasCustomExec: Boolean(options.exec),
  });
  let launchResult: LaunchResult;
  let dispatchAttempted = false;
  const markInvoked = () => {
    dispatchAttempted = true;
    releaseLaunchSlot(true);
  };
  try {
    if (signal?.aborted)
      return { ...refuseBeforeDispatch("Cancelled before admission"), launchMode };
    if (launchMode === "tab") {
      const target = controllerDbusTarget!;
      try {
        const description = await execRunner(
          "busctl",
          [
            "--user",
            "call",
            target.busName,
            target.objectPath,
            "org.gtk.Actions",
            "Describe",
            "s",
            "new-tab",
          ],
          { timeout: GHOSTTY_PROBE_TIMEOUT_MS },
        );
        if (
          description.killed ||
          description.code !== 0 ||
          !/^\(bgav\)\s+true\s+"\(tas\)"\s+0\s*$/.test(description.stdout ?? "")
        )
          return refuseBeforeDispatch(
            "exact controller Ghostty new-tab action capability unavailable",
          );
        const fresh = await resolveControllerGhosttyDbusTarget({
          execRunner,
          controllerGhostty,
          surfaceId,
          readProcessExecutable: options.readProcessExecutable,
        });
        if (
          !fresh ||
          fresh.busName !== target.busName ||
          fresh.ownerPid !== target.ownerPid ||
          fresh.surfaceId !== target.surfaceId ||
          fresh.objectPath !== target.objectPath ||
          fresh.wellKnownName !== target.wellKnownName
        )
          return refuseBeforeDispatch(
            "exact controller Ghostty identity changed during capability inspection",
          );
      } catch {
        return refuseBeforeDispatch(
          "exact controller Ghostty action inspection failed; no launch attempted",
        );
      }
    }
    if (signal?.aborted)
      return { ...refuseBeforeDispatch("Cancelled before admission"), launchMode };
    if (launchMode === "window") {
      launchResult = await runWindowLaunch(markInvoked);
    } else {
      const args = buildControllerGhosttyDbusArgs({
        target: controllerDbusTarget!,
        execArgs: buildGhosttyExecArgs({ cwd, title, piArgs }),
      });
      launchResult = await runAdmittedLaunch({
        ...dispatchGuard,
        argv: ["busctl", ...args],
        onInvoked: markInvoked,
        invoke: () => {
          launchedAfterMs = Date.now();
          return runGhosttyLaunch(execRunner, "busctl", args, cwd);
        },
      });
    }
  } finally {
    // Inspection refusal releases without claiming a dispatch; cannot relabel a prior attempt.
    releaseLaunchSlot();
  }
  let launchNote = joinLaunchNotes(
    windowFallbackReason ?? wrapperTabAttachNote,
    controllerDbusTarget
      ? `targeted Ghostty process ${controllerDbusTarget.ownerPid} through ${controllerDbusTarget.busName}`
      : undefined,
    launchMode === "window" && useDetachedWindowLaunch && launchResult.ok
      ? "confirmed direct-window command admission through a private handshake"
      : undefined,
  );

  if (
    !launchResult.ok &&
    launchResult.effectDisposition === "confirmed_no_effects" &&
    dispatchAttempted && // A validation/owner/cancellation refusal must never trigger fallback.
    launchMode === "tab" &&
    placementPolicy === "visible-fallback"
  ) {
    const tabFailure = childProvenanceEnv
      ? "transport rejected admission"
      : summarizeLaunchFailure(launchResult);
    const fallbackResult = await runWindowLaunch();
    launchMode = "window";
    launchResult = fallbackResult;
    launchNote = fallbackResult.ok
      ? joinLaunchNotes(
          wrapperTabAttachNote,
          `same-window tab launch failed without effects (${tabFailure}); opened a new window instead`,
          useDetachedWindowLaunch
            ? "confirmed direct-window command admission through a private handshake"
            : undefined,
        )
      : joinLaunchNotes(
          wrapperTabAttachNote,
          `same-window tab launch failed without effects (${tabFailure}); direct new-window fallback did not settle`,
        );
  } else if (
    !launchResult.ok &&
    launchResult.effectDisposition === "effect_indeterminate" &&
    launchMode === "tab" &&
    placementPolicy === "visible-fallback"
  ) {
    launchNote = joinLaunchNotes(
      launchNote,
      "same-window launch effect is indeterminate; skipped automatic new-window retry to prevent a duplicate peer",
    );
  }

  if (launchResult.ok && placementPolicy === "visible-fallback") {
    launchNote = joinLaunchNotes(
      launchNote,
      await detectPostLaunchPlacementMismatch({
        env,
        options: {
          env,
          execProvided: Boolean(options.exec),
          processId: options.processId,
          presenceDir: options.presenceDir,
          placementVerificationTimeoutMs: options.placementVerificationTimeoutMs,
          currentGhosttyAncestor: options.currentGhosttyAncestor,
        },
        cwd,
        titleBase: title,
        launchMode,
        launchedAfterMs,
      }),
    );
  }

  return settleLaunchOutcome(
    launchResult,
    {
      launchMode,
      sessionMode,
      cwd,
      sourceSessionFile,
      titleBase: title,
      promptSummary,
      launchNote,
    },
    Boolean(childProvenanceEnv),
  );
}

export async function launchAscExecutionObserverSession(
  pi: ExtensionAPI,
  options: SidequestLaunchOptions,
  request: AscObserverLaunchRequest,
  defaultPiBin: string,
  observerScript: string,
) {
  const launch = await launchPiQuestSession({
    pi,
    ctx: {},
    options,
    defaultPiBin,
    prompt: "read-only ASC execution observation",
    titlePrompt: request.title,
    titlePrefix: "ASC observer",
    placementPolicy: "controller-tab-only",
    cwd: request.cwd,
    command: {
      command: process.execPath,
      args: [
        observerScript,
        "--state",
        request.statePath,
        "--controller-instance",
        request.controllerInstanceId,
      ],
    },
  });
  return launch.ok
    ? {
        ok: true as const,
        launchMode: launch.launchMode,
        ...(launch.launchNote ? { note: launch.launchNote } : {}),
      }
    : {
        ok: false as const,
        launchMode: launch.launchMode,
        failure: launch.failure,
        ...(launch.launchNote ? { note: launch.launchNote } : {}),
      };
}
