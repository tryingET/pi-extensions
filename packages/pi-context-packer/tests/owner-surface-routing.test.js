import assert from "node:assert/strict";
import test from "node:test";
import { buildOwnerSurfaceRecommendations } from "../src/owner-surface-routing.js";

const providerPlans = (selectedProviders = []) =>
  ["agents", "git", "sci", "docs", "session", "prompt_vault", "ak", "fcos"].map((provider) => ({
    provider,
    posture: selectedProviders.includes(provider) ? "selected" : "optional",
  }));

test("owner-surface routing returns no recommendations for ordinary context planning", () => {
  const recommendations = buildOwnerSurfaceRecommendations({
    objective: "read docs and code context for implementation",
    seeds: [],
    providerPlans: providerPlans(),
  });

  assert.deepEqual(recommendations, []);
});

test("owner-surface routing maps authority-sensitive objective text without execution hooks", () => {
  const recommendations = buildOwnerSurfaceRecommendations({
    objective:
      "use self, dispatch_subagent, intercom, candidate peer, orchestrator fan-in, fcos, prompt vault, and rocs ontology",
    seeds: [],
    providerPlans: providerPlans(),
  });

  const byId = Object.fromEntries(
    recommendations.map((recommendation) => [recommendation.id, recommendation]),
  );
  assert.ok(byId.asc_self);
  assert.ok(byId.dispatch_subagent);
  assert.ok(byId.intercom);
  assert.ok(byId.peer_tooling);
  assert.ok(byId.orchestrator);
  assert.ok(byId.fcos);
  assert.ok(byId.prompt_vault);
  assert.ok(byId.rocs);
  assert.ok(byId.dispatch_subagent.nonAuthorization.includes("did not spawn"));
  assert.ok(byId.intercom.nonAuthorization.includes("did not send"));
});

test("owner-surface routing maps selected authority providers even without keyword text", () => {
  const recommendations = buildOwnerSurfaceRecommendations({
    objective: "prepare bounded packet",
    seeds: [],
    providerPlans: providerPlans(["ak", "fcos", "prompt_vault"]),
  });

  assert.deepEqual(
    recommendations.map((recommendation) => recommendation.id),
    ["ak", "fcos", "prompt_vault"],
  );
  assert.ok(recommendations.every((recommendation) => recommendation.reason.includes("selected")));
});

test("owner-surface routing does not match authority terms embedded inside unrelated words", () => {
  const recommendations = buildOwnerSurfaceRecommendations({
    objective: "make the packet explain itself and parse templateLiteral examples",
    seeds: [{ kind: "free_text", value: "fake multitasking selfcontained placeholder" }],
    providerPlans: providerPlans(),
  });

  assert.deepEqual(recommendations, []);
});

test("owner-surface routing does not map ordinary template work to Prompt Vault", () => {
  const recommendations = buildOwnerSurfaceRecommendations({
    objective: "update package template scaffolding docs",
    seeds: [],
    providerPlans: providerPlans(),
  });

  assert.deepEqual(recommendations, []);
});

test("owner-surface routing still matches bounded phrases across spacing and separators", () => {
  const recommendations = buildOwnerSurfaceRecommendations({
    objective: "use prompt_vault, candidate-peer, and control board orientation",
    seeds: [],
    providerPlans: providerPlans(),
  });

  assert.deepEqual(
    recommendations.map((recommendation) => recommendation.id),
    ["peer_tooling", "fcos", "prompt_vault"],
  );
});
