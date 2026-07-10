import { complete } from "@earendil-works/pi-ai/compat";
import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import {
  type AutoresearchDecisionRuntime,
  createAutoresearchDecisionRuntime,
} from "../../src/core/decisions.ts";
import type { AutoresearchExtensionEffectProfile } from "./readProfile.ts";
import type { AutoresearchTriggerSurface } from "./triggerPicker.ts";

export interface PiAutoresearchExtensionOptions {
  createDecisionRuntime?: (
    ctx: ExtensionContext,
    signal: AbortSignal | undefined,
  ) => AutoresearchDecisionRuntime;
  effectProfile?: AutoresearchExtensionEffectProfile;
  triggerSurface?: AutoresearchTriggerSurface | null;
}

export function resolveDecisionRuntime(
  ctx: ExtensionContext,
  signal: AbortSignal | undefined,
  options: PiAutoresearchExtensionOptions,
): AutoresearchDecisionRuntime {
  return options.createDecisionRuntime?.(ctx, signal) ?? createDefaultDecisionRuntime(ctx, signal);
}

function createDefaultDecisionRuntime(
  ctx: ExtensionContext,
  signal: AbortSignal | undefined,
): AutoresearchDecisionRuntime {
  return createAutoresearchDecisionRuntime({
    executePreparedPrompt: async (input) => {
      if (!ctx.model) {
        throw new Error(
          "No model selected for live pi-autoresearch Prompt Vault decisions in this session.",
        );
      }

      const auth = await ctx.modelRegistry.getApiKeyAndHeaders(ctx.model);
      if (!auth.ok || !auth.apiKey) {
        throw new Error(auth.ok ? `No API key for ${ctx.model.provider}` : auth.error);
      }

      const response = await complete(
        ctx.model,
        {
          messages: [
            {
              role: "user",
              content: [{ type: "text", text: input.preparedText }],
              timestamp: Date.now(),
            },
          ],
        },
        {
          apiKey: auth.apiKey,
          headers: auth.headers,
          signal: input.signal ?? signal,
        },
      );

      if (response.stopReason === "aborted") {
        throw new Error("Prompt Vault decision execution aborted.");
      }

      const outputText = response.content
        .filter((content): content is { type: "text"; text: string } => content.type === "text")
        .map((content) => content.text)
        .join("\n")
        .trim();
      if (outputText.length === 0) {
        throw new Error("Prompt Vault decision execution returned no text output.");
      }

      return {
        outputText,
        model: ctx.model.id,
      };
    },
  });
}
