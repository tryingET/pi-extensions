import { join } from "node:path";
import type { InvariantIssue } from "./edge-contract-kernel.ts";
import {
  getContextRepoRoot,
  getContextSessionKey,
  type SessionScopedContext,
} from "./session-context.ts";
import {
  formatInvariantIssues,
  normalizeDispatchParams,
  validateDispatchParams,
  validateSubagentLifecycle,
} from "./subagent-edge-contract.ts";
import {
  type ResolvedSubagentExtensionSelection,
  resolveSubagentExtensionSelection,
} from "./subagent-extension-selection.ts";
import type {
  ResolvedSubagentModelSelection,
  SubagentModelSelectionSource,
} from "./subagent-model-selection.ts";
import { SUBAGENT_PROFILES } from "./subagent-profiles.ts";
import { applyPromptEnvelope } from "./subagent-prompt-envelope.ts";
import {
  createSubagentState,
  reserveSubagentExecutionSlot,
  type SubagentState,
} from "./subagent-session.ts";
import { reserveUniqueSessionName } from "./subagent-session-name.ts";
import {
  resolveSubagentSkillSelection,
  SubagentSkillSelectionError,
} from "./subagent-skill-selection.ts";
import {
  type AssistantStopReason,
  type ExecutionState,
  formatSubagentEnvPolicyIssues,
  type SubagentDef,
  type SubagentResult,
  type SubagentSpawner,
  type SubagentStatus,
  spawnSubagent,
  validateSubagentRequestEnv,
} from "./subagent-spawn.ts";

export type DispatchSubagentProfile = keyof typeof SUBAGENT_PROFILES | "custom";
export type DispatchSubagentStatus = "done" | "error" | "timed_out" | "aborted" | "spawning";
export type DispatchSubagentFailureKind =
  | "aborted"
  | "timed_out"
  | "assistant_protocol_error"
  | "assistant_protocol_parse_error"
  | "transport_error"
  | "extension_bootstrap_missing"
  | "env_policy_failed"
  | "skill_profile_failed"
  | "invariant_failed"
  | "unknown_profile"
  | "rate_limited"
  | "model_selection_failed";

