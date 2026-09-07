// Synthetic owner metadata; materialize independently so rejecting loaders cannot mint pins.
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { digest, sha } from "./pins.mjs";
export function provisionModel({ root, pin, state, scenario }) {
  mkdirSync(join(root, "model-sources"), { mode: 0o700 });
  const source = {
    schema: "pi.task-session.model-source.v1",
    implementation: "pinned-native-codex-sse-v1",
    requested: {
      provider: "synthetic-owner",
      model: "synthetic-requested-alias",
      account: pin.account,
    },
    resolved: {
      provider: "synthetic-wire-provider",
      model: "synthetic-native-wire-model",
      account: pin.account,
    },
    api: "openai-codex-responses",
    baseUrl: "https://chatgpt.com/backend-api",
    transport: "sse",
    auth: { kind: "oauth", provider: "openai-codex", refresh: false },
    metadata: {
      name: "Synthetic task5513 owner model",
      reasoning: true,
      input: ["text", "image"],
      contextWindow: 131072,
      maxTokens: 8192,
      costMicroUsdPerMillion: { input: 1250000, output: 9000000, cacheRead: 125000, cacheWrite: 0 },
      thinkingLevelMap: {
        off: "none",
        minimal: "minimal",
        low: "low",
        medium: "medium",
        high: "high",
        xhigh: "xhigh",
        max: null,
      },
    },
  };
  if (scenario.startsWith("owner-off-null")) {
    pin.reasoning = "off";
    source.metadata.thinkingLevelMap.off = null;
    if (scenario !== "owner-off-null-missing")
      for (const key of Object.keys(source.metadata.thinkingLevelMap))
        source.metadata.thinkingLevelMap[key] = null;
    if (scenario === "owner-off-null-nonreasoning") source.metadata.reasoning = false;
  }
  const m = source.metadata;
  const descriptor = {
    id: source.resolved.model,
    name: m.name,
    api: source.api,
    provider: source.resolved.provider,
    baseUrl: source.baseUrl,
    reasoning: m.reasoning,
    input: m.input,
    cost: {
      input: m.costMicroUsdPerMillion.input / 1e6,
      output: m.costMicroUsdPerMillion.output / 1e6,
      cacheRead: m.costMicroUsdPerMillion.cacheRead / 1e6,
      cacheWrite: m.costMicroUsdPerMillion.cacheWrite / 1e6,
    },
    contextWindow: m.contextWindow,
    maxTokens: m.maxTokens,
    thinkingLevelMap: m.thinkingLevelMap,
  };
  const sourceDigest = digest(source),
    modelDigest = sha(JSON.stringify(descriptor));
  state.durableWrite(join(root, "model-sources", `${sourceDigest}.json`), source, true);
  Object.assign(pin, {
    schema: "pi.task-session.profile.v2",
    ...source.requested,
    modelSourceDigest: sourceDigest,
    modelDigest,
  });
  return {
    schema: "pi.task-session.model-resolution.v1",
    implementation: source.implementation,
    requested: source.requested,
    resolved: source.resolved,
    sourceDigest,
    modelDigest,
  };
}
