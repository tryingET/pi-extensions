---
summary: "Root-owned canary lane for validating pi-extensions against upstream Pi host changes."
read_when:
  - "Triaging whether an upstream Pi changelog item requires extension changes."
  - "Before bumping @mariozechner/pi-coding-agent across monorepo packages."
  - "When adding a new extension scenario that should be guarded by the compatibility canary."
system4d:
  container: "Monorepo-level host compatibility contract and execution lane."
  compass: "Prefer additive upgrade evidence over speculative edits."
  engine: "Map upstream host surfaces -> bind to concrete canary scenarios -> run before rollout."
  fog: "Without a stable canary lane, changelog review turns into repeated manual guesswork."
---

# Pi host compatibility canary

## Intent

Add one root-owned place where this monorepo records:

1. which upstream Pi host surfaces matter most to our extensions,
2. which concrete scenarios exercise those surfaces, and
3. how to run those scenarios before and during host upgrades.

The canary lives here because this repo owns the extension compatibility contract.
The upstream update trigger lives in `softwareco/contrib` via `scripts/pi-mono-compatibility-relay.sh`, which dispatches this canary when relevant `pi-mono` surfaces move.
That relay also maintains a contrib-side evidence index (`scripts/pi-mono-compatibility-evidence-index.mjs`) so upstream deltas and downstream canary outcomes become queryable machine memory.

This is an **addition**, not a reset of package-local testing.
Package tests remain where they belong; the root canary binds them into one upgrade-oriented lane.

## Source of truth

- Manifest: `policy/pi-host-compatibility-canary.json`
- Runner: `scripts/pi-host-compatibility-canary.mjs`
- Dedicated CI workflow: `.github/workflows/compatibility-canary.yml`
- Root npm wrappers:
  - `npm run compat:canary:list`
  - `npm run compat:canary`
  - `npm run compat:canary:validate`

## Current profiles

Each profile resolves an **exact host contract** before any scenario runs:
- `@mariozechner/pi-coding-agent` version
- companion package versions (`@mariozechner/pi-ai`, `@mariozechner/pi-tui`)
- exact review anchor for the upstream changelog item / diff under review

The runner auto-aligns each scenario package to that host contract before executing the scenario command.
That removes split-brain validation where different package lockfiles silently test different Pi host versions.

### `current`
Run against the root-owned pinned host contract recorded in `policy/pi-host-compatibility-canary.json`.

### `upgrade`
Run against an explicit candidate Pi host release supplied via:
- `PI_HOST_COMPAT_HOST_VERSION`
- `PI_HOST_COMPAT_CHANGELOG_REF`

## Seed scenarios

### `interaction-runtime-coexistence`
Anchors the `pi-interaction` + PTX path.

Current command:

```bash
cd packages/pi-prompt-template-accelerator
npm run test:compat:interaction-runtime
```

Protected host surfaces:
- custom editor mount semantics
- shared trigger broker behavior
- input transform flow

### `vault-live-trigger-contract`
Anchors the `pi-vault-client` + shared interaction runtime seam.

Current command:

```bash
cd packages/pi-vault-client
npm run test:compat:live-trigger-contract
```

Protected host surfaces:
- shared trigger broker behavior
- live trigger registration
- picker fallback contract

### `parallel-tool-event-correlation`
Anchors the `pi-autonomous-session-control` seam most exposed to Pi `0.58.x` parallel tool semantics.

Current command:

```bash
cd packages/pi-autonomous-session-control
npm run test:compat:parallel-tool-events
```

Protected host surfaces:
- `tool_call` preflight ordering
- `tool_result` correlation
- parallel tool execution

## How to run

### Default CI path

The default machine-owned signal is the dedicated GitHub Actions workflow:

- `.github/workflows/compatibility-canary.yml`

It runs automatically on:
- pull requests
- pushes to `main`

and supports manual dispatch with a chosen profile.

### Local mirror commands

List scenarios plus the exact resolved host contract:

```bash
npm run compat:canary:list
```

Show only the resolved host contract:

```bash
node ./scripts/pi-host-compatibility-canary.mjs resolve-host --profile current
```

Run the current profile:

```bash
npm run compat:canary
```

Run the upgrade profile explicitly:

```bash
PI_HOST_COMPAT_HOST_VERSION=0.61.0 \
PI_HOST_COMPAT_CHANGELOG_REF='https://github.com/badlogic/pi-mono/compare/v0.60.0...v0.61.0' \
node ./scripts/pi-host-compatibility-canary.mjs run --profile upgrade
```

Preview the upgrade contract without executing commands:

```bash
PI_HOST_COMPAT_HOST_VERSION=0.61.0 \
PI_HOST_COMPAT_CHANGELOG_REF='https://github.com/badlogic/pi-mono/compare/v0.60.0...v0.61.0' \
node ./scripts/pi-host-compatibility-canary.mjs run --profile upgrade --dry-run
```

Optional local full-lane mirror:

```bash
PI_HOST_COMPAT_CANARY=1 ./scripts/ci/full.sh
# optional profile override
PI_HOST_COMPAT_CANARY=1 \
PI_HOST_COMPAT_PROFILE=upgrade \
PI_HOST_COMPAT_HOST_VERSION=0.61.0 \
PI_HOST_COMPAT_CHANGELOG_REF='https://github.com/badlogic/pi-mono/compare/v0.60.0...v0.61.0' \
./scripts/ci/full.sh
```

### Manual workflow dispatch

Use the GitHub Actions workflow dispatch inputs when you want the dedicated CI lane to run the `upgrade` profile without changing the default PR/main behavior.
For `upgrade`, provide both:
- `host_version`
- `changelog_ref`

The workflow resolves the exact host contract first and then runs every scenario against that same versioned host package set.

## When to add a new scenario

Add a new canary scenario when all are true:

1. an upstream Pi changelog item touches a host surface this repo depends on,
2. the dependency is meaningful enough that guessing is worse than proving,
3. an existing package test or focused script can represent that risk deterministically, and
4. the scenario adds incremental upgrade knowledge rather than duplicating broad package CI.

## Authoring rules

- Prefer **small focused commands** over whole-package `npm test` when the compatibility risk is localized.
- Prefer **existing deterministic tests** before inventing a new harness.
- Prefer **executable seam tests** over source-text assertions when guarding runtime behavior.
- Keep scenario descriptions tied to **host surfaces**, not generic package ownership.
- If a scenario only works in a special environment, make that explicit in `notes`.
- Treat the manifest as a root-owned contract; package-local details should stay in package tests/scripts.

## What this does not replace

- package-local `npm run check`
- package-local release checks
- live manual UX validation when a change is fundamentally interactive

The canary exists to make upgrade decisions faster and safer, not to collapse every validation activity into one lane.
