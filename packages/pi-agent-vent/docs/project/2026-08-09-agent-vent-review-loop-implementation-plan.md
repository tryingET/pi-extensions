---
summary: "Bounded implementation plan for Phase 1 of the accepted agent_vent review-to-owner-outcome architecture."
read_when:
  - "Planning or implementing decision 116 Phase 1."
  - "Changing agent_vent snapshot identity, legacy initialization, shared locking, or pull-based cadence."
system4d:
  container: "Post-ADR execution plan for the first local-only implementation slice."
  compass: "Prove snapshot freshness and cadence before adding approval, handoff, or outcome machinery."
  engine: "Extract pure modules -> test canonical identity/migration/locking -> add read-only cadence -> live isolated dogfood."
  fog: "An accepted broad architecture can accidentally authorize later phases or unrelated refactoring."
---

# Implementation plan — `agent_vent` review loop Phase 1

Status: **post-ADR plan for AK decision 116; no implementation performed by this artifact**.

Governing ADR: [adopt the review-to-owner-outcome loop](../adr/2026-08-09-agent-vent-review-to-owner-outcome-loop.md).

## Objective

Implement only the local Phase 1 foundation:

```text
canonical snapshot identity
+ explicit legacy initialization
+ shared mutation lock
+ needs_rereview projection
+ pull-based review cadence
```

Do not implement host approval, handoff events, owner adapters, usefulness events, startup nudges, automatic capture, or owner-system mutation.

## Proposed module boundaries

Avoid expanding the brownfield oversized `src/vent-store.js` and `extensions/agent-vent.ts` with all new logic.

Proposed pure/support modules:

- `src/snapshot-manifest.js`
  - canonical record projection;
  - RFC 8785-compatible deterministic serialization;
  - SHA-256 digests;
  - immutable legacy identity baseline plus stable lineage/occurrence/generation projection;
  - reconstruction from baseline and authoritative identity-bearing records/curation events;
  - `needs_rereview` derivation.
- `src/review-cadence.js`
  - `effectiveDueAt` computation;
  - deterministic status/reason projection using an injected clock;
  - unique-generation cohort projection.
- `src/agent-vent-state-lock.js`
  - shared concurrency lock for vent append, local disposition, curation, snapshot/due events, retention, and later approval;
  - stale-lock behavior aligned with existing local safeguards;
  - no claim that a lock alone makes multi-file writes crash-atomic.
- `src/snapshot-initialization.js`
  - read-only initialization/rebuild preview;
  - exact source hashes/high-water marks and confirmation token;
  - atomic temporary-file, file fsync, rename, and parent-directory fsync where supported;
  - idempotent completed-state validation and fail-closed mismatch handling;
  - explicit `projection_rebuild_required` recovery when source and projection markers diverge.

The extension should remain an adapter: schema/command parsing, cancellation, calls into pure modules, and authority-safe output.

## Work slices

### Slice 1 — executable contracts and fixtures

- define versioned snapshot, identity-manifest, and queue-due event schemas;
- define authoritative identity fields on new vent records and lineage relations on new curation events;
- define canonical record fields and serialization vectors;
- add fixtures for duplicate ids, identical content, changed content, malformed timestamps, curation, archive, and restore;
- define file/line size and symlink rules for new local files.

### Slice 2 — shared lock and crash-boundary extraction

- extract one concurrency lock helper without changing existing record/retention behavior;
- route vent append, `set_review`, curation, and retention mutations through it;
- preserve stale-lock recovery and failure propagation;
- define authoritative source events versus rebuildable snapshot/cadence projections;
- stamp projections with exact source hashes/high-water marks;
- inject crashes after every source/projection write boundary and prove stale/partial projections are never consumed.

### Slice 3 — snapshot identity and legacy initialization

- implement pure canonicalization/digest logic;
- implement stable lineage and occurrence identity;
- atomically create the immutable legacy identity baseline without rewriting old records;
- persist identity directly in every new record and required lineage relation in every new curation event;
- add `/agent_vent snapshot init preview` as a no-write command;
- add confirmation-gated `snapshot init apply` only through the human-visible command surface;
- define token retry precisely: matching completed manifest returns idempotent `already_initialized`; unchanged source after a pre-rename crash may retry; changed/wrong source or conflicting manifest rejects;
- return `snapshot_initialization_required` while identity is absent and `projection_rebuild_required` when markers diverge;
- preserve historical identity across archive/restore and rebuild current projection explicitly.
- prove complete loss of rebuildable snapshot/cadence sidecars can reconstruct byte-identical lineage, occurrence, generation, and snapshot digests from the baseline plus authoritative events;
- fail closed for owner recovery if the immutable legacy baseline itself is missing or corrupt.

### Slice 4 — freshness projection

- derive generation changes from record content, membership, and curation digests;
- preserve historical local disposition separately;
- expose `needs_rereview` without adding a manually set state;
- ensure new generations use generation-specific `eligibleAt`;
- refuse snapshot/cadence consumption when source markers do not match.

### Slice 5 — read-only cadence

- add `cadence` and `review due` command/tool read actions;
- implement deterministic precedence: clear, overdue, due, current;
- persist/derive time, critical, and queue-size due facts under the shared lock, with source markers and explicit rebuild on crash drift;
- show candidate incidents as advisory priority only;
- expose exact reason codes and authority boundaries;
- create no startup hook or notification.

### Slice 6 — integration and live proof

- run focused and full package tests;
- reinstall `pi-agent-vent` locally;
- use isolated `PI_AGENT_VENT_DIR` to prove migration and failure paths;
- use a fresh Pi session to prove cadence reads are no-write and toolbox activation remains on demand;
- verify active operator store and review states remain unchanged during isolated dogfood.

## Compatibility and migration

- Existing records remain source data and are never rewritten by initialization.
- The immutable legacy identity baseline is authoritative for pre-Phase-1 occurrences; new records and curation events carry their own identity/lineage facts.
- Existing review, curation, and retention files remain readable.
- Initialization creates a versioned sidecar manifest only after explicit preview/confirmation.
- Missing initialization is a visible status, not an implicit migration.
- Existing `set_review` semantics remain local disposition; Phase 1 changes wording/projection, not owner authority.
- Unknown future schema versions fail closed.
- Read paths never repair implicitly; stale projection markers return exact preview/apply recovery commands.

## Task decomposition guidance

Create one scoped AK execution task for Phase 1 after this plan and the validation artifact are attached. Suggested required paths:

- `packages/pi-agent-vent/src/snapshot-manifest.js`
- `packages/pi-agent-vent/src/review-cadence.js`
- `packages/pi-agent-vent/src/agent-vent-state-lock.js`
- `packages/pi-agent-vent/src/snapshot-initialization.js`
- focused tests and command adapter files selected by implementation discovery.

Keep Phase 2+ out of the task scope. If SCI/implementation discovery shows a different minimal module split, revise the task scope and plan before coding.

## Completion contract

Phase 1 is complete only when:

- all validation gates in the companion artifact pass;
- read-only cadence writes no local state;
- explicit initialization is atomic/idempotent and preserves legacy records;
- shared lock coverage includes every current snapshot/disposition-affecting mutation;
- archive/restore identity and duplicate-id behavior are proven;
- fresh-session Pi dogfood confirms the installed behavior;
- no host approval, handoff, owner receipt, usefulness, startup notification, or owner-system code has landed.
