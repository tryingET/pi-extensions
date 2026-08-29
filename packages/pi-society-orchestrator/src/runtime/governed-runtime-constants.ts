// summary: governed runtime materialization module (split from governed-runtime-materialization.ts).
// read_when:
//   - changing governed runtime constants verification.

import { edge } from "./governed-runtime-cleanliness.ts";

export const GOVERNED_RUNTIME_MATERIALIZATION_SCHEMA =
  "pi.governed-loop-runtime-materialization.v6" as const;

export const GOVERNED_RUNTIME_MANIFEST_RELATIVE_PATH =
  "packages/pi-society-orchestrator/node_modules/.tryinget-governed-runtime.json";

export const GOVERNED_RUNTIME_QUARANTINE_RELATIVE_PATH =
  "node_modules/.tryinget-governed-runtime-quarantine.json";

export const GOVERNED_RUNTIME_PACKAGE_GENERATION_PREFIX = ".tryinget-governed-package-generation-";

export const GOVERNED_RUNTIME_PEER_LAYER_RELATIVE_PATH =
  "packages/pi-society-orchestrator/node_modules/.tryinget-governed-peer-layer";

export const GOVERNED_RUNTIME_TYPEBOX_VERSION = "1.3.7";

export const GOVERNED_RUNTIME_TYPEBOX_INTEGRITY =
  "sha512-meKuifc33Pccx0O6PdIzYMq3Og8zvP4TIi/a+Bw3AEMZMxOD0+RHGQvpglEe6Zdy3wZ8nqn/j95h8LUZLk/6Hg==";

export const GOVERNED_RUNTIME_HOST_VERSION = "0.84.3";

export const GOVERNED_RUNTIME_NPM_MIN_RELEASE_AGE_DAYS = 7;
// npm matches registry package names, not Git repository ownership. The owned public scope is the
// narrow exemption; dependencies of matching packages remain age-gated unless they also match.

export const GOVERNED_RUNTIME_NPM_RELEASE_AGE_EXCLUSIONS = ["@tryinget/*"] as const;

export const GOVERNED_RUNTIME_NPM_REGISTRY = "https://registry.npmjs.org/";

export const GOVERNED_RUNTIME_ASC_REGISTRY_OWNER = {
  consumer: "packages/pi-society-orchestrator",
  name: "@tryinget/pi-autonomous-session-control",
  version: "0.5.2",
  selector: "^0.5.0",
  url: "https://registry.npmjs.org/@tryinget/pi-autonomous-session-control/-/pi-autonomous-session-control-0.5.2.tgz",
  integrity:
    "sha512-y+RvaTMca0VoMDI66TwLx5RzdTQGvov4a7MbrGKFXWNaXa86Ml9n3O/b812s+5pFIJOibWF7WAbM4n5uPaV7Nw==",
  specifiers: [
    "@tryinget/pi-autonomous-session-control/execution",
    "@tryinget/pi-autonomous-session-control",
  ],
} as const;

export const GOVERNED_RUNTIME_ASC_COMPILER = {
  name: "@typescript/native-preview",
  version: "7.0.0-dev.20260417.1",
  url: "https://registry.npmjs.org/@typescript/native-preview/-/native-preview-7.0.0-dev.20260417.1.tgz",
  integrity:
    "sha512-uIsfMRxtjgMF83TbAcpvHe0rgWVhqDSwCU1EYQT17qQbnOR56NIULneywLjeGKFgOCpn3eszd01/EjzS0n/LkA==",
} as const;

