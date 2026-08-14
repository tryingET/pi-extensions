/** Subagent dispatcher for the `dispatch_subagent` tool. */

import { StringEnum } from "@earendil-works/pi-ai";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { shapeToolResult } from "./edge-contract-kernel.ts";
import {
  ASC_EXECUTION_OBSERVATION_EVENT,
  type AscExecutionObservation,
  type AscExecutionObservationContext,
  projectAscExecutionFailure,
  projectAscExecutionResult,
  projectAscExecutionUpdate,
} from "./execution-observation.ts";
import { SUBAGENT_PROFILES } from "./subagent-profiles.ts";
import {
  type AscExecutionRuntime,
  createAscExecutionRuntime,
  type DispatchSubagentExecutionResult,
  type DispatchSubagentPreDispatchFailureAttestation,
  type DispatchSubagentProfile,
  type DispatchSubagentRequest,
  type SubagentModelContext,
  type SubagentModelProviderResult,
} from "./subagent-runtime.ts";
import {
  clearSubagentSessions,
  createSubagentState,
  type SubagentState,
} from "./subagent-session.ts";
import {
  type AssistantStopReason,
  type ExecutionState,
  type SubagentDef,
  type SubagentResult,
  type SubagentSpawner,
  spawnSubagent,
  spawnSubagentWithSpawn,
} from "./subagent-spawn.ts";

export {
  SUBAGENT_PROFILES,
  createAscExecutionRuntime,
  createSubagentState,
  clearSubagentSessions,
  spawnSubagent,
  spawnSubagentWithSpawn,
};
export type {
  AscExecutionRuntime,
  AssistantStopReason,
  DispatchSubagentProfile,
  DispatchSubagentRequest,
  ExecutionState,
  SubagentDef,
  SubagentModelContext,
  SubagentResult,
  SubagentSpawner,
  SubagentState,
};

export const DISPATCH_SUBAGENT_TOOL_FAILURE_METADATA_PREFIX = "ASC_DISPATCH_FAILURE ";
const MAX_PENDING_PRE_DISPATCH_ATTESTATIONS = 32;

export function renderDispatchSubagentToolFailureMetadata(
  result: DispatchSubagentExecutionResult,
): string {
  const failureKind = result.details.failureKind ?? result.details.reason ?? "unknown_failure";
  const effectDisposition =
    result.details.effectReceipt?.disposition ?? result.details.effectDisposition;
  return `${DISPATCH_SUBAGENT_TOOL_FAILURE_METADATA_PREFIX}${JSON.stringify({
    schema: "asc.dispatch_tool_failure.v1",
    status: result.details.status ?? "error",
    failureKind,
    ...(result.details.preDispatchFailure
      ? {
          phase: result.details.preDispatchFailure.phase,
          identityAllocated: result.details.preDispatchFailure.identityAllocated,
          spawnAttempted: result.details.preDispatchFailure.spawnAttempted,
        }
      : {}),
    ...(effectDisposition ? { effectDisposition } : {}),
    ...(result.details.dispatchId ? { dispatchId: result.details.dispatchId } : {}),
    ...(result.details.attemptId ? { attemptId: result.details.attemptId } : {}),
  })}`;
}

export class DispatchSubagentToolError extends Error {
  readonly result: DispatchSubagentExecutionResult;

  constructor(result: DispatchSubagentExecutionResult) {
    const failureKind = result.details.failureKind ?? result.details.reason ?? "unknown_failure";
    const dispatchId = result.details.dispatchId ? ` dispatchId=${result.details.dispatchId}` : "";
    const inspect = result.details.sessionName
      ? ` Inspect with /subagent-inspect ${result.details.sessionName}.`
      : "";
    const metadata = renderDispatchSubagentToolFailureMetadata(result);
    super(
      `dispatch_subagent failed (${failureKind})${dispatchId}: ${result.text}${inspect}\n${metadata}`,
    );
    this.name = "DispatchSubagentToolError";
    this.result = result;
  }
}

