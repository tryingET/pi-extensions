---
summary: "Root-owned canary lane for validating pi-extensions against upstream Pi host changes."
read_when:
  - "Triaging whether an upstream Pi changelog item requires extension changes."
  - "Before bumping @earendil-works/pi-coding-agent across monorepo packages."
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
- `@earendil-works/pi-coding-agent` version
- companion package versions (`@earendil-works/pi-ai`, `@earendil-works/pi-tui`)
- exact review anchor for the upstream changelog item / diff under review

The manifest now declares explicit leaf package roots for each scenario. The runner validates those package roots, auto-aligns them to the selected host contract before executing the scenario command, and restores the prior host-package versions after the run.
Host alignment, scenario commands, and restoration run with isolated empty npm config files and without ambient `before` / `min-release-age` settings. Exact compatibility probes therefore cannot silently exclude the selected host release because a workstation-level package-age policy predates it.
That removes directory-shape inference, keeps execution scope consistent with the declared seam, and reduces local environment contamination after upgrade checks.

Coverage health for the critical root canary is tracked with `critical_uncovered_host_surfaces`; the current target is `critical_uncovered_host_surfaces=0`.

### `current`
Run against the root-owned pinned host contract recorded in `policy/pi-host-compatibility-canary.json`. This is the canary baseline contract, not a claim that every checked-in package tree already matches it.

### `upgrade`
Run against an explicit candidate Pi host release supplied via:
- `PI_HOST_COMPAT_HOST_VERSION`
- `PI_HOST_COMPAT_CHANGELOG_REF`

## Host/package upgrade boundary

Since Pi 0.79.7, bare `pi update` updates the Pi host only; `pi update --all` is required for managed package updates. Local-path packages in this monorepo are not upgraded by either command: bump their Pi development contract and lockfile, run this canary, reinstall the changed local package with `pi install /absolute/package/path`, and `/reload` before claiming live compatibility. This prevents a new host from running against stale package-local types or helper dependencies.

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

### `asc-settlement-and-thinking-contract`
Anchors the Pi 0.80 host lifecycle used by `dispatch_subagent` and rewind finalization.

Current command:

```bash
cd packages/pi-autonomous-session-control
node --test --experimental-strip-types tests/rewind-runtime.test.mjs tests/subagent-transport-live.test.mjs tests/dispatch-subagent-lifecycle-control.test.mjs
```

Protected host surfaces:
- authoritative `agent_settled` finality
- legacy `agent_end.willRetry` compatibility
- session idle/settlement timing
- `max` thinking-level forwarding
- rewind finalization after full settlement

### `autoresearch-runtime-packet-contract`
Anchors the direct `pi-autoresearch` runtime packet/export surface: runtime receipts become status, closeout, candidate-result, and learning-export packets without crossing into orchestrator-owned reporting.

Current command:

```bash
cd packages/pi-autoresearch
node --import tsx --test --test-name-pattern "segment closeout summarizes empirical decisions and candidate bindings|autoresearch_runtime_status can request closeout, setup, and finalize packets" tests/runtime.test.ts
```

Protected host surfaces:
- runtime receipt projection
- runtime status packet export
- candidate-result packet export seam
- learning packet export seam

This is the direct pi-autoresearch runtime/status/export scenario. It proves packet construction, local export paths, suggested owner handoff calls, and non-authority side-effect flags without launching peers or writing AK/KES/evidence.

### `orchestrator-autoresearch-supervision-contract`
Anchors the `pi-society-orchestrator` supervision/report choreography around `pi-autoresearch`: start a supervised campaign plan, report status for the exact session identity, and render the closeout path for owner review.

Current command:

```bash
cd packages/pi-society-orchestrator
npm install --no-save --package-lock=false ../pi-autonomous-session-control >/dev/null
node --test --test-name-pattern "autoresearch_live_supervision start/status/stop manages a live running session|autoresearch_live_supervision start_campaign delegates execution then supervises|autoresearch_live_supervision review_matrix_campaign aggregates managed cell waves" tests/autoresearch-live-control-plane.test.mjs
```

Protected host surfaces:
- TypeBox tool schema compatibility
- start_campaign/status/closeout supervision seam
- registered tool execution result details
- supervision report rendering for pi-autoresearch packet handoffs

This scenario proves the orchestrator supervision scenario covers start_campaign/status/closeout seam while keeping package ownership truthful: `pi-autoresearch` owns runtime packets/receipts, and `pi-society-orchestrator` owns supervision/report choreography. It refreshes the local ASC dependency before running because published ASC intentionally ships TypeScript sources that raw Node cannot strip from `node_modules`.

### `orchestrator-autoresearch-matrix-closeout`
Anchors the highest-stack supervised campaign path currently proven inside `pi-society-orchestrator`: matrix campaign planning, managed candidate-wave packet review, dashboard-first owner routing, and the matrix closeout evidence handoff.

Current command:

```bash
cd packages/pi-society-orchestrator
npm install --no-save --package-lock=false ../pi-autonomous-session-control >/dev/null
node --test --test-name-pattern "plan_matrix_campaign|review_matrix_campaign|review_candidate_wave compares" tests/autoresearch-live-control-plane.test.mjs
```

Protected host surfaces:
- TypeBox tool schema compatibility
- registered tool execution result details
- extension report rendering for nested owner-route payloads

This scenario intentionally does not run benchmarks, launch peers, merge candidates, or write AK/KES evidence. It protects the operator-visible choreography surface that tells the user which lower owner seam to use next.

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
PI_HOST_COMPAT_HOST_VERSION=0.80.6 \
PI_HOST_COMPAT_CHANGELOG_REF='https://github.com/earendil-works/pi/compare/v0.76.0...v0.80.6' \
node ./scripts/pi-host-compatibility-canary.mjs run --profile upgrade
```

Preview the upgrade contract without executing commands:

```bash
PI_HOST_COMPAT_HOST_VERSION=0.80.6 \
PI_HOST_COMPAT_CHANGELOG_REF='https://github.com/earendil-works/pi/compare/v0.76.0...v0.80.6' \
node ./scripts/pi-host-compatibility-canary.mjs run --profile upgrade --dry-run
```

Optional local full-lane mirror:

```bash
PI_HOST_COMPAT_CANARY=1 ./scripts/ci/full.sh
# optional profile override
PI_HOST_COMPAT_CANARY=1 \
PI_HOST_COMPAT_PROFILE=upgrade \
PI_HOST_COMPAT_HOST_VERSION=0.80.6 \
PI_HOST_COMPAT_CHANGELOG_REF='https://github.com/earendil-works/pi/compare/v0.76.0...v0.80.6' \
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