export const GOVERNED_RUNTIME_HOST_PEERS = {
  "@earendil-works/pi-ai": {
    integrity:
      "sha512-M0YUV8vNO3y2WwWSyY8ijKJV5W4gkSUixuvk+Z00ZBjsyMfsdXfITsHEwP1UIf09YRWXT6oGn0GlCamt+P32XQ==",
    consumers: [
      "packages/pi-little-helpers",
      "packages/pi-toolbox-discovery",
      "packages/pi-society-orchestrator",
      "packages/pi-vault-client",
      "packages/pi-autonomous-session-control",
      "packages/pi-peer-messaging",
      "packages/pi-autoresearch",
      "packages/pi-interaction/pi-interaction",
      "packages/pi-ontology-workflows",
      "packages/pi-prompt-template-accelerator",
    ],
  },
  "@earendil-works/pi-agent-core": {
    integrity:
      "sha512-VURr+xBRl3RxYcw3kT9Pn3yfi6LbRoCJgHF7h1mAblMjtLNV/MfG/RyF0uJizBAM886AEakSiw3j9c/aSngppg==",
    consumers: [],
  },
  "@earendil-works/pi-coding-agent": {
    integrity:
      "sha512-Yr2p9PubrbFZmYEPYI+C8KmZP9xlFuLDnAG64RtU0ZDgrdiXYWa+y7WGyJO5OlqPliOkVCMd9IzVszO3/t0D0w==",
    consumers: [
      "packages/pi-little-helpers",
      "packages/pi-toolbox-discovery",
      "packages/pi-society-orchestrator",
      "packages/pi-vault-client",
      "packages/pi-autonomous-session-control",
      "packages/pi-peer-messaging",
      "packages/pi-autoresearch",
      "packages/pi-interaction/pi-interaction",
      "packages/pi-interaction/pi-editor-registry",
      "packages/pi-ontology-workflows",
      "packages/pi-prompt-template-accelerator",
    ],
  },
  "@earendil-works/pi-tui": {
    integrity:
      "sha512-fS6OEQKEEALnKa6Uw8LcgZZ+9CWck7f3MQSCETQp6leUgIFwMEDtKmOUnL9nsYm+RIPmy7OmplVxYRbV6hiaFg==",
    consumers: [
      "packages/pi-little-helpers",
      "packages/pi-society-orchestrator",
      "packages/pi-vault-client",
      "packages/pi-autonomous-session-control",
      "packages/pi-interaction/pi-interaction",
      "packages/pi-interaction/pi-editor-registry",
      "packages/pi-interaction/pi-interaction-kit",
    ],
  },
} as const;

export const GOVERNED_RUNTIME_CODING_AGENT_SHRINKWRAP_PACKAGES = [
  "@earendil-works/pi-agent-core",
  "@earendil-works/pi-ai",
  "@earendil-works/pi-client",
  "@earendil-works/pi-protocol",
  "@earendil-works/pi-telemetry",
  "@earendil-works/pi-tui",
] as const;

export const GOVERNED_RUNTIME_HOST_CACHE_TARBALLS = {
  "@earendil-works/pi-ai": {
    version: GOVERNED_RUNTIME_HOST_VERSION,
    url: "https://registry.npmjs.org/@earendil-works/pi-ai/-/pi-ai-0.84.3.tgz",
    integrity:
      "sha512-M0YUV8vNO3y2WwWSyY8ijKJV5W4gkSUixuvk+Z00ZBjsyMfsdXfITsHEwP1UIf09YRWXT6oGn0GlCamt+P32XQ==",
  },
  "@earendil-works/pi-agent-core": {
    version: GOVERNED_RUNTIME_HOST_VERSION,
    url: "https://registry.npmjs.org/@earendil-works/pi-agent-core/-/pi-agent-core-0.84.3.tgz",
    integrity:
      "sha512-VURr+xBRl3RxYcw3kT9Pn3yfi6LbRoCJgHF7h1mAblMjtLNV/MfG/RyF0uJizBAM886AEakSiw3j9c/aSngppg==",
  },
  "@earendil-works/pi-coding-agent": {
    version: GOVERNED_RUNTIME_HOST_VERSION,
    url: "https://registry.npmjs.org/@earendil-works/pi-coding-agent/-/pi-coding-agent-0.84.3.tgz",
    integrity:
      "sha512-Yr2p9PubrbFZmYEPYI+C8KmZP9xlFuLDnAG64RtU0ZDgrdiXYWa+y7WGyJO5OlqPliOkVCMd9IzVszO3/t0D0w==",
  },
  "@earendil-works/pi-tui": {
    version: GOVERNED_RUNTIME_HOST_VERSION,
    url: "https://registry.npmjs.org/@earendil-works/pi-tui/-/pi-tui-0.84.3.tgz",
    integrity:
      "sha512-fS6OEQKEEALnKa6Uw8LcgZZ+9CWck7f3MQSCETQp6leUgIFwMEDtKmOUnL9nsYm+RIPmy7OmplVxYRbV6hiaFg==",
  },
} as const;

