// summary: governed runtime materialization module (split from governed-runtime-materialization.ts).
// read_when:
//   - changing governed runtime constants verification.

import { GOVERNED_RUNTIME_ASC_REGISTRY_OWNER } from "./governed-runtime-asc-owner.generated.ts";
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

export const GOVERNED_RUNTIME_HOST_VERSION = "1.1.0";

// Every package the coding agent depends on from its own release line. Pi 1.x
// ships no shrinkwrap and declares these as ^ ranges, so the peer layer pins
// each one to the host version (dependency and override) and installs it with
// registry-verified SRI like any other closure package.
export const GOVERNED_RUNTIME_HOST_COMPANION_PACKAGES = [
  "@earendil-works/chord",
  "@earendil-works/pi-agent-core",
  "@earendil-works/pi-ai",
  "@earendil-works/pi-codemode",
  "@earendil-works/pi-mcp",
  "@earendil-works/pi-telemetry",
  "@earendil-works/pi-tui",
] as const;

export const GOVERNED_RUNTIME_NPM_MIN_RELEASE_AGE_DAYS = 7;
// npm matches registry package names, not Git repository ownership. Exempt:
// the owned public scope, plus the governed Pi host line - the coding agent
// and its companions, all pinned to exact versions with registry-verified SRI
// integrity (GOVERNED_RUNTIME_HOST_CACHE_TARBALLS and
// GOVERNED_RUNTIME_HOST_COMPANION_PACKAGES), so the pin itself is the vetting
// and the age gate adds no protection while blocking deliberate promotions of
// young host lines (operator-authorized 2026-08-29, AK-5125).
// Dependencies outside that closure remain age-gated unless they also match.

export const GOVERNED_RUNTIME_NPM_RELEASE_AGE_EXCLUSIONS = [
  "@tryinget/*",
  "@earendil-works/pi-coding-agent",
  ...GOVERNED_RUNTIME_HOST_COMPANION_PACKAGES,
] as const;

export const GOVERNED_RUNTIME_NPM_REGISTRY = "https://registry.npmjs.org/";

// Lock identity (version/url/integrity) plus package.json selector. A lock bump
// is the pin bump: regenerate with scripts/generate-asc-registry-owner.mjs.
export { GOVERNED_RUNTIME_ASC_REGISTRY_OWNER };

export const GOVERNED_RUNTIME_ASC_COMPILER = {
  name: "typescript",
  version: "7.0.2",
  url: "https://registry.npmjs.org/typescript/-/typescript-7.0.2.tgz",
  integrity:
    "sha512-8FYau96o3NKOhbjKi/qNvG/W5jhzxkbdm5sj9AbZ/5T5sWqn3hJgLfGx27sRKZWTvyzCP8dLRBTf5tBTSRVUNA==",
} as const;

