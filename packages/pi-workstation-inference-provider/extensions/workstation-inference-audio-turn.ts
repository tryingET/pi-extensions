import { createHash } from "node:crypto";
import type { ExtensionAPI, ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import { armAudio, parseAudioSendArgs, readBoundedAudio } from "./workstation-audio.ts";
import {
  WORKBENCH_MODEL_ID,
  WORKBENCH_PROVIDER_ID,
  type WorkbenchInheritedAuthorityChannel,
} from "./workstation-authority-channel.ts";
import {
  audioPolicy,
  DEFAULT_PROVIDER_ID,
  notifyOrLog,
  resolveContractForModel,
} from "./workstation-inference-contract.ts";
import {
  assertLegacyAudioOwnerContract,
  assertWorkbenchAudioOwnerContract,
  clearCurrentAudio,
  currentAudio,
  quarantineCurrentAudio,
  setCurrentAudio,
} from "./workstation-inference-stream.ts";
import {
  clearSchedulerHandoff,
  consumeSchedulerHandoff,
  parseGovernedAudioSendArgs,
  quarantineSchedulerHandoff,
  readSchedulerHandoff,
} from "./workstation-scheduler.ts";

export async function sendAudioTurn(
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
  assertLegacyAudioOwnerContract(selected.contract, policy);
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
    setCurrentAudio(attachment);
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

export async function sendWorkbenchAudioTurn(
  pi: ExtensionAPI,
  rawArgs: string,
  ctx: ExtensionCommandContext,
  authority: WorkbenchInheritedAuthorityChannel,
): Promise<void> {
  if (!ctx.isIdle()) throw new Error("workbench-audio-send requires an idle Pi session");
  await quarantineCurrentAudio(pi, "superseded-before-provider-dispatch");
  const model = ctx.model;
  if (model?.provider !== WORKBENCH_PROVIDER_ID || model.id !== WORKBENCH_MODEL_ID) {
    throw new Error("select the exact Workbench Inkling provider model before audio-send");
  }

  const binding = await authority.arm();
  let audio: Awaited<ReturnType<typeof readBoundedAudio>> | undefined;
  try {
    const selected = await resolveContractForModel(model.id, {
      checkHealth: true,
      signal: ctx.signal,
    });
    const providerId = selected.contract.provider_id ?? DEFAULT_PROVIDER_ID;
    if (providerId !== WORKBENCH_PROVIDER_ID) {
      throw new Error("Workbench authority is bound to the exact workstation provider");
    }
    const policy = audioPolicy(selected.model);
    if (!policy)
      throw new Error("selected workstation model does not advertise native audio input");
    assertWorkbenchAudioOwnerContract(selected.contract, policy);
    const parsed = parseAudioSendArgs(rawArgs);
    audio = await readBoundedAudio(parsed.path, ctx.cwd, policy);
    if (createHash("sha256").update(audio.data).digest("hex") !== binding.audio_sha256) {
      throw new Error("Workbench authority audio digest does not match the staged input");
    }
    const attachment = armAudio({
      providerId,
      modelId: model.id,
      payloadModel: selected.model.upstream_model ?? model.id,
      format: audio.format,
      data: audio.data,
      authority,
    });
    setCurrentAudio(attachment);
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
      setCurrentAudio(attachment);
      throw error;
    }
    notifyOrLog(
      ctx,
      `workbench-audio-send armed ${audio.format} (${audio.data.length} bytes) for ${model.provider}/${model.id}; inherited authority, at most one provider dispatch, no tools, no automatic retry`,
    );
  } catch (error) {
    const pending = currentAudio();
    if (pending?.authority === authority) {
      try {
        await quarantineCurrentAudio(pi, "workbench-arm-failed", pending);
      } catch {
        // Lost disposition acknowledgement is terminal and never permits a retry.
      }
    } else {
      audio?.data.fill(0);
      if (["armed", "authorized"].includes(authority.state)) {
        try {
          await authority.reportDisposition("not_dispatched", "none");
        } catch {
          // Lost disposition acknowledgement is terminal and never permits a retry.
        }
      }
    }
    throw error;
  }
}
