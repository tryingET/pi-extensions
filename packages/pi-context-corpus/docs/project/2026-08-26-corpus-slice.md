---
summary: "Evidence note for the P2.5 corpus slice: package scaffold, gate results, and two-real-session corpus proof."
read_when:
  - "Extending pi-context-corpus or verifying what the first slice shipped."
system4d:
  container: "Slice evidence for the non-live corpus package."
  compass: "Gate green + real-session corpus + content-free outputs proven, HTTP explicitly deferred."
  engine: "Scaffold -> implement -> fixture-pin -> gate -> real-session replay -> record."
  fog: "Index drift from the strata IR or quiet null-to-zero laundering."
---

# Corpus slice (P2.5) — 2026-08-26

Prompt: `packages/pi-context-overlay/docs/project/2026-08-26-context-core-corpus-prompt.md`
RFC: `packages/pi-context-overlay/docs/project/2026-08-26-context-core-profiler-rfc.md` (§8 P2.5, §9)

## Shipped

- `bin/corpus.mjs` — `index <corpusDir> [--sessions <glob>] [--replay-script <path>]`
  and `project <name> [file]`; fail-closed argument handling.
- `lib/corpus-index.mjs` — discovery (skips `node_modules`/generated `corpus`),
  classification (`ok` / `empty` / `failed`, listed never dropped), derived facts
  sourced only from strata `meta`.
- `lib/corpus-html.mjs` — static self-contained switcher; embeds the index JSON
  with `<` escaped to `\u003c` like the overlay template.
- `lib/batch.mjs` — optional orchestration shelling out to the overlay replay
  with an explicit `--out` (never system `/tmp`); failed replays stay listed.
- `projections/corpus.jq` — named filters `occupancy`, `faults`, `spend`,
  `ghosts`, `runway`, `sessions`, `topfiles`; dispatch pinned to
  `jq -f projections/corpus.jq --arg p <name>`; unknown names fail closed with
  the listing.
- 16 `node:test` cases pinning: exact index entries, every projection (exact
  JSON equality), secret-marker content-freedom, HTML links/escaping, CLI
  fail-closed paths, batch orchestration via a stub replay, discovery skips.

## Gate evidence

`bash scripts/quality-gate.sh ci` (package root, 2026-08-26): local-package-links
ok (0 links), structure validation passed (non-live contract), file-budget ok,
biome clean, `node --test` 16/16, packaging correctly skipped (private,
`releaseConfigMode=none`).

## Real-session proof (RFC S1/S2)

Batch-replayed the two RFC sessions through the overlay replay script and
indexed them (scratch corpus under `$TMPDIR`):

| session | requests | turns | faults | on-chain $ | cache hit | model |
|---|---|---|---|---|---|---|
| S2 2026-04-16 pi-extensions | 300 | 22 | 0 | 33.030037 | 93.6% | gpt-5.4 |
| S1 2026-05-29 provisioning | 362 | 11 | 1 (lastFaultR 361) | 30.719365 | 98.6% | gpt-5.5 |

Matches the RFC §3 measured facts. S1 `lastResidentEst` 238,296 est (RFC: 238k
est vs 264k measured); runway `null` after the late fault ("no measurable burn"),
preserved as null rather than coerced.

Note: `ghostShareOfToolTokenTurns` (S1 19.8%, S2 2.0%) reflects the overlay's
current path-qualified mining, not the RFC §3 first-cut numbers (8.7%/0.8%) —
the corpus consumes `meta.wasteRatio` as emitted.

## Open questions (for the RFC §9)

- `strata.json` carries no session `cwd`; the index omits the field. Proposed
  overlay-side change (filed in the overlay RFC §9): emit `meta.cwd` from the
  session header in `context-strata-replay.mjs` / lib. Do not fork the schema
  from here, and never decode `cwd` from the sessions directory name (inferred
  class posing as measured).
- Read-only HTTP layer over the corpus: **explicitly deferred** (separate
  decision); no agent-loop verification is claimed.
- Child-arena (`--data-agnt-*`) rollup remains overlay debt; not opened here.

## Follow-up (same day, post adjudication)

Three decisions applied from the `many-of-the-greats` adjudication of these
questions:

1. **Measured provenance may cross into data; derived convenience never.**
   `meta.cwd` proposal filed with the overlay (§9). Meanwhile batch mode records
   the operator-given session path verbatim as `sourceSession` (the corpus
   measuring its own input — not JSONL parsing, not directory-name inference).
