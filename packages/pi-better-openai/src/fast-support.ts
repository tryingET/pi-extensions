/** Shared eligibility only: never rewrite a selected provider or its credentials. */
import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import type { SupportedModel } from "./config.ts";

export function supportsFast(ctx: ExtensionContext, supportedModels: SupportedModel[]): boolean {
  const current = ctx.model;
  if (!current) return false;
  // Multi-pass retains the Codex API while assigning a numbered account provider.
  // Do not infer compatibility from a suffix alone or generalize other providers.
  const codexAccount =
    current.api === "openai-codex-responses" && /^openai-codex-[1-9]\d*$/.test(current.provider);
  return supportedModels.some(
    (model) =>
      (model.provider === current.provider ||
        (model.provider === "openai-codex" && codexAccount)) &&
      (model.id === "*" || model.id === current.id),
  );
}
