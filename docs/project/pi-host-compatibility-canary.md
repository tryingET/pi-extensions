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
Before alignment, the runner preflights every target and records its canonical package identity plus whether `node_modules` was absent or a real directory; symlinks and non-directories fail closed before npm runs. Cleanup restores pre-existing trees to lockfile-derived exact host versions before atomically detaching/removing only identity-matched runner-created trees for initially absent targets, so later npm restoration cannot recreate an already-cleaned target. Restoration revalidates identities and bound package metadata before every effect, attempts every affected target, aggregates failures, and applies a final all-target barrier; any restoration or identity failure aborts later scenarios so contaminated state cannot become a new baseline. A durable recovery journal now carries those barriers across runner `SIGKILL`, host termination, and later process restart.
Host alignment, scenario commands, and restoration run with isolated empty npm config files and without ambient `before` / `min-release-age` settings. Exact compatibility probes therefore cannot silently exclude the selected host release because a workstation-level package-age policy predates it.
That removes directory-shape inference, keeps execution scope consistent with the declared seam, and reduces local environment contamination after upgrade checks.

Coverage health for the critical root canary is tracked with `critical_uncovered_host_surfaces`; the current target is `critical_uncovered_host_surfaces=0`.

### Runner module map

AK-4714 retired the temporary runner size exception by decomposing the implementation into cohesive private modules while keeping `scripts/pi-host-compatibility-canary.mjs` as the only CLI facade:

- `paths.mjs` — repository-root paths and canonical containment checks
- `integrity.mjs` — identity/effective-UID barriers, integrity errors, and handle-safe removal
- `manifest.mjs` — manifest validation, profile resolution, and scenario selection
- `host-state.mjs` — target ledgers, host snapshots, identity barriers, and npm command construction
- `process.mjs` — subprocess capture and isolated npm environment handling
- `command-wrapper.mjs` — process-group effect gate that waits until child identity is durably journaled
- `host-lifecycle.mjs` — all-target preparation, alignment, restoration ordering, and final barriers
- `state-files.mjs` — owner-only checksummed records, atomic replace/fsync, and Linux process identity
- `state-schema.mjs` — exhaustive gate, lock, journal, target-state, and identity schema validation
- `state-lock.mjs` — checkout-root mutation exclusion and recovery election
- `state-store.mjs` — manifest/package bindings plus validated lock and journal inventory
- `recovery-journal.mjs` — fenced mutation sessions, checksummed journal transitions, and finalization
- `recovery.mjs` — status inspection, safe automatic cleanup, and explicit bounded npm recovery
- `payloads.mjs` — stable JSON payload construction and human-readable list/host rendering
- `runner.mjs` — scenario execution, later-scenario abort rules, and run summaries

These modules live under `scripts/pi-host-compatibility-canary/` and are private implementation details. Callers continue to use the facade; existing validate, resolve, list, run, and dry-run payloads remain compatible, with additive `status` and `recover` commands.

## Hard-interruption recovery

### Durable state and checkout lock

A non-dry run takes one exclusive mutation lock at `<canonical-checkout>/.pi-host-compatibility-canary.lock` and binds it to the checkout device/inode identity. A short-lived checkout-root recovery-election lock prevents concurrent stale-state recovery. Keeping the exclusion anchor at the canonical checkout means changing `XDG_STATE_HOME` cannot create an independent mutation lane.

The journal lives below owner state:

```text
${XDG_STATE_HOME:-$HOME/.local/state}/pi-host-compatibility-canary/checkouts/<sha256(canonical-checkout)>/journals/
```

The owner-state application, checkout, and journal directories must be real owner-only directories (`0700`). Canonical checkout locks and journal records must be regular, non-symlink, effective-user-owned `0600` files within their size limits. Relative state homes and state homes resolving inside the repository or the system temporary directory are rejected. The journal never lives in the repository or `/tmp`; checkout lock files are transient exclusion anchors and are removed after a verified clean barrier.

Each journal uses schema version 1 and a SHA-256 checksum over its payload. The checksum detects torn or accidental byte changes; it is not authentication. Records contain only recovery metadata: run/process identity, checkout and manifest binding, package/lock digests, target identities, exact host-version snapshots, and state. They do not contain environment variables, npm credentials, command arrays, subprocess output, or package contents.

