import * as zlib from "node:zlib";
import type {
  Api,
  Context,
  CredentialStore,
  Model,
  ModelsSimpleStreamOptions,
  OAuthCredential,
} from "@earendil-works/pi-ai";
import { streamSimple as nativeCodexStream } from "@earendil-works/pi-ai/api/openai-codex-responses";
import { ModelRuntime } from "@earendil-works/pi-coding-agent";
import type { DispatchGuard } from "./dispatch.js";
import { bytesDigest, refuse } from "./json.js";
export const AUTH_MARGIN_MS = 360000; // native 5 minutes + versioned 60 second safety margin
export interface CodexProfile {
  model: Model<Api>;
  reasoning: "off" | "minimal" | "low" | "medium" | "high" | "xhigh" | "max";
  account: string;
  runDeadline: number;
}
export interface SendPort {
  send: typeof fetch;
} // private composition, never a public export or CLI field
export function readonlyCredentials(
  credential: OAuthCredential,
  profile: CodexProfile,
  guard: DispatchGuard,
): CredentialStore {
  const snapshot = structuredClone(credential);
  return Object.freeze({
    async read(providerId: string) {
      guard.assert();
      if (providerId !== profile.model.provider) guard.deny("credential_provider_mismatch");
      if (
        snapshot.type !== "oauth" ||
        snapshot.expires <= Math.max(Date.now(), profile.runDeadline) + AUTH_MARGIN_MS
      )
        guard.deny("auth_refresh_required");
      return structuredClone(snapshot);
    },
    async list() {
      return [{ providerId: profile.model.provider, type: "oauth" as const }];
    },
    async modify() {
      return guard.deny("credential_mutation_forbidden");
    },
    async delete() {
      guard.deny("credential_mutation_forbidden");
    },
  });
}
function accountId(access: string): string {
  try {
    return JSON.parse(Buffer.from(access.split(".")[1], "base64url").toString("utf8"))[
      "https://api.openai.com/auth"
    ].chatgpt_account_id;
  } catch {
    return refuse("credential_account_invalid");
  }
}
/** Per-request post-serializer and actual-send boundary. Never installs a global network hook. */
export function guardedCodexOptions(
  profile: CodexProfile,
  credential: OAuthCredential,
  guard: DispatchGuard,
  port: SendPort,
  options: ModelsSimpleStreamOptions = {},
) {
  let expected: string | undefined;
  let sent = false;
  if (
    (options.transport !== undefined && options.transport !== "sse") ||
    (options.maxRetries !== undefined && options.maxRetries !== 0) ||
    options.fetch ||
    options.apiKey ||
    options.headers ||
    options.env ||
    options.onPayload ||
    options.transformHeaders
  )
    guard.deny("provider_override_forbidden");
  return {
    ...options,
    apiKey: credential.access,
    reasoning: profile.reasoning === "off" ? undefined : profile.reasoning,
    transport: "sse" as const,
    maxRetries: 0,
    onPayload(payload: unknown) {
      guard.assert();
      const p = payload as {
        model?: string;
        stream?: boolean;
        store?: boolean;
        reasoning?: { effort?: string };
      };
      const effort =
        profile.reasoning === "off"
          ? undefined
          : (profile.model.thinkingLevelMap?.[profile.reasoning] ?? profile.reasoning);
      if (
        p.model !== profile.model.id ||
        p.stream !== true ||
        p.store !== false ||
        p.reasoning?.effort !== effort
      )
        guard.deny("codex_payload_drift");
      const body = JSON.stringify(payload);
      if (Buffer.byteLength(body) > 1048576) guard.deny("codex_payload_budget");
      expected = bytesDigest(body);
      return payload;
    },
    async fetch(input: string | URL | Request, init?: RequestInit): Promise<Response> {
      guard.assert();
      if (sent || !expected) guard.deny("codex_retry_or_unbound_send");
      if (
        String(input) !== "https://chatgpt.com/backend-api/codex/responses" ||
        init?.method !== "POST"
      )
        guard.deny("codex_endpoint_mismatch");
      if (credential.expires <= Math.max(Date.now(), profile.runDeadline) + AUTH_MARGIN_MS)
        guard.deny("auth_refresh_required");
      const headers = new Headers(init.headers);
      if (
        headers.get("authorization") !== `Bearer ${credential.access}` ||
        headers.get("chatgpt-account-id") !== profile.account
      )
        guard.deny("codex_account_mismatch");
      let bytes: Uint8Array;
      const body = init.body;
      if (typeof body === "string" && !headers.has("content-encoding")) bytes = Buffer.from(body);
      else if (body instanceof Uint8Array && headers.get("content-encoding") === "zstd") {
        if (body.byteLength > 1048576) guard.deny("codex_payload_budget");
        const decompress = (
          zlib as unknown as {
            zstdDecompressSync?: (b: Uint8Array, o: { maxOutputLength: number }) => Buffer;
          }
        ).zstdDecompressSync;
        if (!decompress) guard.deny("zstd_unsupported");
        try {
          bytes = decompress?.(body, { maxOutputLength: 1048576 });
        } catch {
          return guard.deny("codex_compression_invalid");
        }
      } else return guard.deny("codex_body_unsupported");
      if (bytes.byteLength > 1048576 || bytesDigest(bytes) !== expected)
        guard.deny("codex_wire_payload_drift");
      guard.assert();
      sent = true;
      // No await between final checks and the sole network call. Redirects cannot change account/endpoint.
      return port.send(input, { ...init, redirect: "error" });
    },
  };
}
export async function codexRuntime(
  profileInput: CodexProfile,
  credentialInput: OAuthCredential,
  guard: DispatchGuard,
  assertContext: (context: Context) => void,
  port: SendPort,
): Promise<ModelRuntime> {
  const profile = structuredClone(profileInput),
    credential = structuredClone(credentialInput);
  if (
    profile.model.provider !== "openai-codex" ||
    profile.model.api !== "openai-codex-responses" ||
    profile.model.baseUrl !== "https://chatgpt.com/backend-api" ||
    profile.model.headers ||
    profile.model.samplingParams
  )
    refuse("codex_profile_unsupported");
  if (
    credential.type !== "oauth" ||
    accountId(credential.access) !== profile.account ||
    credential.expires <= profile.runDeadline + AUTH_MARGIN_MS
  )
    refuse("auth_refresh_required_or_account_mismatch");
  const runtime = await ModelRuntime.create({
    credentials: readonlyCredentials(credential, profile, guard),
    modelsPath: null,
    refreshOnCreate: false,
    allowModelNetwork: false,
  });
  const nativeAuth = runtime.getAuth.bind(runtime);
  const blocked = async () => guard.deny("model_runtime_sealed");
  for (const key of [
    "refresh",
    "login",
    "logout",
    "setRuntimeApiKey",
    "removeRuntimeApiKey",
    "fetchDeferred",
    "cancelDeferred",
  ] as const)
    Object.defineProperty(runtime, key, { value: blocked });
  const oauth = runtime.getProvider("openai-codex")?.auth.oauth;
  if (!oauth) refuse("native_codex_missing");
  // Preload only native pure OAuth derivation before PREPARED. No refresh/login path is available.
  await oauth.toAuth(credential);
  oauth.refresh = blocked;
  oauth.login = blocked;
  Object.defineProperty(runtime, "getAuth", {
    value: async (model: Model<Api> | string, options?: Record<string, unknown>) => {
      guard.assert();
      if (
        (typeof model === "string"
          ? model !== profile.model.provider
          : JSON.stringify(model) !== JSON.stringify(profile.model)) ||
        (options && Object.keys(options).some((k) => k !== "signal"))
      )
        guard.deny("auth_override_forbidden");
      if (credential.expires <= Math.max(Date.now(), profile.runDeadline) + AUTH_MARGIN_MS)
        guard.deny("auth_refresh_required");
      return nativeAuth(model as Model<Api>, options);
    },
  });
  Object.defineProperty(runtime, "getModel", {
    value: (provider: string, model: string) =>
      provider === profile.model.provider && model === profile.model.id
        ? structuredClone(profile.model)
        : undefined,
  });
  Object.defineProperty(runtime, "streamSimple", {
    value: async (model: Model<Api>, context: Context, options?: ModelsSimpleStreamOptions) => {
      guard.assert();
      assertContext(context);
      if (JSON.stringify(model) !== JSON.stringify(profile.model)) guard.deny("model_drift");
      await runtime.getAuth(model);
      guard.assert();
      assertContext(context);
      return nativeCodexStream(
        model as Model<"openai-codex-responses">,
        context,
        guardedCodexOptions(profile, credential, guard, port, options),
      );
    },
  });
  // Unused APIs cannot silently select another serializer or objective.
  Object.defineProperty(runtime, "stream", { value: () => guard.deny("raw_stream_forbidden") });
  return runtime;
}
