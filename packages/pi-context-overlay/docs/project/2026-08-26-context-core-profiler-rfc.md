---
summary: "RFC: context-window profiler ('context core') — allocator/lifetime/warmth/cost model, session-JSONL replay, and geological visual language for pi-context-overlay."
read_when:
  - "Extending the context overlay beyond grouped lists into allocation timelines, warmth, cost accounting, or liveness."
  - "Changing scripts/context-strata-replay.mjs, context-strata-lib.mjs, context-strata-projections.mjs, or scripts/context-strata.template.html."
system4d:
  container: "Package-local RFC for context-window profiling across forensic replay and the live overlay surface."
  compass: "Keep every visual claim tied to its epistemic class; occupancy, warmth, and cost must never blur."
  engine: "Session JSONL -> allocation ledger (strata.json) -> instruments (core/thermometer/ridge/fossil/sankey/runway) -> decisions (runway, fault tradeoff, targeted GC)."
  fog: "Reference-mined deadness and estimated token splits can silently masquerade as measured truth; provider serialization order may drift from file order."
---

# RFC — Context Core: profiling the Pi context window as an allocator

Status: **P1 forensic shipped and reviewed** (replayer + visual artifact + conservation tests);
**P2 live occupancy + icicle shipped and operator-verified**; **P2.5 corpus graduate shipped**
(`packages/pi-context-corpus`, non-live). Open: geological live counterpart (warm/cold,
runway, session-history core), cross-session bedrock comparison, provider
provider-generality of warmth pricing, P3/P4. `strata.json` is a **declared cross-package
IR** (§9 contract).

Artifact (S1, 362 on-chain requests, rev 3): <https://radius.earendil.com/artifact/01m0ycwbk0frmsdf2k6a9vyyff>

## 1. Problem

`/c` shows a point-in-time grouped list: which categories hold tokens *now*. It cannot answer:

- what the window is *made of*, positionally (what sits at the top of the prompt);
- how fast the session burns window and when the next compaction ("fault") lands;
- what anything *costs* — occupancy is not cost: a 2k allocation alive for 300 requests costs
  more than a 20k allocation born at request 290;
- whether compaction helped or hurt (it frees occupancy but invalidates the entire warm cache
  prefix);
- which allocations are dead weight never referenced again, and which intents caused the spend.

## 2. Model — the window is an arena allocator with two price tiers

- **Allocation**: every message/block that enters request context (user msg, assistant text,
  thinking, toolCall, toolResult, compaction summary). Size in est-tokens, birth request, freed
  at fault/end. The system prompt + AGENTS chain is **bedrock**: resident since request 0,
  never freed.
- **Token-turns** (byte-seconds analog): `size × (freedR − birthR + 1)`. Residency is **inclusive**
  on `[birthR .. freedR]`. This is the residency bill and the honest cost axis — *area*, not height.
  Allocations born after the last billed request (final-assistant output with no follow-up) have
  zero token-turns: they were billed as output, never as later input.
- **Warmth**: provider prefix caching prices the warm prefix ~0.1× of fresh input. Warm prefix =
  longest unchanged prefix vs the previous request. Compaction, history edits, AGENTS.md edits
  re-cold everything after the mutation point.
- **Faults**: compaction = `free()` — the arena collapses to one summary allocation and the
  cache prefix is invalidated (aftershock: one expensive cold request, then re-warm).
- **Deadness**: a pathed tool allocation never referenced again (basename reference mining in
  later assistant text/thinking/args) is ghost heap. Pathless allocations (bash output) have
  *unknown* liveness and must not be counted as dead.

### Epistemic ledger (rendered as the artifact footer)

| class | claims |
|---|---|
| measured | per-request `usage` (input/output/cacheRead/cacheWrite/cost), message `id`/`parentId` links, compaction events |
| derived | active-chain walk from tail, allocation sites, warm-prefix model, dedup groups, runway slope, token-turns |
| estimated | per-item token split (chars/4; bedrock residual-calibrated at request 1) |
| inferred | deadness via reference mining (pathed tool heap only) |

### Alternatives considered (model)

- **Token-turns (area) vs occupancy (height)**: height-only accounting calls a 20k allocation
  born late worse than a 2k allocation resident for 300 requests; area is the honest residency
  bill. Chosen: token-turns. Occupancy is retained only where it is what providers enforce
  (runway vs context window).
