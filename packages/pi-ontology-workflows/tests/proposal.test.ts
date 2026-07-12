// summary: "Tests ontology proposal assessment for new concepts, duplicates, and incomplete relations."
// read_when:
//   - "Changing proposal verdicts, duplicate detection, or relation evidence requirements."

import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { createFilesystemPort } from "../src/adapters/filesystem.ts";
import { createRocsCliPort } from "../src/adapters/rocs-cli.ts";
import { runOntologyChange } from "../src/core/change.ts";
import { createOntologyProposalRuntime } from "../src/core/proposal.ts";
import { createTempOntologyRepo } from "./helpers.ts";

function createRepoOnlyWorkspacePort(repoPath: string) {
  return {
    async detect(cwd: string) {
      return {
        cwd,
        workspaceRoot: path.dirname(repoPath),
        workspaceRefMode: "loose" as const,
        currentRepoPath: repoPath,
        currentRepoDetectedFromGit: true,
        currentRepoHasOntology: true,
        currentRepoKind: "repo" as const,
        currentCompany: undefined,
      };
    },
    async resolveTarget(params: { scope?: string }) {
      const requested = params.scope && params.scope !== "auto" ? params.scope : "repo";
      if (requested !== "repo") {
        throw new Error(`scope=${requested} unavailable in repo-only test workspace`);
      }
      return {
        scope: "repo" as const,
        repoPath,
        repoKind: "repo" as const,
        workspaceRoot: path.dirname(repoPath),
        workspaceRefMode: "loose" as const,
        currentCompany: undefined,
        reasons: ["repo-only test target"],
        externalToCurrentRepo: false,
      };
    },
  };
}

test("proposal runtime suggests a plan for new concept candidates", async () => {
  const repo = await createTempOntologyRepo();
  const runtime = createOntologyProposalRuntime({
    files: createFilesystemPort(),
    rocs: createRocsCliPort(),
    workspace: createRepoOnlyWorkspacePort(repo),
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
});

test("proposal runtime flags likely duplicate concepts", async () => {
  const repo = await createTempOntologyRepo();
  const deps = {
    files: createFilesystemPort(),
    rocs: createRocsCliPort(),
    workspace: createRepoOnlyWorkspacePort(repo),
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
});

test("proposal runtime requires domain and range for relation candidates", async () => {
  const repo = await createTempOntologyRepo();
  const runtime = createOntologyProposalRuntime({
    files: createFilesystemPort(),
    rocs: createRocsCliPort(),
    workspace: createRepoOnlyWorkspacePort(repo),
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
});
