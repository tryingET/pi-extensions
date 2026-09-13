---
summary: "Reproduction and evidence index for the 2026-07-25 source-list and SCI source-selection adoption experiment."
read_when:
  - "Reproducing or independently reviewing the source-selection adoption benchmark."
  - "Deciding whether source-list automatic invocation is justified."
type: "reference"
system4d:
  container: "Frozen source-selection adoption experiment evidence bundle."
  compass: "Measure provider value without self-authorizing production wiring."
  engine: "Review cases -> retain owner evidence -> freeze input -> rank once -> independently decide."
  fog: "Mutable inputs, ranking leakage, or self-consistent receipts can masquerade as adoption proof."
---

# Source-selection adoption experiment — 2026-07-25 v2

## Authority and decision posture

This directory is the durable, package-owned evidence bundle for AK-4173 and FCOS coordination item `context-packer-source-selection-adoption`.

The owner decision is **REFINE the evidence program while REJECTING automatic source-list invocation and production wiring**. The one frozen ranking was independently reviewed and failed the required unnecessary-selection reduction gate. See `docs/project/2026-07-25-source-selection-adoption-decision.md`.

FCOS coordinates cross-owner meaning only. Agent Scripts owns `source-list.v1`; SCI owns `semantic-code-intelligence.structural_evidence_receipt.v1`; pi-context-packer owns consumer ranking, budgeting, metrics, and adoption interpretation; AK owns task/evidence lineage.

## Frozen population

| Repository | Frozen commit | Cases | Metadata coverage | Source-list eligible |
|---|---|---:|---:|---|
| agent-scripts | `36792de9195c86e6e8ae521efb5c952492278088` | 10 | 43/43 (100%) | yes |
| engineering-core | `f084fcc4981339893c302e13c8266313233a0e2b` | 10 | 38/42 (90.48%) | yes |
| DSPx | `cc21bc7e04ec15241b5fc86f0cc3863d0fd19a27` | 10 | 515/559 (92.13%) | yes |
| pi-extensions | `e67b1071dbdd2c8139da60432fb019d8dd991597` | 10 | 195/1064 (18.33%) | no; honest control |

Each repository has 10 unique normalized intents and 10 unique canonical truth target sets. All cases were reviewed before ranking. The pi-extensions cohort remains visible but cannot contribute positive source-list or fusion evidence.

## Pre-ranking review

Case/truth review ACCEPT receipts:

- agent-scripts: `dispatch-1784965442566`
- engineering-core: `dispatch-1784965442566-1`
- DSPx: `dispatch-1784965442567`
- pi-extensions: `dispatch-1784965442568`

Metadata-staleness sample review ACCEPT receipts, all with `stalePaths=[]`:

- agent-scripts: `dispatch-1784967045475`
- engineering-core: `dispatch-1784967045476`
- DSPx: `dispatch-1784967045476-1`
- pi-extensions: `dispatch-1784967045477`

See `pre-ranking-review.md`. No reviewer generated or inspected rankings before the prepared input was frozen.

## Prepared evidence

The experiment is self-contained: `canonical-case-source.generated.json` retains the exact reviewed case-source bytes and preparation rejects any digest mismatch. It does not read an external temporary case file.

`source-selection-ablation-input.json.gz` embeds:

- exact raw source-list output and raw SHA-256;
- exact Git index stage evidence and source-list preparation observations;
- independently reviewed metadata-staleness samples;
- frozen questions, truth, identities, and budgets;
- 40 actual SCI Phase-B requests and complete receipts;
- raw request, receipt, stdout, stderr, process, state, and transcript evidence;
- executable versions, revisions, paths, and hashes;
- clean target before/after state, unchanged Git indexes, absent `.ontology`, process-group termination, and cleanup observations set true only after each producer temp root was removed and checked absent.

`preparation-summary.generated.json` additionally retains every source-list and SCI invocation's actual monotonic duration, exact raw byte counts, and explicit `ceil(bytes/4)` approximate token-cost estimates. `sci-file-access-traces.tar.gz` is a deterministic tar/gzip bundle of 40 raw `strace -f -e trace=%file` traces plus their subject argv and analysis. The traces fail preparation on `.ontology` or known SCI index/state path access. This is bounded file-access corroboration, not authentication. Git `.git/index` reads from producer Git cleanliness checks and preparation-harness stage evidence are identified separately and are not called SCI semantic-index reads.

