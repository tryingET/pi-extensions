/**
summary: "Stable versioned API for bounded, read-only context providers and omissions."
read_when:
  - "Adding a package consumer or changing the cross-package provider contract."
*/
import {
  markdownInlineLabel,
  publicOmissionDetail,
  repoRelativePathSafetyIssue,
  subprocessFailureDetail,
} from "./context-intake-safety.js";
import {
  collectVerifiedGitWorktreeState,
  createGitWorktreeProvider,
  parseGitPorcelainV1Z,
} from "./git-worktree-provider.js";

export const CONTEXT_PROVIDER_API_VERSION = 1;
export const CONTEXT_PROVIDER_RESULT_SCHEMA = "pi.context-provider-result.v1";
export const DEFAULT_CONTEXT_PROVIDER_LIMITS = Object.freeze({
  maxItems: 64,
  maxItemChars: 8_000,
  maxTotalChars: 32_000,
  maxOmissions: 64,
});

const SECRET_PATTERNS = Object.freeze([
  /-----BEGIN (?:RSA |EC |DSA |OPENSSH |PGP )?PRIVATE KEY-----[\s\S]*?-----END (?:RSA |EC |DSA |OPENSSH |PGP )?PRIVATE KEY-----/gu,
  /\b(?:gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{40,})\b/gu,
  /\bsk-(?:proj-|svcacct-)?[A-Za-z0-9_-]{20,}\b/gu,
  /\bxox[baprs]-[A-Za-z0-9-]{20,}\b/gu,
  /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/gu,
  /\bAIza[0-9A-Za-z_-]{30,}\b/gu,
  /\bnpm_[A-Za-z0-9]{30,}\b/gu,
  /\bpypi-[A-Za-z0-9_-]{30,}\b/gu,
  /\bBearer\s+[A-Za-z0-9._~+/-]{24,}={0,2}\b/giu,
  /\bhttps?:\/\/[^\s/:@]{1,128}:[^\s/@]{8,}@[^\s/]+/giu,
  /\b(?:api[_-]?key|access[_-]?token|auth[_-]?token|client[_-]?secret|password|passwd|private[_-]?key|secret|token)\b\s*(?:=|:)\s*["']?[^\s"'`,;]{12,}["']?/giu,
]);
const LOCAL_PATH_PATTERNS = Object.freeze([
  /\b[A-Za-z]:[\\/](?:[^\s"'`<>|]+[\\/])*[^\s"'`<>|]*/gu,
  /(?<![A-Za-z0-9:])\/(?:Users|home|private|tmp|var\/folders|mnt|workspace|workspaces)\/[^\s"'`<>]*/gu,
]);

function nonNegativeInteger(value, fallback) {
  return Number.isFinite(value) ? Math.max(0, Math.floor(value)) : fallback;
}

function normalizedLimits(value = {}) {
  return {
    maxItems: nonNegativeInteger(value.maxItems, DEFAULT_CONTEXT_PROVIDER_LIMITS.maxItems),
    maxItemChars: nonNegativeInteger(
      value.maxItemChars,
      DEFAULT_CONTEXT_PROVIDER_LIMITS.maxItemChars,
    ),
    maxTotalChars: nonNegativeInteger(
      value.maxTotalChars,
      DEFAULT_CONTEXT_PROVIDER_LIMITS.maxTotalChars,
    ),
    maxOmissions: nonNegativeInteger(
      value.maxOmissions,
      DEFAULT_CONTEXT_PROVIDER_LIMITS.maxOmissions,
    ),
  };
}

function redactProviderText(value, options = {}) {
  let text = String(value ?? "").replaceAll("\u0000", "");
  let redactionCount = 0;
  for (const pattern of SECRET_PATTERNS) {
    pattern.lastIndex = 0;
    text = text.replace(pattern, () => {
      redactionCount += 1;
      return "[redacted credential]";
    });
  }
  if (options.redactLocalPaths === true) {
    for (const pattern of LOCAL_PATH_PATTERNS) {
      pattern.lastIndex = 0;
      text = text.replace(pattern, () => {
        redactionCount += 1;
        return "[redacted local path]";
      });
    }
  }
  if (options.singleLine === true) {
    text = text
      .replace(/[\r\n\t]+/gu, " ")
      .replace(/\s{2,}/gu, " ")
      .trim();
  }
  return { text, redactionCount };
}

function safeLabel(value, fallback = "unknown") {
  const sanitized = redactProviderText(value, {
    redactLocalPaths: true,
    singleLine: true,
  }).text;
  return markdownInlineLabel(sanitized, fallback);
}

function providerIdentifier(value, field) {
  const normalized = String(value ?? "").trim();
  if (!/^[a-z][a-z0-9._-]{0,79}$/u.test(normalized)) {
    throw new Error(`Invalid read-only context provider ${field}`);
  }
  return normalized;
}

export function boundContextText(
  value,
  maxChars = DEFAULT_CONTEXT_PROVIDER_LIMITS.maxItemChars,
  options = {},
) {
  const sanitized = redactProviderText(value, options);
  const text = sanitized.text;
  const limit = nonNegativeInteger(maxChars, DEFAULT_CONTEXT_PROVIDER_LIMITS.maxItemChars);
  if (text.length <= limit) {
    return {
      text,
      truncated: false,
      originalChars: String(value ?? "").length,
      redactionCount: sanitized.redactionCount,
    };
  }
  if (limit === 0) {
    return {
      text: "",
      truncated: text.length > 0,
      originalChars: String(value ?? "").length,
      redactionCount: sanitized.redactionCount,
    };
  }
  const marker = "\n[... bounded by context provider API ...]";
  return {
    text:
      marker.length >= limit
        ? marker.slice(0, limit)
        : `${text.slice(0, limit - marker.length)}${marker}`,
    truncated: true,
    originalChars: String(value ?? "").length,
    redactionCount: sanitized.redactionCount,
  };
}

function normalizeStateValue(value, depth = 0, limits = {}, stats = { redactions: 0 }) {
  if (value === null || typeof value === "boolean") return value;
  if (typeof value === "number") return Number.isFinite(value) ? value : undefined;
  if (typeof value === "string") {
    const bounded = boundContextText(value, limits.maxStateStringChars ?? 1_000, {
      redactLocalPaths: true,
    });
    stats.redactions += bounded.redactionCount;
    return bounded.text;
  }
  if (depth >= (limits.maxStateDepth ?? 4)) return "[state depth bounded]";
  if (Array.isArray(value)) {
    return value
      .slice(0, limits.maxStateArrayItems ?? 64)
      .map((item) => normalizeStateValue(item, depth + 1, limits, stats))
      .filter((item) => item !== undefined);
  }
  if (!value || typeof value !== "object") return undefined;
  const out = {};
  const entries = Object.entries(value).slice(0, limits.maxStateObjectEntries ?? 80);
  for (const [key, candidate] of entries) {
    if (!/^[a-zA-Z][a-zA-Z0-9_-]{0,79}$/u.test(key)) continue;
    const normalized = normalizeStateValue(candidate, depth + 1, limits, stats);
    if (normalized !== undefined) out[key] = normalized;
  }
  return out;
}

function boundContextStateWithStats(value, options = {}) {
  const stats = { redactions: 0 };
  const state = normalizeStateValue(value, 0, options, stats);
  return { state, redactionCount: stats.redactions };
}

export function boundContextState(value, options = {}) {
  return boundContextStateWithStats(value, options).state;
}

export function createContextOmission(input = {}) {
  const provider = safeLabel(input.provider, "unknown");
  const reason = safeLabel(input.reason, "blocked");
  const publicDetail = publicOmissionDetail(input.detail, `${provider} ${reason} detail withheld`);
  return Object.freeze({
    provider,
    reason,
    detail: safeLabel(publicDetail, `${provider} ${reason} detail withheld`),
    ...(input.retryable === true ? { retryable: true } : {}),
  });
}

function normalizeProvenance(value, provider) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return { provider };
  const out = {};
  for (const [key, candidate] of Object.entries(value)) {
    if (key === "provider" || !/^[a-z][a-zA-Z0-9_-]{0,39}$/u.test(key)) continue;
    if (typeof candidate === "string") out[key] = safeLabel(candidate);
    else if (typeof candidate === "number" && Number.isFinite(candidate)) out[key] = candidate;
    else if (typeof candidate === "boolean") out[key] = candidate;
  }
  return { ...out, provider };
}

function normalizeContextItem(item, provider, limits) {
  if (!item || typeof item !== "object" || Array.isArray(item)) return undefined;
  const bounded = boundContextText(item.content, limits.maxItemChars, {
    redactLocalPaths: true,
  });
  if (!bounded.text.trim()) return undefined;
  const id = safeLabel(item.id, `${provider}:item`);
  return {
    id,
    kind: safeLabel(item.kind, "context"),
    content: bounded.text,
    provenance: normalizeProvenance(item.provenance, provider),
    authority: safeLabel(item.authority, "Source-owned read-only projection."),
    rationale: safeLabel(item.rationale, "Selected by the read-only provider."),
    freshness: safeLabel(item.freshness, "provider collection time"),
    bytes: Buffer.byteLength(bounded.text),
    estimatedTokens: Math.ceil(Buffer.byteLength(bounded.text) / 4),
    redactionCount: bounded.redactionCount,
    ...(bounded.truncated ? { truncated: true, originalChars: bounded.originalChars } : {}),
  };
}

export function boundContextItems(items, provider, options = {}) {
  const limits = normalizedLimits(options);
  const selected = [];
  const omissions = [];
  let totalChars = 0;
  let redactionCount = 0;
  const input = Array.isArray(items) ? items : [];

  for (let index = 0; index < input.length; index += 1) {
    const item = normalizeContextItem(input[index], provider, limits);
    if (!item) {
      omissions.push(
        createContextOmission({
          provider,
          reason: "invalid_item",
          detail: `item ${index + 1} had no safe bounded content`,
        }),
      );
      continue;
    }
    if (
      selected.length >= limits.maxItems ||
      totalChars + item.content.length > limits.maxTotalChars
    ) {
      omissions.push(
        createContextOmission({
          provider,
          reason: "budget",
          detail: `${item.id}: stable provider result budget exhausted`,
        }),
      );
      continue;
    }
    selected.push(item);
    totalChars += item.content.length;
    redactionCount += item.redactionCount;
  }

  return {
    items: selected,
    omissions,
    inputCount: input.length,
    selectedCount: selected.length,
    omittedCount: Math.max(0, input.length - selected.length),
    totalChars,
    redactionCount,
  };
}

export function defineReadOnlyContextProvider(definition) {
  if (!definition || typeof definition !== "object" || Array.isArray(definition)) {
    throw new Error("Read-only context provider definition must be an object");
  }
  const id = providerIdentifier(definition.id, "id");
  const version = providerIdentifier(definition.version ?? "v1", "version");
  if (typeof definition.collect !== "function") {
    throw new Error(`Read-only context provider '${id}' requires collect()`);
  }
  const authority = safeLabel(
    definition.authority,
    "Source-owned read-only projection; not a mutation or authorization surface.",
  );
  return Object.freeze({
    apiVersion: CONTEXT_PROVIDER_API_VERSION,
    id,
    version,
    authority,
    collect: definition.collect,
  });
}

function isAbort(error, signal) {
  return (
    signal?.aborted === true ||
    error?.name === "AbortError" ||
    /\b(?:aborted|cancelled)\b/iu.test(error instanceof Error ? error.message : String(error))
  );
}

export async function runReadOnlyContextProvider(provider, input = {}, options = {}) {
  if (!provider || provider.apiVersion !== CONTEXT_PROVIDER_API_VERSION) {
    throw new Error("Unsupported read-only context provider API version");
  }
  options.signal?.throwIfAborted?.();
  const startedAt = Date.now();
  try {
    const raw = (await provider.collect(input, options)) ?? {};
    options.signal?.throwIfAborted?.();
    const bounded = boundContextItems(raw.items, provider.id, options.limits);
    const limits = normalizedLimits(options.limits);
    const state = boundContextStateWithStats(raw.state, options.stateLimits);
    const omissions = [
      ...bounded.omissions,
      ...(Array.isArray(raw.omissions) ? raw.omissions : []).map((omission) =>
        createContextOmission({ ...omission, provider: provider.id }),
      ),
    ].slice(0, limits.maxOmissions);
    return {
      ok: raw.ok !== false,
      schema: CONTEXT_PROVIDER_RESULT_SCHEMA,
      apiVersion: CONTEXT_PROVIDER_API_VERSION,
      provider: provider.id,
      providerVersion: provider.version,
      authority: provider.authority,
      generatedAt: new Date().toISOString(),
      items: bounded.items,
      omissions,
      ...(state.state !== undefined ? { state: state.state } : {}),
      measurement: {
        durationMs: Math.max(0, Date.now() - startedAt),
        inputItems: bounded.inputCount,
        selectedItems: bounded.selectedCount,
        omittedItems: omissions.length,
        selectedChars: bounded.totalChars,
        redactions: bounded.redactionCount + state.redactionCount,
      },
      nonAuthorization:
        "This result is a bounded read-only projection. It did not mutate source state or authorize owner-surface actions.",
    };
  } catch (error) {
    if (isAbort(error, options.signal)) throw error;
    return {
      ok: false,
      schema: CONTEXT_PROVIDER_RESULT_SCHEMA,
      apiVersion: CONTEXT_PROVIDER_API_VERSION,
      provider: provider.id,
      providerVersion: provider.version,
      authority: provider.authority,
      generatedAt: new Date().toISOString(),
      items: [],
      omissions: [
        createContextOmission({
          provider: provider.id,
          reason: "unavailable",
          detail: subprocessFailureDetail(provider.id, error, "collection"),
          retryable: true,
        }),
      ],
      measurement: {
        durationMs: Math.max(0, Date.now() - startedAt),
        inputItems: 0,
        selectedItems: 0,
        omittedItems: 1,
        selectedChars: 0,
        redactions: 0,
      },
      nonAuthorization:
        "This failed read-only projection did not mutate source state or authorize owner-surface actions.",
    };
  }
}

export {
  collectVerifiedGitWorktreeState,
  createGitWorktreeProvider,
  markdownInlineLabel,
  parseGitPorcelainV1Z,
  publicOmissionDetail,
  repoRelativePathSafetyIssue,
  subprocessFailureDetail,
};

export const CONTEXT_PROVIDER_API_GLOBAL_SYMBOL = Symbol.for(
  "tryinget.pi-context-packer.provider-api.v1",
);

/**
 * Return the frozen cross-package surface. The object intentionally exposes
 * contracts and package-owned providers only, not context-pack planner internals.
 */
export function contextProviderApiSurface() {
  return Object.freeze({
    apiVersion: CONTEXT_PROVIDER_API_VERSION,
    schema: CONTEXT_PROVIDER_RESULT_SCHEMA,
    boundContextItems,
    boundContextState,
    boundContextText,
    collectVerifiedGitWorktreeState,
    createContextOmission,
    createGitWorktreeProvider,
    defineReadOnlyContextProvider,
    parseGitPorcelainV1Z,
    runReadOnlyContextProvider,
  });
}

/**
 * Publish the API through a well-known process-local symbol so independently
 * installed Pi packages can cooperate without a hard npm dependency or access
 * to implementation modules. Reloading the owning extension refreshes the
 * frozen surface for the current generation.
 */
export function installGlobalContextProviderApi(target = globalThis) {
  const surface = contextProviderApiSurface();
  Object.defineProperty(target, CONTEXT_PROVIDER_API_GLOBAL_SYMBOL, {
    configurable: true,
    enumerable: false,
    writable: true,
    value: surface,
  });
  return surface;
}

export function getGlobalContextProviderApi(target = globalThis) {
  const candidate = target?.[CONTEXT_PROVIDER_API_GLOBAL_SYMBOL];
  return candidate?.apiVersion === CONTEXT_PROVIDER_API_VERSION ? candidate : undefined;
}
