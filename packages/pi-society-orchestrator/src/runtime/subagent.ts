import * as fs from "node:fs";
import * as path from "node:path";
import {
  ASC_EXECUTION_OBSERVATION_EVENT,
  type AscExecutionObservation,
  type AscExecutionObservationContext,
  createAscExecutionRuntime,
  createSubagentState,
  type DispatchEffectReceipt,
  type DispatchSubagentExecutionResult,
  type DispatchSubagentExecutionUpdate,
  type DispatchSubagentFailureKind,
  getDispatchSubagentDisplayOutput,
  projectAscExecutionFailure,
  projectAscExecutionGroupTerminal,
  projectAscExecutionResult,
  projectAscExecutionUpdate,
  type SubagentModelContext,
  type SubagentSpawner,
  type SubagentState,
} from "@tryinget/pi-autonomous-session-control/execution";
import type { AgentDef } from "./agent-profiles.ts";
import type { ExecutionLike } from "./execution-status.ts";

export { ASC_EXECUTION_OBSERVATION_EVENT, projectAscExecutionGroupTerminal };
export type { AscExecutionObservation, AscExecutionObservationContext };

/**
 * Consumer-side adapter over ASC's public execution seam.
 * Keep execution ownership truth in the boundary packet / ADR / ASC README; this module only
 * preserves orchestrator-local prompt composition and output policy.
 */
// Absolute emergency deadman; semantic progress is supervised separately by the observer.
const DEFAULT_PI_SUBAGENT_TIMEOUT_MS = positiveIntegerOrFallback(
  process.env.PI_ORCH_SUBAGENT_TIMEOUT_MS,
  4 * 60 * 60 * 1000,
);
const DEFAULT_PI_OUTPUT_CHARS =
  Number.parseInt(process.env.PI_ORCH_SUBAGENT_OUTPUT_CHARS || "", 10) || 64_000;
const verifiedEffectReceiptBrand: unique symbol = Symbol("verifiedEffectReceipt");
const verifiedEffectReceipts = new WeakSet<object>();

function positiveIntegerOrFallback(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(value || "", 10);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
}

export type VerifiedDispatchEffectReceipt = DispatchEffectReceipt & {
  readonly [verifiedEffectReceiptBrand]: true;
};

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
  extensions?: string[];
  env?: Record<string, string>;
  promptName?: string;
  promptContent?: string;
  promptTags?: string[];
  promptSource?: string;
  effectCorrelationId?: string;
  observation?: AscExecutionObservationContext;
  onUpdate?: (update: DispatchSubagentExecutionUpdate) => void;
  signal?: AbortSignal;
}

export interface OrchestratorExecutionLike extends ExecutionLike {
  output: string;
  elapsed: number;
  stderr?: string;
  outputTruncated?: boolean;
  failureKind?: DispatchSubagentFailureKind;
  effectReceipt?: VerifiedDispatchEffectReceipt;
}

export interface OrchestratorSubagentExecutor {
  state: SubagentState;
  execute(params: OrchestratorSubagentExecutionParams): Promise<DispatchSubagentExecutionResult>;
}

export interface OrchestratorSubagentExecutorOptions {
  sessionsDir: string;
  state?: SubagentState;
  spawner?: SubagentSpawner;
  onObservation?: (observation: AscExecutionObservation) => void;
}

function emitObservation(
  sink: ((observation: AscExecutionObservation) => void) | undefined,
  observation: AscExecutionObservation | undefined,
): void {
  if (!sink || !observation) return;
  try {
    sink(observation);
  } catch {
    // Observation is best-effort and must not perturb ASC-owned execution truth.
  }
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

      let result: DispatchSubagentExecutionResult;
      try {
        result = await runtime.execute(
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
            extensions: params.extensions,
            env: params.env,
            prompt_name: params.promptName,
            prompt_content: params.promptContent,
            prompt_tags: params.promptTags,
            prompt_source: params.promptSource,
            effectCorrelationId: params.effectCorrelationId,
          },
          buildAscExecutionContext(params.cwd, params.model),
          (update) => {
            if (params.observation) {
              emitObservation(
                options.onObservation,
                projectAscExecutionUpdate(update, params.observation),
              );
            }
            params.onUpdate?.(update);
          },
          params.signal,
        );
      } catch (error) {
        if (params.observation) {
          emitObservation(
            options.onObservation,
            projectAscExecutionFailure(params.observation, "execution_rejected"),
          );
        }
        throw error;
      }

      if (params.observation) {
        emitObservation(
          options.onObservation,
          projectAscExecutionResult(result, params.observation),
        );
      }
      return applyOrchestratorRuntimePolicy(result);
    },
  };
}

export function toExecutionLike(
  result: DispatchSubagentExecutionResult,
  trustedSessionsDir?: string,
): OrchestratorExecutionLike {
  const effectReceipt = trustedSessionsDir
    ? verifyDispatchEffectReceipt(result, trustedSessionsDir)
    : undefined;
  const receiptWriteFailed = result.details.failureKind === "effect_receipt_write_failed";
  const receiptFailureMessage =
    "ASC effect receipt could not be persisted; execution effects remain indeterminate.";
  return {
    output: getDispatchSubagentDisplayOutput(result),
    exitCode: receiptWriteFailed ? 1 : (result.details.exitCode ?? (result.ok ? 0 : 1)),
    elapsed: result.details.elapsed ?? 0,
    stderr: result.details.stderr,
    outputTruncated: result.details.outputTruncated,
    timedOut: result.details.timedOut ?? result.details.status === "timed_out",
    aborted: result.details.aborted ?? result.details.status === "aborted",
    assistantStopReason: receiptWriteFailed ? "error" : result.details.assistantStopReason,
    assistantErrorMessage: receiptWriteFailed
      ? receiptFailureMessage
      : result.details.assistantErrorMessage,
    executionState: receiptWriteFailed
      ? {
          transport: {
            kind: "transport",
            exitCode: 1,
            aborted: false,
            timedOut: false,
          },
          protocol: {
            kind: "assistant_protocol",
            stopReason: "error",
            errorMessage: receiptFailureMessage,
          },
        }
      : result.details.executionState,
    failureKind: result.details.failureKind,
    effectReceipt,
  };
}

