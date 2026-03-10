---
summary: "Target architecture for the pi-interaction package family as shared runtime libraries, plus the current bridge while external consumers are not yet de-internalized onto published versions."
read_when:
  - "Deciding between module seams, package seams, and service/API boundaries for interaction runtime work."
  - "Planning how external packages like pi-vault-client should consume pi-interaction primitives."
system4d:
  container: "Architecture note for the interaction-runtime family."
  compass: "Keep interaction primitives local-runtime and package-scoped; do not pay service-boundary costs without true service needs."
  engine: "Pick the lightest viable boundary -> make the bridge explicit -> validate installability."
  fog: "The main failure mode is using a heavy API boundary to solve a packaging problem or silently hand-forking shared runtime code."
---

# Package-boundary architecture for pi-interaction

## Decision

Use **package boundaries**, not service/API boundaries, for the interaction-runtime family.

That means:

- `@tryinget/pi-interaction-kit`
- `@tryinget/pi-trigger-adapter`
- `@tryinget/pi-editor-registry`
- `@tryinget/pi-interaction`

should be treated as shared runtime/library packages inside the same Node.js + pi host process.

## Why not API boundaries?

These packages are:

- latency-sensitive
- same-process runtime helpers
- local UI / trigger / editor orchestration primitives
- not independently deployed services
- not natural cross-language or remote-consumption surfaces

So an HTTP/CLI/RPC boundary would add:

- extra startup and error modes
- more versioning complexity
- more operational overhead
- worse local development ergonomics

without buying meaningful isolation.

## Target end state

### Stable shared libraries

- `@tryinget/pi-interaction-kit`
  - fuzzy ranking / selection helpers
  - overlay UI helpers
  - telemetry helpers
- `@tryinget/pi-trigger-adapter`
  - trigger broker
  - picker registration adapter
  - depends on `@tryinget/pi-interaction-kit`
- `@tryinget/pi-editor-registry`
  - editor ownership / mount primitives
  - depends on trigger/runtime surfaces as needed
- `@tryinget/pi-interaction`
  - umbrella runtime / extension package
  - depends on the shared libraries above

### Consumer shape

Packages like `pi-vault-client` should eventually consume these as **real versioned dependencies**, not local source copies.

## Current bridge

Today, some dependent packages still need a release-safe bridge before all shared libraries are first-class published/runtime-consumable.

Current bridge rule:

- do **not** hand-fork shared logic casually
- if a consumer cannot yet depend on the published shared packages directly, use a **generated vendoring bridge**
- generated vendoring must:
  - pull from the canonical `packages/pi-interaction/` sources
  - be refreshable by script
  - be validated in release checks
  - be clearly documented as a bridge, not the final architecture

## Practical selection rule

Use the lightest boundary that matches the needed autonomy:

1. module seam — same package
2. package seam — same process, versioned npm dependency
3. plugin seam — dynamic runtime package/extension loading
4. API/service seam — only when independent deployment or isolation is truly needed

For the interaction-runtime family, the correct default is **package seam**.

## Implications for release work

- support libraries should become publish-ready as ordinary npm packages
- umbrella packages should consume them through package surfaces only
- dependent packages should not keep permanent manual source copies
- release checks must verify real installability, not only source-local success

## Bridge retirement condition

Retire generated vendoring when both are true:

1. the shared interaction packages are publishable/consumable with stable package contracts
2. dependent packages can pass clean-room install + runtime smoke using those package dependencies directly
