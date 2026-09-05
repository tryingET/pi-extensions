// summary: exact provider identity discovery and project-scoped /limits accounts; never resolves credentials.
// read_when: adding a subscription family or changing alias handling and account visibility.
import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import {
  collectCodexAccounts,
  isCodexProvider,
  type LimitsAccountConfig,
  loadLimitsAccountConfig,
} from "./codex-accounts.ts";
import { limitsText } from "./codex-limits.ts";
import type { LimitsAccount } from "./limits-types.ts";

// These are Pi identities, not fuzzy model/provider detection tokens. Aliases have no account contract yet.
export const LIMITS_PROVIDERS: Readonly<Record<string, { core: string; label: string }>> = {
  anthropic: { core: "anthropic", label: "Claude" },
  "github-copilot": { core: "copilot", label: "GitHub Copilot" },
  zai: { core: "zai", label: "z.ai" },
  xai: { core: "xai", label: "Grok / xAI" },
  "opencode-go": { core: "opencode", label: "OpenCode Go" },
  openrouter: { core: "openrouter", label: "OpenRouter" },
};
export const providerDefinition = (provider: string) =>
  Object.hasOwn(LIMITS_PROVIDERS, provider) ? LIMITS_PROVIDERS[provider] : undefined;
function aliasFamily(provider: string): string | undefined {
  return Object.keys(LIMITS_PROVIDERS).find((base) => new RegExp(`^${base}-\\d+$`).test(provider));
}
export function collectLimitsAccounts(
  ctx: ExtensionContext,
  config = loadLimitsAccountConfig(ctx.cwd),
): LimitsAccount[] {
  const accounts: LimitsAccount[] = collectCodexAccounts(ctx, config).map((account) => ({
    ...account,
    family: "Codex",
    label:
      config.labels.get(account.provider) ??
      (account.provider === "openai-codex" ? "Codex" : account.provider),
  }));
  const byProvider = new Map<string, LimitsAccount>();
  for (const model of ctx.modelRegistry.getAll()) {
    const provider = model.provider;
    if (isCodexProvider(provider) || (config.allowed && !config.allowed.has(provider))) continue;
    const definition = providerDefinition(provider);
    const alias = aliasFamily(provider);
    if (!definition && !alias) continue;
    let account = byProvider.get(provider);
    if (!account) {
      account = makeAccount(provider, config, definition ?? providerDefinition(alias ?? ""));
      byProvider.set(provider, account);
    }
    account.models.push(model);
    account.authenticated ||= ctx.modelRegistry.hasConfiguredAuth(model);
  }
  for (const provider of config.labels.keys()) {
    if (
      isCodexProvider(provider) ||
      (config.allowed && !config.allowed.has(provider)) ||
      byProvider.has(provider)
    )
      continue;
    const definition =
      providerDefinition(provider) ?? providerDefinition(aliasFamily(provider) ?? "");
    if (definition) byProvider.set(provider, makeAccount(provider, config, definition));
  }
  for (const account of byProvider.values()) {
    if (
      account.authenticated ||
      ctx.model?.provider === account.provider ||
      config.labels.has(account.provider)
    )
      accounts.push(account);
  }
  return accounts.sort((a, b) => a.label.localeCompare(b.label, undefined, { numeric: true }));
}
function makeAccount(
  provider: string,
  config: LimitsAccountConfig,
  definition?: { label: string },
): LimitsAccount {
  return {
    provider,
    label: config.labels.get(provider) ?? limitsText(definition?.label ?? provider),
    family: definition?.label,
    models: [],
    authenticated: false,
    ...(!providerDefinition(provider)
      ? {
          unsupportedReason:
            "This provider alias has no account-bound usage contract yet. Base-account quota is never borrowed.",
        }
      : {}),
  };
}
