---
summary: "Compact project model with explicit project-purpose framing."
read_when:
  - "Aligning project purpose, strategy, and delivery behavior."
system4d:
  container: "Project-level concepts and boundaries for this package."
  compass: "Translate the context-core corpus purpose into executable outcomes."
  engine: "Purpose -> mission -> vision -> slices, each pinned by fixtures and gates."
  fog: "Scope drift into session runtimes or secret warehouses."
---

# Project foundation model

## Purpose

Make multi-session context-core evidence agent-feedable: an operator or agent
should be able to ask "which sessions exist, what did they cost, where are the
faults and dead weight" over a directory of `strata.json` artifacts — without
re-reading any session JSONL.

## Mission / vision

A thin, deterministic, content-free corpus layer: one index
(`corpus/index.json`), one jq DSL file (`projections/corpus.jq`), one static
switcher (`corpus/index.html`). No server, no second session runtime, no new
IR. See [README](../../README.md) for the current contract.

## Scope boundary

- **In scope**: indexing strata artifacts (however produced), optional batch
  orchestration by shelling out to the overlay replay, named jq projections,
  the static HTML switcher.
- **Out of scope**: session JSONL parsing/replay semantics, the `strata.json`
  shape, live Pi surfaces, HTTP/agent-loop serving (explicitly deferred),
  cross-session cost modeling beyond sum-of-reported.
- **Organization purpose** lives at org level: [Organization operating model](../org/operating_model.md).

## Values / ethics

Epistemic honesty: every number inherits its strata epistemic class; `null`
stays `null`; failed sessions are listed, never dropped; message content never
enters a corpus output.
