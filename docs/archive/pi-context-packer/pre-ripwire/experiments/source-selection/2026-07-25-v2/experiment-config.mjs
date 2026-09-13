import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const EXPERIMENT_DIR = dirname(fileURLToPath(import.meta.url));
export const PACKAGE_DIR = resolve(EXPERIMENT_DIR, "../../..");
export const CASES_RELATIVE_PATH = "canonical-case-source.generated.json";
export const CASES_PATH = join(EXPERIMENT_DIR, CASES_RELATIVE_PATH);
export const WORK_ROOT = "/tmp/pi-context-packer-source-selection-2026-07-25-v2-remediated";
export const PREPARED_GZIP = join(EXPERIMENT_DIR, "source-selection-ablation-input.json.gz");
export const CASES_MANIFEST = join(EXPERIMENT_DIR, "cases-pre-ranking.generated.json");
export const SUMMARY = join(EXPERIMENT_DIR, "preparation-summary.generated.json");
export const PRE_RANKING_REVIEW = join(EXPERIMENT_DIR, "pre-ranking-review.md");
export const README_PATH = join(EXPERIMENT_DIR, "README.md");
export const TRACE_BUNDLE = join(EXPERIMENT_DIR, "sci-file-access-traces.tar.gz");
export const PREREGISTRATION_RELATIVE_PATH =
  "../../../docs/project/2026-07-12-source-list-sci-ablation-preregistration.md";
export const PREREGISTRATION_PATH = resolve(EXPERIMENT_DIR, PREREGISTRATION_RELATIVE_PATH);
export const CHECKSUMS = join(EXPERIMENT_DIR, "SHA256SUMS");
export const RESULT = join(EXPERIMENT_DIR, "source-selection-ablation-results.generated.json");
export const RUNNER = join(PACKAGE_DIR, "scripts/run-source-selection-experiment.mjs");
export const SCRIPT = join(EXPERIMENT_DIR, "prepare-and-run.mjs");
export const SUPPORT_FILES = [
  "experiment-config.mjs",
  "experiment-cases.mjs",
  "experiment-process.mjs",
  "experiment-runtime.mjs",
  "preparation-artifacts.mjs",
  "producer-preparation.mjs",
  "experiment-preparation.mjs",
  "run-ranking.mjs",
  "review-record.mjs",
  "trace-evidence.mjs",
].map((name) => join(EXPERIMENT_DIR, name));

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
  "7badfe24d8d951c06fcf0bc34c573bf564c39e0aad3e1db52ccc1692543fe8fb";
export const EXPECTED_PREREGISTRATION_SHA256 =
  "80fb803aa93733efb4a78812764081402b871b0d56b48b5184cc8145511f4dfd";
export const EXPECTED_SCI_REVISION = "518d7cf473d5e9bd2c7c0b962d062adec300375d";
export const EXPECTED_SOURCE_LIST_SHA256 =
  "bf9234a9f797be23e808ed852a1806aae07078363e669b59d17ba7defd8f0c01";
export const EXPECTED_ARTIFACTS = Object.freeze({
  node: {
    version: "v26.1.0",
    sha256: "307ecf7726e330e53d68df6698c8a44f4799dfde9607104a3793448e896c9ce6",
  },
  git: {
    version: "git version 2.54.0",
    sha256: "bb6007e89e15dad35cf623a203db26dde9e042cb2df844320055cad3cd2eb5d0",
  },
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
  sciDistCli: { sha256: "f4d2c183659ee5eaf6c492f6ea686c13960ac3827ba1dbe2e226328cb45f4fb4" },
  sciPackage: { sha256: "8a705600b8d1cfffcb2f3ca0b0d2c00bbec85d9b3755758e4309650d37f78a7f" },
});

export const REPOSITORIES = Object.freeze([
  {
    id: "agent-scripts",
    source: "/home/tryinget/ai-society/core/agent-scripts",
    commit: "36792de9195c86e6e8ae521efb5c952492278088",
    rawArtifactSha256: "ffd945069a3f00939127257551cab509bf2cef0c446e492c6b16d097435493f1",
    stageSha256: "f472e58dca88da0c3efa083bc0efb44b236aaca2401317a70463da520a44b82c",
  },
  {
    id: "engineering-core",
    source: "/home/tryinget/ai-society/core/engineering-core",
    commit: "f084fcc4981339893c302e13c8266313233a0e2b",
    rawArtifactSha256: "077a20eaa453b3330d4428de9f27e3f92df3f71e99472dccb52d76a734ec28fb",
    stageSha256: "eedfbf6aa1830114c85e25745280dc30da9046da312a7ca0a9c57d7750fcb534",
  },
  {
    id: "dspx",
    source: "/home/tryinget/ai-society/softwareco/owned/dspx",
    commit: "cc21bc7e04ec15241b5fc86f0cc3863d0fd19a27",
    rawArtifactSha256: "65bf8d79f73a0d6d9e1a2fc85b857caf1955c570b437dcd6c97023898452693e",
    stageSha256: "ddfbd5a99c688ef6bd6aabcdda97e9ecf3b05b20268ba816af15b92762d949a2",
  },
  {
    id: "pi-extensions",
    source: "/home/tryinget/ai-society/softwareco/owned/pi-extensions",
    commit: "e67b1071dbdd2c8139da60432fb019d8dd991597",
    rawArtifactSha256: "18aad45c5da0867dfb1c4277651206201fe7eba962c9430dc984fb1689f56843",
    stageSha256: "06d660e6e13bedf684ac45e2083c1e0c22737ea97d153ac6aa82544a45fc344f",
  },
]);

export const EXPECTED_PROVENANCE = Object.freeze({
  producerName: "semantic-code-intelligence",
  producerVersion: "2.0.0",
  producerWorkflow: "structural-evidence-export-v1",
  backendName: "ast-grep",
  backendVersion: "0.42.0",
  executableName: "ast-grep",
  executableVersion: "0.42.0",
});

export const MAX_CAPTURE_BYTES = 16 * 1024 * 1024;

export const PRE_RUN_ALLOWED_PATHS = Object.freeze([
  "README.md",
  CASES_RELATIVE_PATH,
  "cases-pre-ranking.generated.json",
  "experiment-config.mjs",
  "experiment-preparation.mjs",
  "experiment-cases.mjs",
  "experiment-process.mjs",
  "experiment-runtime.mjs",
  "preparation-artifacts.mjs",
  "producer-preparation.mjs",
  "pre-ranking-review.md",
  "preparation-summary.generated.json",
  "prepare-and-run.mjs",
  "review-record.mjs",
  "run-ranking.mjs",
  "sci-file-access-traces.tar.gz",
  "source-selection-ablation-input.json.gz",
  "trace-evidence.mjs",
  PREREGISTRATION_RELATIVE_PATH,
]);
