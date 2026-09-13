/**
summary: "Provides the minimal headless fast-mode request hook used by inherited subagent runtimes."
read_when:
  - "Changing how dispatched child Pi processes inherit Better OpenAI fast mode."
*/
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { isRecord, resolveConfig, type SupportedModel } from "../src/config.ts";
import { supportsFast } from "../src/fast-support.ts";

export const BETTER_OPENAI_FAST_MODE_ENV = "PI_BETTER_OPENAI_INHERITED_FAST_MODE";
const SERVICE_TIER = "priority";

function parseInheritedFastMode(
  value = process.env[BETTER_OPENAI_FAST_MODE_ENV],
): boolean | undefined {
  const normalized = value?.trim().toLowerCase();
  if (normalized === "on") return true;
  if (normalized === "off") return false;
  return undefined;
}

export default function inheritedFastMode(pi: ExtensionAPI): void {
  let desiredActive = false;
  let supportedModels: SupportedModel[] = [];

  function refresh(ctx: ExtensionContext): void {
    const config = resolveConfig(ctx.cwd || process.cwd());
    desiredActive = parseInheritedFastMode() ?? config.desiredActive;
    supportedModels = config.supportedModels;
  }

  pi.on("session_start", (_event, ctx) => {
    refresh(ctx);
  });

  pi.on("model_select", (_event, ctx) => {
    refresh(ctx);
  });

  pi.on("before_provider_request", (event, ctx) => {
    if (!desiredActive || !supportsFast(ctx, supportedModels) || !isRecord(event.payload)) {
      return;
    }
    return { ...event.payload, service_tier: SERVICE_TIER };
  });
}

export const _test = {
  SERVICE_TIER,
  parseInheritedFastMode,
  supportsFast,
};
