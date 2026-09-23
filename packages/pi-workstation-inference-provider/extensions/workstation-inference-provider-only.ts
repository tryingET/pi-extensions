/**
summary: "Explicit registration-only text/image entrypoint; never acquires audio or lifecycle authority."
read_when:
  - "Embedding workstation inference in a cold model-only worker."
*/
import {
  type Api,
  type AssistantMessageEventStream,
  type Context,
  createAssistantMessageEventStream,
  type Model,
  type SimpleStreamOptions,
} from "@earendil-works/pi-ai/compat";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { latestUserAudioMarker } from "./workstation-audio.ts";
import {
  type ContractModel,
  DEFAULT_PROVIDER_ID,
  DEFAULT_PROVIDER_NAME,
  INKLING_CANARY_MODEL_ID,
  normalizeBaseUrl,
  providerModel,
  resolveContractForModel,
  resolveContractStatus,
  WORKSTATION_API_ID,
  type WorkstationInferenceContract,
  workstationContractGenerationStatus,
} from "./workstation-inference-contract.ts";
import { currentAudio, streamWorkstationInference } from "./workstation-inference-stream.ts";

type Binding = Awaited<ReturnType<typeof resolveContractForModel>>;

/** Placeholder registration metadata, not a credential: invocation resolves the contract's key. */
const REGISTRATION_KEY_PLACEHOLDER = "workstation-local";

function supported(contract: WorkstationInferenceContract, model: ContractModel): boolean {
  return (
    contract.authority === "workstation/lane-op" &&
    !contract.runtime_profile_id &&
    model.pi_model_id !== INKLING_CANARY_MODEL_ID &&
    !model.audio_input &&
    !model.native_input_modalities?.includes("audio")
  );
}

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("provider-only content must be an object");
  }
  return value as Record<string, unknown>;
}

function assertImage(supportsImages: boolean, mimeType: unknown, data: unknown): void {
  if (!supportsImages) throw new Error("selected contract model does not support images");
  if (
    typeof mimeType !== "string" ||
    !/^image\/[a-z0-9.+-]+$/i.test(mimeType) ||
    typeof data !== "string" ||
    !data ||
    Buffer.from(data, "base64").toString("base64") !== data
  ) {
    throw new Error("provider-only requires an image MIME type and canonical inline base64");
  }
}

// Use the shared parser exactly: only complete v1 markers in the latest user's
// text imply an audio attempt. Prefix literals, history, schemas and arguments
// are ordinary application data, not transport authority.
function assertNoAudioAttempt(messages: unknown): void {
  if (latestUserAudioMarker(messages) !== undefined) {
    throw new Error("provider-only cannot admit a latest-user audio marker");
  }
}

function assertContext(context: Context, supportsImages: boolean): void {
  assertNoAudioAttempt(context.messages);
  for (const message of context.messages) {
    if (typeof message.content === "string") continue;
    if (!Array.isArray(message.content)) throw new Error("unsupported provider-only content");
    for (const value of message.content) {
      const block = record(value);
      if (block.type === "text" && typeof block.text === "string") continue;
      if (message.role === "assistant" && ["thinking", "toolCall"].includes(String(block.type))) {
        continue; // Tool arguments and thinking are data; do not recursively scan them.
      }
      if (block.type !== "image" || block.source !== undefined) {
        throw new Error(
          "provider-only supports Pi text/image content, not audio or unknown blocks",
        );
      }
      assertImage(supportsImages, block.mimeType, block.data);
    }
  }
}

// Validate actual OpenAI wire locations after the inherited hook. Do not walk
// tool schemas, tool-call arguments, metadata, or text looking for arbitrary keys.
function assertWirePayload(value: unknown, supportsImages: boolean): Record<string, unknown> {
  const payload = record(value);
  if (
    ["audio", "input_audio", "output_audio"].some((key) => key in payload) ||
    (payload.modalities !== undefined &&
      (!Array.isArray(payload.modalities) ||
        payload.modalities.some((modality) => modality !== "text")))
  ) {
    throw new Error("provider-only does not admit audio output or input options");
  }
  if (!Array.isArray(payload.messages)) throw new Error("provider-only payload needs messages");
  assertNoAudioAttempt(payload.messages);
  for (const value of payload.messages) {
    const message = record(value);
    if (["audio", "input_audio", "output_audio"].some((key) => key in message)) {
      throw new Error("provider-only does not admit message audio");
    }
    if (message.content == null || typeof message.content === "string") continue;
    if (!Array.isArray(message.content)) throw new Error("unsupported provider-only wire content");
    for (const value of message.content) {
      const block = record(value);
      if (block.type === "text" && typeof block.text === "string") continue;
      if (block.type !== "image_url") {
        throw new Error("provider-only wire content must be text or image_url");
      }
      const image = record(block.image_url);
      const match =
        typeof image.url === "string"
          ? /^data:(image\/[a-z0-9.+-]+);base64,(.*)$/i.exec(image.url)
          : null;
      if (
        !match ||
        (image.detail !== undefined && !["auto", "low", "high"].includes(String(image.detail)))
      ) {
        throw new Error("provider-only image_url must contain a valid inline image");
      }
      assertImage(supportsImages, match[1], match[2]);
    }
  }
  return payload;
}

