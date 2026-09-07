// summary: discovers Codex subscription models and projects multi-pass labels/restrictions without reading credentials.
// read_when: changing /limits account enumeration, project scope, or switch target selection.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { Api, Model } from "@earendil-works/pi-ai";
import {
  CONFIG_DIR_NAME,
  type ExtensionContext,
  getAgentDir,
} from "@earendil-works/pi-coding-agent";
import { limitsText } from "./codex-limits.ts";

export const isCodexProvider = (provider: string) => /^openai-codex(?:-\d+)?$/.test(provider);
export interface CodexAccount {
  provider: string;
  label: string;
  models: Model<Api>[];
  authenticated: boolean;
}
export interface LimitsAccountConfig {
  labels: Map<string, string>;
  allowed?: Set<string>;
}
function readOptionalJson(path: string): Record<string, unknown> {
  try {
    const text = readFileSync(path, "utf8");
    if (text.length > 1_000_000) throw new Error("Config is too large");
    const raw: unknown = JSON.parse(text);
    if (!raw || typeof raw !== "object" || Array.isArray(raw))
      throw new Error("Expected an object");
    return raw as Record<string, unknown>;
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") return {};
    throw new Error(`Cannot read ${path}. Fix the multi-pass config before opening /limits.`);
  }
}
export function parseLimitsAccountConfig(
  global: Record<string, unknown>,
  project: Record<string, unknown>,
): LimitsAccountConfig {
  const labels = new Map<string, string>();
  if (Array.isArray(global.subscriptions)) {
    for (const entry of global.subscriptions) {
      if (!entry || typeof entry !== "object") continue;
      const { provider, index, label } = entry;
      if (
        typeof provider === "string" &&
        /^[a-z0-9-]+$/.test(provider) &&
        Number.isInteger(index) &&
        index > 0
      ) {
        const id = `${provider}-${index}`;
        labels.set(id, typeof label === "string" && label.trim() ? limitsText(label.trim()) : id);
      }
    }
  }
  if (project.allowedSubs === undefined) return { labels };
  if (
    !Array.isArray(project.allowedSubs) ||
    project.allowedSubs.some((entry) => typeof entry !== "string")
  ) {
    throw new Error(
      "Invalid multi-pass allowedSubs: expected an array of provider names. No accounts were queried.",
    );
  }
  // Match multi-pass: an empty/blank array means unrestricted, not deny-all.
  const allowed = new Set<string>(
    project.allowedSubs.map((entry: string) => entry.trim()).filter(Boolean),
  );
  return { labels, allowed: allowed.size ? allowed : undefined };
}
export function loadLimitsAccountConfig(
  cwd: string,
  agentDir = getAgentDir(),
): LimitsAccountConfig {
  return parseLimitsAccountConfig(
    readOptionalJson(join(agentDir, "multi-pass.json")),
    readOptionalJson(join(cwd, CONFIG_DIR_NAME, "multi-pass.json")),
  );
}
export function collectCodexAccounts(
  ctx: ExtensionContext,
  config = loadLimitsAccountConfig(ctx.cwd),
): CodexAccount[] {
  const byProvider = new Map<string, Model<Api>[]>();
  for (const model of ctx.modelRegistry.getAll()) {
    if (!isCodexProvider(model.provider)) continue;
    const models = byProvider.get(model.provider) ?? [];
    models.push(model);
    byProvider.set(model.provider, models);
  }
  for (const id of config.labels.keys())
    if (isCodexProvider(id) && !byProvider.has(id)) byProvider.set(id, []);
  const accounts: CodexAccount[] = [];
  for (const [provider, models] of byProvider) {
    if (config.allowed && !config.allowed.has(provider)) continue;
    const authenticated = models.some((model) => ctx.modelRegistry.hasConfiguredAuth(model));
    if (provider === "openai-codex" && !authenticated && ctx.model?.provider !== provider) continue;
    accounts.push({
      provider,
      models,
      authenticated,
      label: config.labels.get(provider) ?? provider,
    });
  }
  return accounts.sort((a, b) =>
    a.provider.localeCompare(b.provider, undefined, { numeric: true }),
  );
}
export function accountModel(account: CodexAccount, currentId?: string): Model<Api> | undefined {
  return account.models.find((model) => model.id === currentId) ?? account.models[0];
}
