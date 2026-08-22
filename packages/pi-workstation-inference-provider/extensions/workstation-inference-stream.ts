import {
  type Api,
  type AssistantMessageEventStream,
  type Context,
  createAssistantMessageEventStream,
  type Model,
  type SimpleStreamOptions,
  streamSimpleOpenAICompletions,
} from "@earendil-works/pi-ai/compat";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import {
  type ArmedAudio,
  type AudioInputPolicy,
  assertAudioAttachmentValidAtProviderWrite,
  clearArmedAudio,
  hasAudioMarker,
  latestUserAudioMarker,
  transformAudioPayload,
} from "./workstation-audio.ts";
import {
  type TerminalProviderClass,
  WORKBENCH_PROFILE_ID,
} from "./workstation-authority-channel.ts";
import { createGovernedWorkbenchHttpFetch } from "./workstation-governed-http.ts";
import {
  audioPolicy,
  contractApiKey,
  DEFAULT_PROVIDER_ID,
  INKLING_CANARY_MODEL_ID,
  LEGACY_INKLING_PROFILE_ID,
  normalizeBaseUrl,
  providerModel,
  resolveContractForModel,
  staleDetail,
  type WorkstationInferenceContract,
} from "./workstation-inference-contract.ts";
import {
  clearSchedulerHandoff,
  completeSchedulerHandoff,
  consumeSchedulerHandoff,
  quarantineSchedulerHandoff,
} from "./workstation-scheduler.ts";

let armedAudio: ArmedAudio | undefined;

export function setCurrentAudio(attachment: ArmedAudio): void {
  armedAudio = attachment;
}

export function currentAudio(): ArmedAudio | undefined {
  return armedAudio;
}

export function clearCurrentAudio(expected?: ArmedAudio): void {
  if (!expected || armedAudio?.nonce === expected.nonce) armedAudio = clearArmedAudio(armedAudio);
}

async function reportInterruptedWorkbenchTurn(attachment: ArmedAudio): Promise<void> {
  const authority = attachment.authority;
  if (!authority || !["armed", "permitted", "expired", "dispatched"].includes(authority.state))
    return;
  if (authority.dispatchCount === 0) {
    await authority.reportDisposition("not_dispatched", "none");
  } else {
    await authority.reportDisposition("dispatch_ambiguous", "ambiguous");
  }
}