2. **Measurement versioning.** Overlay RFC §3 dead-heap figures now carry their
   estimator lineage (73% first-cut → 8.7%/0.8% H1-corrected → 19.8%/2.0%
   path-qualified v2) instead of silently disagreeing with the shipped miner.
   Standing rule recorded in the overlay RFC §9: cited measurements must name
   the estimator version that produced them.
3. **The switcher stays inert.** No client-side sort/filter (nullable numeric
   fields make naive interactivity an epistemics hazard). One concession, at
   build time in tested code: rows are ordered on-chain `$` descending, failed
   sessions last, ties by id.

A gap surfaced during the real-session re-proof and was fixed in the same
slice: incremental batch runs were dropping provenance recorded by earlier
   runs (a second `index --sessions` rebuilt the index with only its own
   `sourceSession` values). The CLI now carries forward previously recorded
   session provenance from the existing `corpus/index.json`; this run's own
   batch results win over the prior index. Pinned by test.

Tests: 18/18 (added ordering, `sourceSession`, and incremental-provenance
   pins). Gate re-run green; re-proven over S1/S2 with both `sourceSession`
   values persisted across two incremental batch runs and cost-descending row
   order verified.

## Review round 2 (post-RFC-review, 2026-08-26)

An architecture review (3 lenses; verdict: revise before ADR) forced five
questions; they were adjudicated (many-of-the-greats) and resolved:

1. **IR contract declared** (was implicit): `strata.json` is a cross-package IR,
   additive-only, owned by the overlay. Overlay now emits `meta.schemaVersion: 1`
   and `meta.estimator` (self-identity provenance; binds `wasteRatio` to its
   miner). Corpus ignores unknown fields, tolerates absence — pinned by
   `tests/corpus-cross-check.test.mjs`, which also replays a synthetic session
   through the **real** overlay replayer and indexes its artifact (the executable
   corpus↔overlay tie the review demanded; hand-authored fixtures alone could not
   detect IR drift).
2. **Wire-order gate for P3**: no positional claims until drift is measured
   (≥3 sessions, ≥2 providers); order-free quantities exempt.
3. **HTTP posture**: files-only stands; "no HTTP ever" withdrawn as overclaim —
   staged with explicit triggers (real non-author consumer, or jq scans slow).
4. **ADR scope/placement**: one ADR in the overlay `docs/adr/`, shipped scope
   only; P3/P4 excluded.
5. **Mechanical honesty fixes in the overlay RFC**: status line, §5 test counts
   (15 model / 16 live / 20 corpus), §10 commands, §4.1 "true memory-map" →
   replay-order (derived class), §2 alternatives-considered; plus
   `tests/rfc-freshness.test.mjs`, a rendered-vs-tree check that fails the gate
   when RFC-claimed counts/paths drift from the tree.

Corpus suite: 20/20 (18 prior + cross-check + legacy-tolerance). Gates green in
both packages.

## Review round 3 (ADR conditions, 2026-08-26)

Round 2 approved the RFC as ADR basis with conditions; the four forced questions
were adjudicated (many-of-the-greats) and resolved:

1. **Newer schema major → `replayStatus: "unsupported"`** (three-layer synthesis:
  fail closed on facts, degrade on inventory, precise state). Listed with identity +
  error naming both majors (remedy = upgrade, not re-replay); terminal sort position
  alongside `failed`; fact projections (`spend`/`occupancy`/`ghosts`/`runway`) include
  only `ok`/`empty`; the inventory projection (`sessions`) keeps it visible. Identity
  for unsupported artifacts is consumer-side (directory path) — their contents are not
  trusted for identity. Pinned by fixture `sessions/unsupported/` (schemaVersion 2).
2. **`meta.estimator` is an open convention, not a registry**: `producer:method[-version]`,
  producer-owned, compared by string equality for lineage only; no ordering semantics.
3. **Warmth adopted evidence-bound** in the ADR: model + validation method with a
  measured one-family bound; the general pricing claim stays gated (RFC §3 now tags
  the scope inline).
4. **Wire-order gate is mechanical**: owner = the overlay package; a P3/decision-support
  prompt cannot exist in `docs/project/` without a wire-order evidence note stating a
  measured bound — `tests/rfc-freshness.test.mjs` fails CI otherwise.

Also: unknown-additive-field tolerance pinned (fixture `sessions/additive/`, exact
entry-key contract); ADR written at
`packages/pi-context-overlay/docs/adr/2026-08-26-context-core-allocator-model-and-strata-ir.md`
(shipped scope only; P3/P4 excluded; cross-refs this package's AGENTS/README by name).

Corpus suite: 22/22. Freshness gates: 5/5. Both package gates green.
