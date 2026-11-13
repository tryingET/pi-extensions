import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { normalizeContext } from "@earendil-works/pi-ai";
import installed from "../extensions/workstation-inference.ts";
import {
  CANARY_CONTRACT_ENV,
  CONTRACT_ENV,
  CONTRACT_JSON_ENV,
  clearWorkstationHealthCache,
  providerModel,
  __resetWorkstationInferenceCachesForTests as reset,
  resolveContractForModel,
  resolveContractStatus,
} from "../extensions/workstation-inference-contract.ts";
import providerOnly from "../extensions/workstation-inference-provider-only.ts";

function source() {
  const now = Date.now() / 1000;
  return {
    schema_version: 2,
    authority: "workstation/lane-op",
    family: "baseline-text",
    surface: "canonical",
    provider_id: "workstation-inference",
    base_url: "http://127.0.0.1:1200/v1",
    models: [
      {
        pi_model_id: "baseline-text",
        input: ["text"],
        capacity: {
          schema: "soma.capacity/v1",
          source_generated_at: now - 1,
          expires_at: now + 599,
          availability: "available",
          guaranteed: {
            state: "observed",
            context_window: 32768,
            max_output_tokens: 32767,
            max_tokens: 32767,
          },
        },
      },
    ],
  };
}
async function scenario(_t, run) {
  const old = process.env[CONTRACT_JSON_ENV];
  const registrations = [];
  const commands = new Map();
  const removed = [];
  const sends = [];
  let sessionStart;
  const api = {
    registerProvider: (id, config) => registrations.push({ id, config }),
    unregisterProvider: (id) => removed.push(id),
    registerCommand: (id, command) => commands.set(id, command),
    on: (event, handler) => {
      if (event === "session_start") sessionStart = handler;
    },
  };
  const oldFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    if (!init?.body) return Response.json({ status: "ok" });
    sends.push({ url: String(url), body: JSON.parse(init.body) });
    return new Response(
      'data: {"id":"fake","choices":[{"index":0,"delta":{"content":"ok"},"finish_reason":"stop"}]}\n\ndata: [DONE]\n\n',
      { headers: { "Content-Type": "text/event-stream" } },
    );
  };
  const set = (value) => {
    process.env[CONTRACT_JSON_ENV] = JSON.stringify(value);
  };
  const invoke = async (config, options = {}) => {
    const model = {
      ...config.models[0],
      provider: "workstation-inference",
      api: config.api,
      baseUrl: config.baseUrl,
    };
    return config
      .streamSimple(
        model,
        normalizeContext({ messages: [{ role: "user", content: "hello", timestamp: 1 }] }),
        { maxRetries: 0, ...options },
      )
      .result();
  };
  reset();
  try {
    await run({
      set,
      api,
      start: async (factory) => {
        await factory(api);
        await sessionStart?.({ type: "session_start", reason: "startup" });
      },
      registrations,
      commands,
      removed,
      sends,
      invoke,
    });
  } finally {
    globalThis.fetch = oldFetch;
    if (old === undefined) delete process.env[CONTRACT_JSON_ENV];
    else process.env[CONTRACT_JSON_ENV] = old;
    reset();
  }
}

test("schema1 canonical Soma hints cannot admit even when positive", async (t) => {
  await scenario(t, async ({ set }) => {
    const c = source();
    c.schema_version = 1;
    c.models[0].context_window = 262144;
    c.models[0].max_tokens = 131072;
    delete c.models[0].capacity;
    set(c);
    assert.equal((await resolveContractStatus()).status, "invalid");
  });
});

for (const [name, factory] of [
  ["installed", installed],
  ["provider-only", providerOnly],
]) {
  test(`${name}: warm selected generation is denied after withdrawal, without a transport send`, async (t) => {
    await scenario(t, async ({ set, api, registrations, sends, invoke }) => {
      const c = source();
      set(c);
      await factory(api);
      assert.equal(registrations.length, 1, "fresh schema2 must register");
      const config = registrations[0].config;
      assert.equal((await invoke(config)).stopReason, "stop");
      sends.length = 0;
      c.models[0].capacity.availability = "unavailable";
      set(c);
      const result = await invoke(config);
      assert.equal(result.stopReason, "error", result.errorMessage);
      assert.equal(sends.length, 0);
    });
  });
  test(`${name}: async payload hook cannot extend capacity or send after withdrawal`, async (t) => {
    await scenario(t, async ({ set, api, registrations, sends, invoke }) => {
      const c = source();
      set(c);
      await factory(api);
      assert.equal(registrations.length, 1, "fresh schema2 must register");
      const result = await invoke(registrations[0].config, {
        onPayload: async (payload) => {
          await Promise.resolve();
          c.models[0].capacity.availability = "unavailable";
          set(c);
          return { ...payload, max_tokens: 999999 };
        },
      });
      assert.equal(result.stopReason, "error", result.errorMessage);
      assert.equal(sends.length, 0);
    });
  });
}

