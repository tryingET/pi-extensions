// Explicit real Pi/ASC + private Ghostty qualification. Never replay a retained root.
// Controller provider is deterministic; original children use the explicitly selected provider.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { observerIsolationRefusal } from "../ghostty-observer-tab-harness.mjs";

const enabled = process.env.ASC_TABS_LIVE === "1";
const env = { ...process.env, PI_ASC_OBSERVER_LIVE_ISOLATED: "1" };
const refusal = enabled
  ? observerIsolationRefusal({ env })
  : "requires explicit ASC_TABS_LIVE=1 (real child provider calls)";
const fixture = fileURLToPath(
  new URL(
    "../../../pi-autonomous-session-control/tests/live/attached-tabs-proof.py",
    import.meta.url,
  ),
);

test(
  "Scenario: Given two original ASC children, When native tabs attach, guide, close and reopen, Then exact executions survive without clones",
  {
    skip: refusal || (process.env.TERM_PROGRAM !== "ghostty" ? "requires isolated Ghostty" : false),
  },
  () => {
    assert.ok(env.ASC_TABS_PROOF_ROOT, "fresh proof root required");
    assert.ok(env.ASC_TABS_PROOF_MODEL, "explicit real original-child provider required");
    const result = spawnSync("python3", [fixture], {
      env,
      encoding: "utf8",
      maxBuffer: 1024 * 1024,
    });
    process.stdout.write(result.stdout ?? "");
    process.stderr.write(result.stderr ?? "");
    assert.ifError(result.error);
    assert.equal(result.status, 0, "retained failure; no automatic retry");
    const proof = JSON.parse(readFileSync(join(env.ASC_TABS_PROOF_ROOT, "proof.json"), "utf8"));
    assert.ok(
      proof.checks.includes(
        "native beta close leaves original child running and alpha viewer unchanged",
      ),
    );
    assert.ok(
      proof.checks.includes(
        "real original children followed native-view guidance without restart or clone",
      ),
    );
    assert.ok(
      proof.checks.includes(
        "terminal history remains, count-only completion, idle reload reuses original view",
      ),
    );
    assert.equal(proof.initialViewSurfaces.length, 2);
    for (const observation of Object.values(proof.postInputSafety)) {
      assert.deepEqual(observation.sdk, {
        noSession: true,
        activeToolsCount: 0,
        inertModelSelected: true,
      });
      assert.ok(observation.inputObservations.after >= 1);
      assert.ok(Object.values(observation.instrumented).every(Boolean));
      assert.ok(Object.values(observation.attempts).every((value) => value === 0));
    }
  },
);
