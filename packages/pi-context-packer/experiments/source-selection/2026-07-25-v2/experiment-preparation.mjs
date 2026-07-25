import { constants as fsConstants } from "node:fs";
import { copyFile, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";
import {
  evaluateSourceSelectionExperiment,
  experimentInternals,
} from "../../../src/source-selection-experiment.js";
import { checkCasesInput } from "./experiment-cases.mjs";
import {
  CASES_MANIFEST,
  CASES_PATH,
  CASES_RELATIVE_PATH,
  CHECKSUMS,
  EXPECTED_CASES_SHA256,
  EXPECTED_PREREGISTRATION_SHA256,
  EXPECTED_PROVENANCE,
  EXPECTED_SOURCE_LIST_SHA256,
  GIT_PATH,
  GZIP_PATH,
  PRE_RANKING_REVIEW,
  PRE_RUN_ALLOWED_PATHS,
  PREPARED_GZIP,
  PREREGISTRATION_PATH,
  PREREGISTRATION_RELATIVE_PATH,
  REPOSITORIES,
  RESULT,
  SCI_OWNER_ROOT,
  SCI_PATH,
  SCRIPT,
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
  createPreRunChecksumManifest,
  createTraceBundle,
  writePreparationReceipt,
} from "./preparation-artifacts.mjs";
import {
  materializeRepositories,
  prepareSourceList,
  verifyHostArtifacts,
} from "./producer-preparation.mjs";
import { independentReviewSummary, reviewMarkdown, STALENESS_REVIEWS } from "./review-record.mjs";

async function prepare() {
  for (const path of [
    PREPARED_GZIP,
    TRACE_BUNDLE,
    CASES_MANIFEST,
    SUMMARY,
    PRE_RANKING_REVIEW,
    CHECKSUMS,
    RESULT,
    WORK_ROOT,
  ]) {
    if (await exists(path)) fail(`refusing existing path: ${path}`);
  }
  const casesBytes = await readFile(CASES_PATH);
  if (sha256Hex(casesBytes) !== EXPECTED_CASES_SHA256)
    fail(`${CASES_RELATIVE_PATH} SHA-256 mismatch`);
  const preregistrationBytes = await readFile(PREREGISTRATION_PATH);
  if (sha256Hex(preregistrationBytes) !== EXPECTED_PREREGISTRATION_SHA256) {
    fail(`${PREREGISTRATION_RELATIVE_PATH} SHA-256 mismatch`);
  }
  const casesInput = JSON.parse(casesBytes.toString("utf8"));
  const frozenCases = checkCasesInput(casesInput);
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
    const sourceListPath = join(repositories[0].root, "scripts/source-list.mjs");
    if ((await shaFile(sourceListPath)) !== EXPECTED_SOURCE_LIST_SHA256) {
      fail("pinned source-list executable SHA-256 mismatch");
    }
    const preparedRepositories = [];
    const repositorySummaries = [];
    const preparedCases = [];
    const caseManifest = [];
    const sciInvocationSummaries = [];
    const traceRecords = [];
    for (const repository of repositories) {
      const source = await prepareSourceList(repository, sourceListPath);
      preparedRepositories.push({
        id: repository.id,
        commit: repository.commit,
        sourceListArtifact: source.sourceListArtifact,
        sourceListPreparation: source.sourceListPreparation,
        metadataStalenessSample: source.metadataStalenessSample,
      });
      const repositoryCases = frozenCases.filter(
        ({ repositoryId }) => repositoryId === repository.id,
      );
      const perCaseState = [];
      for (const frozen of repositoryCases) {
        for (const truthPath of frozen.truth) {
          if (!source.payload.items.some((item) => item.path === truthPath)) {
            fail(`${frozen.id}: frozen truth is outside the owner artifact candidate universe`);
          }
        }
        const identity = experimentInternals.expectedQuestionIdentity(frozen, {
          commit: repository.commit,
          rawArtifactSha256: source.rawArtifactSha256,
        });
        const structuralEvidence = await runStructuralCase(frozen, repository, artifacts);
        const preparedCase = {
          id: frozen.id,
          repositoryId: repository.id,
          repositoryCommit: repository.commit,
          sourceListArtifactSha256: source.rawArtifactSha256,
          question: frozen.question,
          ...identity,
          maxItems: frozen.maxItems,
          truth: [...frozen.truth],
          structuralEvidence: {
            expectedRequest: structuralEvidence.expectedRequest,
            expectedRequestDigest: structuralEvidence.expectedRequestDigest,
            expectedProvenance: structuralEvidence.expectedProvenance,
            receipt: structuralEvidence.receipt,
            executionObservation: structuralEvidence.executionObservation,
          },
        };
        preparedCases.push(preparedCase);
        perCaseState.push({
          id: frozen.id,
          indexSha256Before: structuralEvidence.targetIndexSha256Before,
          indexSha256After: structuralEvidence.targetIndexSha256After,
          cleanBefore: structuralEvidence.executionObservation.targetState.cleanBefore,
          cleanAfter: structuralEvidence.executionObservation.targetState.cleanAfter,
          ontologyBefore: structuralEvidence.executionObservation.targetState.ontologyBefore,
          ontologyAfter: structuralEvidence.executionObservation.targetState.ontologyAfter,
          producerTempRootRemovedAndAbsent: structuralEvidence.runtimeRootRemovedAndAbsent,
        });
        sciInvocationSummaries.push({
          id: frozen.id,
          repositoryId: repository.id,
          monotonicDurationNanoseconds: structuralEvidence.monotonicDurationNanoseconds,
          producerInvocationCost: structuralEvidence.producerInvocationCost,
          retainedRawEvidenceCosts: structuralEvidence.rawByteAndTokenCosts,
          cleanup: {
            producerTempRootRemovedAndAbsent: structuralEvidence.runtimeRootRemovedAndAbsent,
          },
          trace: {
            rawSha256: structuralEvidence.trace.rawSha256,
            rawCost: {
              bytes: structuralEvidence.trace.corroboration.traceByteCount,
              approximateTokensCeilBytesDiv4:
                structuralEvidence.trace.corroboration.approximateTraceTokensCeilBytesDiv4,
            },
            corroboration: structuralEvidence.trace.corroboration,
          },
        });
        traceRecords.push({
          id: frozen.id,
          repositoryId: repository.id,
          repositoryCommit: repository.commit,
          subjectArgv: structuralEvidence.trace.subjectArgv,
          instrumentationArgv: structuralEvidence.trace.instrumentationArgv,
          rawTraceArchivePath: `raw/${frozen.id}.strace`,
          rawTraceSha256: structuralEvidence.trace.rawSha256,
          corroboration: structuralEvidence.trace.corroboration,
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
          expectedRequestDigest: structuralEvidence.expectedRequestDigest,
          expectedProvenance: structuralEvidence.expectedProvenance,
          receiptDigest: structuralEvidence.receipt.receiptDigest,
          executionObservationDigest: structuralEvidence.executionObservation.observationDigest,
          rawEvidence: {
            requestSha256: structuralEvidence.executionObservation.rawEvidence.requestSha256,
            receiptSha256: structuralEvidence.executionObservation.rawEvidence.receiptSha256,
            stdoutSha256: structuralEvidence.executionObservation.rawEvidence.stdoutSha256,
            stderrSha256: structuralEvidence.executionObservation.rawEvidence.stderrSha256,
            processSha256: structuralEvidence.executionObservation.rawEvidence.processSha256,
            stateSha256: structuralEvidence.executionObservation.rawEvidence.stateSha256,
            transcriptSha256: structuralEvidence.executionObservation.rawEvidence.transcriptSha256,
          },
          receiptAvailable: true,
          receiptComplete: true,
          evidenceCount: structuralEvidence.receipt.summary.returnedCount,
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
        sourceListRawArtifactSha256: source.rawArtifactSha256,
        sourceListPreparationObservationDigest: source.sourceListPreparation.observationDigest,
        trackedStageStdoutSha256: source.evidence.trackedStageStdoutSha256,
        candidateCount: source.evidence.candidateCount,
        metadataPresentCount: source.evidence.metadataPresentCount,
        metadataCoverage: source.evidence.metadataCoverage,
        sourceListEligible: source.evidence.metadataCoverage >= 0.6,
        metadataStalenessSampleCount: source.metadataStalenessSample.sampledPaths.length,
        stalePathsInitiallyEmpty: source.metadataStalenessSample.stalePaths.length === 0,
        stalenessReviewStatus: "accepted-independent-pre-ranking-review",
        stalenessReviewDispatchId: STALENESS_REVIEWS[repository.id],
        sourceCommandExitCount: 1,
        sourceProducerInvocation: {
          monotonicDurationNanoseconds: source.evidence.monotonicDurationNanoseconds,
          producerInvocationCost: source.evidence.producerInvocationCost,
        },
        sourceCommandStderrByteCount: source.evidence.sourceListStderrByteCount,
        stageCommandStderrByteCount: source.evidence.trackedStageStderrByteCount,
        targetState: {
          headBefore: repository.materializedState.head,
          headAfter: finalState.head,
          statusBefore: repository.materializedState.status,
          statusAfter: finalState.status,
          ontologyBefore: repository.materializedState.ontology,
          ontologyAfter: finalState.ontology,
          indexSha256Before: repository.materializedState.indexSha256,
          indexSha256After: finalState.indexSha256,
          cleanAndCommitStable: true,
          caseObservations: perCaseState,
        },
      });
    }
    if (preparedRepositories.length !== 4 || preparedCases.length !== 40) {
      fail("prepared cardinality differs from four repositories and 40 cases");
    }
    if (
      repositorySummaries.filter(({ metadataCoverage }) => metadataCoverage >= 0.6).length < 3 ||
      repositorySummaries.find(({ id }) => id === "pi-extensions")?.sourceListEligible !== false
    ) {
      fail("coverage acceptance gate failed");
    }
    if (
      caseManifest.some(
        ({ receiptAvailable, receiptComplete }) => !receiptAvailable || !receiptComplete,
      )
    ) {
      fail("one or more SCI receipts are incomplete or unavailable");
    }
    if (sciInvocationSummaries.some((item) => !item.cleanup.producerTempRootRemovedAndAbsent)) {
      fail("one or more per-case producer temp roots was not removed and checked absent");
    }
    const traceBundle = await createTraceBundle(traceRecords, artifacts);
    const prepared = {
      protocol: "pi-context-packer-source-selection-ablation/v2",
      repositories: preparedRepositories,
      cases: preparedCases,
    };
    const uncompressedPath = join(WORK_ROOT, "prepared-source-selection-ablation-v2.json");
    const uncompressedJson = stableJson(prepared);
    await writeFile(uncompressedPath, uncompressedJson, { flag: "wx", mode: 0o600 });
    const validationInput = JSON.parse(await readFile(uncompressedPath, "utf8"));
    // Validation-only call required by the preregistration. Deliberately discard the
    // returned rankings and metrics without retaining, printing, or inspecting them.
    void evaluateSourceSelectionExperiment(validationInput);
    const gzipTemp = join(WORK_ROOT, basename(PREPARED_GZIP));
    const gzipResult = await capture(GZIP_PATH, [
      "--no-name",
      "--best",
      "--stdout",
      uncompressedPath,
    ]);
    if (gzipResult.code !== 0 || gzipResult.signal !== null || gzipResult.stderr.length !== 0) {
      fail("deterministic gzip command failed or wrote stderr");
    }
    await writeFile(gzipTemp, gzipResult.stdout, { flag: "wx", mode: 0o644 });
    const uncompressedSha256 = sha256Hex(Buffer.from(uncompressedJson, "utf8"));
    const gzipSha256 = sha256Hex(gzipResult.stdout);
    const sourceStatesAfter = Object.fromEntries(
      await Promise.all(
        [...REPOSITORIES, { id: "semantic-code-intelligence", source: SCI_OWNER_ROOT }].map(
          async ({ id, source }) => [id, await sourceState(source)],
        ),
      ),
    );
    if (JSON.stringify(sourceStatesAfter) !== JSON.stringify(sourceStatesBefore)) {
      fail("a source or producer repository state changed during preparation");
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
      schema: "pi-context-packer.source_selection_cases_pre_ranking.v1",
      inputCaseFile: {
        path: CASES_RELATIVE_PATH,
        sha256: `sha256:${EXPECTED_CASES_SHA256}`,
        repositories: 4,
        cases: 40,
      },
      status: "pre-ranking",
      truthChangedAfterReview: false,
      questionsChangedAfterReview: false,
      cases: caseManifest,
    };
    const casesManifestJson = stableJson(casesManifestValue);
    const casesTemp = join(WORK_ROOT, basename(CASES_MANIFEST));
    await writeFile(casesTemp, casesManifestJson, { flag: "wx" });
    const reviewJson = reviewMarkdown();
    const reviewTemp = join(WORK_ROOT, basename(PRE_RANKING_REVIEW));
    await writeFile(reviewTemp, reviewJson, { flag: "wx" });
    const preparationImplementation = await Promise.all(
      [SCRIPT, ...SUPPORT_FILES].map(async (path) => ({
        path: basename(path),
        sha256: `sha256:${await shaFile(path)}`,
      })),
    );
    const summaryValue = {
      schema: "pi-context-packer.source_selection_preparation_summary.v1",
      protocol: prepared.protocol,
      status: "reviewed-pre-ranking",
      repositories: 4,
      cases: 40,
      caseFileSha256: `sha256:${EXPECTED_CASES_SHA256}`,
      canonicalCaseSource: {
        relativePath: CASES_RELATIVE_PATH,
        rawSha256: `sha256:${EXPECTED_CASES_SHA256}`,
        externalDependency: false,
      },
      preregistration: {
        relativePath: PREREGISTRATION_RELATIVE_PATH,
        rawSha256: `sha256:${EXPECTED_PREREGISTRATION_SHA256}`,
      },
      preRunChecksumManifest: {
        path: basename(CHECKSUMS),
        approvedEntryCount: PRE_RUN_ALLOWED_PATHS.length,
        includesExternalPreregistration: true,
        strictAllowlistVerificationRequiredBeforeSummaryOrGzip: true,
      },
      frozenRepositories: REPOSITORIES.map(({ id, commit }) => ({ id, commit })),
      independentPreRankingReview: independentReviewSummary(),
      reviewArtifact: basename(PRE_RANKING_REVIEW),
      preparationImplementation,
      sourceList: {
        exactArgvSuffix: ["--repo", ".", "--full-list", "--json"],
        revision: REPOSITORIES[0].commit,
        executableSha256: `sha256:${EXPECTED_SOURCE_LIST_SHA256}`,
        successfulExitCount: 4,
        repositories: repositorySummaries,
      },
      structuralEvidence: {
        command: `${SCI_PATH} experimental structural-evidence-receipt --request-file <external-request-file>`,
        expectedProvenance: EXPECTED_PROVENANCE,
        attempted: 40,
        exitZero: 40,
        receiptCount: 40,
        available: 40,
        complete: 40,
        emptyStderr: 40,
        processGroupsTerminated: 40,
        temporaryRootsRemoved: sciInvocationSummaries.filter(
          (item) => item.cleanup.producerTempRootRemovedAndAbsent,
        ).length,
        noTargetIndexMutation: true,
        noTargetOntologyState: true,
        invocations: sciInvocationSummaries,
        fileAccessCorroboration: {
          ...traceBundle.summary,
          subjectExporterTraces: 40,
          targetGitIndexAccessRecordCount: sciInvocationSummaries.reduce(
            (total, item) => total + item.trace.corroboration.targetGitIndexAccessRecordCount,
            0,
          ),
          gitIndexNonConflation:
            "Traced .git/index records are Git clean-state plumbing. The preparation harness's Git stage/index reads are outside the subject-exporter strace scope. Neither is classified as SCI semantic index access.",
          authenticationClaim: false,
        },
      },
      measurementMethod: {
        duration:
          "Actual elapsed monotonic nanoseconds from process.hrtime.bigint() around each producer subprocess.",
        rawBytes:
          "Exact Buffer or UTF-8 byte lengths of retained producer inputs/outputs/evidence.",
        approximateTokenCost:
          "ceil(raw bytes / 4); a disclosed approximation, not model tokenizer output.",
        tracingOverhead: "SCI durations include strace -f trace=%file instrumentation overhead.",
      },
      executableArtifacts: artifacts,
      sourceAndProducerState: {
        unchanged: true,
        before: sourceStatesBefore,
        after: sourceStatesAfter,
        sciOwnerRepositoryClean: sourceStatesBefore["semantic-code-intelligence"].clean,
        sciTrackedExecutableArtifactsClean: true,
        note: "The linked SCI owner worktree had pre-existing untracked state but its HEAD, full status digest, and pinned tracked executable artifacts were unchanged. All four detached target snapshots were clean.",
      },
      preparedInput: {
        gzipPath: basename(PREPARED_GZIP),
        gzipSha256: `sha256:${gzipSha256}`,
        uncompressedSha256: `sha256:${uncompressedSha256}`,
        deterministicGzipArgv: [GZIP_PATH, "--no-name", "--best", "--stdout", uncompressedPath],
        uncompressedRetained: false,
      },
      validation: {
        landedConsumerEvaluatorCalled: true,
        evaluatorReturnRetained: false,
        evaluatorReturnPrinted: false,
        evaluatorReturnInspected: false,
      },
      ranking: {
        executed: false,
        resultPath: basename(RESULT),
        resultAbsent: true,
        runModeRequiresExplicitExecuteRankingFlag: true,
      },
      limitations: {
        executable: [
          "Launcher, selected dist entrypoint, package, strace, backend, Node, Bun, Git, tar, and gzip hashes do not bind every transitive dynamic library or kernel component.",
          "Host-specific absolute executable paths and versions must remain available for byte-for-byte producer reproduction.",
        ],
        trust: [
          "Hashes and strace are integrity and bounded local file-access corroboration, not producer identity authentication or proof against a compromised executable, tracer, or kernel.",
          "The linked SCI owner worktree had pre-existing untracked state; pinned tracked executable artifacts and full before/after state digests were unchanged.",
        ],
        maintenance: [
          "Known SCI index/state path classifications must be maintained as SCI storage conventions evolve.",
          "Monotonic timings include tracing and host load and are not production latency estimates.",
          "ceil(bytes/4) is an approximate disclosure cost and not a model-specific tokenizer measurement.",
          "pi-extensions remains an honest source-list-ineligible control because metadata coverage is below 60%.",
        ],
      },
      limits: [
        "Independent pre-ranking review ACCEPTed all four 10-path samples with stalePaths=[].",
        "SCI and source-list hashes are integrity pins, not producer authentication.",
        "No strace observation is an authentication claim or proof of all possible hidden state channels.",
      ],
    };
    const summaryJson = stableJson(summaryValue);
    const summaryTemp = join(WORK_ROOT, basename(SUMMARY));
    await writeFile(summaryTemp, summaryJson, { flag: "wx" });
    const checksumGeneratedBytes = new Map([
      [basename(CASES_MANIFEST), Buffer.from(casesManifestJson)],
      [basename(SUMMARY), Buffer.from(summaryJson)],
      [basename(PRE_RANKING_REVIEW), Buffer.from(reviewJson)],
      [basename(PREPARED_GZIP), gzipResult.stdout],
      [basename(TRACE_BUNDLE), await readFile(traceBundle.bundleTemp)],
    ]);
    const checksumManifest = await createPreRunChecksumManifest(checksumGeneratedBytes);
    const checksumsTemp = join(WORK_ROOT, basename(CHECKSUMS));
    await writeFile(checksumsTemp, checksumManifest, { flag: "wx" });
    await copyFile(gzipTemp, PREPARED_GZIP, fsConstants.COPYFILE_EXCL);
    await copyFile(traceBundle.bundleTemp, TRACE_BUNDLE, fsConstants.COPYFILE_EXCL);
    await copyFile(casesTemp, CASES_MANIFEST, fsConstants.COPYFILE_EXCL);
    await copyFile(summaryTemp, SUMMARY, fsConstants.COPYFILE_EXCL);
    await copyFile(reviewTemp, PRE_RANKING_REVIEW, fsConstants.COPYFILE_EXCL);
    await copyFile(checksumsTemp, CHECKSUMS, fsConstants.COPYFILE_EXCL);
    if (await exists(RESULT)) fail("ranking output exists after preparation");
    writePreparationReceipt(gzipSha256, uncompressedSha256, traceBundle.summary.gzipSha256);
  } finally {
    await rm(WORK_ROOT, { recursive: true, force: true });
  }
}
export { prepare };
