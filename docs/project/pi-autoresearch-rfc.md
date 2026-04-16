---
summary: "RFC for a governed pi-autoresearch capability in the pi-extensions monorepo: keep the operator affordance, but route authority through AK, Prompt Vault, ROCS, and explicit package seams."
read_when:
  - "Before creating implementation tasks or package scaffolding for a pi-autoresearch-derived capability."
  - "When deciding the authority split and package shape for a governed experiment-loop capability in pi-extensions."
system4d:
  container: "Root-level RFC for a future pi-autoresearch-derived package or package family."
  compass: "Preserve the useful operator affordance while preventing a second control plane from forming inside the monorepo."
  engine: "Restate the problem -> choose the package/authority shape -> define the first bounded slices -> make non-goals explicit."
  fog: "The main risks are importing the upstream prototype wholesale, overfitting the design to one current owner, or replacing operator ergonomics with governance-heavy indirection."
---

# RFC — governed pi-autoresearch capability for `pi-extensions`

## Status

Proposed.

This RFC is the next document after:

- [pi-autoresearch integration analysis](./pi-autoresearch-integration-analysis.md)
- [pi-autoresearch problem description](./pi-autoresearch-problem-description.md)

It is intentionally a **root-level boundary and authority RFC**, not an implementation plan for one package directory yet.

---

## A) Decision in one sentence

`pi-extensions` should adopt the **pi-autoresearch capability** as a new **governed experiment-loop package** that preserves the `/autoresearch` operator affordance and the best upstream local mechanics, while routing authority through **AK**, **Prompt Vault**, **ROCS/ontology**, and explicit package seams instead of importing the upstream monolith wholesale.

---

## B) What this RFC is deciding

This RFC decides:

1. the canonical package shape
2. the authority split
3. what stays local receipt/projection vs canonical truth
4. the minimum required integrations with AK, Prompt Vault, and ontology
5. the first bounded implementation slices

This RFC does **not** yet decide:

- the final code layout inside the package
- the exact Prompt Vault template texts
- the exact ontology ids
- the final UI rendering details
- the full canary or release surface

---

## C) Problem this RFC answers

We want the capability proven by upstream `pi-autoresearch`:

- setup a benchmarked optimization campaign
- run iterative experiments
- track primary and secondary metrics
- keep improvements, discard regressions
- preserve run history across context/session resets
- finalize noisy search into reviewable changes

But we do **not** want to import upstream architecture debt:

- monolithic ownership
- local files as sole authority
- broad git mutation defaults
- package-local skill text as the primary control plane
- a separate runtime-lifecycle plane from the rest of the ecosystem

So the real design question is:

> how do we preserve the useful operator affordance while keeping the capability truthful to current system boundaries?

---

## D) Chosen package shape

## Decision

Create a **new package-local capability** under:

- **preferred package path:** `packages/pi-autoresearch`

### Why keep the `pi-autoresearch` name?

- it preserves the recognizable operator concept from upstream
- it keeps `/autoresearch` as the obvious command surface
- it avoids unnecessary translation overhead between upstream research and local implementation

### Interpretation rule

The package name stays `pi-autoresearch`, but the architecture should be described internally as a:

> **governed experiment-loop capability**

That means the name preserves operator ergonomics while the design remains explicit about authority and boundaries.

---

## E) Authority split

## Decision

The capability must be split across existing authority planes like this.

### 1. `packages/pi-autoresearch` owns

This new package should own only the **local experiment-loop runtime surface**:

- `/autoresearch` operator entry point
- package-owned tools for experiment execution and logging
- metric parsing protocol
- benchmark/check script conventions
- local receipt/projection files
- minimal package-local widget / dashboard behavior
- package-local finalization helpers where they are directly tied to the experiment receipt model

This package should **not** claim ownership of broader execution truth, prompt truth, or ontology truth.

### 2. AK owns

AK should own **campaign/task truth**:

- campaign identity
- allowed scope
- lifecycle state
- bounded result/evidence references
- follow-up work created from experiment outputs

Interpretation:
- the experiment loop may keep a local receipt stream
- the campaign itself should be truthfully representable as AK-backed work

### 3. Prompt Vault owns

Prompt Vault should own the **durable control-plane prompts** for the capability, especially where behavior should remain reviewable, evolvable, and reusable across sessions.

At minimum that means templates for:

- experiment setup
- next-hypothesis selection
- finalize/grouping guidance
- stop / continue / re-baseline routing

### 4. ROCS / ontology own

Ontology should own the **governed semantics** of the capability:

- session
- run
- metric
- hypothesis
- benchmark script
- evidence artifact
- finalization group / kept change group

### 5. `pi-autonomous-session-control` owns adjacent runtime-lifecycle concerns

This RFC does **not** declare ASC the direct owner of the experiment-loop package.
But it **does** require that `pi-autoresearch` not invent a separate long-lived runtime-control plane where existing ASC-owned lifecycle patterns should be reused or aligned.

