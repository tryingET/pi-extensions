---
summary: "RFC for activating complete immutable Pi extension generations instead of loading from mutable development checkouts and shared node_modules trees."
read_when:
  - "Changing how local Pi extension packages are built, installed, activated, reloaded, rolled back, or garbage-collected."
  - "Changing Pi package-loader install roots, locking, provenance, or reload transaction semantics."
type: "rfc"
status: "proposed"
system4d:
  container: "Pi extension runtime generation boundary across the pi-extensions control plane and Pi host package loader."
  compass: "Build and verify a complete generation before activation; never mutate an active generation."
  engine: "plan -> materialize in isolation -> verify -> atomically select -> reload/fresh-start -> retain rollback"
  fog: "A symlink swap can look atomic while Pi still discovers or imports files through a mutable lexical path."
---

# RFC: immutable Pi extension runtime generations

Date: 2026-08-16  
Status: proposed; no implementation or live activation authorized by this document  
Owner surfaces: `pi-extensions` root for a local generator; upstream Pi for package-loader and transactional reload semantics

## Decision requested

Should `pi-extensions` adopt a bounded generation builder for local packages now, while proposing first-class generation activation to upstream Pi separately?

Recommended answer:

1. **Adopt a minimal local generation builder and verifier** for reproducibility-sensitive local package families.
2. **Activate exact generation paths**, not editable source paths and not a mutable `current` symlink.
3. **Coordinate materialization and settings selection**, retain every published generation, and prohibit deletion in the first slice.
4. **Make fresh-process activation the supported first slice.** Treat reload as experimental: current Pi tears down the old runner before proving the new one and may continue with a partial extension set.
5. **Propose upstream package-loader changes** before making generations the default for npm/git installs or promising lock-safe, lease-aware, transactional rollback.

## Scope and boundary

This RFC evaluates:

- complete build/install before activation;
- atomic generation or pointer selection;
- package-use leases and install coordination;
- separation of live runtime artifacts from editable worktrees;
- rollback to the previous verified generation;
- neighboring `file:` dependency rebuild or absence;
- current Pi feasibility versus required upstream changes.

This RFC does **not** reopen historical incident analysis. The accepted mitigation at commit `5e6e0611a` remains intact and is neither modified nor re-litigated here.

No implementation task is created by this RFC. If the owner accepts implementation, create a scoped AK task before code changes and require the concurrency regression defined below.

## Problem

Local Pi package installs record a path. They do not copy or materialize the package. A live package can therefore resolve extension code and `node_modules` from the same checkout that developers edit, install into, or temporarily leave incomplete.

Concrete failure shape:

```text
Pi settings -> editable package A
                   |
                   +-> node_modules/B -> neighboring file: package B

npm/install/edit churn changes A, B, or their links
while an existing or reloading Pi process still depends on them.
```

The desired shape is:

```text
editable source or isolated clone
        |
        | build/install/verify, with no active-generation or Pi-settings effects
        v
immutable generation G2 (complete source + dependency closure + manifest)
        |
        | one coordinated activation selection
        v
Pi settings -> exact G2 package paths

G1 remains complete and retained for rollback.
```

## Observed current Pi model

Audited upstream revision: `06a1c6ca3fcc7229ebfa2176c4f4a8d175cb47d6` (`pi-coding-agent` 0.84.2).

### Local sources

- `pi install <local-path>` checks only that the path exists, then persists the source (`package-manager.ts:978-1005`).
- The source is normalized relative to the settings scope and loaded from that path later (`package-manager.ts:1408-1417`, `2107-2123`).
- Pi documentation explicitly states that local paths are not copied (`docs/packages.md`, “Local Paths”).
- Package resources are read beneath the selected package root (`package-manager.ts:2126-2158`).

Result: a local install is an alias to mutable source state unless the operator supplies an immutable runtime root.

### npm sources

