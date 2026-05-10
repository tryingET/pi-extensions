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
import { type Static, Type } from "typebox";
import { Value } from "typebox/value";

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

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
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
  return {
    ...contract,
    authority: stringValue(contract.authority),
    family: stringValue(contract.family),
    surface: stringValue(contract.surface),
    generated_at: stringValue(contract.generated_at),
    provider_id: stringValue(contract.provider_id),
    provider_name: stringValue(contract.provider_name),
    base_url: baseUrl,
    health_url: stringValue(contract.health_url),
    api_key_env: stringValue(contract.api_key_env),
    api_key: stringValue(contract.api_key),
    recovery_hint: stringValue(contract.recovery_hint),
    models: contract.models.map(normalizeModel),
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
