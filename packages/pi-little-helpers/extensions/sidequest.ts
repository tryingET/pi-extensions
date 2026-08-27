// summary: "registers visible peer, candidate worktree, cleanup, and visible-loop launch surfaces backed by Ghostty"
// read_when:
//   - "changing peer launch prompts, worktree preparation, report-back policy, cleanup tools, or loop command registration"

import { fileURLToPath } from "node:url";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import {
  ASC_EXECUTION_OBSERVATION_EVENT,
  type AscExecutionObserverController,
  createAscExecutionObserverController,
} from "../src/ascExecutionObserver.ts";
import {
  bindCandidateAdmission,
  releaseCandidateAdmission,
  reserveCandidateAdmission,
} from "../src/candidatePeerAdmission.ts";
import {
  executeCandidatePeerCloseout as executeLifecycleCandidatePeerCloseout,
  projectCandidatePeerCloseout,
} from "../src/candidatePeerCloseout.ts";
import { runCandidatePeerJanitor } from "../src/candidatePeerJanitor.ts";
import { LITTLE_HELPERS_CAPABILITY_MANIFEST } from "../src/capabilityManifest.ts";
import type { RunVisibleLoopGovernedPreflight } from "../src/visibleLoop.ts";

export const SIDEQUEST_CAPABILITY_MANIFEST = LITTLE_HELPERS_CAPABILITY_MANIFEST;

const DEFAULT_PI_BIN = process.env.PI_SIDEQUEST_PI_BIN || "pi";

import { registerCandidateCloseoutTools } from "./sidequestCandidateCloseoutTools.ts";
import { registerCandidatePeerSpawnTool } from "./sidequestCandidateSpawnTool.ts";
import {
  createSidequestCommandHandlers,
  type SidequestCommandHandlerOptions,
} from "./sidequestCommandHandlers.ts";
import { registerSidequestCommands } from "./sidequestCommands.ts";
import { launchAscExecutionObserverSession } from "./sidequestLaunch.ts";
import { registerSidequestPeerTools } from "./sidequestPeerTools.ts";
import { createSidequestVisibleLoopAdapter } from "./sidequestVisibleLoopAdapter.ts";

export type { GhosttyAncestor } from "./sidequestGhostty.ts";
export {
  findGhosttyAncestor,
  findGhosttyAncestorBin,
  getGhosttySurfaceId,
  ghosttyVersionSupportsSurfaceId,
  resolveControllerGhosttyDbusTarget,
  resolveGhosttyBin,
} from "./sidequestGhostty.ts";

const ASC_EXECUTION_OBSERVER_SCRIPT = fileURLToPath(
  new URL("../scripts/asc-execution-observer.mjs", import.meta.url),
);

type PiCommandContext = Parameters<Parameters<ExtensionAPI["registerCommand"]>[1]["handler"]>[1];
type SidequestOptions = SidequestCommandHandlerOptions & {
  registerCommands?: boolean;
  registerTools?: boolean;
  governedDeepReviewPreflight?: RunVisibleLoopGovernedPreflight;
  ascExecutionObserver?: AscExecutionObserverController;
  ascObserverStateRoot?: string;
  candidateAdmission?: {
    reserve: typeof reserveCandidateAdmission;
    bind: typeof bindCandidateAdmission;
    release: typeof releaseCandidateAdmission;
  };
  candidateCloseout?: {
    project: typeof projectCandidatePeerCloseout;
    execute: typeof executeLifecycleCandidatePeerCloseout;
    janitor: typeof runCandidatePeerJanitor;
  };
};

