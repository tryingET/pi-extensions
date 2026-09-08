import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const EXPERIMENT_DIR = dirname(fileURLToPath(import.meta.url));
export const PACKAGE_DIR = resolve(EXPERIMENT_DIR, "../../..");
export const CASES_RELATIVE_PATH = "canonical-case-source.generated.json";
export const CASES_PATH = join(EXPERIMENT_DIR, CASES_RELATIVE_PATH);
export const WORK_ROOT =
  "/home/tryinget/.local/state/pi-quests/tmp/pi-context-packer-source-selection-2026-07-25-v3";
export const OBSERVATIONS = join(EXPERIMENT_DIR, "source-list-cost-observations.generated.json");
export const RESULT = join(EXPERIMENT_DIR, "source-selection-refinement-results.generated.json");
export const PREREGISTRATION_RELATIVE_PATH =
  "../../../docs/project/2026-07-25-source-selection-refinement-preregistration.md";
export const PREREGISTRATION_PATH = resolve(EXPERIMENT_DIR, PREREGISTRATION_RELATIVE_PATH);
export const PREPARED_GZIP = join(EXPERIMENT_DIR, "source-selection-refinement-input.json.gz");
export const TRACE_BUNDLE = join(EXPERIMENT_DIR, "sci-file-access-traces.tar.gz");
export const CASES_MANIFEST = join(EXPERIMENT_DIR, "cases-pre-ranking.generated.json");
export const SUMMARY = join(EXPERIMENT_DIR, "preparation-summary.generated.json");
export const PRE_REVIEW_CHECKSUMS = join(EXPERIMENT_DIR, "SHA256SUMS.pre-review");
export const CHECKSUMS = join(EXPERIMENT_DIR, "SHA256SUMS");
export const STALENESS_CANDIDATES = join(
  EXPERIMENT_DIR,
  "metadata-staleness-candidates.generated.json",
);
export const STALENESS_REVIEW = join(EXPERIMENT_DIR, "metadata-staleness-review.md");
export const PREPARATION_ATTEMPT_LOG = join(EXPERIMENT_DIR, "preparation-attempt-log.md");
export const PRE_RUN_REVIEW = join(EXPERIMENT_DIR, "pre-run-integrity-review.md");

export const PATH_VALUE =
  "/home/tryinget/.bun/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin";
export const NODE_PATH = "/usr/bin/node";
export const GIT_PATH = "/usr/bin/git";
export const GZIP_PATH = "/usr/bin/gzip";
export const BUN_PATH = "/home/tryinget/.bun/bin/bun";
export const SCI_PATH = "/home/tryinget/.bun/bin/semantic-code-intelligence";
export const SCI_OWNER_ROOT =
  "/home/tryinget/ai-society/softwareco/owned/semantic-code-intelligence";
export const SCI_DIST_CLI = join(SCI_OWNER_ROOT, "dist/cli/cli.js");
export const SCI_PACKAGE = join(SCI_OWNER_ROOT, "package.json");
export const BACKEND_PATH = "/usr/bin/ast-grep";
export const STRACE_PATH = "/usr/bin/strace";
export const TAR_PATH = "/usr/bin/tar";
export const EXPECTED_CASES_SHA256 =
  "d2a19efd67058d54d250371860a2ec08af07eebc744a393dff00600b9f6cd6e5";
export const EXPECTED_SOURCE_LIST_SHA256 =
  "bf9234a9f797be23e808ed852a1806aae07078363e669b59d17ba7defd8f0c01";
export const EXPECTED_NODE_SHA256 =
  "307ecf7726e330e53d68df6698c8a44f4799dfde9607104a3793448e896c9ce6";
export const EXPECTED_GIT_SHA256 =
  "bb6007e89e15dad35cf623a203db26dde9e042cb2df844320055cad3cd2eb5d0";
export const EXPECTED_PREREGISTRATION_SHA256 =
  "77d120a1b8785d879e9518ab72b4e5289e6de1510b9f9a2fd59c70a561cf01ac";
export const EXPECTED_OBSERVATIONS_SHA256 =
  "641d954542e562681a57dc3ba2675c9dfc0daba475473cd8220b56ab0755766a";
export const EXPECTED_STALENESS_CANDIDATES_SHA256 =
  "4076ec2c1dc1ab970b87e70fef82b8f74cfb3e7a942faa74cda3ca8556ea64c0";
export const EXPECTED_STALENESS_REVIEW_SHA256 =
  "80004ecee88712da9a1eca23ea54db48fb254906e0879c5e5ba1d13c359a1ecd";
export const EXPECTED_PREPARATION_ATTEMPT_LOG_SHA256 =
  "b214dad773447657f26f527be1bad7535ed622763ffd0e3b3d4cab3ad65b1a12";
