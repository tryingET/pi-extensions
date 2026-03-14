import assert from "node:assert/strict";
import test from "node:test";
import {
  buildChangePlanInsertion,
  buildPackInsertion,
  toInteractionCandidate,
} from "../src/adapters/interaction.ts";

test("toInteractionCandidate infers scope from layer", () => {
  const candidate = toInteractionCandidate({
    ontId: "core.Agent",
    kind: "concept",
    layer: "core",
    labels: ["Agent"],
    title: "Agent",
    definition: "Autonomous actor.",
    path: "/tmp/core.Agent.md",
    score: 100,
  });

  assert.equal(candidate.scope, "core");
  assert.equal(candidate.label, "core.Agent");
  assert.match(candidate.detail, /concept/);
});

test("buildPackInsertion creates a pack-oriented prompt", () => {
  const text = buildPackInsertion({
    id: "co.software.SLO",
    ontId: "co.software.SLO",
    kind: "concept",
    scope: "company",
    title: "SLO",
    label: "co.software.SLO",
    detail: "concept • company • SLO",
    preview: "Service level objective.",
    source: "ontology",
  });

  assert.match(text, /ontology_inspect/);
  assert.match(text, /kind=pack/);
  assert.match(text, /scope=company/);
  assert.match(text, /co\.software\.SLO/);
});

test("buildChangePlanInsertion creates a plan-oriented prompt", () => {
  const text = buildChangePlanInsertion({
    id: "core.rel.is_a",
    ontId: "core.rel.is_a",
    kind: "relation",
    scope: "core",
    title: "is_a",
    label: "core.rel.is_a",
    detail: "relation • core • is_a",
    preview: "taxonomy",
    source: "ontology",
  });

  assert.match(text, /ontology_change/);
  assert.match(text, /mode=plan/);
  assert.match(text, /artifactKind=relation/);
  assert.match(text, /scope=core/);
});
