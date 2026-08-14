/**
summary: "Registers GPT-5.6 Sol Pro controls, request injection, persistence, status, and diagnostics."
read_when:
  - "Changing Pro activation, Responses API/model gating, reasoning payloads, or Pro diagnostics."
*/
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import {
  DEFAULT_PRO_CONFIG,
  DEFAULT_PRO_MODELS,
  isRecord,
  type ResolvedConfig,
  readRawConfig,
  resolveConfig,
  type SupportedModel,
  writeConfig,
} from "../src/config.ts";

const PRO_COMMAND = "pro";
const PRO_FLAG = "pro";
const PRO_MODE = "pro";
const PRO_MODEL_ID = "gpt-5.6-sol";
const PRO_APIS = new Set(["openai-responses", "openai-codex-responses"]);
const PRO_STATUS_KEY = "better-openai-pro";

function currentModelKey(ctx: ExtensionContext): string {
  return ctx.model ? `${ctx.model.provider}/${ctx.model.id}` : "none";
}

function supportsConfiguredModel(
  ctx: ExtensionContext,
  supportedModels: SupportedModel[],
): boolean {
  const current = ctx.model;
  if (!current) return false;
  return supportedModels.some(
    (model) => model.provider === current.provider && (model.id === "*" || model.id === current.id),
  );
}

function supportsPro(ctx: ExtensionContext, supportedModels: SupportedModel[]): boolean {
  return Boolean(
    ctx.model &&
      ctx.model.id === PRO_MODEL_ID &&
      PRO_APIS.has(ctx.model.api) &&
      supportsConfiguredModel(ctx, supportedModels),
  );
}

function injectProMode(
  payload: Record<string, unknown>,
  modelId: string,
): Record<string, unknown> | undefined {
  if (payload.model !== modelId) return undefined;
  if (payload.reasoning !== undefined && !isRecord(payload.reasoning)) return undefined;
  return {
    ...payload,
    reasoning: {
      ...(isRecord(payload.reasoning) ? payload.reasoning : {}),
      mode: PRO_MODE,
    },
  };
}

function modelList(supportedModels: SupportedModel[]): string {
  return supportedModels.length > 0
    ? supportedModels.map((model) => `${model.provider}/${model.id}`).join(", ")
    : "none configured";
}

function proStateText(
  ctx: ExtensionContext,
  desiredActive: boolean,
  active: boolean,
  supportedModels: SupportedModel[],
): string {
  const model = currentModelKey(ctx);
  if (active) return `Pro request injection is on for ${model}.`;
  if (desiredActive && ctx.model?.api === "pi-messages") {
    return `Pro mode cannot be injected for ${model}: the current Pi pi-messages client contract does not expose Responses API reasoning.mode. Adding the route to models.json or supportedModels would not change that transport. Select openai-codex/gpt-5.6-sol or openai/gpt-5.6-sol.`;
  }
  if (desiredActive) {
    return `Pro mode is requested, but ${model} is not an eligible Responses API model. Supported models: ${modelList(supportedModels)}.`;
  }
  return `Pro request injection is off. Current model: ${model}.`;
}

export interface ProController {
  diagnostics(ctx: ExtensionContext): string[];
}

