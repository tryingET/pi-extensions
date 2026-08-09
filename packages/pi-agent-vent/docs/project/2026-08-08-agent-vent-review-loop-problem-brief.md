---
summary: "Problem brief for closing the agent_vent review-to-owner-outcome loop without automatic capture or authority drift."
read_when:
  - "Opening or reviewing the AK decision for agent_vent cadence, handoff receipts, or usefulness measurement."
  - "Determining why the existing local diagnostic inbox is not yet an AI Society feedback loop."
type: "reference"
system4d:
  container: "Tier-1 problem framing for the local diagnostic review-to-owner-outcome gap."
  compass: "Close the review loop without automatic capture or authority drift."
  engine: "Evidence -> decision request -> reviewed RFC -> owner-gated implementation."
  fog: "Technical availability can be mistaken for an operating feedback loop."
---

# Problem brief — close the `agent_vent` review-to-outcome loop

Status: **problem framing for an architecture-significant AK decision; not implementation authority**.

## Trigger

`pi-agent-vent` is installed and technically integrated with ASC/`self` and toolbox, but the operational loop stops at a local diagnostic inbox:

```text
candidate -> preview/record -> local recurrence group -> mostly unreviewed queue
```

The current product can review, draft, export, and retain local diagnostic groups. It does not establish a visible review cadence, prove human approval, retain canonical owner receipts, or measure whether review produced a useful dismissal, owner action, fix, or learning.

## Observed evidence

The bounded [usage-loop evidence spike](2026-08-08-agent-vent-usage-loop-evidence-spike.md) observed:

- six records and six singleton recurrence groups;
- five groups in local state `new` and one `acknowledged`;
- no candidate incidents, curation, escalation draft, or retention activity;
- repeated successful explicit `self -> toolbox -> preview -> record` paths;
- no evidence that automatic capture is the correct next intervention.

The evidence therefore identifies review value and owner follow-through—not capture volume—as the unresolved product question.

## Why this is Tier 1

The proposed solution may introduce:

- a durable recurrence-snapshot identity contract;
- operator-origin and approval semantics;
- cross-owner handoff envelopes and canonical receipt pointers;
- a shared mutation-lock domain across local diagnostic stores;
- society-facing usefulness and verified-effect cohorts;
- optional Pi startup attention behavior or owner adapters.

Those changes affect authority boundaries, default workflow behavior, and architecture-significant packet/contracts. They require the canonical AK decision lifecycle before implementation.

## Decision requested

Decide whether to adopt the staged design in [the review/handoff/outcome-loop RFC](2026-08-08-agent-vent-review-handoff-outcome-loop-design.md):

1. canonical snapshot freshness plus pull-based cadence;
2. host-verified or owner-surface approval;
3. separate local intent, unverified references, and owner-verified receipts;
4. denominator-explicit local and verified-effect measurement;
5. owner-specific adapters only through later gated canaries.

## Non-goals

- automatic vent capture;
- direct owner-system writers in the first slice;
- treating local JSONL, Pi session state, or command-path markers as canonical evidence or human identity;
- silently dispositioning the current local queue;
- automatic AK, GitHub, incident, KES, Prompt Vault, ROCS, publication, or telemetry mutation.

## Success condition

The decision succeeds only if it enables a bounded, testable review-to-outcome loop while preserving these facts:

- local diagnostics remain advisory;
- human/owner approval is not inferred from forgeable local state;
- owner systems remain canonical for their artifacts and effects;
- unknown outcomes remain unknown;
- review usefulness is measured by explicit cohorts rather than record or escalation volume.