export interface DispatchSubagentRequest {
  profile: DispatchSubagentProfile;
  objective: string;
  tools?: string;
  systemPrompt?: string;
  name?: string;
  timeout?: number;
  extensions?: string[];
  env?: Record<string, string>;
  skillProfile?: string;
  noSkills?: boolean;
  skills?: string[];
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
  displayOutput?: string;
  stderr?: string;
  outputTruncated?: boolean;
  timedOut?: boolean;
  aborted?: boolean;
  assistantStopReason?: AssistantStopReason;
  assistantErrorMessage?: string;
  executionState?: ExecutionState;
  requestedModel?: string;
  effectiveModel?: string;
  modelSelectionSource?: SubagentModelSelectionSource;
  modelSelectionWarning?: string;
  loadedExtensions?: string[];
  extensionWarnings?: string[];
  skillProfile?: string;
  loadedSkills?: string[];
  librarySkills?: string[];
  skillWarnings?: string[];
  skillRegistry?: string;
  prompt_name?: string;
  prompt_source?: string;
  prompt_tags?: string[];
  prompt_applied?: boolean;
  prompt_warning?: string;
  reason?: string;
  failureKind?: DispatchSubagentFailureKind;
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

export interface SubagentModelContext extends SessionScopedContext {
  cwd: string;
  model?: {
    provider?: unknown;
    id?: unknown;
  };
}

export type SubagentModelProviderResult = string | ResolvedSubagentModelSelection;

export interface AscExecutionRuntimeOptions {
  sessionsDir: string;
  modelProvider: (ctx?: SubagentModelContext) => SubagentModelProviderResult;
  spawner?: SubagentSpawner;
  state?: SubagentState;
  maxConcurrent?: number;
}

export interface AscExecutionRuntime {
  state: SubagentState;
  execute(
    request: DispatchSubagentRequest,
    ctx: SubagentModelContext,
    onUpdate?: (update: DispatchSubagentExecutionUpdate) => void,
    signal?: AbortSignal,
  ): Promise<DispatchSubagentExecutionResult>;
}

function toDispatchSubagentStatus(status: SubagentStatus): DispatchSubagentStatus {
  return status === "timeout" ? "timed_out" : status;
}

function getDispatchSubagentStatusLabel(status: DispatchSubagentStatus): string {
  return status === "timed_out" ? "timed out" : status;
}

function getDispatchSubagentFailureKind(params: {
  status: DispatchSubagentStatus;
  reason?: string;
  executionState?: ExecutionState;
}): DispatchSubagentFailureKind | undefined {
  switch (params.reason) {
    case "invariant_failed":
    case "unknown_profile":
    case "rate_limited":
      return params.reason;
  }

  switch (params.status) {
    case "done":
    case "spawning":
      return undefined;
    case "aborted":
      return "aborted";
    case "timed_out":
      return "timed_out";
    case "error":
      if (params.executionState?.protocol?.kind === "assistant_protocol_parse_error") {
        return "assistant_protocol_parse_error";
      }
      if (params.executionState?.protocol?.kind === "assistant_protocol") {
        return "assistant_protocol_error";
      }
      return "transport_error";
    default: {
      const exhaustive: never = params.status;
      return exhaustive;
    }
  }
}

function normalizeDispatchSubagentDisplayOutput(
  result: Pick<SubagentResult, "output" | "status" | "exitCode">,
): string {
  if (result.output.trim().length > 0) {
    return result.output;
  }

  switch (result.status) {
    case "done":
      return result.output;
    case "aborted":
      return "Subagent aborted.";
    case "timeout":
      return "Subagent timed out without output.";
    case "error":
      return `Subagent exited with code ${result.exitCode} without output.`;
    default: {
      const exhaustive: never = result.status;
      return exhaustive;
    }
  }
}

function truncateDispatchSubagentDisplayOutput(value: string, maxChars: number): string {
  return value.length > maxChars ? `${value.slice(0, maxChars)}\n\n... [truncated]` : value;
}

function getDispatchSubagentTextBody(result: DispatchSubagentExecutionResult): string {
  const separatorIndex = result.text.indexOf("\n\n");
  return separatorIndex >= 0 ? result.text.slice(separatorIndex + 2) : result.text;
}

function normalizeModelProviderResult(
  result: SubagentModelProviderResult,
): ResolvedSubagentModelSelection {
  if (typeof result === "string") {
    const model = result.trim();
    if (model.length === 0) {
      throw new Error("model provider returned an empty model string");
    }

    return {
      requestedModel: model,
      effectiveModel: model,
      source: "custom",
    };
  }

  const effectiveModel = result.effectiveModel.trim();
  const requestedModel = (result.requestedModel ?? effectiveModel).trim();

  if (effectiveModel.length === 0) {
    throw new Error("model provider returned an empty effective model string");
  }

  if (requestedModel.length === 0) {
    throw new Error("model provider returned an empty requested model string");
  }

  return {
    requestedModel,
    effectiveModel,
    source: result.source,
    warning: result.warning,
  };
}

function formatExtensionSelectionWarnings(selection: ResolvedSubagentExtensionSelection): string {
  if (selection.warnings.length === 0) {
    return "";
  }

  return `\nExtension note: ${selection.warnings.join(" ")}`;
}

function formatSkillSelectionWarnings(selection: { skillWarnings: string[] }): string {
  if (selection.skillWarnings.length === 0) {
    return "";
  }

  return `\nSkill note: ${selection.skillWarnings.join(" ")}`;
}

export function getDispatchSubagentDisplayOutput(result: DispatchSubagentExecutionResult): string {
  if (typeof result.details.displayOutput === "string") {
    return result.details.displayOutput;
  }

  if (
    typeof result.details.fullOutput === "string" &&
    result.details.fullOutput.trim().length > 0
  ) {
    return result.details.fullOutput;
  }

  return getDispatchSubagentTextBody(result);
}

export async function executeDispatchSubagentRequest(options: {
  request: DispatchSubagentRequest;
  state: SubagentState;
  modelProvider: (ctx?: SubagentModelContext) => SubagentModelProviderResult;
  ctx: SubagentModelContext;
  onUpdate?: (update: DispatchSubagentExecutionUpdate) => void;
  signal?: AbortSignal;
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
    extensions,
    env,
    skillProfile,
    noSkills,
    skills,
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
        failureKind: "invariant_failed",
        invariants: invariants.issues,
        status: "error",
      },
    };
  }

  const envPolicy = validateSubagentRequestEnv(env);

  if (!envPolicy.ok) {
    const output = formatSubagentEnvPolicyIssues(envPolicy.issues);
    return {
      ok: false,
      text: output,
      details: {
        reason: "env_policy_failed",
        failureKind: "env_policy_failed",
        invariants: envPolicy.issues,
        status: "error",
        activeCount: options.state.activeCount,
        maxConcurrent: options.state.maxConcurrent,
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
        failureKind: "unknown_profile",
        status: "error",
      },
    };
  }

  const executionSlot = reserveSubagentExecutionSlot(options.state);
  if (!executionSlot) {
    return {
      ok: false,
      text: `Maximum concurrent subagents reached (${options.state.maxConcurrent}). Wait for existing subagents to complete.`,
      details: {
        reason: "rate_limited",
        failureKind: "rate_limited",
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

  const spawner = options.spawner ?? spawnSubagent;
  let selectedModel: ResolvedSubagentModelSelection;
  try {
    selectedModel = normalizeModelProviderResult(options.modelProvider(options.ctx));
  } catch (error) {
    executionSlot.release();
    const message = error instanceof Error ? error.message : String(error);
    const output = `Model selection failed before subagent spawn: ${message}`;
    return {
      ok: false,
      text: `✗ [${profile}] error before spawn\n\n${output}`,
      details: {
        profile: profile as DispatchSubagentProfile,
        objective: safeObjective,
        status: "error",
        reason: "model_selection_failed",
        failureKind: "model_selection_failed",
        elapsed: 0,
        fullOutput: output,
        displayOutput: output,
        activeCount: options.state.activeCount,
        maxConcurrent: options.state.maxConcurrent,
      },
    };
  }
  const extensionSelection = resolveSubagentExtensionSelection({
    requestedExtensions: extensions,
    ctx: options.ctx,
  });

  let skillSelection: Awaited<ReturnType<typeof resolveSubagentSkillSelection>>;
  try {
    skillSelection = await resolveSubagentSkillSelection({
      requestedSkillProfile: skillProfile,
      requestedNoSkills: noSkills,
      requestedSkills: skills,
      ctx: options.ctx,
    });
  } catch (error) {
    executionSlot.release();
    const message = error instanceof Error ? error.message : String(error);
    return {
      ok: false,
      text: `Subagent child runtime skill-profile resolution failed: ${message}`,
      details: {
        profile: profile as DispatchSubagentProfile,
        objective: safeObjective,
        requestedModel: selectedModel.requestedModel,
        effectiveModel: selectedModel.effectiveModel,
        modelSelectionSource: selectedModel.source,
        modelSelectionWarning: selectedModel.warning,
        status: "error",
        reason:
          error instanceof SubagentSkillSelectionError ? error.reason : "skill_profile_failed",
        failureKind: "skill_profile_failed",
      },
    };
  }

  if (extensionSelection.missingRequired.length > 0) {
    executionSlot.release();
    return {
      ok: false,
      text: [
        "Subagent child runtime is missing required extension bootstrap.",
        ...extensionSelection.missingRequired.map((item) => `- ${item}`),
      ].join("\n"),
      details: {
        profile: profile as DispatchSubagentProfile,
        objective: safeObjective,
        requestedModel: selectedModel.requestedModel,
        effectiveModel: selectedModel.effectiveModel,
        modelSelectionSource: selectedModel.source,
        modelSelectionWarning: selectedModel.warning,
        loadedExtensions: extensionSelection.extensions,
        extensionWarnings: extensionSelection.warnings,
        status: "error",
        failureKind: "extension_bootstrap_missing",
      },
    };
  }
  let sessionReservation:
    | {
        sessionName: string;
        release: () => void;
      }
    | undefined;
  let result: SubagentResult;
  try {
    sessionReservation = reserveUniqueSessionName(
      name || profile,
      options.state.sessionsDir,
      options.state.reservedSessionNames,
      {
        useInMemoryReservation: reservationsEnabled,
        useFileLockReservation,
      },
    );

    const timeoutMs = typeof timeout === "number" ? timeout * 1000 : undefined;
    const parentSessionKey = getContextSessionKey(options.ctx);
    const parentRepoRoot = getContextRepoRoot(options.ctx);

    const def: SubagentDef = {
      name: sessionReservation.sessionName,
      objective: safeObjective,
      tools: tools || profileDef?.tools || "read,bash",
      systemPrompt: promptEnvelope.systemPrompt,
      sessionFile: join(options.state.sessionsDir, `${sessionReservation.sessionName}.json`),
      timeout: timeoutMs,
      executionSlotReserved: true,
      parentSessionKey,
      parentRepoRoot,
      extensionSources: extensionSelection.extensions,
      noSkills: skillSelection.noSkills,
      skillSources: skillSelection.skillSources,
      env: envPolicy.env,
    };

    options.onUpdate?.({
      text: `Dispatching ${profile} subagent...`,
      details: {
        profile: profile as DispatchSubagentProfile,
        objective: safeObjective,
        status: "spawning",
        ...(selectedModel.warning
          ? {
              requestedModel: selectedModel.requestedModel,
              effectiveModel: selectedModel.effectiveModel,
              modelSelectionSource: selectedModel.source,
              modelSelectionWarning: selectedModel.warning,
            }
          : {}),
        ...(extensionSelection.extensions.length > 0
          ? { loadedExtensions: extensionSelection.extensions }
          : {}),
        ...(extensionSelection.warnings.length > 0
          ? { extensionWarnings: extensionSelection.warnings }
          : {}),
        ...(skillSelection.skillProfile ? { skillProfile: skillSelection.skillProfile } : {}),
        ...(skillSelection.loadedSkills.length > 0
          ? { loadedSkills: skillSelection.loadedSkills }
          : {}),
        ...(skillSelection.librarySkills.length > 0
          ? { librarySkills: skillSelection.librarySkills }
          : {}),
        ...(skillSelection.skillWarnings.length > 0
          ? { skillWarnings: skillSelection.skillWarnings }
          : {}),
        ...(skillSelection.skillRegistry ? { skillRegistry: skillSelection.skillRegistry } : {}),
      },
    });

    result = await spawner(
      def,
      selectedModel.effectiveModel,
      options.ctx,
      options.state,
      options.signal,
    );
  } catch (error) {
    result = {
      output: `Error spawning subagent: ${error instanceof Error ? error.message : String(error)}`,
      exitCode: 1,
      elapsed: 0,
      status: "error",
    };
  } finally {
    sessionReservation?.release();
    executionSlot.release();
  }

  const lifecycleInvariants = validateSubagentLifecycle(options.state);

  if (!lifecycleInvariants.ok) {
    return {
      ok: false,
      text: formatInvariantIssues("Subagent lifecycle invariant failed", lifecycleInvariants),
      details: {
        reason: "invariant_failed",
        failureKind: "invariant_failed",
        profile: profile as DispatchSubagentProfile,
        objective: safeObjective,
        invariants: lifecycleInvariants.issues,
        status: "error",
      },
    };
  }

  const displayOutput = normalizeDispatchSubagentDisplayOutput(result);
  const truncated = truncateDispatchSubagentDisplayOutput(displayOutput, 8000);

  const status = toDispatchSubagentStatus(result.status);
  const icon = status === "done" ? "✓" : "✗";
  const summary = `${icon} [${profile}] ${getDispatchSubagentStatusLabel(status)} in ${Math.round(result.elapsed / 1000)}s`;
  const modelSelectionWarning = selectedModel.warning
    ? `\nModel selection note: ${selectedModel.warning}`
    : "";
  const extensionSelectionWarning = formatExtensionSelectionWarnings(extensionSelection);
  const skillSelectionWarning = formatSkillSelectionWarnings(skillSelection);
  const promptWarning = promptEnvelope.prompt_warning
    ? `\nPrompt envelope warning: ${promptEnvelope.prompt_warning}`
    : "";
  const failureKind = getDispatchSubagentFailureKind({
    status,
    executionState: result.executionState,
  });

  return {
    ok: status === "done",
    text: `${summary}${modelSelectionWarning}${extensionSelectionWarning}${skillSelectionWarning}${promptWarning}\n\n${truncated}`,
    details: {
      profile: profile as DispatchSubagentProfile,
      objective: safeObjective,
      elapsed: result.elapsed,
      exitCode: result.exitCode,
      fullOutput: result.output,
      displayOutput,
      stderr: result.stderr,
      outputTruncated: result.outputTruncated,
      timedOut: result.timedOut,
      aborted: result.aborted,
      assistantStopReason: result.assistantStopReason,
      assistantErrorMessage: result.assistantErrorMessage,
      executionState: result.executionState,
      requestedModel: selectedModel.requestedModel,
      effectiveModel: selectedModel.effectiveModel,
      modelSelectionSource: selectedModel.source,
      modelSelectionWarning: selectedModel.warning,
      loadedExtensions: extensionSelection.extensions,
      extensionWarnings: extensionSelection.warnings,
      skillProfile: skillSelection.skillProfile,
      loadedSkills: skillSelection.loadedSkills,
      librarySkills: skillSelection.librarySkills,
      skillWarnings: skillSelection.skillWarnings,
      skillRegistry: skillSelection.skillRegistry,
      prompt_name: promptEnvelope.prompt_name,
      prompt_source: promptEnvelope.prompt_source,
      prompt_tags: promptEnvelope.prompt_tags,
      prompt_applied: promptEnvelope.prompt_applied,
      prompt_warning: promptEnvelope.prompt_warning,
      status,
      failureKind,
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
    execute(request, ctx, onUpdate, signal) {
      return executeDispatchSubagentRequest({
        request,
        state,
        modelProvider: options.modelProvider,
        ctx,
        onUpdate,
        signal,
        spawner: options.spawner,
      });
    },
  };
}