export function governedRuntimeCacheTarballName(packageName: string, version: string): string {
  return `${packageName.replace(/^@/u, "").replaceAll("/", "-")}-${version}.tgz`;
}

export const GOVERNED_RUNTIME_ASC_RUNTIME_FILES = [
  "execution.js",
  "execution.d.ts",
  "extensions/self/subagent-pi-json-filter.js",
  "extensions/self/subagent-pi-json-filter-v2.js",
  "extensions/self/subagent-protocol-v2.js",
] as const;

export const GOVERNED_RUNTIME_ASC_BUILD_RECEIPT_RELATIVE_PATHS = [
  "packages/pi-society-orchestrator/node_modules/.tryinget-governed-asc-build-receipts/pass-1.json",
  "packages/pi-society-orchestrator/node_modules/.tryinget-governed-asc-build-receipts/pass-2.json",
] as const;

export const GOVERNED_RUNTIME_PACKAGES = [
  "packages/pi-little-helpers",
  "packages/pi-toolbox-discovery",
  "packages/pi-society-orchestrator",
  "packages/pi-vault-client",
  "packages/pi-autonomous-session-control",
  "packages/pi-peer-messaging",
  "packages/pi-autoresearch",
  "packages/pi-interaction/pi-interaction",
  "packages/pi-interaction/pi-editor-registry",
  "packages/pi-interaction/pi-interaction-kit",
  "packages/pi-interaction/pi-runtime-registry",
  "packages/pi-interaction/pi-trigger-adapter",
  "packages/pi-ontology-workflows",
  "packages/pi-prompt-template-accelerator",
] as const;

export const GOVERNED_RUNTIME_TYPEBOX_CONSUMERS = [
  "packages/pi-little-helpers",
  "packages/pi-society-orchestrator",
  "packages/pi-vault-client",
  "packages/pi-autonomous-session-control",
  "packages/pi-autoresearch",
  "packages/pi-interaction/pi-interaction",
  "packages/pi-interaction/pi-editor-registry",
  "packages/pi-interaction/pi-trigger-adapter",
  "packages/pi-ontology-workflows",
  "packages/pi-prompt-template-accelerator",
] as const;

