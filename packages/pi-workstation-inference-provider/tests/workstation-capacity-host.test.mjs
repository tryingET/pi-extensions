import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import * as sdk from "@earendil-works/pi-coding-agent";

const provider = "workstation-inference";
const alias = "baseline-multimodal";
const context = { messages: [{ role: "user", content: "offline host fixture", timestamp: 1 }] };

for (const entry of ["workstation-inference.ts", "workstation-inference-provider-only.ts"]) {
  test(`${entry}: real pinned SDK retains an old selected object but cannot dispatch withdrawn file capacity`, async () => {
    const root = await mkdtemp(join(tmpdir(), "ak8605-sdk-"));
    const variables = [
      "PI_WORKSTATION_INFERENCE_CONTRACT",
      "PI_WORKSTATION_INFERENCE_CONTRACT_JSON",
      "PI_WORKSTATION_INFERENCE_CANARY_CONTRACT",
      "PI_WORKSTATION_INFERENCE_INKLING_CONTRACT",
    ];
    const oldEnv = Object.fromEntries(variables.map((key) => [key, process.env[key]]));
    const oldFetch = globalThis.fetch;
    const sends = [];
    let runtime;
    globalThis.fetch = async (input, init) => {
      assert.match(String(input), /^http:\/\/127\.0\.0\.1:1200\//);
      if (!init?.body) return Response.json({ status: "ok" });
      sends.push(JSON.parse(init.body));
      return new Response(
        'data: {"id":"offline","choices":[{"index":0,"delta":{"content":"ok"},"finish_reason":"stop"}]}\n\ndata: [DONE]\n\n',
        { headers: { "Content-Type": "text/event-stream" } },
      );
    };
    try {
      const sdkPackage = JSON.parse(
        await readFile(
          new URL("../package.json", import.meta.resolve("@earendil-works/pi-coding-agent")),
          "utf8",
        ),
      );
      assert.equal(sdkPackage.version, "1.4.0");
      for (const variable of variables) delete process.env[variable];
      const path = join(root, "source.json");
      const source = JSON.parse(
        await readFile(
          new URL(
            "../examples/workstation-inference-provider.capacity-v2.example.json",
            import.meta.url,
          ),
          "utf8",
        ),
      );
      source.generated_at = new Date().toISOString();
      const capacity = source.models[0].capacity;
      capacity.source_generated_at = Date.now() / 1000 - 1;
      capacity.expires_at = capacity.source_generated_at + 590;
      await writeFile(path, JSON.stringify(source));
      process.env.PI_WORKSTATION_INFERENCE_CONTRACT = path;
      const loader = new sdk.DefaultResourceLoader({
        cwd: root,
        agentDir: root,
        settingsManager: sdk.SettingsManager.inMemory({}),
        additionalExtensionPaths: [
          fileURLToPath(new URL(`../extensions/${entry}`, import.meta.url)),
        ],
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
      runtime = await sdk.ModelRuntime.create({
        authPath: join(root, "empty-fixture-auth.json"),
        modelsPath: join(root, "models.json"),
        modelsStorePath: join(root, "models-store.json"),
        allowModelNetwork: false,
        refreshOnCreate: false,
      });
      assert.equal(loaded.runtime.pendingProviderRegistrations.length, 1);
      for (const { name, config } of loaded.runtime.pendingProviderRegistrations)
        runtime.registerProvider(name, config);
      const selected = runtime.getModel(provider, alias);
      assert.equal(selected.id, alias);
      assert.equal(selected.contextWindow, 32768);
      const invoke = async (options) => {
        const stream = runtime.streamSimple(selected, context, { maxRetries: 0, ...options });
        for await (const _event of stream) {
          /* Drain actual SDK events. */
        }
        return stream.result();
      };
      assert.equal((await invoke()).stopReason, "stop");
      assert.equal(sends.length, 1);
      sends.length = 0;
      capacity.guaranteed = {
        state: "unknown",
        context_window: null,
        max_output_tokens: null,
        max_tokens: null,
      };
      source.models[0].context_window = 262144;
      source.models[0].max_tokens = 131072;
      await writeFile(path, JSON.stringify(source));
      assert.deepEqual(
        runtime.getModel(provider, alias),
        selected,
        "host catalog still exposes old generation metadata while the held selected object is reused",
      );
      assert.equal((await invoke()).stopReason, "error");
      assert.equal(sends.length, 0);
      source.schema_version = 1;
      await writeFile(path, JSON.stringify(source));
      assert.equal((await invoke()).stopReason, "error");
      assert.equal(sends.length, 0);
      runtime.unregisterProvider(provider);
      assert.equal(
        runtime.getModel(provider, alias),
        undefined,
        "supported SDK registration removal, not selected-object erasure",
      );
      assert.equal(selected.id, alias);
    } finally {
      runtime?.unregisterProvider(provider);
      globalThis.fetch = oldFetch;
      for (const [key, value] of Object.entries(oldEnv)) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
      await rm(root, { recursive: true, force: true });
    }
  });
}