Lock publication uses a fully written/fsynced same-directory candidate plus an exclusive hard-link publish and directory fsync, avoiding an empty lock-file crash window. Every journal transition uses a same-directory temporary file, file fsync, atomic rename, and journal-directory fsync. Unpublished candidates are never treated as canonical state. Target staging, quarantine renames, creation, and removal fsync the owning package directory. Before a pre-existing tree is marked restored, host-package metadata files and their package/scope/`node_modules`/package-root directories are fsynced.

Every live mutation transition reacquires the owner-state gate and re-reads the canonical checkout lock plus journal. The expected lock inode, run ID, owner token/process identity, journal inode, and journal revision must still match before replacement; atomic replacement is also bound to the previously read journal inode. A changed owner record is preserved and fails closed rather than being overwritten. Recovery holds the checkout recovery-election lock and continuously revalidates that lock, the state gate, the stale mutation lock, and the current journal revision before each journal update or filesystem effect.

Recursive deletion opens the selected directory without following symlinks and verifies device/inode plus effective UID for the root and every entry before unlinking. A type- or identity-matched tree owned by another effective UID is not removed.

### Effect ordering and process identity

Before every npm, scenario-command, or target-tree mutation, the runner durably writes intent. Before the first alignment subprocess, all declared targets become `alignment-exposed`, so a lifecycle script cannot mutate a later target that recovery would misclassify as untouched. Initially absent staging uses an exact run-ID/index path and a journaled 256-bit owner marker. After `mkdir`, the runner journals the stage inode before writing the marker. A `SIGKILL` in the narrower mkdir-to-inode-record window is recoverable only when that exact stage is effective-user-owned and still empty; any unmarked nonempty stage is preserved and fails closed. The marker and directories are fsynced before promotion.

Mutating subprocesses start behind a Node wrapper gate. The wrapper reports its identity, waits while the parent journals that identity, then releases the command. On POSIX hosts the journal also records the wrapper-led process-group ID. If the parent dies first, the wrapper exits without starting the effect. If the parent dies after release, recovery refuses while either the wrapper or its process group is live. If only the wrapper dies while the parent survives, the parent terminates and proves the process group stopped before restoration.

On Linux, owner liveness is stronger than PID-only checking: the record binds effective UID, machine ID, PID, boot ID, `/proc/<pid>/stat` start time, and PID-namespace device/inode/link identity. A different machine ID is ambiguous rather than stale; a same-machine boot-ID change proves the old process dead. A stale takeover is allowed only when identity is conclusive. Unsupported platforms, unreadable identity, or ambiguous identity fail closed; stale-lock takeover is therefore not claimed portable where the host cannot prove process start identity.

The target state machine is intentionally small:

```text
baselined -> alignment-exposed                                  # before any npm effect
  -> stage-create-intent -> mkdir -> inode-record -> owner-marker  # initially absent
  -> stage-created -> stage-promote-intent
  -> owned-node-modules -> alignment-intent -> aligned
  -> scenario-intent
  -> restore-command-intent                                      # initially present
  -> detach-intent -> quarantined -> quarantine-remove-intent     # initially absent
  -> restored
```

The top-level journal moves from `ready` to the current phase, back to `ready` only after the all-target restoration barrier, and finally to `clean` before lock/journal unlink. A crash before or after either unlink remains distinguishable and recoverable.

### Automatic versus explicit recovery

At the start of every mutating run, the runner first reconciles stale state. Automatic recovery is limited to operations that do not invoke npm against a pre-existing tree:

- close a pre-effect journal with no target mutation;
- remove an exact run-ID/index stage only when its journaled inode or fsynced owner marker proves ownership; the sole pre-marker exception is the exact effective-user-owned empty stage left after a journaled `stage-create-intent`;
- detach and remove an initially absent `node_modules` only when its identity matches the journaled runner-owned staging identity;
- accept a pre-existing tree as already restored when its original identity and lockfile-derived host snapshot already match.

Automatic recovery never scans for similarly named directories and never deletes an identity-unknown `node_modules`. If a pre-existing tree still needs host-version restoration, startup fails closed. The operator must review status and opt into the bounded command:

```bash
node ./scripts/pi-host-compatibility-canary.mjs status --json
node ./scripts/pi-host-compatibility-canary.mjs recover --json
node ./scripts/pi-host-compatibility-canary.mjs recover --apply --json
```

