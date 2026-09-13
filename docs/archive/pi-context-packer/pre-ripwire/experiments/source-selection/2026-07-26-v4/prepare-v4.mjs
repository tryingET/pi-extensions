#!/usr/bin/env node
import { readFile, writeFile } from "node:fs/promises";
import { basename, resolve } from "node:path";
import { gunzipSync } from "node:zlib";

import {
  ATTEMPT_SENTINEL,
  CASES_PATH,
  CHECKSUMS,
  EXPECTED,
  EXPERIMENT_DIR,
  GZIP_PATH,
  PRE_REVIEW_ALLOWED_PATHS,
  PRE_REVIEW_CHECKSUMS,
  PRE_RUN_REVIEW,
  PREPARED_GZIP,
  PREREGISTRATION_PATH,
  PREREGISTRATION_RELATIVE_PATH,
  RESULT,
  SOURCE_CLOSURE,
  SUMMARY,
  TRACE_BUNDLE,
  V3_PREPARED_GZIP,
  V3_SUMMARY,
  V3_TRACE_BUNDLE,
} from "./experiment-config.mjs";
import { capture, exists, fail, rawDigest, sha256Hex, stableJson } from "./experiment-process.mjs";
import { createChecksumManifest } from "./preparation-artifacts.mjs";
import { V4_PROTOCOL, validateV4Experiment } from "./v4-experiment.mjs";

function assertHash(bytes, expected, label) {
  if (sha256Hex(bytes) !== expected) fail(`${label} SHA-256 mismatch`);
}

for (const path of [
  PREPARED_GZIP,
  TRACE_BUNDLE,
  SUMMARY,
  PRE_REVIEW_CHECKSUMS,
  CHECKSUMS,
  PRE_RUN_REVIEW,
  ATTEMPT_SENTINEL,
  RESULT,
]) {
  if (await exists(path)) fail(`refusing existing v4 path: ${path}`);
}
const [preregistrationBytes, reviewBytes, caseBytes, v3GzipBytes, v3TraceBytes, v3SummaryBytes] =
  await Promise.all([
    readFile(PREREGISTRATION_PATH),
    readFile(resolve(EXPERIMENT_DIR, "preregistration-review.md")),
    readFile(CASES_PATH),
    readFile(V3_PREPARED_GZIP),
    readFile(V3_TRACE_BUNDLE),
    readFile(V3_SUMMARY),
  ]);
