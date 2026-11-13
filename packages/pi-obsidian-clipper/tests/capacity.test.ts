import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";
import { command, parseContract, recipe } from "../src/contract.ts";
import { contract, environment, fixture } from "./helpers.ts";

const parse = (value: unknown, now = Date.now()) => parseContract(JSON.stringify(value), now);

test("exact producer interface fixture admits only inside source proof, not its export clock", async (t) => {
  const c = JSON.parse(
    await readFile(new URL("./fixtures/soma-capacity-v2.json", import.meta.url), "utf8"),
  );
  let clock = 1800000001000;
  t.mock.method(Date, "now", () => clock);
  assert.equal(recipe(parse(c)).model.enabled, true);
  const selected = parse(c);
  clock = 1800000590000;
  assert.throws(() => recipe(selected), /expired source proof/);
  c.generated_at = new Date(Date.now()).toISOString().replace(".000Z", "Z");
  const status = parse(c);
  assert.equal(status.freshness, "fresh");
  assert.equal(status.capacity.admissible, false);
  assert.throws(() => recipe(status), /capacity/);
});

test("old canonical hints are rejected; missing schema2 proof never defaults from positive hints/current", () => {
  const c = contract();
  assert.throws(() => parse({ ...c, schema_version: 1 }), /schema/);
  c.models[0].capacity = undefined;
  c.models[0].current = { state: "observed", context_window: 262144, max_tokens: 131072 };
  const status = parse(c);
  assert.equal(status.capacity.admissible, false);
  assert.throws(() => recipe(status), /capacity/);
});

const cases: [string, (c: ReturnType<typeof contract>["models"][number]["capacity"]) => void][] = [
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
    "missing availability",
    (c) => {
      delete c.availability;
    },
  ],
  [
    "unknown availability",
    (c) => {
      c.availability = "unknown";
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
    "extended ttl",
    (c) => {
      c.expires_at = c.source_generated_at + 601;
    },
  ],
  [
    "future proof",
    (c) => {
      c.source_generated_at += 100;
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
    "output mismatch",
    (c) => {
      c.guaranteed.max_tokens = 32;
    },
  ],
  [
    "fractional bound",
    (c) => {
      c.guaranteed.max_tokens = 1.5;
    },
  ],
];
for (const [label, mutate] of cases)
  test(`status describes ${label}; command/tool setup emits no enabled recipe`, async () => {
    const f = await fixture();
    try {
      const c = contract();
      mutate(c.models[0].capacity);
      const path = join(f.dir, "capacity.json");
      await writeFile(path, JSON.stringify(c), { mode: 0o600 });
      await environment({ PI_OBSIDIAN_CLIPPER_CONTRACT: path }, async () => {
        const status = await command("status");
        assert.equal(status.declaration.capacity.admissible, false);
        assert.equal(status.browserConfigured, "unknown");
        assert.equal(status.liveHealth, "not-probed");
        assert.ok(!("model" in status));
        await assert.rejects(() => command("setup"), /capacity/);
      });
    } finally {
      await f.dispose();
    }
  });

test("schema2 model-level compatibility hints are ignored even when null or malformed", () => {
  const c = contract();
  c.models[0].context_window = null;
  c.models[0].max_tokens = "unverified";
  assert.equal(recipe(parse(c)).model.enabled, true);
});