export async function quarantineCurrentAudio(
  pi: ExtensionAPI,
  reason: string,
  expected?: ArmedAudio,
): Promise<void> {
  if (!armedAudio || (expected && armedAudio.nonce !== expected.nonce)) return;
  const attachment = armedAudio;
  armedAudio = undefined;
  try {
    if (attachment.authority) {
      await reportInterruptedWorkbenchTurn(attachment);
    } else if (attachment.scheduler) {
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

export function assertWorkbenchAudioOwnerContract(
  contract: WorkstationInferenceContract,
  policy: AudioInputPolicy,
): void {
  assertAudioOwnerContract(contract, policy);
  if (contract.runtime_profile_id !== WORKBENCH_PROFILE_ID) {
    throw new Error("audio contract is not bound to the exact Workbench Inkling profile");
  }
}

export function assertLegacyAudioOwnerContract(
  contract: WorkstationInferenceContract,
  policy: AudioInputPolicy,
): void {
  assertAudioOwnerContract(contract, policy);
  if (contract.runtime_profile_id && contract.runtime_profile_id !== LEGACY_INKLING_PROFILE_ID) {
    throw new Error("legacy audio-send cannot consume the Workbench Inkling profile");
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
  "Inkling audio dispatch outcome is unknown. Automatic retry is disabled; explicit broker/owner disposition is required.";

function terminalProviderClass(event: unknown): TerminalProviderClass {
  if (!event || typeof event !== "object") return "ambiguous";
  const record = event as Record<string, unknown>;
  if (record.type === "error") return record.reason === "aborted" ? "aborted" : "error";
  const message =
    record.message && typeof record.message === "object"
      ? (record.message as Record<string, unknown>)
      : undefined;
  const reason = message?.stopReason ?? record.reason;
  return reason === "stop" || reason === "length" || reason === "error" || reason === "aborted"
    ? reason
    : "ambiguous";
}

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

  if (!isAudioAttempt && model.id === INKLING_CANARY_MODEL_ID) {
    queueMicrotask(() => {
      stream.push(
        errorEvent(
          model,
          "Inkling canary invocation requires /workstation-inference audio-send with an exact external scheduler claim; ordinary text/image requests are denied",
        ),
      );
      stream.end();
    });
    return stream;
  }

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
        healthMode: attachment ? "blocking" : "background",
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
        if (attachment.authority) {
          assertWorkbenchAudioOwnerContract(selected.contract, policy);
        } else {
          assertLegacyAudioOwnerContract(selected.contract, policy);
        }
        if (!hasAudioMarker(context.messages, attachment.marker)) {
          throw new Error("audio marker disappeared before provider serialization");
        }
        if (
          attachment.authority &&
          (options?.fetch || options?.onPayload || Object.keys(options?.headers ?? {}).length > 0)
        ) {
          throw new Error("Workbench governed dispatch rejects caller transport customization");
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
      const workbenchAuthority = attachment?.authority;
      let governedFetch = options?.fetch;
      if (workbenchAuthority && attachment) {
        const governedAttachment = attachment;
        governedFetch = createGovernedWorkbenchHttpFetch({
          expectedModel: payloadModel,
          atProviderWrite: () => {
            assertAudioAttachmentValidAtProviderWrite(governedAttachment);
            workbenchAuthority.consumeDispatchPermitAtProviderWrite();
          },
        });
      }
      const inner = streamSimpleOpenAICompletions(
        innerModel,
        attachment ? { ...context, tools: [] } : context,
        {
          ...options,
          apiKey: contractApiKey(selected.contract),
          maxRetries: attachment ? 0 : options?.maxRetries,
          fetch: governedFetch,
          onPayload: attachment
            ? async (payload, callbackModel) => {
                const inherited = await inheritedOnPayload?.(payload, callbackModel);
                const transformed = transformAudioPayload(inherited ?? payload, attachment);
                if (workbenchAuthority) {
                  await workbenchAuthority.authorizeDispatch();
                }
                return transformed;
              }
            : inheritedOnPayload,
        },
      );
      let providerError = false;
      let providerTerminalClass: TerminalProviderClass = "ambiguous";
      let pushAudioTerminal: (() => void) | undefined;
      for await (const event of inner) {
        if (attachment && event.type === "error") {
          providerError = true;
          providerTerminalClass = terminalProviderClass(event);
          pushAudioTerminal = () =>
            stream.push({
              ...event,
              error: { ...event.error, errorMessage: AUDIO_OUTCOME_UNKNOWN },
            });
        } else if (attachment && event.type === "done") {
          providerTerminalClass = terminalProviderClass(event);
          pushAudioTerminal = () => stream.push(event);
        } else {
          stream.push(event);
        }
      }
      if (attachment?.authority) {
        dispositionAttempted = true;
        const dispatched = attachment.authority.dispatchCount === 1;
        const disposition = !dispatched
          ? "not_dispatched"
          : providerError || providerTerminalClass === "ambiguous"
            ? "dispatch_ambiguous"
            : "stream_completed";
        await attachment.authority.reportDisposition(
          disposition,
          dispatched ? providerTerminalClass : "none",
        );
        pushAudioTerminal?.();
      } else if (attachment) {
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
      if (attachment?.authority && !dispositionAttempted) {
        dispositionAttempted = true;
        try {
          await reportInterruptedWorkbenchTurn(attachment);
        } catch {
          // A failed or lost report is terminal and never authorizes another provider dispatch.
        }
      } else if (
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
