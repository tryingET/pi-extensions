import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const EXPERIMENT_DIR = dirname(fileURLToPath(import.meta.url));
export const PACKAGE_DIR = resolve(EXPERIMENT_DIR, "../../..");
export const V3_DIR = resolve(EXPERIMENT_DIR, "../2026-07-25-v3");
export const CASES_PATH = join(EXPERIMENT_DIR, "canonical-case-source.generated.json");
export const V3_PREPARED_GZIP = join(V3_DIR, "source-selection-refinement-input.json.gz");
export const V3_TRACE_BUNDLE = join(V3_DIR, "sci-file-access-traces.tar.gz");
export const V3_SUMMARY = join(V3_DIR, "preparation-summary.generated.json");
export const PREPARED_GZIP = join(EXPERIMENT_DIR, "source-selection-quality-input.json.gz");
export const TRACE_BUNDLE = join(EXPERIMENT_DIR, "sci-file-access-traces.tar.gz");
export const SUMMARY = join(EXPERIMENT_DIR, "preparation-summary.generated.json");
export const PRE_REVIEW_CHECKSUMS = join(EXPERIMENT_DIR, "SHA256SUMS.pre-review");
export const CHECKSUMS = join(EXPERIMENT_DIR, "SHA256SUMS");
export const PRE_RUN_REVIEW = join(EXPERIMENT_DIR, "pre-run-integrity-review.md");
export const ATTEMPT_SENTINEL = join(EXPERIMENT_DIR, "ranking-attempt.json");
export const RESULT = join(EXPERIMENT_DIR, "source-selection-quality-results.generated.json");
export const PREREGISTRATION_RELATIVE_PATH =
  "../../../docs/project/2026-07-26-source-selection-positive-evidence-quality-preregistration.md";
export const PREREGISTRATION_PATH = resolve(EXPERIMENT_DIR, PREREGISTRATION_RELATIVE_PATH);
export const GZIP_PATH = "/usr/bin/gzip";
export const PATH_VALUE =
  "/home/tryinget/.bun/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin";
export const MAX_CAPTURE_BYTES = 32 * 1024 * 1024;

export const EXPECTED = Object.freeze({
  preregistration: "7810a4bc58a2f9daac54ea95626aa8898fd3a64131eb8cff634bab51de98efbc",
  preregistrationReview: "85ee7809d3cc3c11b8927b239b6ec46694455644cf66332f2f351a2cc23ccf02",
  cases: "d2a19efd67058d54d250371860a2ec08af07eebc744a393dff00600b9f6cd6e5",
  v3PreparedGzip: "29cb2b91f398e935baf3ab092d836b249859208723548d7746ae043e9fa9531b",
  v3PreparedInput: "cb5e2a8f4c6799c07ff2ff988ab03c58e4b7bbcb2c878dd6313a5ffaefa6a94f",
  v3TraceBundle: "48270861e414bb2f92fc9963e4dc87dad7c7d44919473708fd25740d363639a8",
  v3Summary: "86746a92f24599d70f3bb8270f5ca79a3a3b337466ac1dbe35cc1ec7cba53156",
});

export const SOURCE_CLOSURE = Object.freeze(
  [
    "source-selection-experiment-aggregate.js",
    "source-selection-experiment-observation.js",
    "source-selection-experiment-preparation.js",
    "source-selection-experiment-question.js",
    "source-selection-experiment-ranking.js",
    "source-selection-experiment-raw.js",
    "source-selection-experiment-receipt.js",
    "source-selection-experiment-repository.js",
    "source-selection-experiment-source-list.js",
    "source-selection-experiment-structural.js",
    "source-selection-experiment-utils.js",
    "source-selection-experiment.js",
  ].map((name) => `../../../src/${name}`),
);

export const PRE_REVIEW_ALLOWED_PATHS = Object.freeze([
  "README.md",
  "preregistration-review.md",
  "canonical-case-source.generated.json",
  "ranking-treatment.mjs",
  "ranking-treatment.test.mjs",
  "experiment-config.mjs",
  "experiment-process.mjs",
  "preparation-artifacts.mjs",
  "v4-experiment.mjs",
  "prepare-v4.mjs",
  "execute-v4-ranking.mjs",
  "freeze-pre-run.mjs",
  "preparation-summary.generated.json",
  "sci-file-access-traces.tar.gz",
  "source-selection-quality-input.json.gz",
  PREREGISTRATION_RELATIVE_PATH,
  ...SOURCE_CLOSURE,
]);

export const PRE_RUN_ALLOWED_PATHS = Object.freeze([
  ...PRE_REVIEW_ALLOWED_PATHS,
  "SHA256SUMS.pre-review",
  "pre-run-integrity-review.md",
]);
