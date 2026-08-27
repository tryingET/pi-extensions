// ---
// summary: consumer-side adapter that resolves registered agents and dispatches them through ASC's custom profile + skill-profile path.
// read_when:
//   - changing the dispatch_agent composition, model inheritance, or ASC runtime wiring.
// ---

import {
  createAscExecutionRuntime,
  type DispatchMutationPolicy,
  type DispatchSubagentExecutionResult,
  type DispatchSubagentExecutionUpdate,
  type DispatchThinkingLevel,
  type ExtraSkillProfileResolver,
  resolveSubagentModelSelection,
  type SubagentModelContext,
  type SubagentSpawner,
  type SubagentState,
} from "@tryinget/pi-autonomous-session-control/execution";
import type { AgentRegistry, ResolvedAgentLaunch } from "./registry.ts";

export class AgentDispatchError extends Error {
  readonly reason: "unknown_agent" | "resolution_failed";

  constructor(reason: "unknown_agent" | "resolution_failed", message: string) {
    super(message);
    this.name = "AgentDispatchError";
    this.reason = reason;
  }
}

export interface AgentDispatchOptions {
  sessionsDir: string;
  registry: AgentRegistry;
  state?: SubagentState;
  /** Test-only custom spawner; requires parent-owned capacity like ASC. */
  spawner?: SubagentSpawner;
}

export interface AgentDispatchRequest {
  agent: string;
  objective: string;
  name?: string;
  deliverable?: string;
  acceptanceCriteria?: string[];
  constraints?: string[];
  evidenceRequired?: string[];
  mutationPolicy?: DispatchMutationPolicy;
  stopConditions?: string[];
  /** Overrides the manifest advisory scope when provided. */
  allowedPaths?: string[];
  forbiddenPaths?: string[];
  /** Overrides manifest defaults.thinking when provided. */
  thinking?: string;
  /** Overrides manifest defaults.model when provided (null keeps inheritance). */
  model?: string;
  /** Additional child extensions on top of the manifest allowlist. */
  extensions?: string[];
  timeout?: number;
  startupTimeout?: number;
  prompt_name?: string;
  prompt_content?: string;
  prompt_tags?: string[];
  prompt_source?: string;
  effectCorrelationId?: string;
}

export interface AgentDispatchOutcome {
  result: DispatchSubagentExecutionResult;
  launch: ResolvedAgentLaunch;
}

export async function dispatchAgent(
  options: AgentDispatchOptions,
  request: AgentDispatchRequest,
  ctx: SubagentModelContext,
  onUpdate?: (update: DispatchSubagentExecutionUpdate) => void,
  signal?: AbortSignal,
): Promise<AgentDispatchOutcome> {
  const manifest = options.registry.get(request.agent);
  if (!manifest) {
    throw new AgentDispatchError(
      "unknown_agent",
      `unknown agent: ${request.agent} (registered: ${[...options.registry.agents.keys()].sort().join(", ") || "none"})`,
    );
  }

  let launch: ResolvedAgentLaunch;
  try {
    launch = await options.registry.resolve(request.agent);
  } catch (error) {
    throw new AgentDispatchError(
      "resolution_failed",
      `agent "${request.agent}" failed fail-closed resolution: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  const originalCleanup = launch.cleanup;
  let cleanedUp = false;
  const cleanupOnce = async (): Promise<void> => {
    if (cleanedUp) return;
    cleanedUp = true;
    await originalCleanup();
  };
  launch = { ...launch, cleanup: cleanupOnce };

  let ascOwnsCleanup = false;
  const extraSkillProfileResolver: ExtraSkillProfileResolver | undefined =
    launch.skillDirs.length > 0
      ? async (profile) => {
          if (profile !== manifest.name) {
            return undefined;
          }
          ascOwnsCleanup = true;
          return {
            noSkills: true,
            skillSources: [...launch.skillDirs],
            skillProfile: profile,
            loadedSkills: [...launch.loadedSkills],
            librarySkills: [],
            skillWarnings: [],
            cleanup: launch.cleanup,
          };
        }
      : undefined;

  const runtime = createAscExecutionRuntime({
    sessionsDir: options.sessionsDir,
    ...(options.state ? { state: options.state } : {}),
    modelProvider: (modelCtx?: SubagentModelContext) =>
      request.model ?? launch.model ?? resolveSubagentModelSelection(modelCtx),
    ...(options.spawner
      ? { spawner: options.spawner, customSpawnerCapacityOwnership: "parent_owned" as const }
      : {}),
    ...(extraSkillProfileResolver ? { extraSkillProfileResolver } : {}),
  });

  const allowedPaths = request.allowedPaths ?? launch.scopeRepos;
  const forbiddenPaths = request.forbiddenPaths ?? launch.scopeForbidden;
  const extensions = [...new Set([...launch.extensions, ...(request.extensions ?? [])])];

  let result: DispatchSubagentExecutionResult;
  try {
    result = await runtime.execute(
      {
        profile: "custom",
        objective: request.objective,
        systemPrompt: launch.systemPrompt,
        tools: launch.tools,
        thinking: (request.thinking ?? launch.thinking) as DispatchThinkingLevel,
        ...(request.name ? { name: request.name } : { name: manifest.name }),
        ...(launch.skillDirs.length > 0 ? { skillProfile: manifest.name } : {}),
        ...(request.deliverable ? { deliverable: request.deliverable } : {}),
        ...(request.acceptanceCriteria ? { acceptanceCriteria: request.acceptanceCriteria } : {}),
        ...(request.constraints ? { constraints: request.constraints } : {}),
        ...(request.evidenceRequired ? { evidenceRequired: request.evidenceRequired } : {}),
        ...(request.mutationPolicy ? { mutationPolicy: request.mutationPolicy } : {}),
        ...(request.stopConditions ? { stopConditions: request.stopConditions } : {}),
        ...(allowedPaths.length > 0 ? { allowedPaths } : {}),
        ...(forbiddenPaths.length > 0 ? { forbiddenPaths } : {}),
        ...(extensions.length > 0 ? { extensions } : {}),
        ...(request.timeout !== undefined ? { timeout: request.timeout } : {}),
        ...(request.startupTimeout !== undefined ? { startupTimeout: request.startupTimeout } : {}),
        ...(request.prompt_name ? { prompt_name: request.prompt_name } : {}),
        ...(request.prompt_content ? { prompt_content: request.prompt_content } : {}),
        ...(request.prompt_tags ? { prompt_tags: request.prompt_tags } : {}),
        ...(request.prompt_source ? { prompt_source: request.prompt_source } : {}),
        ...(request.effectCorrelationId
          ? { effectCorrelationId: request.effectCorrelationId }
          : {}),
      },
      ctx,
      onUpdate,
      signal,
    );
  } finally {
    if (!ascOwnsCleanup) {
      await cleanupOnce();
    }
  }

  return { result, launch };
}