`recover --apply` re-resolves the scenario and targets from the currently bound manifest, verifies unchanged manifest/package/package-lock digests and identities, derives restore commands from that package lock, and then runs only the canary's built-in npm restore construction. The canonical package root, package metadata, original `node_modules` inode, effective UID, and recovery ownership fence are re-resolved before every npm command and again inside the wrapper's pre-release gate. Commands and absolute paths are never deserialized from journal bytes. Upgrade-profile recovery must be supplied the same explicit host environment so the bound host contract can be re-derived.

A status result is one of `clean`, `active`, `recovery-required`, or `invalid`. JSON recovery failures return a structured error with `code` and `message` and a non-zero exit. Active owner/child, malformed or oversized record, checksum failure, symlink, wrong owner/mode, manifest or package identity drift, missing journal-ready state, multiple journals, and unknown liveness all fail closed.
A stale recovery-election lock is also fail-closed and requires manual review rather than an unsafe concurrent takeover.

### Security and recovery limits

This mechanism protects against ordinary concurrent canary runs and non-cooperative parent interruption. It does **not** claim protection from malicious same-UID writers, filesystem or kernel corruption, rollback of the owner state directory, a command that deliberately replaces an identity-bound target, or unbounded/hostile descendant process trees. npm restoration retains npm's normal network, lifecycle-script, and transitive-tree behavior, which is why recovery against pre-existing trees requires explicit `--apply` consent. Scenario commands can have documented effects outside declared host targets (for example scenario-local `npm ci`); those effects remain owned by the scenario and are not reconstructed from this journal.

### `current`
Run against the root-owned pinned host contract recorded in `policy/pi-host-compatibility-canary.json`. This is the canary baseline contract, not a claim that every checked-in package tree already matches it.

### `upgrade`
Run against an explicit candidate Pi host release supplied via:
- `PI_HOST_COMPAT_HOST_VERSION`
- `PI_HOST_COMPAT_CHANGELOG_REF`

## Host/package upgrade boundary

Since Pi 0.79.7, bare `pi update` updates the Pi host only; `pi update --all` is required for managed package updates. Local-path packages in this monorepo are not upgraded by either command: align their declared host contract, run this canary, reinstall the changed local package with `pi install /absolute/package/path`, and `/reload` before claiming live compatibility. A package may keep host packages as optional peers and materialize the exact host only inside this canary when persistent host dev dependencies would import unrelated host shrinkwrap risk.

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

### `code-mode-extension-factory-contract`
Anchors `pi-eval-kernel` to the selected exact host's exported extension types without persisting the host dependency tree in ordinary package installs.

Current command:

```bash
cd packages/pi-eval-kernel
bash -c 'npm ci >/dev/null && npm run test:compat:pi-host'
```

Protected host surfaces:
- `ExtensionFactory` and `ExtensionAPI` assignability
- TypeBox tool schema registration
- tool-result and asynchronous command-handler contracts

The scenario first hydrates `pi-eval-kernel`'s lockfile-defined development toolchain, so a clean checkout does not depend on pre-existing package-local `node_modules`. Scenario-local `npm ci` destructively replaces `pi-eval-kernel`'s package-local `node_modules` with the lockfile-defined tree and leaves that tree hydrated after a local canary run. The package lock omits the optional host peers; the runner separately materializes the selected exact host packages in the dependency-isolated fixture, compiles the focused contract, and restores the fixture's lockfile-declared host absence afterward.

The manifest uses non-login `bash -c` only to sequence hydration before compilation, avoiding login-profile startup effects. The dedicated canary runs on `ubuntu-latest`, where Bash is available; local mirrors of this scenario also require Bash, so native Windows without a Bash environment is not supported. This remains a compile-time host contract; it neither executes `eval` nor provides code isolation.

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

### `prompt-mode-base-composition-parity`
Anchors `pi-modes` `replace_base` behavior to the pinned Pi host custom-base builder.

Current command:

```bash
cd packages/pi-modes
node --import tsx --test --test-name-pattern "replace_base has complete-output parity with the pinned Pi host builder" tests/modes.test.ts
```

Protected host surfaces:
- `BuildSystemPromptOptions` shape
- custom base-prompt composition order and formatting
- project context and skill rendering
- `before_agent_start` system-prompt replacement