- **Reference mining vs provider-side liveness**: no provider exposes per-allocation liveness;
  reference mining is the only available signal, at the cost of *inferred* class and
  basename ambiguity. Chosen: mining, constrained to the pathed heap, `unknown ≠ dead`.
- **Replay order vs wire order for the positional axis**: wire order is not observable from
  session JSONL; replay order is. Chosen: replay order, explicitly *derived* class (§4.1, §9
  gate), because positional instruments are still useful with the drift named.
- **Doc-level lineage vs artifact-level lineage**: measured figures detached from their
  estimator caused the 8.7% vs 19.8% confusion. Chosen: artifact-level (`meta.estimator`).

The corpus-split alternative analysis lives in
`docs/project/2026-08-26-context-core-corpus-prompt.md` ("Decisions already made").

## 3. Measured evidence (why this is not speculative)

From two real sessions replayed through the prototype (`~/.pi/agent/sessions/…`):

- **S1** (2026-05-29, provisioning): **362 on-chain requests**, 11 turns, 1 fault. Off-chain:
  2 records / 1 request / $0.00. Total **on-chain** $30.72, of which $23.94 cache-priced.
  **Cache-hit share 98.6%** of billed input. Last-request window 264k measured vs 238k estimated
  (calibration ×1.109).
- **S2** (2026-04-16, pi-extensions): **300 on-chain requests**, 0 faults. Off-chain: 15 records /
  6 requests / **$0.48** (real billed spend, not modeled as resident). On-chain $33.03, cache-hit
  93.6%. Calibration ×0.977.
- **Warmth model validates against measurement** (validated on one provider family — the
  gpt-5.x line via the Radius router — across S1/S2; generality to other providers is gated
  per §9, not claimed): model warm prefix vs measured `cacheRead`
  agrees within ~2% at request 1 and ~5–10% late-session (e.g. r=180: 112.8k model vs 123.4k
  measured; provider caches slightly more than the strict prefix-divergence model predicts).
  This means warmth is *measurable in production*, not just modeled.
- **Mined dead heap** (estimator lineage — every figure is bound to the miner that
  produced it):
  - first-cut basename miner, pre-review: **73% / —** (wrong: counted pathless bash
    output as dead; unknown ≠ dead);
  - H1-corrected basename miner (reviewed): **8.7% (S1) / 0.8% (S2)** of pathed tool
    token-turns never-referenced-again;
  - path-qualified v2 miner (shipped, `refsAfter >= birthR`, path-qualified mining):
    **19.8% (S1) / 2.0% (S2)** on the same sessions (measured via the corpus slice,
    2026-08-26).
  Basename → path-qualified tightened reference attribution (ambiguous basenames no
  longer revive), so v2 deadness is strictly larger on S1; the two figures are not
  comparable measurements of one quantity.
- **Conservation**: `sum(series[c][r]) == residentEst[r]` for every request on both real sessions
  (0 mismatches after the residency-interval fix).
- **Burn/runway**: S1 grew ~+500 est-tk/request across the final stretch; the runway gauge
  predicts the next fault request count from the slope. After a fault inside the last 10 requests
  the slope can go non-positive and the gauge reports "no measurable burn" rather than re-baselining.

## 4. Visual language — geological instruments

One aesthetic ("the core"): a session is a sediment core. The **HTML forensic artifact** reads
history from it. Live `/c` does not; it inspects the current window only.

1. **The Core (stratigraphy)** — x = provider request, y = token offset in the window, each
   allocation a colored block stacked in birth order (a replay-order memory-map, not category
   lanes; *derived* class — provider wire order is unmeasured, see §9 gate).
   Bedrock at the base; the growth edge is visible as deposition. Compaction renders as a
   **fault line** (`free()`): everything above collapses to a thin summary stratum.
   Toggle: log-y, ghost-heap desaturation, faults, warm contour.
2. **Warm contour** — amber line tracing the warm-prefix token offset per request across the
   core; the region above it is the cold tail being re-billed at full price. This is the
   *thermal metamorphism boundary* of the core.
3. **Thermometer** — measured cache-hit share (amber bars) overlaid with the model warm
   fraction (white line). Agreement = the model is trustworthy; divergence = provider is
   caching more than the model (or re-cold events).