export const GOVERNED_RUNTIME_HOST_PEERS = {
  "@earendil-works/pi-ai": {
    integrity:
      "sha512-1T7LAkc/5Bvc0v6w4vAGVdCrli0o/E0pEmYKTnixu95vSFArBjvbhS/G4ZwI0RUePgf0Imcu0VyqlM4EcXxqfw==",
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
      "sha512-aX1KZomNCPmwYnXa3OivF3VYLJ+WPUkIJlEIZTgwdOZdY/+oToWTQ334WYpQeOz9POpiYFNMJLPwIhXQ4e48kg==",
    consumers: [],
  },
  "@earendil-works/pi-coding-agent": {
    integrity:
      "sha512-SeEi/4hdcHNgA9UWlefZl7ZZpm3dzi2OoxNjDHsBJ9o298LNOtbL4DGKgitlEj6uCTccvtw6f2hlCkTPVJ2RXg==",
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
      "sha512-v7wkS0y2ErZvZkSfemqd9RrBZJ5x6p8Ujsv7NdJj01IXJyFM0kNL6rMdcKcvTe7EVTd6ugvDB9VPZSoaBF9QxQ==",
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

export const GOVERNED_RUNTIME_HOST_CACHE_TARBALLS = {
  "@earendil-works/pi-ai": {
    version: GOVERNED_RUNTIME_HOST_VERSION,
    url: "https://registry.npmjs.org/@earendil-works/pi-ai/-/pi-ai-1.1.0.tgz",
    integrity:
      "sha512-1T7LAkc/5Bvc0v6w4vAGVdCrli0o/E0pEmYKTnixu95vSFArBjvbhS/G4ZwI0RUePgf0Imcu0VyqlM4EcXxqfw==",
  },
  "@earendil-works/pi-agent-core": {
    version: GOVERNED_RUNTIME_HOST_VERSION,
    url: "https://registry.npmjs.org/@earendil-works/pi-agent-core/-/pi-agent-core-1.1.0.tgz",
    integrity:
      "sha512-aX1KZomNCPmwYnXa3OivF3VYLJ+WPUkIJlEIZTgwdOZdY/+oToWTQ334WYpQeOz9POpiYFNMJLPwIhXQ4e48kg==",
  },
  "@earendil-works/pi-coding-agent": {
    version: GOVERNED_RUNTIME_HOST_VERSION,
    url: "https://registry.npmjs.org/@earendil-works/pi-coding-agent/-/pi-coding-agent-1.1.0.tgz",
    integrity:
      "sha512-SeEi/4hdcHNgA9UWlefZl7ZZpm3dzi2OoxNjDHsBJ9o298LNOtbL4DGKgitlEj6uCTccvtw6f2hlCkTPVJ2RXg==",
  },
  "@earendil-works/pi-tui": {
    version: GOVERNED_RUNTIME_HOST_VERSION,
    url: "https://registry.npmjs.org/@earendil-works/pi-tui/-/pi-tui-1.1.0.tgz",
    integrity:
      "sha512-v7wkS0y2ErZvZkSfemqd9RrBZJ5x6p8Ujsv7NdJj01IXJyFM0kNL6rMdcKcvTe7EVTd6ugvDB9VPZSoaBF9QxQ==",
  },
  "@earendil-works/pi-telemetry": {
    version: GOVERNED_RUNTIME_HOST_VERSION,
    url: "https://registry.npmjs.org/@earendil-works/pi-telemetry/-/pi-telemetry-1.1.0.tgz",
    integrity:
      "sha512-8gAK05/2pPozZZz6hCLOi8x2vsqzvsmO9gG92kbvuvTPm0qMHaFlaXX98ndXsrOi5pmzha7vNLguuG4+0Rgxjw==",
  },
  "@earendil-works/chord": {
    version: GOVERNED_RUNTIME_HOST_VERSION,
    url: "https://registry.npmjs.org/@earendil-works/chord/-/chord-1.1.0.tgz",
    integrity:
      "sha512-gsHzKfyQ3t0ZIQ3cLBjJ5Vqy1TYnFyruHIV3g3BwmulCDYe5BW4yT9vaJk9QzN6YANILIO75uzuq+Gdxtzz1og==",
  },
  "@earendil-works/pi-mcp": {
    version: GOVERNED_RUNTIME_HOST_VERSION,
    url: "https://registry.npmjs.org/@earendil-works/pi-mcp/-/pi-mcp-1.1.0.tgz",
    integrity:
      "sha512-xGKwvu3SvVTeoIx8Z7UGoJprB4VK20wKORMhufcWGx61fIauhu3J+UqfB5eeoF1oE/geYBA598K6nh1SdABQkg==",
  },
  "@earendil-works/pi-codemode": {
    version: GOVERNED_RUNTIME_HOST_VERSION,
    url: "https://registry.npmjs.org/@earendil-works/pi-codemode/-/pi-codemode-1.1.0.tgz",
    integrity:
      "sha512-8Asc2AzhoNaXS1snmRFa96OhcWIlFM5k1Kuiz6p2DvIYgi5QHQccRAmDVY9oO92TzWrizpvQpconZGQ7JhlI7Q==",
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
