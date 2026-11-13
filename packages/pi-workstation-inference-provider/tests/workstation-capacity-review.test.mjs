import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { normalizeContext } from "@earendil-works/pi-ai";
import installed from "../extensions/workstation-inference.ts";
import {
  clearWorkstationHealthCache,
  primeWorkstationHealth,
  __resetWorkstationInferenceCachesForTests as reset,
} from "../extensions/workstation-inference-contract.ts";
import providerOnly from "../extensions/workstation-inference-provider-only.ts";
import { parseContract } from "../extensions/workstation-inference-schema.ts";

const parity = JSON.parse(
  await readFile(new URL("./fixtures/capacity-identity-parity.json", import.meta.url), "utf8"),
);
const envs = [
  "PI_WORKSTATION_INFERENCE_CONTRACT_JSON",
  "PI_WORKSTATION_INFERENCE_CONTRACT",
  "PI_WORKSTATION_INFERENCE_CANARY_CONTRACT",
  "PI_WORKSTATION_INFERENCE_INKLING_CONTRACT",
];
async function fixture() {
  const c = JSON.parse(
    await readFile(
      new URL(
        "../examples/workstation-inference-provider.capacity-v2.example.json",
        import.meta.url,
      ),
      "utf8",
    ),
  );
  c.generated_at = new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
  c.models[0].capacity.source_generated_at = Date.now() / 1000 - 1;
  c.models[0].capacity.expires_at = Date.now() / 1000 + 590;
  return c;
}
async function isolated(run) {
  const oldEnv = Object.fromEntries(envs.map((key) => [key, process.env[key]]));
  const oldFetch = globalThis.fetch;
  const dir = await mkdtemp(join(tmpdir(), "ak8605-review-"));
  const registrations = [],
    sends = [],
    commands = new Map();
  let healthEffect = () => {};
  const set = (c) => {
    process.env[envs[0]] = JSON.stringify(c);
  };
  globalThis.fetch = async (_url, init) => {
    if (!init?.body) {
      await healthEffect();
      return Response.json({ status: "ok" });
    }
    sends.push(JSON.parse(init.body));
    return new Response(
      'data: {"id":"fake","choices":[{"index":0,"delta":{"content":"ok"},"finish_reason":"stop"}]}\n\ndata: [DONE]\n\n',
      { headers: { "Content-Type": "text/event-stream" } },
    );
  };
  const api = {
    on() {},
    unregisterProvider() {},
    registerProvider: (id, config) => registrations.push({ id, config }),
    registerCommand: (id, command) => commands.set(id, command),
  };
  const invoke = (config, options = {}) =>
    config
      .streamSimple(
        {
          ...config.models[0],
          provider: "workstation-inference",
          api: config.api,
          baseUrl: config.baseUrl,
        },
        normalizeContext({ messages: [{ role: "user", content: "offline", timestamp: 1 }] }),
        { maxRetries: 0, ...options },
      )
      .result();
  reset();
  for (const key of envs) delete process.env[key];
  try {
    await run({
      dir,
      set,
      api,
      registrations,
      sends,
      commands,
      invoke,
      setHealthEffect: (effect) => {
        healthEffect = effect;
      },
    });
  } finally {
    globalThis.fetch = oldFetch;
    reset();
    for (const [key, value] of Object.entries(oldEnv)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    await rm(dir, { recursive: true, force: true });
  }
}
for (const [name, factory] of [
  ["installed", installed],
  ["provider-only", providerOnly],
]) {
  test(`${name}: optional schema2 copy never resurrects omitted, invalid or missing primary capacity`, async () => {
    for (const withdrawal of ["omitted", "invalid", "missing"])
      await isolated(async ({ dir, set, api, registrations, sends, invoke }) => {
        const c = await fixture();
        c.models[0].pi_model_id = "baseline-text";
        const unavailable = structuredClone(c.models[0]);
        unavailable.pi_model_id = "baseline-multimodal";
        unavailable.capacity.availability = "unavailable";
        c.models.push(unavailable);
        const optional = join(dir, "optional.json");
        await writeFile(optional, JSON.stringify(c));
        process.env[envs[2]] = optional;
        set(c);
        await factory(api);
        const config = registrations[0].config;
        assert.equal((await invoke(config)).stopReason, "stop");
        sends.length = 0;
        if (withdrawal === "omitted") {
          c.models.shift();
          set(c);
        } else if (withdrawal === "invalid") process.env[envs[0]] = "{";
        else {
          delete process.env[envs[0]];
          process.env[envs[1]] = join(dir, "missing.json");
        }
        const result = await invoke(config);
        assert.equal(result.stopReason, "error", withdrawal);
        assert.equal(sends.length, 0, withdrawal);
        const before = registrations.length;
        if (name === "provider-only") await assert.rejects(() => factory(api));
        else await factory(api);
        assert.equal(
          registrations.length,
          before,
          "optional copy cannot register canonical identity either",
        );
      });
  });
  test(`${name}: binding comparison includes designated source ownership after awaited payload hook`, async () => {
    await isolated(async ({ dir, set, api, registrations, sends, invoke }) => {
      const c = await fixture();
      set(c);
      const alternate = join(dir, "same-bytes-other-source.json");
      await writeFile(alternate, JSON.stringify(c));
      await factory(api);
      const result = await invoke(registrations[0].config, {
        onPayload: async (payload) => {
          await Promise.resolve();
          delete process.env[envs[0]];
          process.env[envs[1]] = alternate;
          return payload;
        },
      });
      assert.equal(result.stopReason, "error");
      assert.equal(sends.length, 0);
    });
  });
}
for (const row of parity)
  test(`provider cross-consumer identity fixture: ${row.name}`, async () => {
    const c = await fixture();
    Object.assign(c.models[0], row.patch);
    if ("profile" in row) c.runtime_profile_id = row.profile;
    if (row.eligible) assert.equal(parseContract(c).models[0].pi_model_id, "baseline-multimodal");
    else assert.throws(() => parseContract(c), undefined, row.name);
  });

for (const withdrawal of ["unavailable", "omitted"])
  test(`installed status: withdrawal during awaited health cannot re-register ${withdrawal} capacity`, async () => {
    await isolated(
      async ({ dir, set, api, registrations, commands, sends, invoke, setHealthEffect }) => {
        const c = await fixture();
        c.models[0].pi_model_id = "baseline-text";
        const other = structuredClone(c.models[0]);
        other.pi_model_id = "baseline-multimodal";
        other.capacity.availability = "unavailable";
        c.models.push(other);
        const optional = join(dir, "copy.json");
        await writeFile(optional, JSON.stringify(c));
        process.env[envs[2]] = optional;
        set(c);
        await installed(api);
        await primeWorkstationHealth();
        clearWorkstationHealthCache();
        const old = registrations[0].config;
        setHealthEffect(async () => {
          await Promise.resolve();
          if (withdrawal === "omitted") c.models = [other];
          else c.models[0].capacity.availability = "unavailable";
          set(c);
        });
        await commands
          .get("workstation-inference")
          .handler("status", { hasUI: true, ui: { notify() {} } });
        assert.equal(
          registrations.length,
          1,
          "no second registration of withdrawn canonical capacity",
        );
        assert.equal((await invoke(old)).stopReason, "error");
        assert.equal(sends.length, 0);
      },
    );
  });
