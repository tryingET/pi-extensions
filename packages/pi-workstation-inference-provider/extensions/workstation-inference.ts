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
} from "@mariozechner/pi-ai";
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

type InputKind = "text" | "image";
type NotifyLevel = "info" | "warning" | "error";

type ThinkingLevelMap = {
  minimal?: string | null;
  low?: string | null;
  medium?: string | null;
  high?: string | null;
  xhigh?: string | null;
};

type ContractModel = {
  id?: string;
  pi_model_id?: string;
  name?: string;
  upstream_model?: string;
  context_window?: number;
  max_tokens?: number;
  reasoning?: boolean;
  thinking_level_map?: ThinkingLevelMap;
  thinking_format?: "qwen" | "qwen-chat-template";
  input?: InputKind[];
};

type WorkstationInferenceContract = {
  schema_version: 1;
  authority?: string;
  family?: string;
  surface?: string;
  generated_at?: string;
  stale_after_seconds?: number;
  refresh_after_seconds?: number;
  provider_id?: string;
  provider_name?: string;
  base_url: string;
  health_url?: string;
  api_key_env?: string;
  api_key?: string;
  recovery_hint?: string;
  models: ContractModel[];
};

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
const DEFAULT_CONTEXT_WINDOW = 131_072;
const DEFAULT_MAX_TOKENS = 16_384;
const DEFAULT_TIMEOUT_MS = 1_500;
const DEFAULT_API_KEY = "workstation-local";
const CONTRACT_ENV = "PI_WORKSTATION_INFERENCE_CONTRACT";
const CONTRACT_JSON_ENV = "PI_WORKSTATION_INFERENCE_CONTRACT_JSON";
const DEFAULT_CONTRACT_PATH = join(
  homedir(),
  "ai-society",
  "softwareco",
  "infra",
  "workstation",
  "phasee",
  "state",
  "workstation-inference-provider.json",
);

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function numberValue(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function inputListValue(value: unknown): InputKind[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const items = value
    .map((item) => stringValue(item))
    .filter((item): item is InputKind => item === "text" || item === "image");
  return items.length > 0 ? items : undefined;
}

function parseThinkingLevelMap(value: unknown): ThinkingLevelMap | undefined {
  if (!isRecord(value)) return undefined;
  const map: ThinkingLevelMap = {};
  for (const key of ["minimal", "low", "medium", "high", "xhigh"] as const) {
    const item = value[key];
    if (item === null || typeof item === "string") map[key] = item;
  }
  return Object.keys(map).length > 0 ? map : undefined;
}

function parseModel(value: unknown, index: number): ContractModel {
  if (!isRecord(value)) throw new Error(`models[${index}] must be an object`);
  const id = stringValue(value.id) ?? stringValue(value.pi_model_id);
  if (!id) throw new Error(`models[${index}] needs id or pi_model_id`);
  const rawThinkingFormat = stringValue(value.thinking_format);
  if (
    rawThinkingFormat &&
    rawThinkingFormat !== "qwen" &&
    rawThinkingFormat !== "qwen-chat-template"
  ) {
    throw new Error(`models[${index}].thinking_format must be qwen or qwen-chat-template`);
  }
  const thinkingFormat = rawThinkingFormat as ContractModel["thinking_format"];
  return {
    id,
    pi_model_id: id,
    name: stringValue(value.name) ?? id,
    upstream_model: stringValue(value.upstream_model),
    context_window: numberValue(value.context_window),
    max_tokens: numberValue(value.max_tokens),
    reasoning: typeof value.reasoning === "boolean" ? value.reasoning : undefined,
    thinking_level_map: parseThinkingLevelMap(value.thinking_level_map),
    thinking_format: thinkingFormat,
    input: inputListValue(value.input),
  };
}

function parseContract(payload: unknown): WorkstationInferenceContract {
  if (!isRecord(payload)) throw new Error("contract must be a JSON object");
  if (payload.schema_version !== 1) throw new Error("schema_version must be 1");
  const baseUrl = stringValue(payload.base_url);
  if (!baseUrl) throw new Error("base_url is required");
  if (!Array.isArray(payload.models) || payload.models.length === 0) {
    throw new Error("models must be a non-empty array");
  }
  return {
    schema_version: 1,
    authority: stringValue(payload.authority),
    family: stringValue(payload.family),
    surface: stringValue(payload.surface),
    generated_at: stringValue(payload.generated_at),
    stale_after_seconds: numberValue(payload.stale_after_seconds),
    refresh_after_seconds: numberValue(payload.refresh_after_seconds),
    provider_id: stringValue(payload.provider_id),
    provider_name: stringValue(payload.provider_name),
    base_url: baseUrl,
    health_url: stringValue(payload.health_url),
    api_key_env: stringValue(payload.api_key_env),
    api_key: stringValue(payload.api_key),
    recovery_hint: stringValue(payload.recovery_hint),
    models: payload.models.map(parseModel),
  };
}

async function loadContract(): Promise<LoadedContract> {
  const inline = process.env[CONTRACT_JSON_ENV];
  if (inline?.trim()) {
    return { contract: parseContract(JSON.parse(inline)), source: CONTRACT_JSON_ENV };
  }

  const path = process.env[CONTRACT_ENV]?.trim() || DEFAULT_CONTRACT_PATH;
  const text = await readFile(path, "utf8");
  return { contract: parseContract(JSON.parse(text)), source: path };
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

async function checkHealth(contract: WorkstationInferenceContract): Promise<string | undefined> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);
  try {
    const response = await fetch(contract.health_url ?? defaultHealthUrl(contract), {
      signal: controller.signal,
    });
    if (!response.ok) return `health returned HTTP ${response.status}`;
    return undefined;
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  } finally {
    clearTimeout(timeout);
  }
}

