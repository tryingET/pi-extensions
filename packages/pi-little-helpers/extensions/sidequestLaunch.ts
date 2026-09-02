// summary: orchestrates visible Pi session launch through existing Ghostty and detached-window owners without changing fallback semantics.
// read_when:
//   - changing Ghostty launch routing, model/thinking/cwd propagation, fallback, or observer session launch.

import { existsSync } from "node:fs";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import type { AscObserverLaunchRequest } from "../src/ascExecutionObserver.ts";
import {
  prefixPiArgsWithCompanyContext,
  resolveChildCompanyContext,
} from "../src/companyContextProvenance.ts";
import {
  type DetachedGhosttyWindowLaunchRequest,
  launchDetachedGhosttyWindow,
} from "./sidequestDetachedWindow.ts";
import {
  buildControllerGhosttyDbusArgs,
  buildGhosttyArgs,
  buildGhosttyExecArgs,
  type ExecRunner,
  findGhosttyAncestor,
  type GhosttyAncestor,
  getGhosttySurfaceId,
  isGhosttySession,
  type LaunchMode,
  type LaunchResult,
  LOCAL_GHOSTTY_WRAPPER,
  resolveControllerGhosttyDbusTarget,
  resolveGhosttyBin,
  supportsGhosttyNewTab,
  supportsGhosttySurfaceId,
} from "./sidequestGhostty.ts";
import { detectPostLaunchPlacementMismatch } from "./sidequestLaunchPlacement.ts";
import {
  buildModelArgs,
  buildTitle,
  describeWindowFallback,
  joinLaunchNotes,
  type ModelLike,
  runGhosttyLaunch,
  summarizeLaunchFailure,
  summarizePrompt,
} from "./sidequestLaunchResult.ts";

const DEFAULT_PEER_LAUNCH_STAGGER_MS = 1000;

type GhosttyCommandSpec = { command: string; args: string[] };
type DetachedGhosttyWindowLauncher = (
  request: DetachedGhosttyWindowLaunchRequest,
) => Promise<LaunchResult>;
export type SidequestLaunchOptions = {
  env?: NodeJS.ProcessEnv;
  exec?: ExecRunner;
  detachedGhosttyWindowLaunch?: DetachedGhosttyWindowLauncher;
  pathExists?: (path: string) => boolean;
  currentSessionGhosttyBin?: string;
  processId?: number;
  presenceDir?: string;
  placementVerificationTimeoutMs?: number;
  currentGhosttyAncestor?: GhosttyAncestor;
  readProcessExecutable?: (pid: number) => string | undefined;
};
type QuestSessionMode = "fork" | "clean";
type QuestPlacementPolicy = "visible-fallback" | "controller-tab-only";
type SidequestLaunchSuccess = {
  ok: true;
  effectDisposition: "settled";
  launchMode: LaunchMode;
  sessionMode: QuestSessionMode;
  cwd: string;
  sourceSessionFile?: string;
  titleBase: string;
  promptSummary: string;
  launchNote?: string;
};
type SidequestLaunchFailure = {
  ok: false;
  failure: string;
  effectDisposition: LaunchResult["effectDisposition"];
  launchMode: LaunchMode;
  sessionMode: QuestSessionMode;
  cwd: string;
  sourceSessionFile?: string;
  titleBase: string;
  promptSummary: string;
  launchNote?: string;
};
export type SidequestLaunchOutcome = SidequestLaunchSuccess | SidequestLaunchFailure;

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