test("unknown schema2 aliases remain descriptive but never use providerModel defaults", async (t) => {
  await scenario(t, async ({ set }) => {
    const c = source();
    c.models[0].capacity.current = {
      state: "observed",
      context_window: 262144,
      max_output_tokens: 262143,
      max_tokens: 262143,
    };
    c.models[0].capacity.guaranteed = {
      state: "unknown",
      context_window: null,
      max_output_tokens: null,
      max_tokens: null,
    };
    set(c);
    const status = await resolveContractStatus();
    assert.equal(status.status, "ok");
    assert.throws(() => providerModel(status.contract.models[0]), /capacity/i);
    assert.throws(() => providerModel({ pi_model_id: "baseline-text" }), /capacity/i);
  });
});

test("exact schema2 interface fixture survives real SDK transport only inside source expiry", async (t) => {
  await scenario(t, async ({ set, api, registrations, sends, invoke }) => {
    const c = JSON.parse(
      await readFile(
        new URL(
          "../examples/workstation-inference-provider.capacity-v2.example.json",
          import.meta.url,
        ),
        "utf8",
      ),
    );
    let clock = 1800000001000;
    t.mock.method(Date, "now", () => clock);
    set(c);
    await installed(api);
    assert.equal(registrations[0].config.models[0].id, "baseline-multimodal");
    assert.equal((await invoke(registrations[0].config)).stopReason, "stop");
    sends.length = 0;
    clock = 1800000590000;
    c.generated_at = new Date(Date.now()).toISOString();
    set(c);
    assert.equal((await invoke(registrations[0].config)).stopReason, "error");
    assert.equal(sends.length, 0);
  });
});