The preparation scripts validate the complete object through the landed consumer while discarding the evaluator return without retaining, printing, or inspecting rankings.

Current frozen input hashes are recorded in `preparation-summary.generated.json` and `SHA256SUMS`.

## Reproduction

Preparation requires the exact source repositories and producer executables named in `experiment-config.mjs`:

```bash
node prepare-and-run.mjs prepare
```

Preparation is intentionally separate from ranking. Ranking requires the explicit gate:

```bash
node prepare-and-run.mjs run --execute-ranking
```

The run mode:

1. strictly parses the complete approved `SHA256SUMS` allowlist and rejects malformed, duplicate, unexpected, missing, non-regular, or hash-mismatched entries;
2. verifies every allowlisted artifact before reading the summary or gzip, including the relative external preregistration path and the canonical case source;
3. binds the summary's preregistration and gzip hashes to that verified manifest;
4. decompresses the immutable prepared input into a temporary path;
5. computes its raw SHA-256;
6. invokes `scripts/run-source-selection-experiment.mjs` once;
7. refuses an existing result path; and
8. records the result without changing the prepared input.

After ranking, regenerate `SHA256SUMS`, perform independent result review, and write the owner decision. Changed questions, truth, repositories, producer receipts, budgets, or prepared bytes define a new experiment.

## Adoption gates

The current gates live in `docs/project/2026-07-12-source-list-sci-ablation-preregistration.md`. In summary:

- at least three independent repositories at ≥60% coverage;
- ≥10 distinct reviewed cases per repository;
- identical universes and budgets;
- source-list equal-repository macro precision delta ≥0.10;
- unnecessary-selection/read proxy reduction ≥20%, calculated exactly as `(pathsMacroUnnecessary - sourceListMacroUnnecessary) / pathsMacroUnnecessary` with a strictly positive paths baseline; a zero baseline is **not demonstrated**;
- no target-omission increase;
- independently reviewed metadata staleness;
- actual separate SCI comparison with fail-closed availability;
- latency, byte/token, executable, trust, and maintenance-cost disclosure;
- independent post-ranking owner review.

Passing metrics do not self-authorize wiring. An `ADOPT` result creates a separate implementation task.

## Result and decision

The one exact result is `source-selection-ablation-results.generated.json`, SHA-256 `5421fd6a29329263f9922b7e2ce4eac20a010434c7cd04c6d2630df641c6b275`.

On the 3-repository / 30-case eligible population:

- precision: 0.338333 → 0.445000, delta +0.106667 — PASS;
- unnecessary selections per case: 2.700000 → 2.266667, reduction 16.0494% — **FAIL** versus 20%;
- omissions per case: 0.733333 → 0.300000 — PASS.

The independent post-ranking review `scoutpeer-ms0bhtu6-52277a97` recommends **REFINE** with automatic invocation still rejected. Structural and fusion diagnostics cannot substitute for the failed source-list gate. No production-wiring task is authorized.

## Files

- `canonical-case-source.generated.json` — exact checksummed reviewed case-source JSON; the only preparation case input.
- `cases-pre-ranking.generated.json` — reviewed case and identity projection.
- `pre-ranking-review.md` — case and metadata-staleness review receipts.
- `source-selection-ablation-input.json.gz` — immutable prepared input containing retained raw evidence.
- `preparation-summary.generated.json` — per-invocation durations, bytes/token estimates, preparation and producer-observation summary without rankings.
- `sci-file-access-traces.tar.gz` — deterministic compressed raw strace bundle and trace manifest.
- `prepare-and-run.mjs` and support modules — bounded preparation/run reproduction.
- `source-selection-ablation-results.generated.json` — generated exactly once after the execution gate.
- `independent-review.md` — post-ranking review.
- `SHA256SUMS.pre-run` — exact strict pre-run allowlist used by the one execution.
- `SHA256SUMS` — final evidence manifest including the result, reviews, and owner decision.

## Non-authorizations

Executable hashing does not bind every transitive library or kernel component; strace cannot authenticate the producer or prove absence of every hidden state channel; traced timings include instrumentation overhead; and `ceil(bytes/4)` is not a model tokenizer. Known SCI state-path classifications require maintenance as SCI evolves.

This evidence bundle does not authenticate producers, make metadata recommendations, transfer provider semantics, authorize repository-wide indexing, permit `.ontology` creation, mutate source owners, or decide adoption without owner review.
