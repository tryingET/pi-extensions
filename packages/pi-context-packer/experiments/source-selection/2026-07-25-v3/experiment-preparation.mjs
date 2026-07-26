import { constants as fsConstants } from "node:fs";
import { copyFile, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";

import { experimentInternals } from "../../../src/source-selection-experiment.js";
import { checkCasesInput } from "./experiment-cases.mjs";
import {
  CASES_MANIFEST,
  CASES_PATH,
  CASES_RELATIVE_PATH,
  CHECKSUMS,
  EXPECTED_CASES_SHA256,
  EXPECTED_OBSERVATIONS_SHA256,
  EXPECTED_PREPARATION_ATTEMPT_LOG_SHA256,
  EXPECTED_PREREGISTRATION_SHA256,
  EXPECTED_PROVENANCE,
  EXPECTED_SOURCE_LIST_SHA256,
  EXPECTED_STALENESS_CANDIDATES_SHA256,
  EXPECTED_STALENESS_REVIEW_SHA256,
  GIT_PATH,
  GZIP_PATH,
  OBSERVATIONS,
  PRE_REVIEW_ALLOWED_PATHS,
  PRE_REVIEW_CHECKSUMS,
  PRE_RUN_REVIEW,
  PREPARATION_ATTEMPT_LOG,
  PREPARED_GZIP,
  PREREGISTRATION_PATH,
  PREREGISTRATION_RELATIVE_PATH,
  REPOSITORIES,
  RESULT,
  SCI_OWNER_ROOT,
  SCI_PATH,
  STALENESS_CANDIDATES,
  STALENESS_REVIEW,
  SUMMARY,
  SUPPORT_FILES,
  TRACE_BUNDLE,
  WORK_ROOT,
} from "./experiment-config.mjs";
import {
  assertStableTarget,
  capture,
  exists,
  fail,
  runStructuralCase,
  sha256Hex,
  shaFile,
  sourceState,
  stableJson,
  targetState,
} from "./experiment-runtime.mjs";
import {
  createChecksumManifest,
  createTraceBundle,
  preparationReceipt,
} from "./preparation-artifacts.mjs";
import { materializeRepositories, verifyHostArtifacts } from "./producer-preparation.mjs";
import { byteAndTokenCost } from "./trace-evidence.mjs";
import { V3_PROTOCOL, validateV3Experiment } from "./v3-experiment.mjs";

const STALENESS_REVIEWS = Object.freeze({
  "agent-scripts": "dispatch-1785037127241",
  "engineering-core": "dispatch-1785037127242",
  dspx: "dispatch-1785037127243",
  "pi-extensions": "dispatch-1785037127243-1",
  "agent-kernel": "dispatch-1785037127244",
});

function assertHash(bytes, expected, label) {
  if (sha256Hex(bytes) !== expected) fail(`${label} SHA-256 mismatch`);
}

function preparationObservation(repository, retained, sourceListPath) {
  const full = retained.pairs[0].full;
  const body = {
    schema: "pi-context-packer.source_list_preparation_observation.v1",
    repositoryCommit: repository.commit,
    rawArtifactSha256: retained.sourceListArtifact.rawSha256,
    sourceListExecutable: {
      nodePath: full.command[0],
      path: sourceListPath,
      revision: REPOSITORIES.find(({ id }) => id === "agent-scripts").commit,
      artifactSha256: `sha256:${EXPECTED_SOURCE_LIST_SHA256}`,
    },
    command: [full.command[0], sourceListPath, "--repo", ".", "--full-list", "--json"],
    commandDigest: null,
    exitCode: full.exitCode,
    targetState: {
      headBefore: full.before.head,
      headAfter: full.after.head,
      statusBefore: "",
      statusAfter: "",
      cleanBefore: full.before.clean,
      cleanAfter: full.after.clean,
    },
    trackedPathInventory: {
      command: retained.trackedPathInventory.command,
      commandDigest: retained.trackedPathInventory.commandDigest,
      stdoutBase64: retained.trackedPathInventory.stdoutBase64,
      stdoutSha256: retained.trackedPathInventory.stdoutSha256,
      exitCode: retained.trackedPathInventory.exitCode,
    },
  };
  body.commandDigest = experimentInternals.sha256Digest(body.command);
  return { ...body, observationDigest: experimentInternals.sha256Digest(body) };
}

function stalenessSample(repository, retained, candidate) {
  const method = `${candidate.method} Independently ACCEPTed before ranking by ${STALENESS_REVIEWS[repository.id]}; stalePaths=[].`;
  const body = {
    commit: repository.commit,
    rawArtifactSha256: retained.sourceListArtifact.rawSha256,
    method,
    sampledPaths: candidate.sampledItems.map(({ path }) => path),
    stalePaths: [],
  };
  return { ...body, sampleDigest: experimentInternals.sha256Digest(body) };
}

export async function prepare() {
  for (const path of [
    PREPARED_GZIP,
    TRACE_BUNDLE,
    CASES_MANIFEST,
    SUMMARY,
    PRE_REVIEW_CHECKSUMS,
    CHECKSUMS,
    PRE_RUN_REVIEW,
    RESULT,
    WORK_ROOT,
  ]) {
    if (await exists(path)) fail(`refusing existing path: ${path}`);
  }
  const [
    casesBytes,
    preregistrationBytes,
    observationBytes,
    candidateBytes,
    reviewBytes,
    attemptBytes,
  ] = await Promise.all([
    readFile(CASES_PATH),
    readFile(PREREGISTRATION_PATH),
    readFile(OBSERVATIONS),
    readFile(STALENESS_CANDIDATES),
    readFile(STALENESS_REVIEW),
    readFile(PREPARATION_ATTEMPT_LOG),
  ]);
  assertHash(casesBytes, EXPECTED_CASES_SHA256, CASES_RELATIVE_PATH);
  assertHash(preregistrationBytes, EXPECTED_PREREGISTRATION_SHA256, PREREGISTRATION_RELATIVE_PATH);
  assertHash(observationBytes, EXPECTED_OBSERVATIONS_SHA256, basename(OBSERVATIONS));
  assertHash(candidateBytes, EXPECTED_STALENESS_CANDIDATES_SHA256, basename(STALENESS_CANDIDATES));
  assertHash(reviewBytes, EXPECTED_STALENESS_REVIEW_SHA256, basename(STALENESS_REVIEW));
  assertHash(
    attemptBytes,
    EXPECTED_PREPARATION_ATTEMPT_LOG_SHA256,
    basename(PREPARATION_ATTEMPT_LOG),
  );
  const frozenCases = checkCasesInput(JSON.parse(casesBytes.toString("utf8")));
  const costStudy = JSON.parse(observationBytes.toString("utf8"));
  const stalenessCandidates = JSON.parse(candidateBytes.toString("utf8"));
  if (
    costStudy.rankingExecuted !== false ||
    costStudy.resultAbsent !== true ||
    costStudy.repositories.length !== 5 ||
    costStudy.repositories.some(({ pairs }) => pairs.length !== 5)
  ) {
    fail("retained cost observations violate the pre-ranking five-pair contract");
  }
  if (
    stalenessCandidates.rankingExecuted !== false ||
    stalenessCandidates.repositories.length !== 5
  ) {
    fail("metadata-staleness projection violates the pre-ranking contract");
  }
  const sourceStatesBefore = Object.fromEntries(
    await Promise.all(
      [...REPOSITORIES, { id: "semantic-code-intelligence", source: SCI_OWNER_ROOT }].map(
        async ({ id, source }) => [id, await sourceState(source)],
      ),
    ),
  );
  await mkdir(WORK_ROOT, { recursive: false, mode: 0o700 });
  await mkdir(join(WORK_ROOT, "requests"));
  await mkdir(join(WORK_ROOT, "runtime"));
  await mkdir(join(WORK_ROOT, "traces"));
  await mkdir(join(WORK_ROOT, "traces", "raw"));
  try {
    const artifacts = await verifyHostArtifacts();
    const repositories = await materializeRepositories();
    const preparedRepositories = [];
    const repositorySummaries = [];
    const preparedCases = [];
    const caseManifest = [];
    const sciInvocationSummaries = [];
    const traceRecords = [];
    for (const repository of repositories) {
      const retained = costStudy.repositories.find(({ id }) => id === repository.id);
      const candidate = stalenessCandidates.repositories.find(({ id }) => id === repository.id);
      if (
        !retained ||
        !candidate ||
        retained.commit !== repository.commit ||
        candidate.commit !== repository.commit
      ) {
        fail(
          `${repository.id}: retained source-list/staleness evidence is missing or commit-mismatched`,
        );
      }
      const sourceListPath = retained.pairs[0].full.command[1];
      const sourceListPreparation = preparationObservation(repository, retained, sourceListPath);
      const metadataStalenessSample = stalenessSample(repository, retained, candidate);
      const sourceListPayload = JSON.parse(retained.sourceListArtifact.rawJson);
      preparedRepositories.push({
        id: repository.id,
        commit: repository.commit,
        sourceListArtifact: retained.sourceListArtifact,
        sourceListPreparation,
        metadataStalenessSample,
      });
      const repositoryCases = frozenCases.filter(
        ({ repositoryId }) => repositoryId === repository.id,
      );
      const perCaseState = [];
      for (const frozen of repositoryCases) {
        for (const truthPath of frozen.truth) {
          if (!sourceListPayload.items.some(({ path }) => path === truthPath)) {
            fail(`${frozen.id}: truth is outside the retained candidate universe`);
          }
        }
        const identity = experimentInternals.expectedQuestionIdentity(frozen, {
          commit: repository.commit,
          rawArtifactSha256: retained.sourceListArtifact.rawSha256,
        });
        const structural = await runStructuralCase(frozen, repository, artifacts);
        preparedCases.push({
          id: frozen.id,
          repositoryId: repository.id,
          repositoryCommit: repository.commit,
          sourceListArtifactSha256: retained.sourceListArtifact.rawSha256,
          question: frozen.question,
          ...identity,
          maxItems: frozen.maxItems,
          truth: [...frozen.truth],
          structuralEvidence: {
            expectedRequest: structural.expectedRequest,
            expectedRequestDigest: structural.expectedRequestDigest,
            expectedProvenance: structural.expectedProvenance,
            receipt: structural.receipt,
            executionObservation: structural.executionObservation,
          },
        });
        perCaseState.push({
          id: frozen.id,
          indexSha256Before: structural.targetIndexSha256Before,
          indexSha256After: structural.targetIndexSha256After,
          producerTempRootRemovedAndAbsent: structural.runtimeRootRemovedAndAbsent,
        });
        sciInvocationSummaries.push({
          id: frozen.id,
          repositoryId: repository.id,
          monotonicDurationNanoseconds: structural.monotonicDurationNanoseconds,
          producerInvocationCost: structural.producerInvocationCost,
          retainedRawEvidenceCosts: structural.rawByteAndTokenCosts,
          cleanup: {
            producerTempRootRemovedAndAbsent: structural.runtimeRootRemovedAndAbsent,
          },
          trace: {
            rawSha256: structural.trace.rawSha256,
            rawCost: {
              bytes: structural.trace.corroboration.traceByteCount,
              approximateTokensCeilBytesDiv4:
                structural.trace.corroboration.approximateTraceTokensCeilBytesDiv4,
            },
            corroboration: structural.trace.corroboration,
          },
        });
        traceRecords.push({
          id: frozen.id,
          repositoryId: repository.id,
          repositoryCommit: repository.commit,
          subjectArgv: structural.trace.subjectArgv,
          instrumentationArgv: structural.trace.instrumentationArgv,
          rawTraceArchivePath: `raw/${frozen.id}.strace`,
          rawTraceSha256: structural.trace.rawSha256,
          corroboration: structural.trace.corroboration,
        });
        caseManifest.push({
          id: frozen.id,
          repositoryId: repository.id,
          repositoryCommit: repository.commit,
          question: frozen.question,
          truth: [...frozen.truth],
          maxItems: frozen.maxItems,
          questionId: identity.questionId,
          intentSignature: identity.intentSignature,
          targetBasisDigest: identity.targetBasisDigest,
          expectedRequestDigest: structural.expectedRequestDigest,
          receiptDigest: structural.receipt.receiptDigest,
          executionObservationDigest: structural.executionObservation.observationDigest,
          receiptAvailable: true,
          receiptComplete: true,
          evidenceCount: structural.receipt.summary.returnedCount,
        });
      }
      const finalState = await targetState(repository.root);
      assertStableTarget(
        repository.materializedState,
        finalState,
        repository.commit,
        `${repository.id} final`,
      );
      repositorySummaries.push({
        id: repository.id,
        commit: repository.commit,
        candidateCount: retained.coverage.totalCount,
        metadataPresentCount: retained.coverage.metadataPresentCount,
        metadataCoverage: retained.coverage.ratio,
        sourceListEligible: retained.coverage.groundTruth === "eligible",
        sourceListRawArtifactSha256: retained.sourceListArtifact.rawSha256,
        sourceListPreparationObservationDigest: sourceListPreparation.observationDigest,
        stalenessReviewDispatchId: STALENESS_REVIEWS[repository.id],
        stalenessSampleCount: metadataStalenessSample.sampledPaths.length,
        stalePathCount: 0,
        caseObservations: perCaseState,
        targetCleanAndCommitStable: true,
      });
    }
    if (preparedRepositories.length !== 5 || preparedCases.length !== 50) {
      fail("prepared cardinality differs from five repositories and 50 cases");
    }
    if (repositorySummaries.filter(({ sourceListEligible }) => sourceListEligible).length < 3) {
      fail("fewer than three metadata-eligible repositories remain");
    }
    if (
      caseManifest.some(
        ({ receiptAvailable, receiptComplete }) => !receiptAvailable || !receiptComplete,
      ) ||
      sciInvocationSummaries.some(({ cleanup }) => !cleanup.producerTempRootRemovedAndAbsent)
    ) {
      fail("SCI receipt completeness or cleanup gate failed");
    }
    const traceBundle = await createTraceBundle(traceRecords, artifacts);
    const prepared = {
      protocol: V3_PROTOCOL,
      repositories: preparedRepositories,
      cases: preparedCases,
      costStudy,
    };
    const uncompressedPath = join(WORK_ROOT, "prepared-source-selection-refinement-v3.json");
    const uncompressedJson = stableJson(prepared);
    await writeFile(uncompressedPath, uncompressedJson, { flag: "wx", mode: 0o600 });
    // Validation only: this path validates contracts, receipts, identities, and denominators.
    // It deliberately does not build ranking rows or return ranking selections.
    validateV3Experiment(JSON.parse(await readFile(uncompressedPath, "utf8")));
    const gzipTemp = join(WORK_ROOT, basename(PREPARED_GZIP));
    const gzipResult = await capture(
      GZIP_PATH,
      ["--no-name", "--best", "--stdout", uncompressedPath],
      { maxBytes: 256 * 1024 * 1024 },
    );
    if (gzipResult.code !== 0 || gzipResult.signal !== null || gzipResult.stderr.length !== 0) {
      fail("deterministic prepared-input gzip failed or wrote stderr");
    }
    await writeFile(gzipTemp, gzipResult.stdout, { flag: "wx", mode: 0o644 });
    const inputSha256 = sha256Hex(Buffer.from(uncompressedJson, "utf8"));
    const gzipSha256 = sha256Hex(gzipResult.stdout);
    const sourceStatesAfter = Object.fromEntries(
      await Promise.all(
        [...REPOSITORIES, { id: "semantic-code-intelligence", source: SCI_OWNER_ROOT }].map(
          async ({ id, source }) => [id, await sourceState(source)],
        ),
      ),
    );
    if (JSON.stringify(sourceStatesAfter) !== JSON.stringify(sourceStatesBefore)) {
      fail("a source-owner or producer repository changed during preparation");
    }
    const sciTrackedDiff = await capture(GIT_PATH, [
      "-C",
      SCI_OWNER_ROOT,
      "diff",
      "--exit-code",
      "--",
      "bin/semantic-code-intelligence",
      "dist/cli/cli.js",
      "package.json",
    ]);
    if (sciTrackedDiff.code !== 0 || sciTrackedDiff.signal !== null) {
      fail("tracked SCI executable artifacts are not clean at the pinned revision");
    }
    if (await exists(RESULT)) fail("ranking output appeared during preparation");
    const casesManifestValue = {
      schema: "pi-context-packer.source_selection_cases_pre_ranking.v3",
      inputCaseFile: {
        path: CASES_RELATIVE_PATH,
        sha256: `sha256:${EXPECTED_CASES_SHA256}`,
        repositories: 5,
        cases: 50,
      },
      status: "pre-ranking",
      truthChangedAfterReview: false,
      questionsChangedAfterReview: false,
      cases: caseManifest,
    };
    const casesManifestJson = stableJson(casesManifestValue);
    const casesTemp = join(WORK_ROOT, basename(CASES_MANIFEST));
    await writeFile(casesTemp, casesManifestJson, { flag: "wx" });
    const implementation = await Promise.all(
      SUPPORT_FILES.map(async (path) => ({
        path: basename(path),
        sha256: `sha256:${await shaFile(path)}`,
      })),
    );
    const summaryValue = {
      schema: "pi-context-packer.source_selection_preparation_summary.v3",
      protocol: V3_PROTOCOL,
      status: "prepared-awaiting-independent-pre-run-review",
      repositories: 5,
      cases: 50,
      preregistration: {
        relativePath: PREREGISTRATION_RELATIVE_PATH,
        rawSha256: `sha256:${EXPECTED_PREREGISTRATION_SHA256}`,
      },
      canonicalCaseSource: {
        relativePath: CASES_RELATIVE_PATH,
        rawSha256: `sha256:${EXPECTED_CASES_SHA256}`,
      },
      retainedCostStudy: {
        path: basename(OBSERVATIONS),
        rawSha256: `sha256:${EXPECTED_OBSERVATIONS_SHA256}`,
        gates: costStudy.aggregates.gates,
        automaticInvocationEvidence: "not-demonstrated",
      },
      metadataStaleness: {
        candidatesSha256: `sha256:${EXPECTED_STALENESS_CANDIDATES_SHA256}`,
        reviewSha256: `sha256:${EXPECTED_STALENESS_REVIEW_SHA256}`,
        reviews: STALENESS_REVIEWS,
        stalePaths: [],
      },
      discardedCollectorAttempt: {
        disclosed: true,
        logSha256: `sha256:${EXPECTED_PREPARATION_ATTEMPT_LOG_SHA256}`,
        admissibilityReviewRequired: true,
      },
      preparationImplementation: implementation,
      sourceList: {
        executableSha256: `sha256:${EXPECTED_SOURCE_LIST_SHA256}`,
        repositories: repositorySummaries,
      },
      structuralEvidence: {
        command: `${SCI_PATH} experimental structural-evidence-receipt --request-file <external-request-file>`,
        expectedProvenance: EXPECTED_PROVENANCE,
        attempted: 50,
        exitZero: 50,
        receiptCount: 50,
        available: 50,
        complete: 50,
        emptyStderr: 50,
        processGroupsTerminated: 50,
        temporaryRootsRemoved: 50,
        noTargetIndexMutation: true,
        noTargetOntologyState: true,
        invocations: sciInvocationSummaries,
        fileAccessCorroboration: {
          ...traceBundle.summary,
          subjectExporterTraces: 50,
          targetGitIndexAccessRecordCount: sciInvocationSummaries.reduce(
            (total, item) => total + item.trace.corroboration.targetGitIndexAccessRecordCount,
            0,
          ),
          authenticationClaim: false,
        },
      },
      measurementMethod: {
        duration: "Actual monotonic nanoseconds around each producer subprocess.",
        rawBytes: "Exact retained producer input/output/evidence byte lengths.",
        approximateTokenCost: "ceil(bytes/4), disclosure-only.",
        modelInput: { bytes: 0, tokens: 0 },
        tracingOverhead: "SCI durations include strace trace=%file instrumentation.",
      },
      executableArtifacts: artifacts,
      sourceAndProducerState: {
        unchanged: true,
        before: sourceStatesBefore,
        after: sourceStatesAfter,
        sciTrackedExecutableArtifactsClean: true,
      },
      preparedInput: {
        gzipPath: basename(PREPARED_GZIP),
        gzipSha256: `sha256:${gzipSha256}`,
        gzipCost: byteAndTokenCost(gzipResult.stdout),
        uncompressedSha256: `sha256:${inputSha256}`,
        uncompressedCost: byteAndTokenCost(uncompressedJson),
        uncompressedRetained: false,
      },
      validation: {
        contractValidatorCalled: true,
        rankingRowsBuilt: false,
        rankingsRetained: false,
        rankingsPrinted: false,
        rankingsInspected: false,
      },
      preReviewChecksumManifest: {
        path: basename(PRE_REVIEW_CHECKSUMS),
        approvedEntryCount: PRE_REVIEW_ALLOWED_PATHS.length,
      },
      ranking: {
        executed: false,
        resultPath: basename(RESULT),
        resultAbsent: true,
        runModeRequiresExplicitExecuteRankingFlag: true,
      },
      limitations: [
        "The discarded non-ranking collector attempt requires independent admissibility review.",
        "The page probe performs complete producer inventory work before output slicing.",
        "Hashes and strace are integrity/corroboration, not producer authentication.",
        "Host-local monotonic timings are not cache-cold or production-latency claims.",
      ],
    };
    const summaryJson = stableJson(summaryValue);
    const summaryTemp = join(WORK_ROOT, basename(SUMMARY));
    await writeFile(summaryTemp, summaryJson, { flag: "wx" });
    const generated = new Map([
      [basename(CASES_MANIFEST), Buffer.from(casesManifestJson)],
      [basename(SUMMARY), Buffer.from(summaryJson)],
      [basename(PREPARED_GZIP), gzipResult.stdout],
      [basename(TRACE_BUNDLE), await readFile(traceBundle.bundleTemp)],
    ]);
    const preReviewManifest = await createChecksumManifest(PRE_REVIEW_ALLOWED_PATHS, generated);
    const manifestTemp = join(WORK_ROOT, basename(PRE_REVIEW_CHECKSUMS));
    await writeFile(manifestTemp, preReviewManifest, { flag: "wx" });
    await copyFile(gzipTemp, PREPARED_GZIP, fsConstants.COPYFILE_EXCL);
    await copyFile(traceBundle.bundleTemp, TRACE_BUNDLE, fsConstants.COPYFILE_EXCL);
    await copyFile(casesTemp, CASES_MANIFEST, fsConstants.COPYFILE_EXCL);
    await copyFile(summaryTemp, SUMMARY, fsConstants.COPYFILE_EXCL);
    await copyFile(manifestTemp, PRE_REVIEW_CHECKSUMS, fsConstants.COPYFILE_EXCL);
    if (await exists(RESULT)) fail("ranking result exists after preparation");
    process.stdout.write(
      preparationReceipt({
        gzipSha256,
        inputSha256,
        traceSha256: traceBundle.summary.gzipSha256,
      }),
    );
  } finally {
    await rm(WORK_ROOT, { recursive: true, force: true });
  }
}