4. **Cost ridge** — marginal $ per request, stacked warm/cold, log toggle. Faults show as
   **aftershocks**: one cold spike, then re-warm decay. This panel makes "compaction costs
   one expensive request" visible as geometry.
5. **Fossil record** — dark fraction of resident tool heap known (post-hoc) to be dead.
   Ghosts = retained-but-unreferenced allocations ranked by token-turns burned.
6. **Flow of cause (sankey)** — user intent → category, width = token-turns. Cost-per-intent
   accounting: "the one-line question at turn 4 spawned 60k token-turns of read-edit loop."
7. **Runway gauge** — resident vs context window with burn slope → predicted requests-until-fault.

Live TUI counterpart (P2 shipped): `/c` has an occupancy strip from host `ContextUsage`
`{ tokens, contextWindow, percent }` and an icicle pane of the *current* window
(category → tool/file → item). It does not replay JSONL, draw a warm contour, or plot a
second history graph — host usage has no `cacheRead`. Runway is omitted (no live snapshot
ring). Warm/cold split remains forensic-only.

## 5. What exists today (P0 prototype, post-review)

- `scripts/context-strata-lib.mjs` — pure model: JSONL parse, active `parentId` chain from
  the tail, allocation walk, liveness mining, dedup. Off-chain (abandoned-branch) records are
  accounted in `meta.excludedBranches` and never modeled as resident.
- `scripts/context-strata-projections.mjs` — conservation series, sankey, speedscope (`unit:
  "none"`), runway/ghosts, `strata.json` + CSV assembly. Split so both files sit under the
  500 LOC readability budget.
- `scripts/context-strata-replay.mjs` — CLI I/O + HTML injection. Escapes `<` in the embedded
  JSON so labels cannot terminate the `<script>` block.
- `scripts/context-strata.template.html` — seven instruments; era membership from the fault
  list (empty-summary compaction still breaks strata); bedrock wins birthR ties so it sits at
  the base; hover/zoom use the same `plotW = width − PADX − PADR` mapping as the renderer.
- `tests/context-strata-lib.test.mjs` — 24 `node:test` cases pinning conservation, warmth,
  inclusive residency across faults, empty-summary faults, branch exclusion, liveness
  boundaries, and zero-request sessions.
- `tests/context-overlay.test.ts` — 16 cases pinning the live TUI surface (occupancy strip
  null-handling, icicle, launch honesty).
- `tests/rfc-freshness.test.mjs` — rendered-vs-tree check: RFC-claimed test counts and
  §10 command paths must match the actual tree (stale status lines fail the gate).
- Corpus side (`packages/pi-context-corpus`): 24 `node:test` cases + a cross-package
  integration test that replays a synthetic session through the real overlay replayer and
  indexes the artifact it produced (executable corpus↔overlay tie).
- Published artifact rev 3: <https://radius.earendil.com/artifact/01m0ycwbk0frmsdf2k6a9vyyff>

Verification: `node --test tests/context-strata-lib.test.mjs` 15/15 (live suite 16/16);
`sum(series[c][r]) == residentEst[r]` on both real sessions
(0 mismatches); Chromium headless screenshot of the regenerated artifact (HSL green-channel
mean ~0.306, non-trivial rendered content); package `quality-gate.sh ci` green including
file-budget.

## 6. Review record (2026-08-26)

Independent review + empirical conservation check against the first-cut prototype. Fixed:

| id | finding | resolution |
|---|---|---|
| B1 | Fault-boundary off-by-one: series free-delta applied at `freedR` *before* recording `series[r]`; token-turns used half-open `[b, f)`. S1 empirically mismatched at r=362 (`sum=-545` vs `residentEst=238308`). | Inclusive `[birthR .. freedR]`; free deltas land at `freedR+1`; fossil/core predicates match. |
| B2 | File-order walk ignored `parentId`; abandoned-branch messages modeled as resident. RFC claimed the chain as measured. | Active-chain walk from tail; excluded stats reported, not modeled. S2 hid 6 phantom requests / $0.48. |
| H1 | `refsAfter` used `r > birthR`, classifying the typical read→reason mention at `r == birthR` as dead. | `r >= birthR`; creating toolCall still sits at `birthR-1` and is excluded. |
| H2 | Hover/zoom inverse divided by `rect.width − 28 − PADX` while the renderer mapped onto `w − PADX`; `PADR` unused. | Shared `plotW = width − PADX − PADR`. |
| H3 | Raw `JSON.stringify` into `<script>`: a `</script>` in any label terminates the page (XSS). | `.replaceAll("<", "\\u003c")` on the embed. |
| M1 | Era split required a non-empty summary item; empty-summary compaction never collapsed the core. | Era membership = count of faults with `f.r < birthR`. |
| M2 | Bedrock `unshift`ed into the window but `push`ed late onto `items[]`; template stacked array order so user sat below bedrock. | Per-era sort by `birthR`, system-cat wins ties. |
| L1–L3 | `import.meta.url` pathname not decoded; CSV unescaped; speedscope unit claimed milliseconds. | `fileURLToPath`; CSV field quoting; `unit: "none"`. |