Interpretation:
- package-local experiment execution is fine
- package-local autonomy/resume behavior must be evaluated against current ASC seams before it grows into a second runtime regime

### 6. `pi-society-orchestrator` remains optional higher-order coordinator

Orchestrator is **not** the first owner of the local experiment loop.
It may later coordinate:

- campaign-level routing
- multi-phase cognition around experiments
- cross-subagent decomposition
- evidence/crystallization follow-through

But this is explicitly later than the first package-local capability.

### 7. Shared UX packages remain shared UX owners

Use these package seams instead of recreating their roles inside `pi-autoresearch`:

- `pi-interaction` for picker/trigger-style setup or review flows
- `pi-activity-strip` for coarse live experiment telemetry across sessions
- `pi-context-overlay` for deeper run-history/context inspection

---

## F) What remains local vs canonical

## Decision

Keep a local append-only run log, but treat it as **projection/receipt**, not sole authority.

### Local package-owned state

The package may keep repo-local files such as:

- `autoresearch.jsonl`
- `autoresearch.md`
- `autoresearch.sh`
- `autoresearch.checks.sh`
- `autoresearch.ideas.md`

But their role changes.

### New interpretation

#### Local files are for:

- low-friction operator use
- resume after compaction/restart
- local visualization/export
- run-by-run experimental memory
- bridging noisy search into later finalization

#### Local files are not for:

- sole campaign authority
- replacing AK task truth
- replacing Prompt Vault prompt truth
- replacing ontology concepts

### Why this split is chosen

This preserves the best part of upstream ergonomics without allowing local scratch artifacts to quietly become the whole system.

---

## G) First-class upstream mechanics to preserve

The following upstream mechanics are adopted as part of the target capability.

### 1. Structured metric protocol

Adopt the `METRIC name=value` style protocol or a strictly equivalent form.

Reason:
- simple
- extensible
- domain-agnostic
- easy to parse and log

### 2. Benchmark/check split

Keep a hard distinction between:

- benchmark measurement
- correctness backpressure / checks

Reason:
- prevents correctness gating from polluting the primary optimization metric
- keeps tradeoffs legible

### 3. Append-only run receipt stream

Keep a JSONL run stream as the package-local receipt/projection surface.

### 4. Noise-aware confidence signal

Keep a package-level confidence/noise model so the loop can distinguish likely real gains from jitter.

### 5. Finalization path

Keep the idea that noisy search should be finalizable into bounded review artifacts.

---

## H) Things explicitly rejected from upstream as-is

This RFC rejects the following as direct carryover behavior.

### 1. Wholesale monolith import

Rejected because it collapses too many owners into one file/package.

### 2. Local files as sole authority

Rejected because it conflicts with AK, Prompt Vault, and ontology truth.

### 3. Broad git defaults

Rejected behaviors include unbounded equivalents of:

- `git add -A`
- broad revert/clean across the whole working tree

without explicit scope mediation.

### 4. Package-local prompt policy as the primary control plane

Rejected because it does not fit the monorepo’s Prompt Vault direction.

### 5. Unreviewed second lifecycle plane

Rejected because it risks overlapping with current ASC/orchestrator runtime responsibilities.

---

## I) V1 shape

## Decision

V1 should be a **bounded, package-local experiment runtime** with explicit integrations, not a full ecosystem takeover.

### V1 must include

- `/autoresearch` command surface or equivalent
- package-owned experiment run tool(s)
- package-owned log tool(s)
- structured metric parsing
- benchmark/check split
- local JSONL receipt stream
- basic live status surface
- explicit AK binding model
- explicit Prompt Vault template inventory
- explicit ontology concept inventory
- safer-than-upstream git behavior

### V1 may include

- simple dashboard/export
- lightweight finalization helper
- package-local prompt files as temporary shims where Prompt Vault template work is not landed yet

### V1 must not require

- cross-repo orchestration
- distributed benchmarking
- full execution-graph lineage
- full shared-UI integration in every direction
- orchestrator ownership of the first slice

---

## J) Git-safety policy

## Decision

The package may automate git actions, but only through a **narrower safety contract** than upstream.

### Required direction

Before broad autonomous mode is considered done, the package must move toward:

- repo-relative scope awareness
- protection of out-of-scope files
- safer keep/discard mechanics than whole-tree revert/clean
- explicit finalization approval steps

### Explicit anti-goal

Do **not** reproduce upstream whole-tree git mutation defaults unchanged and call them “good enough for now.”

This is one of the main architectural risks the re-envisioning effort is meant to eliminate.

---

## K) Prompt Vault contract

## Decision

Prompt Vault should become the durable control plane for the capability.

### Minimum template set

The first useful template inventory is:

1. **experiment-setup**
   - define objective, benchmark, scope, constraints, metrics, and checks
2. **experiment-next-hypothesis**
   - choose the next move from recent run history and ASI