const denials = [
  [
    "unknown",
    (c) => {
      c.guaranteed = {
        state: "unknown",
        context_window: null,
        max_output_tokens: null,
        max_tokens: null,
      };
    },
  ],
  [
    "stale",
    (c) => {
      c.guaranteed.state = "stale";
    },
  ],
  [
    "contradictory",
    (c) => {
      c.guaranteed.state = "contradictory";
    },
  ],
  [
    "unavailable",
    (c) => {
      c.availability = "unavailable";
    },
  ],
  [
    "unknown availability",
    (c) => {
      c.availability = "unknown";
    },
  ],
  [
    "missing availability",
    (c) => {
      delete c.availability;
    },
  ],
  [
    "missing guarantee",
    (c) => {
      delete c.guaranteed;
    },
  ],
  [
    "old owner spelling",
    (c) => {
      c.guaranteed.context_tokens = c.guaranteed.context_window;
      delete c.guaranteed.context_window;
    },
  ],
  [
    "expired",
    (c) => {
      c.source_generated_at -= 601;
      c.expires_at -= 601;
    },
  ],
  [
    "future source",
    (c) => {
      c.source_generated_at += 100;
    },
  ],
  [
    "extended ttl",
    (c) => {
      c.expires_at = c.source_generated_at + 601;
    },
  ],
  [
    "missing source",
    (c) => {
      c.source_generated_at = null;
    },
  ],
  [
    "missing expiry",
    (c) => {
      delete c.expires_at;
    },
  ],
  [
    "unsafe integer",
    (c) => {
      c.guaranteed.context_window = Number.MAX_SAFE_INTEGER + 1;
    },
  ],
  [
    "fractional bound",
    (c) => {
      c.guaranteed.max_output_tokens = 3.5;
    },
  ],
  [
    "string bound",
    (c) => {
      c.guaranteed.context_window = "32768";
    },
  ],
  [
    "inconsistent output",
    (c) => {
      c.guaranteed.max_tokens = 16384;
    },
  ],
  [
    "null bounds",
    (c) => {
      c.guaranteed.context_window = null;
    },
  ],
];
for (const [name, factory] of [
  ["installed", installed],
  ["provider-only", providerOnly],
]) {
  test(`${name}: nonadmissible declaration matrix cannot register or send`, async (t) => {
    for (const [label, mutate] of denials)
      await scenario(t, async ({ set, api, start, registrations, sends }) => {
        const c = source();
        mutate(c.models[0].capacity);
        c.models[0].context_window = 262144;
        c.models[0].max_tokens = 131072;
        set(c);
        const status = await resolveContractStatus();
        assert.equal(status.declaration, "valid", label);
        assert.equal(status.capacity[0].admissible, false, label);
        if (name === "provider-only") await assert.rejects(() => start(factory));
        else await factory(api);
        assert.equal(registrations.length, 0, label);
        assert.equal(sends.length, 0, label);
      });
  });
  test(`${name}: all warm denial transitions fence an already-selected model`, async (t) => {
    for (const [label, mutate] of denials)
      await scenario(t, async ({ set, api, registrations, sends, invoke }) => {
        const c = source();
        set(c);
        await factory(api);
        const config = registrations[0].config;
        mutate(c.models[0].capacity);
        set(c);
        const result = await invoke(config);
        assert.equal(result.stopReason, "error", `${label}: ${result.errorMessage}`);
        assert.equal(sends.length, 0, label);
      });
  });
  test(`${name}: old schema1, omitted alias and malformed source cannot reuse warm capacity`, async (t) => {
    for (const transition of [
      (c) => {
        c.schema_version = 1;
        c.models[0].context_window = 262144;
        c.models[0].max_tokens = 131072;
      },
      (c) => {
        delete c.models[0].capacity;
      },
      (c) => {
        c.models = [];
      },
      () => null,
    ]) {
      await scenario(t, async ({ set, api, registrations, sends, invoke }) => {
        const c = source();
        set(c);
        await factory(api);
        const config = registrations[0].config;
        const value = transition(c);
        set(value === null ? null : c);
        const result = await invoke(config);
        assert.equal(result.stopReason, "error");
        assert.equal(sends.length, 0);
      });
    }
  });
  test(`${name}: serialized output reservations are owner-bounded, including hook/toJSON replacements`, async (t) => {
    await scenario(t, async ({ set, api, registrations, sends, invoke }) => {
      set(source());
      await factory(api);
      const config = registrations[0].config;
      for (const value of [999999, 32, undefined]) {
        const result = await invoke(config, {
          maxTokens: 131072,
          onPayload: async (payload) => {
            await Promise.resolve();
            return {
              ...payload,
              toJSON: () => {
                const p = { ...payload };
                delete p.max_tokens;
                delete p.max_completion_tokens;
                if (value !== undefined) {
                  p.max_tokens = value;
                  p.max_completion_tokens = value;
                }
                return p;
              },
            };
          },
        });
        assert.equal(result.stopReason, "stop", result.errorMessage);
        const body = sends.at(-1).body;
        assert.equal(body.max_tokens, value === 32 ? 32 : 32767);
        if (value !== undefined) assert.equal(body.max_completion_tokens, Math.min(value, 32767));
      }
      for (const value of [0, -1, 1.5, "100", null, Number.MAX_SAFE_INTEGER + 1]) {
        sends.length = 0;
        const result = await invoke(config, { onPayload: (p) => ({ ...p, max_tokens: value }) });
        assert.equal(result.stopReason, "error", String(value));
        assert.equal(sends.length, 0);
      }
    });
  });
  test(`${name}: callback-model mutation, wire route mutation and serialization-side withdrawal cannot send`, async (t) => {
    for (const hook of [
      (_p, m) => {
        m.baseUrl = "http://127.0.0.1:9/v1";
      },
      (p, m) => {
        m.id = "other";
        return p;
      },
      (p) => ({ ...p, model: "other" }),
      (p) => ({ ...p, toJSON: () => ({ ...p, model: "other" }) }),
    ]) {
      await scenario(t, async ({ set, api, registrations, sends, invoke }) => {
        set(source());
        await factory(api);
        assert.equal(
          (await invoke(registrations[0].config, { onPayload: hook })).stopReason,
          "error",
        );
        assert.equal(sends.length, 0);
      });
    }
    await scenario(t, async ({ set, api, registrations, sends, invoke }) => {
      const c = source();
      set(c);
      await factory(api);
      const result = await invoke(registrations[0].config, {
        onPayload: (p) => ({
          ...p,
          toJSON: () => {
            c.models[0].capacity.availability = "unavailable";
            set(c);
            return p;
          },
        }),
      });
      assert.equal(result.stopReason, "error");
      assert.equal(sends.length, 0);
    });
  });
  test(`${name}: source expires during awaited payload hook, independent of export clock`, async (t) => {
    await scenario(t, async ({ set, api, registrations, sends, invoke }) => {
      const now = Date.now();
      let clock = now;
      t.mock.method(Date, "now", () => clock);
      const c = source();
      set(c);
      await factory(api);
      const result = await invoke(registrations[0].config, {
        onPayload: async (p) => {
          await Promise.resolve();
          clock = now + 600000;
          c.generated_at = new Date(now + 600000).toISOString();
          set(c);
          return p;
        },
      });
      assert.equal(result.stopReason, "error");
      assert.equal(sends.length, 0);
    });
  });
}

