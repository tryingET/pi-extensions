// summary: "Tests ontology proposal assessment for new concepts, duplicates, and incomplete relations."
// read_when:
//   - "Changing proposal verdicts, duplicate detection, or relation evidence requirements."

import assert from "node:assert/strict";
import test from "node:test";
import { createFilesystemPort } from "../src/adapters/filesystem.ts";
import { createWorkspacePort } from "../src/adapters/workspace.ts";
import { runOntologyChange } from "../src/core/change.ts";
import { createOntologyProposalRuntime } from "../src/core/proposal.ts";
import {
  createFixtureRocsPort,
  createTempOntologyWorkspace,
  type TempOntologyWorkspace,
} from "./helpers.ts";

async function withTempWorkspace<T>(
  run: (fixture: TempOntologyWorkspace) => Promise<T>,
): Promise<T> {
  const previousRoot = process.env.PI_ONTOLOGY_WORKSPACE_ROOT;
  const fixture = await createTempOntologyWorkspace();
  process.env.PI_ONTOLOGY_WORKSPACE_ROOT = fixture.root;
  try {
    return await run(fixture);
  } finally {
    if (previousRoot === undefined) delete process.env.PI_ONTOLOGY_WORKSPACE_ROOT;
    else process.env.PI_ONTOLOGY_WORKSPACE_ROOT = previousRoot;
  }
}

function assertCompleteCrossScopeSearch(reasoning: string): void {
  assert.match(reasoning, /Searched repo, company, core/);
  assert.doesNotMatch(reasoning, /Skipped /);
}

test("proposal runtime suggests a plan for new concept candidates", async () => {
  await withTempWorkspace(async ({ repo }) => {
    const runtime = createOntologyProposalRuntime({
      files: createFilesystemPort(),
      rocs: createFixtureRocsPort(),
      workspace: createWorkspacePort(),
    });

    const result = await runtime.assess(
      {
        candidateKind: "concept",
        title: "Benchmark harness",
        labels: ["Benchmark harness"],
        synonyms: ["benchmark runner"],
        description: "Stable harness used to execute repeatable benchmark runs for a repo feature.",
        rationale: "This keeps the execution rig distinct from metrics and receipts.",
        evidenceRefs: ["docs/project/pi-autoresearch-rfc.md"],
      },
      { cwd: repo },
    );

    assert.equal(result.ok, true);
    assert.equal(result.verdict, "new_concept_candidate");
    assert.equal(result.recommendedScope, "repo");
    assert.equal(result.duplicateRisk, "low");
    assert.match(result.recommendedTargetId ?? "", /BenchmarkHarness$/);
    assert.equal(result.ontologyChangePlan?.mode, "plan");
    assert.equal(result.ontologyChangePlan?.artifactKind, "concept");
    assert.equal(result.ontologyChangePlan?.scope, "repo");
    assert.equal(result.ontologyChangePlan?.payload.title, "Benchmark harness");
    assertCompleteCrossScopeSearch(result.reasoning);
  });
});

test("proposal runtime flags likely duplicate concepts", async () => {
  await withTempWorkspace(async ({ repo }) => {
    const deps = {
      files: createFilesystemPort(),
      rocs: createFixtureRocsPort(),
      workspace: createWorkspacePort(),
    };

    await runOntologyChange(
      {
        mode: "apply",
        artifactKind: "concept",
        operation: "create",
        targetId: "demo.BenchmarkHarness",
        title: "Benchmark harness",
        description: "Stable harness used to execute repeatable benchmark runs for a repo feature.",
        labels: ["Benchmark harness"],
        synonyms: ["benchmark runner"],
        validateAfter: true,
        buildAfter: true,
      },
      { cwd: repo },
      deps,
    );

    const runtime = createOntologyProposalRuntime(deps);
    const result = await runtime.assess(
      {
        candidateKind: "concept",
        title: "Benchmark harness",
        labels: ["Benchmark harness"],
        description: "Stable harness used to execute repeatable benchmark runs for a repo feature.",
        rationale: "Potentially missing ontology slot for reusable benchmark execution rigs.",
      },
      { cwd: repo },
    );

    assert.equal(result.ok, false);
    assert.equal(result.verdict, "likely_duplicate");
    assert.equal(result.duplicateRisk, "high");
    assert.equal(result.ontologyChangePlan, undefined);
    assert.equal(result.nearestExisting[0]?.ontId, "demo.BenchmarkHarness");
    assertCompleteCrossScopeSearch(result.reasoning);
  });
});

test("proposal runtime requires domain and range for relation candidates", async () => {
  await withTempWorkspace(async ({ repo }) => {
    const runtime = createOntologyProposalRuntime({
      files: createFilesystemPort(),
      rocs: createFixtureRocsPort(),
      workspace: createWorkspacePort(),
    });

    const result = await runtime.assess(
      {
        candidateKind: "relation",
        title: "belongs_to_run",
        labels: ["belongs_to_run"],
        description: "Links a benchmark receipt to the run that produced it.",
        rationale: "The link is needed for structured pack/review flows.",
      },
      { cwd: repo },
    );

    assert.equal(result.ok, false);
    assert.equal(result.verdict, "insufficient_evidence");
    assert.equal(result.ontologyChangePlan, undefined);
    assert.match(result.reasoning, /domain and range/i);
    assertCompleteCrossScopeSearch(result.reasoning);
  });
});