P2 live TUI review (2026-08-26, independent read-only; no Ghostty `/c` proof):
ledger holds on the live path (no JSONL/strata import, no warmth/`cacheRead`, occupancy
strip honors `tokens == null`, runway omitted). High residual fixed in the follow-up
slice: a host timeout kill was treated as editor-open success and dismissed `/c`; now
`killed` is always failure, the Ghostty editor launch (`ghostty -e`) is detached and never
signalled, and the `+new-window -e` payload misuse was removed. Icicle frames are labeled
`est` so estimated shares stay distinct from measured occupancy. Medium (fixed in the same
slice): this status line and §4 intro were stale. Do not merge corpus/API into this
package or into `pi-session-insights` as-is — different IRs (`strata.json` vs
`pi.session-insights.v1`).

Live follow-up (operator-verified in Ghostty): after `/reload` + `/c`, `Enter` on a
file-backed item opens `$EDITOR`; the launch-honesty fix is confirmed on the live desktop.

## 7. Remaining debt (honest, not deferred-as-done)

Resolved in the follow-up slice:
- Basename collisions → path-qualified mining; basename hits count only when unique in-session.
- Runway after a recent fault → slope starts at `max(lastFault+1, n-11)`.
- Mixed-model cost ridge → `modelChanges` ticks + chip; still uses each request's own `$`
  (no invented global price table).
- Parent-side `dispatch_subagent` → `meta.forks` count/token-turns. Child JSONL arenas are not
  opened.

Still open:
- **Provider serialization vs file order**: y-axis is replay order, not wire order. Measured
  `cacheRead` still tracks the prefix model; `meta.warmthAgreement.mae` now reports the gap.
- **Child-arena rollup — resolved (2026-08-27)**: `context-strata-replay.mjs --children <glob>`
  attributes direct-child session costs under `meta.forks.children[]` (bounded measured
  aggregates from each child's own replay; `childrenOnChainCostUsd`; scan accounting;
  depth 1 — grandchildren link to children and are excluded). **Attribution, not modeling**:
  the parent arena is untouched (requests/series identical with/without the flag; test-pinned).
  Linkage is measured: the runtime records the parent JSONL path in each child header's
  `parentSession`; matching is exact (resolved/canonicalized), no inference, and candidate
  files come only from the operator-provided glob (no bulk session inventory). Evidence:
  `docs/project/2026-08-27-child-arena-rollup.md`.