type CompatToolDefinition = Omit<Parameters<ExtensionAPI["registerTool"]>[0], "parameters"> & {
  parameters?: unknown;
  promptSnippet?: string;
  promptGuidelines?: string[];
};

function emitExecutionObservation(
  pi: ExtensionAPI,
  observation: AscExecutionObservation | undefined,
): void {
  if (!observation) return;
  try {
    // Observation is explicitly best-effort: a missing or failing listener must not perturb ASC.
    pi.events.emit(ASC_EXECUTION_OBSERVATION_EVENT, observation);
  } catch {
    // Ghostty/UI observation is never part of execution or effect-receipt truth.
  }
}

export function registerDispatchSubagentTool(pi: ExtensionAPI, runtime: AscExecutionRuntime): void {
  const pendingPreDispatchAttestations = new Map<
    string,
    DispatchSubagentPreDispatchFailureAttestation
  >();
  pi.on?.("tool_result", (event) => {
    if (event.toolName !== "dispatch_subagent" || typeof event.toolCallId !== "string") return;
    const attestation = pendingPreDispatchAttestations.get(event.toolCallId);
    if (!attestation) return;
    pendingPreDispatchAttestations.delete(event.toolCallId);
    if (event.isError !== true) return;
    const existingDetails =
      event.details && typeof event.details === "object" && !Array.isArray(event.details)
        ? (event.details as Record<string, unknown>)
        : {};
    return {
      details: {
        ...existingDetails,
        ascPreDispatchFailure: { ...attestation },
      },
    };
  });
  const tool: CompatToolDefinition = {
    name: "dispatch_subagent",
    label: "Dispatch Subagent",
    description: `Spawn a specialized subagent to work on a specific objective. Subagents run in parallel and return their results.

Profiles:
- explorer: High-value problem-space mapping and uncertainty discovery (tools: read, bash)
- reviewer: Independent, evidence-ranked assessment of proposed work (tools: read, bash)
- tester: Claim-focused local verification and confidence-calibrated testing (tools: read, bash)
- researcher: Source-grounded uncertainty reduction and synthesis (tools: read, bash)
- minimal: Full-precision execution with minimal context, ceremony, and output (tools: read, bash)

Use for:
- Parallel exploration of different approaches
- Self-review of your own work
- Focused research before continuing parent work
- Testing hypotheses before committing

Dispatch is foreground/blocking. Each completed result prints a canonical Dispatch ID before child output. Copy that exact value into resumeDispatchId to continue the owned child session; never derive it from name, sessionName, a UUID/ULID, or a tool-call id. Repeated names alone create new collision-safe sessions.

Prompt envelope (optional):
- prompt_name / prompt_content / prompt_tags / prompt_source
- If prompt_content is provided, it is prepended deterministically to the initial child task message after Pi's stable host/project system context.
- Provenance is returned in details as prompt_name, prompt_source, prompt_tags, prompt_applied.

Cache measurement:
- Completed owned child runs report first-turn and aggregate cache-read/uncached token measurements, output tokens, provider cost, and wall time.
- Cache metrics describe observed provider usage only; they do not prove result quality, overlap, or that a tree/fork cloned provider cache state.

Child extension bootstrap (optional):
- extensions: explicit child-only extension allowlist loaded via --no-extensions + repeated --extension flags
- use this when the subagent needs extension-provided providers/tools such as pi-multi-pass or vault-client without inheriting the full parent extension surface.

Request env policy (optional):
- env only accepts PI_PROVENANCE_* keys for per-dispatch provenance sidecars.
- PATH, NODE_OPTIONS, PI_CODING_AGENT_DIR, and any non-PI_PROVENANCE_* key fail before spawn.

Child skill profile bootstrap (optional):
- clean children default to --no-skills so ambient skill discovery does not inflate or vary the prompt.
- skillProfile resolves a named, allowlisted skill-library profile and starts the child with --no-skills + a materialized --skill directory.
- noSkills=false is an explicit compatibility opt-out that restores ordinary child skill discovery when no profile is selected.
- raw skills[] paths are currently rejected fail-closed; use named profiles.`,
    promptSnippet:
      "Spawn a focused subagent for parallel investigation, review, testing, or research.",
    promptGuidelines: [
      "Use dispatch_subagent when parallel work will reduce risk or latency versus doing the investigation yourself inline.",
      "Pick the narrowest profile and objective that will produce a useful intermediate result you can inspect before proceeding.",
      "Do not impose routine 5–10 minute cutoffs on healthy modern-agent work; omit timeout for the long emergency deadman unless the operator requested a shorter absolute bound.",
      "When resuming dispatch_subagent, copy resumeDispatchId exactly from the prior result's model-visible Dispatch ID; never derive it from name, sessionName, or another identifier.",
    ],
    parameters: Type.Object({
      profile: StringEnum(
        ["explorer", "reviewer", "tester", "researcher", "minimal", "custom"] as const,
        { description: "Predefined profile or 'custom'" },
      ),
      // Schema-level admission (per main's policy the schema owns the bound, not the
      // package edge-contract): 100k stays far above the largest observed delegated
      // objective (32k) while staying under the execve MAX_ARG_STRLEN ~128KiB that
      // would otherwise surface as an unattested E2BIG spawn error.
      objective: Type.String({
        description: "Clear objective for the subagent (maximum 100000 characters)",
        maxLength: 100_000,
      }),
      tools: Type.Optional(
        Type.String({ description: "Comma-separated tools (default: from profile)" }),
      ),
      systemPrompt: Type.Optional(
        Type.String({
          description:
            "Compatibility field for custom child instructions. Instructions are placed in the initial user task message after stable host/project context.",
        }),
      ),
      name: Type.Optional(
        Type.String({ description: "Human-readable session name (default: profile name)" }),
      ),
      resumeDispatchId: Type.Optional(
        Type.String({
          description:
            "Exact model-visible Dispatch ID copied from a completed ASC result. Reuses its owned child session after repo/session validation; do not substitute a name, session id, UUID/ULID, or tool-call id.",
        }),
      ),
      thinking: Type.Optional(
        StringEnum(["off", "minimal", "low", "medium", "high", "xhigh", "max"] as const, {
          description: "Child thinking level. Defaults by profile.",
        }),
      ),
      startupTimeout: Type.Optional(
        Type.Number({ description: "Bootstrap timeout in seconds (default: 30, maximum: 300)" }),
      ),
      timeout: Type.Optional(
        Type.Number({
          description:
            "Absolute execution deadman after child bootstrap in seconds (default: 14400 / 4 hours). Omit for ordinary supervised work; timeout=0 still requires allowUnlimited=true and host policy opt-in.",
        }),
      ),
      allowUnlimited: Type.Optional(
        Type.Boolean({
          description: "Explicit request for timeout=0; host policy must also allow it.",
        }),
      ),
      deliverable: Type.Optional(
        Type.String({ description: "Expected result shape or artifact." }),
      ),
      acceptanceCriteria: Type.Optional(
        Type.Array(Type.String(), { description: "Observable completion criteria." }),
      ),
      constraints: Type.Optional(
        Type.Array(Type.String(), { description: "Task-specific constraints." }),
      ),
      evidenceRequired: Type.Optional(
        Type.Array(Type.String(), { description: "Evidence the child should cite." }),
      ),
      mutationPolicy: Type.Optional(
        StringEnum(["read_only", "bounded_mutation"] as const, {
          description:
            "Declared mutation posture. This guides the child but does not replace tool or sandbox policy.",
        }),
      ),
      stopConditions: Type.Optional(
        Type.Array(Type.String(), { description: "Conditions that require the child to stop." }),
      ),
      allowedPaths: Type.Optional(
        Type.Array(Type.String(), { description: "Advisory allowed path scope." }),
      ),
      forbiddenPaths: Type.Optional(
        Type.Array(Type.String(), { description: "Advisory forbidden path scope." }),
      ),
      extensions: Type.Optional(
        Type.Array(Type.String(), {
          description:
            "Optional child-only extension allowlist (for example ['pi-multi-pass', 'vault-client', '/abs/path/to/ext.ts'])",
        }),
      ),
      env: Type.Optional(
        Type.Record(Type.String(), Type.String(), {
          description:
            "Optional per-dispatch child env overlay. Only PI_PROVENANCE_* keys are accepted; control env such as PATH, NODE_OPTIONS, and PI_CODING_AGENT_DIR is rejected before spawn.",
        }),
      ),
      skillProfile: Type.Optional(
        Type.String({
          description:
            "Optional named child skill profile (for example 'minimal', 'ak', 'governance', or 'dspx-skill-authoring'). Resolved through an allowlisted registry before spawn.",
        }),
      ),
      noSkills: Type.Optional(
        Type.Boolean({
          description:
            "Defaults to true for clean children. Set false to restore ordinary skill discovery; skillProfile always implies --no-skills and adds a materialized --skill directory.",
        }),
      ),
      skills: Type.Optional(
        Type.Array(Type.String(), {
          description:
            "Reserved for future allowlisted explicit skill selection. Raw skill paths are currently rejected fail-closed; use skillProfile.",
        }),
      ),
      prompt_name: Type.Optional(
        Type.String({ description: "Prompt identifier used for provenance (e.g. template name)" }),
      ),
      prompt_content: Type.Optional(
        Type.String({
          description: "Prompt content to inject into the initial child task message",
        }),
      ),
      prompt_tags: Type.Optional(
        Type.Array(Type.String(), {
          description: "Optional prompt tags for provenance (e.g. ['phase:sensemaking'])",
        }),
      ),
      prompt_source: Type.Optional(
        Type.String({
          description: "Prompt source label for provenance (default: vault-client)",
        }),
      ),
    }),

    async execute(toolCallId, params, _signal, onUpdate, ctx) {
      const request = params as DispatchSubagentRequest;
      const observationContext: AscExecutionObservationContext = {
        producer: "dispatch_subagent",
        cwd: ctx.cwd,
        group: {
          id: `dispatch-tool-${toolCallId}`,
          kind: "dispatch",
          label: `Dispatch · ${request.profile}`,
        },
      };

      let result: DispatchSubagentExecutionResult;
      try {
        result = await runtime.execute(
          request,
          ctx,
          (update) => {
            emitExecutionObservation(pi, projectAscExecutionUpdate(update, observationContext));
            onUpdate?.({
              content: [{ type: "text", text: update.text }],
              details: update.details,
            });
          },
          _signal ?? undefined,
        );
      } catch (error) {
        emitExecutionObservation(
          pi,
          projectAscExecutionFailure(observationContext, "execution_rejected"),
        );
        throw error;
      }

      emitExecutionObservation(pi, projectAscExecutionResult(result, observationContext));
      if (!result.ok) {
        const attestation = result.details.preDispatchFailure;
        if (attestation) {
          if (pendingPreDispatchAttestations.size >= MAX_PENDING_PRE_DISPATCH_ATTESTATIONS) {
            const oldest = pendingPreDispatchAttestations.keys().next().value;
            if (typeof oldest === "string") pendingPreDispatchAttestations.delete(oldest);
          }
          pendingPreDispatchAttestations.set(toolCallId, { ...attestation });
        }
        throw new DispatchSubagentToolError(result);
      }

      pendingPreDispatchAttestations.delete(toolCallId);
      return shapeToolResult({
        status: result.details.status ?? "done",
        text: result.text,
        details: result.details as Record<string, unknown>,
      });
    },
  };

  pi.registerTool(tool as Parameters<ExtensionAPI["registerTool"]>[0]);
}

export function registerSubagentTool(
  pi: ExtensionAPI,
  state: SubagentState,
  modelProvider: (ctx?: SubagentModelContext) => SubagentModelProviderResult,
  spawner: SubagentSpawner = spawnSubagent,
): void {
  registerDispatchSubagentTool(
    pi,
    createAscExecutionRuntime({
      sessionsDir: state.sessionsDir,
      state,
      modelProvider,
      spawner,
    }),
  );
}

export { registerSubagentCommands } from "./subagent-commands.ts";