export const EXPECTED_SCI_REVISION = "518d7cf473d5e9bd2c7c0b962d062adec300375d";
export const EXPECTED_PROVENANCE = Object.freeze({
  producerName: "semantic-code-intelligence",
  producerVersion: "2.0.0",
  producerWorkflow: "structural-evidence-export-v1",
  backendName: "ast-grep",
  backendVersion: "0.42.0",
  executableName: "ast-grep",
  executableVersion: "0.42.0",
});
export const EXPECTED_ARTIFACTS = Object.freeze({
  node: { version: "v26.1.0", sha256: EXPECTED_NODE_SHA256 },
  git: { version: "git version 2.54.0", sha256: EXPECTED_GIT_SHA256 },
  gzip: {
    version: "gzip 1.14-modified",
    sha256: "3e0aa8ddb52c009c608d2f1669c195925b0d9208b699f48b45132dc86fd209dd",
  },
  bun: {
    version: "1.3.12",
    sha256: "92a1cd8b6185f676010bb18e767dfc65c772273e79ae9984480843261939eeaa",
  },
  sci: {
    version: "2.0.0",
    sha256: "a93a54c7363151e9c87eced3381d97a39bf735d514e6bd272540dbac3d3c51ae",
  },
  backend: {
    version: "ast-grep 0.42.0",
    sha256: "5cdd704eab6a0e390d93f30b951ab0f5eafae81c7ebb119277f12be2c7995d58",
  },
  strace: {
    version: "strace -- version 7.0",
    sha256: "ca7daa61ec8d0c765ded1d80bdd81820d2d6433272a1bffb2b6111f244a47361",
  },
  tar: {
    version: "tar (GNU tar) 1.35",
    sha256: "bb23828bebad4f06500eab34890570ff692344ca1d507d2ae299b27f170e6979",
  },
  sciDistCli: {
    sha256: "f4d2c183659ee5eaf6c492f6ea686c13960ac3827ba1dbe2e226328cb45f4fb4",
  },
  sciPackage: {
    sha256: "8a705600b8d1cfffcb2f3ca0b0d2c00bbec85d9b3755758e4309650d37f78a7f",
  },
});

export const REPOSITORIES = Object.freeze([
  {
    id: "agent-scripts",
    source: "/home/tryinget/ai-society/core/agent-scripts",
    commit: "36792de9195c86e6e8ae521efb5c952492278088",
    expectedRole: "eligible",
  },
  {
    id: "engineering-core",
    source: "/home/tryinget/ai-society/core/engineering-core",
    commit: "f084fcc4981339893c302e13c8266313233a0e2b",
    expectedRole: "eligible",
  },
  {
    id: "dspx",
    source: "/home/tryinget/ai-society/softwareco/owned/dspx",
    commit: "326b2a555aac9f24ff54afcfd4adc87293b5218f",
    expectedRole: "eligible",
  },
  {
    id: "pi-extensions",
    source: "/home/tryinget/ai-society/softwareco/owned/pi-extensions",
    commit: "61ef4d2874e8ed3807667ae9edbc2e8c262575d5",
    expectedRole: "ineligible-control",
  },
  {
    id: "agent-kernel",
    source: "/home/tryinget/ai-society/softwareco/owned/agent-kernel",
    commit: "8b9264a4032a79ff2194b6413de62f9ca410385c",
    expectedRole: "ineligible-control",
  },
]);

export const PAIR_ORDERS = Object.freeze([
  ["probe", "full"],
  ["full", "probe"],
  ["probe", "full"],
  ["full", "probe"],
  ["probe", "full"],
]);
export const MAX_CAPTURE_BYTES = 32 * 1024 * 1024;

export const SUPPORT_FILES = Object.freeze(
  [
    "experiment-config.mjs",
    "experiment-process.mjs",
    "experiment-cases.mjs",
    "experiment-runtime.mjs",
    "producer-preparation.mjs",
    "trace-evidence.mjs",
    "preparation-artifacts.mjs",
    "v3-experiment.mjs",
    "experiment-preparation.mjs",
    "prepare-and-run.mjs",
    "run-ranking.mjs",
    "run-v3-ranking.mjs",
    "freeze-pre-run.mjs",
    "ranking-treatment.mjs",
  ].map((name) => join(EXPERIMENT_DIR, name)),
);

export const PRE_REVIEW_ALLOWED_PATHS = Object.freeze([
  "README.md",
  CASES_RELATIVE_PATH,
  "pre-ranking-review.md",
  "ranking-treatment.mjs",
  "ranking-treatment.test.mjs",
  "validate-cases.mjs",
  "experiment-config.mjs",
  "experiment-process.mjs",
  "experiment-cases.mjs",
  "experiment-runtime.mjs",
  "producer-preparation.mjs",
  "trace-evidence.mjs",
  "preparation-artifacts.mjs",
  "v3-experiment.mjs",
  "experiment-preparation.mjs",
  "prepare-and-run.mjs",
  "run-ranking.mjs",
  "run-v3-ranking.mjs",
  "freeze-pre-run.mjs",
  "source-list-observations.mjs",
  "recompute-observation-derivations.mjs",
  "project-staleness-candidates.mjs",
  "source-list-cost-observations.generated.json",
  "metadata-staleness-candidates.generated.json",
  "metadata-staleness-review.md",
  "preparation-attempt-log.md",
  "cases-pre-ranking.generated.json",
  "preparation-summary.generated.json",
  "sci-file-access-traces.tar.gz",
  "source-selection-refinement-input.json.gz",
  PREREGISTRATION_RELATIVE_PATH,
]);
export const PRE_RUN_ALLOWED_PATHS = Object.freeze([
  ...PRE_REVIEW_ALLOWED_PATHS,
  "SHA256SUMS.pre-review",
  "pre-run-integrity-review.md",
]);
