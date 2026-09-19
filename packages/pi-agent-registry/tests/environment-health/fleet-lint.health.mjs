// summary: pins the exact unhealthy real-fleet observation so external manifest/profile drift cannot stay silent.
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { loadEcProfiles } from "../../src/ec-profiles.ts";
import { lintAgentFleet } from "../../src/fleet-lint.ts";
import { expandTildePath } from "../../src/registry.ts";
import { assertFleetBaseline } from "./baseline-assertions.mjs";

const workspace = expandTildePath("~/ai-society");
const fleetPattern = join(workspace, "agents", "agent-*");
const profilesPath = join(workspace, "core", "engineering-core", "skills", "profiles.json");
const baseline = JSON.parse(
  readFileSync(new URL("../fixtures/real-fleet-lint-baseline.json", import.meta.url), "utf8"),
);

test("real fleet walk matches the exact revision-bound unhealthy baseline", async () => {
  assert.ok(existsSync(join(workspace, "agents")), "environment health requires the real fleet");
  assert.ok(existsSync(profilesPath), "environment health requires engineering-core profiles");
  const ec = await loadEcProfiles(profilesPath);
  const report = await lintAgentFleet({
    roots: [fleetPattern],
    ec,
    observedAt: baseline.observedAt,
  });

  assertFleetBaseline(report, baseline);
});
