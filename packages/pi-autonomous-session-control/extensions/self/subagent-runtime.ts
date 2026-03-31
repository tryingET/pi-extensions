import { join } from "node:path";
import type { InvariantIssue } from "./edge-contract-kernel.ts";
import {
  formatInvariantIssues,
  normalizeDispatchParams,
  validateDispatchParams,
  validateSubagentLifecycle,
} from "./subagent-edge-contract.ts";
import { SUBAGENT_PROFILES } from "./subagent-profiles.ts";
import { applyPromptEnvelope } from "./subagent-prompt-envelope.ts";
import { canSpawnSubagent, createSubagentState, type SubagentState } from "./subagent-session.ts";
import { reserveUniqueSessionName } from "./subagent-session-name.ts";
import {
  type SubagentDef,
  type SubagentResult,
  type SubagentSpawner,
  spawnSubagent,
} from "./subagent-spawn.ts";

export type DispatchSubagentProfile = keyof typeof SUBAGENT_PROFILES | "custom";
export type DispatchSubagentStatus = "done" | "error" | "timeout" | "spawning";

export interface DispatchSubagentRequest {
  profile: DispatchSubagentProfile;
  objective: string;
  tools?: string;
  systemPrompt?: string;
  name?: string;
  timeout?: number;
  prompt_name?: string;
  prompt_content?: string;
  prompt_tags?: string[];
  prompt_source?: string;
}

export interface DispatchSubagentDetails {
  profile?: DispatchSubagentProfile;
  objective?: string;
  status?: DispatchSubagentStatus;
  elapsed?: number;
  exitCode?: number;
  fullOutput?: string;
  prompt_name?: string;
  prompt_source?: string;
  prompt_tags?: string[];
  prompt_applied?: boolean;
  prompt_warning?: string;
  reason?: string;
  invariants?: InvariantIssue[];
  activeCount?: number;
  maxConcurrent?: number;
}

export interface DispatchSubagentExecutionUpdate {
  text: string;
  details?: DispatchSubagentDetails;
}

export interface DispatchSubagentExecutionResult {
  text: string;
  details: DispatchSubagentDetails;
  ok: boolean;
}

export interface AscExecutionRuntimeOptions {
  sessionsDir: string;
  modelProvider: () => string;
  spawner?: SubagentSpawner;
  state?: SubagentState;
  maxConcurrent?: number;
}

export interface AscExecutionRuntime {
  state: SubagentState;
  execute(
    request: DispatchSubagentRequest,
    ctx: { cwd: string },
    onUpdate?: (update: DispatchSubagentExecutionUpdate) => void,
  ): Promise<DispatchSubagentExecutionResult>;
}