- User packages share `<agentDir>/npm`; project packages share `<cwd>/.pi/npm` (`package-manager.ts:1998-2007`, `2039-2048`).
- Pi invokes npm, pnpm, or bun directly against that shared root (`package-manager.ts:1758-1785`).
- Reinstallation replaces package bytes at the same destination. Pi does not stage and atomically promote a complete install root.

### git sources

- Git packages use fixed repository paths (`package-manager.ts:2067-2087`).
- New installs clone into the final path and install dependencies there (`package-manager.ts:1804-1835`).
- Existing updates fetch, reset, clean, and reinstall in place (`package-manager.ts:1888-1931`).
- The incomplete marker supports repair, not rollback to the previous commit.

### Resolution and reload

- Startup and reload resolve configured package paths again (`resource-loader.ts:401-455`).
- Reload clears the extension factory cache (`resource-loader.ts:387-392`).
- Current reload emits shutdown and invalidates the old runner before resource reload and new runtime construction succeed (`agent-session.ts:2610-2634`).

Result: a complete generation selected before startup or reload can be consumed. Extension import failures are collected as diagnostics, so reload can continue with a partial extension set. A failed or partial reload is not a transactional return to the still-active old runtime.

### Coordination and provenance

- Pi has settings-file coordination, but no package-root lock covering npm/git/local installation effects.
- Settings treat the package list as one field; concurrent successful local installs can lose each other’s updates.
- Current resource metadata reports source, scope, origin, path, and base directory. It is useful readback, but not a generation ledger or dependency provenance proof.
- Pi exposes no prepare, validate, activate, rollback, lease, or generation garbage-collection API.

## Isolated experiment evidence

All experiments used a scratch root and isolated `HOME` plus `PI_CODING_AGENT_DIR`. They did not mutate the live checkout, live `node_modules`, or operator settings. Lifecycle scripts and network access were disabled.

Retained local evidence root:

```text
/home/tryinget/.local/state/pi-quests/tmp/pi-package-model-verify.LJFvvW
```

Observed:

1. **Local source is not copied.** A fresh process saw a source edit without reinstall. Resource metadata named the recorded source and exact `baseDir`.
2. **Filesystem pointer selection works when quiescent.** Fresh processes loaded generation v2 after a symlink retarget and v1 after rollback.
3. **Reload sees a completed pointer change.** One RPC process changed v1 -> v2 -> v1 through `ctx.reload()`, with the expected shutdown/factory/startup/resource-discovery sequence.
4. **An active process may survive neighboring dependency absence only by cache.** Cached code continued to run while the target was absent; a fresh load failed `MODULE_NOT_FOUND`, and cache eviction in the active process failed until the target returned.
5. **In-place rebuild is not a coherent upgrade.** The active cached object remained old while a fresh process saw rebuilt bytes.
6. **npm installs are copied but mutable in place.** Reinstall changed the inode at the same managed destination; a fresh process saw the new extension.
7. **Concurrent settings churn is unsafe.** Twelve isolated concurrent local installs all returned success, but only five package records remained.
8. **Install success is not load validation.** A malformed local package was persisted and then failed fresh startup.

Not verified: hosted git clone/update behavior, concurrent npm/git effects, TUI keystroke dispatch, Windows pointer behavior, disk-full behavior, or a crash during npm replacement. `ctx.reload()` exercised the documented reload path, but is not a Ghostty/TUI proof.

## Feasibility finding

### Feasible now, without Pi semantic changes

A `pi-extensions`-owned workflow can provide **generation-safe local activation at one settings-file boundary** if it:

- exports a complete repository snapshot from one exact commit into a dedicated runtime-generation root;
- installs the selected package and build closure entirely inside that root;
- verifies the generation before any settings effect;
- declares one user or project settings scope as the activation owner;
- preflights both scopes and refuses editable, old-generation, or duplicate logical-family entries in the other scope;
- replaces the mapped family entries in one atomically replaced settings file while preserving filters, `autoload`, ordering, and unrelated entries;
- serializes activation against cooperating installers and requires other Pi/settings writers to be quiescent;
- uses a fresh process as the supported activation path;
- retains every published generation.

