/**
summary: "Loads workstation inference contracts, registers provider models, streams completions, and exposes status and refresh commands."
read_when:
  - "Changing workstation contract validation, health checks, provider registration, model streaming, or lane-op commands."
*/
import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import {
  type Api,
  type AssistantMessageEventStream,
  type Context,
  createAssistantMessageEventStream,
  type Model,
  type SimpleStreamOptions,
  streamSimpleOpenAICompletions,
} from "@earendil-works/pi-ai/compat";
import type { ExtensionAPI, ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import { type Static, Type } from "typebox";
import { Value } from "typebox/value";
import {
  type ArmedAudio,
  type AudioInputPolicy,
  armAudio,
  clearArmedAudio,
  hasAudioMarker,
  latestUserAudioMarker,
  readBoundedAudio,
  transformAudioPayload,
} from "./workstation-audio.ts";
import {
  clearSchedulerHandoff,
  completeSchedulerHandoff,
  consumeSchedulerHandoff,
  parseGovernedAudioSendArgs,
  quarantineSchedulerHandoff,
  readSchedulerHandoff,
} from "./workstation-scheduler.ts";

type NotifyLevel = "info" | "warning" | "error";

const OptionalString = Type.Optional(Type.String());
const OptionalPositiveNumber = Type.Optional(Type.Number({ exclusiveMinimum: 0 }));
const ThinkingLevelMapSchema = Type.Object(
  {
    minimal: Type.Optional(Type.Union([Type.String(), Type.Null()])),
    low: Type.Optional(Type.Union([Type.String(), Type.Null()])),
    medium: Type.Optional(Type.Union([Type.String(), Type.Null()])),
    high: Type.Optional(Type.Union([Type.String(), Type.Null()])),
    xhigh: Type.Optional(Type.Union([Type.String(), Type.Null()])),
  },
  { additionalProperties: false },
);
const InputKindSchema = Type.Union([Type.Literal("text"), Type.Literal("image")]);
const NativeInputKindSchema = Type.Union([
  Type.Literal("text"),
  Type.Literal("image"),
  Type.Literal("audio"),
]);
const AudioFormatSchema = Type.Union([
  Type.Literal("wav"),
  Type.Literal("mp3"),
  Type.Literal("flac"),
]);
const AudioInputSchema = Type.Object(
  {
    request_format: Type.Literal("openai-chat-input-audio"),
    formats: Type.Array(AudioFormatSchema, { minItems: 1 }),
    max_bytes: Type.Number({ minimum: 1 }),
    max_encoded_bytes: Type.Number({ minimum: 1 }),
    transport: Type.Literal("inline-base64"),
    authorization_mode: Type.Literal("external-scheduler-claim-required"),
  },
  { additionalProperties: false },
);
const ContractModelSchema = Type.Object(
  {
    id: OptionalString,
    pi_model_id: OptionalString,
    name: OptionalString,
    upstream_model: OptionalString,
    context_window: OptionalPositiveNumber,
    max_tokens: OptionalPositiveNumber,
    reasoning: Type.Optional(Type.Boolean()),
    thinking_level_map: Type.Optional(ThinkingLevelMapSchema),
    thinking_format: Type.Optional(
      Type.Union([Type.Literal("qwen"), Type.Literal("qwen-chat-template")]),
    ),
    input: Type.Optional(Type.Array(InputKindSchema, { minItems: 1 })),
    native_input_modalities: Type.Optional(Type.Array(NativeInputKindSchema, { minItems: 1 })),
    audio_input: Type.Optional(AudioInputSchema),
  },
  { additionalProperties: true },
);
const WorkstationInferenceContractSchema = Type.Object(
  {
    schema_version: Type.Literal(1),
    authority: OptionalString,
    family: OptionalString,
    surface: OptionalString,
    generated_at: OptionalString,
    stale_after_seconds: OptionalPositiveNumber,
    refresh_after_seconds: OptionalPositiveNumber,
    provider_id: OptionalString,
    provider_name: OptionalString,
    base_url: Type.String({ minLength: 1 }),
    health_url: OptionalString,
    api_key_env: OptionalString,
    api_key: OptionalString,
    recovery_hint: OptionalString,
    models: Type.Array(ContractModelSchema, { minItems: 1 }),
  },
  { additionalProperties: true },
);

type ContractModel = Static<typeof ContractModelSchema>;
type WorkstationInferenceContract = Static<typeof WorkstationInferenceContractSchema>;

type LoadedContract = {
  contract: WorkstationInferenceContract;
  source: string;
};

type Status = "ok" | "missing" | "invalid" | "unhealthy";

type ContractStatus = {
  status: Status;
  source?: string;
  summary: string;
  detail?: string;
  contract?: WorkstationInferenceContract;
};

const DEFAULT_PROVIDER_ID = "workstation-inference";
const DEFAULT_PROVIDER_NAME = "Workstation Inference";
const WORKSTATION_API_ID = "workstation-inference";
const DEFAULT_CONTEXT_WINDOW = 131_072;
const DEFAULT_MAX_TOKENS = 16_384;
const DEFAULT_TIMEOUT_MS = 1_500;
const MAX_HEALTH_TIMEOUT_MS = 30_000;
const DEFAULT_HEALTH_CACHE_TTL_MS = 5_000;
const MAX_HEALTH_CACHE_TTL_MS = 60_000;
const HEALTH_TIMEOUT_ENV = "PI_WORKSTATION_INFERENCE_HEALTH_TIMEOUT_MS";
const HEALTH_CACHE_TTL_ENV = "PI_WORKSTATION_INFERENCE_HEALTH_CACHE_TTL_MS";
const healthCache = new Map<string, { expiresAt: number; unhealthy?: string }>();
const DEFAULT_API_KEY = "workstation-local";
const CONTRACT_ENV = "PI_WORKSTATION_INFERENCE_CONTRACT";
const CANARY_CONTRACT_ENV = "PI_WORKSTATION_INFERENCE_CANARY_CONTRACT";
const INKLING_CONTRACT_ENV = "PI_WORKSTATION_INFERENCE_INKLING_CONTRACT";
const CONTRACT_JSON_ENV = "PI_WORKSTATION_INFERENCE_CONTRACT_JSON";
const WORKSTATION_ROOT_ENV = "PI_WORKSTATION_ROOT";
const DEFAULT_WORKSTATION_ROOT = join(
  homedir(),
  "ai-society",
  "softwareco",
  "infra",
  "workstation",
);
const LANE_OP_SCRIPT = join("scripts", "phasee", "lane-op.py");
let armedAudio: ArmedAudio | undefined;

function boundedPositiveIntegerEnv(name: string, fallback: number, maximum: number): number {
  const value = process.env[name]?.trim();
  if (!value || !/^[1-9]\d*$/.test(value)) return fallback;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? Math.min(parsed, maximum) : fallback;
}

export function clearWorkstationHealthCache(): void {
  healthCache.clear();
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

const TRUSTED_AUTHORITIES = new Set([
  "workstation/lane-op",
  "workstation/runtime-ownership-scheduler",
]);

function loopbackUrl(value: string, label: string): string {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(`${label} must be an absolute loopback URL`);
  }
  if (
    parsed.protocol !== "http:" ||
    !["127.0.0.1", "localhost", "[::1]"].includes(parsed.hostname) ||
    parsed.username ||
    parsed.password ||
    parsed.search ||
    parsed.hash
  ) {
    throw new Error(`${label} must be credential-free loopback HTTP without query or fragment`);
  }
  return parsed.toString().replace(/\/$/, "");
}

function schemaErrorSummary(payload: unknown): string {
  return (
    [...Value.Errors(WorkstationInferenceContractSchema, payload)]
      .slice(0, 5)
      .map((error) => `${error.instancePath || "/"} ${error.message}`)
      .join("; ") || "contract schema validation failed"
  );
}

function normalizeModel(model: ContractModel, index: number): ContractModel {
  const id = stringValue(model.id) ?? stringValue(model.pi_model_id);
  if (!id) throw new Error(`models[${index}] needs id or pi_model_id`);
  return {
    ...model,
    id,
    pi_model_id: id,
    name: stringValue(model.name) ?? id,
    upstream_model: stringValue(model.upstream_model),
    thinking_format: model.thinking_format,
  };
}

function parseContract(payload: unknown): WorkstationInferenceContract {
  if (!Value.Check(WorkstationInferenceContractSchema, payload)) {
    throw new Error(`contract schema validation failed: ${schemaErrorSummary(payload)}`);
  }

  const contract = payload as WorkstationInferenceContract;
  const baseUrl = stringValue(contract.base_url);
  if (!baseUrl) throw new Error("base_url is required");
  const authority = stringValue(contract.authority);
  if (!authority || !TRUSTED_AUTHORITIES.has(authority)) {
    throw new Error("contract authority is not a trusted workstation owner");
  }
  const healthUrl = stringValue(contract.health_url);
  return {
    ...contract,
    authority,
    family: stringValue(contract.family),
    surface: stringValue(contract.surface),
    generated_at: stringValue(contract.generated_at),
    provider_id: stringValue(contract.provider_id),
    provider_name: stringValue(contract.provider_name),
    base_url: loopbackUrl(baseUrl, "base_url"),
    health_url: healthUrl ? loopbackUrl(healthUrl, "health_url") : undefined,
    api_key_env: stringValue(contract.api_key_env),
    api_key: stringValue(contract.api_key),
    recovery_hint: stringValue(contract.recovery_hint),
    models: contract.models.map(normalizeModel),
  };
}

function workstationRoot(): string {
  return process.env[WORKSTATION_ROOT_ENV]?.trim() || DEFAULT_WORKSTATION_ROOT;
}

function defaultContractPath(surface: "canonical" | "canary" = "canonical"): string {
  return join(
    workstationRoot(),
    "phasee",
    "state",
    surface === "canary"
      ? "workstation-inference-provider.canary.json"
      : "workstation-inference-provider.json",
  );
}

function defaultInklingContractPath(): string {
  return join(
    workstationRoot(),
    "phasee",
    "state",
    "workstation-inference-provider.inkling-canary.json",
  );
}

async function loadContractFromPath(path: string): Promise<LoadedContract> {
  const text = await readFile(path, "utf8");
  return { contract: parseContract(JSON.parse(text)), source: path };
}

async function loadPrimaryContract(): Promise<LoadedContract> {
  const inline = process.env[CONTRACT_JSON_ENV];
  if (inline?.trim()) {
    return { contract: parseContract(JSON.parse(inline)), source: CONTRACT_JSON_ENV };
  }

  const path = process.env[CONTRACT_ENV]?.trim() || defaultContractPath("canonical");
  return loadContractFromPath(path);
}

async function loadAvailableContracts(): Promise<LoadedContract[]> {
  const primary = await loadPrimaryContract();
  if (process.env[CONTRACT_JSON_ENV]?.trim() || process.env[CONTRACT_ENV]?.trim()) return [primary];

  const loaded = [primary];
  const optionalContracts = [
    {
      label: "baseline canary",
      path: process.env[CANARY_CONTRACT_ENV]?.trim() || defaultContractPath("canary"),
    },
    {
      label: "Inkling canary",
      path: process.env[INKLING_CONTRACT_ENV]?.trim() || defaultInklingContractPath(),
    },
  ];
  for (const candidate of optionalContracts) {
    try {
      loaded.push(await loadContractFromPath(candidate.path));
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      if (!detail.includes("ENOENT")) {
        console.warn(`workstation inference ${candidate.label} contract ignored: ${detail}`);
      }
    }
  }
  return loaded;
}

function mergeContracts(loadedContracts: LoadedContract[]): LoadedContract {
  const [primary] = loadedContracts;
  if (!primary) throw new Error("no workstation inference contracts loaded");
  const seen = new Set<string>();
  const models: ContractModel[] = [];
  for (const loaded of loadedContracts) {
    for (const model of loaded.contract.models) {
      const id = model.pi_model_id ?? model.id;
      if (!id || seen.has(id)) continue;
      seen.add(id);
      models.push(model);
    }
  }
  return {
    contract: { ...primary.contract, models },
    source: loadedContracts.map((loaded) => loaded.source).join(" + "),
  };
}

async function loadContract(): Promise<LoadedContract> {
  return mergeContracts(await loadAvailableContracts());
}

function normalizeBaseUrl(value: string): string {
  const trimmed = value.replace(/\/+$/, "");
  return trimmed.endsWith("/v1") ? trimmed : `${trimmed}/v1`;
}

function defaultHealthUrl(contract: WorkstationInferenceContract): string {
  return normalizeBaseUrl(contract.base_url).replace(/\/v1$/, "/health");
}

function staleDetail(contract: WorkstationInferenceContract): string | undefined {
  const refreshAfterSeconds = contract.stale_after_seconds ?? contract.refresh_after_seconds;
  if (!contract.generated_at || !refreshAfterSeconds) return undefined;
  const generatedAt = Date.parse(contract.generated_at);
  if (!Number.isFinite(generatedAt))
    return `generated_at is not parseable: ${contract.generated_at}`;
  const ageSeconds = Math.floor((Date.now() - generatedAt) / 1000);
  if (ageSeconds > refreshAfterSeconds) {
    return `contract is ${ageSeconds}s old; refresh_after_seconds=${refreshAfterSeconds}`;
  }
  return undefined;
}

async function resolveContractForModel(
  modelId: string,
  options: { checkHealth?: boolean; signal?: AbortSignal } = {},
): Promise<{ contract: WorkstationInferenceContract; model: ContractModel; source: string }> {
  const loadedContracts = await loadAvailableContracts();
  for (const loaded of loadedContracts) {
    const contractModel = loaded.contract.models.find(
      (candidate) => (candidate.pi_model_id ?? candidate.id) === modelId,
    );
    if (!contractModel) continue;
    if (options.checkHealth) {
      const unhealthy = await checkHealth(loaded.contract, options.signal);
      if (unhealthy) throw new Error(`workstation inference endpoint is not healthy: ${unhealthy}`);
    }
    return { contract: loaded.contract, model: contractModel, source: loaded.source };
  }
  throw new Error(`model ${modelId} is not present in the current workstation contracts`);
}

async function checkHealth(
  contract: WorkstationInferenceContract,
  callerSignal?: AbortSignal,
): Promise<string | undefined> {
  const healthUrl = contract.health_url ?? defaultHealthUrl(contract);
  if (callerSignal?.aborted) return "health check cancelled by caller";
  const cached = healthCache.get(healthUrl);
  if (cached && cached.expiresAt > Date.now()) return cached.unhealthy;
  if (cached) healthCache.delete(healthUrl);

  const controller = new AbortController();
  const timeoutMs = boundedPositiveIntegerEnv(
    HEALTH_TIMEOUT_ENV,
    DEFAULT_TIMEOUT_MS,
    MAX_HEALTH_TIMEOUT_MS,
  );
  const onCallerAbort = () => controller.abort(callerSignal?.reason);
  if (callerSignal?.aborted) onCallerAbort();
  else callerSignal?.addEventListener("abort", onCallerAbort, { once: true });
  const timeout = setTimeout(
    () => controller.abort(new Error(`health timed out after ${timeoutMs}ms`)),
    timeoutMs,
  );
  let unhealthy: string | undefined;
  try {
    const response = await fetch(healthUrl, { signal: controller.signal });
    if (!response.ok) unhealthy = `health returned HTTP ${response.status}`;
  } catch (error) {
    unhealthy = callerSignal?.aborted
      ? "health check cancelled by caller"
      : controller.signal.reason instanceof Error
        ? controller.signal.reason.message
        : error instanceof Error
          ? error.message
          : String(error);
  } finally {
    clearTimeout(timeout);
    callerSignal?.removeEventListener("abort", onCallerAbort);
  }

  if (!callerSignal?.aborted) {
    const ttlMs = boundedPositiveIntegerEnv(
      HEALTH_CACHE_TTL_ENV,
      DEFAULT_HEALTH_CACHE_TTL_MS,
      MAX_HEALTH_CACHE_TTL_MS,
    );
    healthCache.set(healthUrl, { expiresAt: Date.now() + ttlMs, unhealthy });
  }
  return unhealthy;
}

export async function resolveContractStatus(
  options: { checkHealth?: boolean; signal?: AbortSignal } = {},
): Promise<ContractStatus> {
  let loaded: LoadedContract;
  try {
    loaded = await loadContract();
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    return {
      status: detail.includes("ENOENT") ? "missing" : "invalid",
      summary: "workstation inference contract is not available",
      detail,
    };
  }

  const stale = staleDetail(loaded.contract);

  if (options.checkHealth) {
    const unhealthy = await checkHealth(loaded.contract, options.signal);
    if (unhealthy) {
      return {
        status: "unhealthy",
        source: loaded.source,
        summary: "workstation inference endpoint is not healthy",
        detail: unhealthy,
        contract: loaded.contract,
      };
    }
  }

  return {
    status: "ok",
    source: loaded.source,
    summary: stale
      ? "workstation inference contract is usable but should be refreshed"
      : "workstation inference contract is usable",
    detail: stale,
    contract: loaded.contract,
  };
}

export function providerModel(model: ContractModel) {
  const supportsReasoning = model.reasoning ?? false;
  const compat =
    supportsReasoning && model.thinking_format
      ? { thinkingFormat: model.thinking_format }
      : undefined;
  return {
    id: model.pi_model_id ?? model.id ?? "baseline-text",
    name: model.name ?? model.pi_model_id ?? model.id ?? "baseline-text",
    reasoning: supportsReasoning,
    thinkingLevelMap: supportsReasoning ? model.thinking_level_map : undefined,
    input: model.input ?? ["text"],
    contextWindow: model.context_window ?? DEFAULT_CONTEXT_WINDOW,
    maxTokens: model.max_tokens ?? DEFAULT_MAX_TOKENS,
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    compat,
  };
}

function notifyOrLog(
  ctx: { hasUI?: boolean; ui?: { notify: (message: string, level?: NotifyLevel) => void } },
  message: string,
  level: NotifyLevel = "info",
) {
  if (ctx.hasUI && ctx.ui) ctx.ui.notify(message, level);
  else console.log(message);
}

function contractApiKey(contract: WorkstationInferenceContract): string {
  return (
    stringValue(contract.api_key) ??
    (contract.api_key_env ? stringValue(process.env[contract.api_key_env]) : undefined) ??
    DEFAULT_API_KEY
  );
}

function audioPolicy(model: ContractModel): AudioInputPolicy | undefined {
  return model.native_input_modalities?.includes("audio") ? model.audio_input : undefined;
}

function clearCurrentAudio(expected?: ArmedAudio): void {
  if (!expected || armedAudio?.nonce === expected.nonce) armedAudio = clearArmedAudio(armedAudio);
}

async function quarantineCurrentAudio(
  pi: ExtensionAPI,
  reason: string,
  expected?: ArmedAudio,
): Promise<void> {
  if (!armedAudio || (expected && armedAudio.nonce !== expected.nonce)) return;
  const attachment = armedAudio;
  armedAudio = undefined;
  try {
    if (attachment.scheduler) {
      await quarantineSchedulerHandoff(pi, attachment.scheduler, reason);
    }
  } finally {
    clearArmedAudio(attachment);
    if (attachment.scheduler) await clearSchedulerHandoff(attachment.scheduler);
  }
}

function takeCurrentAudio(marker: string): ArmedAudio | undefined {
  if (armedAudio?.marker !== marker) return undefined;
  const attachment = armedAudio;
  armedAudio = undefined;
  if (attachment.expiryTimer) {
    clearTimeout(attachment.expiryTimer);
    attachment.expiryTimer = undefined;
  }
  return attachment;
}

function assertAudioOwnerContract(
  contract: WorkstationInferenceContract,
  policy: AudioInputPolicy,
): void {
  if (
    contract.authority !== "workstation/runtime-ownership-scheduler" ||
    contract.family !== "native-multimodal" ||
    contract.surface !== "canary"
  ) {
    throw new Error(
      "audio contract does not carry the exact workstation scheduler authority shape",
    );
  }
  const stale = staleDetail(contract);
  if (stale) throw new Error(`audio contract is stale: ${stale}`);
  if (contract.api_key || contract.api_key_env) {
    throw new Error("audio contracts must not select inline or environment credentials");
  }
  if (policy.authorization_mode !== "external-scheduler-claim-required") {
    throw new Error("audio contract does not require an external scheduler consumer claim");
  }
}

function errorEvent(model: Model<Api>, message: string) {
  return {
    type: "error" as const,
    reason: "error" as const,
    error: {
      role: "assistant" as const,
      content: [],
      api: model.api,
      provider: model.provider,
      model: model.id,
      usage: {
        input: 0,
        output: 0,
        cacheRead: 0,
        cacheWrite: 0,
        totalTokens: 0,
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
      },
      stopReason: "error" as const,
      errorMessage: message,
      timestamp: Date.now(),
    },
  };
}

const AUDIO_OUTCOME_UNKNOWN =
  "Inkling audio dispatch outcome is unknown. Automatic retry is disabled; explicit workstation owner/scheduler disposition is required.";

export function streamWorkstationInference(
  model: Model<Api>,
  context: Context,
  options?: SimpleStreamOptions,
  pi?: ExtensionAPI,
): AssistantMessageEventStream {
  const stream = createAssistantMessageEventStream();
  const latestMarker = latestUserAudioMarker(context.messages);
  const pendingAudio = armedAudio;
  const attachment = pendingAudio ? takeCurrentAudio(pendingAudio.marker) : undefined;
  const isAudioAttempt = latestMarker !== undefined || pendingAudio !== undefined;

  (async () => {
    let completionAttempted = false;
    let dispositionAttempted = false;
    try {
      if (isAudioAttempt && !attachment) {
        throw new Error("audio attachment is unavailable or ambiguous; automatic replay denied");
      }
      if (latestMarker === "multiple") {
        throw new Error("multiple audio markers are not an authorized provider turn");
      }
      if (attachment && latestMarker !== attachment.marker) {
        throw new Error("audio marker must bind the latest user message exactly");
      }
      const selected = await resolveContractForModel(model.id, {
        checkHealth: true,
        signal: (options as (SimpleStreamOptions & { signal?: AbortSignal }) | undefined)?.signal,
      });
      const providerId = selected.contract.provider_id ?? DEFAULT_PROVIDER_ID;
      const payloadModel = selected.model.upstream_model ?? model.id;
      if (attachment) {
        if (model.provider !== attachment.providerId || providerId !== attachment.providerId) {
          throw new Error("audio provider identity drifted before dispatch");
        }
        if (model.id !== attachment.modelId || payloadModel !== attachment.payloadModel) {
          throw new Error("audio model identity drifted before dispatch");
        }
        const policy = audioPolicy(selected.model);
        if (!policy) throw new Error("selected model no longer advertises native audio input");
        assertAudioOwnerContract(selected.contract, policy);
        if (!hasAudioMarker(context.messages, attachment.marker)) {
          throw new Error("audio marker disappeared before provider serialization");
        }
      }

      const innerModel = {
        ...model,
        id: payloadModel,
        api: "openai-completions",
        baseUrl: normalizeBaseUrl(selected.contract.base_url),
        compat: providerModel(selected.model).compat,
      } as Model<"openai-completions">;
      const inheritedOnPayload = options?.onPayload;
      const inner = streamSimpleOpenAICompletions(
        innerModel,
        attachment ? { ...context, tools: [] } : context,
        {
          ...options,
          apiKey: contractApiKey(selected.contract),
          maxRetries: attachment ? 0 : options?.maxRetries,
          onPayload: attachment
            ? async (payload, callbackModel) => {
                const inherited = await inheritedOnPayload?.(payload, callbackModel);
                return transformAudioPayload(inherited ?? payload, attachment);
              }
            : inheritedOnPayload,
        },
      );
      let providerError = false;
      let pushAudioTerminal: (() => void) | undefined;
      for await (const event of inner) {
        if (attachment && event.type === "error") {
          providerError = true;
          pushAudioTerminal = () =>
            stream.push({
              ...event,
              error: { ...event.error, errorMessage: AUDIO_OUTCOME_UNKNOWN },
            });
        } else if (attachment && event.type === "done") {
          pushAudioTerminal = () => stream.push(event);
        } else {
          stream.push(event);
        }
      }
      if (attachment) {
        if (!pi || !attachment.scheduler) {
          throw new Error("audio scheduler consumer is unavailable");
        }
        if (providerError) {
          dispositionAttempted = true;
          await quarantineSchedulerHandoff(pi, attachment.scheduler, "provider-error-event");
        } else {
          await consumeSchedulerHandoff(pi, attachment.scheduler, "post-effect");
          completionAttempted = true;
          await completeSchedulerHandoff(pi, attachment.scheduler);
        }
        pushAudioTerminal?.();
      }
      stream.end();
    } catch (error) {
      if (
        attachment &&
        pi &&
        attachment.scheduler &&
        !completionAttempted &&
        !dispositionAttempted
      ) {
        dispositionAttempted = true;
        try {
          await quarantineSchedulerHandoff(pi, attachment.scheduler, "provider-outcome-unknown");
        } catch {
          // A failed disposition is itself indeterminate. Never retry or release from Pi.
        }
      }
      const detail = error instanceof Error ? error.message : String(error);
      stream.push(errorEvent(model, attachment ? AUDIO_OUTCOME_UNKNOWN : detail));
      stream.end();
    } finally {
      if (attachment) {
        clearArmedAudio(attachment);
        if (attachment.scheduler) {
          try {
            await clearSchedulerHandoff(attachment.scheduler);
          } catch {
            // Scratch cleanup failure cannot grant retry or scheduler authority.
          }
        }
      }
    }
  })();

  return stream;
}

async function runLaneOp(
  pi: ExtensionAPI,
  args: string[],
): Promise<{ ok: true; stdout: string } | { ok: false; detail: string }> {
  const result = await pi.exec("python3", [LANE_OP_SCRIPT, ...args], {
    cwd: workstationRoot(),
    timeout: 60_000,
  });
  if (result.code !== 0) {
    return {
      ok: false,
      detail: [
        `lane-op exited ${result.code}`,
        result.stderr.trim() ? `stderr: ${result.stderr.trim()}` : undefined,
        result.stdout.trim() ? `stdout: ${result.stdout.trim()}` : undefined,
      ]
        .filter((line): line is string => Boolean(line))
        .join("\n"),
    };
  }
  return { ok: true, stdout: result.stdout.trim() };
}

function statusText(status: ContractStatus): string {
  const contract = status.contract;
  const lines = [
    `status: ${status.status}`,
    `summary: ${status.summary}`,
    status.source ? `source: ${status.source}` : undefined,
    status.detail ? `detail: ${status.detail}` : undefined,
    contract ? `provider: ${contract.provider_id ?? DEFAULT_PROVIDER_ID}` : undefined,
    contract ? `base_url: ${normalizeBaseUrl(contract.base_url)}` : undefined,
    contract ? `health_url: ${contract.health_url ?? defaultHealthUrl(contract)}` : undefined,
    contract ? `authority: ${contract.authority ?? "unspecified"}` : undefined,
    contract ? `family/surface: ${contract.family ?? "?"}/${contract.surface ?? "?"}` : undefined,
    contract
      ? `models: ${contract.models.map((model) => model.pi_model_id ?? model.id).join(", ")}`
      : undefined,
    contract?.recovery_hint ? `recovery_hint: ${contract.recovery_hint}` : undefined,
  ];
  return lines.filter((line): line is string => Boolean(line)).join("\n");
}

function registerContractProvider(
  pi: ExtensionAPI,
  contract: WorkstationInferenceContract,
): string {
  const providerId = contract.provider_id ?? DEFAULT_PROVIDER_ID;
  pi.registerProvider(providerId, {
    name: contract.provider_name ?? DEFAULT_PROVIDER_NAME,
    baseUrl: normalizeBaseUrl(contract.base_url),
    apiKey: contractApiKey(contract),
    api: WORKSTATION_API_ID,
    models: contract.models.map(providerModel),
    streamSimple: (model, context, options) =>
      streamWorkstationInference(model, context, options, pi),
  });
  return providerId;
}

async function sendAudioTurn(
  pi: ExtensionAPI,
  rawArgs: string,
  ctx: ExtensionCommandContext,
): Promise<void> {
  if (!ctx.isIdle()) throw new Error("audio-send requires an idle Pi session");
  await quarantineCurrentAudio(pi, "superseded-before-provider-dispatch");
  const model = ctx.model;
  if (!model) throw new Error("select the workstation Inkling model before audio-send");
  const selected = await resolveContractForModel(model.id, {
    checkHealth: true,
    signal: ctx.signal,
  });
  const providerId = selected.contract.provider_id ?? DEFAULT_PROVIDER_ID;
  if (model.provider !== providerId) {
    throw new Error("select the workstation Inkling model before audio-send");
  }
  const policy = audioPolicy(selected.model);
  if (!policy) throw new Error("selected workstation model does not advertise native audio input");
  assertAudioOwnerContract(selected.contract, policy);
  const parsed = parseGovernedAudioSendArgs(rawArgs, ctx.cwd);
  const scheduler = await readSchedulerHandoff(
    parsed.handoffPath,
    parsed.schedulerDb,
    providerId,
    model.id,
  );
  let audio: Awaited<ReturnType<typeof readBoundedAudio>>;
  try {
    audio = await readBoundedAudio(parsed.path, ctx.cwd, policy);
  } catch (error) {
    await clearSchedulerHandoff(scheduler);
    throw error;
  }
  const audioBytes = audio.data.length;
  let preEffectAttempted = false;
  try {
    preEffectAttempted = true;
    await consumeSchedulerHandoff(pi, scheduler, "pre-effect");
    if (Date.now() >= scheduler.claimExpiresAt) {
      throw new Error("scheduler claim expired before the provider turn was armed");
    }
    const attachment = armAudio({
      providerId,
      modelId: model.id,
      payloadModel: selected.model.upstream_model ?? model.id,
      format: audio.format,
      data: audio.data,
      scheduler,
      expiresAt: scheduler.claimExpiresAt,
    });
    armedAudio = attachment;
    attachment.expiryTimer = setTimeout(
      () => {
        void quarantineCurrentAudio(
          pi,
          "attachment-expired-before-provider-dispatch",
          attachment,
        ).catch(() => undefined);
      },
      Math.max(0, attachment.expiresAt - Date.now()),
    );
    attachment.expiryTimer.unref();
    try {
      pi.sendUserMessage(`${attachment.marker}\n${parsed.prompt}`);
    } catch (error) {
      clearCurrentAudio(attachment);
      throw error;
    }
  } catch (error) {
    audio.data.fill(0);
    if (preEffectAttempted) {
      try {
        await quarantineSchedulerHandoff(pi, scheduler, "message-dispatch-unknown");
      } catch {
        // Never retry, release, or reconcile an indeterminate scheduler disposition.
      }
    }
    await clearSchedulerHandoff(scheduler);
    throw error;
  }
  notifyOrLog(
    ctx,
    `audio-send armed ${audio.format} (${audioBytes} bytes) for ${model.provider}/${model.id}; one provider dispatch, no tools, no automatic retry`,
  );
}

export default async function (pi: ExtensionAPI) {
  try {
    await quarantineCurrentAudio(pi, "extension-reload-before-provider-dispatch");
  } catch {
    // A failed disposition is indeterminate and never authorizes retry or release.
  }
  const initial = await resolveContractStatus({ checkHealth: false });

  if (typeof pi.on === "function") {
    const dispose = (reason: string) => async () => {
      try {
        await quarantineCurrentAudio(pi, reason);
      } catch {
        // Lifecycle cleanup failure cannot grant provider or scheduler authority.
      }
    };
    pi.on("agent_end", dispose("agent-ended-before-provider-dispatch"));
    pi.on("model_select", dispose("model-changed-before-provider-dispatch"));
    pi.on("session_before_switch", dispose("session-switched-before-provider-dispatch"));
    pi.on("session_shutdown", dispose("session-shutdown-before-provider-dispatch"));
  }

  pi.registerCommand("workstation-inference", {
    description: "Show read-only workstation inference provider status",
    handler: async (args, ctx) => {
      const trimmed = args.trim();
      const firstSpace = trimmed.search(/\s/);
      const action =
        (firstSpace < 0 ? trimmed : trimmed.slice(0, firstSpace)).toLowerCase() || "status";
      const actionArgs = firstSpace < 0 ? "" : trimmed.slice(firstSpace + 1).trim();
      if (action === "help") {
        notifyOrLog(
          ctx,
          [
            "/workstation-inference status  Show contract and health status",
            "/workstation-inference refresh  Ask lane-op to refresh canonical and canary provider contracts",
            "/workstation-inference lane-status  Show lane-op baseline-text status",
            "/workstation-inference contract  Show the expected contract path/env",
            "/workstation-inference audio-send --handoff <claim.json> --scheduler-db <scheduler.sqlite3> <audio> -- <prompt>  Consume one external scheduler claim",
          ].join("\n"),
        );
        return;
      }
      if (action === "contract") {
        notifyOrLog(
          ctx,
          [
            `contract env: ${CONTRACT_ENV}`,
            `canary contract env: ${CANARY_CONTRACT_ENV}`,
            `Inkling contract env: ${INKLING_CONTRACT_ENV}`,
            `inline contract env: ${CONTRACT_JSON_ENV}`,
            `workstation root env: ${WORKSTATION_ROOT_ENV}`,
            `default workstation root: ${DEFAULT_WORKSTATION_ROOT}`,
            `default canonical path: ${defaultContractPath("canonical")}`,
            `default canary path: ${defaultContractPath("canary")}`,
            `default Inkling path: ${defaultInklingContractPath()}`,
          ].join("\n"),
        );
        return;
      }
      if (action === "audio-send") {
        try {
          await sendAudioTurn(pi, actionArgs, ctx);
        } catch (error) {
          notifyOrLog(ctx, error instanceof Error ? error.message : String(error), "error");
        }
        return;
      }
      if (action === "refresh") {
        const canonicalRefresh = await runLaneOp(pi, [
          "provider-contract",
          "baseline-text",
          "--surface",
          "canonical",
          "--write",
        ]);
        if (!canonicalRefresh.ok) {
          notifyOrLog(
            ctx,
            `workstation inference canonical refresh failed\n${canonicalRefresh.detail}`,
            "error",
          );
          return;
        }
        const canaryRefresh = await runLaneOp(pi, [
          "provider-contract",
          "baseline-text",
          "--surface",
          "canary",
          "--write",
        ]);
        if (!canaryRefresh.ok) {
          notifyOrLog(
            ctx,
            `workstation inference canary refresh failed\n${canaryRefresh.detail}`,
            "error",
          );
          return;
        }
        let inklingWarning: string | undefined;
        const inklingRefresh = await runLaneOp(pi, [
          "provider-contract",
          "inkling",
          "--surface",
          "canary",
          "--write",
        ]);
        if (!inklingRefresh.ok) {
          inklingWarning = `optional Inkling refresh unavailable: ${inklingRefresh.detail}`;
        }
        const status = await resolveContractStatus({ checkHealth: true });
        if (status.status === "ok" && status.contract)
          registerContractProvider(pi, status.contract);
        notifyOrLog(
          ctx,
          ["refresh: ok", inklingWarning, statusText(status)]
            .filter((line): line is string => Boolean(line))
            .join("\n"),
          inklingWarning ? "warning" : "info",
        );
        return;
      }
      if (action === "lane-status") {
        const status = await runLaneOp(pi, ["status", "baseline-text", "--surface", "canonical"]);
        notifyOrLog(
          ctx,
          status.ok ? status.stdout : `lane-status failed\n${status.detail}`,
          status.ok ? "info" : "error",
        );
        return;
      }
      if (action !== "status") {
        notifyOrLog(ctx, `unknown action: ${action}; try /workstation-inference help`, "warning");
        return;
      }
      const status = await resolveContractStatus({ checkHealth: true });
      if (status.status === "ok" && status.contract) registerContractProvider(pi, status.contract);
      notifyOrLog(ctx, statusText(status));
    },
  });

  if (initial.status === "ok" && initial.contract) registerContractProvider(pi, initial.contract);
}
