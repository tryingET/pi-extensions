import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import installed from "../extensions/workstation-inference.ts";
import { __resetWorkstationInferenceCachesForTests as reset } from "../extensions/workstation-inference-contract.ts";
import providerOnly from "../extensions/workstation-inference-provider-only.ts";

const template = JSON.parse(
  await readFile(
    new URL("../examples/workstation-inference-provider.capacity-v2.example.json", import.meta.url),
    "utf8",
  ),
);
const owned = "workstation-inference";
const keys = [
  "PI_WORKSTATION_INFERENCE_CONTRACT",
  "PI_WORKSTATION_INFERENCE_CONTRACT_JSON",
  "PI_WORKSTATION_INFERENCE_CANARY_CONTRACT",
  "PI_WORKSTATION_INFERENCE_INKLING_CONTRACT",
  "PI_WORKSTATION_ROOT",
];
function source(kind) {
  const c = structuredClone(template);
  c.generated_at = new Date().toISOString();
  c.models[0].capacity.source_generated_at = Date.now() / 1000 - 1;
  c.models[0].capacity.expires_at = Date.now() / 1000 + 590;
  const capacity = c.models[0].capacity;
  if (kind === "schema1") {
    c.schema_version = 1;
    delete c.models[0].capacity;
    c.models[0].context_window = 262144;
    c.models[0].max_tokens = 131072;
  }
  if (kind === "unknown")
    capacity.guaranteed = {
      state: "unknown",
      context_window: null,
      max_output_tokens: null,
      max_tokens: null,
    };
  if (kind === "expired") {
    capacity.source_generated_at -= 601;
    capacity.expires_at -= 601;
  }
  if (kind === "unavailable") capacity.availability = "unavailable";
  if (kind === "contradictory") capacity.guaranteed.max_tokens++;
  if (kind === "omitted") c.models = [];
  return c;
}
for (const [name, factory] of [
  ["normal", installed],
  ["provider-only", providerOnly],
]) {
  for (const kind of [
    "schema1",
    "unknown",
    "malformed",
    "missing",
    "expired",
    "unavailable",
    "contradictory",
    "omitted",
    "withdraw-before-bind",
    "valid",
    "canary",
  ])
    test(
      name +
        ": Given inherited registrations When binding with " +
        kind +
        " Then only currently admissible owned models survive",
      async () => {
        const dir = await mkdtemp(join(tmpdir(), "ak8605-bind-"));
        const previous = Object.fromEntries(keys.map((k) => [k, process.env[k]]));
        const fetch = globalThis.fetch;
        const foreign = { models: [{ id: "other-owner-model" }] };
        const providers = new Map([
          [owned, { models: [{ id: "baseline-multimodal" }] }],
          ["other-owner", foreign],
        ]);
        let pending = [],
          bound = false;
        const starts = [],
          removals = [],
          errors = [];
        const api = {
          registerProvider(id, config) {
            if (bound) providers.set(id, config);
            else pending.push([id, config]);
          },
          unregisterProvider(id) {
            // Pi1.1 pre-bind unregister cannot touch the inherited runtime map.
            if (bound) {
              removals.push(id);
              providers.delete(id);
            } else pending = pending.filter(([name]) => name !== id);
          },
          on(event, handler) {
            if (event === "session_start") starts.push(handler);
          },
          registerCommand() {},
        };
        globalThis.fetch = async (_url, init) => {
          assert.equal(init?.body, undefined);
          return Response.json({ status: "ok" });
        };
        for (const k of keys) delete process.env[k];
        process.env.PI_WORKSTATION_ROOT = dir;
        process.env.PI_WORKSTATION_INFERENCE_CONTRACT = join(dir, "primary.json");
        reset();
        try {
          if (kind !== "missing")
            await writeFile(
              process.env.PI_WORKSTATION_INFERENCE_CONTRACT,
              kind === "malformed"
                ? "{"
                : JSON.stringify(source(kind === "canary" ? "unknown" : kind)),
            );
          if (kind === "canary") {
            const path = join(dir, "canary.json");
            await writeFile(
              path,
              JSON.stringify({
                schema_version: 1,
                authority: "workstation/lane-op",
                family: "legacy-text",
                surface: "canary",
                provider_id: owned,
                base_url: "http://127.0.0.1:1334/v1",
                models: [
                  {
                    pi_model_id: "unrelated-legacy",
                    upstream_model: "route-B",
                    input: ["text"],
                    context_window: 8192,
                    max_tokens: 512,
                  },
                ],
              }),
            );
            process.env.PI_WORKSTATION_INFERENCE_CANARY_CONTRACT = path;
          }
          try {
            await factory(api);
          } catch (error) {
            errors.push(error);
            starts.length = 0;
            pending = [];
          }
          if (kind === "withdraw-before-bind")
            await writeFile(
              process.env.PI_WORKSTATION_INFERENCE_CONTRACT,
              JSON.stringify(source("unknown")),
            );
          for (const [id, config] of pending) providers.set(id, config);
          bound = true;
          for (const handler of starts)
            try {
              await handler({ type: "session_start", reason: "reload" });
            } catch (error) {
              errors.push(error);
            }
          assert.equal(
            providers.get("other-owner"),
            foreign,
            "foreign registration must not change",
          );
          assert.ok(
            removals.every((id) => id === owned),
            "only this consumer's provider may be revoked",
          );
          if (kind === "valid")
            assert.deepEqual(
              providers.get(owned).models.map((m) => m.id),
              ["baseline-multimodal"],
            );
          else if (kind === "canary")
            assert.deepEqual(
              providers.get(owned).models.map((m) => m.id),
              ["unrelated-legacy"],
            );
          else
            assert.equal(
              providers.has(owned),
              false,
              "post-bind revocation must remove the inherited old closure even after load failure",
            );
          if (!["valid", "canary"].includes(kind))
            assert.ok(removals.includes(owned), "pre-bind queue filtering is not revocation");
          if (name === "provider-only" && !["valid", "canary"].includes(kind))
            assert.ok(errors.length, "denied startup remains diagnostic after revocation");
        } finally {
          await new Promise((ok) => setImmediate(ok));
          globalThis.fetch = fetch;
          reset();
          for (const [k, v] of Object.entries(previous)) {
            if (v === undefined) delete process.env[k];
            else process.env[k] = v;
          }
          await rm(dir, { recursive: true, force: true });
        }
      },
    );
}
