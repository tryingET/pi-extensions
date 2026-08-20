import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { type Static, Type } from "typebox";
import { Value } from "typebox/value";
import type { AudioInputPolicy } from "./workstation-audio.ts";
import {
  ContractGenerationCache,
  type ContractGenerationStatus,
  EndpointHealthCache,
  type EndpointHealthStatus,
  type HealthMode,
} from "./workstation-provider-hot-path.ts";

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
    runtime_profile_id: OptionalString,
    base_url: Type.String({ minLength: 1 }),
    health_url: OptionalString,
    api_key_env: OptionalString,
    api_key: OptionalString,
    recovery_hint: OptionalString,
    models: Type.Array(ContractModelSchema, { minItems: 1 }),
  },
  { additionalProperties: true },
);

export type ContractModel = Static<typeof ContractModelSchema>;
export type WorkstationInferenceContract = Static<typeof WorkstationInferenceContractSchema>;

type LoadedContract = {
  contract: WorkstationInferenceContract;
  source: string;
};

type Status = "ok" | "missing" | "invalid" | "unhealthy";

export type ContractStatus = {
  status: Status;
  source?: string;
  summary: string;
  detail?: string;
  contract?: WorkstationInferenceContract;
  generation?: ContractGenerationStatus;
  health?: EndpointHealthStatus[];
};

export const DEFAULT_PROVIDER_ID = "workstation-inference";
export const DEFAULT_PROVIDER_NAME = "Workstation Inference";
export const WORKSTATION_API_ID = "workstation-inference";
export const INKLING_CANARY_MODEL_ID = "inkling-small-iq2m-canary";
export const LEGACY_INKLING_PROFILE_ID = "inkling-tts-canary";
const DEFAULT_CONTEXT_WINDOW = 131_072;
const DEFAULT_MAX_TOKENS = 16_384;
const DEFAULT_TIMEOUT_MS = 1_500;
const MAX_HEALTH_TIMEOUT_MS = 30_000;
const DEFAULT_HEALTH_CACHE_TTL_MS = 5_000;
const MAX_HEALTH_CACHE_TTL_MS = 60_000;
const DEFAULT_CONTRACT_REFRESH_MS = 5_000;
const MAX_CONTRACT_REFRESH_MS = 60 * 60 * 1_000;
const DEFAULT_CONTRACT_REFRESH_RETRY_MS = 1_000;
const HEALTH_TIMEOUT_ENV = "PI_WORKSTATION_INFERENCE_HEALTH_TIMEOUT_MS";
const HEALTH_CACHE_TTL_ENV = "PI_WORKSTATION_INFERENCE_HEALTH_CACHE_TTL_MS";
const CONTRACT_REFRESH_ENV = "PI_WORKSTATION_INFERENCE_CONTRACT_REFRESH_MS";
const CONTRACT_REFRESH_RETRY_ENV = "PI_WORKSTATION_INFERENCE_CONTRACT_REFRESH_RETRY_MS";
const DEFAULT_API_KEY = "workstation-local";
export const CONTRACT_ENV = "PI_WORKSTATION_INFERENCE_CONTRACT";
export const CANARY_CONTRACT_ENV = "PI_WORKSTATION_INFERENCE_CANARY_CONTRACT";
export const INKLING_CONTRACT_ENV = "PI_WORKSTATION_INFERENCE_INKLING_CONTRACT";
export const CONTRACT_JSON_ENV = "PI_WORKSTATION_INFERENCE_CONTRACT_JSON";
export const WORKSTATION_ROOT_ENV = "PI_WORKSTATION_ROOT";
export const DEFAULT_WORKSTATION_ROOT = join(
  homedir(),
  "ai-society",
  "softwareco",
  "infra",
  "workstation",
);
export const LANE_OP_SCRIPT = join("scripts", "phasee", "lane-op.py");

let contractGenerations:
  | ContractGenerationCache<WorkstationInferenceContract, ContractModel>
  | undefined;
let endpointHealth: EndpointHealthCache | undefined;

function boundedPositiveIntegerEnv(name: string, fallback: number, maximum: number): number {
  const value = process.env[name]?.trim();
  if (!value || !/^[1-9]\d*$/.test(value)) return fallback;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? Math.min(parsed, maximum) : fallback;
}