export function verifyDispatchEffectReceipt(
  result: DispatchSubagentExecutionResult,
  trustedSessionsDir: string,
): VerifiedDispatchEffectReceipt | undefined {
  const returned = result.details.effectReceipt;
  if (
    !returned ||
    returned.schema !== "asc.dispatch_effect_receipt.v1" ||
    returned.dispatchId !== result.details.dispatchId ||
    returned.attemptId !== result.details.attemptId ||
    typeof result.details.sessionName !== "string" ||
    !result.details.sessionName ||
    returned.sessionName !== result.details.sessionName ||
    returned.consumerCorrelationId !== result.details.effectCorrelationId ||
    !["settled", "confirmed_no_effects", "effect_indeterminate"].includes(returned.disposition) ||
    !Number.isFinite(Date.parse(returned.recordedAt))
  ) {
    return undefined;
  }

  try {
    const root = fs.realpathSync(trustedSessionsDir);
    const candidate = path.resolve(returned.receiptPath);
    if (candidate === root || !candidate.startsWith(`${root}${path.sep}`)) return undefined;
    const expectedName = `${result.details.sessionName}.${returned.attemptId}.effect-receipt.json`;
    if (path.basename(candidate) !== expectedName) return undefined;
    const lstat = fs.lstatSync(candidate);
    if (
      lstat.isSymbolicLink() ||
      !lstat.isFile() ||
      lstat.nlink !== 1 ||
      lstat.size > 64 * 1024 ||
      (lstat.mode & 0o077) !== 0 ||
      (typeof process.getuid === "function" && lstat.uid !== process.getuid())
    ) {
      return undefined;
    }
    const realCandidate = fs.realpathSync(candidate);
    if (!realCandidate.startsWith(`${root}${path.sep}`)) return undefined;

    const descriptor = fs.openSync(candidate, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
    let persistedText: string;
    try {
      const stat = fs.fstatSync(descriptor);
      if (
        !stat.isFile() ||
        stat.nlink !== 1 ||
        stat.size !== lstat.size ||
        stat.dev !== lstat.dev ||
        stat.ino !== lstat.ino
      ) {
        return undefined;
      }
      const bytes = Buffer.alloc(stat.size);
      let offset = 0;
      while (offset < bytes.length) {
        const count = fs.readSync(descriptor, bytes, offset, bytes.length - offset, offset);
        if (count === 0) return undefined;
        offset += count;
      }
      persistedText = bytes.toString("utf8");
    } finally {
      fs.closeSync(descriptor);
    }

    const persisted = JSON.parse(persistedText) as Record<string, unknown>;
    const expectedKeys = [
      "attemptId",
      "consumerCorrelationId",
      "dispatchId",
      "disposition",
      "receiptPath",
      "recordedAt",
      "schema",
      "sessionName",
    ];
    if (JSON.stringify(Object.keys(persisted).sort()) !== JSON.stringify(expectedKeys)) {
      return undefined;
    }
    for (const key of expectedKeys) {
      if (persisted[key] !== returned[key as keyof DispatchEffectReceipt]) return undefined;
    }
    verifiedEffectReceipts.add(returned);
    return returned as VerifiedDispatchEffectReceipt;
  } catch {
    return undefined;
  }
}

export function isVerifiedDispatchEffectReceipt(
  receipt: DispatchEffectReceipt | undefined,
): receipt is VerifiedDispatchEffectReceipt {
  return Boolean(receipt && verifiedEffectReceipts.has(receipt));
}

function buildAscExecutionContext(cwd: string, model: string): SubagentModelContext {
  const parsedModel = parseProviderModel(model);
  return parsedModel ? { cwd, model: parsedModel } : { cwd };
}

function parseProviderModel(model: string): { provider: string; id: string } | undefined {
  const trimmed = model.trim();
  const separatorIndex = trimmed.indexOf("/");
  if (separatorIndex <= 0 || separatorIndex >= trimmed.length - 1) {
    return undefined;
  }

  return {
    provider: trimmed.slice(0, separatorIndex),
    id: trimmed.slice(separatorIndex + 1),
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
  const displayOutput =
    typeof result.details.displayOutput === "string"
      ? result.details.displayOutput
      : result.details.fullOutput;
  if (typeof displayOutput !== "string") {
    return result;
  }

  const truncatedDisplayOutput = truncateOutput(displayOutput, DEFAULT_PI_OUTPUT_CHARS);
  if (!truncatedDisplayOutput.truncated) {
    return result;
  }

  return {
    ...result,
    details: {
      ...result.details,
      fullOutput:
        typeof result.details.fullOutput === "string"
          ? `${truncateOutput(result.details.fullOutput, DEFAULT_PI_OUTPUT_CHARS).value}\n\n...[assistant output truncated]`
          : result.details.fullOutput,
      displayOutput: `${truncatedDisplayOutput.value}\n\n...[assistant output truncated]`,
      outputTruncated: true,
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
