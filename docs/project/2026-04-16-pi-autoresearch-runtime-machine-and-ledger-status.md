---
summary: "Umbrella status note for the pi-autoresearch XState runtime and append-only event-ledger wave."
read_when:
  - "You need the shortest truthful answer to what AK umbrella task #1469 actually landed."
  - "Before claiming pi-autoresearch now has a package-local machine + event-ledger runtime surface."
type: "reference"
system4d:
  container: "Repo-root umbrella closure note for the pi-autoresearch runtime-machine and event-ledger wave in the pi-extensions monorepo."
  compass: "State exactly what the XState + ledger wave implemented without pretending AK binding or Prompt Vault runtime decisions already exist."
  engine: "Map child-task outputs -> summarize the landed package/runtime surfaces -> name what remains outside this umbrella."
  fog: "The main risk is over-claiming local runtime projections as durable campaign truth or implying the broader autonomous loop is already implemented."
---

# 2026-04-16 — `pi-autoresearch` runtime machine and event-ledger status

## Why this note exists

AK umbrella task `#1469` — `[UMBRELLA] Implement pi-autoresearch XState domain runtime and event ledger` — depended on three narrower slices:

- `#1470` — add the XState campaign machine and typed event model
- `#1471` — add the append-only event ledger and replay/projector helpers
- `#1472` — integrate the bounded runtime kernel and extension surfaces with the machine + ledger

Those child tasks are now landed.
This note closes the umbrella by stating the smallest truthful current answer to:

- what the package can now do that it could not do before
- how receipts, machine state, and event-ledger projection now relate
- what still remains outside this umbrella

## What is now real

## 1. The package now has an explicit executable runtime machine

`packages/pi-autoresearch` now includes a package-local XState campaign machine and typed event model:

- `packages/pi-autoresearch/src/machine/campaign.ts`
- `packages/pi-autoresearch/src/machine/events.ts`

This means the bounded runtime is no longer only an implicit flow spread across helper functions.
The package now has an explicit domain runtime surface for states such as:

- segment unconfigured
- ready
- running benchmark
- running checks
- recording receipt
- awaiting decision
- rebaseline needed
- finalize candidate
- blocked
- completed

## 2. The bounded runtime now keeps an append-only event ledger

The package now includes an append-only local event ledger:

- `packages/pi-autoresearch/src/core/ledger.ts`
- local artifact: `autoresearch.events.jsonl`

This ledger records machine/event entries separately from the existing receipt log.
It supports:

- JSONL append/load helpers
- typed event parsing
- replay/projector behavior through the campaign machine
- rejection reporting for invalid or out-of-order replayed events

Interpretation rule:
- the event ledger is a **package-local runtime projection surface**
- it is useful for replay, inspection, and runtime truth inside the package seam
- it is still **not** durable campaign truth in the AK sense

## 3. Runtime status now integrates receipt summaries with machine/ledger projection

The bounded runtime status surface now combines:

- receipt-derived segment summaries
- machine state projection
- projection source reporting (`ledger` vs `receipt_fallback`)
- ledger replay counts / replay issues / sync issues

This is now visible through:

- `/autoresearch`
- `autoresearch_runtime_status`
- `autoresearch_runtime_run`

The package therefore has a more truthful answer to:

- what state the bounded runtime machine is in
- whether that projection comes from the aligned event ledger or a bounded receipt fallback
- whether the local ledger is stale, missing, or replay-problematic

## 4. Bounded run execution now emits both receipts and machine events

The bounded run tool now does more than append config/run receipts.
It now also:

- initializes or backfills the current-segment event ledger when needed
- appends `CONFIGURE_SEGMENT` when bootstrapping/reconfiguring
- appends `START_RUN`
- appends benchmark success/failure events
- appends checks success/failure events when checks run
- appends `RECEIPT_RECORDED`
- appends the current bounded iterate bridge after one-shot run completion

This means the live bounded runtime path is now actually wired through the machine + ledger seam rather than merely documenting that such a seam should exist later.

## 5. Reconfigure and mixed-history handling are now bounded explicitly

This umbrella also landed bounded handling for cases that would otherwise quietly drift:

- reconfiguring the segment resets machine-facing current-segment state instead of carrying old run aggregates forward
- existing receipt-only history can backfill the event ledger for the current segment
- runtime status can fall back to receipt projection when the ledger is missing or stale
- status surfaces now expose projection source / sync issues instead of pretending the local ledger is always perfectly aligned

## Authority snapshot after the umbrella

| Concern | Current truthful owner | Why |
|---|---|---|
| Executable experiment-loop machine state and transitions | `packages/pi-autoresearch` | This is package-local runtime behavior |
| Append-only machine/event replay surface | `packages/pi-autoresearch` local event ledger | Useful runtime projection and inspection surface inside the package seam |
| Append-only config/run receipt surface | `packages/pi-autoresearch` local receipt log | Useful local run/segment projection surface |
| Durable campaign identity, scope, and evidence/result truth | AK | Still the durable campaign-truth owner |
| Durable setup / next-hypothesis / finalize prompt procedures | Prompt Vault | Still the durable decision-procedure owner |

## What this umbrella does **not** mean

This umbrella should **not** be read as having implemented:

- AK campaign binding inside the live runtime
- machine-invoked Prompt Vault decision procedures
- an operator-facing decision surface richer than the current bounded iterate bridge
- autonomous resume / loop lifecycle
- safer finalization branch orchestration
- a claim that local receipts or the local event ledger replace AK campaign truth

The umbrella is complete as a **package-local runtime-machine + event-ledger wave**, not as the full governed `pi-autoresearch` control plane.

## Child-task mapping

| Task | Commit | Landed surface |
|---|---|---|
| `#1470` | `195c0ee` | XState campaign machine + typed event model + tests |
| `#1471` | `9698794` | append-only event ledger + replay/projector helpers + tests |
| `#1472` | `c49ef56` | runtime/extension integration, backfill, projection-source reporting, updated tests/docs |

## Verification for umbrella closure

The umbrella was closed by:

1. verifying all three dependency tasks were completed
2. confirming the package now exposes the machine + ledger integration through the live bounded runtime surfaces
3. re-running package validation for `packages/pi-autoresearch`
4. recording this umbrella closure note so the current boundary is explicit

## Bottom line

`#1469` is complete when read as the bounded runtime implementation wave that gave `pi-autoresearch`:

- a package-local XState domain machine
- a typed campaign event model
- an append-only local event ledger
- bounded replay/projector behavior
- live integration of the current runtime surfaces with that machine + ledger seam

What still comes next is not “implement the local runtime machine.”
That is now landed.
What still comes next is the broader control-plane work above it:

- AK binding
- machine-invoked Prompt Vault decision steps
- safer finalization
- deeper operator/autonomy lifecycle integration
