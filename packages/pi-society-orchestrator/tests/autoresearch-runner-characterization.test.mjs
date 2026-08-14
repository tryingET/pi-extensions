import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  advanceAutoresearchLevel3MatrixCellExecutor,
  buildAutoresearchCampaignPeerRunnerHandoffContract,
  buildAutoresearchLevel3AuthorizedFinalizerCleanupPlan,
  buildAutoresearchLevel3ManifestPreflight,
  buildAutoresearchLevel3MatrixCellRunner,
  buildAutoresearchLevel3MeasureExportReviewPlan,
  buildAutoresearchLevel3SliceSequenceDryRun,
  buildAutoresearchLevel3VisibleCandidateLifecyclePlan,
  buildAutoresearchMatrixCampaignRunnerContract,
  checkpointAutoresearchMatrixCampaignRunner,
  runAutoresearchLevel4CampaignRunner,
} from "../src/runtime/autoresearch-supervisor-runner.ts";

// Deterministic serialization: object keys sorted, then normalization of
// run-local non-determinism (temp cwd path, cwd-derived sha256 digests,
// wall-clock timestamps). Characterization goldens are captured under this
// exact normalization and embedded below as literals.
function stableStringify(value) {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (value && typeof value === "object") {
    const entries = Object.entries(value)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function normalizeStableJson(stable) {
  return stable
    .replaceAll("<TMP_ROOT>", "<TMP_ROOT>")
    .replace(/[0-9a-f]{64}/gu, "<sha256>")
    .replace(/:sha256:[0-9a-f]+/gu, ":sha256:<digest>")
    .replace(
      /authorize-post-fanin-finalizer:[0-9a-f]+/gu,
      "authorize-post-fanin-finalizer:<digest>",
    )

    .replace(
      /("(?:[^"]*(?:epochMs|EpochMs|timestamp|Timestamp|executedAt)[^"]*)":)\d+/gu,
      "$1<epoch>",
    )
    .replace(/(,"cwd":)"[^"]*"/gu, '$1"<CWD>"')
    .replace(/("cwd":)"[^"]*"/gu, '$1"<CWD>"');
}

let TMP_ROOT = "";
let CWD = "";

function normalize(value) {
  let stable = stableStringify(value);
  if (TMP_ROOT) stable = stable.split(JSON.stringify(TMP_ROOT).slice(1, -1)).join("<TMP_ROOT>");
  if (CWD) stable = stable.split(JSON.stringify(CWD).slice(1, -1)).join("<CWD>");
  return normalizeStableJson(stable);
}

const TASK_ID = 4759;

function buildFixtures() {
  TMP_ROOT = mkdtempSync(path.join(os.tmpdir(), "orchestrator-runner-characterization-"));
  CWD = path.join(TMP_ROOT, "repo");
  mkdirSync(CWD, { recursive: true });

  const manifest = {
    kind: "autoresearch.level3_campaign_manifest.v1",
    taskId: TASK_ID,
    cwd: CWD,
    campaignId: "characterization-campaign-01",
    autonomyLevel: 3,
    objective: "characterize level-3 runner builders",
    primaryMetric: { name: "characterization_blockers", direction: "lower", target: 0 },
    filesInScope: ["src/feature.ts"],
    offLimits: [".env"],
    slices: [
      {
        sliceId: "slice-01",
        cells: [
          {
            cellId: "cell-a",
            scenario: "owner-review-first",
            hypothesis: "managed candidate waves beat ad hoc spawning",
            objective: "characterize cell-a",
          },
        ],
      },
    ],
    policy: {
      launchVisibleCandidatePeers: "manifest_allowed",
      runMeasurements: "manifest_allowed",
      exportCandidateResults: "manifest_allowed",
      generateReviewPackets: true,
      prepareFinalizerTokenRequest: true,
      applyFinalizer: "token_required",
      cleanupCandidates: "token_required",
      recordAkEvidence: "ak_owner_write_required",
      completeAkTask: "ak_owner_write_required",
      mergeReleasePromotion: "promotion_token_required",
    },
    cleanupPolicy: {
      exactPeerRunIds: ["peer-run-01"],
      exactPeerTabsOrSessions: ["tab-1"],
      exactWorktrees: [".worktrees/cell-a-candidate-01"],
      exactBranches: ["candidate/cell-a-candidate-01"],
    },
  };

  const packetPath = path.join(
    CWD,
    ".autoresearch",
    "characterization",
    "cell-a-candidate-01.candidate-result.json",
  );
  mkdirSync(path.dirname(packetPath), { recursive: true });
  writeFileSync(
    packetPath,
    JSON.stringify(
      {
        packetKind: "autoresearch.candidate_result.v1",
        adapterContractVersion: 1,
        cwd: CWD,
        campaign: "characterization",
        candidate: {
          source: "candidate_peer_spawn",
          peerRunId: "peer-run-01",
          worktreePath: path.join(CWD, ".worktrees", "cell-a-candidate-01"),
          branch: "candidate/cell-a-candidate-01",
          baseRef: "HEAD",
          diffSummary: "characterization candidate",
          filesChanged: ["src/feature.ts"],
        },
        candidateRun: {
          iteration: 1,
          status: "candidate",
          runKind: "ordinary",
          empiricalDecisionClass: "candidate_improvement",
          metric: 1,
          description: "characterize candidate measurement",
          timestamp: 1700000000000,
          checks: "pass",
          experiment: { hypothesisId: "cell-a-candidate-01", hypothesis: "characterize" },
        },
        empiricalDecisionClass: "candidate_improvement",
        resultSummary: "characterization candidate measured",
        closeout: { status: { confidence: 2.5 } },
        adapterBoundary: "candidate packet is measurement evidence only",
      },
      null,
      2,
    ),
  );

  const matrixRunnerRequest = {
    taskId: TASK_ID,
    cwd: CWD,
    objective: "characterize matrix campaign runner builders",
    direction: "lower",
    metricName: "characterization_blockers",
    metricThreshold: 0,
    scenarios: ["owner-review-first"],
    hypotheses: ["managed candidate waves beat ad hoc spawning"],
    candidateCountPerCell: 1,
    filesInScope: ["src/feature.ts"],
    offLimits: [".env"],
    parentPeerTarget: "pi://characterization/parent",
    maxIterationsPerCandidate: 1,
    maxWallClockMinutesPerCandidate: 5,
  };

  const checkpointToken = [
    "controller-checkpoint:matrix-visible-peers-reported",
    `task:${TASK_ID}`,
    `cwd:${path.resolve(CWD)}`,
    "manifest:.autoresearch/matrix-campaign/runner-manifest.json",
  ].join("|");

  const candidateBindings = [
    {
      laneId: "cell-a-candidate-01",
      candidatePeerRunId: "peer-run-01",
      candidateWorktree: path.join(CWD, ".worktrees", "cell-a-candidate-01"),
      candidateBranch: "candidate/cell-a-candidate-01",
      candidateBaseRef: "HEAD",
      candidateDiffSummary: "characterization candidate",
      candidateFilesChanged: ["src/feature.ts"],
    },
  ];

  const level3Base = {
    taskId: TASK_ID,
    cwd: CWD,
    manifest,
    parentPeerTarget: "pi://characterization/parent",
    candidateBindings,
    candidateResultPacketDirectory: ".autoresearch/characterization",
  };

  return {
    manifest,
    matrixRunnerRequest,
    checkpointToken,
    candidateBindings,
    level3Base,
    packetPath,
  };
}

const CASES = [
  {
    name: "buildAutoresearchCampaignPeerRunnerHandoffContract",
    run: () => buildAutoresearchCampaignPeerRunnerHandoffContract(),
  },
  {
    name: "buildAutoresearchMatrixCampaignRunnerContract",
    run: (fx) => buildAutoresearchMatrixCampaignRunnerContract(fx.matrixRunnerRequest),
  },
  {
    name: "checkpointAutoresearchMatrixCampaignRunner",
    run: (fx) =>
      checkpointAutoresearchMatrixCampaignRunner({
        ...fx.matrixRunnerRequest,
        checkpointConfirmation: fx.checkpointToken,
      }),
  },
  {
    name: "advanceAutoresearchLevel3MatrixCellExecutor",
    run: (fx) =>
      advanceAutoresearchLevel3MatrixCellExecutor({
        ...fx.matrixRunnerRequest,
        checkpointConfirmation: fx.checkpointToken,
        completedActionCount: 0,
      }),
  },
  {
    name: "runAutoresearchLevel4CampaignRunner",
    run: (fx) =>
      runAutoresearchLevel4CampaignRunner({
        ...fx.matrixRunnerRequest,
        checkpointConfirmation: fx.checkpointToken,
        completedActionCount: 0,
        level4ReceiptPath: ".autoresearch/characterization/level4-receipts.jsonl",
        maxAutomatedActions: 1,
      }),
  },
  {
    name: "buildAutoresearchLevel3ManifestPreflight",
    run: (fx) => buildAutoresearchLevel3ManifestPreflight(fx.level3Base),
  },
  {
    name: "buildAutoresearchLevel3SliceSequenceDryRun",
    run: (fx) => buildAutoresearchLevel3SliceSequenceDryRun(fx.level3Base),
  },
  {
    name: "buildAutoresearchLevel3VisibleCandidateLifecyclePlan",
    run: (fx) => buildAutoresearchLevel3VisibleCandidateLifecyclePlan(fx.level3Base),
  },
  {
    name: "buildAutoresearchLevel3MeasureExportReviewPlan",
    run: (fx) => buildAutoresearchLevel3MeasureExportReviewPlan(fx.level3Base),
  },
  {
    name: "buildAutoresearchLevel3MatrixCellRunner",
    run: (fx) => buildAutoresearchLevel3MatrixCellRunner(fx.level3Base),
  },
  {
    name: "buildAutoresearchLevel3AuthorizedFinalizerCleanupPlan",
    run: (fx) =>
      buildAutoresearchLevel3AuthorizedFinalizerCleanupPlan({
        ...fx.level3Base,
        objective: "characterize authorized finalizer cleanup planning",
        sourceReview: "review_candidate_wave",
        direction: "lower",
        metricName: "characterization_blockers",
        metricThreshold: 0,
        candidateResultPacketPaths: [fx.packetPath],
        scenarios: ["owner-review-first"],
        hypotheses: ["managed candidate waves beat ad hoc spawning"],
        candidateCountPerCell: 1,
        selectedLaneId: "cell-a-candidate-01",
        validation: { command: "npm run check", status: "passed" },
        offLimits: [".env"],
        dirtyFiles: [],
        reviewedAtEpochMs: 1700000000000,
      }),
  },
];

const GOLDENS = JSON.parse(
  readFileSync(
    path.join(import.meta.dirname, "autoresearch-runner-characterization.goldens.json"),
    "utf8",
  ),
);

for (const testCase of CASES) {
  test(testCase.name, () => {
    const fixtures = buildFixtures();
    const result = testCase.run(fixtures);
    const normalized = normalize(result);
    if (process.env.AUTORESEARCH_GOLDEN_UPDATE) {
      const outDir = process.env.AUTORESEARCH_GOLDEN_OUT ?? ".";
      mkdirSync(outDir, { recursive: true });
      writeFileSync(
        path.join(outDir, `${testCase.name}.golden.json`),
        `${JSON.stringify(normalized, null, 2)}\n`,
      );
      return;
    }
    const golden = GOLDENS[testCase.name];
    assert.ok(golden !== undefined, `golden missing for ${testCase.name}`);
    if (process.env.AUTORESEARCH_DEBUG_DIFF) {
      const a = normalized,
        b = golden;
      let i = 0;
      while (i < a.length && i < b.length && a[i] === b[i]) i++;
      console.error(
        "DIFF at",
        i,
        JSON.stringify(a.slice(Math.max(0, i - 40), i + 80)),
        "||",
        JSON.stringify(b.slice(Math.max(0, i - 40), i + 80)),
      );
    }
    assert.equal(normalized, golden);
  });
}