export function createSidequestExtension(options: SidequestOptions = {}) {
  return function sidequestExtension(pi: ExtensionAPI) {
    const registerCommands = options.registerCommands ?? true;
    const registerTools = options.registerTools ?? true;
    const reserveAdmission = options.candidateAdmission?.reserve ?? reserveCandidateAdmission;
    const bindAdmission = options.candidateAdmission?.bind ?? bindCandidateAdmission;
    const releaseAdmission = options.candidateAdmission?.release ?? releaseCandidateAdmission;
    const projectCloseout = options.candidateCloseout?.project ?? projectCandidatePeerCloseout;
    const executeCloseout =
      options.candidateCloseout?.execute ?? executeLifecycleCandidatePeerCloseout;
    const runCloseoutJanitor = options.candidateCloseout?.janitor ?? runCandidatePeerJanitor;
    let currentObserverContext: PiCommandContext | undefined;
    let stopAscObservation: (() => void) | undefined;
    const ascExecutionObserver =
      options.ascExecutionObserver ??
      createAscExecutionObserverController({
        env: options.env ?? process.env,
        processId: options.processId ?? process.pid,
        stateRoot: options.ascObserverStateRoot,
        launch: (request) =>
          launchAscExecutionObserverSession(
            pi,
            options,
            request,
            DEFAULT_PI_BIN,
            ASC_EXECUTION_OBSERVER_SCRIPT,
          ),
        onLaunchFailure: (message) => {
          if (currentObserverContext?.mode === "tui" && currentObserverContext.hasUI) {
            currentObserverContext.ui.notify(message, "warning");
          }
        },
      });

    if (registerCommands) {
      stopAscObservation = pi.events?.on?.(ASC_EXECUTION_OBSERVATION_EVENT, (event) => {
        ascExecutionObserver.handle(event);
      });
      pi.on?.("session_start", async (_event, ctx) => {
        currentObserverContext = ctx as PiCommandContext;
        ascExecutionObserver.setHostContext({
          mode: ctx.mode,
          hasUI: ctx.hasUI,
          cwd: ctx.cwd,
          sessionId: ctx.sessionManager.getSessionId?.(),
        });
      });
      pi.on?.("session_shutdown", async () => {
        stopAscObservation?.();
        stopAscObservation = undefined;
        currentObserverContext = undefined;
        await ascExecutionObserver.dispose();
      });
    }

    const visibleLoopAdapter = createSidequestVisibleLoopAdapter({
      pi,
      options,
      defaultPiBin: DEFAULT_PI_BIN,
    });

    const commandHandlers = createSidequestCommandHandlers({
      pi,
      options,
      defaultPiBin: DEFAULT_PI_BIN,
      reserveAdmission,
      bindAdmission,
      releaseAdmission,
    });

    if (registerCommands) {
      registerSidequestCommands(pi, {
        handoffTab: commandHandlers.handoffTab,
        sidequest: commandHandlers.sidequest,
        scoutPeer: commandHandlers.scoutPeer,
        parallelQuest: commandHandlers.parallelQuest,
        visibleLoop: visibleLoopAdapter.commandHandlers.visibleLoop,
        nexusLoop: visibleLoopAdapter.commandHandlers.nexusLoop,
        visibleLoopChild: visibleLoopAdapter.commandHandlers.visibleLoopChild,
        visibleLoopChildComplete: visibleLoopAdapter.commandHandlers.visibleLoopChildComplete,
      });
      visibleLoopAdapter.registerCommandInput();
    }

    visibleLoopAdapter.registerLifecycleEvents();

    if (!registerTools) return;

    if (registerCommands) visibleLoopAdapter.registerCompletionTool();

    registerSidequestPeerTools({ pi, options, defaultPiBin: DEFAULT_PI_BIN });

    registerCandidatePeerSpawnTool({
      pi,
      options,
      defaultPiBin: DEFAULT_PI_BIN,
      reserveAdmission,
      bindAdmission,
      releaseAdmission,
    });
    registerCandidateCloseoutTools({
      pi,
      env: options.env ?? process.env,
      projectCloseout,
      executeCloseout,
      runCloseoutJanitor,
    });
  };
}

export default createSidequestExtension();
