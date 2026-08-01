// ---
// summary: "Defines extension configuration and resolves the model-backed decision runtime used for governed autoresearch prompts."
// read_when:
//   - "Changing extension injection options, model authentication, prompt execution, or decision-response handling."
// ---
import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import type { AutoresearchDecisionRuntime } from "../../src/core/decisions-model.ts";
import type { AutoresearchLazyModules, PiAutoresearchModuleLoaders } from "./lazyModules.ts";
import type { AutoresearchExtensionEffectProfile } from "./readProfile.ts";
import type { AutoresearchTriggerSurface } from "./triggerPicker.ts";

export interface PiAutoresearchExtensionOptions {
  createDecisionRuntime?: (
    ctx: ExtensionContext,
    signal: AbortSignal | undefined,
  ) => AutoresearchDecisionRuntime;
  effectProfile?: AutoresearchExtensionEffectProfile;
  triggerSurface?: AutoresearchTriggerSurface | null;
  moduleLoaders?: Partial<PiAutoresearchModuleLoaders>;
}

export function resolveDecisionRuntime(
  ctx: ExtensionContext,
  signal: AbortSignal | undefined,
  options: PiAutoresearchExtensionOptions,
  modules: AutoresearchLazyModules,
): AutoresearchDecisionRuntime {
  return (
    options.createDecisionRuntime?.(ctx, signal) ??
    createDefaultDecisionRuntime(ctx, signal, modules)
  );
}

function createDefaultDecisionRuntime(
  ctx: ExtensionContext,
  signal: AbortSignal | undefined,
  modules: AutoresearchLazyModules,
): AutoresearchDecisionRuntime {
  let runtimePromise: Promise<AutoresearchDecisionRuntime> | null = null;
  const loadRuntime = () => {
    runtimePromise ??= (async () => {
      const decisionModule = await modules.decisions();
      signal?.throwIfAborted();
      return decisionModule.createAutoresearchDecisionRuntime({
        executePreparedPrompt: async (input) => {
          const operationSignal = input.signal ?? signal;
          operationSignal?.throwIfAborted();
          if (!ctx.model) {
            throw new Error(
              "No model selected for live pi-autoresearch Prompt Vault decisions in this session.",
            );
          }

          const auth = await ctx.modelRegistry.getApiKeyAndHeaders(ctx.model);
          operationSignal?.throwIfAborted();
          if (!auth.ok || !auth.apiKey) {
            throw new Error(auth.ok ? `No API key for ${ctx.model.provider}` : auth.error);
          }

          const { complete } = await modules.piAiCompat();
          operationSignal?.throwIfAborted();
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
              signal: operationSignal,
            },
          );
          operationSignal?.throwIfAborted();

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
    })();
    return runtimePromise;
  };

  return {
    async runSetup(packet, executionContext) {
      return (await loadRuntime()).runSetup(packet, executionContext);
    },
    async runNextHypothesis(packet, executionContext) {
      return (await loadRuntime()).runNextHypothesis(packet, executionContext);
    },
    async runFinalize(packet, executionContext) {
      return (await loadRuntime()).runFinalize(packet, executionContext);
    },
  };
}
