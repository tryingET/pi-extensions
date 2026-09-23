/**
summary: "Given/When/Then acceptance for the explicitly loaded, registration-only provider."
read_when:
  - "Changing cold-worker bootstrap or text/image admission."
*/
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  CONTRACT_ENV,
  CONTRACT_JSON_ENV,
  providerModel,
  refreshWorkstationContractGeneration,
  __resetWorkstationInferenceCachesForTests as reset,
  WORKSTATION_ROOT_ENV,
} from "../extensions/workstation-inference-contract.ts";
import { currentAudio, setCurrentAudio } from "../extensions/workstation-inference-stream.ts";

const entry = new URL("../extensions/workstation-inference-provider-only.ts", import.meta.url);
const provider = "workstation-inference";
const ids = ["baseline-text", "baseline-text-visible", "baseline-text-canary"];
// Built rather than written out, so the base64 padding never reads as a comparison operator.
const fakeAudioDataUrl = `data:audio/wav;base64,${Buffer.from("fake").toString("base64")}`;
const imageData =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jP1sAAAAASUVORK5CYII=";
// Pi 0.84.3/0.84.4 installed types and serializer use data/mimeType, not source.
const image = { type: "image", mimeType: "image/png", data: imageData };
const context = {
  messages: [
    { role: "user", content: [{ type: "text", text: "Exact café evidence" }, image], timestamp: 1 },
  ],
  tools: [],
};
function contract(overrides = {}) {
  return {
    schema_version: 1,
    authority: "workstation/lane-op",
    family: "baseline-text",
    surface: "canonical",
    provider_id: provider,
    base_url: "http://127.0.0.1:1234/v1",
    models: ids.map((id) => ({
      pi_model_id: id,
      upstream_model: "raw-artifact",
      input: ["text", "image"],
      reasoning: id !== ids[1],
      thinking_format: "qwen",
      thinking_level_map: { high: "high" },
    })),
    ...overrides,
  };
}
function sse() {
  return new Response(
    `data: ${JSON.stringify({ id: "fake", object: "chat.completion.chunk", created: 1, model: "raw-artifact", choices: [{ index: 0, delta: { content: "synthetic receipt" }, finish_reason: "stop" }] })}\n\ndata: [DONE]\n\n`,
    { headers: { "Content-Type": "text/event-stream" } },
  );
}
// Without an inline contract the loader falls back to the workstation's real contract files, so
// every scenario points that fallback at a root that does not exist: a missing contract must stay
// missing on a workstation that has one.
const isolatedEnv = [CONTRACT_JSON_ENV, CONTRACT_ENV, WORKSTATION_ROOT_ENV];
async function scenario(t, value, fn) {
  const previous = Object.fromEntries(isolatedEnv.map((name) => [name, process.env[name]]));
  process.env[CONTRACT_JSON_ENV] = typeof value === "string" ? value : JSON.stringify(value);
  delete process.env[CONTRACT_ENV];
  process.env[WORKSTATION_ROOT_ENV] = join(tmpdir(), "pi-provider-only-no-workstation-root");
  reset();
  const calls = [];
  t.mock.method(globalThis, "fetch", async (url, init) => {
    calls.push({ url: String(url), init });
    assert.match(String(url), /^http:\/\/127\.0\.0\.1:1234\//);
    return String(url).endsWith("/health") ? Response.json({ status: "ok" }) : sse();
  });
  try {
    await fn(calls);
  } finally {
    for (const [name, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
    reset();
  }
}
async function bootstrap() {
  const registrations = [];
  const forbidden = [];
  const api = new Proxy(
    {},
    {
      get(_target, key) {
        if (key === "registerProvider")
          return (name, config) => registrations.push({ name, config });
        forbidden.push(String(key));
        throw new Error(`Forbidden API: ${String(key)}`);
      },
    },
  );
  const factory = (await import(entry.href)).default;
  await factory(api);
  await new Promise((resolve) => setImmediate(resolve));
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.deepEqual(forbidden, []);
  return registrations;
}
function selected(config, id = ids[0]) {
  return {
    ...config.models.find((model) => model.id === id),
    id,
    provider,
    api: config.api,
    baseUrl: config.baseUrl,
  };
}
async function result(config, model = selected(config), ctx = context, options = {}) {
  const stream = config.streamSimple(model, ctx, { maxRetries: 0, ...options });
  const events = [];
  for await (const event of stream) events.push(event);
  return { events, message: await stream.result() };
}
function denied(outcome) {
  assert.equal(outcome.message.stopReason, "error");
  assert.ok(outcome.events.some((event) => event.type === "error"));
}

test("Given a valid contract When cold bootstrap settles Then only exact provider registration occurs", async (t) => {
  const { Given, When, Then } = steps(t);
  await scenario(t, contract(), async (calls) => {
    await Given("a valid inline contract and an untouched fetch boundary", () =>
      assert.deepEqual(calls, []),
    );
    const [{ name, config }] = await When("cold bootstrap and deferred ticks settle", bootstrap);
    await Then("only exact provider metadata was registered", () => {
      assert.equal(name, provider);
      assert.equal(config.api, provider);
      assert.deepEqual(config.models, contract().models.map(providerModel));
      assert.deepEqual(calls, []);
    });
  });
});

test("Given missing or invalid contracts When bootstrapped Then no provider is registered", async (t) => {
  for (const value of [
    "{",
    contract({ authority: "untrusted" }),
    contract({ base_url: "https://example.invalid" }),
    contract({ models: [] }),
  ]) {
    await scenario(t, value, async (calls) => {
      await assert.rejects(bootstrap);
      assert.deepEqual(calls, []);
    });
  }
  await scenario(t, "", async (calls) => {
    await assert.rejects(bootstrap);
    assert.deepEqual(calls, []);
  });
});

for (const id of ids) {
  test(`Given ${id} and image bytes When invoked through real Pi transport Then exact alias, bytes and hooks survive`, async (t) => {
    const { Given, When, Then } = steps(t);
    await scenario(t, contract(), async (calls) => {
      const [{ config }] = await Given("an exact alias and original image bytes", bootstrap);
      let hooked = 0;
      const outcome = await When("Pi serializes the request and inherited hook", () =>
        result(config, selected(config, id), context, {
          reasoning: "high",
          onPayload(payload, model) {
            hooked++;
            assert.equal(model.id, id);
            return { ...payload, temperature: 0.25 };
          },
        }),
      );
      await Then("wire alias, text, image bytes and thinking controls survive", () => {
        assert.equal(outcome.message.stopReason, "stop", outcome.message.errorMessage);
        assert.equal(outcome.message.model, id);
        const requests = calls.filter((call) => call.init?.body);
        assert.equal(requests.length, 1);
        const payload = JSON.parse(requests[0].init.body);
        assert.equal(payload.model, id);
        assert.equal(payload.temperature, 0.25);
        assert.equal(hooked, 1);
        assert.equal(payload.reasoning_effort, id === ids[1] ? undefined : "high");
        const content = payload.messages.find((message) => message.role === "user").content;
        assert.ok(content.some((block) => block.text === "Exact café evidence"));
        const url = content.find((block) => block.type === "image_url").image_url.url;
        assert.equal(url, `data:image/png;base64,${imageData}`);
        assert.deepEqual(
          Buffer.from(url.split(",")[1], "base64"),
          Buffer.from(imageData, "base64"),
        );
      });
    });
  });
}

test("Given ordinary non-baseline contracts When invoked Then existing upstream routing is retained", async (t) => {
  const { Given, When, Then } = steps(t);
  await scenario(t, contract({ family: "native-multimodal" }), async (calls) => {
    const [{ config }] = await Given(
      "an ordinary non-baseline contract with a different upstream id",
      bootstrap,
    );
    const outcome = await When("the unchanged shared stream is used", () => result(config));
    await Then("upstream routing and its existing result-identity limitation are explicit", () => {
      assert.equal(outcome.message.stopReason, "stop");
      assert.equal(
        JSON.parse(calls.find((call) => call.init?.body).init.body).model,
        "raw-artifact",
      );
      assert.equal(outcome.message.model, "raw-artifact");
      assert.notEqual(outcome.message.model, selected(config).id);
    });
  });
});

test("Given invalid exact identities When invoking the registration directly Then no fallback or dispatch occurs", async (t) => {
  await scenario(t, contract(), async (calls) => {
    const [{ config }] = await bootstrap();
    for (const patch of [
      { provider: "other" },
      { id: "missing" },
      { id: "raw-artifact" },
      { api: "openai-completions" },
    ]) {
      denied(await result(config, { ...selected(config), ...patch }));
    }
    assert.deepEqual(calls, []);
  });
});

test("Given governed or audio model declarations When bootstrapped Then they grant no cold-worker capability", async (t) => {
  const base = contract();
  for (const value of [
    contract({ authority: "workstation/runtime-ownership-scheduler" }),
    contract({ runtime_profile_id: "workbench-inkling-canary" }),
    contract({ models: [{ ...base.models[0], pi_model_id: "inkling-small-iq2m-canary" }] }),
    contract({ models: [{ ...base.models[0], native_input_modalities: ["text", "audio"] }] }),
    contract({
      models: [
        {
          ...base.models[0],
          audio_input: {
            request_format: "openai-chat-input-audio",
            formats: ["wav"],
            max_bytes: 100,
            max_encoded_bytes: 200,
            transport: "inline-base64",
            authorization_mode: "external-scheduler-claim-required",
          },
        },
      ],
    }),
  ]) {
    await scenario(t, value, async (calls) => {
      await assert.rejects(bootstrap);
      assert.deepEqual(calls, []);
    });
  }
});

test("Given forged audio and payload-hook bypass attempts When invoked Then no inference bytes are dispatched", async (t) => {
  await scenario(t, contract(), async (calls) => {
    const [{ config }] = await bootstrap();
    for (const content of [
      "[pi-workstation-audio:v1:00000000-0000-0000-0000-000000000000]",
      [{ type: "audio", data: "fake", mimeType: "audio/wav" }],
      [{ type: "input_audio", input_audio: { data: "fake", format: "wav" } }],
    ])
      denied(
        await result(config, selected(config), {
          messages: [{ role: "user", content, timestamp: 1 }],
        }),
      );
    for (const onPayload of [
      (payload) => ({ ...payload, model: "inkling-small-iq2m-canary" }),
      (payload) => ({ ...payload, modalities: ["text", "audio"] }),
      (payload) => ({
        ...payload,
        messages: [
          {
            role: "user",
            content: [{ type: "input_audio", input_audio: { data: "fake", format: "wav" } }],
          },
        ],
      }),
      (payload) => {
        payload.audio = { voice: "fake" };
      },
    ])
      denied(await result(config, selected(config), context, { onPayload }));
    assert.equal(calls.filter((call) => call.init?.body).length, 0);
  });
});

test("Given shared armed audio When cold bootstrap and invocation run Then the attachment is neither consumed nor cleaned", async (t) => {
  await scenario(t, contract(), async (calls) => {
    const sentinel = { marker: "synthetic-unread", nonce: "synthetic" };
    setCurrentAudio(sentinel);
    try {
      const [{ config }] = await bootstrap();
      denied(await result(config));
      assert.equal(currentAudio(), sentinel);
      assert.deepEqual(calls, []);
    } finally {
      setCurrentAudio(undefined);
    }
  });
});

test("Given a later governed contract generation When an old registration invokes Then it fails closed", async (t) => {
  await scenario(t, contract(), async (calls) => {
    const [{ config }] = await bootstrap();
    process.env[CONTRACT_JSON_ENV] = JSON.stringify(
      contract({ authority: "workstation/runtime-ownership-scheduler" }),
    );
    await refreshWorkstationContractGeneration();
    denied(await result(config));
    assert.deepEqual(calls, []);
  });
});

test("Given explicit host resource loading When pending registrations transfer to ModelRuntime Then no hooks, fallback or image loss", async (t) => {
  await scenario(t, contract(), async (calls) => {
    const { Given, When, Then } = steps(t);
    const { runtime, model } = await Given(
      "an explicit resource loader, empty handlers and exact model runtime registration",
      async () => {
        const sdk = process.env.PI_TEST_SDK
          ? await import(pathToFileURL(process.env.PI_TEST_SDK).href)
          : await import("@earendil-works/pi-coding-agent");
        const agentDir = join(tmpdir(), "ak5717-private-agent");
        const loader = new sdk.DefaultResourceLoader({
          cwd: agentDir,
          agentDir,
          settingsManager: sdk.SettingsManager.inMemory({}),
          additionalExtensionPaths: [fileURLToPath(entry)],
          noExtensions: true,
          noSkills: true,
          noPromptTemplates: true,
          noContextFiles: true,
          noThemes: true,
        });
        await loader.reload();
        const loaded = loader.getExtensions();
        assert.deepEqual(loaded.errors, []);
        assert.equal(loaded.extensions.length, 1);
        for (const extension of loaded.extensions) {
          for (const key of ["handlers", "tools", "commands", "shortcuts", "flags"])
            assert.equal(extension[key].size, 0, key);
        }
        const runtime = await sdk.ModelRuntime.create({
          authPath: join(agentDir, "auth.json"),
          modelsPath: join(agentDir, "models.json"),
          modelsStorePath: join(agentDir, "models-store.json"),
          allowModelNetwork: false,
          refreshOnCreate: false,
        });
        assert.equal(loaded.runtime.pendingProviderRegistrations.length, 1);
        assert.equal(loaded.runtime.pendingNativeProviderRegistrations.length, 0);
        for (const { name, config } of loaded.runtime.pendingProviderRegistrations)
          runtime.registerProvider(name, config);
        assert.equal(runtime.getError(), undefined);
        await new Promise((resolve) => setTimeout(resolve, 20));
        assert.deepEqual(calls, []);
        assert.equal(runtime.getModel(provider, "missing"), undefined);
        assert.equal(runtime.getModel("other", ids[0]), undefined);
        const model = runtime.getModel(provider, ids[1]);
        assert.equal(model.id, ids[1]);
        assert.ok(model.input.includes("image"));
        return { runtime, model };
      },
    );
    const message = await When("the model-only runtime invokes real Pi transport", async () => {
      const stream = runtime.streamSimple(model, context, { maxRetries: 0 });
      for await (const _event of stream) {
        /* Drain the real host stream. */
      }
      return await stream.result();
    });
    await Then("the exact baseline identity and image bytes survive", () => {
      assert.equal(message.stopReason, "stop", message.errorMessage);
      assert.equal(message.model, ids[1]);
      assert.equal(message.provider, provider);
      const payload = JSON.parse(calls.find((call) => call.init?.body).init.body);
      assert.equal(payload.model, ids[1]);
      assert.equal(
        payload.messages
          .find((message) => message.role === "user")
          .content.find((block) => block.type === "image_url").image_url.url,
        `data:image/png;base64,${imageData}`,
      );
    });
  });
});

test("Given the package manifest When shipped Then provider-only is explicit opt-in, never a default", async () => {
  const manifest = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
  assert.deepEqual(manifest.pi.extensions, ["./extensions/workstation-inference.ts"]);
  assert.ok(manifest.files.includes("extensions/workstation-inference-provider-only.ts"));
});

test("Given an image wrapper around audio or an unsupported image shape When invoked Then nothing is silently dropped or dispatched", async (t) => {
  await scenario(t, contract(), async (calls) => {
    const [{ config }] = await bootstrap();
    for (const block of [
      { ...image, mimeType: "audio/wav" },
      { type: "image", source: { type: "base64", mediaType: "image/png", data: imageData } },
    ]) {
      denied(
        await result(config, selected(config), {
          messages: [{ role: "user", content: [block], timestamp: 1 }],
        }),
      );
      denied(
        await result(config, selected(config), {
          messages: [
            {
              role: "toolResult",
              toolCallId: "synthetic",
              toolName: "never-executed",
              content: [block],
              timestamp: 1,
            },
          ],
        }),
      );
    }
    assert.deepEqual(calls, []);
  });
});

test("Given an audio sampling override or asynchronous contract drift in a payload hook When invoked Then final admission rejects dispatch", async (t) => {
  await scenario(t, contract(), async (calls) => {
    const [{ config }] = await bootstrap();
    denied(
      await result(config, { ...selected(config), samplingParams: { modalities: ["audio"] } }),
    );
    denied(
      await result(config, selected(config), context, {
        async onPayload(payload) {
          process.env[CONTRACT_JSON_ENV] = JSON.stringify(
            contract({ authority: "workstation/runtime-ownership-scheduler" }),
          );
          await refreshWorkstationContractGeneration();
          return payload;
        },
      }),
    );
    assert.equal(calls.filter((call) => call.init?.body).length, 0);
  });
});

test("Given cold registration When deferred ticks pass Then bootstrap schedules no timers or filesystem mutations", async (t) => {
  await scenario(t, contract(), async (calls) => {
    const factory = (await import(entry.href)).default;
    const fs = (await import("node:fs/promises")).default;
    const effects = [];
    const tick = globalThis.setTimeout;
    for (const method of ["setTimeout", "setInterval", "setImmediate"]) {
      const original = globalThis[method];
      t.mock.method(globalThis, method, (...args) => {
        effects.push(method);
        return original(...args);
      });
    }
    for (const method of [
      "writeFile",
      "appendFile",
      "unlink",
      "rm",
      "rename",
      "mkdir",
      "rmdir",
      "chmod",
    ]) {
      t.mock.method(fs, method, async () => {
        effects.push(method);
        throw new Error(`Forbidden bootstrap mutation: ${method}`);
      });
    }
    let registrations = 0;
    await factory(
      new Proxy(
        {},
        {
          get(_target, key) {
            assert.equal(key, "registerProvider");
            return () => {
              registrations++;
            };
          },
        },
      ),
    );
    await new Promise((resolve) => tick(resolve, 30));
    assert.equal(registrations, 1);
    assert.deepEqual(effects, []);
    assert.deepEqual(calls, []);
  });
});

test("Given a text-only contract When user or tool-result images are supplied Then no image is silently discarded", async (t) => {
  await scenario(
    t,
    contract({ models: [{ pi_model_id: ids[0], input: ["text"] }] }),
    async (calls) => {
      const [{ config }] = await bootstrap();
      denied(await result(config));
      denied(
        await result(config, selected(config), {
          messages: [
            {
              role: "toolResult",
              toolCallId: "synthetic",
              toolName: "never-executed",
              content: [image],
              timestamp: 1,
            },
          ],
        }),
      );
      assert.deepEqual(calls, []);
    },
  );
});

// Executable Gherkin-style steps on node:test, not a Cucumber/Gherkin parser.
// Failures propagate from the bound action; diagnostics expose each executed step.
function steps(t) {
  let stage = -1;
  return Object.fromEntries(
    ["Given", "When", "Then"].map((keyword, index) => [
      keyword,
      async (description, action) => {
        assert.ok(index >= stage && index <= stage + 1, `Invalid step order: ${keyword}`);
        stage = index;
        t.diagnostic(`${keyword} ${description}`);
        return await action();
      },
    ]),
  );
}

for (const [label, request] of [
  [
    "literal incomplete audio marker source code",
    {
      messages: [
        {
          role: "user",
          content: 'Analyze this source code only: const prefix = "[pi-workstation-audio:";',
          timestamp: 1,
        },
      ],
    },
  ],
  [
    "ordinary tool schema with an audio property",
    {
      ...context,
      tools: [
        {
          name: "inspect_metadata",
          description: "metadata only",
          parameters: { type: "object", properties: { audio: { type: "string" } } },
        },
      ],
    },
  ],
  [
    "historical exact markers and tool argument data",
    {
      systemPrompt:
        "Analyze [pi-workstation-audio:v1:00000000-0000-0000-0000-000000000000] as evidence.",
      messages: [
        {
          role: "user",
          content: "[pi-workstation-audio:v1:00000000-0000-0000-0000-000000000000]",
          timestamp: 1,
        },
        {
          role: "user",
          content: `Analyze this JSON: {"audio":{"type":"input_audio"}} and ${fakeAudioDataUrl}`,
          timestamp: 2,
        },
      ],
    },
  ],
]) {
  test(`Scenario: ordinary application data — ${label}`, async (t) => {
    const { Given, When, Then } = steps(t);
    await scenario(t, contract(), async (calls) => {
      const [{ config }] = await Given(
        "a registered text/image model and ordinary evidence",
        bootstrap,
      );
      const outcome = await When("the evidence is sent through the provider-only stream", () =>
        result(config, selected(config), request),
      );
      await Then(
        "the real transport succeeds without confusing application data with audio authority",
        () => {
          assert.equal(outcome.message.stopReason, "stop", outcome.message.errorMessage);
          const payload = JSON.parse(calls.find((call) => call.init?.body).init.body);
          if (request.tools)
            assert.deepEqual(payload.tools[0].function.parameters.properties.audio, {
              type: "string",
            });
          for (const message of request.messages)
            if (typeof message.content === "string") {
              assert.ok(payload.messages.some((wire) => wire.content === message.content));
            }
        },
      );
    });
  });
}

for (const [label, input, block] of [
  [
    "image injected into text-only model",
    ["text"],
    { type: "image_url", image_url: { url: `data:image/png;base64,${imageData}` } },
  ],
  ["missing image_url value", ["text", "image"], { type: "image_url" }],
  ["non-string image URL", ["text", "image"], { type: "image_url", image_url: { url: 7 } }],
  [
    "malformed inline image bytes",
    ["text", "image"],
    { type: "image_url", image_url: { url: "data:image/png;base64,%%%" } },
  ],
  [
    "audio URL in image wrapper",
    ["text", "image"],
    { type: "image_url", image_url: { url: fakeAudioDataUrl } },
  ],
]) {
  test(`Scenario: final payload image admission — ${label}`, async (t) => {
    const { Given, When, Then } = steps(t);
    await scenario(t, contract({ models: [{ pi_model_id: ids[0], input }] }), async (calls) => {
      const [{ config }] = await Given("a model with the declared input capability", bootstrap);
      const outcome = await When(
        "an inherited hook replaces user content with the candidate image block",
        () =>
          result(
            config,
            selected(config),
            {
              messages: [{ role: "user", content: "Analyze evidence", timestamp: 1 }],
            },
            {
              onPayload: (payload) => ({
                ...payload,
                messages: [{ role: "user", content: [block] }],
              }),
            },
          ),
      );
      await Then("final admission returns an error and emits zero inference requests", () => {
        denied(outcome);
        assert.equal(calls.filter((call) => call.init?.body).length, 0);
      });
    });
  });
}

test("Scenario: exact shared marker semantics still deny the latest user audio attempt", async (t) => {
  const { Given, When, Then } = steps(t);
  await scenario(t, contract(), async (calls) => {
    const [{ config }] = await Given("a cold provider with no armed attachment", bootstrap);
    const outcomes = await When(
      "one or multiple exact markers occur in the latest user text",
      async () => {
        const marker = "[pi-workstation-audio:v1:00000000-0000-0000-0000-000000000000]";
        return Promise.all(
          [marker, `${marker} ${marker}`].map((text) =>
            result(config, selected(config), {
              messages: [{ role: "user", content: [{ type: "text", text }], timestamp: 1 }],
            }),
          ),
        );
      },
    );
    await Then("both attempts fail before any health or inference fetch", () => {
      outcomes.forEach(denied);
      assert.deepEqual(calls, []);
    });
  });
});

test("Scenario: a valid image-capable final hook preserves inline bytes", async (t) => {
  const { Given, When, Then } = steps(t);
  await scenario(t, contract(), async (calls) => {
    const [{ config }] = await Given("an image-capable model and known image bytes", bootstrap);
    const outcome = await When("a hook inserts a supported image_url", () =>
      result(
        config,
        selected(config),
        {
          messages: [{ role: "user", content: "Analyze evidence", timestamp: 1 }],
        },
        {
          onPayload: (payload) => ({
            ...payload,
            messages: [
              {
                role: "user",
                content: [
                  {
                    type: "image_url",
                    image_url: { url: `data:image/png;base64,${imageData}`, detail: "auto" },
                  },
                ],
              },
            ],
          }),
        },
      ),
    );
    await Then("final validation permits the image without changing bytes", () => {
      assert.equal(outcome.message.stopReason, "stop", outcome.message.errorMessage);
      const payload = JSON.parse(calls.find((call) => call.init?.body).init.body);
      assert.equal(
        payload.messages[0].content[0].image_url.url,
        `data:image/png;base64,${imageData}`,
      );
    });
  });
});

test("Scenario: tool-call arguments named audio remain application data", async (t) => {
  const { Given, When, Then } = steps(t);
  await scenario(t, contract(), async (calls) => {
    const [{ config }] = await Given("a provider with ordinary tool-call history", bootstrap);
    const argumentsData = { audio: { type: "input_audio", path: "filename-only" } };
    const outcome = await When("structured arguments and tool-result text are replayed", () =>
      result(config, selected(config), {
        messages: [
          { role: "user", content: "Inspect filenames only", timestamp: 1 },
          {
            role: "assistant",
            api: config.api,
            provider,
            model: ids[0],
            content: [
              { type: "toolCall", id: "call_metadata", name: "metadata", arguments: argumentsData },
            ],
            stopReason: "toolUse",
            timestamp: 2,
            usage: {
              input: 0,
              output: 0,
              cacheRead: 0,
              cacheWrite: 0,
              totalTokens: 0,
              cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
            },
          },
          {
            role: "toolResult",
            toolCallId: "call_metadata",
            toolName: "metadata",
            content: [
              {
                type: "text",
                text: `${fakeAudioDataUrl} is quoted evidence, not an attachment`,
              },
            ],
            timestamp: 3,
            isError: false,
          },
        ],
      }),
    );
    await Then("the wire keeps the argument object without gaining audio permissions", () => {
      assert.equal(outcome.message.stopReason, "stop", outcome.message.errorMessage);
      const payload = JSON.parse(calls.find((call) => call.init?.body).init.body);
      assert.deepEqual(
        JSON.parse(
          payload.messages.find((message) => message.tool_calls).tool_calls[0].function.arguments,
        ),
        argumentsData,
      );
    });
  });
});