assertHash(preregistrationBytes, EXPECTED.preregistration, "v4 preregistration");
assertHash(reviewBytes, EXPECTED.preregistrationReview, "v4 preregistration review");
assertHash(caseBytes, EXPECTED.cases, "v4 case source");
assertHash(v3GzipBytes, EXPECTED.v3PreparedGzip, "v3 prepared gzip");
assertHash(v3TraceBytes, EXPECTED.v3TraceBundle, "v3 trace bundle");
assertHash(v3SummaryBytes, EXPECTED.v3Summary, "v3 preparation summary");
const v3InputBytes = gunzipSync(v3GzipBytes);
assertHash(v3InputBytes, EXPECTED.v3PreparedInput, "v3 prepared input");
const v3 = JSON.parse(v3InputBytes.toString("utf8"));
if (
  v3.protocol !== "pi-context-packer-source-selection-refinement/v3" ||
  !Array.isArray(v3.repositories) ||
  v3.repositories.length !== 5 ||
  !Array.isArray(v3.cases) ||
  v3.cases.length !== 50 ||
  !v3.costStudy
) {
  fail("v3 prepared input does not contain the exact expected pre-ranking structure");
}
const v3Summary = JSON.parse(v3SummaryBytes.toString("utf8"));
if (
  v3Summary.ranking?.executed !== false ||
  v3Summary.ranking?.resultAbsent !== true ||
  v3Summary.structuralEvidence?.complete !== 50 ||
  v3Summary.structuralEvidence?.temporaryRootsRemoved !== 50 ||
  v3Summary.structuralEvidence?.fileAccessCorroboration?.prohibitedSciIndexOrStateAccessCount !== 0
) {
  fail("v3 reusable producer evidence is incomplete or not pre-ranking");
}
const authoredCases = JSON.parse(caseBytes.toString("utf8"));
const authored = new Map(
  Object.entries(authoredCases).flatMap(([repositoryId, rows]) =>
    rows.map((row) => [row.id, { ...row, repositoryId }]),
  ),
);
if (authored.size !== 50) fail("v4 authored case source must contain exactly 50 cases");
for (const prepared of v3.cases) {
  const source = authored.get(prepared.id);
  if (
    !source ||
    source.repositoryId !== prepared.repositoryId ||
    source.question !== prepared.question ||
    source.maxItems !== prepared.maxItems ||
    JSON.stringify(source.truth) !== JSON.stringify(prepared.truth)
  ) {
    fail(`${prepared.id}: v3 prepared case differs from the accepted v4 case source`);
  }
}
const v4 = {
  protocol: V4_PROTOCOL,
  repositories: v3.repositories,
  cases: v3.cases,
  provenanceReuse: {
    v3PreparedInputSha256: `sha256:${EXPECTED.v3PreparedInput}`,
    v3TraceBundleSha256: `sha256:${EXPECTED.v3TraceBundle}`,
    caseSourceSha256: `sha256:${EXPECTED.cases}`,
    costStudyExcluded: true,
    v3RankingExecuted: false,
  },
};
const uncompressedJson = stableJson(v4);
if (
  uncompressedJson.includes('"costStudy"') ||
  uncompressedJson.includes('"pairs"') ||
  uncompressedJson.includes('"eligibleTax"') ||
  uncompressedJson.includes('"ineligibleReduction"')
) {
  fail("v4 prepared input contains excluded v3 cost evidence");
}
// Contract/receipt/denominator validation only. No ranking rows or selections are built.
validateV4Experiment(JSON.parse(uncompressedJson));
const gzipResult = await capture(GZIP_PATH, ["--no-name", "--best", "--stdout"], {
  input: Buffer.from(uncompressedJson, "utf8"),
  maxBytes: 256 * 1024 * 1024,
});
if (gzipResult.code !== 0 || gzipResult.signal !== null || gzipResult.stderr.length !== 0) {
  fail("deterministic v4 gzip failed or wrote stderr");
}
const inputSha256 = sha256Hex(Buffer.from(uncompressedJson, "utf8"));
const gzipSha256 = sha256Hex(gzipResult.stdout);
const implementationPaths = [
  "experiment-config.mjs",
  "experiment-process.mjs",
  "preparation-artifacts.mjs",
  "ranking-treatment.mjs",
  "v4-experiment.mjs",
  "prepare-v4.mjs",
  "execute-v4-ranking.mjs",
  "freeze-pre-run.mjs",
  ...SOURCE_CLOSURE,
];
const implementation = await Promise.all(
  implementationPaths.map(async (path) => ({
    path,
    sha256: rawDigest(await readFile(resolve(EXPERIMENT_DIR, path))),
  })),
);
const summary = stableJson({
  schema: "pi-context-packer.source_selection_quality_preparation.v4",
  protocol: V4_PROTOCOL,
  status: "prepared-awaiting-independent-pre-run-review",
  repositories: 5,
  cases: 50,
  eligibleRepositories: 3,
  preregistration: {
    relativePath: PREREGISTRATION_RELATIVE_PATH,
    sha256: `sha256:${EXPECTED.preregistration}`,
    reviewDispatch: "dispatch-1785040580010",
  },
  reuse: {
    v3PreparedGzipSha256: `sha256:${EXPECTED.v3PreparedGzip}`,
    v3PreparedInputSha256: `sha256:${EXPECTED.v3PreparedInput}`,
    v3TraceBundleSha256: `sha256:${EXPECTED.v3TraceBundle}`,
    v3SummarySha256: `sha256:${EXPECTED.v3Summary}`,
    caseSourceSha256: `sha256:${EXPECTED.cases}`,
    sourceListArtifactsReused: 5,
    sciReceiptsReused: 50,
    costStudyExcluded: true,
    producerReinvoked: false,
  },
  dependencyClosure: {
    experimentAndSourceFiles: implementation,
    sourceClosureCount: SOURCE_CLOSURE.length,
    completeTransitiveClosureRequired: true,
  },
  preparedInput: {
    path: basename(PREPARED_GZIP),
    gzipSha256: `sha256:${gzipSha256}`,
    uncompressedSha256: `sha256:${inputSha256}`,
    uncompressedBytes: Buffer.byteLength(uncompressedJson),
  },
  traceBundle: {
    path: basename(TRACE_BUNDLE),
    sha256: `sha256:${EXPECTED.v3TraceBundle}`,
    traces: 50,
    prohibitedSciIndexOrStateAccessCount: 0,
  },
  validation: {
    contractValidatorCalled: true,
    rankingRowsBuilt: false,
    rankingsRetained: false,
    rankingsPrinted: false,
    rankingsInspected: false,
  },
  oneShot: {
    fixedRunner: "execute-v4-ranking.mjs --execute-ranking",
    arbitraryInputOrOutputCli: false,
    durableExclusiveAttemptSentinelRequiredBeforeDecompression: true,
    sentinelPath: basename(ATTEMPT_SENTINEL),
  },
  ranking: {
    executed: false,
    attemptSentinelAbsent: true,
    resultAbsent: true,
    resultPath: basename(RESULT),
  },
  automaticInvocation: {
    status: "REJECTED_OUT_OF_SCOPE",
    productionWiringAuthorized: false,
  },
});
const generated = new Map([
  [basename(PREPARED_GZIP), gzipResult.stdout],
  [basename(TRACE_BUNDLE), v3TraceBytes],
  [basename(SUMMARY), Buffer.from(summary)],
]);
const manifest = await createChecksumManifest(PRE_REVIEW_ALLOWED_PATHS, generated);
await writeFile(PREPARED_GZIP, gzipResult.stdout, { flag: "wx", mode: 0o644 });
await writeFile(TRACE_BUNDLE, v3TraceBytes, { flag: "wx", mode: 0o644 });
await writeFile(SUMMARY, summary, { flag: "wx", mode: 0o644 });
await writeFile(PRE_REVIEW_CHECKSUMS, manifest, { flag: "wx", mode: 0o644 });
if ((await exists(ATTEMPT_SENTINEL)) || (await exists(RESULT))) {
  fail("attempt sentinel or result appeared during v4 preparation");
}
process.stdout.write(
  stableJson({
    status: "v4-prepared-awaiting-independent-review",
    repositories: 5,
    cases: 50,
    costStudyExcluded: true,
    preparedInputGzipSha256: `sha256:${gzipSha256}`,
    preparedInputUncompressedSha256: `sha256:${inputSha256}`,
    traceBundleSha256: `sha256:${EXPECTED.v3TraceBundle}`,
    manifestEntries: PRE_REVIEW_ALLOWED_PATHS.length,
    rankingExecuted: false,
    attemptSentinelAbsent: true,
    resultAbsent: true,
  }),
);
