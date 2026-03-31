import * as fs from "node:fs";
import {
  createAscExecutionRuntime,
  createSubagentState,
  type DispatchSubagentExecutionResult,
  type DispatchSubagentExecutionUpdate,
  type SubagentSpawner,
  type SubagentState,
} from "pi-autonomous-session-control/execution";
import type { AgentDef } from "./agent-profiles.ts";

const DEFAULT_PI_SUBAGENT_TIMEOUT_MS =
  Number.parseInt(process.env.PI_ORCH_SUBAGENT_TIMEOUT_MS || "", 10) || 10 * 60 * 1000;
const DEFAULT_PI_OUTPUT_CHARS =
  Number.parseInt(process.env.PI_ORCH_SUBAGENT_OUTPUT_CHARS || "", 10) || 64_000;

export interface OrchestratorSubagentExecutionParams {
  agentProfile: Pick<AgentDef, "name" | "tools" | "systemPrompt">;
  cognitiveToolContent: string;
  cognitiveToolName?: string;
  objective: string;
  model: string;
  cwd: string;
  contextHeading?: string;
  contextBody?: string;
  extraSections?: string[];
  sessionName?: string;
  timeoutSeconds?: number;
  promptName?: string;
  promptContent?: string;
  promptTags?: string[];
  promptSource?: string;
  onUpdate?: (update: DispatchSubagentExecutionUpdate) => void;
}

export interface OrchestratorExecutionLike {
  output: string;
  exitCode: number;
  elapsed: number;
  timedOut?: boolean;
}

export interface OrchestratorSubagentExecutor {
  state: SubagentState;
  execute(params: OrchestratorSubagentExecutionParams): Promise<DispatchSubagentExecutionResult>;
}

export interface OrchestratorSubagentExecutorOptions {
  sessionsDir: string;
  state?: SubagentState;
  spawner?: SubagentSpawner;
}

export function buildCombinedSystemPrompt(params: {
  agentSystemPrompt: string;
  cognitiveToolContent: string;
  contextHeading?: string;
  contextBody?: string;
  extraSections?: string[];
}): string {
  const sections = [params.agentSystemPrompt.trim(), params.cognitiveToolContent.trim()];

  if (params.contextBody) {
    sections.push(`## ${params.contextHeading || "OBJECTIVE"}\n\n${params.contextBody}`);
  }

  if (params.extraSections) {
    for (const section of params.extraSections) {
      const trimmed = section.trim();
      if (trimmed) {
        sections.push(trimmed);
      }
    }
  }

  return sections.filter(Boolean).join("\n\n---\n\n");
}

export function createOrchestratorSubagentExecutor(
  options: OrchestratorSubagentExecutorOptions,
): OrchestratorSubagentExecutor {
  if (options.state && options.state.sessionsDir !== options.sessionsDir) {
    throw new Error(
      `Orchestrator subagent state.sessionsDir (${options.state.sessionsDir}) must match options.sessionsDir (${options.sessionsDir}).`,
    );
  }

  fs.mkdirSync(options.sessionsDir, { recursive: true });
  const state = options.state ?? createSubagentState(options.sessionsDir);

  return {
    state,
    async execute(params) {
      const runtime = createAscExecutionRuntime({
        sessionsDir: options.sessionsDir,
        state,
        modelProvider: () => params.model,
        spawner: options.spawner,
      });

      const result = await runtime.execute(
        {
          profile: "custom",
          objective: params.objective,
          tools: params.agentProfile.tools,
          systemPrompt: buildCombinedSystemPrompt({
            agentSystemPrompt: params.agentProfile.systemPrompt,
            cognitiveToolContent: params.cognitiveToolContent,
            contextHeading: params.contextHeading,
            contextBody: params.contextBody,
            extraSections: params.extraSections,
          }),
          name: params.sessionName ?? defaultSessionName(params),
          timeout: resolveTimeoutSeconds(params.timeoutSeconds),
          prompt_name: params.promptName,
          prompt_content: params.promptContent,
          prompt_tags: params.promptTags,
          prompt_source: params.promptSource,
        },
        { cwd: params.cwd },
        params.onUpdate,
      );

      return applyOrchestratorRuntimePolicy(result);
    },
  };
}

export function toExecutionLike(
  result: DispatchSubagentExecutionResult,
): OrchestratorExecutionLike {
  return {
    output: result.details.fullOutput ?? result.text,
    exitCode: result.details.exitCode ?? (result.ok ? 0 : 1),
    elapsed: result.details.elapsed ?? 0,
    timedOut: result.details.status === "timeout",
  };
}

function defaultSessionName(params: OrchestratorSubagentExecutionParams): string {
  const parts = [params.agentProfile.name, params.cognitiveToolName]
    .map((value) => value?.trim())
    .filter((value): value is string => Boolean(value));

  return parts.join("-") || params.agentProfile.name || "custom";
}

function resolveTimeoutSeconds(timeoutSeconds?: number): number {
  if (typeof timeoutSeconds === "number") {
    return timeoutSeconds;
  }

  return DEFAULT_PI_SUBAGENT_TIMEOUT_MS / 1000;
}

function applyOrchestratorRuntimePolicy(
  result: DispatchSubagentExecutionResult,
): DispatchSubagentExecutionResult {
  const fullOutput = result.details.fullOutput;
  if (typeof fullOutput !== "string") {
    return result;
  }

  const truncated = truncateOutput(fullOutput, DEFAULT_PI_OUTPUT_CHARS);
  if (!truncated.truncated) {
    return result;
  }

  return {
    ...result,
    details: {
      ...result.details,
      fullOutput: `${truncated.value}\n\n...[assistant output truncated]`,
    },
  };
}

function truncateOutput(value: string, maxChars: number): { value: string; truncated: boolean } {
  if (maxChars <= 0) {
    return { value: "", truncated: value.length > 0 };
  }

  if (value.length <= maxChars) {
    return { value, truncated: false };
  }

  return {
    value: value.slice(0, maxChars),
    truncated: true,
  };
}
