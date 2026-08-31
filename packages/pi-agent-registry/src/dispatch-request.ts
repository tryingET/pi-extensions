// ---
// summary: composes the ASC DispatchSubagentRequest and runtime options for Fleet Phase-2 read-only dispatch.
// read_when:
//   - changing the dispatched child task contract, model policy, or ASC runtime wiring.
// ---

import type {
  AscExecutionRuntime,
  DispatchSubagentRequest,
  ResolvedSubagentModelSelection,
  SubagentModelContext,
} from "@tryinget/pi-autonomous-session-control/execution";
import { createAgentSkillProfileResolver } from "./agent-skill-resolver.ts";
import type { AscExecutionSurface } from "./asc-execution-surface.ts";
import type { AkTaskSnapshot } from "./dispatch-contract.ts";
import {
  DISPATCH_CHILD_PROVENANCE_ENV,
  DISPATCH_EXECUTION_TIMEOUT_SECONDS,
  DISPATCH_STARTUP_TIMEOUT_SECONDS,
} from "./dispatch-contract.ts";
import type { AgentManifest } from "./manifest.ts";
import type { AgentRegistry, ResolvedAgentLaunch } from "./registry.ts";

export interface DispatchRequestInputs {
  manifest: AgentManifest;
  launch: ResolvedAgentLaunch;
  task: AkTaskSnapshot;
  objective: string;
  parentRoot: string;
  manifestSha256: string;
}

/**
 * Transport-safe envelope for the child's initial instructions. The ASC child
 * transport forwards the composed prompt as the child pi process's leading
 * positional argument, and a pi CLI invocation cannot start a positional
 * prompt with dash-led tokens; persona files legitimately begin with YAML
 * front matter (`---`). A registry-authored dispatch header both states the
 * dispatch identity and keeps the argv value dash-safe without altering the
 * persona bytes it wraps.
 */
export function dispatchPromptEnvelope(inputs: DispatchRequestInputs): string {
  return [
    `# Standing-agent dispatch: ${inputs.manifest.name} (AK task ${inputs.task.id}, Fleet Phase 2, read-only)`,
    "",
    inputs.launch.systemPrompt,
  ].join("\n");
}

/** Binds the exact task, agent identity, and immutable manifest bytes into one correlation id. */
export function dispatchEffectCorrelationId(inputs: DispatchRequestInputs): string {
  return `pi-agent-registry:ak-${inputs.task.id}:${inputs.manifest.name}:${inputs.manifestSha256.slice(0, 16)}`;
}

/** Compose the one permitted Phase-2 child request: read-only, exact-task, one level deep. */
export function composeDispatchSubagentRequest(
  inputs: DispatchRequestInputs,
): DispatchSubagentRequest {
  const declaredTools = [...inputs.manifest.tools];
  const allowedPaths =
    inputs.manifest.scope?.repos && inputs.manifest.scope.repos.length > 0
      ? [...inputs.manifest.scope.repos]
      : [inputs.parentRoot];
  const forbiddenPaths = [...(inputs.manifest.scope?.forbidden ?? []), ".git", "node_modules"];
  return {
    profile: "custom",
    name: inputs.manifest.name,
    objective: inputs.objective,
    tools: declaredTools.join(","),
    systemPrompt: dispatchPromptEnvelope(inputs),
    thinking: inputs.launch.thinking as DispatchSubagentRequest["thinking"],
    extensions: inputs.launch.extensions,
    skillProfile: inputs.manifest.name,
    mutationPolicy: "read_only",
    deliverable:
      "A concise written read-only observation report with exact file/line citations, coverage, findings, and uncertainty.",
    acceptanceCriteria: [
      "Every claim cites an exact observed file path or command output.",
      "The report states what was not covered.",
    ],
    constraints: [
      "Fleet Phase-2 exact-task read-only standing-agent dispatch: mutate nothing.",
      "No file writes, no git mutations, no AK or database writes, no installs, no publishing, no worktree creation.",
      `The exact AK task ${inputs.task.id} ("${inputs.task.title}") authorizes this one read-only observation; do not broaden it.`,
      "Do not call dispatch_agent; standing-agent dispatch is exactly one level deep.",
      "Stay inside the advisory operating territory in your system prompt.",
    ],
    evidenceRequired: ["Cite exact file paths for every material claim."],
    stopConditions: [
      "The requested read-only deliverable is complete.",
      "Any next step would require mutation or broader authorization.",
      "Authorization or scope becomes uncertain.",
    ],
    allowedPaths,
    forbiddenPaths,
    timeout: DISPATCH_EXECUTION_TIMEOUT_SECONDS,
    startupTimeout: DISPATCH_STARTUP_TIMEOUT_SECONDS,
    env: {
      [DISPATCH_CHILD_PROVENANCE_ENV]: `ak-${inputs.task.id}:${inputs.manifest.name}`,
    },
    effectCorrelationId: dispatchEffectCorrelationId(inputs),
  };
}

/**
 * Create the ASC-owned execution runtime: ASC resolves the sessions dir and
 * the model (session-inherited unless the manifest pins one), and the registry
 * supplies only its skill-profile seam.
 */
export function createPhase2AscRuntime(
  surface: AscExecutionSurface,
  registry: AgentRegistry,
  launch: ResolvedAgentLaunch,
  options: { cwd: string },
  createRuntime?: DispatchRuntimeFactory,
): AscExecutionRuntime {
  const sessionsDir = surface.resolveSubagentSessionsDir({ cwd: options.cwd }).path;
  const runtimeOptions: Parameters<DispatchRuntimeFactory>[0] = {
    sessionsDir,
    modelProvider: (modelCtx?: SubagentModelContext): ResolvedSubagentModelSelection =>
      launch.model
        ? { requestedModel: launch.model, effectiveModel: launch.model, source: "custom" }
        : surface.resolveSubagentModelSelection(modelCtx),
    extraSkillProfileResolver: createAgentSkillProfileResolver(registry),
  };
  return createRuntime
    ? createRuntime(runtimeOptions)
    : surface.createAscExecutionRuntime(runtimeOptions);
}

export type DispatchRuntimeFactory = (options: {
  sessionsDir: string;
  modelProvider: (modelCtx?: SubagentModelContext) => ResolvedSubagentModelSelection;
  extraSkillProfileResolver: ReturnType<typeof createAgentSkillProfileResolver>;
}) => AscExecutionRuntime;
