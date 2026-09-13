/** Removal is explicit: stale configurations never authorize a new executable. */
import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { migrationScenario } from "../scripts/dogfood-scenarios.mjs";
import { buildContextPlan } from "../src/context-plan.js";

test("removed provider cannot execute or delete source-owned artifacts", migrationScenario);
test("unknown provider keys fail before retrieval without echoing values", () => {
  const plan = buildContextPlan({ objective: "Read", providers: { "secret-value": "required" } });
  assert.equal(plan.ok, false);
  assert.doesNotMatch(JSON.stringify(plan), /secret-value/u);
});
test("runtime has no old backend commands, environment switches, or imports", async () => {
  const root = dirname(dirname(fileURLToPath(import.meta.url)));
  for (const dir of ["src", "extensions"]) {
    for (const name of await readdir(join(root, dir))) {
      if (!/\.(js|ts)$/u.test(name)) continue;
      const text = await readFile(join(root, dir, name), "utf8");
      assert.doesNotMatch(
        text,
        /sci-provider|semantic-code-intelligence|PI_CONTEXT_PACKER_SCI|SCI_CLI|buildSciSection/u,
        name,
      );
    }
  }
});
