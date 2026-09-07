import { join } from "node:path";
import type { OAuthCredential } from "@earendil-works/pi-ai";
import { assertCredentialMetadata } from "./auth-metadata.js";
import type { CodexProfile } from "./codex.js";
import { assertSdkIdentity } from "./identity.js";
import { bytesDigest, digest, integer, parseJson, record, refuse, text } from "./json.js";
import {
  assertOwnerThinkingLevel,
  loadOwnerModel,
  modelResolution,
  profileResolution,
} from "./model-source.js";
import { canonicalPath, type Locator, privatePath, privateRead } from "./state.js";
export function hash(value: unknown): string {
  if (typeof value !== "string" || !/^[a-f0-9]{64}$/.test(value)) refuse("invalid_digest");
  return value;
}
export interface ProfilePin {
  schema: string;
  provider: string;
  model: string;
  reasoning: CodexProfile["reasoning"];
  account: string;
  modelDigest: string;
  modelSourceDigest?: string;
  credentialDigest: string;
  agentDir: string;
  runSeconds: number;
  producer: {
    executable: string;
    entrypointDigest: string;
    akBinaryDigest: string;
    policyDigest: string;
    databaseIdentity: string;
    hostBuildDigest: string;
  };
}
export function loadProfile(locator: Locator, reference: string): ProfilePin {
  hash(reference);
  privatePath(join(locator.root, "profiles"), true);
  const raw = parseJson(privateRead(join(locator.root, "profiles", `${reference}.json`)));
  const p = record(raw, [
    "schema",
    "provider",
    "model",
    "reasoning",
    "account",
    "modelDigest",
    "credentialDigest",
    "agentDir",
    "runSeconds",
    "producer",
    ...((raw as { schema?: unknown })?.schema === "pi.task-session.profile.v2"
      ? ["modelSourceDigest"]
      : []),
  ]);
  if (
    digest(p) !== reference ||
    !["pi.task-session.profile.v1", "pi.task-session.profile.v2"].includes(p.schema) ||
    (p.schema === "pi.task-session.profile.v1" && p.provider !== "openai-codex") ||
    !["off", "minimal", "low", "medium", "high", "xhigh", "max"].includes(p.reasoning)
  )
    refuse("profile_pin_mismatch");
  text(p.provider, 128);
  if (p.schema === "pi.task-session.profile.v2") hash(p.modelSourceDigest);
  text(p.model, 128);
  text(p.account, 128);
  hash(p.modelDigest);
  hash(p.credentialDigest);
  canonicalPath(p.agentDir);
  integer(p.runSeconds);
  if (p.runSeconds > 86400) refuse("run_deadline_invalid");
  const producer = record(p.producer, [
    "executable",
    "entrypointDigest",
    "akBinaryDigest",
    "policyDigest",
    "databaseIdentity",
    "hostBuildDigest",
  ]);
  canonicalPath(producer.executable);
  for (const key of [
    "entrypointDigest",
    "akBinaryDigest",
    "policyDigest",
    "databaseIdentity",
    "hostBuildDigest",
  ])
    hash(producer[key]);
  return structuredClone(p) as ProfilePin;
}
export async function loadHostProfile(locator: Locator, reference: string) {
  assertSdkIdentity();
  const p = loadProfile(locator, reference);
  privatePath(join(locator.root, "credentials"), true);
  const c = record(
    parseJson(privateRead(join(locator.root, "credentials", `${p.credentialDigest}.json`))),
    ["type", "access", "refresh", "expires"],
  );
  if (c.type !== "oauth" || digest(c) !== p.credentialDigest) refuse("credential_pin_mismatch");
  text(c.access);
  text(c.refresh);
  integer(c.expires);
  const runDeadline = Date.now() + p.runSeconds * 1000;
  assertCredentialMetadata(c as OAuthCredential, { account: p.account, runDeadline });
  // Pure built-in catalog only; no ModelRuntime/default config/auth store construction here.
  const { getModel, clampThinkingLevel } = await import("@earendil-works/pi-ai/compat");
  const requested = { provider: p.provider, model: p.model, account: p.account };
  const owned = p.modelSourceDigest
    ? loadOwnerModel(locator, p.modelSourceDigest, requested)
    : undefined;
  const model = owned ? owned.model : getModel("openai-codex", p.model as "gpt-5.4");
  if (!model || bytesDigest(JSON.stringify(model)) !== p.modelDigest) refuse("model_pin_mismatch");
  if (owned) assertOwnerThinkingLevel(model, p.reasoning);
  // Same pinned pure normalization used by createAgentSession; refuse, never downgrade.
  if (clampThinkingLevel(model, p.reasoning) !== p.reasoning)
    refuse("reasoning_profile_unsupported");
  const profile: CodexProfile = {
    model,
    resolution: owned?.resolution ?? modelResolution(model, requested, null),
    reasoning: p.reasoning,
    account: p.account,
    runDeadline,
  };
  return { pin: p, profile, credential: structuredClone(c) as OAuthCredential };
}

/** Read-only admission preflight: credentials never escape to the launch controller. */
export async function preflightProfile(locator: Locator, reference: string) {
  const loaded = await loadHostProfile(locator, reference);
  return { ...loaded.pin, resolution: profileResolution(loaded.profile) };
}