test("installed: explicit status removes prior registration; selected objects still deny without claiming UI revocation", async (t) => {
  await scenario(t, async ({ set, api, registrations, removed, commands, sends, invoke }) => {
    const c = source();
    set(c);
    await installed(api);
    const config = registrations[0].config;
    c.models[0].capacity.availability = "unavailable";
    set(c);
    let notice = "";
    await commands.get("workstation-inference").handler("status", {
      hasUI: true,
      ui: {
        notify: (value) => {
          notice = value;
        },
      },
    });
    assert.deepEqual(removed, ["workstation-inference"]);
    assert.equal(registrations.length, 1);
    assert.match(notice, /registered_models: none/);
    assert.match(notice, /retained selected\/UI objects are fenced/);
    assert.equal((await invoke(config)).stopReason, "error");
    assert.equal(sends.length, 0);
  });
});
test("installed: a host without removal API reports retained registrations but cannot dispatch them", async (t) => {
  await scenario(t, async ({ set, api, registrations, commands, sends, invoke }) => {
    delete api.unregisterProvider;
    const c = source();
    set(c);
    await installed(api);
    const config = registrations[0].config;
    c.models[0].capacity.availability = "unavailable";
    set(c);
    let notice = "";
    await commands.get("workstation-inference").handler("status", {
      hasUI: true,
      ui: {
        notify: (value) => {
          notice = value;
        },
      },
    });
    assert.match(notice, /host cannot remove registration/);
    assert.match(notice, /registered_models: baseline-text/);
    assert.equal(registrations.length, 1);
    assert.equal((await invoke(config)).stopReason, "error");
    assert.equal(sends.length, 0);
  });
});

test("provider-only: explicit rebootstrap withdraws previous registration on same API", async (t) => {
  await scenario(t, async ({ set, api, start, registrations, removed }) => {
    const c = source();
    set(c);
    await providerOnly(api);
    c.models[0].capacity.availability = "unavailable";
    set(c);
    await assert.rejects(() => start(providerOnly));
    // Pre-bind queue cleanup followed by actual bound-runtime revocation.
    assert.deepEqual(removed, ["workstation-inference", "workstation-inference"]);
    assert.equal(registrations.length, 1);
  });
});
test("installed: selected old UI limits are not current limits; lower current guarantee bounds the actual body", async (t) => {
  await scenario(t, async ({ set, api, registrations, sends, invoke }) => {
    const c = source();
    set(c);
    await installed(api);
    c.models[0].capacity.guaranteed = {
      state: "observed",
      context_window: 8192,
      max_output_tokens: 8191,
      max_tokens: 8191,
    };
    set(c);
    const result = await invoke(registrations[0].config, {
      maxTokens: 131072,
      onPayload: (payload) => {
        // Pi may choose a smaller reservation; the later hook cannot restore old UI limits.
        assert.ok(payload.max_completion_tokens > 0 && payload.max_completion_tokens <= 8191);
        return { ...payload, max_completion_tokens: 131072 };
      },
    });
    assert.equal(result.stopReason, "stop", result.errorMessage);
    assert.equal(sends.at(-1).body.max_completion_tokens, 8191);
  });
});

