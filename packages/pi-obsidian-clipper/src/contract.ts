import { constants } from "node:fs";
import { open } from "node:fs/promises";
import { homedir } from "node:os";
import { isAbsolute, join } from "node:path";

const LIMIT = 65536;
export const ALIAS = "baseline-multimodal";
function assert(ok: unknown, message: string): asserts ok {
  if (!ok) throw new Error(message);
}
function record(value: unknown): Record<string, unknown> {
  assert(value && typeof value === "object" && !Array.isArray(value), "Invalid contract object");
  return value as Record<string, unknown>;
}
function inspect(value: unknown, depth = 0) {
  assert(depth < 12, "Contract nesting limit");
  if (typeof value === "string") assert(value.length <= 4096, "Contract string limit");
  if (value && typeof value === "object") {
    assert(Object.keys(value).length <= 128, "Contract field limit");
    for (const [key, item] of Object.entries(value)) {
      assert(
        !/api.?key|authorization|password|secret|credential|access.?token|^(token|key|auth|headers)$/i.test(
          key,
        ),
        "Credential fields forbidden",
      );
      inspect(item, depth + 1);
    }
  }
}
export function loopback(value: unknown, path: string): string {
  assert(typeof value === "string" && value.length < 256, "Invalid loopback endpoint");
  const u = new URL(value);
  assert(
    ["http:", "https:"].includes(u.protocol) && ["127.0.0.1", "[::1]"].includes(u.hostname),
    "Endpoint must use literal loopback",
  );
  assert(
    !u.username && !u.password && !u.search && !u.hash && u.pathname === path && u.href === value,
    "Endpoint must be canonical and credential-free",
  );
  return u.href;
}
export function parseContract(text: string, now = Date.now()) {
  assert(Buffer.byteLength(text) <= LIMIT, "Contract byte limit");
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error("Invalid contract JSON");
  }
  inspect(raw);
  const c = record(raw);
  assert(
    c.schema_version === 1 &&
      c.authority === "workstation/lane-op" &&
      c.family === "baseline-text" &&
      c.surface === "canonical",
    "Wrong contract authority, schema or scope",
  );
  const baseUrl = loopback(c.base_url, "/v1");
  for (const [field, path] of [
    ["health_url", "/health"],
    ["models_url", "/v1/models"],
  ]) {
    const endpoint = loopback(c[field], path);
    assert(new URL(endpoint).origin === new URL(baseUrl).origin, "Mixed endpoint origins");
  }
  assert(
    typeof c.generated_at === "string" &&
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(c.generated_at),
    "Invalid contract timestamp",
  );
  const generated = Date.parse(c.generated_at);
  assert(
    Number.isFinite(generated) &&
      new Date(generated).toISOString().replace(".000Z", "Z") === c.generated_at &&
      generated <= now + 60000,
    "Invalid/future contract timestamp",
  );
  assert(
    Number.isInteger(c.refresh_after_seconds) &&
      Number(c.refresh_after_seconds) >= 1 &&
      Number(c.refresh_after_seconds) <= 86400,
    "Invalid freshness budget",
  );
  assert(
    Array.isArray(c.models) && c.models.length > 0 && c.models.length <= 32,
    "Invalid model list",
  );
  const models = c.models.map(record);
  const ids = models.map((m) => m.pi_model_id);
  assert(
    ids.every((id) => typeof id === "string" && /^[a-z0-9][a-z0-9._-]{0,127}$/.test(id)) &&
      new Set(ids).size === ids.length,
    "Invalid/duplicate model aliases",
  );
  const model = models.find((m) => m.pi_model_id === ALIAS);
  assert(
    model &&
      Array.isArray(model.input) &&
      model.input.length === 2 &&
      model.input.includes("text") &&
      model.input.includes("image"),
    "Required baseline-multimodal text+image alias absent",
  );
  for (const field of ["context_window", "max_tokens"])
    assert(
      Number.isInteger(model[field]) && Number(model[field]) > 0 && Number(model[field]) <= 2097152,
      "Invalid model bounds",
    );
  assert(
    Number(model.max_tokens) <= Number(model.context_window),
    "Output budget exceeds context window",
  );
  return {
    baseUrl,
    generatedAt: c.generated_at,
    freshness: now - generated > Number(c.refresh_after_seconds) * 1000 ? "stale" : "fresh",
    alias: ALIAS,
    capability: ["text", "image"],
  };
}
export async function readContract() {
  const path =
    process.env.PI_OBSIDIAN_CLIPPER_CONTRACT ??
    join(
      homedir(),
      "ai-society/softwareco/infra/workstation/phasee/state/workstation-inference-provider.json",
    );
  assert(
    isAbsolute(path) && path.length <= 4096,
    "Contract override must be a bounded absolute path",
  );
  const file = await open(
    path,
    constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
  ).catch(() => {
    throw new Error(
      "Trusted workstation contract missing or inaccessible; expected a regular non-symlink owner-installed file",
    );
  });
  try {
    const s = await file.stat();
    assert(
      s.isFile() && s.size <= LIMIT && !(s.mode & 0o022) && [0, process.getuid?.()].includes(s.uid),
      "Contract must be a bounded owner-installed regular file",
    );
    const buffer = Buffer.alloc(LIMIT + 1);
    const { bytesRead } = await file.read(buffer, 0, buffer.length, 0);
    assert(bytesRead <= LIMIT, "Contract byte limit");
    return parseContract(buffer.subarray(0, bytesRead).toString("utf8"));
  } finally {
    await file.close();
  }
}
export function recipe(c: ReturnType<typeof parseContract>) {
  assert(
    c.freshness === "fresh",
    "Contract declaration is stale; ask workstation owner to refresh it. No lifecycle action performed.",
  );
  return {
    schemaVersion: 1,
    declaration: c,
    liveHealth: "not-probed",
    liveAvailability: "not-probed",
    browserConfigured: "unknown",
    endpointAuthentication: "unknown",
    previewOnly: true,
    provider: {
      id: "workstation",
      name: "Workstation",
      baseUrl: `${c.baseUrl}/chat/completions`,
      apiKey: "",
      apiKeyRequired: true,
    },
    model: {
      id: "workstation-baseline-multimodal",
      providerId: "workstation",
      providerModelId: ALIAS,
      name: "Workstation baseline-multimodal",
      enabled: true,
    },
    defaultModel: "workstation-baseline-multimodal",
    payload: "text-only",
    apiKeyInstruction:
      "Native Custom provider UI always stores apiKeyRequired:true and Interpreter rejects an empty key before any request, even if the endpoint is keyless. Endpoint authentication is UNKNOWN until owner-verified. Operator supplies an owner-approved nonempty key-field value directly in Clipper; if a key is required, use the actual authorized key. Empty apiKey is an incomplete non-secret preview, not usable configuration. No dummy or blank credential is asserted to work. Never send keys to Pi.",
    steps: [
      "Open Clipper Settings > Interpreter; enable Interpreter, leave auto-run off.",
      "Add a custom Workstation provider using the full baseUrl above; preserve existing providers. Ask the endpoint owner to verify authentication and supply the required nonempty native UI key-field value, even for an owner-verified keyless endpoint. If that ID exists, inspect it manually rather than replacing it.",
      "Append and enable the model above under that provider; preserve existing models.",
      "Select Workstation baseline-multimodal as the default Interpreter model in the clip popup.",
      "Test explicitly in the browser. Browser loopback permission, CORS, authentication and JSON prompts_responses response support remain unverified. Do not import whole settings: that clears sync storage.",
    ],
    limitation:
      "The model supports text+image; current native Interpreter sends text strings only. No automatic image/video processing.",
  };
}
export async function command(args: string) {
  const action = args.trim() || "status";
  if (action === "help")
    return {
      schemaVersion: 1,
      commands: ["status", "setup", "help"],
      tools: ["obsidian_clipper_setup", "obsidian_clipper_extract"],
      save: "unsupported",
      diagnostics: "not implemented; no network probes or inference requests",
    };
  if (!["status", "setup"].includes(action)) throw new Error("Use status, setup or help");
  const c = await readContract();
  return action === "setup"
    ? recipe(c)
    : {
        schemaVersion: 1,
        declaration: c,
        liveHealth: "not-probed",
        liveAvailability: "not-probed",
        browserConfigured: "unknown",
        nativeArtifact: "not-checked",
        save: "unsupported",
      };
}