- **Fork-spend labeling — decided (2026-08-27)**: quantities stay separated.
  `onChainCostUsd` keeps its semantics (the session's OWN on-chain spend, sum-of-reported);
  the corpus index additionally carries `childrenOnChainCostUsd`/`childrenCount` as
  already-derived fork-attribution facts; **inclusive spend (own + direct children) is
  computed at query time in the `spend` projection and is never a stored column** — with
  parents and children both indexed sessions, a stored inclusive column would break
  `sum(own)` invariance (double-counting). Test-pinned. HTTP: trigger re-checked 2026-08-27
  — no non-author consumer, jq answers in <100ms — **files-only stands**. P4 stays
  unprompted (owned by `pi-session-compaction`'s next slice; the estimator-bound deadness
  signal it would consume is already shipped). Cross-session bedrock comparison: deferred
  with a named trigger (becomes a corpus `bedrock` projection when AGENTS-chain growth is a
  real cost question).
- **Live TUI (P2 occupancy + icicle shipped)**: `/c` is a current-window inspector with a
  groups list (default) and icicle mode. Forensic ledger/JSONL still does not feed the
  overlay. Missing vs the geological live counterpart: warm/cold split, runway slope,
  session-history core.

## 8. Phases

- **P1 — forensic (done, post-review + debt slice)**: replay, artifact, chain walk, conservation
  tests, path-qualified liveness, post-fault runway, model-change ticks, parent-side forks.
  Child-arena rollup shipped 2026-08-27. Next: cross-session bedrock comparison.
- **P2 — live TUI (shipped, occupancy + icicle)**: `/c` header occupancy strip from host
  `ContextUsage` `{ tokens, contextWindow, percent }` (unknown when `tokens` is null; no
  fabricated warmth; no runway — live overlay does not keep a snapshot ring). Icicle mode
  (`Tab`/`g`/`i`) shows current-window token share at category → tool/file → item; selected
  frame drives the existing items/preview; Enter-open-file unchanged. Groups list remains
  the default. Optional `turnIndex`/`ordinal` on `ContextItem`. Forensic JSONL replay is
  not imported into the live path. Still missing vs the geological live counterpart:
  warm/cold split, runway slope, session-history core.
  Prompt: `docs/project/2026-08-26-context-core-live-tui-prompt.md`.
- **P2.5 — corpus graduate (shipped 2026-08-26)**: multi-session `corpus/index.json` +
  named jq projections over `strata.json` in a new non-live package
  `packages/pi-context-corpus`. IR unchanged, jq as the DSL, no HTTP in that slice.
  Gate green (18/18 tests at ship; corpus suite now 22 incl. the round-2 cross-check and
  schema-gate pins), proven over S1/S2; evidence:
  `packages/pi-context-corpus/docs/project/2026-08-26-corpus-slice.md`.
  Prompt: `docs/project/2026-08-26-context-core-corpus-prompt.md`.
- **P3 — decision support (calculator shipped 2026-08-26)**: `meta.compactionTradeoff`
  (additive IR; pure model in `scripts/context-strata-tradeoff.mjs`) computes fault-now vs
  continue from the session's own measured data only — warm/cold $/token from reported
  totals, observed post-fault resident size as the summary estimate, break-even requests vs
  the runway horizon. No global price table; cacheWrite pricing not modeled (open per §9).
  Licensed under the wire-order bound: output carries `warmthBound` (mae/p95/max) and flags
  `warmEstimateDegraded` when the last request sits in the discontinuity tail (Δ > 0.5).
  Corpus projection: `compaction` (strata.json input, like `topfiles`). Evidence:
  `docs/project/2026-08-26-p3-compaction-tradeoff.md`.
  AGENTS-edit re-cold warning remains **deferred**: live `/c` has no `cacheRead`, so a live
  $-estimate would fabricate warmth — needs a host surface that exposes it.
- **P4 — targeted GC**: liveness-mined compaction input for `pi-session-compaction`.
  Path-qualification unblocks advisory→actionable *for unique paths*; still advisory when
  two same-basename files are both resident.

## 9. Decisions and open questions

### Decided (post-review, 2026-08-26)

- **IR contract.** `strata.json` is a declared cross-package IR (second consumer: `pi-context-corpus`).
  Protocol: additive-only changes; owner/approver = this package via its RFC review flow;
  consumers ignore unknown fields and tolerate absent ones (pre-versioning artifacts stay
  readable); a breaking change bumps `meta.schemaVersion` (now `1`) with a migration note.
  **Consumer clause (major versions):** on a `schemaVersion` greater than the consumer's
  supported major, the consumer fails closed on facts and degrades on inventory — the
  session is listed under a distinct `unsupported` state (identity + error naming both
  majors; remedy = upgrade the consumer, not re-replay), never dropped, never fact-indexed.
  `meta.estimator` is an **open convention, not a registry**: format
  `producer:method[-version]`, owned by the producer; consumers may compare values by
  string equality for lineage attribution only — no ordering, no cross-version compatibility
  inference (estimator versions are not comparable measurements).
  Self-identity is provenance, not convenience: the overlay emits `meta.schemaVersion` and
  `meta.estimator` (binds `wasteRatio`/ghosts to the miner that produced them). Derived
  convenience fields (`gitBranch`-style labels) remain refused.
- **`meta.cwd` shipped** (2026-08-26 dogfood slice): the overlay reads the session header
  cwd (measured provenance; absent header cwd stays absent) and emits `meta.cwd`; the corpus
  surfaces it per session. Boundary rule held: measured provenance may cross into the IR,
  derived convenience never; the corpus never infers cwd from directory names.
- **Wire-order evidence gate — discharged (2026-08-26).** Measured per
  `docs/project/2026-08-26-wire-order-drift-bound.md`: 5 real sessions, 5 provider
  identities, 2851 requests. Bound: ≥90% of requests agree within 4% share divergence
  (p90 ≤ 3.9%, median ≤ 0.4%), with a discontinuity tail of 0.6%–5.7% of requests at
  near-total divergence (max ≈ 1.0 in every session); wire order itself remains unobserved
  (the instrument bounds its claim-relevant effect via warmth — `meta.warmthAgreement` now
  carries `p95`/`max`, additive). **Licensing:** P3 positional/warmth instruments are
  licensed only when they state the per-session bound and flag or exclude discontinuity-tail
  requests (Δ > 0.5); no global "replay order ≈ wire order" claim. Order-free quantities
  (token-turns, $, cacheHit, runway slope) were never gated. **Mechanism:** the gate stays
  mechanical — `tests/rfc-freshness.test.mjs` fails if a P3/decision-support prompt exists
  without a wire-order evidence note stating a measured bound.
- **Corpus HTTP posture.** Files-only stands as the current posture; "no HTTP ever" is withdrawn
  as overclaim. Staged: revisit via a short dedicated RFC only when a real non-author consumer
  needs programmatic access in practice, or corpus size makes jq scans operationally slow.
- **ADR scope and placement.** One ADR in this package's `docs/adr/`, adopting shipped scope
  only: the allocator model, epistemic ledger, live/forensic split, corpus package boundary,
  and the IR contract above. P3/P4 excluded — they get their own decisions when prompted.
  Corpus-side standing rules (index fields = identity + measured provenance + derived strata
  facts; new questions become projections) are referenced, not duplicated.
- **Standing rule (measurement versioning):** a cited measured figure must travel with the
  estimator version that produced it — now machine-checkable via `meta.estimator`, doc-level
  lineage (§3) retained for history. Future estimator changes append a lineage row.

### Open questions

- Provider serialization ordering (toolCall/result interleaving) differs from file order;
  how much does the positional y-axis drift from the true wire order? (Gated per decision above.)
- Multi-provider cost semantics (cacheWrite pricing, non-Anthropic routers; the ~0.1× warm
  tier is validated on one provider family only — same evidence gate applies).
- Is deadness-by-reference-mining actionable enough to gate compaction content, or only
  advisory? Unique-path deadness is now decidable; ambiguous-basename cases stay advisory.
- Should the replayer graduate into `pi-session-insights` (jq discipline, bounded JSON) rather
  than growing inside this package? Current answer: keep the visual/TUI carrier here, keep
  deterministic extraction importable. The multi-session layer is a **separate non-live
  package** consuming `strata.json` as its IR (never `pi.session-insights.v1` chat facts):
  `docs/project/2026-08-26-context-core-corpus-prompt.md` (shipped as
  `packages/pi-context-corpus`, 2026-08-26).
- **Proposal (from the corpus slice): emit `meta.cwd`.** `strata.json` carries no session
  cwd, so the corpus index cannot expose one. `meta.cwd` read from the session header by
  the JSONL owner is *measured provenance* (exact, one field); consumers decoding it from
  the sessions directory name would be *inferred* class. Boundary rule: measured
  provenance may cross into the IR; derived convenience (e.g. `gitBranch` as a label)
  should not. Until decided, the corpus records the operator-given session path as
  `sourceSession` and omits `cwd` entirely.
- **Standing rule (measurement versioning):** an RFC or evidence note may cite a measured
  figure only together with the estimator version that produced it. §3's dead-heap figures
  are now tagged by miner version (73% first-cut → 8.7%/0.8% H1-corrected → 19.8%/2.0%
  path-qualified v2); future estimator changes append a row rather than rewrite history.

## 10. Commands

```bash
# forensic replay: strata.json, requests.csv, speedscope.json, context-strata.html
node scripts/context-strata-replay.mjs <session.jsonl> [--out DIR] [--window 200000]
# model tests (24) + live TUI tests (16) + freshness/P3 gates
node --test tests/context-strata-lib.test.mjs tests/context-overlay.test.ts tests/rfc-freshness.test.mjs
# corpus side: see packages/pi-context-corpus/README.md (index/project CLI + 20-test suite)
```
