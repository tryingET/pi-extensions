import { join } from "node:path";
import type { Api, Model } from "@earendil-works/pi-ai";
import { bytesDigest, digest, integer, parseJson, record, refuse, text } from "./json.js";
import { type Locator, privatePath, privateRead } from "./state.js";
export const NATIVE_CODEX_PROVIDER = "openai-codex";
export const NATIVE_CODEX_API = "openai-codex-responses";
export const NATIVE_CODEX_BASE_URL = "https://chatgpt.com/backend-api";
export interface ModelLabels {
  provider: string;
  model: string;
  account: string;
}
export interface ModelResolution {
  schema: "pi.task-session.model-resolution.v1";
  implementation: "pinned-native-codex-sse-v1";
  sourceDigest: string | null;
  requested: ModelLabels;
  resolved: ModelLabels;
  modelDigest: string;
}
function labels(value: unknown): ModelLabels {
  const v = record(value, ["provider", "model", "account"]);
  for (const k of ["provider", "model", "account"]) text(v[k], 128);
  return structuredClone(v) as ModelLabels;
}
export function nativeModelBoundary(model: Model<Api>): void {
  if (
    model.api !== NATIVE_CODEX_API ||
    model.baseUrl !== NATIVE_CODEX_BASE_URL ||
    model.headers ||
    model.samplingParams
  )
    refuse("owner_model_native_fit_required");
}
export function modelResolution(
  model: Model<Api>,
  requested: ModelLabels,
  sourceDigest: string | null,
): ModelResolution {
  nativeModelBoundary(model);
  return {
    schema: "pi.task-session.model-resolution.v1",
    implementation: "pinned-native-codex-sse-v1",
    sourceDigest,
    requested: structuredClone(requested),
    resolved: { provider: model.provider, model: model.id, account: requested.account },
    modelDigest: bytesDigest(JSON.stringify(model)),
  };
}
/** Literal metadata only; neither provider labels nor implementation names are import targets. */
export function loadOwnerModel(locator: Locator, reference: string, requested: ModelLabels) {
  if (!/^[a-f0-9]{64}$/.test(reference)) refuse("invalid_model_source_digest");
  privatePath(join(locator.root, "model-sources"), true);
  const raw = parseJson(privateRead(join(locator.root, "model-sources", `${reference}.json`)));
  const v = record(raw, [
    "schema",
    "implementation",
    "requested",
    "resolved",
    "api",
    "baseUrl",
    "transport",
    "auth",
    "metadata",
  ]);
  if (digest(v) !== reference) refuse("model_source_pin_mismatch");
  if (
    v.schema !== "pi.task-session.model-source.v1" ||
    v.implementation !== "pinned-native-codex-sse-v1" ||
    v.api !== NATIVE_CODEX_API ||
    v.baseUrl !== NATIVE_CODEX_BASE_URL ||
    v.transport !== "sse"
  )
    refuse("owner_model_native_fit_required");
  const auth = record(v.auth, ["kind", "provider", "refresh"]);
  if (auth.kind !== "oauth" || auth.provider !== NATIVE_CODEX_PROVIDER || auth.refresh !== false)
    refuse("owner_model_native_fit_required");
  const original = labels(v.requested),
    resolved = labels(v.resolved);
  if (digest(original) !== digest(requested) || resolved.account !== original.account)
    refuse("model_source_identity_mismatch");
  const m = record(v.metadata, [
    "name",
    "reasoning",
    "input",
    "contextWindow",
    "maxTokens",
    "costMicroUsdPerMillion",
    "thinkingLevelMap",
  ]);
  text(m.name, 128);
  if (
    typeof m.reasoning !== "boolean" ||
    !Array.isArray(m.input) ||
    !m.input.includes("text") ||
    m.input.length > 2 ||
    new Set(m.input).size !== m.input.length ||
    m.input.some((v: unknown) => v !== "text" && v !== "image")
  )
    refuse("owner_model_metadata_invalid");
  integer(m.contextWindow);
  integer(m.maxTokens, m.contextWindow);
  const cost = record(m.costMicroUsdPerMillion, ["input", "output", "cacheRead", "cacheWrite"]);
  for (const value of Object.values(cost))
    if (!Number.isSafeInteger(value) || value < 0 || value > 1e12)
      refuse("owner_model_cost_invalid");
  const map = record(m.thinkingLevelMap, [
    "off",
    "minimal",
    "low",
    "medium",
    "high",
    "xhigh",
    "max",
  ]);
  // No concealed downgrade: each declared effort is identity-mapped (off maps to native none).
  for (const [level, value] of Object.entries(map))
    if (value !== null && value !== (level === "off" ? "none" : level))
      refuse("owner_model_reasoning_remap_forbidden");
  const model: Model<"openai-codex-responses"> = {
    id: resolved.model,
    name: m.name,
    api: NATIVE_CODEX_API,
    provider: resolved.provider,
    baseUrl: NATIVE_CODEX_BASE_URL,
    reasoning: m.reasoning,
    input: m.input,
    cost: {
      input: cost.input / 1e6,
      output: cost.output / 1e6,
      cacheRead: cost.cacheRead / 1e6,
      cacheWrite: cost.cacheWrite / 1e6,
    },
    contextWindow: m.contextWindow,
    maxTokens: m.maxTokens,
    thinkingLevelMap: Object.fromEntries(
      ["off", "minimal", "low", "medium", "high", "xhigh", "max"].map((k) => [k, map[k]]),
    ),
  };
  return { model, resolution: modelResolution(model, original, reference) };
}
export function profileResolution(profile: {
  model: Model<Api>;
  account: string;
  resolution?: ModelResolution;
}): ModelResolution {
  const r = profile.resolution;
  if (!r) {
    if (profile.model.provider !== NATIVE_CODEX_PROVIDER) refuse("owner_model_resolution_required");
    return modelResolution(
      profile.model,
      { provider: profile.model.provider, model: profile.model.id, account: profile.account },
      null,
    );
  }
  if (
    r.schema !== "pi.task-session.model-resolution.v1" ||
    r.implementation !== "pinned-native-codex-sse-v1" ||
    r.requested.account !== profile.account ||
    r.resolved.account !== profile.account ||
    r.resolved.provider !== profile.model.provider ||
    r.resolved.model !== profile.model.id ||
    r.modelDigest !== bytesDigest(JSON.stringify(profile.model)) ||
    (r.sourceDigest !== null && !/^[a-f0-9]{64}$/.test(r.sourceDigest))
  )
    refuse("model_resolution_drift");
  if (
    r.sourceDigest === null &&
    (r.requested.provider !== profile.model.provider ||
      r.requested.model !== profile.model.id ||
      profile.model.provider !== NATIVE_CODEX_PROVIDER)
  )
    refuse("owner_model_resolution_required");
  return structuredClone(r);
}
/** Flat, copied observation identity: requested labels never masquerade as wire identity. */
export function modelIdentity(profile: {
  model: Model<Api>;
  account: string;
  resolution?: ModelResolution;
}) {
  return resolutionIdentity(profileResolution(profile));
}
export function resolutionIdentity(r: ModelResolution) {
  return {
    provider: r.requested.provider,
    model: r.requested.model,
    account: r.requested.account,
    resolvedProvider: r.resolved.provider,
    resolvedModel: r.resolved.model,
    resolvedAccount: r.resolved.account,
    modelSourceDigest: r.sourceDigest ?? "builtin-sdk-0.84.4",
    modelResolutionDigest: digest(r),
    nativeImplementation: r.implementation,
    authProvider: NATIVE_CODEX_PROVIDER,
  };
}
