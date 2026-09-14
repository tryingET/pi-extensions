// summary: type-only options and request shape for visible Pi quest session launch.
// read_when:
//   - changing launch request typing without changing orchestration or dispatch.

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import type { DetachedGhosttyWindowLaunchRequest } from "./sidequestDetachedWindow.ts";
import type { ExecRunner, GhosttyAncestor, LaunchResult } from "./sidequestGhostty.ts";
import type { BeforeDispatch } from "./sidequestLaunchAdmission.ts";

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
type QuestPlacementPolicy = "visible-fallback" | "controller-tab-only";

export type SidequestLaunchRequest = {
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
  /** Replaces controller-derived model/thinking args (Fleet Phase-3 standing agents pin their own). */
  modelArgs?: string[];
  /** Inserted between model args and the trailing prompt on the clean-session path only. */
  extraPiArgs?: string[];
  /** Additive child-only provenance; never replaces company provenance or arbitrary environment. */
  childProvenanceEnv?: Record<string, string>;
  signal?: AbortSignal;
  beforeDispatch?: BeforeDispatch;
  dispatchDeadlineMs?: number;
};