Local paths at G1 and G2 are distinct Pi package identities. Adding G2 without removing every mapped G1 entry can load both. The bounded claim is therefore concurrent-reader old-or-new selection for one declared settings file, not a universal transaction across user and project scopes, non-cooperating writers, crashes, or a running Pi process.

### Unsafe shortcut

A shared `current` symlink is not sufficient as the durable package path:

- Pi retains lexical resource paths while using canonical paths mainly for deduplication.
- Discovery and imports occur across multiple filesystem accesses.
- Retargeting the pointer during discovery/import is a reasoned mixed-view risk; the isolated experiment proved only quiescent swaps, not this race.

A pointer may be used as a human/operator convenience, but settings should bind exact generation roots. If a pointer is supported, activation must exclude reload/startup and resolve the pointer once to a canonical generation before Pi sees resource paths. Current Pi does not provide that resolution snapshot.

### Requires upstream Pi changes

First-class atomic generations for npm/git packages require upstream changes:

1. staged immutable install roots instead of fixed mutable roots;
2. per-package or per-scope cross-process install locks;
3. prepare -> validate -> activate package-manager semantics;
4. activation pointers resolved once to a canonical generation snapshot;
5. artifact/settings commit and recovery state;
6. generation provenance and rollback APIs;
7. host-owned package-use leases or equivalent live-generation references;
8. transactional reload that constructs and validates the new runner before retiring the old one.

Therefore: **atomic local generation selection is feasible with the current model; first-class atomic package generations and transactional runtime rollback require upstream changes.**

## Proposed local generation contract

### Generation identity and layout

Use a dedicated runtime root outside editable worktrees and outside package-local `node_modules`:

```text
<XDG_STATE_HOME>/pi/package-generations/pi-extensions/
  <source-commit>-<input-digest>/
    repo/                    # exported tracked snapshot, not a developer worktree
    generation.json         # published last
    verification.json       # bounded machine-readable results
```

The generation ID binds:

- full source commit;
- selected package roots;
- hashes of selected and transitive local package manifests and lockfiles;
- builder schema version;
- Node and package-manager identity/version;
- declared local dependency closure.

The runtime snapshot should be produced from an isolated clone or worktree and exported into the runtime root. Runtime use must not point back into that clone/worktree. Tracked source and dependency inputs become read-only after verification where platform behavior permits.

### Complete materialization before publication

For every selected Pi package:

1. derive neighboring owners from manifests, lockfiles, and the installed-link graph, including every supported local dependency form;
2. require every local target inside the exported repository snapshot and validate target package names;
3. declare the supported package manager and lockfile mode;
4. install in graph order with lifecycle scripts disabled by default;
5. run only reviewed package-specific build recipes needed for generated runtime outputs, such as ignored `dist/` entrypoints;
6. require zero tracked manifest or lockfile changes;
7. after the entire graph settles, verify installed local links, lock/target coherence, generated-output inventories and hashes, runtime imports, and peer resolution from each selected consumer context;
8. load every required Pi extension entrypoint in a process with isolated Pi settings and writable roots; candidate code remains trusted unless an OS sandbox also enforces filesystem and network boundaries;
9. verify zero extension-load errors and the exact expected resource inventory;
10. write `generation.json` last with exclusive creation.

An isolated `HOME` is not a security sandbox: extension factories execute arbitrary code. “No effects” here means no active-generation or Pi-settings effects unless an OS sandbox provides a stronger boundary.

An incomplete directory is never activatable. Before publication, failed candidate directories may be cleaned only by the process that owns the candidate and can prove it was never published. Published generations are retained under the first-slice policy.

### Neighboring `file:` dependencies

The whole relative package topology must exist inside each generation. Never activate package A from G2 while its `file:` dependency B resolves to an editable checkout or G1.

