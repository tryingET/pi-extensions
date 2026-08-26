---
summary: "RFC: context-window profiler ('context core') — allocator/lifetime/warmth/cost model, session-JSONL replay, and geological visual language for pi-context-overlay."
read_when:
  - "Extending the context overlay beyond grouped lists into allocation timelines, warmth, cost accounting, or liveness."
  - "Changing scripts/context-strata-replay.mjs or scripts/context-strata.template.html."
system4d:
  container: "Package-local RFC for context-window profiling across forensic replay and the live overlay surface."
  compass: "Keep every visual claim tied to its epistemic class; occupancy, warmth, and cost must never blur."
  engine: "Session JSONL -> allocation ledger (strata.json) -> instruments (core/thermometer/ridge/fossil/sankey/runway) -> decisions (runway, fault tradeoff, targeted GC)."
  fog: "Reference-mined deadness and estimated token splits can silently masquerade as measured truth; provider serialization order may drift from file order."
---

# RFC — Context Core: profiling the Pi context window as an allocator

Status: **prototype shipped** (replayer + visual artifact + evidence below); adoption into the live
overlay is the open decision.

Artifact (real session, 363 requests): <https://radius.earendil.com/artifact/01m0ycwbk0frmsdf2k6a9vyyff>

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
- **Token-turns** (byte-seconds analog): `size × requests-alive`. This is the residency bill and
  the honest cost axis — *area*, not height.
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
| measured | per-request `usage` (input/output/cacheRead/cacheWrite/cost), message `id`/`parentId` chain, compaction events |
| derived | allocation sites, warm-prefix model, dedup groups, runway slope, token-turns |
| estimated | per-item token split (chars/4; bedrock residual-calibrated at request 1) |
| inferred | deadness via reference mining (pathed tool heap only) |

## 3. Measured evidence (why this is not speculative)

From two real sessions replayed through the prototype (`~/.pi/agent/sessions/…`):

- **S1** (2026-05-29, provisioning): 363 requests, 12 turns, 1 fault. Total $30.72, of which
  $23.94 cache-priced. **Cache-hit share 98.6%** of billed input tokens. Last-request window
  264k measured vs 238k estimated (calibration ×1.109).
- **S2** (2026-04-16, pi-extensions): 306 requests, 26 turns, 0 faults. Total $33.51, cache-hit
  93.6%. Calibration ×0.922.
- **Warmth model validates against measurement**: model warm prefix vs measured `cacheRead`
  agrees within ~2% at request 1 and ~5–10% late-session (e.g. r=180: 112.8k model vs 123.4k
  measured; provider caches slightly more than the strict prefix-divergence model predicts).
  This means warmth is *measurable in production*, not just modeled.
- **Mined dead heap**: 9.1% (S1) / 0.8% (S2) of pathed tool token-turns are provably
  never-referenced-again. (First cut claimed 73% by wrongly counting pathless bash output as
  dead; unknown ≠ dead.)
- **Burn/runway**: S1 grew ~+500 est-tk/request across the final stretch; the runway gauge
  predicts the next fault request count from the slope.

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

## 5. What exists today (P0 prototype)

- `scripts/context-strata-replay.mjs` — session JSONL → `strata.json` + `requests.csv` +
  `speedscope.json` (sampled format; per-request window-composition stacks) + generated HTML.
  No dependencies. Handles zero-fault and single-fault sessions; unknown roles → `other`.
- `scripts/context-strata.template.html` — self-contained canvas artifact implementing all
  seven instruments above (hover crosshair + tooltip, drag-zoom on x, dblclick reset, toggles).
- Published artifact: <https://radius.earendil.com/artifact/01m0ycwbk0frmsdf2k6a9vyyff>

Verification performed: `node --check` on replayer and generated script; headless DOM-stub
execution (3712 draw calls, no crash); Chromium headless screenshot of the real artifact
(non-trivial rendered content confirmed via pixel statistics).

## 6. Phases

- **P1 — forensic (done, prototype)**: replay + artifact above. Next: multi-fault/branch-chain
  sessions (parentId tree, not just linear), subagent arenas (`--data-agnt-*` sessions as
  separate arenas with fork-cost attribution), cross-session bedrock comparison.
- **P2 — live TUI**: icicle pane in `/c` from the existing classifier items (add
  position/turn fields), warm/cold split + runway in the header from `ctx` usage.
- **P3 — decision support**: compaction tradeoff calculator (fault now vs continue:
  Δoccupancy gain vs re-cold cost over re-warm horizon), AGENTS-edit re-cold warning
  ("this edit re-colds N tokens ≈ $X on the next request").
- **P4 — targeted GC**: liveness-mined compaction input for `pi-session-compaction`
  (drop measured-dead, keep referenced working set; compaction fidelity score =
  fraction of later-referenced entities surviving the summary).

## 7. Open questions

- Provider serialization ordering (toolCall/result interleaving) differs from file order;
  how much does the positional y-axis drift from the true wire order? (Measured cacheRead
  suggests prefix identity holds well enough to model.)
- Multi-provider cost semantics (cacheWrite pricing, non-Anthropic routers) — the cost ridge
  needs per-provider price tables or normalization to "relative cold units".
- Is deadness-by-reference-mining actionable enough to gate compaction content, or only
  advisory?
- Should the replayer graduate into `pi-session-insights` (jq discipline, bounded JSON) rather
  than growing inside this package? Current answer: keep the visual/TUI carrier here, keep
  deterministic extraction importable.

## 8. Commands

```bash
node scripts/context-strata-replay.mjs <session.jsonl> [--out DIR] [--window 200000]
# outputs: strata.json, requests.csv, speedscope.json, context-strata.html (open in browser)
```