export const GOVERNED_RUNTIME_LOCAL_EDGES = [
  edge(
    "packages/pi-society-orchestrator",
    "@tryinget/pi-vault-client/dispatch-runtime",
    "@tryinget/pi-vault-client",
    "packages/pi-vault-client",
  ),
  edge(
    "packages/pi-society-orchestrator",
    "@tryinget/pi-vault-client/prompt-plane",
    "@tryinget/pi-vault-client",
    "packages/pi-vault-client",
  ),
  edge(
    "packages/pi-society-orchestrator",
    "@tryinget/pi-vault-client/dispatch-guard",
    "@tryinget/pi-vault-client",
    "packages/pi-vault-client",
  ),
  edge(
    "packages/pi-society-orchestrator",
    "@tryinget/pi-autoresearch/src/runtime.ts",
    "@tryinget/pi-autoresearch",
    "packages/pi-autoresearch",
  ),
  edge(
    "packages/pi-autoresearch",
    "@tryinget/pi-vault-client/dispatch-runtime",
    "@tryinget/pi-vault-client",
    "packages/pi-vault-client",
  ),
  edge(
    "packages/pi-autoresearch",
    "@tryinget/pi-trigger-adapter",
    "@tryinget/pi-trigger-adapter",
    "packages/pi-interaction/pi-trigger-adapter",
  ),
  edge(
    "packages/pi-vault-client",
    "@tryinget/pi-interaction-kit",
    "@tryinget/pi-interaction-kit",
    "packages/pi-interaction/pi-interaction-kit",
  ),
  edge(
    "packages/pi-vault-client",
    "@tryinget/pi-runtime-registry",
    "@tryinget/pi-runtime-registry",
    "packages/pi-interaction/pi-runtime-registry",
  ),
  edge(
    "packages/pi-vault-client",
    "@tryinget/pi-trigger-adapter",
    "@tryinget/pi-trigger-adapter",
    "packages/pi-interaction/pi-trigger-adapter",
  ),
  edge(
    "packages/pi-interaction/pi-trigger-adapter",
    "@tryinget/pi-interaction-kit",
    "@tryinget/pi-interaction-kit",
    "packages/pi-interaction/pi-interaction-kit",
  ),
  edge(
    "packages/pi-interaction/pi-interaction",
    "@tryinget/pi-editor-registry",
    "@tryinget/pi-editor-registry",
    "packages/pi-interaction/pi-editor-registry",
  ),
  edge(
    "packages/pi-interaction/pi-interaction",
    "@tryinget/pi-interaction-kit",
    "@tryinget/pi-interaction-kit",
    "packages/pi-interaction/pi-interaction-kit",
  ),
  edge(
    "packages/pi-interaction/pi-interaction",
    "@tryinget/pi-trigger-adapter",
    "@tryinget/pi-trigger-adapter",
    "packages/pi-interaction/pi-trigger-adapter",
  ),
  edge(
    "packages/pi-interaction/pi-editor-registry",
    "@tryinget/pi-trigger-adapter",
    "@tryinget/pi-trigger-adapter",
    "packages/pi-interaction/pi-trigger-adapter",
  ),
  edge(
    "packages/pi-ontology-workflows",
    "@tryinget/pi-editor-registry",
    "@tryinget/pi-editor-registry",
    "packages/pi-interaction/pi-editor-registry",
  ),
  edge(
    "packages/pi-ontology-workflows",
    "@tryinget/pi-trigger-adapter",
    "@tryinget/pi-trigger-adapter",
    "packages/pi-interaction/pi-trigger-adapter",
  ),
  edge(
    "packages/pi-prompt-template-accelerator",
    "@tryinget/pi-runtime-registry",
    "@tryinget/pi-runtime-registry",
    "packages/pi-interaction/pi-runtime-registry",
  ),
  edge(
    "packages/pi-prompt-template-accelerator",
    "@tryinget/pi-trigger-adapter",
    "@tryinget/pi-trigger-adapter",
    "packages/pi-interaction/pi-trigger-adapter",
  ),
  edge(
    "packages/pi-little-helpers",
    "@tryinget/pi-peer-messaging",
    "@tryinget/pi-peer-messaging",
    "packages/pi-peer-messaging",
  ),
] as const;

export const GOVERNED_RUNTIME_REGISTRY_EDGES = GOVERNED_RUNTIME_ASC_REGISTRY_OWNER.specifiers.map(
  (specifier) => ({
    consumer: GOVERNED_RUNTIME_ASC_REGISTRY_OWNER.consumer,
    specifier,
    expectedOwnerName: GOVERNED_RUNTIME_ASC_REGISTRY_OWNER.name,
    expectedOwnerVersion: GOVERNED_RUNTIME_ASC_REGISTRY_OWNER.version,
    expectedSelector: GOVERNED_RUNTIME_ASC_REGISTRY_OWNER.selector,
    expectedUrl: GOVERNED_RUNTIME_ASC_REGISTRY_OWNER.url,
    expectedIntegrity: GOVERNED_RUNTIME_ASC_REGISTRY_OWNER.integrity,
  }),
);