This is a complete-output parity check, not an autonomy scenario. It does not continue turns, dispatch agents, or start campaigns.

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
npm --prefix ../pi-autoresearch ci >/dev/null
npm install --no-save --package-lock=false ../pi-autonomous-session-control >/dev/null
node --test --test-name-pattern "autoresearch_live_supervision start/status/stop manages a live running session|autoresearch_live_supervision start_campaign delegates execution then supervises|autoresearch_live_supervision review_matrix_campaign aggregates managed cell waves" tests/autoresearch-live-control-plane.test.mjs
```

Protected host surfaces:
- TypeBox tool schema compatibility
- start_campaign/status/closeout supervision seam
- registered tool execution result details
- supervision report rendering for pi-autoresearch packet handoffs

This scenario proves the orchestrator supervision scenario covers start_campaign/status/closeout seam while keeping package ownership truthful: `pi-autoresearch` owns runtime packets/receipts, and `pi-society-orchestrator` owns supervision/report choreography. Its declared package set includes `pi-autoresearch` because the command hydrates that package before testing, and includes local ASC because published ASC intentionally ships TypeScript sources that raw Node cannot strip from `node_modules`.

### `orchestrator-autoresearch-matrix-closeout`
Anchors the highest-stack supervised campaign path currently proven inside `pi-society-orchestrator`: matrix campaign planning, managed candidate-wave packet review, dashboard-first owner routing, and the matrix closeout evidence handoff.

Current command:

```bash
cd packages/pi-society-orchestrator
npm --prefix ../pi-autoresearch ci >/dev/null
npm install --no-save --package-lock=false ../pi-autonomous-session-control >/dev/null
node --test --test-name-pattern "plan_matrix_campaign|review_matrix_campaign|review_candidate_wave compares" tests/autoresearch-live-control-plane.test.mjs
```

Protected host surfaces:
- TypeBox tool schema compatibility
- registered tool execution result details
- extension report rendering for nested owner-route payloads

This scenario intentionally does not run benchmarks, launch peers, merge candidates, or write AK/KES evidence. Its declared package set includes `pi-autoresearch` because the command hydrates that package before testing, and includes local ASC because the test installs that source package before loading the orchestration path. It protects the operator-visible choreography surface that tells the user which lower owner seam to use next.

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
PI_HOST_COMPAT_HOST_VERSION=0.83.0 \
PI_HOST_COMPAT_CHANGELOG_REF='https://github.com/earendil-works/pi/compare/v0.80.6...v0.83.0' \
node ./scripts/pi-host-compatibility-canary.mjs run --profile upgrade
```

Preview the upgrade contract without executing commands:

```bash
PI_HOST_COMPAT_HOST_VERSION=0.83.0 \
PI_HOST_COMPAT_CHANGELOG_REF='https://github.com/earendil-works/pi/compare/v0.80.6...v0.83.0' \
node ./scripts/pi-host-compatibility-canary.mjs run --profile upgrade --dry-run
```

Optional local full-lane mirror:

```bash
PI_HOST_COMPAT_CANARY=1 ./scripts/ci/full.sh
# optional profile override
PI_HOST_COMPAT_CANARY=1 \
PI_HOST_COMPAT_PROFILE=upgrade \
PI_HOST_COMPAT_HOST_VERSION=0.83.0 \
PI_HOST_COMPAT_CHANGELOG_REF='https://github.com/earendil-works/pi/compare/v0.80.6...v0.83.0' \
./scripts/ci/full.sh
```

Run the compatibility baseline and crash-recovery suites sequentially because they intentionally exercise one canonical-checkout lock:

```bash
node --test scripts/pi-host-compatibility-canary.test.mjs
node --test scripts/pi-host-compatibility-canary.recovery.test.mjs
```

The recovery suite is currently a standalone owner command: `scripts/ci/full.sh` invokes the 10-test compatibility baseline but does **not** yet invoke `pi-host-compatibility-canary.recovery.test.mjs`. Wiring that second command into normal root CI requires an owner-approved expansion outside AK-4715's canary-file scope. Until that follow-up lands, record the standalone recovery-suite receipt explicitly; do not infer its result from the baseline or dedicated scenario workflow.

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
- Keep every scenario `cwd` and package target canonically inside the repository; the runner rejects lexical and symlink escapes before commands or package mutations.

## What this does not replace

- package-local `npm run check`
- package-local release checks
- live manual UX validation when a change is fundamentally interactive

The canary exists to make upgrade decisions faster and safer, not to collapse every validation activity into one lane.
