// ---
// summary: "Tests deterministic release recovery classification, precedence, and immutable-boundary prohibitions."
// read_when:
//   - "Changing release-state.mjs or release-recovery.json."
// ---

import assert from "node:assert/strict";
import test from "node:test";

import { classifyRelease, loadPolicy, validateObservation } from "./release-state.mjs";

const BASE = {
  schema: "pi.release-state-observation.v1",
  component: "pi-telemetry",
  packageName: "@tryinget/pi-telemetry",
  version: "0.3.0",
  tag: "exact",
  githubRelease: "published",
  npm: "exact",
  durableEvidence: "exact",
  attestations: "exact",
  trust: "normal",
  wave: { expectedComponents: 1, completedComponents: 1 },
};

function decision(overrides = {}) {
  return classifyRelease({ ...BASE, ...overrides });
}

test("classifies every operational and incident state", () => {
  const cases = [
    [{ tag: "absent", githubRelease: "absent", npm: "absent", durableEvidence: "absent", attestations: "absent" }, "candidate-no-tag"],
    [{ githubRelease: "absent", npm: "absent", durableEvidence: "absent", attestations: "absent" }, "tag-awaiting-github-release"],
    [{ githubRelease: "draft", npm: "absent", durableEvidence: "absent", attestations: "absent" }, "tag-awaiting-github-release"],
    [{ npm: "absent", durableEvidence: "absent", attestations: "absent" }, "github-release-awaiting-npm"],
    [{ durableEvidence: "partial", attestations: "exact" }, "npm-published-evidence-pending"],
    [{ durableEvidence: "exact", attestations: "partial" }, "npm-published-evidence-pending"],
    [{ wave: { expectedComponents: 3, completedComponents: 2 } }, "component-complete-wave-partial"],
    [{}, "complete"],
    [{ tag: "mismatch" }, "source-tag-mismatch"],
    [{ npm: "mismatch" }, "npm-artifact-mismatch"],
    [{ durableEvidence: "mismatch" }, "release-evidence-mismatch"],
    [{ attestations: "mismatch" }, "release-evidence-mismatch"],
    [{ trust: "suspected-compromise" }, "compromise-suspected"],
    [{ trust: "confirmed-compromise" }, "compromise-confirmed"],
  ];
  for (const [overrides, expected] of cases) {
    assert.equal(decision(overrides).state, expected, JSON.stringify(overrides));
  }
});

test("incident precedence freezes mismatches before resumable gaps", () => {
  assert.equal(
    decision({
      tag: "mismatch",
      githubRelease: "absent",
      npm: "absent",
      durableEvidence: "absent",
      attestations: "absent",
    }).state,
    "source-tag-mismatch",
  );
  assert.equal(
    decision({
      trust: "suspected-compromise",
      tag: "mismatch",
      npm: "mismatch",
      durableEvidence: "mismatch",
      attestations: "mismatch",
    }).state,
    "compromise-suspected",
  );
  assert.equal(
    decision({
      trust: "confirmed-compromise",
      tag: "mismatch",
      npm: "mismatch",
    }).state,
    "compromise-confirmed",
  );
});

test("all decisions prohibit mutable repair of immutable surfaces", () => {
  const policy = loadPolicy();
  for (const [state, statePolicy] of Object.entries(policy.states)) {
    const matching = [
      { tag: "absent", githubRelease: "absent", npm: "absent", durableEvidence: "absent", attestations: "absent" },
      { githubRelease: "absent", npm: "absent", durableEvidence: "absent", attestations: "absent" },
      { npm: "absent", durableEvidence: "absent", attestations: "absent" },
      { durableEvidence: "partial", attestations: "exact" },
      { wave: { expectedComponents: 2, completedComponents: 1 } },
      {},
      { tag: "mismatch" },
      { npm: "mismatch" },
      { durableEvidence: "mismatch" },
      { trust: "suspected-compromise" },
      { trust: "confirmed-compromise" },
    ].map((value) => decision(value)).find((value) => value.state === state);
    assert.ok(matching, `missing fixture for ${state}`);
    assert.equal(matching.severity, statePolicy.severity);
    assert.equal(matching.resumable, statePolicy.resumable);
    for (const prohibited of policy.globalProhibitions) {
      assert.ok(matching.prohibitedActions.includes(prohibited));
    }
  }
});

test("records irreversible facts without upgrading absent surfaces", () => {
  assert.deepEqual(
    decision({ tag: "absent", githubRelease: "absent", npm: "absent", durableEvidence: "absent", attestations: "absent" }).immutableFacts,
    [],
  );
  assert.deepEqual(decision().immutableFacts, [
    "release-tag-exists",
    "github-release-is-public",
    "npm-version-is-immutable",
    "release-evidence-assets-exist",
  ]);
});

test("rejects unknown fields, invalid statuses, and impossible wave counts", () => {
  assert.throws(() => validateObservation({ ...BASE, unknown: true }), /Unknown observation field/u);
  assert.throws(() => validateObservation({ ...BASE, npm: "maybe" }), /npm must be one of/u);
  assert.throws(
    () => validateObservation({ ...BASE, wave: { expectedComponents: 1, completedComponents: 2 } }),
    /completedComponents/u,
  );
});
