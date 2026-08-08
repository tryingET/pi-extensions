// summary: "registers visible peer, candidate worktree, cleanup, and visible-loop launch surfaces backed by Ghostty"
// read_when:
//   - "changing peer launch prompts, worktree preparation, report-back policy, cleanup tools, or loop command registration"

import { createHash, randomUUID } from "node:crypto";
import {
  existsSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  readlinkSync,
  realpathSync,
} from "node:fs";
import { homedir } from "node:os";
import { basename, isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import {
  generateSessionCompactionHandoffPrompt,
  type SessionCompactionHandoffGenerationContext,
} from "@tryinget/pi-session-compaction/handoff-generation";
import { Type } from "typebox";
import {
  ASC_EXECUTION_OBSERVATION_EVENT,
  type AscExecutionObserverController,
  type AscObserverLaunchRequest,
  createAscExecutionObserverController,
} from "../src/ascExecutionObserver.ts";
import {
  bindCandidateAdmission,
  type CandidateAdmissionReservation,
  releaseCandidateAdmission,
  reserveCandidateAdmission,
} from "../src/candidatePeerAdmission.ts";
import {
  executeCandidatePeerCloseout as executeLifecycleCandidatePeerCloseout,
  projectCandidatePeerCloseout,
} from "../src/candidatePeerCloseout.ts";
import { runCandidatePeerJanitor } from "../src/candidatePeerJanitor.ts";
import {
  type CandidatePeerRegistryRecord,
  type CandidatePeerSafeNaming,
  createCandidatePeerRegistryRecord,
  getCandidatePeerRegistryPath,
  writeCandidatePeerRegistryRecord,
} from "../src/candidatePeerRegistry.ts";
import {
  LITTLE_HELPERS_CAPABILITY_MANIFEST,
  LITTLE_HELPERS_COMMAND_NAMES,
  LITTLE_HELPERS_PEER_TOOL_NAMES,
} from "../src/capabilityManifest.ts";
import {
  bindSelfEvolutionOwnerArtifact,
  type ContinueVisibleLoopInNewSession,
  createVisibleLoopRunConfig,
  DEFAULT_NEXUS_LOOP_PROFILE,
  DEFAULT_VISIBLE_LOOP_PROFILE,
  findSelfEvolutionExecutionEnvelope,
  getVisibleLoopStatusPath,
  handleVisibleLoopAgentSettled,
  handleVisibleLoopAgentStart,
  handleVisibleLoopMessageStart,
  handleVisibleLoopToolCall,
  handleVisibleLoopToolExecutionEnd,
  handleVisibleLoopToolExecutionStart,
  handleVisibleLoopToolResult,
  listMissingVisibleLoopPromptTemplates,
  NEXUS_LOOP_COMMAND,
  parseVisibleLoopCommandArgs,
  type RunVisibleLoopGovernedPreflight,
  renderVisibleLoopChildCommand,
  resolveParentPeerTarget,
  type SelfEvolutionCandidateCloseout,
  startVisibleLoopChildCompleteRunner,
  startVisibleLoopChildRunner,
  VISIBLE_LOOP_CHILD_COMMAND,
  VISIBLE_LOOP_CHILD_COMPLETE_COMMAND,
  VISIBLE_LOOP_COMMAND,
  type VisibleLoopCommandProfile,
  validatePersistedSelfEvolutionBinding,
  writeVisibleLoopRunConfig,
} from "../src/visibleLoop.ts";
import { checkAkTaskExecutionBinding } from "../src/visibleLoopTaskBinding.ts";

export const SIDEQUEST_CAPABILITY_MANIFEST = LITTLE_HELPERS_CAPABILITY_MANIFEST;

const [SIDEQUEST_COMMAND, SCOUTPEER_COMMAND, PARALLELQUEST_COMMAND, HANDOFF_TAB_COMMAND] =
  LITTLE_HELPERS_COMMAND_NAMES;
const [
  FORK_PEER_SPAWN_TOOL,
  SCOUT_PEER_SPAWN_TOOL,
  CANDIDATE_PEER_SPAWN_TOOL,
  CANDIDATE_PEER_CLEANUP_TOOL,
  CANDIDATE_PEER_CLOSEOUT_TOOL,
] = LITTLE_HELPERS_PEER_TOOL_NAMES;

const DEFAULT_PI_BIN = process.env.PI_SIDEQUEST_PI_BIN || "pi";
const GHOSTTY_PROBE_TIMEOUT_MS = 4000;
const GHOSTTY_LAUNCH_TIMEOUT_MS = 15000;
const DEFAULT_PEER_LAUNCH_STAGGER_MS = 1000;
const DEFAULT_HANDOFF_GOAL =
  "Continue the current session's unfinished operator-directed work from the verified next legal step.";
const HANDOFF_RUNTIME_READ_TIMEOUT_MS = 6000;
const HANDOFF_RUNTIME_READ_MAX_BYTES = 12 * 1024;
const TITLE_MAX_LEN = 48;
const GHOSTTY_BIN_NAME = "ghostty";
const LOCAL_GHOSTTY_WRAPPER = join(homedir(), ".local", "bin", "ghostty-sidequest");
const LOCAL_GHOSTTY_OPT_DIR = join(homedir(), ".local", "opt");
const LOCAL_GHOSTTY_BIN = join(LOCAL_GHOSTTY_OPT_DIR, "ghostty-sidequest", "bin", "ghostty");
const GHOSTTY_SIDEQUEST_DBUS_NAME = "com.tryinget.ghosttysidequest";
const GHOSTTY_SIDEQUEST_DBUS_PATH = "/com/tryinget/ghosttysidequest";
const ASC_EXECUTION_OBSERVER_SCRIPT = fileURLToPath(
  new URL("../scripts/asc-execution-observer.mjs", import.meta.url),
);

type PiToolParameters = Parameters<ExtensionAPI["registerTool"]>[0]["parameters"];
type PiCommandContext = Parameters<Parameters<ExtensionAPI["registerCommand"]>[1]["handler"]>[1];
type PiToolContext = Parameters<Parameters<ExtensionAPI["registerTool"]>[0]["execute"]>[4];

type LaunchMode = "tab" | "window";
type QuestSessionMode = "fork" | "clean";
type QuestPlacementPolicy = "visible-fallback" | "controller-tab-only";
type SidequestRole = "scout" | "reviewer";
type SidequestReportBack = "intercom" | "manual" | "none";
type CandidatePeerReportBack = SidequestReportBack;
type ForkPeerSpawnRequest = {
  objective?: string;
  cwd?: string;
  reportBack?: SidequestReportBack;
  parentPeerTarget?: string;
};

type ModelLike = {
  provider: string;
  id: string;
};

type ExecOptions = {
  cwd?: string;
  timeout?: number;
};

type ExecResult = {
  code: number;
  stdout?: string;
  stderr?: string;
  killed?: boolean;
};

type ExecRunner = (command: string, args: string[], options?: ExecOptions) => Promise<ExecResult>;

type LaunchResult = {
  ok: boolean;
  code: number;
  stdout: string;
  stderr: string;
  killed: boolean;
};

type GhosttyCommandSpec = {
  command: string;
  args: string[];
};

type SidequestOptions = {
  env?: NodeJS.ProcessEnv;
  exec?: ExecRunner;
  pathExists?: (path: string) => boolean;
  currentSessionGhosttyBin?: string;
  processId?: number;
  presenceDir?: string;
  placementVerificationTimeoutMs?: number;
  currentGhosttyAncestor?: GhosttyAncestor;
  registerCommands?: boolean;
  registerTools?: boolean;
  generateHandoffPrompt?: typeof generateSessionCompactionHandoffPrompt;
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

type SidequestContext = {
  campaignGoal?: string;
  primaryMetric?: string;
  currentBest?: string;
  blocker?: string;
  filesInScope?: string[];
  offLimits?: string[];
  constraints?: string[];
  artifactsToRead?: string[];
  currentFindings?: string[];
};

type SidequestSpawnRequest = {
  role?: SidequestRole;
  objective?: string;
  cwd?: string;
  reportBack?: SidequestReportBack;
  parentPeerTarget?: string;
  context?: SidequestContext;
  dod?: string[];
};

type CandidatePeerSpawnRequest = {
  objective?: string;
  cwd?: string;
  baseRef?: string;
  branchName?: string;
  workspaceRoot?: string;
  workspaceName?: string;
  filesInScope?: string[];
  offLimits?: string[];
  constraints?: string[];
  dod?: string[];
  reportBack?: CandidatePeerReportBack;
  parentPeerTarget?: string;
  requireCleanParent?: boolean;
  reuseExisting?: boolean;
};

type CandidatePeerCleanupRequest = {
  peerRunIds?: string[];
  execute?: boolean;
  closeVisibleResources?: boolean;
  integrationCloseoutStatus?: "successful" | "failed" | "missing";
};

type CandidatePeerCloseoutRequest = {
  action?:
    | "status"
    | "plan"
    | "execute_authorized"
    | "janitor_status"
    | "janitor_execute_authorized";
  peerRunIds?: string[];
  repoRoot?: string;
  overdueAfterMs?: number;
  taskId?: number;
  integrationCloseout?: {
    status?: "successful" | "failed" | "missing";
    commit?: string;
    summary?: string;
  };
  cleanupTrigger?: string;
};

type WorktreePrepareSuccess = {
  ok: true;
  parentCwd: string;
  repoRoot: string;
  worktreePath: string;
  branchName: string;
  baseRef: string;
  parentDirty: boolean;
  parentDirtyWarning?: string;
  reusedExisting: boolean;
  naming: CandidatePeerSafeNaming;
};

type WorktreePrepareFailure = {
  ok: false;
  error: string;
  parentCwd: string;
  repoRoot?: string;
  worktreePath?: string;
  branchName?: string;
  baseRef?: string;
  parentDirty?: boolean;
  parentDirtyWarning?: string;
  naming?: CandidatePeerSafeNaming;
};

type WorktreePrepareResult = WorktreePrepareSuccess | WorktreePrepareFailure;

type SidequestLaunchSuccess = {
  ok: true;
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
  launchMode: LaunchMode;
  sessionMode: QuestSessionMode;
  cwd: string;
  sourceSessionFile?: string;
  titleBase: string;
  promptSummary: string;
  launchNote?: string;
};

type SidequestLaunchOutcome = SidequestLaunchSuccess | SidequestLaunchFailure;

function asPiToolParameters(schema: unknown): PiToolParameters {
  return schema as PiToolParameters;
}

const reportBackParameter = Type.Optional(
  Type.Union([Type.Literal("intercom"), Type.Literal("manual"), Type.Literal("none")], {
    description:
      "Report-back mode. Controller-spawned quest tools default to intercom. Use manual or none only for intentionally unsupervised/manual-visible peers; they will not emit PEER_ACK/PEER_FINAL and peer_watch will have nothing to watch.",
  }),
);

const forkPeerSpawnParameters = asPiToolParameters(
  Type.Object({
    objective: Type.String({
      description: "Required non-empty prompt for the forked-context peer.",
    }),
    cwd: Type.Optional(
      Type.String({
        description: "Workspace cwd for the visible forked peer. Defaults to ctx.cwd.",
      }),
    ),
    reportBack: reportBackParameter,
    parentPeerTarget: Type.Optional(
      Type.String({ description: "Exact parent peer target/session id for intercom report-back." }),
    ),
  }),
);

const scoutPeerSpawnParameters = asPiToolParameters(
  Type.Object({
    role: Type.Optional(
      Type.Union([Type.Literal("scout"), Type.Literal("reviewer")], {
        description: "Visible scout peer role. Defaults to scout.",
      }),
    ),
    objective: Type.String({ description: "Required non-empty scouting/review objective." }),
    cwd: Type.Optional(
      Type.String({
        description: "Workspace cwd for the visible scout peer. Defaults to ctx.cwd.",
      }),
    ),
    reportBack: reportBackParameter,
    parentPeerTarget: Type.Optional(
      Type.String({ description: "Exact parent peer target/session id for intercom report-back." }),
    ),
    context: Type.Optional(
      Type.Object({
        campaignGoal: Type.Optional(Type.String()),
        primaryMetric: Type.Optional(Type.String()),
        currentBest: Type.Optional(Type.String()),
        blocker: Type.Optional(Type.String()),
        filesInScope: Type.Optional(Type.Array(Type.String())),
        offLimits: Type.Optional(Type.Array(Type.String())),
        constraints: Type.Optional(Type.Array(Type.String())),
        artifactsToRead: Type.Optional(Type.Array(Type.String())),
        currentFindings: Type.Optional(Type.Array(Type.String())),
      }),
    ),
    dod: Type.Optional(
      Type.Array(Type.String({ description: "Additional request-specific DoD items." })),
    ),
  }),
);

const visibleLoopCloseoutResolutionParameters = Type.Object({
  resolution: Type.String({
    description: "satisfied, explicitly_deferred, or not_required",
  }),
  evidence: Type.Array(
    Type.Object({
      kind: Type.String({ description: "command, artifact, receipt, or owner_defer" }),
      ref: Type.String({
        description:
          "Host-correlatable reference: bash toolCallId, ASC live-proof runId, or canonical repo-relative owner-artifact path.",
      }),
      status: Type.String({ description: "passed, verified, or recorded" }),
    }),
    { description: "Typed closeout evidence entries." },
  ),
});

const visibleLoopChildCompleteToolParameters = asPiToolParameters(
  Type.Object({
    configPath: Type.String({
      description: "Exact visible-loop config path from the internal completion command/tool.",
    }),
    iteration: Type.Number({
      description: "The visible-loop iteration that just completed.",
    }),
    candidateCloseout: Type.Optional(
      Type.Object({
        candidateId: Type.String(),
        reflection: visibleLoopCloseoutResolutionParameters,
        liveRuntimeProof: visibleLoopCloseoutResolutionParameters,
        insightPromotion: visibleLoopCloseoutResolutionParameters,
      }),
    ),
  }),
);

const candidatePeerCleanupParameters = asPiToolParameters(
  Type.Object({
    peerRunIds: Type.Array(Type.String(), {
      description:
        "Exact candidate peer run ids to clean up from registry sidecars. The tool never fuzzy-matches resources.",
    }),
    execute: Type.Optional(
      Type.Boolean({
        description:
          "When false or omitted, return the historical registry-v1 dry-run projection. true is permanently blocked; use candidate lifecycle v2 for executable cleanup.",
      }),
    ),
    closeVisibleResources: Type.Optional(
      Type.Boolean({
        description:
          "Historical projection only. This option cannot authorize v1 execution and remains visible solely for packet inspection.",
      }),
    ),
    integrationCloseoutStatus: Type.Optional(
      Type.Union([Type.Literal("successful"), Type.Literal("failed"), Type.Literal("missing")], {
        description:
          "Historical compatibility field only. No value authorizes registry-v1 execution.",
      }),
    ),
  }),
);

const candidatePeerCloseoutParameters = asPiToolParameters(
  Type.Object({
    action: Type.Union([
      Type.Literal("status"),
      Type.Literal("plan"),
      Type.Literal("execute_authorized"),
      Type.Literal("janitor_status"),
      Type.Literal("janitor_execute_authorized"),
    ]),
    peerRunIds: Type.Optional(
      Type.Array(Type.String(), {
        description: "Exact peer-run aliases. Required for status, plan, and execute_authorized.",
      }),
    ),
    repoRoot: Type.Optional(
      Type.String({
        description:
          "Absolute normalized owner repository root. Required for both janitor actions.",
      }),
    ),
    overdueAfterMs: Type.Optional(
      Type.Number({ description: "Reporting interval only; age never authorizes cleanup." }),
    ),
    taskId: Type.Optional(
      Type.Number({
        description: "Non-authorizing planning context echoed for controller review.",
      }),
    ),
    integrationCloseout: Type.Optional(
      Type.Object({
        status: Type.Union([
          Type.Literal("successful"),
          Type.Literal("failed"),
          Type.Literal("missing"),
        ]),
        commit: Type.Optional(Type.String()),
        summary: Type.Optional(Type.String()),
      }),
    ),
    cleanupTrigger: Type.Optional(
      Type.String({ description: "Non-authorizing controller handoff context." }),
    ),
  }),
);

const candidatePeerSpawnParameters = asPiToolParameters(
  Type.Object({
    objective: Type.String({ description: "Required non-empty candidate mutation objective." }),
    cwd: Type.Optional(Type.String({ description: "Parent/controller cwd. Defaults to ctx.cwd." })),
    baseRef: Type.Optional(Type.String({ description: "Git base ref. Defaults to HEAD." })),
    branchName: Type.Optional(
      Type.String({ description: "Candidate branch name. Defaults to candidatepeer/<slug>." }),
    ),
    workspaceRoot: Type.Optional(
      Type.String({ description: "Root directory for generated candidate peer worktrees." }),
    ),
    workspaceName: Type.Optional(Type.String({ description: "Worktree directory name." })),
    filesInScope: Type.Optional(Type.Array(Type.String())),
    offLimits: Type.Optional(Type.Array(Type.String())),
    constraints: Type.Optional(Type.Array(Type.String())),
    dod: Type.Optional(Type.Array(Type.String())),
    reportBack: reportBackParameter,
    parentPeerTarget: Type.Optional(
      Type.String({ description: "Exact parent peer target/session id for intercom report-back." }),
    ),
    requireCleanParent: Type.Optional(
      Type.Boolean({ description: "Fail closed if the parent checkout has uncommitted changes." }),
    ),
    reuseExisting: Type.Optional(
      Type.Boolean({ description: "Reuse an existing verified worktree at the requested path." }),
    ),
  }),
);

function getPrompt(args?: string): string | undefined {
  const prompt = args?.trim();
  return prompt ? prompt : undefined;
}

function boundHandoffRuntimeReadback(value: string): string {
  const bytes = Buffer.from(value, "utf8");
  if (bytes.length <= HANDOFF_RUNTIME_READ_MAX_BYTES) return value;
  return `${bytes.subarray(0, HANDOFF_RUNTIME_READ_MAX_BYTES).toString("utf8")}\n[truncated]`;
}

async function collectHandoffRuntimeContext({
  pi,
  options,
  cwd,
}: {
  pi: ExtensionAPI;
  options: SidequestOptions;
  cwd: string;
}): Promise<string> {
  const execRunner: ExecRunner =
    options.exec ?? ((command, args, execOptions) => pi.exec(command, args, execOptions));
  const specs = [
    { label: "Git HEAD", command: "git", args: ["rev-parse", "HEAD"] },
    { label: "Git status", command: "git", args: ["status", "--short", "--branch"] },
    {
      label: "AK claimed tasks",
      command: "ak",
      args: ["task", "list", "--status", "claimed", "-F", "json"],
    },
    { label: "AK ready tasks", command: "ak", args: ["task", "ready", "-F", "json"] },
  ] as const;
  const results = await Promise.all(
    specs.map(async (spec) => {
      try {
        const result = await execRunner(spec.command, [...spec.args], {
          cwd,
          timeout: HANDOFF_RUNTIME_READ_TIMEOUT_MS,
        });
        if (result.code === 0 && !result.killed) {
          const output = String(result.stdout || "").trim() || "<empty>";
          return `${spec.label} (${spec.command} ${spec.args.join(" ")}):\n${boundHandoffRuntimeReadback(output)}`;
        }
        const detail = String(result.stderr || result.stdout || "no output")
          .replace(/\s+/g, " ")
          .trim();
        return `${spec.label}: unavailable (${result.killed ? "timed out" : `exit ${result.code}`}: ${detail.slice(0, 500)})`;
      } catch (error) {
        const detail = error instanceof Error ? error.message : String(error);
        return `${spec.label}: unavailable (${detail.slice(0, 500)})`;
      }
    }),
  );
  return results.join("\n\n");
}

function summarizePrompt(prompt: string): string {
  const singleLine = prompt.replace(/\s+/g, " ").trim();
  if (singleLine.length <= TITLE_MAX_LEN) return singleLine;
  return `${singleLine.slice(0, TITLE_MAX_LEN - 1)}…`;
}

function buildTitle(prompt: string, prefix = "Sidequest"): string {
  return `${prefix}: ${summarizePrompt(prompt)}`;
}

function buildModelArgs(model: ModelLike | undefined, thinkingLevel: string): string[] {
  if (!model?.provider || !model.id) return [];

  const args = ["--model", `${model.provider}/${model.id}`];
  if (thinkingLevel) {
    args.push("--thinking", thinkingLevel);
  }
  return args;
}

function shellSingleQuote(value: string): string {
  return `'${value.replace(/'/g, `'"'"'`)}'`;
}

function buildPiShellCommand(titleBase: string | undefined, cwd: string): string {
  const titleSetup = titleBase
    ? [
        `export PI_SESSION_PRESENCE_TITLE_BASE=${shellSingleQuote(titleBase)}`,
        'printf "\\033]0;%s\\007" "$PI_SESSION_PRESENCE_TITLE_BASE"',
      ]
    : [];

  return [
    `cd ${shellSingleQuote(cwd)}`,
    "status=$?",
    'if [ "$status" -ne 0 ]; then echo; echo "[sidequest] failed to enter working directory"; echo "[sidequest] leaving an interactive shell open for debugging"; exec "$' +
      '{SHELL:-/bin/bash}" -i; fi',
    ...titleSetup,
    'cmd="$1"',
    "shift",
    '"$cmd" "$@"',
    "status=$?",
    'if [ "$status" -ne 0 ]; then echo; echo "[sidequest] pi exited with status $status"; echo "[sidequest] leaving an interactive shell open for debugging"; exec "$' +
      '{SHELL:-/bin/bash}" -i; fi',
  ].join("; ");
}

function isGhosttySession(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.TERM_PROGRAM?.trim().toLowerCase() === "ghostty";
}

function getCurrentGhosttyBin(
  env: NodeJS.ProcessEnv = process.env,
  pathExists: (path: string) => boolean = existsSync,
): string | undefined {
  if (!isGhosttySession(env)) return undefined;
  const binDir = env.GHOSTTY_BIN_DIR?.trim();
  if (!binDir) return undefined;
  const candidate = join(binDir, GHOSTTY_BIN_NAME);
  return pathExists(candidate) ? candidate : undefined;
}

export function getGhosttySurfaceId(env: NodeJS.ProcessEnv = process.env): string | undefined {
  const value = env.GHOSTTY_SURFACE_ID?.trim();
  if (!value) return undefined;
  return /^\d+$/.test(value) || /^0x[0-9a-f]+$/i.test(value) ? value : undefined;
}

function readProcParentPid(pid: number): number | undefined {
  try {
    const value = readFileSync(join("/proc", String(pid), "stat"), "utf8");
    const lastParenIndex = value.lastIndexOf(")");
    if (lastParenIndex === -1) return undefined;
    const tail = value
      .slice(lastParenIndex + 2)
      .trim()
      .split(/\s+/);
    const ppid = Number.parseInt(tail[1] || "", 10);
    return Number.isInteger(ppid) && ppid > 0 ? ppid : undefined;
  } catch {
    return undefined;
  }
}

function readProcCommand(pid: number): string | undefined {
  try {
    return readFileSync(join("/proc", String(pid), "comm"), "utf8").trim();
  } catch {
    return undefined;
  }
}

type GhosttyAncestor = {
  pid: number;
  exe?: string;
};

function findGhosttyAncestor(processId = process.pid): GhosttyAncestor | undefined {
  let pid = processId;
  for (let depth = 0; depth < 12; depth += 1) {
    pid = readProcParentPid(pid) ?? 0;
    if (pid <= 0) return undefined;
    const command = readProcCommand(pid)?.toLowerCase();
    if (command === "ghostty") {
      try {
        return { pid, exe: readlinkSync(join("/proc", String(pid), "exe")) };
      } catch {
        return { pid };
      }
    }
  }
  return undefined;
}

export function findGhosttyAncestorBin(processId = process.pid): string | undefined {
  return findGhosttyAncestor(processId)?.exe;
}

export function resolveGhosttyBin({
  env = process.env,
  pathExists = existsSync,
  currentSessionGhosttyBin,
}: Pick<SidequestOptions, "env" | "pathExists" | "currentSessionGhosttyBin"> = {}): string {
  const override = env.PI_SIDEQUEST_GHOSTTY_BIN?.trim();
  if (override) {
    return override;
  }

  const wrapperExists = pathExists(LOCAL_GHOSTTY_WRAPPER);
  const normalizedCurrentSessionGhosttyBin = currentSessionGhosttyBin?.trim();
  if (normalizedCurrentSessionGhosttyBin && pathExists(normalizedCurrentSessionGhosttyBin)) {
    if (isLocalGhosttySidequestBin(normalizedCurrentSessionGhosttyBin) && wrapperExists) {
      return LOCAL_GHOSTTY_WRAPPER;
    }
    return normalizedCurrentSessionGhosttyBin;
  }

  if (wrapperExists) {
    return LOCAL_GHOSTTY_WRAPPER;
  }

  const currentGhosttyBin = getCurrentGhosttyBin(env, pathExists);
  if (currentGhosttyBin) {
    return currentGhosttyBin;
  }

  if (pathExists(LOCAL_GHOSTTY_BIN)) {
    return LOCAL_GHOSTTY_BIN;
  }
  return GHOSTTY_BIN_NAME;
}

function isLocalGhosttySidequestBin(path: string): boolean {
  const normalizedPath = resolve(path);
  if (normalizedPath === LOCAL_GHOSTTY_BIN) return true;

  const relativePath = relative(LOCAL_GHOSTTY_OPT_DIR, normalizedPath);
  if (!relativePath || relativePath.startsWith("..") || isAbsolute(relativePath)) return false;
  const [installDir, binDir, binName] = relativePath.split(sep);
  return Boolean(
    installDir?.startsWith("ghostty-sidequest") && binDir === "bin" && binName === GHOSTTY_BIN_NAME,
  );
}

async function supportsGhosttyNewTab(execRunner: ExecRunner, ghosttyBin: string): Promise<boolean> {
  try {
    const result = await execRunner(ghosttyBin, ["+help"], {
      timeout: GHOSTTY_PROBE_TIMEOUT_MS,
    });
    return result.code === 0 && String(result.stdout || "").includes("+new-tab");
  } catch {
    return false;
  }
}

export function ghosttyVersionSupportsSurfaceId(output: string): boolean {
  const match =
    output.match(/Ghostty\s+(\d+)\.(\d+)\.(\d+)/) ??
    output.match(/version:\s*(\d+)\.(\d+)\.(\d+)/i);
  if (!match) return false;
  const major = Number.parseInt(match[1] || "", 10);
  const minor = Number.parseInt(match[2] || "", 10);
  if (!Number.isInteger(major) || !Number.isInteger(minor)) return false;
  return major > 1 || (major === 1 && minor >= 4);
}

async function supportsGhosttySurfaceId(
  execRunner: ExecRunner,
  ghosttyBin: string,
): Promise<boolean> {
  try {
    const result = await execRunner(ghosttyBin, ["+version"], {
      timeout: GHOSTTY_PROBE_TIMEOUT_MS,
    });
    return result.code === 0 && ghosttyVersionSupportsSurfaceId(String(result.stdout || ""));
  } catch {
    return false;
  }
}

function buildGhosttyExecArgs({
  cwd,
  title,
  piArgs,
}: {
  cwd: string;
  title: string;
  piArgs: string[];
}): string[] {
  return [
    `--working-directory=${cwd}`,
    "-e",
    "/bin/sh",
    "-lc",
    buildPiShellCommand(title, cwd),
    "sidequest-pi",
    ...piArgs,
  ];
}

function buildGhosttyArgs({
  cwd,
  title,
  launchMode,
  surfaceId,
  piArgs,
}: {
  cwd: string;
  title: string;
  launchMode: LaunchMode;
  surfaceId?: string;
  piArgs: string[];
}): string[] {
  const args = launchMode === "tab" ? ["+new-tab"] : [];
  if (launchMode === "tab" && surfaceId) {
    args.push(`--surface-id=${surfaceId}`);
  }
  args.push(...buildGhosttyExecArgs({ cwd, title, piArgs }));
  return args;
}

function normalizeGhosttySurfaceIdUint64(surfaceId: string): string | undefined {
  try {
    const value = BigInt(surfaceId);
    return value >= 0n && value <= 18_446_744_073_709_551_615n ? value.toString(10) : undefined;
  } catch {
    return undefined;
  }
}

type ControllerGhosttyDbusTarget = {
  busName: string;
  ownerPid: number;
  surfaceId: string;
};

async function resolveControllerGhosttyDbusTarget({
  execRunner,
  controllerGhostty,
  surfaceId,
}: {
  execRunner: ExecRunner;
  controllerGhostty: GhosttyAncestor | undefined;
  surfaceId: string | undefined;
}): Promise<ControllerGhosttyDbusTarget | undefined> {
  if (!controllerGhostty?.exe || !isLocalGhosttySidequestBin(controllerGhostty.exe) || !surfaceId) {
    return undefined;
  }
  const normalizedSurfaceId = normalizeGhosttySurfaceIdUint64(surfaceId);
  if (!normalizedSurfaceId) return undefined;

  try {
    const result = await execRunner("busctl", ["--user", "list", "--no-pager", "--no-legend"], {
      timeout: GHOSTTY_PROBE_TIMEOUT_MS,
    });
    if (result.code !== 0) return undefined;
    const rows = String(result.stdout || "")
      .split("\n")
      .map((line) => line.trim().split(/\s+/));

    // Ghostty runs with --gtk-single-instance: one long-lived instance "server" process owns the
    // well-known D-Bus name and every surface/window, while per-session launcher processes only
    // expose a stub window and cannot route a surface id that lives in the server. Targeting the
    // controller's own ghostty ancestor PID therefore misroutes observer tabs for sessions whose
    // nearest ghostty ancestor is a launcher client (for example a window spawned by an external
    // keybinding rather than opened inside the running instance). Resolve the well-known-name owner
    // instead: it is the single authoritative process for every sidequest surface, and the
    // controller's surface id selects the exact window. The sidequest-bin gate above guarantees
    // the controller's surface belongs to this single instance.
    const wellKnownOwnerPid = rows
      .filter((fields) => fields[0] === GHOSTTY_SIDEQUEST_DBUS_NAME)
      .map((fields) => Number.parseInt(fields[1] || "", 10))
      .find((pid) => Number.isInteger(pid) && pid > 0);
    if (!wellKnownOwnerPid) return undefined;

    const ownerUniqueNames = rows
      .filter(
        (fields) =>
          fields.length >= 2 &&
          fields[0]?.startsWith(":") &&
          Number.parseInt(fields[1] || "", 10) === wellKnownOwnerPid,
      )
      .map((fields) => fields[0] as string);
    if (ownerUniqueNames.length !== 1) return undefined;
    return {
      busName: ownerUniqueNames[0] as string,
      ownerPid: wellKnownOwnerPid,
      surfaceId: normalizedSurfaceId,
    };
  } catch {
    return undefined;
  }
}

function buildControllerGhosttyDbusArgs({
  target,
  execArgs,
}: {
  target: ControllerGhosttyDbusTarget;
  execArgs: string[];
}): string[] {
  return [
    "--user",
    "call",
    "--expect-reply=no",
    target.busName,
    GHOSTTY_SIDEQUEST_DBUS_PATH,
    "org.gtk.Actions",
    "Activate",
    "sava{sv}",
    "new-tab",
    "1",
    "(tas)",
    target.surfaceId,
    String(execArgs.length),
    "--",
    ...execArgs,
    "0",
  ];
}

function normalizeExecResult(result: ExecResult): LaunchResult {
  return {
    ok: result.code === 0 && !result.killed,
    code: result.code,
    stdout: String(result.stdout || "").trim(),
    stderr: String(result.stderr || "").trim(),
    killed: Boolean(result.killed),
  };
}

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

async function runGhosttyLaunch(
  execRunner: ExecRunner,
  ghosttyBin: string,
  ghosttyArgs: string[],
  cwd: string,
): Promise<LaunchResult> {
  try {
    const result = await execRunner(ghosttyBin, ghosttyArgs, {
      cwd,
      timeout: GHOSTTY_LAUNCH_TIMEOUT_MS,
    });
    return normalizeExecResult(result);
  } catch (error) {
    return {
      ok: false,
      code: -1,
      stdout: "",
      stderr: error instanceof Error ? error.message : String(error),
      killed: false,
    };
  }
}

function describeWindowFallback({
  supportsNewTab,
  env,
}: {
  supportsNewTab: boolean;
  env: NodeJS.ProcessEnv;
}): string | undefined {
  if (process.platform !== "linux") {
    return "same-window tab launch requires Linux Ghostty support";
  }
  if (!isGhosttySession(env)) {
    return "same-window tab launch only works from an active Ghostty session";
  }
  if (!supportsNewTab) {
    return "current Ghostty binary does not support +new-tab";
  }
  return undefined;
}

function summarizeLaunchFailure(result: LaunchResult): string {
  const detail = result.stderr || result.stdout;
  if (!detail) {
    if (result.killed) return "Ghostty launch timed out";
    if (result.code >= 0) return `exit ${result.code}`;
    return "unknown launch failure";
  }

  const singleLine = detail.replace(/\s+/g, " ").trim();
  if (singleLine.length <= 180) return singleLine;
  return `${singleLine.slice(0, 179)}…`;
}

type SessionPresenceRecord = {
  pid?: number;
  cwd?: string;
  windowTitleBase?: string;
  publishedAt?: string;
  ghosttyAncestorPid?: number;
  ghosttyAncestorExe?: string;
  ghosttySurfaceId?: string;
};

function resolvePresenceDir(env: NodeJS.ProcessEnv, options: SidequestOptions): string {
  if (options.presenceDir) return options.presenceDir;
  const override = env.PI_SESSION_PRESENCE_DIR?.trim();
  if (override) return override;
  const runtimeDir = env.XDG_RUNTIME_DIR?.trim();
  if (runtimeDir) return join(runtimeDir, "pi-session-presence");
  return join(homedir(), ".local", "state", "pi-session-presence");
}

function resolvePlacementVerificationTimeoutMs(
  env: NodeJS.ProcessEnv,
  options: SidequestOptions,
): number {
  if (typeof options.placementVerificationTimeoutMs === "number") {
    return Math.max(0, options.placementVerificationTimeoutMs);
  }
  const raw = env.PI_SIDEQUEST_PLACEMENT_VERIFY_MS?.trim();
  if (raw) {
    const parsed = Number.parseInt(raw, 10);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
  }
  return options.exec ? 0 : 1800;
}

function readSessionPresenceRecord(filePath: string): SessionPresenceRecord | undefined {
  try {
    const parsed = JSON.parse(readFileSync(filePath, "utf8")) as SessionPresenceRecord;
    return parsed && typeof parsed === "object" ? parsed : undefined;
  } catch {
    return undefined;
  }
}

function findMatchingPresenceRecord({
  presenceDir,
  cwd,
  titleBase,
  launchedAfterMs,
  controllerPid,
}: {
  presenceDir: string;
  cwd: string;
  titleBase: string;
  launchedAfterMs: number;
  controllerPid: number;
}): SessionPresenceRecord | undefined {
  let entries: string[] = [];
  try {
    entries = readdirSync(presenceDir);
  } catch {
    return undefined;
  }

  const candidates: { record: SessionPresenceRecord; publishedAtMs: number }[] = [];
  for (const entry of entries) {
    if (!entry.endsWith(".json")) continue;
    const record = readSessionPresenceRecord(join(presenceDir, entry));
    if (!record?.pid || record.pid === controllerPid) continue;
    if (record.cwd !== cwd || record.windowTitleBase !== titleBase) continue;
    if (!existsSync(join("/proc", String(record.pid)))) continue;
    const publishedAtMs = record.publishedAt ? Date.parse(record.publishedAt) : Number.NaN;
    if (Number.isFinite(publishedAtMs) && publishedAtMs < launchedAfterMs - 2000) continue;
    candidates.push({ record, publishedAtMs: Number.isFinite(publishedAtMs) ? publishedAtMs : 0 });
  }

  candidates.sort((left, right) => right.publishedAtMs - left.publishedAtMs);
  return candidates[0]?.record;
}

async function waitForMatchingPresenceRecord(options: {
  env: NodeJS.ProcessEnv;
  sidequestOptions: SidequestOptions;
  cwd: string;
  titleBase: string;
  launchedAfterMs: number;
  controllerPid: number;
}): Promise<SessionPresenceRecord | undefined> {
  const timeoutMs = resolvePlacementVerificationTimeoutMs(options.env, options.sidequestOptions);
  if (timeoutMs <= 0) return undefined;
  const presenceDir = resolvePresenceDir(options.env, options.sidequestOptions);
  const deadline = Date.now() + timeoutMs;
  do {
    const record = findMatchingPresenceRecord({
      presenceDir,
      cwd: options.cwd,
      titleBase: options.titleBase,
      launchedAfterMs: options.launchedAfterMs,
      controllerPid: options.controllerPid,
    });
    if (record) return record;
    await sleep(100);
  } while (Date.now() < deadline);
  return undefined;
}

function formatGhosttyPlacementMismatch({
  controllerGhostty,
  childRecord,
  requestedSurfaceId,
}: {
  controllerGhostty: GhosttyAncestor;
  childRecord: SessionPresenceRecord;
  requestedSurfaceId?: string;
}): string | undefined {
  const childGhosttyPid = childRecord.ghosttyAncestorPid;
  if (!childGhosttyPid || childGhosttyPid === controllerGhostty.pid) return undefined;
  const details = [
    `controller ghostty pid ${controllerGhostty.pid}`,
    `child ghostty pid ${childGhosttyPid}`,
    requestedSurfaceId ? `requested surface ${requestedSurfaceId}` : undefined,
    childRecord.ghosttySurfaceId ? `child surface ${childRecord.ghosttySurfaceId}` : undefined,
  ].filter((item): item is string => Boolean(item));
  return `post-launch placement mismatch: opened in a different Ghostty window (${details.join(", ")})`;
}

function joinLaunchNotes(...notes: (string | undefined)[]): string | undefined {
  const normalized = notes
    .map((note) => note?.trim())
    .filter((note): note is string => Boolean(note));
  return normalized.length > 0 ? normalized.join("; ") : undefined;
}

function formatLaunchModeLabel(launchMode: LaunchMode, launchNote?: string): string {
  if (launchMode === "window") return "new Ghostty window";
  if (launchNote?.includes("post-launch placement mismatch")) {
    return "different Ghostty window after current-tab request";
  }
  return "current Ghostty tab";
}

async function detectPostLaunchPlacementMismatch({
  env,
  options,
  cwd,
  titleBase,
  launchMode,
  launchedAfterMs,
}: {
  env: NodeJS.ProcessEnv;
  options: SidequestOptions;
  cwd: string;
  titleBase: string;
  launchMode: LaunchMode;
  launchedAfterMs: number;
}): Promise<string | undefined> {
  if (launchMode !== "tab") return undefined;
  const controllerPid = options.processId ?? process.pid;
  const controllerGhostty = options.currentGhosttyAncestor ?? findGhosttyAncestor(controllerPid);
  if (!controllerGhostty) return undefined;
  const childRecord = await waitForMatchingPresenceRecord({
    env,
    sidequestOptions: options,
    cwd,
    titleBase,
    launchedAfterMs,
    controllerPid,
  });
  if (!childRecord) return undefined;
  return formatGhosttyPlacementMismatch({
    controllerGhostty,
    childRecord,
    requestedSurfaceId: getGhosttySurfaceId(env),
  });
}

async function launchPiQuestSession({
  pi,
  ctx,
  options,
  prompt,
  titlePrompt,
  cwd,
  sourceSessionFile,
  titlePrefix = "Sidequest",
  command,
  placementPolicy = "visible-fallback",
}: {
  pi: ExtensionAPI;
  ctx: { model?: unknown };
  options: SidequestOptions;
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
  let ghosttyBin = resolveGhosttyBin({ env, pathExists, currentSessionGhosttyBin });
  const piBin = env.PI_SIDEQUEST_PI_BIN?.trim() || DEFAULT_PI_BIN;
  const thinkingLevel = pi.getThinkingLevel();
  const modelArgs = buildModelArgs(ctx.model as ModelLike | undefined, thinkingLevel);
  const title = buildTitle(titlePrompt, titlePrefix);
  let supportsNewTab =
    process.platform === "linux" ? await supportsGhosttyNewTab(execRunner, ghosttyBin) : false;
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
  const piArgs = command
    ? [command.command, ...command.args]
    : sourceSessionFile
      ? [piBin, "--fork", sourceSessionFile, ...modelArgs, prompt]
      : [piBin, ...modelArgs, prompt];
  let launchMode: LaunchMode = windowFallbackReason ? "window" : "tab";
  const controllerDbusTarget =
    launchMode === "tab"
      ? await resolveControllerGhosttyDbusTarget({
          execRunner,
          controllerGhostty,
          surfaceId,
        })
      : undefined;
  const promptSummary = summarizePrompt(titlePrompt);
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
  let launchResult = controllerDbusTarget
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
  );

  if (!launchResult.ok && launchMode === "tab" && placementPolicy === "visible-fallback") {
    const tabFailure = summarizeLaunchFailure(launchResult);
    const fallbackResult = await runGhosttyLaunch(
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
    if (fallbackResult.ok) {
      launchMode = "window";
      launchResult = fallbackResult;
      launchNote = wrapperTabAttachNote
        ? `${wrapperTabAttachNote}; same-window tab launch failed (${tabFailure}); opened a new window instead`
        : `same-window tab launch failed (${tabFailure}); opened a new window instead`;
    }
  }

  if (launchResult.ok && placementPolicy === "visible-fallback") {
    launchNote = joinLaunchNotes(
      launchNote,
      await detectPostLaunchPlacementMismatch({
        env,
        options,
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
    launchMode,
    sessionMode,
    cwd,
    sourceSessionFile,
    titleBase: title,
    promptSummary,
    launchNote,
  };
}

async function launchAscExecutionObserverSession(
  pi: ExtensionAPI,
  options: SidequestOptions,
  request: AscObserverLaunchRequest,
) {
  const launch = await launchPiQuestSession({
    pi,
    ctx: {},
    options,
    prompt: "read-only ASC execution observation",
    titlePrompt: request.title,
    titlePrefix: "ASC observer",
    placementPolicy: "controller-tab-only",
    cwd: request.cwd,
    command: {
      command: process.execPath,
      args: [
        ASC_EXECUTION_OBSERVER_SCRIPT,
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

function normalizeStringArray(value: string[] | undefined): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => String(item).trim()).filter(Boolean);
}

function markdownList(items: string[] | undefined, emptyText = "None provided."): string {
  const normalized = normalizeStringArray(items);
  if (normalized.length === 0) return emptyText;
  return normalized.map((item) => `- ${item}`).join("\n");
}

function contextLine(label: string, value: string | undefined): string | undefined {
  const normalized = value?.trim();
  return normalized ? `- ${label}: ${normalized}` : undefined;
}

function normalizeSidequestRole(value: unknown): SidequestRole {
  return value === "reviewer" ? "reviewer" : "scout";
}

function createQuestId(prefix: "sidequest" | "forkpeer" | "scoutpeer" | "candidatepeer"): string {
  return `${prefix}-${Date.now().toString(36)}-${randomUUID().slice(0, 8)}`;
}

function normalizeForkPeerReportBack(request: ForkPeerSpawnRequest): SidequestReportBack {
  if (
    request.reportBack === "intercom" ||
    request.reportBack === "manual" ||
    request.reportBack === "none"
  ) {
    return request.reportBack;
  }

  return request.parentPeerTarget?.trim() ? "intercom" : "manual";
}

function normalizeReportBack(request: SidequestSpawnRequest): SidequestReportBack {
  if (
    request.reportBack === "intercom" ||
    request.reportBack === "manual" ||
    request.reportBack === "none"
  ) {
    return request.reportBack;
  }
  return "intercom";
}

function buildReportBackInstructions({
  reportBack,
  parentPeerTarget,
  questId,
  peerLabel = "sidequest",
}: {
  reportBack: SidequestReportBack;
  parentPeerTarget?: string;
  questId: string;
  peerLabel?: string;
}): string {
  const target = parentPeerTarget?.trim();
  if (reportBack === "intercom" && target) {
    return [
      "Use intercom for report-back if the tool is available.",
      `Report to the exact parent target: ${target}`,
      `Peer run id: ${questId}`,
      "",
      "## Intercom Message Budget",
      "Send at most two intercom messages unless the controller explicitly asks a clarifying question or assigns new work:",
      "",
      `1. \`PEER_ACK peer_run_id=${questId}: ...\` — send once as your first action, identifying yourself as the spawned ${peerLabel}.`,
      `2. \`PEER_FINAL peer_run_id=${questId}: ...\` — send once as your final DoD report.`,
      "",
      "Do not send both a final report and a separate final DoD report. `PEER_FINAL` is the final DoD report.",
      "After sending `PEER_FINAL`, stop. Do not reply to controller acknowledgements such as received, accepted, or no further action needed unless the controller explicitly asks a new question or assigns new work.",
      `Use the literal target in tool calls, for example: \`intercom({ action: "send", to: "${target}", message: "PEER_ACK peer_run_id=${questId}: ..." })\`.`,
      `For the final message, use: \`intercom({ action: "send", to: "${target}", message: "PEER_FINAL peer_run_id=${questId}: ..." })\`.`,
      "Intercom is communication only; it is not durable evidence or completion authority.",
    ].join("\n");
  }

  if (reportBack === "intercom") {
    return [
      "Use intercom for report-back if the tool is available.",
      "No exact parent target was supplied. This should not happen for controller-spawned quest tools; report-back may be ambiguous without the controller's exact session id.",
      "Intercom is communication only; it is not durable evidence or completion authority.",
    ].join("\n");
  }

  if (reportBack === "none") {
    return `No automatic report-back is requested. Do not claim that a report was delivered; leave findings visible in this ${peerLabel} session unless the controller gives further instructions.`;
  }

  return `Manual report-back is requested. Do not over-promise delivery; leave a concise visible report in this ${peerLabel} session for the controller/operator to inspect.`;
}

function buildBootProtocolInstructions({
  reportBack,
  parentPeerTarget,
  questId,
  peerLabel,
}: {
  reportBack: SidequestReportBack;
  parentPeerTarget?: string;
  questId: string;
  peerLabel: string;
}): string {
  const target = parentPeerTarget?.trim();
  if (reportBack !== "intercom") {
    return `No intercom boot ACK is required because reportBack is ${reportBack}. Follow the report-back mode below.`;
  }

  if (!target) {
    return "Intercom boot ACK requires an exact parentPeerTarget. This prompt should not have been launched without one.";
  }

  return [
    "Before reading task context, inspecting files, or doing any other work, send the ACK below.",
    "Only allowed pre-ACK tool: `intercom`.",
    `Literal ACK call: \`intercom({ action: "send", to: "${target}", message: "PEER_ACK peer_run_id=${questId}: spawned ${peerLabel} started" })\``,
    "If the ACK send fails or intercom is unavailable, visibly report `ACK_FAILED` in this session and stop; do not continue task work silently.",
    "After ACK succeeds, continue with the objective and send exactly one `PEER_FINAL` as the final DoD report. After `PEER_FINAL`, stop unless the controller explicitly asks a new question or assigns new work.",
  ].join("\n");
}

function buildForkPeerSpawnPrompt({
  objective,
  request,
  reportBack,
  questId,
}: {
  objective: string;
  request: ForkPeerSpawnRequest;
  reportBack: SidequestReportBack;
  questId: string;
}): string {
  return [
    "# Visible Fork Peer Prompt",
    "",
    "You are a visible fork peer launched from the controller's current Pi conversation/context. The inherited history is context, not identity: act as the spawned fork peer and report back according to this prompt. You are parallel cognition, not parallel authority.",
    "",
    "## BOOT PROTOCOL / FIRST ACTION REQUIRED",
    buildBootProtocolInstructions({
      reportBack,
      parentPeerTarget: request.parentPeerTarget,
      questId,
      peerLabel: "fork peer",
    }),
    "",
    "## Quest Protocol",
    `Peer run id: ${questId}`,
    "Message budget: at most PEER_ACK and PEER_FINAL unless the controller explicitly asks a clarifying question or assigns new work. Legacy QUEST_ACK / QUEST_FINAL remains controller-compatible but is not preferred.",
    "",
    "## Objective",
    objective,
    "",
    "## Report-Back Instructions",
    buildReportBackInstructions({
      reportBack,
      parentPeerTarget: request.parentPeerTarget,
      questId,
      peerLabel: "fork peer",
    }),
    "",
    "## Boundary",
    "This fork peer intentionally inherits the current Pi context. Do not treat intercom messages as durable evidence, task authority, merge authority, or completion truth unless the controller records them through the owning surface.",
  ].join("\n");
}

function buildSidequestSpawnPrompt({
  role,
  objective,
  cwd,
  request,
  reportBack,
  questId,
}: {
  role: SidequestRole;
  objective: string;
  cwd: string;
  request: SidequestSpawnRequest;
  reportBack: SidequestReportBack;
  questId: string;
}): string {
  const context = request.context ?? {};
  const contextLines = [
    contextLine("Campaign goal", context.campaignGoal),
    contextLine("Primary metric", context.primaryMetric),
    contextLine("Current best", context.currentBest),
    contextLine("Blocker", context.blocker),
  ].filter((line): line is string => Boolean(line));
  const customDod = normalizeStringArray(request.dod);

  return [
    "# Visible Scout Peer Prompt",
    "",
    "You are a visible scout peer launched in a clean Pi session. If you are reading this prompt, you are the spawned scout peer, not the controller session. Identify as the scout peer in your visible response and report-back. You are parallel cognition, not parallel authority.",
    "",
    "## BOOT PROTOCOL / FIRST ACTION REQUIRED",
    buildBootProtocolInstructions({
      reportBack,
      parentPeerTarget: request.parentPeerTarget,
      questId,
      peerLabel: "scout peer",
    }),
    "",
    "## Role",
    role,
    "",
    "## Quest Protocol",
    `Peer run id: ${questId}`,
    "Message budget: at most PEER_ACK and PEER_FINAL unless the controller explicitly asks a clarifying question or assigns new work. Legacy QUEST_ACK / QUEST_FINAL remains controller-compatible but is not preferred.",
    "",
    "## Objective",
    objective,
    "",
    "## Workspace",
    `Controller/shared cwd: ${cwd}`,
    "",
    "## Campaign / Task Context",
    contextLines.length ? contextLines.join("\n") : "None provided.",
    "",
    "## Artifacts to Inspect",
    markdownList(context.artifactsToRead),
    "",
    "## Files in Scope",
    markdownList(context.filesInScope),
    "",
    "## Off-Limits",
    markdownList(context.offLimits),
    "",
    "## Constraints",
    markdownList(context.constraints),
    "",
    "## Current Findings",
    markdownList(context.currentFindings),
    "",
    "## Mutation Policy",
    "You are in the controller’s working tree. This scout peer is read-only for controller-spawned use. Do not edit files, run destructive commands, commit, revert, install dependencies, restart services, or change running model services. If a mutation seems necessary, report the exact proposed mutation back to the controller instead of applying it.",
    "",
    "Enforcement level: prompt_contract. This is not a hard sandbox yet.",
    "",
    "## Allowed Tools",
    "- `read` and bounded `bash` for inspection and non-destructive validation.",
    "- `dispatch_subagent` for one focused helper if it reduces risk.",
    "- `workflow_execute` for a small explicit plan if useful.",
    "- `intercom` for reporting back if available and requested below.",
    "",
    "Do not spawn more quest agents unless explicitly instructed.",
    "",
    "## Report-Back Instructions",
    buildReportBackInstructions({
      reportBack,
      parentPeerTarget: request.parentPeerTarget,
      questId,
      peerLabel: "scout peer",
    }),
    "",
    "## Definition of Done",
    "Return a concise report with:",
    "",
    "1. Answer or recommendation",
    "2. Evidence inspected — exact files, artifacts, commands",
    "3. Most likely root cause or key finding",
    "4. One concrete next experiment or controller action",
    "5. Expected impact",
    "6. Risks and rollback notes",
    "7. What not to try again",
    ...(customDod.length
      ? ["", "## Additional Request-Specific DoD", markdownList(customDod)]
      : []),
    "",
    "## Anti-Goals",
    "- Do not claim completion for the controller.",
    "- Do not mutate shared-cwd files; editable shared-cwd work belongs to manual `/sidequest`, not `scout_peer_spawn`.",
    "- Do not implement candidate changes here; isolated mutation belongs later in `candidate_peer_spawn`.",
    "- Do not mutate AK, orchestration state, intercom state, or autoresearch runtime authority.",
  ].join("\n");
}

const MAX_CANDIDATE_BRANCH_NAME_LENGTH = 96;
const MAX_CANDIDATE_WORKSPACE_NAME_LENGTH = 80;
const SAFE_NAME_HASH_LENGTH = 10;

function slugify(value: string, fallback: string): string {
  const slug = value
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^[._-]+|[._-]+$/g, "")
    .replace(/-{2,}/g, "-");
  return slug || fallback;
}

function clampSafeName(value: string, maxLength: number, fallback: string): string {
  if (value.length <= maxLength) return value;
  const hash = createHash("sha1").update(value).digest("hex").slice(0, SAFE_NAME_HASH_LENGTH);
  const suffix = `-${hash}`;
  const prefixLength = Math.max(1, maxLength - suffix.length);
  const prefix = value.slice(0, prefixLength).replace(/[\\/._-]+$/g, "") || fallback;
  return `${prefix.slice(0, prefixLength)}${suffix}`;
}

function candidateBranchNameBeforeClamp(value: string | undefined, objective: string): string {
  const raw = value?.trim() || `candidatepeer/${slugify(objective, "candidate")}`;
  const segments = raw
    .split(/[\\/]+/)
    .map((segment) => slugify(segment, ""))
    .filter((segment) => segment && segment !== "." && segment !== "..");
  return segments.join("/") || `candidatepeer/${slugify(objective, "candidate")}`;
}

function sanitizeBranchName(value: string | undefined, objective: string): string {
  return clampSafeName(
    candidateBranchNameBeforeClamp(value, objective),
    MAX_CANDIDATE_BRANCH_NAME_LENGTH,
    "candidatepeer",
  );
}

function candidateWorkspaceNameBeforeClamp(value: string | undefined, branchName: string): string {
  return slugify(value?.trim() || branchName.replace(/[\\/]+/g, "-"), "candidate");
}

function sanitizeWorkspaceName(value: string | undefined, branchName: string): string {
  return clampSafeName(
    candidateWorkspaceNameBeforeClamp(value, branchName),
    MAX_CANDIDATE_WORKSPACE_NAME_LENGTH,
    "candidate",
  );
}

function isPathInside(parent: string, child: string): boolean {
  const normalizedParent = resolve(parent);
  const normalizedChild = resolve(child);
  const rel = relative(normalizedParent, normalizedChild);
  return Boolean(rel) && !rel.startsWith("..") && !rel.includes(`..${sep}`) && !isAbsolute(rel);
}

function candidateWorkspaceSymlinkBlocker(path: string): string | undefined {
  let existing = resolve(path);
  while (!existsSync(existing)) {
    const parent = resolve(existing, "..");
    if (parent === existing) break;
    existing = parent;
  }
  try {
    if (lstatSync(existing).isSymbolicLink() || realpathSync(existing) !== existing) {
      return `candidate workspace path has a symlinked existing ancestor: ${existing}`;
    }
  } catch (error) {
    return `candidate workspace path ancestor cannot be verified: ${error instanceof Error ? error.message : String(error)}`;
  }
  return undefined;
}

function defaultWorkspaceRoot(repoRoot: string, env: NodeJS.ProcessEnv): string {
  const stateHome = env.XDG_STATE_HOME?.trim() || join(homedir(), ".local", "state");
  const repoSlug = slugify(basename(repoRoot), "repo");
  const repoHash = createHash("sha1").update(resolve(repoRoot)).digest("hex").slice(0, 8);
  return join(stateHome, "pi-quests", "worktrees", `${repoSlug}-${repoHash}`);
}

async function runGit(execRunner: ExecRunner, cwd: string, args: string[]): Promise<LaunchResult> {
  return runGhosttyLaunch(execRunner, "git", ["-C", cwd, ...args], cwd);
}

async function resolveCandidateRepoRoot(
  execRunner: ExecRunner,
  parentCwd: string,
): Promise<{ ok: true; repoRoot: string } | { ok: false; error: string }> {
  const result = await runGit(execRunner, parentCwd, ["rev-parse", "--show-toplevel"]);
  if (!result.ok) {
    return { ok: false, error: `failed to locate git repo: ${summarizeLaunchFailure(result)}` };
  }
  return { ok: true, repoRoot: resolve(result.stdout.split(/\r?\n/)[0]?.trim() || parentCwd) };
}

function admissionRegistryBinding(admission: CandidateAdmissionReservation) {
  return {
    admissionId: admission.admissionId,
    permitPath: admission.permitPath,
    reservationBytes: admission.permit.reservationBytes,
    inventoryDigest: admission.pressure.inventoryDigest,
  };
}

function releasePreparationFailure(
  admission: CandidateAdmissionReservation,
  reason: string,
  env: NodeJS.ProcessEnv,
  release: typeof releaseCandidateAdmission = releaseCandidateAdmission,
): string | undefined {
  try {
    release(
      {
        admissionId: admission.admissionId,
        outcome: "preparation_failed",
        terminalReceiptRef: `candidate-preparation-failed:${createHash("sha256").update(reason).digest("hex")}`,
      },
      env,
    );
    return undefined;
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
}

async function prepareCandidatePeerWorktree({
  execRunner,
  pathExists,
  env,
  request,
  parentCwd,
  objective,
  admittedRepoRoot,
}: {
  execRunner: ExecRunner;
  pathExists: (path: string) => boolean;
  env: NodeJS.ProcessEnv;
  request: CandidatePeerSpawnRequest;
  parentCwd: string;
  objective: string;
  admittedRepoRoot?: string;
}): Promise<WorktreePrepareResult> {
  const baseRef = request.baseRef?.trim() || "HEAD";
  let repoRoot: string;
  if (admittedRepoRoot) {
    repoRoot = resolve(admittedRepoRoot);
  } else {
    const repoResult = await runGit(execRunner, parentCwd, ["rev-parse", "--show-toplevel"]);
    if (!repoResult.ok) {
      return {
        ok: false,
        error: `failed to locate git repo: ${summarizeLaunchFailure(repoResult)}`,
        parentCwd,
        baseRef,
      };
    }
    repoRoot = resolve(repoResult.stdout.split(/\r?\n/)[0]?.trim() || parentCwd);
  }
  const requestedBranchName = request.branchName?.trim();
  const branchNameBeforeClamp = candidateBranchNameBeforeClamp(request.branchName, objective);
  const branchName = sanitizeBranchName(request.branchName, objective);
  const requestedWorkspaceName = request.workspaceName?.trim();
  const workspaceNameBeforeClamp = candidateWorkspaceNameBeforeClamp(
    request.workspaceName,
    branchName,
  );
  const workspaceName = sanitizeWorkspaceName(request.workspaceName, branchName);
  const workspaceRoot = resolve(
    request.workspaceRoot?.trim()
      ? isAbsolute(request.workspaceRoot.trim())
        ? request.workspaceRoot.trim()
        : resolve(parentCwd, request.workspaceRoot.trim())
      : defaultWorkspaceRoot(repoRoot, env),
  );
  const worktreePath = resolve(workspaceRoot, workspaceName);
  const naming: CandidatePeerSafeNaming = {
    ...(requestedBranchName ? { requestedBranchName } : {}),
    branchName,
    branchNameClamped: branchNameBeforeClamp.length > MAX_CANDIDATE_BRANCH_NAME_LENGTH,
    ...(requestedWorkspaceName ? { requestedWorkspaceName } : {}),
    workspaceName,
    workspaceNameClamped: workspaceNameBeforeClamp.length > MAX_CANDIDATE_WORKSPACE_NAME_LENGTH,
    workspaceRoot,
  };

  const workspaceSymlinkBlocker = candidateWorkspaceSymlinkBlocker(workspaceRoot);
  if (workspaceSymlinkBlocker) {
    return {
      ok: false,
      error: workspaceSymlinkBlocker,
      parentCwd,
      repoRoot,
      worktreePath,
      branchName,
      baseRef,
      naming,
    };
  }

  if (isPathInside(repoRoot, worktreePath) || worktreePath === repoRoot) {
    return {
      ok: false,
      error: "candidate peer worktree path must not be inside the parent checkout",
      parentCwd,
      repoRoot,
      worktreePath,
      branchName,
      baseRef,
      naming,
    };
  }

  const gitDir = join(repoRoot, ".git");
  if (isPathInside(gitDir, worktreePath) || worktreePath === gitDir) {
    return {
      ok: false,
      error: "candidate peer worktree path must not be inside .git",
      parentCwd,
      repoRoot,
      worktreePath,
      branchName,
      baseRef,
      naming,
    };
  }

  if (!isPathInside(workspaceRoot, worktreePath) && worktreePath !== workspaceRoot) {
    return {
      ok: false,
      error: "candidate peer worktree path escaped workspaceRoot",
      parentCwd,
      repoRoot,
      worktreePath,
      branchName,
      baseRef,
      naming,
    };
  }

  const dirtyResult = await runGit(execRunner, repoRoot, ["status", "--porcelain"]);
  if (!dirtyResult.ok) {
    return {
      ok: false,
      error: `failed to inspect parent dirty state: ${summarizeLaunchFailure(dirtyResult)}`,
      parentCwd,
      repoRoot,
      worktreePath,
      branchName,
      baseRef,
      naming,
    };
  }

  const parentDirty = Boolean(dirtyResult.stdout.trim());
  const parentDirtyWarning = parentDirty
    ? "Parent checkout has uncommitted changes; this worktree is based on the selected base ref and does not include them."
    : undefined;
  if (parentDirty && request.requireCleanParent) {
    return {
      ok: false,
      error: "parent checkout has uncommitted changes and requireCleanParent is true",
      parentCwd,
      repoRoot,
      worktreePath,
      branchName,
      baseRef,
      parentDirty,
      parentDirtyWarning,
      naming,
    };
  }

  if (pathExists(worktreePath)) {
    if (!request.reuseExisting) {
      return {
        ok: false,
        error:
          "candidate peer worktree path already exists; pass reuseExisting only for a verified intended worktree",
        parentCwd,
        repoRoot,
        worktreePath,
        branchName,
        baseRef,
        parentDirty,
        parentDirtyWarning,
        naming,
      };
    }

    const insideResult = await runGit(execRunner, worktreePath, [
      "rev-parse",
      "--is-inside-work-tree",
    ]);
    const topResult = await runGit(execRunner, worktreePath, ["rev-parse", "--show-toplevel"]);
    const branchResult = await runGit(execRunner, worktreePath, [
      "rev-parse",
      "--abbrev-ref",
      "HEAD",
    ]);
    if (
      !insideResult.ok ||
      insideResult.stdout.trim() !== "true" ||
      !topResult.ok ||
      resolve(topResult.stdout.trim()) !== worktreePath ||
      !branchResult.ok ||
      branchResult.stdout.trim() !== branchName
    ) {
      return {
        ok: false,
        error: "existing candidate peer path is not the requested verified git worktree",
        parentCwd,
        repoRoot,
        worktreePath,
        branchName,
        baseRef,
        parentDirty,
        parentDirtyWarning,
        naming,
      };
    }

    return {
      ok: true,
      parentCwd,
      repoRoot,
      worktreePath,
      branchName,
      baseRef,
      parentDirty,
      parentDirtyWarning,
      reusedExisting: true,
      naming,
    };
  }

  try {
    mkdirSync(workspaceRoot, { recursive: true });
  } catch (error) {
    return {
      ok: false,
      error: `failed to create workspaceRoot: ${error instanceof Error ? error.message : String(error)}`,
      parentCwd,
      repoRoot,
      worktreePath,
      branchName,
      baseRef,
      parentDirty,
      parentDirtyWarning,
      naming,
    };
  }

  const createdWorkspaceBlocker = candidateWorkspaceSymlinkBlocker(workspaceRoot);
  if (createdWorkspaceBlocker) {
    return {
      ok: false,
      error: createdWorkspaceBlocker,
      parentCwd,
      repoRoot,
      worktreePath,
      branchName,
      baseRef,
      parentDirty,
      parentDirtyWarning,
      naming,
    };
  }

  const addResult = await runGit(execRunner, repoRoot, [
    "worktree",
    "add",
    worktreePath,
    "-b",
    branchName,
    baseRef,
  ]);
  if (!addResult.ok) {
    return {
      ok: false,
      error: `failed to create git worktree: ${summarizeLaunchFailure(addResult)}`,
      parentCwd,
      repoRoot,
      worktreePath,
      branchName,
      baseRef,
      parentDirty,
      parentDirtyWarning,
      naming,
    };
  }

  return {
    ok: true,
    parentCwd,
    repoRoot,
    worktreePath,
    branchName,
    baseRef,
    parentDirty,
    parentDirtyWarning,
    reusedExisting: false,
    naming,
  };
}

function normalizeCandidatePeerReportBack(
  request: CandidatePeerSpawnRequest,
): CandidatePeerReportBack {
  if (
    request.reportBack === "intercom" ||
    request.reportBack === "manual" ||
    request.reportBack === "none"
  ) {
    return request.reportBack;
  }
  return "intercom";
}

function buildCandidatePeerSpawnPrompt({
  objective,
  request,
  worktree,
  reportBack,
  questId,
}: {
  objective: string;
  request: CandidatePeerSpawnRequest;
  worktree: WorktreePrepareSuccess;
  reportBack: CandidatePeerReportBack;
  questId: string;
}): string {
  return [
    "# Visible Candidate Peer Prompt",
    "",
    "You are a visible candidate peer launched in a clean Pi session. If you are reading this prompt, you are the spawned candidate peer, not the controller session. Identify as the candidate peer in your visible response and report-back. You are parallel cognition, not parallel authority.",
    "",
    "## BOOT PROTOCOL / FIRST ACTION REQUIRED",
    buildBootProtocolInstructions({
      reportBack,
      parentPeerTarget: request.parentPeerTarget,
      questId,
      peerLabel: "candidate peer",
    }),
    "",
    "## Quest Protocol",
    `Peer run id: ${questId}`,
    "Message budget: at most PEER_ACK and PEER_FINAL unless the controller explicitly asks a clarifying question or assigns new work. Legacy QUEST_ACK / QUEST_FINAL remains controller-compatible but is not preferred.",
    "",
    "## Objective",
    objective,
    "",
    "## Workspace Boundary",
    "You are working in an isolated git worktree.",
    "",
    `- Parent/controller cwd: ${worktree.parentCwd}`,
    `- Your worktree cwd: ${worktree.worktreePath}`,
    `- Branch: ${worktree.branchName}`,
    `- Base: ${worktree.baseRef}`,
    worktree.parentDirtyWarning ? `- Dirty-parent warning: ${worktree.parentDirtyWarning}` : "",
    "",
    "All mutations must stay inside your worktree. Do not modify the parent checkout.",
    "The controller records peer registry metadata and an archive-before-cleanup command packet for this candidate lane; treat that as cleanup guidance, not promotion authority.",
    "",
    "## Mutation Policy",
    "You may inspect, edit, and validate only inside your isolated worktree. Do not merge, push, open PRs, mutate AK, mutate controller runtime state, or claim promotion. If a required action is outside the worktree boundary, report the exact proposed controller action instead of applying it.",
    "",
    "## Files in Scope",
    markdownList(request.filesInScope),
    "",
    "## Off-Limits",
    markdownList(request.offLimits),
    "",
    "## Constraints",
    markdownList(request.constraints),
    "",
    "## Allowed Tools",
    "- `read`, `edit`, `write`, and bounded `bash` only within the worktree boundary and stated scope.",
    "- `dispatch_subagent` for one focused helper if it reduces risk.",
    "- `workflow_execute` for a small explicit plan if useful.",
    "- `intercom` for reporting back if available and requested below.",
    "",
    "Do not spawn more quest agents unless explicitly instructed.",
    "",
    "## Report-Back Instructions",
    buildReportBackInstructions({
      reportBack,
      parentPeerTarget: request.parentPeerTarget,
      questId,
      peerLabel: "candidate peer",
    }),
    "",
    "## Definition of Done",
    "Return a concise report with:",
    "",
    "1. Branch name",
    "2. Worktree path",
    "3. Files changed",
    "4. Commands run and results",
    "5. Metric/check result if applicable",
    "6. Patch summary",
    "7. Risks and rollback notes",
    "8. Recommended controller action: ignore, inspect, cherry-pick, or merge after review",
    ...(normalizeStringArray(request.dod).length
      ? ["", "## Additional Request-Specific DoD", markdownList(request.dod)]
      : []),
    "",
    "## Anti-Goals",
    "- Do not mutate the parent checkout.",
    "- Do not merge, push, open PRs, mutate AK, or claim completion/promotion authority.",
    "- Do not treat intercom or visible launch as durable evidence.",
  ].join("\n");
}

function errorToolResult(message: string, details: Record<string, unknown>) {
  return {
    content: [{ type: "text" as const, text: message }],
    details,
    isError: true,
  };
}

function successToolResult(message: string, details: Record<string, unknown>) {
  return {
    content: [{ type: "text" as const, text: message }],
    details,
  };
}

const AMBIGUOUS_PARENT_PEER_TARGETS = new Set([
  "active",
  "controller",
  "current",
  "here",
  "me",
  "parent",
  "self",
  "this",
]);

const EXACT_SESSION_ID_PATTERN =
  /^session-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type ParentPeerTargetValidation =
  | { ok: true; target: string }
  | { ok: false; reason: "missing" | "ambiguous" | "not_exact_session_id"; target?: string };

function validateParentPeerTarget(value: string | undefined): ParentPeerTargetValidation {
  const target = value?.trim();
  if (!target) return { ok: false, reason: "missing" };
  if (AMBIGUOUS_PARENT_PEER_TARGETS.has(target.toLowerCase())) {
    return { ok: false, reason: "ambiguous", target };
  }
  if (!EXACT_SESSION_ID_PATTERN.test(target)) {
    return { ok: false, reason: "not_exact_session_id", target };
  }
  return { ok: true, target };
}

function parentPeerTargetFailureResult(
  tool: string,
  validation: Exclude<ParentPeerTargetValidation, { ok: true }>,
) {
  if (validation.reason === "ambiguous") {
    return errorToolResult(
      `${tool} defaults to intercom report-back and requires an exact parentPeerTarget. "${validation.target}" is an ambiguous alias, not a deliverable intercom target. Call intercom({ action: "status" }) or intercom({ action: "list" }) first, then pass the exact Session ID as parentPeerTarget; or explicitly set reportBack to "manual" or "none".`,
      {
        ok: false,
        tool,
        reportBack: "intercom",
        parentPeerTarget: validation.target,
        error: "invalid_parent_peer_target",
        reason: "ambiguous_parent_peer_target",
        nextStep:
          'Call intercom({ action: "status" }) in the controller session and retry with parentPeerTarget set to the exact Session ID.',
      },
    );
  }

  const reason =
    validation.reason === "not_exact_session_id"
      ? "not_exact_session_id"
      : "missing_parent_peer_target";
  return errorToolResult(
    `${tool} defaults to intercom report-back and requires parentPeerTarget so the peer can report to the exact controller session. Call intercom({ action: "status" }) or intercom({ action: "list" }) first, then pass the exact Session ID as parentPeerTarget; or explicitly set reportBack to "manual" or "none".`,
    {
      ok: false,
      tool,
      reportBack: "intercom",
      parentPeerTarget: validation.target,
      error:
        validation.reason === "not_exact_session_id"
          ? "invalid_parent_peer_target"
          : "missing_parent_peer_target",
      reason,
      nextStep:
        'Call intercom({ action: "status" }) in the controller session and retry with parentPeerTarget set to the exact Session ID.',
    },
  );
}

function expectedPeerMessages(reportBack: SidequestReportBack): string[] {
  return reportBack === "intercom" ? ["PEER_ACK", "PEER_FINAL"] : [];
}

function reportBackNextStep({
  reportBack,
  peerRunId,
  peerLabel,
  manualAction,
}: {
  reportBack: SidequestReportBack;
  peerRunId: string;
  peerLabel: string;
  manualAction: string;
}): string {
  if (reportBack === "intercom") {
    return `Next supervision step: intercom({ action: "peer_watch", peerRunId: "${peerRunId}", waitFor: "ack", timeoutMs: 10000 }). Also ${manualAction} if the peer does not report promptly.`;
  }

  return `Intercom report-back is disabled because reportBack is "${reportBack}"; no PEER_ACK/PEER_FINAL will be emitted, and peer_watch will have nothing to watch. Next supervision step: ${manualAction} in the visible ${peerLabel} session.`;
}

function peerLaunchResultMessage({
  toolName,
  launchMode,
  promptSummary,
  peerRunId,
  reportBack,
  peerLabel,
  manualAction,
}: {
  toolName: string;
  launchMode: LaunchMode;
  promptSummary: string;
  peerRunId: string;
  reportBack: SidequestReportBack;
  peerLabel: string;
  manualAction: string;
}): string {
  const lines = [
    `Launched ${toolName} in ${launchMode}: ${promptSummary}`,
    `Peer run id: ${peerRunId}`,
  ];

  if (reportBack === "intercom") {
    lines.push("Expected intercom messages: PEER_ACK, PEER_FINAL");
  } else {
    lines.push(
      `Expected intercom messages: none (reportBack=${reportBack}; PEER_ACK/PEER_FINAL disabled)`,
    );
  }

  lines.push(
    reportBackNextStep({
      reportBack,
      peerRunId,
      peerLabel,
      manualAction,
    }),
  );

  return lines.join("\n");
}

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
        launch: (request) => launchAscExecutionObserverSession(pi, options, request),
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

    async function runForkPeerCommand(
      args: string | undefined,
      ctx: PiCommandContext,
      commandName: string,
      titlePrefix: string,
    ) {
      const prompt = getPrompt(args);
      if (!prompt) {
        if (ctx.hasUI) {
          ctx.ui.notify(`Usage: /${commandName} "what you want to explore"`, "warning");
        }
        return;
      }

      const sessionFile = ctx.sessionManager.getSessionFile();
      if (!sessionFile) {
        if (ctx.hasUI) {
          ctx.ui.notify(
            `${commandName} needs a saved Pi session. Current session looks ephemeral/no-session.`,
            "error",
          );
        }
        return;
      }

      const launch = await launchPiQuestSession({
        pi,
        ctx,
        options,
        prompt,
        titlePrompt: prompt,
        titlePrefix,
        cwd: ctx.cwd,
        sourceSessionFile: sessionFile,
      });

      if (!launch.ok) {
        if (ctx.hasUI) {
          ctx.ui.notify(`${commandName} failed to launch Ghostty: ${launch.failure}`, "error");
        }
        return;
      }

      if (ctx.hasUI) {
        const modeLabel = formatLaunchModeLabel(launch.launchMode, launch.launchNote);
        const suffix = launch.launchNote ? ` (${launch.launchNote})` : "";
        ctx.ui.notify(
          `Opened ${commandName} in ${modeLabel}: ${summarizePrompt(prompt)}${suffix}`,
          "info",
        );
      }
    }

    async function runHandoffTabCommand(args: string | undefined, ctx: PiCommandContext) {
      const goal = getPrompt(args) ?? DEFAULT_HANDOFF_GOAL;
      const cwd = ctx.cwd || process.cwd();
      const runtimeContext = await collectHandoffRuntimeContext({ pi, options, cwd });
      const generator = options.generateHandoffPrompt ?? generateSessionCompactionHandoffPrompt;
      let prompt: string;
      try {
        prompt = await generator({
          ctx: ctx as unknown as SessionCompactionHandoffGenerationContext,
          goal,
          runtimeContext,
        });
      } catch (error) {
        if (ctx.hasUI) {
          const detail = error instanceof Error ? error.message : String(error);
          ctx.ui.notify(`handoff-tab could not generate a handoff: ${detail}`, "error");
        }
        return;
      }

      const launch = await launchPiQuestSession({
        pi,
        ctx,
        options,
        prompt,
        titlePrompt: goal,
        titlePrefix: "Handoff",
        cwd,
      });
      if (!launch.ok) {
        if (ctx.hasUI) {
          ctx.ui.notify(`handoff-tab failed to launch Ghostty: ${launch.failure}`, "error");
        }
        return;
      }

      if (ctx.hasUI) {
        const modeLabel = formatLaunchModeLabel(launch.launchMode, launch.launchNote);
        const suffix = launch.launchNote ? ` (${launch.launchNote})` : "";
        ctx.ui.notify(
          `Opened a clean Pi session in ${modeLabel} and auto-submitted one generated handoff${suffix}`,
          "info",
        );
      }
    }

    async function runScoutPeerCommand(args: string | undefined, ctx: PiCommandContext) {
      const objective = getPrompt(args);
      if (!objective) {
        if (ctx.hasUI) ctx.ui.notify('Usage: /scoutpeer "what you want inspected"', "warning");
        return;
      }

      const parentPeerTarget = resolveParentPeerTarget(ctx);
      const reportBack: SidequestReportBack = parentPeerTarget ? "intercom" : "manual";
      const request: SidequestSpawnRequest = {
        objective,
        role: "scout",
        reportBack,
        ...(parentPeerTarget ? { parentPeerTarget } : {}),
      };
      const questId = createQuestId("scoutpeer");
      const cwd = ctx.cwd || process.cwd();
      const prompt = buildSidequestSpawnPrompt({
        role: "scout",
        objective,
        cwd,
        request,
        reportBack,
        questId,
      });
      const launch = await launchPiQuestSession({
        pi,
        ctx,
        options,
        prompt,
        titlePrompt: objective,
        titlePrefix: "Scoutpeer",
        cwd,
      });

      if (!launch.ok) {
        if (ctx.hasUI)
          ctx.ui.notify(`scoutpeer failed to launch Ghostty: ${launch.failure}`, "error");
        return;
      }

      if (ctx.hasUI) {
        const modeLabel = formatLaunchModeLabel(launch.launchMode, launch.launchNote);
        const suffix = launch.launchNote ? ` (${launch.launchNote})` : "";
        const reportBackNote =
          reportBack === "intercom"
            ? `; watch with intercom({ action: "peer_watch", peerRunId: "${questId}", waitFor: "final" })`
            : "; intercom disabled/manual because no exact parent peer target was available";
        ctx.ui.notify(
          `Opened scoutpeer in ${modeLabel}: ${summarizePrompt(objective)}${reportBackNote}${suffix}`,
          "info",
        );
      }
    }

    function createVisibleLoopContinuation(ctx: PiCommandContext): ContinueVisibleLoopInNewSession {
      return async ({ config, configPath, nextIteration, claimToken }) => {
        const titlePrefix = config.title ?? "Visible loop";
        const launch = await launchPiQuestSession({
          pi,
          ctx,
          options,
          prompt: renderVisibleLoopChildCommand(configPath, claimToken),
          titlePrompt: `${titlePrefix.toLowerCase()} ${nextIteration}/${config.loopCount}`,
          titlePrefix,
          cwd: config.cwd || ctx.cwd || process.cwd(),
        });
        if (!launch.ok) {
          throw new Error(launch.failure);
        }
        if (ctx.hasUI) {
          const modeLabel = formatLaunchModeLabel(launch.launchMode, launch.launchNote);
          const suffix = launch.launchNote ? ` (${launch.launchNote})` : "";
          ctx.ui.notify(
            `Opened ${titlePrefix.toLowerCase()} iteration ${nextIteration}/${config.loopCount} in ${modeLabel}${suffix}`,
            "info",
          );
        }
      };
    }

    function parseExtensionVisibleLoopCommand(text: string):
      | {
          commandName: typeof VISIBLE_LOOP_COMMAND;
          args: string;
          profile: VisibleLoopCommandProfile;
        }
      | { commandName: typeof NEXUS_LOOP_COMMAND; args: string; profile: VisibleLoopCommandProfile }
      | undefined {
      const match = text.match(/^\/(visible-loop|nexus-loop)(?:\s+([\s\S]*))?$/u);
      if (!match) return undefined;
      const commandName = match[1] as typeof VISIBLE_LOOP_COMMAND | typeof NEXUS_LOOP_COMMAND;
      const args = match[2] ?? "";
      return commandName === NEXUS_LOOP_COMMAND
        ? { commandName, args, profile: DEFAULT_NEXUS_LOOP_PROFILE }
        : { commandName, args, profile: DEFAULT_VISIBLE_LOOP_PROFILE };
    }

    async function runVisibleLoopCommand(
      args: string | undefined,
      ctx: PiCommandContext,
      profile: VisibleLoopCommandProfile = DEFAULT_VISIBLE_LOOP_PROFILE,
    ) {
      const { commandName, titlePrefix, prompts } = profile;
      const parsed = parseVisibleLoopCommandArgs(args, commandName);
      if (!parsed.ok) {
        if (ctx.hasUI) ctx.ui.notify(`${parsed.error}\n${parsed.usage}`, "warning");
        return;
      }

      const cwd = ctx.cwd || process.cwd();
      if (parsed.taskId !== undefined) {
        const execRunner: ExecRunner =
          options.exec ??
          ((command, execArgs, execOptions) => pi.exec(command, execArgs, execOptions));
        const taskBindingError = await checkAkTaskExecutionBinding(execRunner, cwd, parsed.taskId);
        if (taskBindingError) {
          if (ctx.hasUI) {
            ctx.ui.notify(
              `/${commandName} cannot launch: ${taskBindingError}. Re-run direction-to-execution or choose a current owner-authorized binding.`,
              "error",
            );
          }
          return;
        }
      }
      const resolvedSelfEvolutionEnvelope = parsed.candidateId
        ? findSelfEvolutionExecutionEnvelope(ctx.sessionManager.getBranch(), parsed.candidateId, {
            sessionId: ctx.sessionManager.getSessionId(),
          })
        : undefined;
      if (parsed.candidateId && !resolvedSelfEvolutionEnvelope) {
        if (ctx.hasUI) {
          ctx.ui.notify(
            `/${commandName} cannot launch: candidate ${parsed.candidateId} was not found as a valid self.evolution_candidate.v1 in this Pi session branch. Run self({ query: "self-evolution" }) and route the returned candidate id without editing it.`,
            "error",
          );
        }
        return;
      }
      const boundEnvelope = resolvedSelfEvolutionEnvelope
        ? bindSelfEvolutionOwnerArtifact(resolvedSelfEvolutionEnvelope, cwd)
        : undefined;
      if (boundEnvelope && !boundEnvelope.ok) {
        if (ctx.hasUI) {
          ctx.ui.notify(
            `/${commandName} cannot launch: ${boundEnvelope.error}. The promotion target must be a canonical typed owner artifact bound to this candidate.`,
            "error",
          );
        }
        return;
      }
      const selfEvolutionEnvelope = boundEnvelope?.envelope;
      const parentPeerTarget = parsed.parentPeerTarget ?? resolveParentPeerTarget(ctx);
      const candidateBinding = validatePersistedSelfEvolutionBinding(selfEvolutionEnvelope, {
        cwd,
        parentPeerTarget,
      });
      if (!candidateBinding.ok) {
        if (ctx.hasUI) {
          ctx.ui.notify(`/${commandName} cannot launch: ${candidateBinding.error}.`, "error");
        }
        return;
      }
      const reportBack =
        parsed.reportBack === "intercom" && !parentPeerTarget ? "manual" : parsed.reportBack;
      const missingPromptTemplates = listMissingVisibleLoopPromptTemplates(prompts, cwd);
      if (missingPromptTemplates.length > 0) {
        if (ctx.hasUI) {
          ctx.ui.notify(
            `/${commandName} cannot launch: missing required prompt template(s): ${missingPromptTemplates
              .map((name) => `/${name}`)
              .join(", ")}. Add them under ${join(cwd, ".pi", "prompts")} or ${join(
              homedir(),
              ".pi",
              "agent",
              "prompts",
            )}. Extension-originated visible loops can expand project/global prompt templates only; Pi package/settings/CLI prompt templates are not exposed to extensions.`,
            "error",
          );
        }
        return;
      }
      const shouldDelegateCommit =
        profile.delegateCommitByDefault === true || parsed.delegateCommit === true;
      const executionBinding =
        parsed.taskId !== undefined
          ? ({ mode: "ak_task", taskId: parsed.taskId } as const)
          : parsed.objective
            ? ({ mode: "operator_objective", objective: parsed.objective } as const)
            : parsed.candidateId
              ? ({
                  mode: "self_evolution_candidate",
                  candidateId: parsed.candidateId,
                } as const)
              : undefined;
      if (!executionBinding) {
        if (ctx.hasUI) {
          ctx.ui.notify(
            `/${commandName} cannot launch without an explicit execution binding. Run direction-to-execution or choose an owner-authorized task, then use --objective, --task, or --candidate.`,
            "error",
          );
        }
        return;
      }
      const config = createVisibleLoopRunConfig({
        loopCount: parsed.loopCount,
        cwd,
        reportBack,
        parentPeerTarget,
        commandName,
        prompts,
        executionBinding,
        ...(shouldDelegateCommit
          ? { commitDelegation: { mode: "dispatch_subagent", promptTemplate: "commit" } as const }
          : {}),
        ...(selfEvolutionEnvelope ? { selfEvolutionEnvelope } : {}),
        runIdPrefix: commandName,
        title: titlePrefix,
      });
      let configPath: string;
      try {
        configPath = writeVisibleLoopRunConfig(config, options.env ?? process.env);
      } catch (error) {
        if (ctx.hasUI) {
          const reason = error instanceof Error ? error.message : String(error);
          ctx.ui.notify(
            `/${commandName} cannot persist its private run config: ${reason}`,
            "error",
          );
        }
        return;
      }
      const childPrompt = renderVisibleLoopChildCommand(configPath);
      const launch = await launchPiQuestSession({
        pi,
        ctx,
        options,
        prompt: childPrompt,
        titlePrompt: `${titlePrefix.toLowerCase()} x${parsed.loopCount}`,
        titlePrefix,
        cwd,
      });

      if (!launch.ok) {
        if (ctx.hasUI) {
          ctx.ui.notify(`/${commandName} failed to launch Ghostty: ${launch.failure}`, "error");
        }
        return;
      }

      if (ctx.hasUI) {
        const modeLabel = formatLaunchModeLabel(launch.launchMode, launch.launchNote);
        const suffix = launch.launchNote ? ` (${launch.launchNote})` : "";
        const reportBackNote =
          reportBack === "intercom"
            ? `; watch with intercom({ action: "peer_watch", peerRunId: "${config.runId}", waitFor: "final" })`
            : "; intercom disabled/manual because no exact parent peer target was available";
        const statusPath = getVisibleLoopStatusPath(config, options.env ?? process.env);
        ctx.ui.notify(
          `Opened ${commandName} in ${modeLabel}: ${parsed.loopCount} iteration(s)${reportBackNote}; status ${statusPath}${suffix}`,
          "info",
        );
      }
    }

    async function runCandidatePeerCommand(
      args: string | undefined,
      ctx: PiCommandContext,
      commandName = "candidatepeer",
      titlePrefix = "Candidatepeer",
    ) {
      const objective = getPrompt(args);
      if (!objective) {
        if (ctx.hasUI)
          ctx.ui.notify(`Usage: /${commandName} "what candidate change to try"`, "warning");
        return;
      }

      const parentCwd = ctx.cwd || process.cwd();
      const request: CandidatePeerSpawnRequest = { objective, reportBack: "manual" };
      const env = options.env ?? process.env;
      const pathExists = options.pathExists ?? existsSync;
      const execRunner: ExecRunner =
        options.exec ??
        ((command, execArgs, execOptions) => pi.exec(command, execArgs, execOptions));
      const repository = await resolveCandidateRepoRoot(execRunner, parentCwd);
      if (!repository.ok) {
        if (ctx.hasUI) ctx.ui.notify(`${commandName} failed: ${repository.error}`, "error");
        return;
      }
      let admission: CandidateAdmissionReservation;
      try {
        admission = reserveAdmission({ repoRoot: repository.repoRoot, objective }, env);
      } catch (error) {
        if (ctx.hasUI) {
          ctx.ui.notify(
            `${commandName} admission blocked: ${error instanceof Error ? error.message : String(error)}`,
            "error",
          );
        }
        return;
      }
      const worktree = await prepareCandidatePeerWorktree({
        execRunner,
        pathExists,
        env,
        request,
        parentCwd,
        objective,
        admittedRepoRoot: repository.repoRoot,
      });

      if (!worktree.ok) {
        const releaseError = releasePreparationFailure(
          admission,
          worktree.error,
          env,
          releaseAdmission,
        );
        if (ctx.hasUI) {
          ctx.ui.notify(
            `${commandName} failed: ${worktree.error}${releaseError ? `; admission release failed: ${releaseError}` : ""}`,
            "error",
          );
        }
        return;
      }

      const questId = createQuestId("candidatepeer");
      try {
        bindAdmission(
          {
            admissionId: admission.admissionId,
            peerRunId: questId,
            worktreePath: worktree.worktreePath,
            branchName: worktree.branchName,
          },
          env,
        );
      } catch (error) {
        if (ctx.hasUI) {
          ctx.ui.notify(
            `${commandName} created a worktree but admission binding failed closed: ${error instanceof Error ? error.message : String(error)}`,
            "error",
          );
        }
        return;
      }
      const prompt = buildCandidatePeerSpawnPrompt({
        objective,
        request,
        worktree,
        reportBack: "manual",
        questId,
      });
      const launch = await launchPiQuestSession({
        pi,
        ctx,
        options,
        prompt,
        titlePrompt: objective,
        titlePrefix,
        cwd: worktree.worktreePath,
      });

      if (!launch.ok) {
        const registryRecord = createCandidatePeerRegistryRecord(
          {
            peerRunId: questId,
            tool: commandName,
            canonicalTool: "candidate_peer_spawn",
            parentCwd: worktree.parentCwd,
            repoRoot: worktree.repoRoot,
            worktreePath: worktree.worktreePath,
            branchName: worktree.branchName,
            baseRef: worktree.baseRef,
            parentDirty: worktree.parentDirty,
            parentDirtyWarning: worktree.parentDirtyWarning,
            reusedExisting: worktree.reusedExisting,
            naming: worktree.naming,
            reportBack: "manual",
            admission: admissionRegistryBinding(admission),
            launch: {
              status: "launch_failed",
              launchMode: launch.launchMode,
              sessionMode: launch.sessionMode,
              cwd: launch.cwd,
              sourceSessionFile: launch.sourceSessionFile,
              titleBase: launch.titleBase,
              promptSummary: launch.promptSummary,
              launchNote: launch.launchNote,
              failure: launch.failure,
            },
            controllerSession: {
              id: ctx.sessionManager.getSessionId?.(),
              name: ctx.sessionManager.getSessionName?.(),
              cwd: ctx.sessionManager.getCwd?.(),
              sessionFile: ctx.sessionManager.getSessionFile?.(),
            },
            processHints: { controllerPid: options.processId ?? process.pid },
          },
          env,
        );
        try {
          writeCandidatePeerRegistryRecord(registryRecord, env);
        } catch {
          // Best-effort diagnostic persistence only; the UI reports the launch failure below.
        }
        if (ctx.hasUI)
          ctx.ui.notify(`${commandName} failed to launch Ghostty: ${launch.failure}`, "error");
        return;
      }

      const registryRecord = createCandidatePeerRegistryRecord(
        {
          peerRunId: questId,
          tool: commandName,
          canonicalTool: "candidate_peer_spawn",
          parentCwd: worktree.parentCwd,
          repoRoot: worktree.repoRoot,
          worktreePath: worktree.worktreePath,
          branchName: worktree.branchName,
          baseRef: worktree.baseRef,
          parentDirty: worktree.parentDirty,
          parentDirtyWarning: worktree.parentDirtyWarning,
          reusedExisting: worktree.reusedExisting,
          naming: worktree.naming,
          reportBack: "manual",
          admission: admissionRegistryBinding(admission),
          launch: {
            status: "launched",
            launchMode: launch.launchMode,
            sessionMode: launch.sessionMode,
            cwd: launch.cwd,
            sourceSessionFile: launch.sourceSessionFile,
            titleBase: launch.titleBase,
            promptSummary: launch.promptSummary,
            launchNote: launch.launchNote,
          },
          controllerSession: {
            id: ctx.sessionManager.getSessionId?.(),
            name: ctx.sessionManager.getSessionName?.(),
            cwd: ctx.sessionManager.getCwd?.(),
            sessionFile: ctx.sessionManager.getSessionFile?.(),
          },
          processHints: { controllerPid: options.processId ?? process.pid },
        },
        env,
      );
      let registryPath: string | undefined;
      try {
        registryPath = writeCandidatePeerRegistryRecord(registryRecord, env);
      } catch {
        // Best-effort diagnostic persistence only; the visible candidate is already launched.
      }

      if (ctx.hasUI) {
        const modeLabel = formatLaunchModeLabel(launch.launchMode, launch.launchNote);
        const suffix = launch.launchNote ? ` (${launch.launchNote})` : "";
        const registryNote = registryPath ? `; registry ${registryPath}` : "";
        ctx.ui.notify(
          `Opened ${commandName} in ${modeLabel}: ${summarizePrompt(objective)}${registryNote}${suffix}`,
          "info",
        );
      }
    }

    async function executeForkPeerSpawn(toolName: string, params: unknown, ctx: PiToolContext) {
      const request = params as ForkPeerSpawnRequest;
      const objective = request.objective?.trim() ?? "";
      const reportBack = normalizeForkPeerReportBack(request);
      const cwd = request.cwd?.trim() || ctx.cwd || process.cwd();

      if (!objective) {
        return errorToolResult(`${toolName} requires a non-empty objective.`, {
          ok: false,
          tool: toolName,
          canonicalTool: "fork_peer_spawn",
          sessionMode: "fork",
          reportBack,
          error: "blank_objective",
        });
      }

      if (reportBack === "intercom") {
        const parentPeerTarget = validateParentPeerTarget(request.parentPeerTarget);
        if (!parentPeerTarget.ok) return parentPeerTargetFailureResult(toolName, parentPeerTarget);
      }

      const sessionFile = ctx.sessionManager.getSessionFile();
      if (!sessionFile) {
        return errorToolResult(
          `${toolName} needs a saved Pi session because fork peers inherit the current conversation context.`,
          {
            ok: false,
            tool: toolName,
            canonicalTool: "fork_peer_spawn",
            sessionMode: "fork",
            reportBack,
            cwd,
            error: "missing_session_file",
          },
        );
      }

      const questId = createQuestId("forkpeer");
      const prompt =
        reportBack === "manual" && !request.reportBack && !request.parentPeerTarget?.trim()
          ? objective
          : buildForkPeerSpawnPrompt({
              objective,
              request,
              reportBack,
              questId,
            });
      const launch = await launchPiQuestSession({
        pi,
        ctx,
        options,
        prompt,
        titlePrompt: objective,
        titlePrefix: "Forkpeer",
        cwd,
        sourceSessionFile: sessionFile,
      });

      if (!launch.ok) {
        return errorToolResult(`${toolName} failed to launch Ghostty: ${launch.failure}`, {
          ok: false,
          tool: toolName,
          canonicalTool: "fork_peer_spawn",
          launchMode: launch.launchMode,
          sessionMode: launch.sessionMode,
          cwd: launch.cwd,
          sourceSessionFile: launch.sourceSessionFile,
          titleBase: launch.titleBase,
          promptSummary: launch.promptSummary,
          launchNote: launch.launchNote,
          reportBack,
          parentPeerTarget: request.parentPeerTarget?.trim(),
          peerRunId: questId,
          expectedMessages: expectedPeerMessages(reportBack),
          error: "launch_failed",
        });
      }

      return successToolResult(
        peerLaunchResultMessage({
          toolName,
          launchMode: launch.launchMode,
          promptSummary: launch.promptSummary,
          peerRunId: questId,
          reportBack,
          peerLabel: "fork peer",
          manualAction: "watch the visible fork peer tab/window",
        }),
        {
          ok: true,
          tool: toolName,
          canonicalTool: "fork_peer_spawn",
          launchMode: launch.launchMode,
          sessionMode: launch.sessionMode,
          cwd: launch.cwd,
          sourceSessionFile: launch.sourceSessionFile,
          titleBase: launch.titleBase,
          promptSummary: launch.promptSummary,
          reportBack,
          parentPeerTarget: request.parentPeerTarget?.trim(),
          peerRunId: questId,
          expectedMessages: expectedPeerMessages(reportBack),
          nextStep: reportBackNextStep({
            reportBack,
            peerRunId: questId,
            peerLabel: "fork peer",
            manualAction: "watch the visible fork peer tab/window",
          }),
          ...(launch.launchNote ? { launchNote: launch.launchNote } : {}),
        },
      );
    }

    async function executeScoutPeerSpawn(toolName: string, params: unknown, ctx: PiToolContext) {
      const request = params as SidequestSpawnRequest;
      const objective = request.objective?.trim() ?? "";
      const role = normalizeSidequestRole(request.role);
      const reportBack = normalizeReportBack(request);
      const cwd = request.cwd?.trim() || ctx.cwd || process.cwd();

      if (!objective) {
        return errorToolResult(`${toolName} requires a non-empty objective.`, {
          ok: false,
          tool: toolName,
          canonicalTool: "scout_peer_spawn",
          role,
          reportBack,
          enforcement: "prompt_contract",
          error: "blank_objective",
        });
      }

      if (reportBack === "intercom") {
        const parentPeerTarget = validateParentPeerTarget(request.parentPeerTarget);
        if (!parentPeerTarget.ok) return parentPeerTargetFailureResult(toolName, parentPeerTarget);
      }

      const questId = createQuestId("scoutpeer");
      const prompt = buildSidequestSpawnPrompt({
        role,
        objective,
        cwd,
        request,
        reportBack,
        questId,
      });
      const launch = await launchPiQuestSession({
        pi,
        ctx,
        options,
        prompt,
        titlePrompt: objective,
        titlePrefix: "Scoutpeer",
        cwd,
      });

      if (!launch.ok) {
        return errorToolResult(`${toolName} failed to launch Ghostty: ${launch.failure}`, {
          ok: false,
          tool: toolName,
          canonicalTool: "scout_peer_spawn",
          launchMode: launch.launchMode,
          sessionMode: launch.sessionMode,
          cwd: launch.cwd,
          sourceSessionFile: launch.sourceSessionFile,
          titleBase: launch.titleBase,
          role,
          enforcement: "prompt_contract",
          promptSummary: launch.promptSummary,
          reportBack,
          peerRunId: questId,
          questId,
          expectedMessages: expectedPeerMessages(reportBack),
          launchNote: launch.launchNote,
          error: "launch_failed",
        });
      }

      const details = {
        ok: true,
        tool: toolName,
        canonicalTool: "scout_peer_spawn",
        launchMode: launch.launchMode,
        sessionMode: launch.sessionMode,
        cwd: launch.cwd,
        sourceSessionFile: launch.sourceSessionFile,
        titleBase: launch.titleBase,
        role,
        enforcement: "prompt_contract",
        promptSummary: launch.promptSummary,
        reportBack,
        peerRunId: questId,
        questId,
        expectedMessages: expectedPeerMessages(reportBack),
        nextStep: reportBackNextStep({
          reportBack,
          peerRunId: questId,
          peerLabel: "scout peer",
          manualAction: "Watch the visible scout peer tab/window manually",
        }),
        ...(launch.launchNote ? { launchNote: launch.launchNote } : {}),
      };

      return successToolResult(
        peerLaunchResultMessage({
          toolName,
          launchMode: launch.launchMode,
          promptSummary: launch.promptSummary,
          peerRunId: questId,
          reportBack,
          peerLabel: "scout peer",
          manualAction: "Watch the visible scout peer tab/window manually",
        }),
        details,
      );
    }

    async function executeCandidatePeerCleanup(
      _toolName: string,
      params: unknown,
      _ctx: PiToolContext,
    ) {
      const request = params as CandidatePeerCleanupRequest;
      const peerRunIds = (request.peerRunIds ?? []).map((id) => id.trim()).filter(Boolean);
      const execute = request.execute === true;
      const closeVisibleResources = request.closeVisibleResources === true;
      const env = options.env ?? process.env;

      if (peerRunIds.length === 0) {
        throw new Error("candidate_peer_cleanup requires at least one exact peerRunId.");
      }
      if (execute) {
        return successToolResult("candidate peer cleanup blocked", {
          ok: false,
          execution: "blocked_permanent_v1_quarantine",
          peerRunIds,
          blockers: [
            "Serialized v1 cleanup packets are permanently non-executable under AK decision 59.",
            "Use candidate-lifecycle-v2 review, disposition, integration proof, restoration-verified archive, authorization, and cleanup for the exact resource generation.",
          ],
        });
      }

      const lanes = peerRunIds.map((peerRunId) => {
        const registryPath = getCandidatePeerRegistryPath(peerRunId, env);
        const record = JSON.parse(
          readFileSync(registryPath, "utf8"),
        ) as CandidatePeerRegistryRecord;
        return {
          peerRunId,
          registryPath,
          repoRoot: record.repoRoot,
          worktreePath: record.worktreePath,
          branchName: record.branchName,
          archiveDir: record.archiveDir,
          cleanupPacket: record.cleanupPacket,
          tabOrSessionHint: record.launch.titleBase ?? peerRunId,
          processHint: `sidequest-pi process containing exact worktree path ${record.worktreePath}`,
          visibleResourceCommands: [
            {
              id: "terminate-exact-sidequest-process",
              description:
                "Terminate only sidequest/Pi processes whose command line contains the exact registered worktree path; closing that process closes the visible peer tab/session when the tab is owned by the launched process.",
              command: "sh",
              args: [
                "-c",
                [
                  "set -eu",
                  "worktree_path=$1",
                  "pids=$(ps -eo pid=,args= | grep -F \"$worktree_path\" | grep -E 'sidequest-pi pi| pi ' | grep -v grep | awk '{print $1}' || true)",
                  'test -n "$pids" || exit 0',
                  "kill $pids 2>/dev/null || true",
                  "sleep 1",
                  "pids=$(ps -eo pid=,args= | grep -F \"$worktree_path\" | grep -E 'sidequest-pi pi| pi ' | grep -v grep | awk '{print $1}' || true)",
                  'test -z "$pids" || kill -9 $pids 2>/dev/null || true',
                ].join("; "),
                "candidate-peer-close-visible-resource",
                record.worktreePath,
              ],
              cwd: record.repoRoot,
              destructive: true,
            },
          ],
        };
      });

      return successToolResult("candidate peer cleanup dry run", {
        ok: true,
        execution: "dry_run_plan_only",
        closeVisibleResources,
        laneCount: lanes.length,
        lanes,
        commandResults: [],
        boundary:
          "Registry-v1 cleanup is permanently non-executable. This result projects exact historical sidecar commands for inspection only; lifecycle-v2 owner tooling is the sole executable cleanup path.",
      });
    }

    async function executeCandidatePeerCloseout(
      toolName: string,
      params: unknown,
      _ctx: PiToolContext,
    ) {
      const request = params as CandidatePeerCloseoutRequest;
      const action = request.action;
      const env = options.env ?? process.env;
      const planningContext = {
        taskId: request.taskId,
        integrationCloseout: request.integrationCloseout,
        cleanupTrigger: request.cleanupTrigger,
        nonAuthorizing: true,
      };
      if (action === "status" || action === "plan") {
        const result = projectCloseout({
          action,
          peerRunIds: request.peerRunIds ?? [],
          env,
        });
        return successToolResult(`${toolName} ${action}`, {
          ok: true,
          ...result,
          planningContext,
        });
      }
      if (action === "execute_authorized") {
        const result = executeCloseout({ peerRunIds: request.peerRunIds ?? [], env });
        return successToolResult(`${toolName} ${result.execution}`, {
          ok: result.execution === "completed",
          ...result,
          planningContext,
        });
      }
      if (action === "janitor_status" || action === "janitor_execute_authorized") {
        const repoRoot = request.repoRoot?.trim() ?? "";
        if (!repoRoot) throw new Error(`${toolName} ${action} requires an exact repoRoot`);
        const result = runCloseoutJanitor({
          action: action === "janitor_status" ? "status" : "execute_authorized",
          repoRoot,
          ...(request.overdueAfterMs === undefined
            ? {}
            : { overdueAfterMs: request.overdueAfterMs }),
          env,
        });
        return successToolResult(`${toolName} ${action} ${result.execution}`, {
          ok: ["not_requested", "completed"].includes(result.execution),
          ...result,
          toolAction: action,
          planningContext,
        });
      }
      throw new Error(`${toolName} requires a supported lifecycle-v2 action`);
    }

    async function executeCandidatePeerSpawn(
      toolName: string,
      params: unknown,
      ctx: PiToolContext,
    ) {
      const request = params as CandidatePeerSpawnRequest;
      const objective = request.objective?.trim() ?? "";
      const reportBack = normalizeCandidatePeerReportBack(request);
      const parentCwd = request.cwd?.trim() || ctx.cwd || process.cwd();
      const env = options.env ?? process.env;
      const pathExists = options.pathExists ?? existsSync;
      const execRunner: ExecRunner =
        options.exec ??
        ((command, execArgs, execOptions) => pi.exec(command, execArgs, execOptions));

      if (!objective) {
        return errorToolResult(`${toolName} requires a non-empty objective.`, {
          ok: false,
          tool: toolName,
          canonicalTool: "candidate_peer_spawn",
          reportBack,
          error: "blank_objective",
        });
      }

      if (reportBack === "intercom") {
        const parentPeerTarget = validateParentPeerTarget(request.parentPeerTarget);
        if (!parentPeerTarget.ok) return parentPeerTargetFailureResult(toolName, parentPeerTarget);
      }

      const repository = await resolveCandidateRepoRoot(execRunner, parentCwd);
      if (!repository.ok) {
        return errorToolResult(`${toolName} failed: ${repository.error}`, {
          ok: false,
          tool: toolName,
          canonicalTool: "candidate_peer_spawn",
          reportBack,
          parentCwd,
          error: "candidate_repo_resolution_failed",
        });
      }
      let admission: CandidateAdmissionReservation;
      try {
        admission = reserveAdmission({ repoRoot: repository.repoRoot, objective }, env);
      } catch (error) {
        return errorToolResult(
          `${toolName} admission blocked: ${error instanceof Error ? error.message : String(error)}`,
          {
            ok: false,
            tool: toolName,
            canonicalTool: "candidate_peer_spawn",
            reportBack,
            parentCwd,
            repoRoot: repository.repoRoot,
            error: "candidate_admission_blocked",
          },
        );
      }

      const worktree = await prepareCandidatePeerWorktree({
        execRunner,
        pathExists,
        env,
        request,
        parentCwd,
        objective,
        admittedRepoRoot: repository.repoRoot,
      });

      if (!worktree.ok) {
        const admissionReleaseError = releasePreparationFailure(
          admission,
          worktree.error,
          env,
          releaseAdmission,
        );
        return errorToolResult(`${toolName} failed: ${worktree.error}`, {
          ok: false,
          tool: toolName,
          canonicalTool: "candidate_peer_spawn",
          reportBack,
          parentCwd: worktree.parentCwd,
          repoRoot: worktree.repoRoot,
          worktreePath: worktree.worktreePath,
          branchName: worktree.branchName,
          baseRef: worktree.baseRef,
          parentDirty: worktree.parentDirty,
          parentDirtyWarning: worktree.parentDirtyWarning,
          naming: worktree.naming,
          admissionId: admission.admissionId,
          admissionReleaseError,
          error: "worktree_prepare_failed",
          reason: worktree.error,
        });
      }

      const questId = createQuestId("candidatepeer");
      try {
        bindAdmission(
          {
            admissionId: admission.admissionId,
            peerRunId: questId,
            worktreePath: worktree.worktreePath,
            branchName: worktree.branchName,
          },
          env,
        );
      } catch (error) {
        return errorToolResult(
          `${toolName} created a worktree but admission binding failed closed: ${error instanceof Error ? error.message : String(error)}`,
          {
            ok: false,
            tool: toolName,
            canonicalTool: "candidate_peer_spawn",
            reportBack,
            repoRoot: worktree.repoRoot,
            worktreePath: worktree.worktreePath,
            branchName: worktree.branchName,
            admissionId: admission.admissionId,
            error: "candidate_admission_binding_failed",
          },
        );
      }
      const prompt = buildCandidatePeerSpawnPrompt({
        objective,
        request,
        worktree,
        reportBack,
        questId,
      });
      const launch = await launchPiQuestSession({
        pi,
        ctx,
        options,
        prompt,
        titlePrompt: objective,
        titlePrefix: "Candidatepeer",
        cwd: worktree.worktreePath,
      });

      if (!launch.ok) {
        const registryRecord = createCandidatePeerRegistryRecord(
          {
            peerRunId: questId,
            tool: toolName,
            canonicalTool: "candidate_peer_spawn",
            parentCwd: worktree.parentCwd,
            repoRoot: worktree.repoRoot,
            worktreePath: worktree.worktreePath,
            branchName: worktree.branchName,
            baseRef: worktree.baseRef,
            parentDirty: worktree.parentDirty,
            parentDirtyWarning: worktree.parentDirtyWarning,
            reusedExisting: worktree.reusedExisting,
            naming: worktree.naming,
            reportBack,
            admission: admissionRegistryBinding(admission),
            parentPeerTarget: request.parentPeerTarget?.trim(),
            filesInScope: normalizeStringArray(request.filesInScope),
            offLimits: normalizeStringArray(request.offLimits),
            constraints: normalizeStringArray(request.constraints),
            dod: normalizeStringArray(request.dod),
            launch: {
              status: "launch_failed",
              launchMode: launch.launchMode,
              sessionMode: launch.sessionMode,
              cwd: launch.cwd,
              sourceSessionFile: launch.sourceSessionFile,
              titleBase: launch.titleBase,
              promptSummary: launch.promptSummary,
              launchNote: launch.launchNote,
              failure: launch.failure,
            },
            controllerSession: {
              id: ctx.sessionManager.getSessionId?.(),
              name: ctx.sessionManager.getSessionName?.(),
              cwd: ctx.sessionManager.getCwd?.(),
              sessionFile: ctx.sessionManager.getSessionFile?.(),
            },
            processHints: { controllerPid: options.processId ?? process.pid },
          },
          env,
        );
        let registryWriteError: string | undefined;
        try {
          writeCandidatePeerRegistryRecord(registryRecord, env);
        } catch (error) {
          registryWriteError = error instanceof Error ? error.message : String(error);
        }

        return errorToolResult(`${toolName} failed to launch Ghostty: ${launch.failure}`, {
          ok: false,
          tool: toolName,
          canonicalTool: "candidate_peer_spawn",
          launchMode: launch.launchMode,
          parentCwd: worktree.parentCwd,
          repoRoot: worktree.repoRoot,
          worktreePath: worktree.worktreePath,
          branchName: worktree.branchName,
          baseRef: worktree.baseRef,
          parentDirty: worktree.parentDirty,
          parentDirtyWarning: worktree.parentDirtyWarning,
          reusedExisting: worktree.reusedExisting,
          naming: worktree.naming,
          sessionMode: launch.sessionMode,
          sourceSessionFile: launch.sourceSessionFile,
          titleBase: launch.titleBase,
          promptSummary: launch.promptSummary,
          reportBack,
          peerRunId: questId,
          questId,
          expectedMessages: expectedPeerMessages(reportBack),
          registryPath: registryRecord.registryPath,
          archiveDir: registryRecord.archiveDir,
          cleanupPacket: registryRecord.cleanupPacket,
          registryWriteError,
          launchNote: launch.launchNote,
          error: "launch_failed",
        });
      }

      const registryRecord = createCandidatePeerRegistryRecord(
        {
          peerRunId: questId,
          tool: toolName,
          canonicalTool: "candidate_peer_spawn",
          parentCwd: worktree.parentCwd,
          repoRoot: worktree.repoRoot,
          worktreePath: worktree.worktreePath,
          branchName: worktree.branchName,
          baseRef: worktree.baseRef,
          parentDirty: worktree.parentDirty,
          parentDirtyWarning: worktree.parentDirtyWarning,
          reusedExisting: worktree.reusedExisting,
          naming: worktree.naming,
          reportBack,
          admission: admissionRegistryBinding(admission),
          parentPeerTarget: request.parentPeerTarget?.trim(),
          filesInScope: normalizeStringArray(request.filesInScope),
          offLimits: normalizeStringArray(request.offLimits),
          constraints: normalizeStringArray(request.constraints),
          dod: normalizeStringArray(request.dod),
          launch: {
            status: "launched",
            launchMode: launch.launchMode,
            sessionMode: launch.sessionMode,
            cwd: launch.cwd,
            sourceSessionFile: launch.sourceSessionFile,
            titleBase: launch.titleBase,
            promptSummary: launch.promptSummary,
            launchNote: launch.launchNote,
          },
          controllerSession: {
            id: ctx.sessionManager.getSessionId?.(),
            name: ctx.sessionManager.getSessionName?.(),
            cwd: ctx.sessionManager.getCwd?.(),
            sessionFile: ctx.sessionManager.getSessionFile?.(),
          },
          processHints: { controllerPid: options.processId ?? process.pid },
        },
        env,
      );
      let registryWriteError: string | undefined;
      try {
        writeCandidatePeerRegistryRecord(registryRecord, env);
      } catch (error) {
        registryWriteError = error instanceof Error ? error.message : String(error);
      }

      const details = {
        ok: true,
        tool: toolName,
        canonicalTool: "candidate_peer_spawn",
        launchMode: launch.launchMode,
        parentCwd: worktree.parentCwd,
        repoRoot: worktree.repoRoot,
        worktreePath: worktree.worktreePath,
        branchName: worktree.branchName,
        baseRef: worktree.baseRef,
        parentDirty: worktree.parentDirty,
        ...(worktree.parentDirtyWarning ? { parentDirtyWarning: worktree.parentDirtyWarning } : {}),
        reusedExisting: worktree.reusedExisting,
        naming: worktree.naming,
        sessionMode: launch.sessionMode,
        admission: admissionRegistryBinding(admission),
        sourceSessionFile: launch.sourceSessionFile,
        titleBase: launch.titleBase,
        promptSummary: launch.promptSummary,
        reportBack,
        peerRunId: questId,
        questId,
        expectedMessages: expectedPeerMessages(reportBack),
        registryPath: registryRecord.registryPath,
        archiveDir: registryRecord.archiveDir,
        cleanupPacket: registryRecord.cleanupPacket,
        ...(registryWriteError ? { registryWriteError } : {}),
        nextStep: reportBackNextStep({
          reportBack,
          peerRunId: questId,
          peerLabel: "candidate peer",
          manualAction:
            "Inspect the reported branch/worktree, registry metadata, cleanup packet, and visible candidate peer session manually",
        }),
        ...(launch.launchNote ? { launchNote: launch.launchNote } : {}),
      };

      return successToolResult(
        peerLaunchResultMessage({
          toolName,
          launchMode: launch.launchMode,
          promptSummary: launch.promptSummary,
          peerRunId: questId,
          reportBack,
          peerLabel: "candidate peer",
          manualAction:
            "Inspect the reported branch/worktree, registry metadata, cleanup packet, and visible candidate peer session manually",
        }),
        details,
      );
    }

    if (registerCommands) {
      pi.registerCommand(HANDOFF_TAB_COMMAND, {
        description:
          "Generate a self-contained handoff and auto-submit it in a clean Ghostty Pi tab",
        handler: runHandoffTabCommand,
      });

      pi.registerCommand(SIDEQUEST_COMMAND, {
        description: "Fork the current Pi session into a visible Ghostty peer",
        handler: (args, ctx) => runForkPeerCommand(args, ctx, SIDEQUEST_COMMAND, "Sidequest"),
      });

      pi.registerCommand(SCOUTPEER_COMMAND, {
        description: "Launch a clean visible read-only scout/review peer in the current workspace",
        handler: runScoutPeerCommand,
      });

      pi.registerCommand(PARALLELQUEST_COMMAND, {
        description: "Launch a clean visible candidate peer in an isolated git worktree",
        handler: (args, ctx) =>
          runCandidatePeerCommand(args, ctx, PARALLELQUEST_COMMAND, "Parallelquest"),
      });

      pi.registerCommand(VISIBLE_LOOP_COMMAND, {
        description:
          "Launch a visible Ghostty Pi tab that runs the default prompt sequence for N iterations",
        handler: runVisibleLoopCommand,
      });

      pi.registerCommand(NEXUS_LOOP_COMMAND, {
        description:
          "Launch a visible Ghostty Pi tab that loops deep-review, nexus implementation, atomic-completion, and commit",
        handler: (args, ctx) => runVisibleLoopCommand(args, ctx, DEFAULT_NEXUS_LOOP_PROFILE),
      });

      pi.registerCommand(VISIBLE_LOOP_CHILD_COMMAND, {
        description: "Internal helper for visible-loop launched child sessions",
        handler: (args, ctx) =>
          startVisibleLoopChildRunner(args, pi, ctx, options.env ?? process.env, {
            continueInNewSession: createVisibleLoopContinuation(ctx),
            governedDeepReviewPreflight: options.governedDeepReviewPreflight,
          }),
      });

      pi.registerCommand(VISIBLE_LOOP_CHILD_COMPLETE_COMMAND, {
        description: "Internal helper that advances a visible-loop child iteration",
        handler: async (args, ctx) => {
          await startVisibleLoopChildCompleteRunner(args, pi, ctx, options.env ?? process.env, {
            continueInNewSession: createVisibleLoopContinuation(ctx),
          });
        },
      });

      pi.on?.("input", async (event, ctx) => {
        if (event.source !== "extension") return { action: "continue" };
        const command = parseExtensionVisibleLoopCommand(event.text);
        if (!command) return { action: "continue" };
        await runVisibleLoopCommand(command.args, ctx as PiCommandContext, command.profile);
        return { action: "handled" };
      });
    }

    pi.on?.("agent_start", async (_event, ctx) => {
      const commandCtx = ctx ?? {};
      handleVisibleLoopAgentStart(pi, commandCtx, options.env ?? process.env, {
        continueInNewSession: createVisibleLoopContinuation(commandCtx as PiCommandContext),
        governedDeepReviewPreflight: options.governedDeepReviewPreflight,
      });
    });

    pi.on?.("message_start", async (event, ctx) => {
      const commandCtx = ctx ?? {};
      handleVisibleLoopMessageStart(event, pi, commandCtx, options.env ?? process.env, {
        continueInNewSession: createVisibleLoopContinuation(commandCtx as PiCommandContext),
        governedDeepReviewPreflight: options.governedDeepReviewPreflight,
      });
    });

    pi.on?.("tool_execution_start", async (event, ctx) => {
      const commandCtx = ctx ?? {};
      handleVisibleLoopToolExecutionStart(event, pi, commandCtx, options.env ?? process.env, {
        continueInNewSession: createVisibleLoopContinuation(commandCtx as PiCommandContext),
        governedDeepReviewPreflight: options.governedDeepReviewPreflight,
      });
    });

    pi.on?.("tool_call", async (event, ctx) => {
      const commandCtx = ctx ?? {};
      return handleVisibleLoopToolCall(event, pi, commandCtx, options.env ?? process.env, {
        continueInNewSession: createVisibleLoopContinuation(commandCtx as PiCommandContext),
        governedDeepReviewPreflight: options.governedDeepReviewPreflight,
      });
    });

    pi.on?.("tool_result", async (event, ctx) => {
      const commandCtx = ctx ?? {};
      handleVisibleLoopToolResult(event, pi, commandCtx, options.env ?? process.env, {
        continueInNewSession: createVisibleLoopContinuation(commandCtx as PiCommandContext),
        governedDeepReviewPreflight: options.governedDeepReviewPreflight,
      });
    });

    pi.on?.("tool_execution_end", async (event, ctx) => {
      const commandCtx = ctx ?? {};
      handleVisibleLoopToolExecutionEnd(event, pi, commandCtx, options.env ?? process.env, {
        continueInNewSession: createVisibleLoopContinuation(commandCtx as PiCommandContext),
        governedDeepReviewPreflight: options.governedDeepReviewPreflight,
      });
    });

    pi.on?.("agent_settled", async (_event, ctx) => {
      const commandCtx = ctx ?? {};
      handleVisibleLoopAgentSettled(pi, commandCtx, options.env ?? process.env, {
        continueInNewSession: createVisibleLoopContinuation(commandCtx as PiCommandContext),
        governedDeepReviewPreflight: options.governedDeepReviewPreflight,
      });
    });

    if (!registerTools) return;

    if (registerCommands) {
      pi.registerTool({
        name: "visible_loop_child_complete",
        label: "Visible Loop Child Complete",
        description:
          "Internal checkpoint tool for visible-loop child sessions to mark an iteration complete after the queued prompt sequence and completion gate have succeeded; do not call from ordinary work.",
        promptSnippet:
          "Internal visible-loop completion fallback tool. Use only when explicitly asked to mark visible-loop completion with configPath and iteration.",
        parameters: visibleLoopChildCompleteToolParameters,
        execute: async (_toolCallId, params, _signal, _onUpdate, ctx) => {
          const request = params as {
            configPath?: string;
            iteration?: number;
            candidateCloseout?: SelfEvolutionCandidateCloseout;
          };
          const configPath = typeof request.configPath === "string" ? request.configPath : "";
          const iteration = Number(request.iteration);
          const outcome = await startVisibleLoopChildCompleteRunner(
            `${configPath} --iteration ${iteration}`,
            pi,
            ctx,
            options.env ?? process.env,
            {
              continueInNewSession: createVisibleLoopContinuation(ctx as PiCommandContext),
              candidateCloseout: request.candidateCloseout,
            },
          );
          return successToolResult(
            outcome.accepted
              ? "visible-loop completion accepted"
              : `visible-loop completion rejected: ${outcome.reason}`,
            {
              ...outcome,
              configPath,
              iteration,
              note: "typed outcome mirrors the completion gate; status sidecar/intercom remain diagnostic",
            },
          );
        },
      });
    }

    pi.registerTool({
      name: FORK_PEER_SPAWN_TOOL,
      label: "Fork Peer Spawn",
      description: "Launch a visible forked-context peer Pi session.",
      promptSnippet:
        "Use to launch a visible peer that inherits the current Pi conversation context. This is the tool equivalent of /sidequest for controller-spawned use.",
      parameters: forkPeerSpawnParameters,
      execute: (_toolCallId, params, _signal, _onUpdate, ctx) =>
        executeForkPeerSpawn(FORK_PEER_SPAWN_TOOL, params, ctx),
    });

    pi.registerTool({
      name: SCOUT_PEER_SPAWN_TOOL,
      label: "Scout Peer Spawn",
      description: "Launch a clean visible read-only scout/review peer Pi session.",
      promptSnippet:
        "Use to launch a clean visible scout/review peer in the same workspace. It does not inherit the controller conversation and returns launch facts only.",
      parameters: scoutPeerSpawnParameters,
      execute: (_toolCallId, params, _signal, _onUpdate, ctx) =>
        executeScoutPeerSpawn(SCOUT_PEER_SPAWN_TOOL, params, ctx),
    });

    pi.registerTool({
      name: CANDIDATE_PEER_SPAWN_TOOL,
      label: "Candidate Peer Spawn",
      description:
        "Launch a clean visible candidate peer Pi session in an isolated git worktree for bounded mutation.",
      promptSnippet:
        "Use to create an isolated git worktree and launch a clean visible candidate peer for bounded mutation. It does not merge, push, open PRs, mutate AK, or claim promotion.",
      parameters: candidatePeerSpawnParameters,
      execute: (_toolCallId, params, _signal, _onUpdate, ctx) =>
        executeCandidatePeerSpawn(CANDIDATE_PEER_SPAWN_TOOL, params, ctx),
    });

    pi.registerTool({
      name: CANDIDATE_PEER_CLEANUP_TOOL,
      label: "Candidate Peer Cleanup",
      description:
        "Inspect historical candidate registry-v1 cleanup projections without executing them.",
      promptSnippet:
        "Use for read-only inspection of exact registry-v1 sidecars. execute=true is permanently blocked by Decision 59; use lifecycle-v2 owner tooling for cleanup.",
      parameters: candidatePeerCleanupParameters,
      execute: (_toolCallId, params, _signal, _onUpdate, ctx) =>
        executeCandidatePeerCleanup(CANDIDATE_PEER_CLEANUP_TOOL, params, ctx),
    });

    pi.registerTool({
      name: CANDIDATE_PEER_CLOSEOUT_TOOL,
      label: "Candidate Peer Closeout",
      description:
        "Resolve exact peer aliases to lifecycle-v2 generations, plan closeout, execute existing cleanup authorization, or run a repository-bounded janitor.",
      promptSnippet:
        "Use status/plan for read-only lifecycle-v2 resolution. execute_authorized and janitor_execute_authorized may act only on existing exact cleanup authorization; peer final reports, integration status, and age never authorize cleanup.",
      parameters: candidatePeerCloseoutParameters,
      execute: (_toolCallId, params, _signal, _onUpdate, ctx) =>
        executeCandidatePeerCloseout(CANDIDATE_PEER_CLOSEOUT_TOOL, params, ctx),
    });
  };
}

export default createSidequestExtension();
