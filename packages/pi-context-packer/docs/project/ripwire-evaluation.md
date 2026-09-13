---
summary: "Frozen ripwire retrieval evaluation, reproducible execution, and the separate automatic-adoption gate."
read_when:
  - "Running the ripwire comparison or deciding whether default activation is justified."
system4d:
  container: "Offline study over approved public source corpora."
  compass: "Measure actual retrieval without claiming unobserved agent outcomes."
  engine: "Freeze questions -> verify source -> execute both arms -> retain every result."
  fog: "A search proxy or fixture success does not establish end-to-end agent benefit."
---

# Ripwire evaluation v1

`npm run evaluate:ripwire -- --manifest FILE --manifest-sha256 SHA --roots ROOTS_JSON --output-dir NEW_EXTERNAL_DIRECTORY`

The shipped `scripts/fixtures/ripwire-study-v1.json` contains 30 developer-authored questions across three source-pinned repositories, with distinct questions and gold targets chosen by source inspection before running the candidate. They are a fixed initial pilot, not independently authored labels or a standardized public benchmark. Aider is a **target source corpus**, not a provider or competing Aider-agent arm. No retired backend is invoked.

`ROOTS_JSON` maps each manifest repository ID to `{ "root": "/canonical/source/path", "revision": "40-character-commit" }`. Supply source snapshots from the declared revisions. The runner verifies each gold file's SHA-256 and records the observed approved-corpus identity. A declared revision plus these checks is not full independent Git-tree attestation.

## What runs

Both arms use the same approved code corpus. `literal_reference` ranks files by unique query-token presence in path and contents, with stable path ties. It is deliberately labelled a deterministic search proxy, **not a simulation of Pi's adaptive search/read workflow**. Ripwire uses the real explicit `context_pack` call with its current 12-symbol discovery cap and a 24,000-byte final packet ceiling. File metrics deduplicate rendered locations before taking the top ten; the candidate's symbol cap can reduce distinct file coverage. No hidden pre-budget candidate is counted.

The reference's timer measures ranking over already-read content. The candidate timer includes corpus acquisition, binary verification and subprocess execution. These are cost attributions, not a fair wall-time speed contest. Cache is disabled. Selected source and output scope are checked; every recorded failure remains a miss. Source-byte provenance is rechecked after the run. Writes are confined to private temporary copies and the new external evidence directory.

The runner saves a preregistration receipt before queries, raw bounded request/results with digests, complete per-case records and `results.json`. Existing output directories are refused. Results distinguish `experimentValid` from `adoptionEligible`; **this instrument always leaves adoption ineligible** because it cannot observe actual model behavior, task correctness, fallback calls or real token usage.

## Independent replication and model pilot

Run from the exact candidate artifact or clean checkout with the approved ripwire binary and frozen manifest hash. Preserve that candidate's package digest, the manifest/protocol digests, observed corpus digests, runtime profile, all cases, and failed runs. A verifier should establish source identity independently and inspect raw evidence rather than trust summary Booleans. Implementer-run isolated re-execution is not independent authorship.

Before automatic activation, separately run paired Pi tasks with the same model, initial messages, repository revision, permissions and budget. One arm uses the remaining packer plus ordinary read/search; the other adds ripwire. Count complete model-visible packets, actual provider tokens, fallback reads and repeated context. Verify task correctness with blinded expectations where practical. A model choosing not to invoke ripwire must remain an observed candidate outcome, not an exclusion.

Predeclared promotion targets: no critical correctness/safety regression; comparable paired completion quality; at least 20% lower median context-acquisition tokens at comparable correctness; warm p95 at most two seconds on a declared reference profile. A small or inconclusive sample remains opt-in. Do not turn absence of model-pilot evidence into a passing skip. The packaged RW-08 dogfood scenario validates the evaluator contract with synthetic records and does not stand in for the 30-case run.