for (const [name, factory] of [
  ["installed", installed],
  ["provider-only", providerOnly],
]) {
  test(`${name}: real source fixture file withdrawal fences warm cached selections`, async (t) => {
    const dir = await mkdtemp(join(tmpdir(), "ak8605-warm-file-"));
    const previous = process.env[CONTRACT_ENV];
    try {
      await scenario(t, async ({ api, registrations, sends, invoke }) => {
        const path = join(dir, "canonical.json");
        const c = JSON.parse(
          await readFile(
            new URL(
              "../examples/workstation-inference-provider.capacity-v2.example.json",
              import.meta.url,
            ),
            "utf8",
          ),
        );
        const proof = c.models[0].capacity;
        proof.source_generated_at = Date.now() / 1000 - 1;
        proof.expires_at = proof.source_generated_at + 590;
        await writeFile(path, JSON.stringify(c));
        delete process.env[CONTRACT_JSON_ENV];
        process.env[CONTRACT_ENV] = path;
        await factory(api);
        const config = registrations[0].config;
        assert.equal((await resolveContractForModel("baseline-multimodal")).source, path);
        assert.equal((await invoke(config)).stopReason, "stop");
        sends.length = 0;
        proof.guaranteed = {
          state: "unknown",
          context_window: null,
          max_output_tokens: null,
          max_tokens: null,
        };
        c.models[0].context_window = 262144;
        c.models[0].max_tokens = 131072;
        await writeFile(path, JSON.stringify(c));
        assert.equal((await invoke(config)).stopReason, "error");
        assert.equal(sends.length, 0);
        c.schema_version = 1;
        await writeFile(path, JSON.stringify(c));
        assert.equal((await invoke(config)).stopReason, "error");
        assert.equal(sends.length, 0);
      });
    } finally {
      if (previous === undefined) delete process.env[CONTRACT_ENV];
      else process.env[CONTRACT_ENV] = previous;
      await rm(dir, { recursive: true, force: true });
    }
  });
}

test("independent file sources preserve distinct legacy canaries, never resurrect a reserved canonical alias", async (t) => {
  const dir = await mkdtemp(join(tmpdir(), "ak8605-sources-"));
  const previous = process.env[CANARY_CONTRACT_ENV];
  try {
    const canary = join(dir, "canary.json");
    process.env[CANARY_CONTRACT_ENV] = canary;
    const legacy = {
      schema_version: 1,
      authority: "workstation/lane-op",
      family: "baseline-text",
      surface: "canary",
      provider_id: "workstation-inference",
      base_url: "http://127.0.0.1:1334/v1",
      models: [
        { pi_model_id: "baseline-text", context_window: 262144, max_tokens: 131072 },
        { pi_model_id: "distinct-legacy-canary", context_window: 8192, max_tokens: 512 },
      ],
    };
    await writeFile(canary, JSON.stringify(legacy));
    for (const primary of [null, { ...source(), schema_version: 1 }, source()]) {
      await scenario(t, async ({ set, api, registrations, sends, commands, invoke }) => {
        if (primary?.schema_version === 2) primary.models[0].capacity.availability = "unavailable";
        set(primary);
        await installed(api);
        assert.deepEqual(
          registrations[0].config.models.map((m) => m.id),
          ["distinct-legacy-canary"],
        );
        await assert.rejects(() => resolveContractForModel("baseline-text"));
        assert.equal(
          (await resolveContractForModel("distinct-legacy-canary")).model.max_tokens,
          512,
        );
        assert.equal(sends.length, 0);
        if (primary?.schema_version === 2) {
          const fake = globalThis.fetch;
          globalThis.fetch = async (input, init) =>
            !init?.body && String(input).includes(":1200/")
              ? new Response("unavailable", { status: 503 })
              : fake(input, init);
          clearWorkstationHealthCache();
          await commands
            .get("workstation-inference")
            .handler("status", { hasUI: true, ui: { notify() {} } });
          assert.deepEqual(
            registrations.at(-1).config.models.map((m) => m.id),
            ["distinct-legacy-canary"],
          );
        }
        const result = await invoke(registrations.at(-1).config);
        assert.equal(result.stopReason, "stop", result.errorMessage);
        assert.equal(sends.length, 1);
        assert.equal(sends[0].body.model, "distinct-legacy-canary");
      });
    }
  } finally {
    if (previous === undefined) delete process.env[CANARY_CONTRACT_ENV];
    else process.env[CANARY_CONTRACT_ENV] = previous;
    await rm(dir, { recursive: true, force: true });
  }
});