3. **experiment-finalize**
   - group retained runs into reviewable change sets
4. **experiment-state-router**
   - decide whether to continue, stop, re-baseline, or finalize

### Why this is required

Without this, the capability’s real control plane will still live in bundled skill prose or package-local behavior text.
That would be a step backward from the current monorepo direction.

### Important note

This RFC does **not** claim the current governed Prompt Vault vocabulary is already sufficient for these exact templates.
If vocabulary expansion is needed, that should be surfaced explicitly rather than hidden in ad hoc inserts.

---

## L) Ontology contract

## Decision

A truthful first ontology inventory should exist before the capability is considered architecturally stable.

### Minimum concept set

At minimum, model concepts equivalent to:

- experiment session
- experiment run
- benchmark metric
- optimization hypothesis
- benchmark script
- correctness check
- experiment receipt
- kept change group / finalization group

### Why this is required

Without this, later work on:

- evidence
- search
- reporting
- orchestration
- learning capture

will remain ad hoc and file-name dependent.

This RFC does not yet fix the exact ontology ids. It fixes the requirement that the concepts exist.

---

## M) Live UX contract

## Decision

The package should keep a small package-local status surface, but should not become the long-term owner of all experiment-related UX.

### Package-local UX that is acceptable

- minimal widget or status line
- lightweight dashboard or export for local use
- package-owned review/finalization surface where directly coupled to the receipt model

### Shared UX integrations that should be pursued

- publish coarse state to `pi-activity-strip`
- expose deeper run/context inspection via `pi-context-overlay`
- use `pi-interaction` for picker-style setup or approval steps when useful

### Why this split is chosen

It keeps the capability ergonomic immediately while preventing gradual reinvention of shared UX planes inside one new package.

---

## N) First bounded implementation slices

## Decision

Implement in this order.

### Slice 1 — package/boundary concept note to code handoff

Use this RFC as the boundary lock and create the first implementation-facing note if needed.

### Slice 2 — ontology seed

Create the first repo-local `pi-extensions/ontology/` concept set for experiment-loop semantics, with explicit promotion criteria for later company/core adoption.

### Slice 3 — Prompt Vault seed

Draft the initial Prompt Vault templates and, if needed, surface any governed vocabulary gaps explicitly.

### Slice 4 — package scaffold

Scaffold `packages/pi-autoresearch` with:

- package README
- extension entrypoint
- minimal tool surface
- minimal local receipt model
- validation surface

### Slice 5 — bounded runtime kernel

Implement:

- benchmark execution
- structured metric parsing
- checks execution
- JSONL receipt append
- baseline/confidence calculation

without yet claiming the full autonomous-loop ceiling.

### Slice 6 — AK binding

Bind campaign identity and scope truthfully through AK.

### Slice 7 — safer finalization and git path

Port finalization ideas and narrower git-safety mechanics.

### Slice 8 — shared UX integration

Attach live telemetry and deeper inspection through shared packages.

---

## O) Alternatives considered

## Alternative 1 — import upstream wholesale

Rejected.

Why:
- fastest path technically
- worst path architecturally
- creates a second control plane

## Alternative 2 — leave capability in contrib only

Rejected as the main path.

Why:
- preserves the reference prototype
- but leaves the ecosystem without the capability we now know we want

This remains useful as a fallback posture, not as the chosen architecture.

## Alternative 3 — make orchestrator the first owner

Rejected for V1.

Why:
- local experiment-loop ergonomics should land package-locally first
- orchestrator should not become the first owner of a capability whose core is still repo-local benchmark execution

## Alternative 4 — make ASC the sole owner immediately

Rejected for V1.

Why:
- the capability still needs a package-local experiment domain surface
- forcing it entirely into ASC too early would distort ASC’s current charter

The correct rule is alignment/reuse of adjacent lifecycle semantics, not immediate ownership collapse.

---

## P) Success criteria for this RFC

This RFC is successful if later work results in a capability where:

- `/autoresearch` remains obvious and useful to operators
- local receipts exist but are not mistaken for sole authority
- AK truthfully represents campaigns
- Prompt Vault truthfully represents control prompts
- ontology truthfully represents experiment semantics
- package boundaries stay explicit
- git behavior is safer than upstream defaults
- future extensions of the capability do not require reopening the import-vs-re-envision argument

---

## Q) Immediate follow-on tasks implied by this RFC

1. draft the ontology concept inventory
2. draft the Prompt Vault template inventory
3. scaffold `packages/pi-autoresearch`
4. define the AK binding surface for campaigns and scope
5. define the first safe git-mutation contract for keep/discard/finalize

---

## R) Bottom line

This RFC chooses a clear direction:

> **build `pi-autoresearch` as a governed experiment-loop capability inside the ecosystem, not as a copied standalone monolith**

That preserves the best upstream idea while keeping the monorepo truthful to the authority and package seams it already depends on.