export async function executeDispatchSubagentRequest(options: {
  request: DispatchSubagentRequest;
  state: SubagentState;
  modelProvider: () => string;
  ctx: { cwd: string };
  onUpdate?: (update: DispatchSubagentExecutionUpdate) => void;
  spawner?: SubagentSpawner;
}): Promise<DispatchSubagentExecutionResult> {
  const normalizedParams = normalizeDispatchParams(options.request);
  const {
    profile,
    objective,
    tools,
    systemPrompt,
    name,
    timeout,
    prompt_name,
    prompt_content,
    prompt_tags,
    prompt_source,
  } = normalizedParams;

  const invariants = validateDispatchParams(normalizedParams);

  if (!invariants.ok) {
    return {
      ok: false,
      text: formatInvariantIssues("Invalid dispatch_subagent input", invariants),
      details: {
        reason: "invariant_failed",
        invariants: invariants.issues,
        status: "error",
      },
    };
  }

  const safeObjective = objective as string;
  const profileDef = SUBAGENT_PROFILES[profile];
  if (!profileDef && profile !== "custom") {
    return {
      ok: false,
      text: `Unknown profile: ${profile}. Available: ${Object.keys(SUBAGENT_PROFILES).join(", ")}, custom`,
      details: {
        reason: "unknown_profile",
        status: "error",
      },
    };
  }

  if (!canSpawnSubagent(options.state)) {
    return {
      ok: false,
      text: `Maximum concurrent subagents reached (${options.state.maxConcurrent}). Wait for existing subagents to complete.`,
      details: {
        reason: "rate_limited",
        activeCount: options.state.activeCount,
        maxConcurrent: options.state.maxConcurrent,
        status: "error",
      },
    };
  }

  const baseSystemPrompt = systemPrompt || profileDef?.systemPrompt;
  const promptEnvelope = applyPromptEnvelope(baseSystemPrompt, {
    prompt_name,
    prompt_content,
    prompt_tags,
    prompt_source,
  });

  const reservationsEnabled =
    process.env.PI_SUBAGENT_RESERVE_SESSION_NAMES?.trim().toLowerCase() !== "false";
  const useFileLockReservation =
    reservationsEnabled &&
    process.env.PI_SUBAGENT_FILE_LOCK_SESSION_NAMES?.trim().toLowerCase() !== "false";

  const sessionReservation = reserveUniqueSessionName(
    name || profile,
    options.state.sessionsDir,
    options.state.reservedSessionNames,
    {
      useInMemoryReservation: reservationsEnabled,
      useFileLockReservation,
    },
  );

  const timeoutMs = typeof timeout === "number" ? timeout * 1000 : undefined;

  const def: SubagentDef = {
    name: sessionReservation.sessionName,
    objective: safeObjective,
    tools: tools || profileDef?.tools || "read,bash",
    systemPrompt: promptEnvelope.systemPrompt,
    sessionFile: join(options.state.sessionsDir, `${sessionReservation.sessionName}.json`),
    timeout: timeoutMs,
  };

  options.onUpdate?.({
    text: `Dispatching ${profile} subagent...`,
    details: {
      profile: profile as DispatchSubagentProfile,
      objective: safeObjective,
      status: "spawning",
    },
  });

  const spawner = options.spawner ?? spawnSubagent;
  let result: SubagentResult;
  try {
    result = await spawner(def, options.modelProvider(), options.ctx, options.state);
  } catch (error) {
    result = {
      output: `Error spawning subagent: ${error instanceof Error ? error.message : String(error)}`,
      exitCode: 1,
      elapsed: 0,
      status: "error",
    };
  } finally {
    sessionReservation.release();
  }

  const lifecycleInvariants = validateSubagentLifecycle(options.state);

  if (!lifecycleInvariants.ok) {
    return {
      ok: false,
      text: formatInvariantIssues("Subagent lifecycle invariant failed", lifecycleInvariants),
      details: {
        reason: "invariant_failed",
        profile: profile as DispatchSubagentProfile,
        objective: safeObjective,
        invariants: lifecycleInvariants.issues,
        status: "error",
      },
    };
  }

  const normalizedOutput =
    result.output.trim().length > 0
      ? result.output
      : result.status === "error"
        ? `Subagent exited with code ${result.exitCode} without output.`
        : result.output;
  const truncated =
    normalizedOutput.length > 8000
      ? `${normalizedOutput.slice(0, 8000)}\n\n... [truncated]`
      : normalizedOutput;

  const icon = result.status === "done" ? "✓" : "✗";
  const summary = `${icon} [${profile}] ${result.status} in ${Math.round(result.elapsed / 1000)}s`;
  const promptWarning = promptEnvelope.prompt_warning
    ? `\nPrompt envelope warning: ${promptEnvelope.prompt_warning}`
    : "";

  return {
    ok: result.status === "done",
    text: `${summary}${promptWarning}\n\n${truncated}`,
    details: {
      profile: profile as DispatchSubagentProfile,
      objective: safeObjective,
      elapsed: result.elapsed,
      exitCode: result.exitCode,
      fullOutput: result.output,
      prompt_name: promptEnvelope.prompt_name,
      prompt_source: promptEnvelope.prompt_source,
      prompt_tags: promptEnvelope.prompt_tags,
      prompt_applied: promptEnvelope.prompt_applied,
      prompt_warning: promptEnvelope.prompt_warning,
      status: result.status,
    },
  };
}

export function createAscExecutionRuntime(
  options: AscExecutionRuntimeOptions,
): AscExecutionRuntime {
  if (options.state && options.state.sessionsDir !== options.sessionsDir) {
    throw new Error(
      `AscExecutionRuntime state.sessionsDir (${options.state.sessionsDir}) must match options.sessionsDir (${options.sessionsDir}).`,
    );
  }

  const state =
    options.state ??
    createSubagentState(options.sessionsDir, { maxConcurrent: options.maxConcurrent });

  return {
    state,
    execute(request, ctx, onUpdate) {
      return executeDispatchSubagentRequest({
        request,
        state,
        modelProvider: options.modelProvider,
        ctx,
        onUpdate,
        spawner: options.spawner,
      });
    },
  };
}