async function waitForPeerLaunchStagger(options: {
  env: NodeJS.ProcessEnv;
  hasCustomExec: boolean;
}): Promise<number> {
  const staggerMs = resolvePeerLaunchStaggerMs(options);
  if (staggerMs <= 0) return 0;

  const previous = peerLaunchStaggerTail.catch(() => undefined);
  let waitedMs = 0;
  const next = previous.then(async () => {
    const elapsedMs =
      lastPeerLaunchStartedAt > 0 ? Date.now() - lastPeerLaunchStartedAt : staggerMs;
    waitedMs = Math.max(0, staggerMs - elapsedMs);
    if (waitedMs > 0) {
      await sleep(waitedMs);
    }
    lastPeerLaunchStartedAt = Date.now();
  });
  peerLaunchStaggerTail = next;
  await next;
  return waitedMs;
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
}: {
  pi: ExtensionAPI;
  ctx: { model?: unknown; cwd?: string };
  options: SidequestLaunchOptions;
  defaultPiBin: string;
  prompt: string;
  titlePrompt: string;
  cwd: string;
  sourceSessionFile?: string;
  titlePrefix?: string;
  command?: GhosttyCommandSpec;
  placementPolicy?: QuestPlacementPolicy;
}): Promise<SidequestLaunchOutcome> {
  const env = options.env ?? process.env;
  const pathExists = options.pathExists ?? existsSync;
  const execRunner: ExecRunner =
    options.exec ?? ((command, execArgs, execOptions) => pi.exec(command, execArgs, execOptions));
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
  const piBin = env.PI_SIDEQUEST_PI_BIN?.trim() || defaultPiBin;
  const thinkingLevel = pi.getThinkingLevel();
  const modelArgs = buildModelArgs(ctx.model as ModelLike | undefined, thinkingLevel);
  const title = buildTitle(titlePrompt, titlePrefix);
  let supportsNewTab =
    process.platform === "linux" && ghosttyBin
      ? await supportsGhosttyNewTab(execRunner, ghosttyBin)
      : false;
  let wrapperTabAttachNote: string | undefined;
  if (
    placementPolicy === "visible-fallback" &&
    process.platform === "linux" &&
    isGhosttySession(env) &&
    !supportsNewTab &&
    pathExists(LOCAL_GHOSTTY_WRAPPER) &&
    ghosttyBin !== LOCAL_GHOSTTY_WRAPPER
  ) {
    const wrapperSupportsNewTab = await supportsGhosttyNewTab(execRunner, LOCAL_GHOSTTY_WRAPPER);
    if (wrapperSupportsNewTab) {
      ghosttyBin = LOCAL_GHOSTTY_WRAPPER;
      supportsNewTab = true;
      wrapperTabAttachNote =
        "current Ghostty binary does not support +new-tab; used sidequest wrapper for tab launch";
    }
  }
  const requestedSurfaceId = getGhosttySurfaceId(env);
  const surfaceId =
    supportsNewTab && requestedSurfaceId && (await supportsGhosttySurfaceId(execRunner, ghosttyBin))
      ? requestedSurfaceId
      : undefined;
  const windowFallbackReason = describeWindowFallback({
    supportsNewTab,
    env,
  });

  const sessionMode: QuestSessionMode = sourceSessionFile ? "fork" : "clean";
  const rawPiArgs = command
    ? [command.command, ...command.args]
    : sourceSessionFile
      ? [piBin, "--fork", sourceSessionFile, ...modelArgs, prompt]
      : [piBin, ...modelArgs, prompt];
  const companyProvenance = command
    ? undefined
    : resolveChildCompanyContext({ env, targetCwd: cwd, parentCwd: ctx.cwd });
  const piArgs =
    companyProvenance && companyProvenance.source !== "target_cwd"
      ? prefixPiArgsWithCompanyContext(rawPiArgs, companyProvenance)
      : rawPiArgs;
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
  const promptSummary = summarizePrompt(titlePrompt);
  const detachedWindowLauncher = options.detachedGhosttyWindowLaunch ?? launchDetachedGhosttyWindow;
  const useDetachedWindowLaunch =
    placementPolicy === "visible-fallback" &&
    (!options.exec || Boolean(options.detachedGhosttyWindowLaunch));
  const runWindowLaunch = () =>
    useDetachedWindowLaunch
      ? detachedWindowLauncher({
          command: ghosttyBin,
          cwd,
          buildArgs: (launchHandshake) =>
            buildGhosttyArgs({
              cwd,
              title,
              launchMode: "window",
              piArgs,
              launchHandshake,
            }),
        })
      : runGhosttyLaunch(
          execRunner,
          ghosttyBin,
          buildGhosttyArgs({
            cwd,
            title,
            launchMode: "window",
            piArgs,
          }),
          cwd,
        );
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
    return {
      ok: false,
      failure: `exact controller Ghostty tab unavailable: ${reason}`,
      effectDisposition: "confirmed_no_effects",
      launchMode: "tab",
      sessionMode,
      cwd,
      sourceSessionFile,
      titleBase: title,
      promptSummary,
    };
  }
  await waitForPeerLaunchStagger({ env, hasCustomExec: Boolean(options.exec) });
  const launchedAfterMs = Date.now();
  const ghosttyExecArgs = buildGhosttyExecArgs({ cwd, title, piArgs });
  let launchResult =
    launchMode === "window"
      ? await runWindowLaunch()
      : controllerDbusTarget
        ? await runGhosttyLaunch(
            execRunner,
            "busctl",
            buildControllerGhosttyDbusArgs({
              target: controllerDbusTarget,
              execArgs: ghosttyExecArgs,
            }),
            cwd,
          )
        : await runGhosttyLaunch(
            execRunner,
            ghosttyBin,
            buildGhosttyArgs({
              cwd,
              title,
              launchMode,
              surfaceId,
              piArgs,
            }),
            cwd,
          );
  let launchNote = joinLaunchNotes(
    windowFallbackReason ?? wrapperTabAttachNote,
    controllerDbusTarget
      ? `targeted Ghostty single-instance process ${controllerDbusTarget.ownerPid} through ${controllerDbusTarget.busName}`
      : undefined,
    launchMode === "window" && useDetachedWindowLaunch && launchResult.ok
      ? "confirmed direct-window command admission through a private handshake"
      : undefined,
  );

  if (
    !launchResult.ok &&
    launchResult.effectDisposition === "confirmed_no_effects" &&
    launchMode === "tab" &&
    placementPolicy === "visible-fallback"
  ) {
    const tabFailure = summarizeLaunchFailure(launchResult);
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

  if (!launchResult.ok) {
    return {
      ok: false,
      failure: summarizeLaunchFailure(launchResult),
      effectDisposition: launchResult.effectDisposition,
      launchMode,
      sessionMode,
      cwd,
      sourceSessionFile,
      titleBase: title,
      promptSummary,
      launchNote,
    };
  }

  return {
    ok: true,
    effectDisposition: "settled",
    launchMode,
    sessionMode,
    cwd,
    sourceSessionFile,
    titleBase: title,
    promptSummary,
    launchNote,
  };
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
