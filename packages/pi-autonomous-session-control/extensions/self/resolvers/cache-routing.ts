import type { SelfQuery, SelfResponse } from "../types.ts";

interface ContextUsageSnapshot {
  tokens?: number | null;
  contextWindow?: number;
  percent?: number | null;
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function contextUsage(query: SelfQuery | undefined): ContextUsageSnapshot | undefined {
  const value = query?.context?.contextUsage;
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const candidate = value as Record<string, unknown>;
  return {
    tokens:
      typeof candidate.tokens === "number" || candidate.tokens === null
        ? candidate.tokens
        : undefined,
    contextWindow:
      typeof candidate.contextWindow === "number" ? candidate.contextWindow : undefined,
    percent:
      typeof candidate.percent === "number" || candidate.percent === null
        ? candidate.percent
        : undefined,
  };
}

export function isCacheRoutingQuery(lower: string): boolean {
  return [
    "cache-aware delegation",
    "cache aware delegation",
    "cache routing",
    "cache-aware branch",
    "cache aware branch",
    "tree or fork",
    "tree then fork",
    "fork cache",
    "subagent cache strategy",
    "prompt cache strategy",
  ].some((keyword) => lower.includes(keyword));
}

export function resolveCacheRoutingQuery(query?: SelfQuery): SelfResponse {
  const usage = contextUsage(query);
  const provider = optionalString(query?.context?.modelProvider);
  const model = optionalString(query?.context?.modelId);
  const sessionFile = optionalString(query?.context?.sessionFile);
  const pressure =
    typeof usage?.percent === "number" && usage.percent >= 60
      ? ` Current context is ${usage.percent.toFixed(1)}% full, so copying it into a fork has material replay/attention cost.`
      : "";
  const codexNote =
    provider?.startsWith("openai-codex") === true
      ? " On the current OpenAI Codex transport, Pi derives prompt_cache_key from the Pi session ID; a fork/clone gets a new session ID, so parent-cache affinity is not preserved intentionally."
      : " Provider cache-key and retention behavior may differ; no branch operation can attest a provider KV-cache clone.";

  return {
    understood: true,
    intent: "meta",
    answer: `Cache-aware session routing is possible as advice, but not as a cache-hit guarantee:

- **/tree and continue in place**: best cache-affinity candidate. It preserves the Pi session ID and can restore an earlier textual prefix. Keep the same model, tools, system/context files, and avoid branch summarization when cache locality is the priority. This is sequential, not parallel.
- **/tree then /clone**: useful to shorten the active path before creating a separate session, but /clone allocates a new session ID. It can reduce replay volume; it does not preserve the parent's provider cache identity.
- **/fork**: directly selects an earlier user message and creates a new session. Use it when inherited conversation is essential, not as a cache optimization.
- **dispatch_subagent**: use for independent parallel cognition. ASC now keeps host/project context as the stable prefix and places role/task variation in the initial user message, reducing sibling fan-out tax without inheriting the controller's reasoning.

A model-callable tool must not execute /tree, /fork, or /clone during its own active turn: Pi exposes session replacement only to command contexts because replacing the session from a tool/event can deadlock or invalidate the running context. The safe ASC surface is this read-only self recommendation plus operator prefill (for example, self({ query: "Prefill: /tree" })).${pressure}${codexNote}

Measurement rule: compare first-turn uncached tokens and cache-read ratio, aggregate cache-read ratio, output tokens/provider cost, wall time, and an external quality/overlap evaluation. Provider usage cannot separately prove reasoning cost or result quality.`,
    data: {
      kind: "self.cache_routing_advice.v1",
      authority: "mirror_only",
      current: {
        provider,
        model,
        sessionPersisted: Boolean(sessionFile),
        contextUsage: usage,
      },
      routes: [
        {
          surface: "/tree",
          sessionIdentity: "preserved",
          parallel: false,
          cacheExpectation: "best_effort_highest",
          cacheGuarantee: false,
        },
        {
          surface: "/tree then /clone",
          sessionIdentity: "new_after_clone",
          separateSession: true,
          parallel: false,
          cacheExpectation: "replay_reduction_only",
          cacheGuarantee: false,
        },
        {
          surface: "/fork",
          sessionIdentity: "new",
          separateSession: true,
          parallel: false,
          cacheExpectation: "conversation_inheritance_not_cache_inheritance",
          cacheGuarantee: false,
        },
        {
          surface: "dispatch_subagent",
          sessionIdentity: "new_clean_child",
          parallel: true,
          cacheExpectation: "stable_infrastructure_prefix_across_siblings",
          cacheGuarantee: false,
        },
      ],
      treeThenFork: {
        canReduceCopiedHistory: true,
        preservesParentCacheIdentity: false,
        preferredEquivalent: "/tree then /clone when the selected active leaf is correct",
      },
      toolBoundary: {
        automaticSessionReplacementFromTool: false,
        reason:
          "Pi session replacement is command-context-only and unsafe during an active tool turn.",
        safeSurface: "read-only self advice plus operator-reviewed editor prefill",
      },
      requiredMeasurements: [
        "first_turn_uncached_tokens",
        "first_turn_cache_read_ratio",
        "aggregate_cache_read_ratio",
        "output_tokens_and_provider_cost",
        "wall_clock_time",
        "external_result_quality_and_overlap",
      ],
      nonAuthorizations: [
        "No claim that Pi tree/fork/clone clones provider KV cache state.",
        "No automatic tree navigation or session replacement.",
        "No inference of result quality from token usage.",
      ],
    },
    suggestions: [
      'Use self({ query: "Prefill: /tree" }) for operator-controlled in-place branching.',
      "Use /fork directly when an earlier user prompt and inherited history are actually required.",
      "Use dispatch_subagent for independent parallel review and inspect its cache measurement line.",
    ],
  };
}