Behavior:

- **B rebuilt in a new candidate generation:** active G1 is unaffected.
- **B absent while G2 is being built:** G2 fails before publication.
- **B temporarily absent from active G1:** cached imports may continue, but lazy imports, reload, and fresh processes can fail. This is not acceptable; active generations must never be removed or edited.
- **B repointed independently:** prohibited. Rebuild and select the complete closure as one generation.

### Activation coordination

Use two distinct coordination mechanisms:

1. **Materialization lock:** keyed by generation ID; prevents duplicate or overlapping writes to one candidate and serializes neighboring package builds whose installs could mutate linked roots.
2. **Activation lock:** keyed by agent/settings scope; held while reading prior settings, checking compare-and-swap preconditions, and replacing the mapped package family.

The first slice must require Pi and other settings writers to be quiescent unless it interoperates with Pi’s exact settings-lock namespace. A private lock cannot coordinate with Pi.

Before settings commit, durably write a prepared recovery journal containing prior bytes/mode/digest and intended activated digest. Settings replacement uses a same-directory temporary file, file flush, atomic rename, and parent-directory flush where the platform supports them. Journal completion follows settings commit. Recovery reconciles prepared, activated, and completed states. The claim is crash-durable only on platforms where these steps are implemented and tested; otherwise it is concurrent-reader atomicity only.

Do not call a settings lock a package-use lease. It protects a short mutation transaction only.

### Package-use leases

True leases require host participation because Pi knows when a process has resolved and stopped using a generation. Package extensions cannot reliably self-lease before their own import succeeds.

Initial local policy:

- no deletion of any published generation, including by explicit cleanup;
- pre-publication failed candidates may be removed only by their proven owning builder;
- storage growth is accepted until host-owned leases or a proven global quiescence protocol exists.

Settings references are insufficient: after later activations, a long-running Pi process may still execute or lazily import from an older, now-unreferenced generation. Process inspection cannot reliably reconstruct that use.

Upstream design should acquire a generation lease before resource discovery and release it after runner shutdown/process exit. Only then can published-generation garbage collection be safe.

### Rollback

Before activation, retain outside Git:

- exact prior settings bytes, mode, and digest;
- prior selected package sources and exact generation IDs;
- new generation ID;
- activation transaction receipt.

Rollback:

1. require other settings writers to be quiescent and acquire the interoperable activation lock;
2. compare current settings digest with the activated-state digest;
3. if the digest differs, stop for owner reconciliation rather than overwriting unrelated changes;
4. use the same journaled replacement protocol to restore exact prior settings bytes and mode;
5. start a fresh Pi process;
6. verify zero extension-load errors, every mapped package’s source/baseDir, exact required resource inventory, and absence of new-generation paths.

Rollback is a conditional compare-and-swap operation, not an unconditional guarantee. Never delete the failed or previous generation. Do not promise same-process rollback after reload has invalidated the old runner.

## Verification contract

Before any live canary, prove in an isolated agent directory:

### Build and provenance

- generation source commit and input digest match the manifest;
- selected manifest/lock hashes match;
- every installed `file:` owner resolves within one generation;
- package source metadata/baseDir identifies exact generation paths;
- malformed or incomplete packages cannot be activated.

### Process behavior

- fresh process starts from G1 with zero load errors and the exact G1 resource inventory;
- settings selection moves a fresh process to only G2, with every mapped package’s `sourceInfo/baseDir` under G2 and no G1 paths;
- experimental reload moves from G1 to only G2 and passes the same zero-error, full-inventory, per-package provenance checks;
- conditional settings rollback returns a fresh process to only G1;
- a separate experimental reload rollback may be measured, but is not a supported recovery guarantee;
- active G1 behavior survives concurrent G2 materialization and installation churn;
- absence/failure in candidate G2 never changes active G1.

### Required concurrency regression

Implementation is not complete without a process-level regression:

```text
1. Start Pi from verified G1 and repeatedly invoke a G1 command/tool.
2. Concurrently materialize G2, including churn in a neighboring file: dependency.
3. Inject delay/failure before G2 publication.
4. Assert every active invocation remains G1 and succeeds.
5. Assert fresh Pi still selects G1 before activation.
6. Complete and verify G2, then select it under the settings activation protocol.
7. Assert a fresh process selects only G2 with zero load errors and the full expected inventory.
8. Experimentally reload only after an external supervisor can check the same conditions.
9. Conditionally restore the exact prior settings transaction and assert a fresh process selects only G1.
10. Assert provenance never reports a mixed G1/G2 owner graph.
```

Run every install/lockfile variant in isolated clones, worktrees, exported generations, and isolated Pi agent directories. Never delete or regenerate `node_modules` in a checkout used by live consumers.

## Realistic hardening versus unnecessary complexity

### Required for a useful first slice

- exact source snapshot separate from editable work;
- complete local dependency closure;
- install-before-activate;
- no tracked package-input mutation;
- exact generation paths in settings;
- materialization and activation locks;
- bounded provenance manifest;
- fresh-process, reload, rollback, and concurrency proof;
- retention of every published generation until host-owned leases exist.

### Defer unless a measured threat requires it

- fixed package inventories;
- full inode/mode attestation of npm/Node executables;
- complete hidden-lock-to-filesystem enumeration;
- mode-sensitive digest of every `node_modules` byte;
- a single physical copy of every peer across unrelated packages;
- nonce-bound same-process evidence protocols;
- automatic lease expiry and published-generation garbage collection;
- universal replacement of ordinary low-risk local installs;
- content-addressed deduplication across generations.

The first slice should harden the coupled or reproducibility-sensitive packages that justify it. It should not turn all local development into a deployment platform.

## Alternatives

### A. Keep loading editable local paths

Rejected for live, coupled package families. It preserves the current source/install race and weak rollback posture.

### B. Use only a mutable `current` symlink

Rejected as the primary binding. Quiescent swaps worked experimentally, but current Pi does not pin the canonical target for an entire resolution/import pass.

### C. Publish every package and install exact npm versions

Useful for released packages and naturally separates source from runtime. It does not solve atomic multi-package family activation, shared npm-root in-place update behavior, local pre-release dogfood, or current reload rollback.

### D. Generalize the existing high-assurance governed materializer unchanged

Rejected as default. Its strongest attestation and closure controls answer a narrower threat model and would impose disproportionate operational complexity on ordinary packages.

### E. Upstream-only implementation

Insufficient for near-term local hardening. Upstream is necessary for first-class npm/git generations and transactional reload, but exact local generation paths already permit a bounded consumer-side improvement.

## Staged delivery after owner acceptance

1. **Planner only:** compute selected packages, local closure, inputs, generation ID, and activation/rollback plan. No install or settings effects.
2. **Materialize only:** produce and verify an isolated generation. No Pi settings effects.
3. **Isolated fresh-process activation:** use one isolated settings scope; prove full-inventory provenance and conditional settings rollback.
4. **Concurrency and experimental reload regression:** prove active G1 survives G2 install and neighboring dependency churn, then measure externally supervised reload without treating it as transactional.
5. **One low-coupling live canary:** only under a scoped AK task and explicit activation/rollback gate.
6. **Coupled family:** only after measured value and prior rollback proof.
7. **Upstream proposal:** package-manager generations, locks, leases, validation-before-persist, and transactional reload.

## Owner decision gates

Before implementation, the repository owner must decide:

- accept or reject the minimal local generator;
- whether the first slice is planner-only or includes materialization;
- which package is the isolated canary;
- whether any live canary is authorized;
- whether to open a separate upstream Pi RFC/issue for package-loader semantics.

If accepted, create one scoped AK implementation task with explicit allowed paths and the concurrency regression as a required outcome. Do not couple that task to the accepted historical mitigation.
