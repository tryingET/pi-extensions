---
summary: "Child-arena rollup shipped: direct-child session costs attributed to a parent replay via measured parentSession links; arenas never merged; verified bit-identical against an independent child replay."
read_when:
  - "Extending --children rollup, meta.forks children data, or deciding whether the corpus surfaces fork costs."
system4d:
  container: "Overlay-debt slice closing the fork-cost attribution gap in the forensic replayer."
  compass: "Attribution, not modeling: each session is its own arena; measured links only; operator-provided candidates."
  engine: "operator glob -> exact parentSession match -> child's own replay aggregates -> meta.forks.children (depth 1)."
  fog: "Merging arenas (type error), inferring linkage from directory names, or bulk session inventory."
---

# Child-arena rollup — 2026-08-27

Closes the RFC §7 debt item: `--data-agnt-*` child sessions were counted parent-side
(`meta.forks.count`) but their real cost was invisible.

## Design (boundary held)

- **Attribution, not modeling.** A child's tokens/cost never enter the parent window.
  With/without `--children`, the parent's `requests`/`series`/`residentEst` are identical
  (test-pinned). Each session remains its own arena — merging them would be the type error
  the RFC has refused since P1.
- **Measured linkage.** The runtime records the parent session's absolute JSONL path in each
  child header's `parentSession`. Matching is exact on the resolved/canonicalized path; no
  inference from directory names; unmatched candidates are counted, never listed (they are
  other sessions' children).
- **No bulk inventory.** Candidate files come only from the operator-provided
  `--children <glob>`.
- **Depth 1.** Grandchildren link to children, not to this session, and are excluded
  (test-pinned; confirmed live: a real grandchild was scanned and unmatched).

Emitted (additive, IR v1): `meta.forks.children[]` — `{id, file, cwd, requests, turns,
faults, costTotal, cacheHit, inputTokens, cacheReadTokens}` — plus
`childrenOnChainCostUsd`, `childrenScan {scanned, matched, unreadable, unmatched}`,
`childrenDepth: 1`.

## Verification

- **Unit pins (24 model tests, +2)**: exact-link match, grandchild/stranger exclusion,
  unreadable/empty candidates counted-not-crashed, parent-arena invariance (deepEqual on
  requests+series with children attached).
- **Dogfood (real fork pair)**: parent = rocs-cli session `2026-07-26T21-07-45…019fa041`
  (3946 requests, 23 faults, $764.84 on-chain), child =
  `--data-agnt-tmp-pi-output-edquot-containment--/2026-07-27T17-08-52…019fa48d`.
  Scan of 40 candidate `--data-agnt-*` files: **1 matched** (the direct child), 39
  unmatched (incl. the real grandchild `…17-16-43…019fa494`, correctly excluded).
- **Independent verification**: the child was also replayed *directly* in a separate
  output dir; all 7 rollup aggregates are **bit-identical** (requests 3847, turns 56,
  faults 22, costTotal 743.8820920000013, cacheHit 0.9760653477918521, inputTokens
  19,253,572, cacheReadTokens 785,168,896).

## Finding worth flagging

For this pair, the single direct child cost **$743.88 on-chain vs the parent's own
$764.84** — a ~49% of total fleet spend that was previously invisible to any per-session
view. Parent-side `meta.forks.count` alone (13 forks in the S1 dogfood earlier) never
carried this. Fork cost is not a rounding error; it is a first-class spend line.

## Open question (recorded, not decided here)

Whether the corpus index surfaces `childrenOnChainCostUsd`. It is an already-derived strata
fact, so the standing rule permits it — but it changes what "spend" means (parent-only vs
parent+direct-children), a labeling decision with real misreading risk. Needs an explicit
decision before the index grows the field (candidates: a separate `forkSpend` projection, or
an explicit dual column labeled by class).