export async function resolveContractStatus(
  options: { checkHealth?: boolean } = {},
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
    const unhealthy = await checkHealth(loaded.contract);
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

export function streamWorkstationInference(
  model: Model<Api>,
  context: Context,
  options?: SimpleStreamOptions,
): AssistantMessageEventStream {
  const stream = createAssistantMessageEventStream();

  (async () => {
    try {
      const status = await resolveContractStatus({ checkHealth: true });
      if (status.status !== "ok" || !status.contract) {
        throw new Error(
          `${status.summary}: ${status.detail ?? status.contract?.recovery_hint ?? "no detail"}`,
        );
      }

      const contractModel = status.contract.models.find(
        (candidate) => (candidate.pi_model_id ?? candidate.id) === model.id,
      );
      if (!contractModel) {
        throw new Error(`model ${model.id} is not present in the current workstation contract`);
      }

      const inner = streamSimpleOpenAICompletions(
        {
          ...model,
          baseUrl: normalizeBaseUrl(status.contract.base_url),
          compat: providerModel(contractModel).compat,
        } as Model<"openai-completions">,
        context,
        {
          ...options,
          apiKey: contractApiKey(status.contract),
        },
      );
      for await (const event of inner) stream.push(event);
      stream.end();
    } catch (error) {
      stream.push({
        type: "error",
        reason: "error",
        error: {
          role: "assistant",
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
          stopReason: "error",
          errorMessage: error instanceof Error ? error.message : String(error),
          timestamp: Date.now(),
        },
      });
      stream.end();
    }
  })();

  return stream;
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
    api: "openai-completions",
    models: contract.models.map(providerModel),
    streamSimple: streamWorkstationInference,
  });
  return providerId;
}

export default async function (pi: ExtensionAPI) {
  const initial = await resolveContractStatus({ checkHealth: false });

  pi.registerCommand("workstation-inference", {
    description: "Show read-only workstation inference provider status",
    handler: async (args, ctx) => {
      const action = args.trim().toLowerCase() || "status";
      if (action === "help") {
        notifyOrLog(
          ctx,
          [
            "/workstation-inference status  Show contract and health status",
            "/workstation-inference contract  Show the expected contract path/env",
          ].join("\n"),
        );
        return;
      }
      if (action === "contract") {
        notifyOrLog(
          ctx,
          [
            `contract env: ${CONTRACT_ENV}`,
            `inline contract env: ${CONTRACT_JSON_ENV}`,
            `default path: ${DEFAULT_CONTRACT_PATH}`,
          ].join("\n"),
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
