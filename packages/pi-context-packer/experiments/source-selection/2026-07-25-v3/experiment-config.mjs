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

export const PATH_VALUE =
  "/home/tryinget/.bun/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin";
export const NODE_PATH = "/usr/bin/node";
export const GIT_PATH = "/usr/bin/git";
export const EXPECTED_CASES_SHA256 =
  "d2a19efd67058d54d250371860a2ec08af07eebc744a393dff00600b9f6cd6e5";
export const EXPECTED_SOURCE_LIST_SHA256 =
  "bf9234a9f797be23e808ed852a1806aae07078363e669b59d17ba7defd8f0c01";
export const EXPECTED_NODE_SHA256 =
  "307ecf7726e330e53d68df6698c8a44f4799dfde9607104a3793448e896c9ce6";
export const EXPECTED_GIT_SHA256 =
  "bb6007e89e15dad35cf623a203db26dde9e042cb2df844320055cad3cd2eb5d0";

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
