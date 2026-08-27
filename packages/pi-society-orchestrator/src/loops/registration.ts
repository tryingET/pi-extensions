// ---
// summary: "Registers loop execution and governed Prompt Vault workflow tools."
// read_when:
//   - "Changing loop or Vault tool schemas, dispatch gates, execution messages, or rendering."
// ---

import { createHash } from "node:crypto";
import * as os from "node:os";
import * as path from "node:path";
import type {
  AgentToolResult,
  AgentToolUpdateCallback,
  ExtensionAPI,
  ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import { Text } from "@earendil-works/pi-tui";
import { Type } from "typebox";
import {
  ensureKesRoots,
  isKesMaterializationError,
  KES_MATERIALIZATION_FAILURE_KIND,
} from "../kes/index.ts";
import { AGENT_PROFILES } from "../runtime/agent-profiles.ts";
import type { AgentResolution } from "../runtime/agent-routing.ts";
import { isBoundaryFailure } from "../runtime/boundaries.ts";
import { getCognitiveToolByName, probeCognitiveToolSeam } from "../runtime/cognitive-tools.ts";
import {
  consumeD2EExecutionMemory,
  D2E_EXECUTION_MEMORY_OWNER,
  D2E_EXECUTION_MEMORY_TEMPLATE,
  D2EExecutionMemoryConsumerError,
} from "../runtime/d2e-execution-memory.ts";
import { inspectD2ERepository } from "../runtime/d2e-transfer-effects.ts";
import {
  D2E_WORKFLOW_TEMPLATE_OWNERS,
  D2ETransferError,
  executeD2ETransferWorkflow,
} from "../runtime/d2e-transfer-workflow.ts";
import type { GovernedDeepReviewPreflightRuntime } from "../runtime/governed-deep-review-preflight.ts";
import {
  ASC_EXECUTION_OBSERVATION_EVENT,
  type AscExecutionObservation,
  type AscExecutionObservationContext,
  createOrchestratorSubagentExecutor,
  projectAscExecutionGroupTerminal,
  toExecutionLike,
} from "../runtime/subagent.ts";
import { resolveSessionIdentity, type TeamScopedContext } from "../runtime/team-state.ts";
import { createWorkflowExecutor } from "../runtime/workflow-execution.ts";
import type { CompactLoopResult, LoopPlugin } from "./contracts.ts";
import {
  compactLoopResult,
  formatCompactPhaseResult,
  LoopExecutor,
  projectLoopGroupTerminalObservation,
} from "./engine.ts";
import { resolveLoopKesPackageRoot } from "./kes.ts";
import { BUILT_IN_PLUGINS } from "./plugins.ts";
import { LoopResumeError } from "./run-checkpoint.ts";

type CompatToolDefinition = Omit<Parameters<ExtensionAPI["registerTool"]>[0], "parameters"> & {
  parameters?: unknown;
};

function registerCompatTool(pi: ExtensionAPI, tool: CompatToolDefinition): void {
  pi.registerTool(tool as Parameters<ExtensionAPI["registerTool"]>[0]);
}

function emitExecutionObservation(
  pi: ExtensionAPI,
  observation: AscExecutionObservation | undefined,
): void {
  if (!observation) return;
  try {
    pi.events.emit(ASC_EXECUTION_OBSERVATION_EVENT, observation);
  } catch {
    // A visibility listener is best-effort and must never perturb loop execution.
  }
}

function parsePositiveMilliseconds(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(value || "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

// Whole-loop emergency deadman. Per-phase activity is visible and classified separately.
const DEFAULT_LOOP_TIMEOUT_MS = parsePositiveMilliseconds(
  process.env.PI_ORCH_LOOP_TIMEOUT_MS,
  24 * 60 * 60 * 1000,
);

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
interface VaultDispatchTemplate {
  id?: number;
  name: string;
  content: string;
  artifact_kind?: string;
  owner_company?: string;
  version?: number;
  control_mode: string;
  formalization_level: string;
  visibility_companies?: string[];
  controlled_vocabulary?: unknown;
  status?: string;
  export_to_pi?: boolean;
}
interface VaultClaimedExecution {
  authorizationId: string;
  disposition: string;
  sealedText: string;
  binding: VaultDispatchPostureBinding | null;
  aggregate: {
    primary: {
      templateId: number;
      templateName: string;
      templateVersion: number;
      contentSha256: string;
      governedMetadataSha256: string;
    };
  };
}
interface VaultDispatchRuntimeResult {
  ok: boolean;
  status: "ready" | "blocked";
  results?: VaultDispatchPostureResult[];
  templates?: VaultDispatchTemplate[];
  missing?: string[];
  current_company?: string;
  current_company_source?: string;
  blocking_reason?: string;
}
interface VaultDispatchRuntimeLike {
  checkTemplates: (
    templateNames: string[],
    ctx?: { cwd?: string; currentCompany?: string },
  ) => Promise<VaultDispatchRuntimeResult>;
}

interface VaultDispatchRuntime extends VaultDispatchRuntimeLike {
  checkTemplates(
    templateNames: string[],
    ctx?: { cwd?: string; currentCompany?: string },
  ): Promise<VaultDispatchRuntimeResult>;
  authorizePreparedExecution(request: {
    templates: VaultDispatchTemplate[];
    primaryTemplateName: string;
    finalPreparedText: string;
    compositionKind: "single";
    surface: "orchestrator_adapter";
    currentCompany: string;
    renderer: string;
    rendererVersion: string;
    wrapper: string;
    context: string;
    args: string[];
  }):
    | { disposition: "blocked"; reason: string; safeMessage: string }
    | {
        disposition: "dispatch_required" | "text_ready";
        authorizationId: string;
        binding?: VaultDispatchPostureBinding;
      };
  claimPreparedExecution(
    authorizationId: string,
  ): { ok: true; value: VaultClaimedExecution } | { ok: false; reason: string; error: string };
  settlePreparedExecution(authorizationId: string, outcome: "handed_off" | "failed"): boolean;
}
interface VaultDispatchRuntimeModule {
  createVaultDispatchRuntime: () => VaultDispatchRuntime;
}

interface VaultPromptPlaneRuntimeModule {
  createVaultPromptPlaneRuntime: (options: { dispatchRuntime: VaultDispatchRuntimeLike }) => {
    prepareSelectionV2: (
      request: { query: string; context: string },
      ctx?: { cwd?: string },
    ) => Promise<{
      ok: boolean;
      status: "text_ready" | "dispatch_required" | "ambiguous" | "blocked";
      blocking_reason?: string;
      authorization?: { authorizationId?: string; disposition?: string };
    }>;
  };
}

interface VaultDispatchGuardModule {
  createDispatchActivationPolicy: (enabled: boolean) => unknown;
  createDispatchHandoffStore: (options?: { filePath?: string }) => unknown;
  dispatchAuthorizedExecution: (options: {
    runtime: VaultDispatchRuntimeLike;
    authorizationId: string;
    intendedExecutor: "workflow_execute";
    activation: unknown;
    receiptStore: unknown;
    execute: (input: {
      handoffId: string;
      authorizationId: string;
      sealedText: string;
      binding: Readonly<{
        execution_surface: string;
        execution_args: Record<string, unknown>;
      }>;
    }) => Promise<VaultWorkflowExecutorResult>;
  }) => Promise<
    | { ok: true; handoffId: string; result: VaultWorkflowExecutorResult }
    | { ok: false; error: string; handoffId?: string }
  >;
}

export interface VaultWorkflowExecutorResult {
  accepted: boolean;
  handoffId: string;
  runId?: string;
  status?: string;
  output?: string;
  details?: Record<string, unknown>;
}

export interface VaultWorkflowExecutionRequest {
  templateName: string;
  objective: string;
  cwd: string;
  sealedText: string;
  handoffId: string;
  authorizationId: string;
  executionArgs: Readonly<Record<string, unknown>>;
  signal?: AbortSignal;
  ctx: LoopToolContext;
}

export interface RegisterLoopToolsOptions {
  executeVaultWorkflow?: (
    request: VaultWorkflowExecutionRequest,
  ) => Promise<VaultWorkflowExecutorResult>;
  gatedDispatchEnabled?: boolean;
  dispatchReceiptPath?: string;
  governedDeepReviewPreflight?: GovernedDeepReviewPreflightRuntime;
}

const WORKFLOW_TEMPLATE_OWNER_ROUTES: Record<
  string,
  { owner: string; tool: string; purpose: string; example: (objective: string) => string }
> = {
  "layer12-040-direction-to-execution-ak-native": {
    owner: "Agent Kernel direction-controller through Pi readback",
    tool: "vault_execute_template(transfer_mode=proposal|applied)",
    purpose:
      "read back an exact AK packet/task/decision authorization lineage before any applied workflow handoff",
    example: (objective) =>
      `vault_execute_template({ template_name: "layer12-040-direction-to-execution-ak-native", objective: ${JSON.stringify(objective)}, transfer_mode: "proposal", repo: cwd, packet_key: "<packet-key>", task_id: 1, decision_id: 1, actor: "<current-task-claimant>" })`,
  },
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
  options: RegisterLoopToolsOptions = {},
): void {
  const subagentExecutor = createOrchestratorSubagentExecutor({
    sessionsDir: path.join(os.homedir(), ".pi", "agent", "sessions", "loops"),
    onObservation: (observation) => emitExecutionObservation(pi, observation),
  });
  const gatedDispatchEnabled =
    options.gatedDispatchEnabled ?? process.env.PI_VAULT_GATED_DISPATCH !== "0";

  const executeLoopToolRequest = async (
    params: Record<string, unknown>,
    signal: AbortSignal | undefined,
    onUpdate: LoopToolUpdateCallback | undefined,
    ctx: LoopToolContext,
  ): Promise<AgentToolResult<unknown>> => {
    const {
      loop,
      objective,
      continue_after_failure,
      loop_timeout_seconds,
      phase_timeout_seconds,
      resume_run_id,
      expected_failed_phase,
      recovery_mode,
    } = params as {
      loop: string;
      objective: string;
      continue_after_failure?: boolean;
      loop_timeout_seconds?: number;
      phase_timeout_seconds?: number;
      resume_run_id?: string;
      expected_failed_phase?: string;
      recovery_mode?: "validate_then_retry";
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

    // Validate the KES root before anything effectful can happen: an invalid
    // PI_ORCH_KES_ROOT must surface as loop-kes-root-invalid here, not be
    // discovered later as a mid-run failure (or masked as a retryable
    // cognitive-tool failure when the broken root is what breaks the vault
    // seam). ensureKesRoots only creates/validates directories; it emits no
    // loop effects and is safe before the pre-dispatch boundary.
    try {
      ensureKesRoots(resolveLoopKesPackageRoot());
    } catch (err) {
      if (isKesMaterializationError(err)) {
        return {
          content: [
            {
              type: "text",
              text: "Loop execution failed before dispatch because the configured KES root is invalid or not writable. Check PI_ORCH_KES_ROOT or package write permissions.",
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
      throw err;
    }

    // Fail fast when the cognitive-tool seam is currently unresolvable (for
    // example a concurrent install rebuilding a linked neighbor's compiled
    // runtime). Refusing here keeps the loop undispatched — retryable without
    // any effect question — instead of letting the first phase discover the
    // breakage mid-dispatch.
    const seamProbe = await probeCognitiveToolSeam();
    if (isBoundaryFailure(seamProbe)) {
      const message = `Loop ${loop} refused to start: the cognitive-tool seam is currently unavailable (${seamProbe.error}). Retry once installs settle.`;
      onUpdate?.({
        content: [{ type: "text", text: message }],
        details: { loop, objective, status: "pre_dispatch_seam_unavailable" },
      });
      return {
        content: [
          {
            type: "text",
            text: `${message}\nNo phase was dispatched and no effects were attempted; this is safely retryable.`,
          },
        ],
        details: { loop, objective, status: "pre_dispatch_seam_unavailable", retryable: true },
      };
    }

    const executor = new LoopExecutor(plugin, ctx.cwd, vaultDir);
    const loopTimeoutMs =
      (normalizePositiveSeconds(loop_timeout_seconds) ?? DEFAULT_LOOP_TIMEOUT_MS / 1000) * 1000;
    const effectiveSignal = createLinkedTimeoutSignal(signal, loopTimeoutMs);
    let activeObservationContext: AscExecutionObservationContext | undefined;

    // Create dispatch function using shared agent profiles + vault-loaded cognitive tools.
    const dispatch = async (p: {
      agent: string;
      cognitiveTool: string;
      context: string;
      effectCorrelationId: string;
      observation: AscExecutionObservationContext;
      timeoutSeconds?: number;
      onUpdate?: (update: unknown) => void;
    }) => {
      activeObservationContext = p.observation;
      let effectiveAgent = resolvedAgents.get(p.agent) || p.agent;
      if (resolveAgent && !resolvedAgents.has(p.agent)) {
        const resolution = resolveAgent(p.agent, ctx);
        if (!resolution.ok) {
          return {
            output: `Agent/team resolution failed for '${p.agent}': ${resolution.error}`,
            exitCode: 1,
            elapsed: 0,
            failureKind: "agent_resolution_failed",
            preDispatchNoEffects: {
              failureKind: "agent_resolution_failed",
              reason: `Agent/team resolution failed before any child launch: ${resolution.error}`,
            },
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
          failureKind: "cognitive_tool_load_failed",
          preDispatchNoEffects: {
            failureKind: "cognitive_tool_load_failed",
            reason: `Cognitive tool load failed before any child launch: ${toolResult.error}`,
          },
        };
      }

      if (!toolResult.value) {
        return {
          output: `Cognitive tool not found: ${p.cognitiveTool}`,
          exitCode: 1,
          elapsed: 0,
          failureKind: "cognitive_tool_not_found",
          preDispatchNoEffects: {
            failureKind: "cognitive_tool_not_found",
            reason: `Cognitive tool '${p.cognitiveTool}' is not visible; no child was launched.`,
          },
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
        effectCorrelationId: p.effectCorrelationId,
        observation: p.observation,
        cwd: ctx.cwd,
        extraSections: [
          `## LOOP EXECUTION CONTEXT\n- Agent profile: ${agentProfile.name}\n- Cognitive tool: ${toolResult.value.name}`,
        ],
        sessionName: `${agentProfile.name}-${toolResult.value.name}`,
        timeoutSeconds: p.timeoutSeconds,
        onUpdate: p.onUpdate as Parameters<typeof subagentExecutor.execute>[0]["onUpdate"],
        signal: effectiveSignal.signal,
      });

      return toExecutionLike(runtimeResult, subagentExecutor.state.sessionsDir);
    };

    const loopStartedAt = Date.now();

    try {
      const result = await executor.execute(objective, dispatch, effectiveSignal.signal, {
        continueAfterFailure: continue_after_failure,
        phaseTimeoutSeconds: normalizePositiveSeconds(phase_timeout_seconds),
        resumeRunId: resume_run_id,
        expectedFailedPhase: expected_failed_phase,
        recoveryMode: recovery_mode,
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
      emitExecutionObservation(
        pi,
        projectLoopGroupTerminalObservation(result, ctx.cwd, loop, loopTimedOut),
      );

      const summary = `# ${loop.toUpperCase()} Loop ${result.retryable ? "Paused" : "Complete"}

**Run:** ${result.sessionId}${result.resumed ? ` (resumed at ${result.resumedPhase})` : ""}
**Objective:** ${objective}
**Status:** ${result.success ? "✓ Success" : result.retryable ? "↻ Retryable after confirmed no effects" : "✗ Completed with failures"}
**Elapsed:** ${Math.round(result.elapsed / 1000)}s
${loopTimedOut ? "**Loop timeout:** yes\n" : ""}
## Phases
${compactResult.phases.map(formatCompactPhaseResult).join("\n")}

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
      if (activeObservationContext) {
        emitExecutionObservation(
          pi,
          projectAscExecutionGroupTerminal(
            { ...activeObservationContext, phase: undefined },
            {
              ok: false,
              status: effectiveSignal.timedOut() ? "timed_out" : "error",
              failureKind: effectiveSignal.timedOut()
                ? "loop_deadman_timeout"
                : "loop_execution_error",
              elapsedMs: Date.now() - loopStartedAt,
            },
          ),
        );
      }
      if (err instanceof LoopResumeError) {
        return {
          content: [{ type: "text", text: `Loop resume failed closed: ${err.message}` }],
          details: {
            ok: false,
            error: "loop-resume-failed",
            failureKind: err.failureKind,
            resumeRunId: resume_run_id,
            expectedFailedPhase: expected_failed_phase,
          },
        };
      }
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
- transcendent: Diagnose → 100x → 100x → Debt Targeting → Dissolve → Rebuild → Alien Pass → Closure Gate (debt-resolving 100x improvement)

Checkpointed runs can continue under the same run lineage by supplying resume_run_id, expected_failed_phase, and recovery_mode=validate_then_retry. The runtime derives the lawful continuation phase and fails closed on objective, repository, phase-graph, state, or artifact drift. A dispatched attempt that failed, timed out, aborted, or crashed remains effect-indeterminate and cannot be retried mechanically.

Each phase injects the appropriate cognitive tool and dispatches an agent. In an interactive Ghostty session with pi-little-helpers loaded, all phases share one automatic read-only progress observer tab; ASC remains execution/effect truth and closing the observer does not cancel work. Quiet/stall visibility is separate from the long emergency deadman.
Results are recorded to package-owned KES roots (\`diary/\` and candidate-only \`docs/learnings/\` when applicable) plus the evidence ledger.`,
    promptSnippet:
      "Run a structured cognitive loop such as ooda, strategic, kaizen, adkar, or transcendent.",
    promptGuidelines: [
      "Use loop_execute when the user needs a multi-phase reasoning and execution pattern rather than a single step.",
      "Choose the loop that matches the decision structure instead of inventing an ad-hoc sequence.",
      "Do not set routine 5–10 minute wall-clock cutoffs for healthy modern-agent work; omit timeout overrides unless the operator requested an explicit shorter deadman.",
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
        Type.Number({
          description:
            "Optional absolute whole-loop deadman override in seconds (default: 86400 / 24 hours). Omit for ordinary supervised work.",
        }),
      ),
      phase_timeout_seconds: Type.Optional(
        Type.Number({
          description:
            "Optional absolute per-phase deadman override in seconds (default: 14400 / 4 hours). Omit for ordinary supervised work; observer quiet/stall state does not auto-cancel.",
        }),
      ),
      resume_run_id: Type.Optional(
        Type.String({ description: "Exact owned checkpointed loop run id to continue." }),
      ),
      expected_failed_phase: Type.Optional(
        Type.String({
          description:
            "Caller assertion for the lawful continuation phase; the runtime derives and verifies it.",
        }),
      ),
      recovery_mode: Type.Optional(
        Type.Literal("validate_then_retry", {
          description:
            "Validate checkpoint lineage, current state, artifacts, and effect disposition before continuation.",
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
Known loop bindings execute through loop_execute semantics. The two legacy D2E transfer templates retain the D2E_TRANSFER_COMPLETE_V1 gate. The execution-memory template uses the separate default-disabled, proposal-only D2E_EXECUTION_MEMORY_V1 consumer.

Unknown templates and workflow-grade templates without an execution binding fail closed with an explicit reason.`,
    promptSnippet: "Execute a Prompt Vault template through its required orchestrator binding.",
    promptGuidelines: [
      "Use vault_execute_template when the operator asks to run/apply/execute a Prompt Vault template by name.",
      "Do not use raw vault_retrieve content as execution when this tool reports an orchestrator gate.",
      "If a workflow-grade template has no bridge binding, stop and use the owning package surface or design the missing binding before continuing.",
      "Treat legacy D2E proposal receipts as lawful read-only success. The execution-memory consumer is separately default-disabled, consumes one coherent AK machine envelope, and can never authorize or perform applied execution.",
    ],
    parameters: Type.Object({
      template_name: Type.String({ description: "Exact Prompt Vault template name to execute" }),
      objective: Type.String({
        description:
          "For D2E, exact live task title or non-null description selector; task-native contract remains authoritative.",
      }),
      transfer_mode: Type.Optional(
        Type.Union([Type.Literal("proposal"), Type.Literal("applied")], {
          description: "Proposal-only or applied D2E caller mode; defaults to proposal.",
        }),
      ),
      repo: Type.Optional(Type.String({ description: "Exact registered repo for D2E readback." })),
      packet_key: Type.Optional(Type.String({ description: "Exact AK packet key." })),
      packet_id: Type.Optional(Type.Number({ description: "Exact selected AK packet id." })),
      packet_source: Type.Optional(
        Type.String({ description: "Immutable GitHub blob coordinate consumed by Decision 100." }),
      ),
      packet_source_sha256: Type.Optional(
        Type.String({ description: "Expected raw packet Git blob SHA-256." }),
      ),
      expected_task_ids: Type.Optional(
        Type.Array(Type.Number(), {
          description: "Sorted complete expected execution-task id set.",
        }),
      ),
      expected_dependencies: Type.Optional(
        Type.Array(Type.String(), {
          description:
            "One sorted `<task-id>:<none|comma-separated-task-ids>` declaration per expected task.",
        }),
      ),
      authorization_block_ref: Type.Optional(
        Type.String({ description: "Optional exact negative authorization block reference." }),
      ),
      task_id: Type.Optional(Type.Number({ description: "Exact AK execution task id." })),
      decision_id: Type.Optional(Type.Number({ description: "Exact governing AK decision id." })),
      actor: Type.Optional(
        Type.String({ description: "Exact invoking actor; must own the live AK task claim." }),
      ),
      task_scope_sha256: Type.Optional(
        Type.String({
          description: "Proposal-returned exact task scope digest required to apply.",
        }),
      ),
      task_intent_sha256: Type.Optional(
        Type.String({
          description:
            "Proposal-returned canonical task title/description/done-contract/guardrails digest required to apply.",
        }),
      ),
      template_version: Type.Optional(
        Type.Number({ description: "Proposal-returned exact Prompt Vault template version." }),
      ),
      template_content_sha256: Type.Optional(
        Type.String({ description: "Proposal-returned exact Prompt Vault content digest." }),
      ),
      continue_after_failure: Type.Optional(
        Type.Boolean({
          description:
            "Explicitly continue after a failed phase. Transcendent defaults to fail-fast unless this is true.",
        }),
      ),
      loop_timeout_seconds: Type.Optional(
        Type.Number({
          description:
            "Optional absolute whole-loop deadman override in seconds (default: 86400 / 24 hours).",
        }),
      ),
      phase_timeout_seconds: Type.Optional(
        Type.Number({
          description:
            "Optional absolute per-phase deadman override in seconds (default: 14400 / 4 hours).",
        }),
      ),
      resume_run_id: Type.Optional(
        Type.String({ description: "Exact owned checkpointed loop run id to continue." }),
      ),
      expected_failed_phase: Type.Optional(
        Type.String({ description: "Caller assertion for the lawful continuation phase." }),
      ),
      recovery_mode: Type.Optional(Type.Literal("validate_then_retry")),
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

      if (
        templateName === D2E_EXECUTION_MEMORY_TEMPLATE &&
        process.env.PI_ORCH_D2E_EXECUTION_MEMORY_MODE !== "enabled"
      ) {
        return {
          content: [
            {
              type: "text",
              text: "D2E_EXECUTION_MEMORY_DISABLED: Decision 100 execution-memory consumption is disabled; no Vault or AK owner read was performed.",
            },
          ],
          details: {
            ok: false,
            error: "D2E_EXECUTION_MEMORY_DISABLED",
            effect: { disposition: "not_materialized" },
            downstream_implementation_authorization: {
              disposition: "not_authorized",
              granted: false,
              basis: "separate_downstream_owner_authorization_required",
            },
          },
        };
      }

      let dispatchModule: VaultDispatchRuntimeModule;
      try {
        dispatchModule = (await import(
          "@tryinget/pi-vault-client/dispatch-runtime"
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
      const blockedWorkflowPosture = dispatchCheck.results?.find(
        (result) =>
          result.posture === "orchestrator_workflow_gate_required" &&
          result.binding?.execution_surface !== "workflow_execute",
      );
      if (blockedWorkflowPosture) {
        return {
          content: [
            {
              type: "text",
              text: formatWorkflowGateFailure(templateName, objective),
            },
          ],
          details: {
            ok: false,
            error: "vault-template-workflow-owner-route-required",
            dispatchCheck,
          },
        };
      }
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
            resume_run_id: (params as Record<string, unknown>).resume_run_id,
            expected_failed_phase: (params as Record<string, unknown>).expected_failed_phase,
            recovery_mode: (params as Record<string, unknown>).recovery_mode,
          },
          signal,
          onUpdate,
          ctx,
        );
      }

      if (
        posture.posture === "orchestrator_workflow_gate_required" &&
        posture.binding?.execution_surface === "workflow_execute" &&
        posture.binding.execution_args?.workflow_gate === "D2E_EXECUTION_MEMORY_V1"
      ) {
        const input = params as Record<string, unknown>;
        const template = dispatchCheck.templates?.[0];
        const contentSha256 = template
          ? createHash("sha256").update(template.content, "utf8").digest("hex")
          : "";
        const templateIdentity = {
          templateId: Number(template?.id),
          templateName: template?.name ?? "",
          artifactKind: template?.artifact_kind ?? "",
          controlMode: template?.control_mode ?? "",
          formalizationLevel: template?.formalization_level ?? "",
          ownerCompany: template?.owner_company ?? "",
          templateVersion: Number(template?.version),
          contentSha256,
        };
        try {
          if (
            !template ||
            dispatchCheck.templates?.length !== 1 ||
            templateName !== D2E_EXECUTION_MEMORY_TEMPLATE ||
            template.owner_company !== D2E_EXECUTION_MEMORY_OWNER ||
            posture.binding.execution_args?.template_artifact_kind !== "procedure" ||
            posture.binding.execution_args?.template_control_mode !== "one_shot" ||
            posture.binding.execution_args?.template_formalization_level !== "workflow" ||
            posture.binding.execution_args?.template_owner_company !== D2E_EXECUTION_MEMORY_OWNER
          ) {
            throw new D2EExecutionMemoryConsumerError(
              "D2E_EXECUTION_MEMORY_TEMPLATE_IDENTITY_MISMATCH",
              "Dispatch check did not return the exact execution-memory template identity.",
            );
          }
          const mode = input.transfer_mode === "applied" ? "applied" : "proposal";
          const repo = typeof input.repo === "string" && input.repo.trim() ? input.repo : ctx.cwd;
          const expectedTaskIds = Array.isArray(input.expected_task_ids)
            ? input.expected_task_ids.map(Number)
            : Number.isFinite(Number(input.task_id))
              ? [Number(input.task_id)]
              : [];
          const expectedDependencies = Array.isArray(input.expected_dependencies)
            ? input.expected_dependencies.map(String)
            : [];
          const result = await consumeD2EExecutionMemory({
            request: {
              mode,
              templateIdentity,
              repo,
              decisionId: Number(input.decision_id),
              packetId: Number(input.packet_id),
              packetKey: typeof input.packet_key === "string" ? input.packet_key : "",
              packetSource: typeof input.packet_source === "string" ? input.packet_source : "",
              packetSourceSha256:
                typeof input.packet_source_sha256 === "string" ? input.packet_source_sha256 : "",
              expectedTaskIds,
              expectedDependencies,
              authorizationBlockRef:
                typeof input.authorization_block_ref === "string"
                  ? input.authorization_block_ref
                  : undefined,
            },
            activation:
              process.env.PI_ORCH_D2E_EXECUTION_MEMORY_MODE === "enabled" ? "enabled" : "disabled",
            akBinaryPath: process.env.PI_ORCH_D2E_AK_BIN ?? "",
            akBinarySha256: process.env.PI_ORCH_D2E_AK_SHA256 ?? "",
            exec: (command, args, execOptions) => pi.exec(command, args, execOptions),
            signal,
          });
          return {
            content: [{ type: "text", text: JSON.stringify(result.receipt, null, 2) }],
            details: {
              ok: true,
              kind: result.kind,
              status: result.receipt.status,
              receipt: result.receipt,
            },
          };
        } catch (error) {
          const code =
            error instanceof D2EExecutionMemoryConsumerError
              ? error.code
              : "D2E_EXECUTION_MEMORY_TRANSPORT_FAILED";
          const message = error instanceof Error ? error.message : String(error);
          return {
            content: [{ type: "text", text: `${code}: ${message}` }],
            details: {
              ok: false,
              error: code,
              effect: { disposition: "not_materialized" },
              downstream_implementation_authorization: {
                disposition: "not_authorized",
                granted: false,
                basis: "separate_downstream_owner_authorization_required",
              },
              ...(error instanceof D2EExecutionMemoryConsumerError && error.producerError
                ? { producerError: error.producerError }
                : {}),
            },
          };
        }
      }

      if (
        posture.posture === "orchestrator_workflow_gate_required" &&
        posture.binding?.execution_surface === "workflow_execute" &&
        posture.binding.execution_args?.workflow_gate === "D2E_TRANSFER_COMPLETE_V1"
      ) {
        const input = params as Record<string, unknown>;
        const mode = input.transfer_mode === "applied" ? "applied" : "proposal";
        const repo = typeof input.repo === "string" && input.repo.trim() ? input.repo : ctx.cwd;
        const packetKey = typeof input.packet_key === "string" ? input.packet_key : "";
        const taskId = Number(input.task_id);
        const decisionId = Number(input.decision_id);
        const invokingActor = typeof input.actor === "string" ? input.actor.trim() : "";
        const invokingSessionId = resolveSessionIdentity(ctx) ?? "";
        const template = dispatchCheck.templates?.[0];
        const contentSha256 = template
          ? createHash("sha256").update(template.content, "utf8").digest("hex")
          : "";
        const templateIdentity = {
          templateId: Number(template?.id),
          templateName: template?.name ?? "",
          artifactKind: template?.artifact_kind ?? "",
          controlMode: template?.control_mode ?? "",
          formalizationLevel: template?.formalization_level ?? "",
          ownerCompany: template?.owner_company ?? "",
          templateVersion: Number(template?.version),
          contentSha256,
        };

        const inspectRepository = (baselineHead?: string) =>
          inspectD2ERepository({
            repo,
            baselineHead,
            exec: (command, args, execOptions) => pi.exec(command, args, execOptions),
            signal,
          });

        try {
          if (
            !template ||
            dispatchCheck.templates?.length !== 1 ||
            posture.binding.execution_args?.template_artifact_kind !== "procedure" ||
            posture.binding.execution_args?.template_control_mode !== "one_shot" ||
            posture.binding.execution_args?.template_formalization_level !== "workflow" ||
            posture.binding.execution_args?.template_owner_company !== template.owner_company ||
            template.owner_company !==
              D2E_WORKFLOW_TEMPLATE_OWNERS[
                templateName as keyof typeof D2E_WORKFLOW_TEMPLATE_OWNERS
              ]
          ) {
            throw new D2ETransferError(
              "D2E_TRANSFER_TEMPLATE_IDENTITY_MISMATCH",
              "Dispatch check did not return one exact D2E procedure/one_shot/workflow template with its per-template owner.",
            );
          }
          const result = await executeD2ETransferWorkflow({
            request: {
              templateName,
              templateIdentity,
              expectedTemplateVersion: Number(input.template_version),
              expectedTemplateContentSha256:
                typeof input.template_content_sha256 === "string"
                  ? input.template_content_sha256
                  : "",
              mode: mode as "proposal" | "applied",
              repo,
              packetKey,
              taskId,
              decisionId,
              expectedTaskScopeSha256:
                typeof input.task_scope_sha256 === "string" ? input.task_scope_sha256 : "",
              expectedTaskIntentSha256:
                typeof input.task_intent_sha256 === "string" ? input.task_intent_sha256 : "",
              objective,
              invokingActor,
              invokingSessionId,
            },
            exec: (command, args, execOptions) => pi.exec(command, args, execOptions),
            activation:
              process.env.PI_ORCH_D2E_TRANSFER_MODE === "enabled" ? "enabled" : "disabled",
            prepareWorkflow:
              mode === "applied"
                ? async () => {
                    const resolution = resolveAgent?.("builder", { ...ctx, cwd: repo });
                    const toolResult = await getCognitiveToolByName(
                      "controlled",
                      { cwd: repo },
                      signal,
                    );
                    if (isBoundaryFailure(toolResult) || !toolResult.value?.content.trim()) {
                      throw new D2ETransferError(
                        "D2E_TRANSFER_WORKFLOW_INCOMPLETE",
                        "Governed cognitive tool 'controlled' is unavailable.",
                      );
                    }
                    return {
                      workflowExecutor: createWorkflowExecutor({
                        sessionsDir: path.join(
                          os.homedir(),
                          ".pi",
                          "agent",
                          "sessions",
                          "workflows",
                        ),
                        executor: subagentExecutor,
                      }),
                      workflowExecution: {
                        activeTeam: resolution?.team ?? "full",
                        model: ctx.model
                          ? `${ctx.model.provider}/${ctx.model.id}`
                          : "openrouter/google/gemini-2.5-flash-preview",
                        cwd: repo,
                        cognitiveToolContent: toolResult.value.content,
                      },
                    };
                  }
                : undefined,
            inspectRepository,
            claimPreparedTemplate: (sealedText) => {
              const authorization = dispatchRuntime.authorizePreparedExecution({
                templates: [template],
                primaryTemplateName: templateName,
                finalPreparedText: sealedText,
                compositionKind: "single",
                surface: "orchestrator_adapter",
                currentCompany: dispatchCheck.current_company ?? "",
                renderer: "pi-society-orchestrator/d2e-transfer",
                rendererVersion: "2",
                wrapper: "D2E_PREPARED_EXECUTION_V1",
                context: `${repo}|${packetKey}|${taskId}|${decisionId}|${invokingActor}|${invokingSessionId}`,
                args: [objective],
              });
              if (
                authorization.disposition !== "dispatch_required" ||
                authorization.binding?.execution_surface !== "workflow_execute" ||
                authorization.binding.execution_args?.workflow_gate !== "D2E_TRANSFER_COMPLETE_V1"
              ) {
                throw new D2ETransferError(
                  "D2E_TRANSFER_VAULT_AUTHORIZATION_FAILED",
                  authorization.disposition === "blocked"
                    ? authorization.safeMessage
                    : "Vault authorization did not require the exact D2E workflow binding.",
                );
              }
              const claimed = dispatchRuntime.claimPreparedExecution(authorization.authorizationId);
              if (!claimed.ok) {
                throw new D2ETransferError(
                  "D2E_TRANSFER_VAULT_AUTHORIZATION_FAILED",
                  claimed.error,
                );
              }
              const value = claimed.value;
              return {
                authorizationId: value.authorizationId,
                sealedText: value.sealedText,
                templateIdentity: {
                  templateId: value.aggregate.primary.templateId,
                  templateName: value.aggregate.primary.templateName,
                  artifactKind: template.artifact_kind ?? "",
                  controlMode: template.control_mode ?? "",
                  formalizationLevel: template.formalization_level ?? "",
                  ownerCompany: template.owner_company ?? "",
                  templateVersion: value.aggregate.primary.templateVersion,
                  contentSha256: value.aggregate.primary.contentSha256,
                  governedMetadataSha256: value.aggregate.primary.governedMetadataSha256,
                },
                settle(outcome: "handed_off" | "failed") {
                  if (!dispatchRuntime.settlePreparedExecution(value.authorizationId, outcome)) {
                    throw new D2ETransferError(
                      "D2E_TRANSFER_VAULT_AUTHORIZATION_FAILED",
                      "Vault authorization could not be settled exactly once.",
                    );
                  }
                },
              };
            },
            signal,
          });
          return {
            content: [{ type: "text", text: JSON.stringify(result.receipt, null, 2) }],
            details: {
              ok: true,
              kind: result.kind,
              status: result.receipt.status,
              receipt: result.receipt,
              ...(result.kind === "complete" ? { workflow: result.workflow } : {}),
            },
          };
        } catch (error) {
          const code =
            error instanceof D2ETransferError ? error.code : "D2E_TRANSFER_WORKFLOW_INCOMPLETE";
          const message = error instanceof Error ? error.message : String(error);
          const failure =
            error instanceof D2ETransferError && error.failure
              ? error.failure
              : {
                  schema: "D2E_TRANSFER_FAILURE_V1" as const,
                  status: "not_ready" as const,
                  caller_mode: mode,
                  execution_phase: "input_validation" as const,
                  required_packet: { disposition: "unknown" as const },
                  transfer_materialization_authorization: {
                    disposition: "not_authorized" as const,
                    existed_at_dispatch: false,
                  },
                  downstream_implementation_authorization: {
                    disposition: "not_authorized" as const,
                    granted: false as const,
                    basis: "separate_downstream_owner_authorization_required" as const,
                  },
                  effect: { disposition: "not_materialized" as const },
                  error: { code, message },
                };
          const { error: _failureError, ...failureState } = failure;
          return {
            content: [{ type: "text", text: `${code}: ${message}` }],
            details: {
              ok: false,
              error: code,
              ...failureState,
              failure,
            },
          };
        }
      }

      if (
        posture.posture === "orchestrator_workflow_gate_required" &&
        posture.binding?.execution_surface === "workflow_execute" &&
        posture.binding.execution_args?.workflow_gate !== "D2E_TRANSFER_COMPLETE_V1"
      ) {
        if (!options.executeVaultWorkflow) {
          return {
            content: [
              {
                type: "text",
                text: `Vault template ${templateName} has a verified workflow binding, but the orchestrator workflow executor adapter is unavailable. Failing closed.`,
              },
            ],
            details: { ok: false, error: "vault-workflow-executor-unavailable", dispatchCheck },
          };
        }

        let promptPlaneModule: VaultPromptPlaneRuntimeModule;
        let guardModule: VaultDispatchGuardModule;
        try {
          [promptPlaneModule, guardModule] = (await Promise.all([
            import("@tryinget/pi-vault-client/prompt-plane"),
            import("@tryinget/pi-vault-client/dispatch-guard"),
          ])) as unknown as [VaultPromptPlaneRuntimeModule, VaultDispatchGuardModule];
        } catch (error) {
          return {
            content: [
              {
                type: "text",
                text: `Vault authorization runtime is unavailable: ${error instanceof Error ? error.message : String(error)}`,
              },
            ],
            details: { ok: false, error: "vault-authorization-runtime-unavailable" },
          };
        }

        const promptPlane = promptPlaneModule.createVaultPromptPlaneRuntime({ dispatchRuntime });
        const prepared = await promptPlane.prepareSelectionV2(
          { query: templateName, context: objective },
          { cwd: ctx.cwd },
        );
        const authorizationId = prepared.authorization?.authorizationId;
        if (
          !prepared.ok ||
          prepared.status !== "dispatch_required" ||
          prepared.authorization?.disposition !== "dispatch_required" ||
          typeof authorizationId !== "string"
        ) {
          return {
            content: [
              {
                type: "text",
                text: `Vault authorization preparation failed for ${templateName}: ${prepared.blocking_reason || "dispatch authorization was not issued"}`,
              },
            ],
            details: {
              ok: false,
              error: "vault-workflow-authorization-failed",
              preparedStatus: prepared.status,
            },
          };
        }

        const preflightClaim = options.governedDeepReviewPreflight?.claimForExecution({
          templateName,
          cwd: ctx.cwd,
          toolCallId: _toolCallId,
        }) ?? { ok: true as const, receipt: null };
        if (!preflightClaim.ok) {
          return {
            content: [
              {
                type: "text",
                text: `Governed workflow preflight claim failed for ${templateName}: ${preflightClaim.error}`,
              },
            ],
            details: {
              ok: false,
              error: "governed-deep-review-preflight-claim-failed",
              templateName,
            },
          };
        }
        const preflightReceipt = preflightClaim.receipt;

        let dispatched: Awaited<
          ReturnType<VaultDispatchGuardModule["dispatchAuthorizedExecution"]>
        >;
        try {
          dispatched = await guardModule.dispatchAuthorizedExecution({
            runtime: dispatchRuntime,
            authorizationId,
            intendedExecutor: "workflow_execute",
            activation: guardModule.createDispatchActivationPolicy(gatedDispatchEnabled),
            receiptStore: guardModule.createDispatchHandoffStore(
              options.dispatchReceiptPath ? { filePath: options.dispatchReceiptPath } : undefined,
            ),
            execute: ({
              handoffId,
              authorizationId: claimedAuthorizationId,
              sealedText,
              binding,
            }) =>
              options.executeVaultWorkflow?.({
                templateName,
                objective,
                cwd: ctx.cwd,
                sealedText,
                handoffId,
                authorizationId: claimedAuthorizationId,
                executionArgs: binding.execution_args,
                signal,
                ctx,
              }) ??
              Promise.resolve({
                accepted: false,
                handoffId,
                status: "error",
              }),
          });
        } catch (error) {
          const preflightSettled = preflightReceipt
            ? options.governedDeepReviewPreflight?.settleExecution(
                preflightReceipt.nonce,
                "failed",
              ) === true
            : true;
          return {
            content: [
              {
                type: "text",
                text: preflightSettled
                  ? `Governed workflow dispatch threw for ${templateName}: ${error instanceof Error ? error.message : String(error)}`
                  : `Governed workflow dispatch threw and preflight settlement failed for ${templateName}; reload before governed execution.`,
              },
            ],
            details: {
              ok: false,
              error: preflightSettled
                ? "vault-workflow-dispatch-threw"
                : "governed-deep-review-preflight-settlement-failed",
              templateName,
              preflightNonce: preflightReceipt?.nonce ?? null,
            },
          };
        }

        if (!dispatched.ok) {
          const preflightSettled = preflightReceipt
            ? options.governedDeepReviewPreflight?.settleExecution(
                preflightReceipt.nonce,
                "failed",
              ) === true
            : true;
          return {
            content: [
              {
                type: "text",
                text: preflightSettled
                  ? `Governed workflow dispatch failed for ${templateName}: ${dispatched.error}`
                  : `Governed workflow dispatch and preflight settlement failed for ${templateName}; reload before governed execution.`,
              },
            ],
            details: {
              ok: false,
              error: preflightSettled
                ? "vault-workflow-dispatch-failed"
                : "governed-deep-review-preflight-settlement-failed",
              templateName,
              handoffId: dispatched.handoffId ?? null,
              preflightNonce: preflightReceipt?.nonce ?? null,
            },
          };
        }

        const workflowStatus = dispatched.result.status ?? "unknown";
        const workflowOk = workflowStatus === "done";
        if (preflightReceipt) {
          const settled = options.governedDeepReviewPreflight?.settleExecution(
            preflightReceipt.nonce,
            workflowOk ? "done" : "failed",
          );
          if (!settled) {
            return {
              content: [
                {
                  type: "text",
                  text: `Governed workflow preflight settlement failed for ${templateName}.`,
                },
              ],
              details: {
                ok: false,
                error: "governed-deep-review-preflight-settlement-failed",
                templateName,
                handoffId: dispatched.handoffId,
              },
            };
          }
        }
        return {
          content: [
            {
              type: "text",
              text: `${workflowOk ? "✓" : "✗"} Governed ${templateName} workflow — ${workflowStatus}${dispatched.result.output ? `\n\n${dispatched.result.output}` : ""}`,
            },
          ],
          details: {
            ok: workflowOk,
            templateName,
            executionSurface: "workflow_execute",
            handoffId: dispatched.handoffId,
            authorizationId,
            runId: dispatched.result.runId ?? null,
            status: workflowStatus,
            executorDetails: dispatched.result.details ?? null,
            preflightNonce: preflightReceipt?.nonce ?? null,
            preflightReceiptDigest: preflightReceipt?.receiptDigest ?? null,
            preflightRegistryId: preflightReceipt?.registryId ?? null,
          },
        };
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
      return new Text(formatVaultExecuteTemplateResultLabel(result), 0, 0);
    },
  });
}

export function formatVaultExecuteTemplateResultLabel(result: AgentToolResult<unknown>): string {
  const details = result.details as
    | {
        ok?: boolean;
        error?: string;
        kind?: string;
        status?: string;
        result?: CompactLoopResult;
      }
    | undefined;
  if (details?.result) return `${details.ok ? "✓" : "✗"} ${details.result.plugin}`;
  if (details?.ok === true && details.kind === "proposal") {
    return details.status === "not_ready"
      ? "proposal not ready (read-only)"
      : "proposal ready (read-only)";
  }
  if (details?.ok === true && details.status === "proposal") return "proposal ready (read-only)";
  if (details?.ok === true) return "executed";
  if (details?.error) return details.error;
  const content = result.content[0];
  if (details?.ok === undefined && content?.type === "text" && content.text.trim()) {
    return content.text.trim();
  }
  if (details?.ok === false) return "blocked";
  return "pending";
}

export * from "./loop-ui.ts";