export function registerPro(pi: ExtensionAPI): ProController {
  let cachedConfig: ResolvedConfig | undefined;
  let desiredActive = false;
  let active = false;
  let lastInjectedAt: number | undefined;
  let lastInjectedModel: string | undefined;

  function updateStatus(ctx: ExtensionContext): void {
    if (ctx.hasUI) {
      ctx.ui.setStatus(PRO_STATUS_KEY, active ? "P+" : "P−");
    }
  }

  function reloadConfig(ctx: ExtensionContext): ResolvedConfig {
    cachedConfig = resolveConfig(ctx.cwd || process.cwd(), {
      allowProjectPro: ctx.isProjectTrusted?.() === true,
    });
    return cachedConfig;
  }

  function config(ctx: ExtensionContext): ResolvedConfig {
    return cachedConfig ?? initializeState(ctx);
  }

  function applyDesiredState(ctx: ExtensionContext, cfg = config(ctx)): void {
    active = desiredActive && supportsPro(ctx, cfg.pro.supportedModels);
  }

  function initializeState(ctx: ExtensionContext): ResolvedConfig {
    const cfg = reloadConfig(ctx);
    desiredActive = cfg.pro.desiredActive;
    applyDesiredState(ctx, cfg);
    return cfg;
  }

  function persist(nextConfig: ResolvedConfig): void {
    if (!nextConfig.proPersistState) return;
    const raw = readRawConfig(nextConfig.proConfigPath);
    writeConfig(nextConfig.proConfigPath, {
      ...raw,
      pro: {
        ...(isRecord(raw.pro) ? raw.pro : {}),
        desiredActive,
      },
    });
  }

  function setActive(ctx: ExtensionContext, next: boolean): void {
    const nextConfig = reloadConfig(ctx);
    desiredActive = next;
    applyDesiredState(ctx, nextConfig);
    persist(nextConfig);
    updateStatus(ctx);
    if (ctx.hasUI) {
      ctx.ui.notify(
        proStateText(ctx, desiredActive, active, nextConfig.pro.supportedModels),
        next && !active ? "warning" : "info",
      );
    }
  }

  pi.registerFlag(PRO_FLAG, {
    description: "Start with GPT-5.6 Sol Pro injection enabled (reasoning.mode=pro)",
    type: "boolean",
    default: false,
  });

  pi.registerCommand(PRO_COMMAND, {
    description: "Toggle GPT-5.6 Sol Pro request injection",
    handler: async (args, ctx) => {
      const arg = args.trim().toLowerCase();
      if (!arg) return setActive(ctx, !desiredActive);
      if (ctx.hasUI) ctx.ui.notify("Usage: /pro", "error");
    },
  });

  pi.on("session_start", (_event, ctx) => {
    const cfg = initializeState(ctx);
    if (pi.getFlag(PRO_FLAG) === true) desiredActive = true;
    applyDesiredState(ctx, cfg);
    updateStatus(ctx);
  });

  pi.on("model_select", (_event, ctx) => {
    const cfg = config(ctx);
    const wasActive = active;
    applyDesiredState(ctx, cfg);
    updateStatus(ctx);
    if (active !== wasActive && ctx.hasUI) {
      ctx.ui.notify(
        proStateText(ctx, desiredActive, active, cfg.pro.supportedModels),
        active ? "info" : "warning",
      );
    }
  });

  pi.on("before_provider_request", (event, ctx) => {
    const cfg = config(ctx);
    if (!active || !supportsPro(ctx, cfg.pro.supportedModels) || !ctx.model) return;
    if (!isRecord(event.payload)) return;
    const payload = injectProMode(event.payload, ctx.model.id);
    if (!payload) return;
    lastInjectedAt = Date.now();
    lastInjectedModel = currentModelKey(ctx);
    return payload;
  });

  const controller: ProController = {
    diagnostics(ctx) {
      const cfg = reloadConfig(ctx);
      applyDesiredState(ctx, cfg);
      updateStatus(ctx);
      return [
        `Pro desired: ${desiredActive}`,
        `Pro injection eligible: ${active}`,
        `Pro supported model: ${supportsPro(ctx, cfg.pro.supportedModels)}`,
        `Configured reasoning.mode: ${PRO_MODE}`,
        `Last Pro injection: ${lastInjectedAt ? `${new Date(lastInjectedAt).toLocaleTimeString()} (${lastInjectedModel})` : "never"}`,
        `Pro config: ${cfg.proConfigPath}`,
        `Project trusted: ${ctx.isProjectTrusted?.() === true}`,
      ];
    },
  };
  return controller;
}

export const _proTest = {
  DEFAULT_PRO_MODELS,
  DEFAULT_PRO_CONFIG,
  PRO_MODE,
  PRO_MODEL_ID,
  PRO_STATUS_KEY,
  supportsPro,
  injectProMode,
  proStateText,
};
