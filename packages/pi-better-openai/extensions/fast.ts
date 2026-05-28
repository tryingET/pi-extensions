import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import {
  CONFIG_BASENAME,
  configPaths,
  DEFAULT_CONFIG,
  DEFAULT_IMAGE_CONFIG,
  DEFAULT_SUPPORTED_MODELS,
  isRecord,
  normalizeModelKeys,
  parseModelKey,
  parseModels,
  type ResolvedConfig,
  readRawConfig,
  resolveConfig,
  type SupportedModel,
  writeConfig,
} from "../src/config.ts";
import { _imageTest, registerOpenAIImage } from "../src/image.ts";

const COMMAND = "fast";
const FLAG = "fast";
const SERVICE_TIER = "priority";

function currentModelKey(ctx: ExtensionContext): string {
  return ctx.model ? `${ctx.model.provider}/${ctx.model.id}` : "none";
}

function supportsFast(ctx: ExtensionContext, supportedModels: SupportedModel[]): boolean {
  const current = ctx.model;
  if (!current) return false;
  return supportedModels.some(
    (model) => model.provider === current.provider && model.id === current.id,
  );
}

function modelList(supportedModels: SupportedModel[]): string {
  return supportedModels.length > 0
    ? supportedModels.map((model) => `${model.provider}/${model.id}`).join(", ")
    : "none configured";
}

function stateText(
  ctx: ExtensionContext,
  desiredActive: boolean,
  active: boolean,
  supportedModels: SupportedModel[],
): string {
  const model = currentModelKey(ctx);
  if (active) return `Fast mode is on for ${model}.`;
  if (desiredActive) {
    return `Fast mode is requested, but inactive for unsupported model ${model}. Supported models: ${modelList(supportedModels)}.`;
  }
  return `Fast mode is off. Current model: ${model}.`;
}

export default function betterOpenAI(pi: ExtensionAPI): void {
  let cachedConfig: ResolvedConfig | undefined;
  let desiredActive = false;
  let active = false;
  let lastInjectedAt: number | undefined;
  let lastInjectedModel: string | undefined;
  let lastInjectedTier: string | undefined;

  function refresh(ctx: ExtensionContext): ResolvedConfig {
    cachedConfig = resolveConfig(ctx.cwd || process.cwd());
    desiredActive = cachedConfig.desiredActive;
    active = desiredActive && supportsFast(ctx, cachedConfig.supportedModels);
    return cachedConfig;
  }

  function config(ctx: ExtensionContext): ResolvedConfig {
    return cachedConfig ?? refresh(ctx);
  }

  function persist(nextConfig: ResolvedConfig): void {
    if (!nextConfig.persistState) return;
    writeConfig(nextConfig.configPath, {
      ...readRawConfig(nextConfig.configPath),
      active,
      desiredActive,
    });
  }

  function applyDesiredFastState(ctx: ExtensionContext, cfg = config(ctx)): void {
    active = desiredActive && supportsFast(ctx, cfg.supportedModels);
  }

  function setActive(ctx: ExtensionContext, next: boolean): void {
    const nextConfig = refresh(ctx);
    desiredActive = next;
    applyDesiredFastState(ctx, nextConfig);
    persist(nextConfig);
    if (next && !active) {
      ctx.ui.notify(
        `Fast mode requested, but ${currentModelKey(ctx)} is unsupported. It will activate automatically when you switch to a supported model: ${modelList(nextConfig.supportedModels)}.`,
        "warning",
      );
      return;
    }
    ctx.ui.notify(stateText(ctx, desiredActive, active, nextConfig.supportedModels), "info");
  }

  pi.registerFlag(FLAG, {
    description: "Start with OpenAI fast mode enabled (service_tier=priority)",
    type: "boolean",
    default: false,
  });

  pi.registerCommand(COMMAND, {
    description: "Toggle OpenAI fast mode",
    handler: async (args, ctx) => {
      const arg = args.trim().toLowerCase();
      if (!arg) return setActive(ctx, !desiredActive);
      ctx.ui.notify("Usage: /fast", "error");
    },
  });

  const image = registerOpenAIImage(pi, config);

  pi.registerCommand("openai-settings", {
    description: "Show Better OpenAI settings and diagnostics",
    handler: async (_args, ctx) => {
      const cfg = refresh(ctx);
      const imageDebug = await image.getDebug(ctx);
      ctx.ui.notify(
        [
          `Fast desired: ${desiredActive}`,
          `Fast active: ${active}`,
          `Current model: ${currentModelKey(ctx)}`,
          `Supported model: ${supportsFast(ctx, cfg.supportedModels)}`,
          `Configured service_tier: ${SERVICE_TIER}`,
          `Last injected: ${lastInjectedAt ? `${new Date(lastInjectedAt).toLocaleTimeString()} (${lastInjectedModel}, ${lastInjectedTier})` : "never"}`,
          `Image enabled: ${cfg.image.enabled}`,
          `Image default model: ${cfg.image.defaultModel}`,
          `Image default save: ${cfg.image.defaultSave}`,
          `Image auth found: ${imageDebug.authFound}`,
          `Image auth source: ${imageDebug.authSource ?? "none"}`,
          `Config: ${cfg.configPath}`,
        ].join("\n"),
        "info",
      );
    },
  });

  pi.on("model_select", (_event, ctx) => {
    const cfg = config(ctx);
    const wasActive = active;
    applyDesiredFastState(ctx, cfg);
    if (active !== wasActive) {
      persist(cfg);
      ctx.ui.notify(
        active
          ? stateText(ctx, desiredActive, active, cfg.supportedModels)
          : `Fast mode inactive for unsupported model ${currentModelKey(ctx)}.`,
        active ? "info" : "warning",
      );
    }
  });

  pi.on("before_provider_request", (event, ctx) => {
    const nextConfig = config(ctx);
    if (!active || !supportsFast(ctx, nextConfig.supportedModels) || !isRecord(event.payload)) {
      return;
    }
    lastInjectedAt = Date.now();
    lastInjectedModel = currentModelKey(ctx);
    lastInjectedTier = SERVICE_TIER;
    return { ...event.payload, service_tier: SERVICE_TIER };
  });
}

export const _test = {
  CONFIG_BASENAME,
  DEFAULT_SUPPORTED_MODELS,
  DEFAULT_CONFIG,
  DEFAULT_IMAGE_CONFIG,
  SERVICE_TIER,
  configPaths,
  parseModelKey,
  normalizeModelKeys,
  parseModels,
  resolveConfig,
  readRawConfig,
  supportsFast,
  imageTest: _imageTest,
};
