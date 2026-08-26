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

Status: **prototype shipped and reviewed** (replayer + visual artifact + 11 invariant tests);
adoption into the live overlay is the open decision.

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

## 3. Measured evidence (why this is not speculative)

From two real sessions replayed through the prototype (`~/.pi/agent/sessions/…`):

- **S1** (2026-05-29, provisioning): **362 on-chain requests**, 11 turns, 1 fault. Off-chain:
  2 records / 1 request / $0.00. Total **on-chain** $30.72, of which $23.94 cache-priced.
  **Cache-hit share 98.6%** of billed input. Last-request window 264k measured vs 238k estimated
  (calibration ×1.109).
- **S2** (2026-04-16, pi-extensions): **300 on-chain requests**, 0 faults. Off-chain: 15 records /
  6 requests / **$0.48** (real billed spend, not modeled as resident). On-chain $33.03, cache-hit
  93.6%. Calibration ×0.977.
- **Warmth model validates against measurement**: model warm prefix vs measured `cacheRead`
  agrees within ~2% at request 1 and ~5–10% late-session (e.g. r=180: 112.8k model vs 123.4k
  measured; provider caches slightly more than the strict prefix-divergence model predicts).
  This means warmth is *measurable in production*, not just modeled.
- **Mined dead heap**: 8.7% (S1) / 0.8% (S2) of pathed tool token-turns are never-referenced-again.
  (First cut claimed 73% by counting pathless bash output as dead; unknown ≠ dead.)
- **Conservation**: `sum(series[c][r]) == residentEst[r]` for every request on both real sessions
  (0 mismatches after the residency-interval fix).
- **Burn/runway**: S1 grew ~+500 est-tk/request across the final stretch; the runway gauge
  predicts the next fault request count from the slope. After a fault inside the last 10 requests
  the slope can go non-positive and the gauge reports "no measurable burn" rather than re-baselining.

## 4. Visual language — geological instruments

One aesthetic ("the core"): a session is a sediment core; the overlay reads history from it.

1. **The Core (stratigraphy)** — x = provider request, y = token offset in the window, each
   allocation a colored block stacked in birth order (true memory-map, not category lanes).
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

Live TUI counterpart (not yet built): the same allocation model feeds an icicle pane inside
`/c` (width = token share, depth = category→tool→file taxonomy), plus a two-line strip in the
overlay header: occupancy bar + warm/cold split + runway estimate.

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
- `tests/context-strata-lib.test.mjs` — 11 `node:test` cases pinning conservation, warmth,
  inclusive residency across faults, empty-summary faults, branch exclusion, liveness
  boundaries, and zero-request sessions.
- Published artifact rev 3: <https://radius.earendil.com/artifact/01m0ycwbk0frmsdf2k6a9vyyff>

Verification: `node --test` 11/11; `sum(series[c][r]) == residentEst[r]` on both real sessions
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
- **Child-arena rollup**: `--data-agnt-*` session files are not joined as fork-cost children.
- **Live TUI**: `/c` is still a grouped list. The ledger does not yet feed the overlay.
  Prompt: `docs/project/2026-08-26-context-core-live-tui-prompt.md`.

## 8. Phases

- **P1 — forensic (done, post-review + debt slice)**: replay, artifact, chain walk, conservation
  tests, path-qualified liveness, post-fault runway, model-change ticks, parent-side forks.
  Next: child-arena rollup, cross-session bedrock comparison.
- **P2 — live TUI**: see the paste-ready prompt in
  `docs/project/2026-08-26-context-core-live-tui-prompt.md`.
- **P3 — decision support**: compaction tradeoff calculator (fault now vs continue:
  Δoccupancy gain vs re-cold cost over re-warm horizon), AGENTS-edit re-cold warning
  ("this edit re-colds N tokens ≈ $X on the next request").
- **P4 — targeted GC**: liveness-mined compaction input for `pi-session-compaction`.
  Path-qualification unblocks advisory→actionable *for unique paths*; still advisory when
  two same-basename files are both resident.

## 9. Open questions

- Provider serialization ordering (toolCall/result interleaving) differs from file order;
  how much does the positional y-axis drift from the true wire order?
- Multi-provider cost semantics (cacheWrite pricing, non-Anthropic routers).
- Is deadness-by-reference-mining actionable enough to gate compaction content, or only
  advisory? Unique-path deadness is now decidable; ambiguous-basename cases stay advisory.
- Should the replayer graduate into `pi-session-insights` (jq discipline, bounded JSON) rather
  than growing inside this package? Current answer: keep the visual/TUI carrier here, keep
  deterministic extraction importable.

## 10. Commands

```bash
node scripts/context-strata-replay.mjs <session.jsonl> [--out DIR] [--window 200000]
# outputs: strata.json, requests.csv, speedscope.json, context-strata.html (open in browser)
node --test tests/context-strata-lib.test.mjs
```
