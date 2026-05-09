/**
 * Loop Engine — Pluggable iteration frameworks (OODA, Strategic, Kaizen, ADKAR)
 *
 * Each plugin defines phases, cognitive tools per phase, and transition hooks.
 * The engine executes phases sequentially, recording evidence and package-owned KES artifacts.
 *
 * Note: the former `mito` loop name was retired because it collided with
 * Prof. Binner's MITO terminology already used elsewhere in the workspace.
 *
 * Usage:
 *   /loop ooda "Fix the authentication bug"
 *   /loop strategic "Plan the migration strategy"
 *   /loop kaizen "Improve test coverage"
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type {
  AgentToolResult,
  AgentToolUpdateCallback,
  ExtensionAPI,
  ExtensionContext,
} from "@mariozechner/pi-coding-agent";
import { Text } from "@mariozechner/pi-tui";
import { Type } from "typebox";
import { isKesMaterializationError, KES_MATERIALIZATION_FAILURE_KIND } from "../kes/index.ts";
import { AGENT_PROFILES } from "../runtime/agent-profiles.ts";
import type { AgentResolution } from "../runtime/agent-routing.ts";
import { resolveAkPath, runAkCommandAsync } from "../runtime/ak.ts";
import { isBoundaryFailure } from "../runtime/boundaries.ts";
import { getCognitiveToolByName } from "../runtime/cognitive-tools.ts";
import {
  type EvidenceEntry,
  type EvidenceWriteResult,
  finalizeExecutionEffects,
  recordEvidence,
} from "../runtime/evidence.ts";
import type { ExecutionStatus } from "../runtime/execution-status.ts";
import { createOrchestratorSubagentExecutor, toExecutionLike } from "../runtime/subagent.ts";
import type { TeamScopedContext } from "../runtime/team-state.ts";
import { LoopKesWriter } from "./kes.ts";

type CompatToolDefinition = Omit<Parameters<ExtensionAPI["registerTool"]>[0], "parameters"> & {
  parameters?: unknown;
};

function registerCompatTool(pi: ExtensionAPI, tool: CompatToolDefinition): void {
  pi.registerTool(tool as Parameters<ExtensionAPI["registerTool"]>[0]);
}

const DEFAULT_SOCIETY_DB =
  process.env.SOCIETY_DB ||
  process.env.AK_DB ||
  path.join(os.homedir(), "ai-society", "society.db");
const DEFAULT_LOOP_TIMEOUT_MS = parsePositiveMilliseconds(
  process.env.PI_ORCH_LOOP_TIMEOUT_MS,
  30 * 60 * 1000,
);

// ============================================================================
// TYPES
// ============================================================================

export interface LoopPlugin {
  name: string;
  phases: string[];
  description: string;
  cognitiveTools: Record<string, string[]>;
  agents: Record<string, string>;
  continueOnFailure?: boolean;
  onEnter?(phase: string, context: LoopContext): Promise<void>;
  onExit?(phase: string, context: LoopContext): Promise<Artifact[]>;
  validate?(from: string, to: string, context: LoopContext): boolean;
}

export interface LoopContext {
  sessionId: string;
  pluginName: string;
  objective: string;
  currentPhase: string;
  history: PhaseResult[];
  artifacts: Artifact[];
  cwd: string;
}

export interface PhaseResult {
  phase: string;
  output: string;
  exitCode: number;
  status: ExecutionStatus;
  failureKind?: string;
  elapsed: number;
  artifacts: Artifact[];
  timestamp: Date;
}

export interface Artifact {
  type: string;
  content: string;
  metadata: Record<string, unknown>;
}

export interface LoopResult {
  plugin: string;
  objective: string;
  phases: PhaseResult[];
  artifacts: Artifact[];
  success: boolean;
  elapsed: number;
}

export interface CompactPhaseResult {
  phase: string;
  status: ExecutionStatus;
  exitCode: number;
  elapsed: number;
  failureKind?: string;
  artifactPaths: string[];
}

export interface CompactLoopResult {
  plugin: string;
  objective: string;
  phases: CompactPhaseResult[];
  artifactPaths: string[];
  success: boolean;
  elapsed: number;
}

export type LoopExecutionUpdate =
  | {
      event: "phase_start";
      plugin: string;
      sessionId: string;
      phase: string;
      phaseIndex: number;
      phaseCount: number;
      agent: string;
      primaryTool: string;
    }
  | {
      event: "phase_update";
      plugin: string;
      sessionId: string;
      phase: string;
      update: unknown;
    }
  | {
      event: "phase_complete";
      plugin: string;
      sessionId: string;
      phase: string;
      status: ExecutionStatus;
      elapsed: number;
      failureKind?: string;
    };

export interface LoopExecutionOptions {
  continueAfterFailure?: boolean;
  phaseTimeoutSeconds?: number;
  onUpdate?: (update: LoopExecutionUpdate) => void;
}

// ============================================================================
// BUILT-IN PLUGINS
// ============================================================================

export const OODA_PLUGIN: LoopPlugin = {
  name: "ooda",
  phases: ["observe", "orient", "decide", "act"],
  description: "OODA Loop — Observe, Orient, Decide, Act. Military-grade decision cycle.",
  cognitiveTools: {
    observe: ["telescopic", "dependency-cartography"],
    orient: ["inversion", "audit", "evidence-matrix"],
    decide: ["nexus", "constraint-inventory"],
    act: ["controlled", "atomic-completion"],
  },
  agents: {
    observe: "scout",
    orient: "reviewer",
    decide: "researcher",
    act: "builder",
  },
};

export const STRATEGIC_PLUGIN: LoopPlugin = {
  name: "strategic",
  phases: ["mission", "intelligence", "tooling", "operations"],
  description:
    "Strategic loop — Mission, Intelligence, Tooling, Operations. Strategic execution frame.",
  cognitiveTools: {
    mission: ["first-principles", "nexus"],
    intelligence: ["telescopic", "inversion"],
    tooling: ["audit", "blast-radius"],
    operations: ["controlled", "atomic-completion"],
  },
  agents: {
    mission: "researcher",
    intelligence: "scout",
    tooling: "reviewer",
    operations: "builder",
  },
};

export const KAIZEN_PLUGIN: LoopPlugin = {
  name: "kaizen",
  phases: ["plan", "do", "check", "act"],
  description: "Kaizen (PDCA) — Plan, Do, Check, Act. Continuous improvement cycle.",
  cognitiveTools: {
    plan: ["first-principles", "nexus", "constraint-inventory"],
    do: ["controlled", "atomic-completion"],
    check: ["audit", "inversion", "mirror"],
    act: ["knowledge-crystallization", "elevate"],
  },
  agents: {
    plan: "researcher",
    do: "builder",
    check: "reviewer",
    act: "researcher",
  },
};

export const ADKAR_PLUGIN: LoopPlugin = {
  name: "adkar",
  phases: ["awareness", "desire", "knowledge", "ability", "reinforcement"],
  description: "ADKAR — Awareness, Desire, Knowledge, Ability, Reinforcement. Change management.",
  cognitiveTools: {
    awareness: ["telescopic", "dependency-cartography"],
    desire: ["nexus", "decision"],
    knowledge: ["knowledge-crystallization", "first-principles"],
    ability: ["controlled", "atomic-completion"],
    reinforcement: ["elevate", "temporal-degradation"],
  },
  agents: {
    awareness: "scout",
    desire: "researcher",
    knowledge: "researcher",
    ability: "builder",
    reinforcement: "reviewer",
  },
};

export const TRANSCENDENT_PLUGIN: LoopPlugin = {
  name: "transcendent",
  phases: [
    "diagnose",
    "first-100x",
    "second-100x",
    "debt-targeting",
    "dissolve",
    "rebuild",
    "closure-gate",
  ],
  description:
    "Transcendent Iteration v3 — Diagnose → 100x → 100x → Debt Targeting → Dissolve → Rebuild → Closure Gate",
  continueOnFailure: false,
  cognitiveTools: {
    diagnose: ["first-principles", "constraint-inventory", "inversion"],
    "first-100x": ["nexus", "simplification", "telescopic"],
    "second-100x": ["audit", "inversion", "telescopic"],
    "debt-targeting": ["audit", "constraint-inventory", "inversion"],
    dissolve: ["first-principles", "scaffold"],
    rebuild: ["first-principles", "scaffold", "recursion-engine"],
    "closure-gate": ["knowledge-crystallization", "audit", "elevate"],
  },
  agents: {
    diagnose: "scout",
    "first-100x": "builder",
    "second-100x": "reviewer",
    "debt-targeting": "reviewer",
    dissolve: "researcher",
    rebuild: "builder",
    "closure-gate": "researcher",
  },
};

export const BUILT_IN_PLUGINS: Record<string, LoopPlugin> = {
  ooda: OODA_PLUGIN,
  strategic: STRATEGIC_PLUGIN,
  kaizen: KAIZEN_PLUGIN,
  adkar: ADKAR_PLUGIN,
  transcendent: TRANSCENDENT_PLUGIN,
};

// ============================================================================
// AGENT-KERNEL CLI WRAPPER
// ============================================================================

export class AgentKernel {
  private akPath: string;
  private societyDb?: string;
  private cwd?: string;

  constructor(
    akPath: string = resolveAkPath({ cwd: process.cwd() }),
    societyDb?: string,
    cwd?: string,
  ) {
    this.akPath = akPath;
    this.societyDb = societyDb;
    this.cwd = cwd;
  }

  async taskReady(
    signal?: AbortSignal,
  ): Promise<Array<{ id: number; title: string; repo: string }>> {
    const output = await this.run(["task", "ready", "--format", "json"], signal);
    try {
      return JSON.parse(output);
    } catch {
      return [];
    }
  }

  async taskClaim(
    taskId: number,
    agent: string,
    lease: number = 3600,
    signal?: AbortSignal,
  ): Promise<boolean> {
    try {
      await this.run(
        ["task", "claim", String(taskId), "--agent", agent, "--lease", String(lease)],
        signal,
      );
      return true;
    } catch {
      return false;
    }
  }

  async taskComplete(
    taskId: number,
    result: Record<string, unknown>,
    signal?: AbortSignal,
  ): Promise<boolean> {
    try {
      await this.run(
        ["task", "complete", String(taskId), "--result", JSON.stringify(result)],
        signal,
      );
      return true;
    } catch {
      return false;
    }
  }

  evidenceRecord(params: EvidenceEntry, signal?: AbortSignal): Promise<EvidenceWriteResult> {
    return recordEvidence(params, signal, {
      akPath: this.akPath,
      societyDb: this.societyDb || process.env.SOCIETY_DB || process.env.AK_DB || "",
      cwd: this.cwd,
    });
  }

  private async run(args: string[], signal?: AbortSignal): Promise<string> {
    const result = await runAkCommandAsync({
      akPath: this.akPath,
      societyDb: this.societyDb || process.env.SOCIETY_DB || process.env.AK_DB || "",
      args,
      cwd: this.cwd,
      signal,
    });

    if (!result.ok) {
      throw new Error(result.stderr || `ak exited with error`);
    }

    return result.stdout;
  }
}

// ============================================================================
// LOOP EXECUTOR
// ============================================================================

export interface LoopEvidenceRecorder {
  evidenceRecord(params: EvidenceEntry, signal?: AbortSignal): Promise<EvidenceWriteResult>;
}

export interface LoopExecutorOptions {
  akPath?: string;
  packageRoot?: string;
  allowUnverifiedKesRoot?: boolean;
  ak?: LoopEvidenceRecorder;
}

export class LoopExecutor {
  private plugin: LoopPlugin;
  private kes: LoopKesWriter;
  private ak: LoopEvidenceRecorder;
  private cwd: string;

  constructor(
    plugin: LoopPlugin,
    cwd: string,
    _vaultDir: string,
    options: LoopExecutorOptions = {},
  ) {
    this.plugin = plugin;
    this.cwd = cwd;
    this.kes = new LoopKesWriter(options.packageRoot, {
      allowUnverifiedPackageRoot: options.allowUnverifiedKesRoot,
    });
    this.ak =
      options.ak ||
      new AgentKernel(
        options.akPath || resolveAkPath({ cwd: process.cwd() }),
        DEFAULT_SOCIETY_DB,
        cwd,
      );
    const sessionsDir = path.join(os.homedir(), ".pi", "agent", "sessions", "loops");
    if (!fs.existsSync(sessionsDir)) {
      fs.mkdirSync(sessionsDir, { recursive: true });
    }
  }

  async execute(
    objective: string,
    dispatchFn: (params: {
      agent: string;
      cognitiveTool: string;
      context: string;
      timeoutSeconds?: number;
      onUpdate?: (update: unknown) => void;
    }) => Promise<{
      output: string;
      exitCode: number;
      elapsed: number;
      aborted?: boolean;
      timedOut?: boolean;
      failureKind?: string;
    }>,
    signal?: AbortSignal,
    options: LoopExecutionOptions = {},
  ): Promise<LoopResult> {
    const startTime = Date.now();
    const sessionId = `${this.plugin.name}-${Date.now()}`;

    if (signal?.aborted) {
      return {
        plugin: this.plugin.name,
        objective,
        phases: [],
        artifacts: [],
        success: false,
        elapsed: 0,
      };
    }

    const context: LoopContext = {
      sessionId,
      pluginName: this.plugin.name,
      objective,
      currentPhase: "",
      history: [],
      artifacts: [],
      cwd: this.cwd,
    };

    context.artifacts.push(
      ...this.kes.writeStart({
        plugin: this.plugin.name,
        sessionId,
        objective,
        phases: this.plugin.phases,
      }),
    );

    let success = true;

    for (let i = 0; i < this.plugin.phases.length; i++) {
      if (signal?.aborted) {
        success = false;
        break;
      }

      const phase = this.plugin.phases[i];
      const previousPhase = context.history.at(-1)?.phase;
      context.currentPhase = phase;

      if (
        previousPhase &&
        this.plugin.validate &&
        !this.plugin.validate(previousPhase, phase, context)
      ) {
        const validationFailure: PhaseResult = {
          phase,
          output: `Transition validation failed: ${previousPhase} -> ${phase}`,
          exitCode: 1,
          status: "error",
          elapsed: 0,
          artifacts: [],
          timestamp: new Date(),
        };
        context.history.push(validationFailure);
        success = false;
        break;
      }

      // Phase enter hook
      if (this.plugin.onEnter) {
        await this.plugin.onEnter(phase, context);
      }

      // Get cognitive tools and agent for this phase
      const tools = this.plugin.cognitiveTools[phase] || [];
      const agent = this.plugin.agents[phase] || "scout";
      const primaryTool = tools[0] || "first-principles";

      // Build context for this phase
      const phaseContext = this.buildPhaseContext(phase, objective, context);

      options.onUpdate?.({
        event: "phase_start",
        plugin: this.plugin.name,
        sessionId,
        phase,
        phaseIndex: i + 1,
        phaseCount: this.plugin.phases.length,
        agent,
        primaryTool,
      });

      // Dispatch agent with cognitive tool
      const _phaseStart = Date.now();
      const result = await dispatchFn({
        agent,
        cognitiveTool: primaryTool,
        context: phaseContext,
        timeoutSeconds: options.phaseTimeoutSeconds,
        onUpdate: (update) =>
          options.onUpdate?.({
            event: "phase_update",
            plugin: this.plugin.name,
            sessionId,
            phase,
            update,
          }),
      });

      const executionOutcome = await finalizeExecutionEffects({
        result,
        signal,
        createEvidenceEntry: ({ status, success }) => ({
          check_type: `loop:${this.plugin.name}:${phase}`,
          result: success ? "pass" : "fail",
          details: {
            sessionId,
            objective: objective.slice(0, 100),
            elapsed: result.elapsed,
            status,
          },
        }),
        recordEvidence: (entry, activeSignal) => this.ak.evidenceRecord(entry, activeSignal),
      });

      const phaseResult: PhaseResult = {
        phase,
        output: result.output,
        exitCode: result.exitCode,
        status: executionOutcome.status,
        failureKind: result.failureKind,
        elapsed: result.elapsed,
        artifacts: [],
        timestamp: new Date(),
      };

      if (!executionOutcome.evidence.ok) {
        success = false;
      }

      // Phase exit hook
      if (executionOutcome.status !== "aborted" && this.plugin.onExit) {
        const artifacts = await this.plugin.onExit(phase, context);
        phaseResult.artifacts = artifacts;
      }

      const kesArtifacts = this.kes.writePhase({
        plugin: this.plugin.name,
        phase,
        sessionId,
        objective,
        agent,
        primaryTool,
        output: result.output,
        status: executionOutcome.status,
        exitCode: result.exitCode,
        elapsed: result.elapsed,
        failureKind: result.failureKind,
        evidence: executionOutcome.evidence,
        hookArtifacts: phaseResult.artifacts,
        timestamp: phaseResult.timestamp,
      });
      phaseResult.artifacts = [...phaseResult.artifacts, ...kesArtifacts];
      context.history.push(phaseResult);
      context.artifacts.push(...phaseResult.artifacts);

      options.onUpdate?.({
        event: "phase_complete",
        plugin: this.plugin.name,
        sessionId,
        phase,
        status: executionOutcome.status,
        elapsed: result.elapsed,
        failureKind: result.failureKind,
      });

      if (executionOutcome.status === "aborted") {
        success = false;
        break;
      }

      if (!executionOutcome.success) {
        success = false;
        const continueAfterFailure =
          options.continueAfterFailure ?? this.plugin.continueOnFailure ?? true;
        if (!continueAfterFailure) {
          break;
        }
        // Continue to next phase when the loop policy explicitly allows resilient execution.
      }
    }

    const elapsed = Date.now() - startTime;
    context.artifacts.push(
      ...this.kes.writeComplete({
        plugin: this.plugin.name,
        sessionId,
        objective,
        success,
        elapsed,
        phases: context.history.map((phase) => ({
          phase: phase.phase,
          status: phase.status,
          elapsed: phase.elapsed,
          failureKind: phase.failureKind,
        })),
        emittedArtifacts: context.artifacts,
      }),
    );

    return {
      plugin: this.plugin.name,
      objective,
      phases: context.history,
      artifacts: context.artifacts,
      success,
      elapsed,
    };
  }

  private buildPhaseContext(phase: string, objective: string, context: LoopContext): string {
    const previousResults = context.history
      .map((h) => `## ${h.phase}\n${h.output.slice(0, 500)}`)
      .join("\n\n");

    return `# Loop: ${this.plugin.name.toUpperCase()}
## Phase: ${phase}
## Session: ${context.sessionId}

## Objective
${objective}

${previousResults ? `## Previous Phases\n${previousResults}` : ""}

## Phase Protocol
${this.buildPhaseProtocol(phase)}

## Your Task
Execute the **${phase}** phase of the ${this.plugin.name.toUpperCase()} loop.
Focus on what this phase requires. Use the cognitive tools available to you.
`;
  }

  private buildPhaseProtocol(phase: string): string {
    if (this.plugin.name !== "transcendent") {
      return "Use the loop's standard phase semantics and produce bounded, evidence-bearing output.";
    }

    const protocols: Record<string, string> = {
      diagnose:
        "Find the current ceiling. Name the limiting assumption, avoided ugliness, 100x precondition, and likely hidden debt.",
      "first-100x":
        "Attack the diagnosed ceiling directly. Prefer deletion over addition and identify the new ceiling revealed by the change.",
      "second-100x":
        "Attack the newly revealed ceiling and run the compound check: did the first 100x make this easier, harder, or unchanged? Surface visible debt.",
      "debt-targeting":
        "Classify remaining debt as blocking, accepted/deferred, or new opportunity. Blocking in-scope debt must become dissolve/rebuild input, not a terminal note.",
      dissolve:
        "Dissolve the assumptions, inherited constraints, scaffolding, or structures causing the targeted blocking debt.",
      rebuild:
        "Rebuild from first principles without reintroducing targeted debt. Show evidence that the targeted debt is gone rather than merely renamed.",
      "closure-gate":
        "Apply the Definition of Done. Close only if no blocking in-scope debt remains; otherwise emit the next-loop ceiling or stop incomplete when continuation is not authorized.",
    };

    return protocols[phase] || "Use the transcendent loop semantics for this phase.";
  }
}

function compactLoopResult(result: LoopResult): CompactLoopResult {
  return {
    plugin: result.plugin,
    objective: result.objective,
    success: result.success,
    elapsed: result.elapsed,
    phases: result.phases.map((phase) => ({
      phase: phase.phase,
      status: phase.status,
      exitCode: phase.exitCode,
      elapsed: phase.elapsed,
      failureKind: phase.failureKind,
      artifactPaths: phase.artifacts.map((artifact) => artifact.content),
    })),
    artifactPaths: result.artifacts.map((artifact) => artifact.content),
  };
}

function createLinkedTimeoutSignal(
  parentSignal: AbortSignal | undefined,
  timeoutMs: number,
): { signal: AbortSignal; cleanup: () => void; timedOut: () => boolean } {
  const controller = new AbortController();
  let loopTimedOut = false;

  const abortFromParent = () => controller.abort(parentSignal?.reason);
  if (parentSignal?.aborted) {
    abortFromParent();
  } else {
    parentSignal?.addEventListener("abort", abortFromParent, { once: true });
  }

  const timer =
    timeoutMs > 0
      ? setTimeout(() => {
          loopTimedOut = true;
          controller.abort(new Error(`loop timed out after ${timeoutMs}ms`));
        }, timeoutMs)
      : undefined;

  return {
    signal: controller.signal,
    cleanup: () => {
      if (timer) clearTimeout(timer);
      parentSignal?.removeEventListener("abort", abortFromParent);
    },
    timedOut: () => loopTimedOut,
  };
}

function parsePositiveMilliseconds(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(value || "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function normalizePositiveSeconds(value: unknown): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) return undefined;
  return value;
}

type LoopToolContext = ExtensionContext & TeamScopedContext;

type LoopToolUpdateCallback = AgentToolUpdateCallback<unknown>;

interface VaultDispatchPostureBinding {
  execution_surface?: string;
  execution_args?: Record<string, unknown>;
}

interface VaultDispatchPostureResult {
  posture: string;
  template_name: string;
  binding?: VaultDispatchPostureBinding | null;
  reason?: string;
}

interface VaultDispatchRuntimeResult {
  ok: boolean;
  status: "ready" | "blocked";
  results?: VaultDispatchPostureResult[];
  missing?: string[];
  current_company?: string;
  current_company_source?: string;
  blocking_reason?: string;
}

interface VaultDispatchRuntimeModule {
  createVaultDispatchRuntime: () => {
    checkTemplates: (
      templateNames: string[],
      ctx?: { cwd?: string; currentCompany?: string },
    ) => Promise<VaultDispatchRuntimeResult>;
  };
}

const WORKFLOW_TEMPLATE_OWNER_ROUTES: Record<
  string,
  { owner: string; tool: string; purpose: string; example: (objective: string) => string }
> = {
  "pi-autoresearch-setup": {
    owner: "packages/pi-autoresearch",
    tool: "autoresearch_runtime_status(action=setup)",
    purpose: "request the governed setup packet through the package-owned decision runner",
    example: (objective) =>
      `autoresearch_runtime_status({ action: "setup", cwd, optimizationObjective: ${JSON.stringify(objective)} })`,
  },
  "pi-autoresearch-next-hypothesis": {
    owner: "packages/pi-autoresearch",
    tool: "autoresearch_runtime_run(..., decisionGoal=...) or autoresearch_runtime_loop(..., decisionGoal=...)",
    purpose:
      "request the governed post-run next-hypothesis decision from a concrete runtime segment",
    example: (objective) =>
      `autoresearch_runtime_run({ cwd, description: "<bounded run>", decisionGoal: ${JSON.stringify(objective)} })`,
  },
  "pi-autoresearch-finalize": {
    owner: "packages/pi-autoresearch",
    tool: "autoresearch_runtime_status(action=finalize) or autoresearch_runtime_finalize",
    purpose: "request the governed finalization packet through the package-owned finalization seam",
    example: () =>
      'autoresearch_runtime_status({ action: "finalize", cwd, keptRuns: ["<kept-run>"], campaignContext: ["<context>"] })',
  },
};

function formatWorkflowGateFailure(templateName: string, objective: string): string {
  const ownerRoute = WORKFLOW_TEMPLATE_OWNER_ROUTES[templateName];
  const lines = [
    `Vault template ${templateName} is workflow-grade but has no executable binding in vault_execute_template. Failing closed.`,
    "",
    "Process invariant:",
    "discovery/design -> architecture/UX/AX -> implement -> execute; if execution binding is missing or fails, loop back to discovery/design instead of manually bypassing the gate -> verify -> commit.",
  ];

  if (ownerRoute) {
    lines.push(
      "",
      "Owner-specific lawful route:",
      `- owner: ${ownerRoute.owner}`,
      `- tool: ${ownerRoute.tool}`,
      `- purpose: ${ownerRoute.purpose}`,
      `- example: ${ownerRoute.example(objective)}`,
      "",
      "Do not continue by interpreting the retrieved template as inert text; use the owner route or design a missing execution binding first.",
    );
  } else {
    lines.push(
      "",
      "No owner-specific route is registered for this workflow template.",
      "Stop and design the execution binding or choose a lawful owner surface before continuing.",
    );
  }

  return lines.join("\n");
}

// ============================================================================
// TOOL REGISTRATION
// ============================================================================

export function registerLoopTools(
  pi: ExtensionAPI,
  plugins: Record<string, LoopPlugin> = BUILT_IN_PLUGINS,
  vaultDir: string = process.env.VAULT_DIR ||
    path.join(os.homedir(), "ai-society", "core", "prompt-vault", "prompt-vault-db"),
  resolveAgent?: (agent: string, ctx: TeamScopedContext & { cwd: string }) => AgentResolution,
): void {
  const subagentExecutor = createOrchestratorSubagentExecutor({
    sessionsDir: path.join(os.homedir(), ".pi", "agent", "sessions", "loops"),
  });

  const executeLoopToolRequest = async (
    params: Record<string, unknown>,
    signal: AbortSignal | undefined,
    onUpdate: LoopToolUpdateCallback | undefined,
    ctx: LoopToolContext,
  ): Promise<AgentToolResult<unknown>> => {
    const { loop, objective, continue_after_failure, loop_timeout_seconds, phase_timeout_seconds } =
      params as {
        loop: string;
        objective: string;
        continue_after_failure?: boolean;
        loop_timeout_seconds?: number;
        phase_timeout_seconds?: number;
      };

    if (loop === "mito") {
      return {
        content: [
          {
            type: "text",
            text: "The `mito` loop name was retired because it collided with Prof. Binner's MITO. Use `strategic` instead.",
          },
        ],
        details: { ok: false, renamed_to: "strategic" },
      };
    }

    const plugin = plugins[loop];
    if (!plugin) {
      return {
        content: [
          {
            type: "text",
            text: `Unknown loop: ${loop}. Available: ${Object.keys(plugins).join(", ")}`,
          },
        ],
        details: { ok: false },
      };
    }

    if (onUpdate) {
      onUpdate({
        content: [{ type: "text", text: `Starting ${loop.toUpperCase()} loop...` }],
        details: { loop, objective, status: "starting" },
      });
    }

    const resolvedAgents = new Map<string, string>();
    if (resolveAgent) {
      const incompatiblePhases = plugin.phases.flatMap((phase) => {
        const requestedAgent = plugin.agents[phase] || "scout";
        const resolution = resolveAgent(requestedAgent, ctx);
        if (!resolution.ok) {
          return [
            {
              phase,
              agent: requestedAgent,
              error: resolution.error,
            },
          ];
        }

        resolvedAgents.set(requestedAgent, resolution.agent);
        return [];
      });

      if (incompatiblePhases.length > 0) {
        const mismatchReport = incompatiblePhases
          .map((entry) => `- ${entry.phase}: ${entry.agent} — ${entry.error}`)
          .join("\n");
        return {
          content: [
            {
              type: "text",
              text: `Loop '${loop}' is incompatible with the active team:\n${mismatchReport}`,
            },
          ],
          details: { ok: false, error: "loop-agent-team-mismatch", incompatiblePhases },
        };
      }
    }

    const executor = new LoopExecutor(plugin, ctx.cwd, vaultDir);
    const loopTimeoutMs =
      (normalizePositiveSeconds(loop_timeout_seconds) ?? DEFAULT_LOOP_TIMEOUT_MS / 1000) * 1000;
    const effectiveSignal = createLinkedTimeoutSignal(signal, loopTimeoutMs);

    // Create dispatch function using shared agent profiles + vault-loaded cognitive tools.
    const dispatch = async (p: {
      agent: string;
      cognitiveTool: string;
      context: string;
      timeoutSeconds?: number;
      onUpdate?: (update: unknown) => void;
    }) => {
      let effectiveAgent = resolvedAgents.get(p.agent) || p.agent;
      if (resolveAgent && !resolvedAgents.has(p.agent)) {
        const resolution = resolveAgent(p.agent, ctx);
        if (!resolution.ok) {
          return {
            output: `Agent/team resolution failed for '${p.agent}': ${resolution.error}`,
            exitCode: 1,
            elapsed: 0,
          };
        }
        effectiveAgent = resolution.agent;
        resolvedAgents.set(p.agent, effectiveAgent);
      }

      const agentProfile = AGENT_PROFILES[effectiveAgent] || AGENT_PROFILES.scout;
      const toolResult = await getCognitiveToolByName(
        p.cognitiveTool,
        {
          cwd: ctx.cwd,
        },
        effectiveSignal.signal,
      );
      if (isBoundaryFailure(toolResult)) {
        return {
          output: `Failed to load cognitive tool '${p.cognitiveTool}': ${toolResult.error}`,
          exitCode: 1,
          elapsed: 0,
        };
      }

      if (!toolResult.value) {
        return {
          output: `Cognitive tool not found: ${p.cognitiveTool}`,
          exitCode: 1,
          elapsed: 0,
        };
      }

      const model = ctx.model
        ? `${ctx.model.provider}/${ctx.model.id}`
        : "openrouter/google/gemini-2.5-flash-preview";
      const runtimeResult = await subagentExecutor.execute({
        agentProfile,
        cognitiveToolName: toolResult.value.name,
        cognitiveToolContent: toolResult.value.content,
        objective: p.context,
        model,
        cwd: ctx.cwd,
        extraSections: [
          `## LOOP EXECUTION CONTEXT\n- Agent profile: ${agentProfile.name}\n- Cognitive tool: ${toolResult.value.name}`,
        ],
        sessionName: `${agentProfile.name}-${toolResult.value.name}`,
        timeoutSeconds: p.timeoutSeconds,
        onUpdate: p.onUpdate as Parameters<typeof subagentExecutor.execute>[0]["onUpdate"],
        signal: effectiveSignal.signal,
      });

      return toExecutionLike(runtimeResult);
    };

    try {
      const result = await executor.execute(objective, dispatch, effectiveSignal.signal, {
        continueAfterFailure: continue_after_failure,
        phaseTimeoutSeconds: normalizePositiveSeconds(phase_timeout_seconds),
        onUpdate: (update) =>
          onUpdate?.({
            content: [
              {
                type: "text",
                text:
                  update.event === "phase_start"
                    ? `Starting ${loop}.${update.phase} (${update.phaseIndex}/${update.phaseCount}) with ${update.agent}/${update.primaryTool}`
                    : update.event === "phase_complete"
                      ? `Finished ${loop}.${update.phase}: ${update.status}`
                      : `Progress ${loop}.${update.phase}`,
              },
            ],
            details: { loop, objective, status: update.event, update },
          }),
      });
      const compactResult = compactLoopResult(result);
      const loopTimedOut = effectiveSignal.timedOut();

      const summary = `# ${loop.toUpperCase()} Loop Complete

**Objective:** ${objective}
**Status:** ${result.success ? "✓ Success" : "✗ Completed with failures"}
**Elapsed:** ${Math.round(result.elapsed / 1000)}s
${loopTimedOut ? "**Loop timeout:** yes\n" : ""}
## Phases
${compactResult.phases.map((p) => `- ${p.phase}: ${p.status === "done" ? "✓" : "✗"} ${p.status}${p.failureKind ? ` (${p.failureKind})` : ""} (${Math.round(p.elapsed / 1000)}s)`).join("\n")}

## Artifacts
${compactResult.artifactPaths.map((artifactPath) => `- ${artifactPath}`).join("\n") || "None"}

## Package-owned KES roots
- Raw capture: \`diary/\`
- Candidate-only learning staging: \`docs/learnings/\` (when emitted)
`;

      return {
        content: [{ type: "text", text: summary }],
        details: { ok: result.success, result: compactResult, loopTimedOut },
      };
    } catch (err) {
      if (isKesMaterializationError(err)) {
        return {
          content: [
            {
              type: "text",
              text: "Loop execution failed before package-owned KES artifacts could be materialized because the configured KES root is invalid or not writable. Check PI_ORCH_KES_ROOT or package write permissions.",
            },
          ],
          details: {
            ok: false,
            error: "loop-kes-root-invalid",
            failureKind: KES_MATERIALIZATION_FAILURE_KIND,
            operation: err.operation,
            kesRootSource: process.env.PI_ORCH_KES_ROOT ? "env" : "package-default",
          },
        };
      }

      return {
        content: [{ type: "text", text: `Loop execution failed: ${err}` }],
        details: { ok: false, loopTimedOut: effectiveSignal.timedOut() },
      };
    } finally {
      effectiveSignal.cleanup();
    }
  };

  registerCompatTool(pi, {
    name: "loop_execute",
    label: "Execute Loop",
    description: `Execute a structured iteration loop with cognitive tools.

Available loops:
- ooda: Observe → Orient → Decide → Act (military-grade decision cycle)
- strategic: Mission → Intelligence → Tooling → Operations (strategic execution; renamed from the old 'mito' label to avoid collision with Prof. Binner's MITO)
- kaizen: Plan → Do → Check → Act (continuous improvement)
- adkar: Awareness → Desire → Knowledge → Ability → Reinforcement (change management)
- transcendent: Diagnose → 100x → 100x → Debt Targeting → Dissolve → Rebuild → Closure Gate (debt-resolving 100x improvement)

Each phase injects the appropriate cognitive tool and dispatches an agent.
Results are recorded to package-owned KES roots (\`diary/\` and candidate-only \`docs/learnings/\` when applicable) plus the evidence ledger.`,
    promptSnippet:
      "Run a structured cognitive loop such as ooda, strategic, kaizen, adkar, or transcendent.",
    promptGuidelines: [
      "Use loop_execute when the user needs a multi-phase reasoning and execution pattern rather than a single step.",
      "Choose the loop that matches the decision structure instead of inventing an ad-hoc sequence.",
    ],
    parameters: Type.Object({
      loop: Type.Union(
        [
          Type.Literal("ooda"),
          Type.Literal("strategic"),
          Type.Literal("kaizen"),
          Type.Literal("adkar"),
          Type.Literal("transcendent"),
        ],
        { description: "Loop type to execute" },
      ),
      objective: Type.String({ description: "The objective to accomplish through the loop" }),
      continue_after_failure: Type.Optional(
        Type.Boolean({
          description:
            "Explicitly continue after a failed phase. Transcendent defaults to fail-fast unless this is true.",
        }),
      ),
      loop_timeout_seconds: Type.Optional(
        Type.Number({ description: "Optional positive loop-level timeout in seconds." }),
      ),
      phase_timeout_seconds: Type.Optional(
        Type.Number({
          description: "Optional positive timeout in seconds for each dispatched phase.",
        }),
      ),
    }),
    async execute(_toolCallId, params, signal, onUpdate, ctx) {
      return executeLoopToolRequest(params as Record<string, unknown>, signal, onUpdate, ctx);
    },
    renderCall(args, theme) {
      const a = args as { loop?: string; objective?: string };
      return new Text(
        theme.fg("toolTitle", theme.bold("loop_execute ")) +
          theme.fg("accent", a.loop || "?") +
          theme.fg("dim", " — ") +
          theme.fg("muted", (a.objective || "").slice(0, 40)),
        0,
        0,
      );
    },
    renderResult(result, _options, theme) {
      const details = result.details as { ok?: boolean; result?: CompactLoopResult } | undefined;
      if (!details?.result) {
        const text = result.content[0];
        return new Text(text?.type === "text" ? text.text : "", 0, 0);
      }
      const icon = details.ok ? "✓" : "✗";
      const color = details.ok ? "success" : "error";
      return new Text(
        theme.fg(color, `${icon} ${details.result.plugin}`) +
          theme.fg("dim", ` ${Math.round(details.result.elapsed / 1000)}s`),
        0,
        0,
      );
    },
  });

  registerCompatTool(pi, {
    name: "vault_execute_template",
    label: "Execute Vault Template",
    description: `Execute a Prompt Vault template through the orchestrator dispatch gate.

This bridge uses pi-vault-client dispatch posture metadata and refuses to treat loop/workflow templates as inert text.
Known loop bindings execute through loop_execute semantics:
- transcendent-iteration -> loop_execute({ loop: "transcendent", objective })
- ooda -> loop_execute({ loop: "ooda", objective })

Unknown loop templates and workflow-grade templates without an execution binding fail closed with an explicit reason.`,
    promptSnippet: "Execute a Prompt Vault template through its required orchestrator binding.",
    promptGuidelines: [
      "Use vault_execute_template when the operator asks to run/apply/execute a Prompt Vault template by name.",
      "Do not use raw vault_retrieve content as execution when this tool reports an orchestrator gate.",
      "If a workflow-grade template has no bridge binding, stop and use the owning package surface or design the missing binding before continuing.",
    ],
    parameters: Type.Object({
      template_name: Type.String({ description: "Exact Prompt Vault template name to execute" }),
      objective: Type.String({
        description: "Objective to pass to the orchestrator execution binding",
      }),
      continue_after_failure: Type.Optional(
        Type.Boolean({
          description:
            "Explicitly continue after a failed phase. Transcendent defaults to fail-fast unless this is true.",
        }),
      ),
      loop_timeout_seconds: Type.Optional(
        Type.Number({ description: "Optional positive loop-level timeout in seconds." }),
      ),
      phase_timeout_seconds: Type.Optional(
        Type.Number({
          description: "Optional positive timeout in seconds for each dispatched phase.",
        }),
      ),
    }),
    async execute(_toolCallId, params, signal, onUpdate, ctx) {
      const templateName = String((params as Record<string, unknown>).template_name || "").trim();
      const objective = String((params as Record<string, unknown>).objective || "").trim();
      if (!templateName || !objective) {
        return {
          content: [{ type: "text", text: "template_name and objective are required." }],
          details: { ok: false, error: "missing-required-params" },
        };
      }

      let dispatchModule: VaultDispatchRuntimeModule;
      try {
        dispatchModule = (await import(
          "pi-vault-client/dispatch-runtime"
        )) as VaultDispatchRuntimeModule;
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: `Vault dispatch runtime is unavailable: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
          details: { ok: false, error: "vault-dispatch-runtime-unavailable" },
        };
      }

      const dispatchRuntime = dispatchModule.createVaultDispatchRuntime();
      const dispatchCheck = await dispatchRuntime.checkTemplates([templateName], { cwd: ctx.cwd });
      if (!dispatchCheck.ok || dispatchCheck.status !== "ready") {
        return {
          content: [
            {
              type: "text",
              text: `Vault dispatch check failed for ${templateName}: ${dispatchCheck.blocking_reason || "unknown error"}`,
            },
          ],
          details: { ok: false, error: "vault-dispatch-check-failed", dispatchCheck },
        };
      }

      if (dispatchCheck.missing?.includes(templateName) || !dispatchCheck.results?.length) {
        return {
          content: [
            {
              type: "text",
              text: `No active visible Prompt Vault template found: ${templateName}`,
            },
          ],
          details: { ok: false, error: "template-not-found", dispatchCheck },
        };
      }

      const posture = dispatchCheck.results[0];
      if (
        posture.posture === "orchestrator_loop_required" &&
        posture.binding?.execution_surface === "loop_execute"
      ) {
        const loop = posture.binding.execution_args?.loop;
        if (typeof loop !== "string" || !loop.trim()) {
          return {
            content: [
              {
                type: "text",
                text: `Vault template ${templateName} requires loop_execute but its binding lacks a string loop argument.`,
              },
            ],
            details: { ok: false, error: "invalid-loop-binding", dispatchCheck },
          };
        }

        return executeLoopToolRequest(
          {
            loop,
            objective,
            continue_after_failure: (params as Record<string, unknown>).continue_after_failure,
            loop_timeout_seconds: (params as Record<string, unknown>).loop_timeout_seconds,
            phase_timeout_seconds: (params as Record<string, unknown>).phase_timeout_seconds,
          },
          signal,
          onUpdate,
          ctx,
        );
      }

      return {
        content: [
          {
            type: "text",
            text:
              posture.posture === "missing_execution_binding_fail_closed"
                ? `Vault template ${templateName} has control_mode=loop but no execution binding. Failing closed.`
                : posture.posture === "orchestrator_workflow_gate_required"
                  ? formatWorkflowGateFailure(templateName, objective)
                  : `Vault template ${templateName} does not require an orchestrator execution binding. Use retrieval/preparation surfaces instead of vault_execute_template.`,
          },
        ],
        details: {
          ok: false,
          error: "vault-template-not-executable-through-bridge",
          dispatchCheck,
        },
      };
    },
    renderCall(args, theme) {
      const a = args as { template_name?: string; objective?: string };
      return new Text(
        theme.fg("toolTitle", theme.bold("vault_execute_template ")) +
          theme.fg("accent", a.template_name || "?") +
          theme.fg("dim", " — ") +
          theme.fg("muted", (a.objective || "").slice(0, 40)),
        0,
        0,
      );
    },
    renderResult(result) {
      const details = result.details as { ok?: boolean; error?: string } | undefined;
      return new Text(details?.ok ? "executed" : details?.error || "blocked", 0, 0);
    },
  });
}

export function buildLoopExecuteInvocation(loop: string, objective: string): string {
  return `loop_execute({ loop: ${JSON.stringify(loop)}, objective: ${JSON.stringify(objective)} })`;
}

// ============================================================================
// COMMAND REGISTRATION
// ============================================================================

export function registerLoopCommands(
  pi: ExtensionAPI,
  plugins: Record<string, LoopPlugin> = BUILT_IN_PLUGINS,
): void {
  pi.registerCommand("loop", {
    description: "Execute a loop: /loop <type> <objective>",
    handler: async (args, ctx) => {
      if (!ctx.hasUI) return;

      const parts = (args || "").trim().split(/\s+/);
      if (parts.length < 2) {
        ctx.ui.notify(
          `Usage: /loop <type> <objective>\n\nAvailable: ${Object.keys(plugins).join(", ")}`,
          "warning",
        );
        return;
      }

      const loopType = parts[0];
      const objective = parts.slice(1).join(" ");

      if (loopType === "mito") {
        ctx.ui.notify(
          "The `mito` loop name was retired because it collided with Prof. Binner's MITO. Use `strategic` instead.",
          "error",
        );
        ctx.ui.setEditorText(buildLoopExecuteInvocation("strategic", objective));
        return;
      }

      const plugin = plugins[loopType];
      if (!plugin) {
        ctx.ui.notify(
          `Unknown loop: ${loopType}. Available: ${Object.keys(plugins).join(", ")}`,
          "error",
        );
        return;
      }

      ctx.ui.notify(`Starting ${loopType.toUpperCase()} loop...`, "info");
      // The actual execution happens via the loop_execute tool
      ctx.ui.setEditorText(buildLoopExecuteInvocation(loopType, objective));
    },
  });

  pi.registerCommand("loops", {
    description: "List available loop types",
    handler: async (_args, ctx) => {
      if (!ctx.hasUI) return;

      const list = Object.entries(plugins)
        .map(
          ([name, plugin]) =>
            `## ${name}\n${plugin.description}\nPhases: ${plugin.phases.join(" → ")}`,
        )
        .join("\n\n");

      await ctx.ui.editor("Available Loops", list);
    },
  });
}
