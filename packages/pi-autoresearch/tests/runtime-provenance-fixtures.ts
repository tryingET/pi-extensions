import { buildAutoresearchCandidateResultPacket } from "../src/core/runtime-candidate-result.ts";
import { parseRunProvenance, type RunProvenance } from "../src/core/runtime-provenance.ts";
import {
  appendReceipt,
  createConfigReceipt,
  createRunReceipt,
} from "../src/core/runtime-receipts.ts";
import { writeDashboardSource } from "./runtime-dashboard-fixtures.ts";

export const workloads = [
  "1k/flat",
  "1k/ten",
  "1k/nested8",
  "1k/skewed",
  "1k/groups",
  "1k/mixed",
  "10k/ten",
  "10k/nested8",
  "10k/skewed",
];
export const hypotheses = [
  "refresh redundancy",
  "correctly invalidated derived-data reuse",
  "bounded row reconstruction",
];
const pin = `sha256:${"a".repeat(64)}`;
export function provenanceRequest(cwd: string) {
  return {
    taskId: 6426,
    cwd,
    objective: "SYNTHETIC AK6426 provenance regression — not research evidence",
    scenarios: workloads,
    hypotheses,
    candidateCountPerCell: 1,
    parentPeerTarget: "synthetic-controller",
    metricName: "total_ms",
    direction: "lower" as const,
  };
}
interface FixtureContract {
  lanes: { measurementPlan: string[]; candidateResultPacketPath: string }[];
}
/** Synthetic reader input only. Actual producer integration belongs to the orchestrator. */
export function syntheticProvenanceContract(cwd: string) {
  const request = provenanceRequest(cwd);
  return {
    kind: "autoresearch.matrix_campaign_runner_contract.v1",
    ...request,
    lanes: workloads.flatMap((scenario, s) =>
      hypotheses.map((hypothesis, h) => {
        const cellId = `cell-${String(s + 1).padStart(2, "0")}-${String(h + 1).padStart(2, "0")}`;
        const laneId = "candidate-01";
        const hypothesisId = `${cellId}-${laneId}`;
        const objective = `SYNTHETIC ${scenario}: ${hypothesis}`;
        const payload = {
          cwd,
          name: `matrix-${hypothesisId}`,
          hypothesisId,
          hypothesis: objective,
          candidateSource: "candidate_peer_spawn",
          provenance: {
            matrix: {
              taskId: request.taskId,
              objective: request.objective,
              cellId,
              laneId,
              hypothesis,
              implementationId: `hypothesis-${String(h + 1).padStart(2, "0")}`,
            },
          },
        };
        return {
          cellId,
          laneId,
          scenario,
          hypothesis,
          objective,
          candidateResultPacketPath: `.autoresearch/matrix-campaign/${cellId}/${laneId}.candidate-result.json`,
          measurementPlan: [
            "Synthetic bind declaration, never invoked",
            `autoresearch_runtime_run(${JSON.stringify(payload)})`,
          ],
        };
      }),
    ),
  };
}
export function provenanceFixture(
  cwd: string,
  contract: FixtureContract = syntheticProvenanceContract(cwd),
) {
  const lane = contract.lanes[0];
  const call = lane.measurementPlan[1];
  const payload = JSON.parse(call.slice("autoresearch_runtime_run(".length, -1));
  const provenance: RunProvenance = {
    ...parseRunProvenance(payload.provenance),
    measurement: {
      scenario: workloads[0],
      evaluator: "SYNTHETIC echo evaluator",
      evaluatorRevision: pin,
      subject: "SYNTHETIC fixture source",
      subjectRevision: pin,
      workloadRevision: pin,
    },
  };
  const candidate = {
    source: "candidate_peer_spawn" as const,
    worktreePath: cwd,
    branch: "synthetic",
    baseRef: "a".repeat(40),
    diffSummary: "Synthetic data only; no patch/effect",
    filesChanged: ["fixture.ts"],
  };
  appendReceipt(
    cwd,
    createConfigReceipt({
      name: "retained synthetic segment",
      metricName: "total_ms",
      metricUnit: "ms",
      direction: "lower",
      benchmarkCommand: "configured default never used",
      checksCommand: "configured default never used",
    }),
  );
  const experiment = {
    hypothesisId: payload.hypothesisId,
    hypothesis: payload.hypothesis,
    candidate,
  };
  for (const [i, metric] of [1.34, 1.44, 1.21].entries())
    appendReceipt(
      cwd,
      createRunReceipt({
        status: i === 0 ? "baseline" : "candidate",
        metric,
        description: "SYNTHETIC same-subject process report",
        iteration: i + 1,
        timestamp: 1790867000000 + i,
        empiricalDecisionClass: i === 0 ? "baseline" : "possible_noise",
        experiment,
        provenance,
        benchmarkCommand: "printf 'METRIC total_ms=1.21\\n'",
        checksCommand: "true",
        checksPassed: true,
        execution: {
          cwd,
          benchmark: { exitCode: 0, timedOut: false, aborted: false, outputLimitExceeded: false },
          checks: {
            state: "passed",
            exitCode: 0,
            timedOut: false,
            aborted: false,
            outputLimitExceeded: false,
          },
        },
      }),
    );
  const packet = buildAutoresearchCandidateResultPacket(cwd);
  writeDashboardSource(cwd, ".autoresearch/campaigns/6426/contract.json", contract);
  writeDashboardSource(cwd, lane.candidateResultPacketPath, packet);
  return { contract, lane, payload, provenance, packet };
}
