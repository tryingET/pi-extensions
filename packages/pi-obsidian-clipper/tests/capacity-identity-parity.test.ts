import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { parseContract, recipe } from "../src/contract.ts";

const parity = JSON.parse(
  await readFile(new URL("./fixtures/capacity-identity-parity.json", import.meta.url), "utf8"),
);
for (const row of parity)
  test(`clipper cross-consumer identity fixture: ${row.name}`, async () => {
    const c = JSON.parse(
      await readFile(new URL("./fixtures/soma-capacity-v2.json", import.meta.url), "utf8"),
    );
    c.generated_at = new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
    c.models[0].capacity.source_generated_at = Date.now() / 1000 - 1;
    c.models[0].capacity.expires_at = Date.now() / 1000 + 590;
    Object.assign(c.models[0], row.patch);
    if ("profile" in row) c.runtime_profile_id = row.profile;
    const run = () => recipe(parseContract(JSON.stringify(c)));
    if (row.eligible) assert.equal(run().model.enabled, true);
    else assert.throws(run, undefined, row.name);
  });