export function clearWorkstationHealthCache(): void {
  endpointHealth?.clear();
}

export function clearWorkstationContractCache(): void {
  contractGenerations?.clear();
}

export function clearWorkstationProviderCaches(): void {
  clearWorkstationHealthCache();
  clearWorkstationContractCache();
}

export function stringValue(value: unknown): string | undefined {
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

export function workstationRoot(): string {
  return process.env[WORKSTATION_ROOT_ENV]?.trim() || DEFAULT_WORKSTATION_ROOT;
}

export function defaultContractPath(surface: "canonical" | "canary" = "canonical"): string {
  return join(
    workstationRoot(),
    "phasee",
    "state",
    surface === "canary"
      ? "workstation-inference-provider.canary.json"
      : "workstation-inference-provider.json",
  );
}

export function defaultInklingContractPath(): string {
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

function contractGenerationCache() {
  contractGenerations ??= new ContractGenerationCache({
    load: loadAvailableContracts,
    merge: mergeContracts,
    models: (contract: WorkstationInferenceContract) => contract.models,
    modelId: (model: ContractModel) => model.pi_model_id ?? model.id,
    refreshIntervalMs: () =>
      boundedPositiveIntegerEnv(
        CONTRACT_REFRESH_ENV,
        DEFAULT_CONTRACT_REFRESH_MS,
        MAX_CONTRACT_REFRESH_MS,
      ),
    refreshRetryMs: () =>
      boundedPositiveIntegerEnv(
        CONTRACT_REFRESH_RETRY_ENV,
        DEFAULT_CONTRACT_REFRESH_RETRY_MS,
        MAX_CONTRACT_REFRESH_MS,
      ),
  });
  return contractGenerations;
}

async function loadContract(): Promise<LoadedContract> {
  return contractGenerationCache().merged();
}

export async function refreshWorkstationContractGeneration(): Promise<ContractGenerationStatus> {
  return contractGenerationCache().refresh("explicit");
}

export function workstationContractGenerationStatus(): ContractGenerationStatus {
  return contractGenerationCache().status();
}

export function normalizeBaseUrl(value: string): string {
  const trimmed = value.replace(/\/+$/, "");
  return trimmed.endsWith("/v1") ? trimmed : `${trimmed}/v1`;
}

export function defaultHealthUrl(contract: WorkstationInferenceContract): string {
  return normalizeBaseUrl(contract.base_url).replace(/\/v1$/, "/health");
}

function endpointHealthCache() {
  endpointHealth ??= new EndpointHealthCache({
    ttlMs: () =>
      boundedPositiveIntegerEnv(
        HEALTH_CACHE_TTL_ENV,
        DEFAULT_HEALTH_CACHE_TTL_MS,
        MAX_HEALTH_CACHE_TTL_MS,
      ),
    probe: probeHealthUrl,
  });
  return endpointHealth;
}

async function probeHealthUrl(healthUrl: string): Promise<string | undefined> {
  const controller = new AbortController();
  const timeoutMs = boundedPositiveIntegerEnv(
    HEALTH_TIMEOUT_ENV,
    DEFAULT_TIMEOUT_MS,
    MAX_HEALTH_TIMEOUT_MS,
  );
  const timeout = setTimeout(
    () => controller.abort(new Error(`health timed out after ${timeoutMs}ms`)),
    timeoutMs,
  );
  try {
    const response = await fetch(healthUrl, { signal: controller.signal });
    return response.ok ? undefined : `health returned HTTP ${response.status}`;
  } catch (error) {
    return controller.signal.reason instanceof Error
      ? controller.signal.reason.message
      : error instanceof Error
        ? error.message
        : String(error);
  } finally {
    clearTimeout(timeout);
  }
}

async function checkHealth(
  contract: WorkstationInferenceContract,
  callerSignal?: AbortSignal,
  mode: HealthMode = "blocking",
): Promise<string | undefined> {
  const healthUrl = contract.health_url ?? defaultHealthUrl(contract);
  return endpointHealthCache().check(healthUrl, { mode, signal: callerSignal });
}

export async function primeWorkstationHealth(): Promise<void> {
  const sources = await contractGenerationCache().sources();
  await endpointHealthCache().prime(
    sources.map((loaded) => loaded.contract.health_url ?? defaultHealthUrl(loaded.contract)),
  );
}

export function workstationHealthStatus(): EndpointHealthStatus[] {
  return endpointHealthCache().status();
}

export function workstationProviderHotPathStatus(): {
  generation: ContractGenerationStatus;
  health: EndpointHealthStatus[];
} {
  return {
    generation: workstationContractGenerationStatus(),
    health: workstationHealthStatus(),
  };
}

export function staleDetail(contract: WorkstationInferenceContract): string | undefined {
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

export async function resolveContractForModel(
  modelId: string,
  options: { checkHealth?: boolean; healthMode?: HealthMode; signal?: AbortSignal } = {},
): Promise<{
  contract: WorkstationInferenceContract;
  model: ContractModel;
  source: string;
  generationId: number;
}> {
  const selected = await contractGenerationCache().resolve(modelId);
  if (!selected) {
    throw new Error(`model ${modelId} is not present in the current workstation contracts`);
  }

  const healthMode = options.healthMode ?? (options.checkHealth ? "blocking" : "skip");
  if (healthMode !== "skip") {
    const unhealthy = await checkHealth(selected.contract, options.signal, healthMode);
    if (unhealthy) throw new Error(`workstation inference endpoint is not healthy: ${unhealthy}`);
  }

  return selected;
}

export async function resolveContractStatus(
  options: {
    checkHealth?: boolean;
    signal?: AbortSignal;
    refreshContracts?: boolean;
  } = {},
): Promise<ContractStatus> {
  let refreshError: string | undefined;
  if (options.refreshContracts) {
    try {
      await refreshWorkstationContractGeneration();
    } catch (error) {
      refreshError = error instanceof Error ? error.message : String(error);
    }
  }

  let loaded: LoadedContract;
  try {
    loaded = await loadContract();
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    return {
      status: detail.includes("ENOENT") ? "missing" : "invalid",
      summary: "workstation inference contract is not available",
      detail: refreshError ? `refresh failed: ${refreshError}; ${detail}` : detail,
      generation: workstationContractGenerationStatus(),
      health: workstationHealthStatus(),
    };
  }

  const stale = staleDetail(loaded.contract);
  const advisory = [refreshError ? `contract refresh failed: ${refreshError}` : undefined, stale]
    .filter((detail): detail is string => Boolean(detail))
    .join("; ") || undefined;

  if (options.checkHealth) {
    const unhealthy = await checkHealth(loaded.contract, options.signal, "blocking");
    if (unhealthy) {
      return {
        status: "unhealthy",
        source: loaded.source,
        summary: "workstation inference endpoint is not healthy",
        detail: unhealthy,
        contract: loaded.contract,
        generation: workstationContractGenerationStatus(),
        health: workstationHealthStatus(),
      };
    }
  }

  return {
    status: "ok",
    source: loaded.source,
    summary: refreshError
      ? "workstation inference contract remains usable from the previous generation"
      : stale
        ? "workstation inference contract is usable but should be refreshed"
        : "workstation inference contract is usable",
    detail: advisory,
    contract: loaded.contract,
    generation: workstationContractGenerationStatus(),
    health: workstationHealthStatus(),
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

export function notifyOrLog(
  ctx: { hasUI?: boolean; ui?: { notify: (message: string, level?: NotifyLevel) => void } },
  message: string,
  level: NotifyLevel = "info",
) {
  if (ctx.hasUI && ctx.ui) ctx.ui.notify(message, level);
  else console.log(message);
}

export function contractApiKey(contract: WorkstationInferenceContract): string {
  return (
    stringValue(contract.api_key) ??
    (contract.api_key_env ? stringValue(process.env[contract.api_key_env]) : undefined) ??
    DEFAULT_API_KEY
  );
}

export function audioPolicy(model: ContractModel): AudioInputPolicy | undefined {
  return model.native_input_modalities?.includes("audio") ? model.audio_input : undefined;
}