function fingerprint(binding: Binding): string {
  return JSON.stringify([binding.contract, binding.model]);
}

function boundedStream(
  binding: Binding | undefined,
  model: Model<Api>,
  context: Context,
  options?: SimpleStreamOptions,
): AssistantMessageEventStream {
  const stream = createAssistantMessageEventStream();
  const checkBinding = async (expected: string) => {
    const selected = await resolveContractForModel(model.id, { checkHealth: false });
    if (
      !supported(selected.contract, selected.model) ||
      fingerprint(selected) !== expected ||
      workstationContractGenerationStatus().lastRefreshError
    ) {
      throw new Error("provider-only contract changed or became invalid; bootstrap again");
    }
  };
  (async () => {
    try {
      if (!binding) throw new Error("provider-only model is not registered; no fallback");
      const providerId = binding.contract.provider_id ?? DEFAULT_PROVIDER_ID;
      const id = binding.model.pi_model_id;
      const expected = fingerprint(binding);
      if (model.provider !== providerId || model.id !== id || model.api !== WORKSTATION_API_ID) {
        throw new Error(
          "provider-only requires an exact registered provider/model/API; no fallback",
        );
      }
      const supportsImages = binding.model.input?.includes("image") ?? false;
      assertContext(context, supportsImages);
      await checkBinding(expected);
      // The shared stream takes armedAudio synchronously. Check immediately
      // before entering it, with no intervening await, and never clean it up.
      if (currentAudio()) throw new Error("provider-only cannot consume shared armed audio");
      const inner = streamWorkstationInference(
        { ...model, ...providerModel(binding.model) } as Model<Api>,
        context,
        {
          ...options,
          onPayload: async (payload, callbackModel) => {
            const inherited = await options?.onPayload?.(payload, callbackModel);
            const finalPayload = assertWirePayload(inherited ?? payload, supportsImages);
            const payloadModel =
              binding.contract.family === "baseline-text"
                ? id
                : (binding.model.upstream_model ?? id);
            if (
              !finalPayload ||
              typeof finalPayload !== "object" ||
              (finalPayload as { model?: unknown }).model !== payloadModel ||
              callbackModel.id !== payloadModel ||
              callbackModel.baseUrl !== normalizeBaseUrl(binding.contract.base_url)
            ) {
              throw new Error("provider-only payload must retain the exact contract route");
            }
            // Recheck after asynchronous inherited hooks and shared resolution.
            await checkBinding(expected);
            return finalPayload;
          },
        },
      );
      for await (const event of inner) stream.push(event);
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
    } finally {
      stream.end();
    }
  })();
  return stream;
}

export default async function (pi: ExtensionAPI): Promise<void> {
  const initial = await resolveContractStatus({ checkHealth: false, refreshContracts: true });
  if (initial.status !== "ok" || !initial.contract || initial.generation?.lastRefreshError) {
    throw new Error(`provider-only contract unavailable: ${initial.detail ?? initial.summary}`);
  }
  const contract = initial.contract;
  const providerId = contract.provider_id ?? DEFAULT_PROVIDER_ID;
  const bindings = new Map<string, Binding>();
  for (const model of contract.models) {
    const binding = await resolveContractForModel(model.pi_model_id ?? model.id ?? "", {
      checkHealth: false,
    });
    if (!supported(binding.contract, binding.model)) continue;
    if ((binding.contract.provider_id ?? DEFAULT_PROVIDER_ID) !== providerId) {
      throw new Error("provider-only merged contracts disagree on provider identity");
    }
    bindings.set(binding.model.pi_model_id as string, binding);
  }
  if (!bindings.size) throw new Error("provider-only contract has no supported text/image models");
  pi.registerProvider(providerId, {
    name: contract.provider_name ?? DEFAULT_PROVIDER_NAME,
    baseUrl: normalizeBaseUrl(contract.base_url),
    // Registration is metadata only. Invocation uses the shared contract key
    // resolver, not Pi's config-value command/interpolation language.
    apiKey: REGISTRATION_KEY_PLACEHOLDER,
    api: WORKSTATION_API_ID,
    models: [...bindings.values()].map((binding) => providerModel(binding.model)),
    streamSimple: (model, context, options) => {
      const binding = bindings.get(model.id);
      // Unknown identities still terminate as a Pi error stream, never fallback.
      return boundedStream(binding, model, context, options);
    },
  });
}
