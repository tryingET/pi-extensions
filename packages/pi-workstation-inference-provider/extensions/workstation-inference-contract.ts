import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { capacityAdmission, SOMA_ALIASES } from "./workstation-capacity.ts";
import {
  type ContractModel,
  parseContract,
  stringValue,
  type WorkstationInferenceContract,
} from "./workstation-inference-schema.ts";

export {
  type ContractModel,
  stringValue,
  type WorkstationInferenceContract,
} from "./workstation-inference-schema.ts";

import type { AudioInputPolicy } from "./workstation-audio.ts";
import {
  ContractGenerationCache,
  type ContractGenerationStatus,
  EndpointHealthCache,
  type EndpointHealthStatus,
  type HealthMode,
  type HealthProbeResult,
  type LaneHealthInfo,
} from "./workstation-provider-hot-path.ts";

type NotifyLevel = "info" | "warning" | "error";

type SourceRole = "canonical" | "optional";
type LoadedContract = {
  contract: WorkstationInferenceContract;
  source: string;
  sourceRole?: SourceRole;
};
export type ContractBinding = LoadedContract & { model: ContractModel; generationId: number };
// Source-role metadata is local reader state, never a producer-overridable wire field.
const optionalCapacityModels = new WeakSet<ContractModel>();
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
let sourceErrors: string[] = [];
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
async function loadPath(path: string): Promise<LoadedContract> {
  return { contract: parseContract(JSON.parse(await readFile(path, "utf8"))), source: path };
}
async function loadAvailableContracts(): Promise<LoadedContract[]> {
  const inline = process.env[CONTRACT_JSON_ENV];
  const explicit = inline?.trim() || process.env[CONTRACT_ENV]?.trim();
  const candidates: {
    source: string;
    sourceRole: SourceRole;
    load: () => Promise<LoadedContract>;
  }[] = [
    {
      sourceRole: "canonical",
      source: inline?.trim()
        ? CONTRACT_JSON_ENV
        : process.env[CONTRACT_ENV]?.trim() || defaultContractPath(),
      load: async () => {
        const current = process.env[CONTRACT_JSON_ENV];
        return current?.trim()
          ? { contract: parseContract(JSON.parse(current)), source: CONTRACT_JSON_ENV }
          : loadPath(process.env[CONTRACT_ENV]?.trim() || defaultContractPath());
      },
    },
  ];
  for (const [env, fallback] of [
    [CANARY_CONTRACT_ENV, defaultContractPath("canary")],
    [INKLING_CONTRACT_ENV, defaultInklingContractPath()],
  ]) {
    const path = process.env[env]?.trim();
    if (!explicit || path)
      candidates.push({
        source: path || fallback,
        sourceRole: "optional",
        load: () => loadPath(path || fallback),
      });
  }
  const loaded: LoadedContract[] = [];
  const errors: string[] = [];
  let onlyMissing = true;
  // Read primary authority after optional I/O, but keep canonical-first precedence.
  for (const c of candidates.slice(1).concat(candidates.slice(0, 1))) {
    try {
      const row = await c.load();
      if (c.sourceRole === "optional")
        for (const model of row.contract.models) {
          if (SOMA_ALIASES.has(model.pi_model_id ?? model.id ?? ""))
            optionalCapacityModels.add(model);
        }
      const owned = { ...row, sourceRole: c.sourceRole };
      if (c.sourceRole === "canonical") loaded.unshift(owned);
      else loaded.push(owned);
    } catch (error) {
      onlyMissing &&= error instanceof Error && "code" in error && error.code === "ENOENT";
      errors.push(`${c.source}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  sourceErrors = errors;
  if (!loaded.length) {
    const error = new Error(errors.join("; ") || "no workstation inference contracts loaded");
    error.name = onlyMissing ? "WorkstationContractMissing" : "WorkstationContractInvalid";
    throw error;
  }
  return loaded;
}
function mergeContracts(loaded: LoadedContract[]): LoadedContract {
  const primary = loaded[0];
  if (!primary) throw new Error("no workstation inference contracts loaded");
  const seen = new Set<string>();
  const models = loaded.flatMap(({ contract }) =>
    contract.models.filter((m) => {
      const id = m.pi_model_id ?? m.id;
      if (!id || seen.has(id)) return false;
      seen.add(id);
      return true;
    }),
  );
  return {
    contract: { ...primary.contract, models },
    source: loaded.map((c) => c.source).join(" + "),
  };
}

type Status = "ok" | "missing" | "invalid" | "unhealthy";

export type ContractStatus = {
  status: Status;
  source?: string;
  summary: string;
  detail?: string;
  contract?: WorkstationInferenceContract;
  generation?: ContractGenerationStatus;
  health?: EndpointHealthStatus[];
  declaration?: "valid" | "invalid" | "missing";
  capacity?: { id: string; admissible: boolean; reason?: string }[];
  registeredModels?: string[];
  withdrawal?: string;
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

/** Test isolation hook: drops process-global caches so each scenario
 * starts from an uninitialized state. Not part of the public surface. */
export function __resetWorkstationInferenceCachesForTests(): void {
  contractGenerations = undefined;
  endpointHealth = undefined;
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

/** One independent source read after awaited work; registration must not reuse a prior health snapshot. */
export async function readRegistrationSnapshot() {
  const sources = await loadAvailableContracts();
  const generation = contractGenerationCache().adopt(sources);
  const merged = mergeContracts(sources);
  const seen = new Set<string>();
  const bindings: ContractBinding[] = [];
  for (const owner of sources)
    for (const model of owner.contract.models) {
      const id = model.pi_model_id ?? model.id;
      if (!id || seen.has(id)) continue;
      seen.add(id);
      bindings.push({
        ...owner,
        model,
        generationId: generation.generationId ?? 0,
      });
    }
  return { ...merged, bindings, generation };
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

async function probeHealthUrl(healthUrl: string): Promise<HealthProbeResult> {
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
    if (!response.ok) return `health returned HTTP ${response.status}`;
    // The workstation adapter reports partial lane degradation inside a 200
    // body (for example "degraded-side-lanes" with per-lane detail). HTTP
    // status alone would hide a dead model route behind a healthy process.
    try {
      const body = (await response.json()) as {
        status?: unknown;
        lanes?: unknown;
      };
      const degraded =
        typeof body?.status === "string" &&
        body.status !== "ok" &&
        body.status.startsWith("degraded");
      const lanes = Array.isArray(body?.lanes)
        ? (body.lanes.filter(
            (lane): lane is LaneHealthInfo =>
              !!lane &&
              typeof lane === "object" &&
              typeof (lane as LaneHealthInfo).lane_id === "string" &&
              typeof (lane as LaneHealthInfo).healthy === "boolean" &&
              Array.isArray((lane as LaneHealthInfo).models),
          ) as LaneHealthInfo[])
        : undefined;
      if (degraded || lanes?.length) {
        return {
          ...(degraded ? { degraded: String(body.status) } : {}),
          ...(lanes?.length ? { lanes } : {}),
        };
      }
    } catch (error) {
      // Complete non-JSON bodies may use HTTP-only health, but a timed-out or
      // interrupted body is not a successful recovery observation.
      if (controller.signal.aborted) throw controller.signal.reason;
      if (!(error instanceof SyntaxError)) throw error;
    }
    return undefined;
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
): Promise<ContractBinding> {
  let selected: ContractBinding | undefined = await contractGenerationCache().resolve(modelId);
  if (selected)
    selected = {
      ...selected,
      sourceRole: (
        contractGenerationCache()
          .sourcesCurrent()
          .find((s) => s.source === selected?.source) as LoadedContract | undefined
      )?.sourceRole,
    };
  if (
    SOMA_ALIASES.has(modelId) ||
    selected?.contract.schema_version === 2 ||
    (selected && "capacity" in selected.model)
  ) {
    // Canonical permission never uses the latency cache or a shared in-flight refresh.
    const sources = await loadAvailableContracts();
    const owner = sources.find((source) => source.sourceRole === "canonical");
    const current = owner?.contract.models.find((m) => (m.pi_model_id ?? m.id) === modelId);
    if (!owner || !current || owner.contract.schema_version !== 2)
      throw new Error(`capacity binding unavailable for ${modelId}`);
    assertCapacity(current);
    selected = {
      ...owner,
      model: current,
      generationId: workstationContractGenerationStatus().generationId ?? 0,
    };
  }
  if (!selected) {
    throw new Error(`model ${modelId} is not present in the current workstation contracts`);
  }

  const healthMode = options.healthMode ?? (options.checkHealth ? "blocking" : "skip");
  if (healthMode !== "skip") {
    const unhealthy = await checkHealth(selected.contract, options.signal, healthMode);
    if (unhealthy) throw new Error(`workstation inference endpoint is not healthy: ${unhealthy}`);
  }

  // Typed per-lane truth (IW9): a model whose lane is known-dead fails fast
  // with a lane-named error instead of an opaque upstream 502. Uses only the
  // already-cached probe result - no additional I/O, SWR semantics intact.
  const deadLane = deadLaneForModel(modelId);
  if (deadLane) {
    throw new Error(
      `workstation inference model ${modelId} maps to unhealthy lane ${deadLane.laneId}` +
        (deadLane.detail ? `: ${deadLane.detail}` : ""),
    );
  }

  return selected;
}

export function deadLaneForModel(modelId: string): { laneId: string; detail?: string } | undefined {
  for (const entry of workstationHealthStatus()) {
    for (const lane of entry.lanes ?? []) {
      if (!lane.healthy && lane.models.includes(modelId)) {
        return { laneId: lane.lane_id, detail: lane.detail };
      }
    }
  }
  return undefined;
}

export async function resolveContractStatus(
  options: { checkHealth?: boolean; signal?: AbortSignal; refreshContracts?: boolean } = {},
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
    const missing = error instanceof Error && error.name === "WorkstationContractMissing";
    return {
      status: missing ? "missing" : "invalid",
      declaration: missing ? "missing" : "invalid",
      summary: "workstation inference contract is not available",
      detail: refreshError ? `refresh failed: ${refreshError}; ${detail}` : detail,
      generation: workstationContractGenerationStatus(),
      health: workstationHealthStatus(),
    };
  }

  if (refreshError && loaded.contract.models.some((m) => "capacity" in m)) {
    return {
      status: "invalid",
      declaration: "invalid",
      summary: "canonical capacity source refresh failed; previous generation is not permission",
      detail: refreshError,
      generation: workstationContractGenerationStatus(),
      health: workstationHealthStatus(),
    };
  }
  const capacity = contractCapacityStatus(loaded.contract);
  const stale = staleDetail(loaded.contract);
  const advisory =
    [refreshError ? `contract refresh failed: ${refreshError}` : undefined, stale, ...sourceErrors]
      .filter((detail): detail is string => Boolean(detail))
      .join("; ") || undefined;

  if (options.checkHealth) {
    const unhealthy = await checkHealth(loaded.contract, options.signal, "blocking");
    if (unhealthy) {
      return {
        status: "unhealthy",
        declaration: "valid",
        capacity,
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
    declaration: "valid",
    capacity,
    source: loaded.source,
    summary: !capacity.some((m) => m.admissible)
      ? "workstation declaration is valid; no capacity-admissible models"
      : refreshError
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

function modelAdmission(model: ContractModel) {
  return optionalCapacityModels.has(model)
    ? { admissible: false as const, reason: "optional source is not canonical capacity authority" }
    : capacityAdmission(model.capacity);
}
export function contractCapacityStatus(contract: WorkstationInferenceContract) {
  return contract.models.map((m) => ({
    id: m.pi_model_id ?? m.id ?? "",
    ...("capacity" in m
      ? modelAdmission(m)
      : { admissible: true, reason: "legacy unrelated canary" }),
  }));
}
export function assertCapacity(model: ContractModel) {
  const admission = modelAdmission(model);
  if (!admission.admissible) throw new Error(admission.reason);
  return admission;
}

export function admissibleModels(contract: WorkstationInferenceContract): ContractModel[] {
  return contract.models.filter(
    (model) => !("capacity" in model) || modelAdmission(model).admissible,
  );
}

export function providerModel(model: ContractModel) {
  const capacity =
    "capacity" in model || SOMA_ALIASES.has(model.pi_model_id ?? model.id ?? "")
      ? assertCapacity(model)
      : undefined;
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
    contextWindow: capacity?.contextWindow ?? model.context_window ?? DEFAULT_CONTEXT_WINDOW,
    maxTokens: capacity?.maxTokens ?? model.max_tokens ?? DEFAULT_MAX_TOKENS,
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
