---
summary: "Accepted package-level decision for the context-core allocator model, epistemic ledger, live/forensic split, corpus package boundary, and the declared strata.json IR contract."
status: accepted
read_when:
  - "You need the adopted architectural contract behind context-strata replay, the /c overlay, or the pi-context-corpus package."
  - "You are changing strata.json shape, the corpus boundary, or any context-core instrument."
  - "You need the durable decision after the RFC/review chain closed (two review rounds, 2026-08-26)."
system4d:
  container: "Package-local ADR for pi-context-overlay context-core architecture and the strata.json IR."
  compass: "Every claim carries its epistemic class; measured provenance may cross package boundaries, derived convenience never."
  engine: "allocator model -> epistemic ledger -> forensic replay + live TUI split -> corpus consumer -> declared IR contract."
  fog: "Silent laundering: estimates as measurements, unknown as dead, null as zero, unsupported majors as facts."
---

# ADR — Context Core: allocator model, epistemic ledger, and the strata.json IR contract

## Status

Accepted as the package-level architectural contract for `pi-context-overlay` and its
artifact consumer `pi-context-corpus`, following the RFC
(`docs/project/2026-08-26-context-core-profiler-rfc.md`) and two independent review
rounds (2026-08-26). This ADR adopts **shipped scope only**; P3 (decision support)
and P4 (targeted GC) are excluded and require their own decisions when prompted.

## Context

`/c` shows a point-in-time grouped list. It cannot answer what the window is made of
positionally, how fast the session burns window, what anything costs (occupancy ≠ cost),
whether compaction helped or hurt, or which allocations are dead weight. Two real
sessions (S1: 362 requests / 1 fault / $30.72 on-chain; S2: 300 / 0 / $33.03) validated
the model against measurement: conservation identity held at every request (0 mismatches),
and the warm-prefix model tracked measured `cacheRead` within ~2% early and ~5–10%
late-session.

## Decision

1. **The window is modeled as an arena allocator with two price tiers.** Every
   message/block entering request context is an allocation (size in est-tokens, birth
   request, freed at fault/end); the system prompt + AGENTS chain is bedrock. Compaction
   is `free()` (a fault) that collapses the arena to one summary allocation and
   re-colds the cache prefix. Provider prefix caching is the second price tier (~0.1×
   warm prefix).
2. **Cost is area, not height.** Token-turns = `size × (freedR − birthR + 1)`, inclusive
   residency. This is the honest residency bill and the default cost axis.
3. **Every claim carries an epistemic class** (measured / derived / estimated /
   inferred), rendered in artifacts and preserved through every downstream consumer.
   Nulls stay null; unknown liveness is not dead; failed reads are listed, never dropped.
4. **Live and forensic surfaces are separate.** The forensic path replays session JSONL
   into `strata.json` and the HTML core artifact. The live `/c` path reads only host
   `ContextUsage` — no JSONL, no strata import, no fabricated warmth, no runway (no live
   snapshot ring). Each surface states only what its data class supports.
5. **The multi-session layer is a separate, deliberately non-live package** —
   `packages/pi-context-corpus` — consuming `strata.json` artifacts, never overlay code,
   never session JSONL. Its IR is `strata.json`; its query DSL is jq; its switcher is
   inert (build-time ordering only). Cross-package standing rules live in
   `packages/pi-context-corpus/AGENTS.md` and `packages/pi-context-corpus/README.md`
   (index fields = identity + measured provenance + derived strata facts only; new
   questions become named projections, never columns or widgets).
6. **`strata.json` is a declared cross-package IR.**
   - Additive-only changes; owner/approver = this package via its RFC review flow.
   - Artifacts self-describe: `meta.schemaVersion` (currently `1`) and `meta.estimator`
     (format `producer:method[-version]`, producer-owned; consumers compare by string
     equality for lineage attribution only — no ordering, no cross-version inference).
     Self-identity is provenance, not convenience; derived convenience fields
     (`gitBranch`-style labels) are refused.
   - **Consumers fail closed on facts, degrade on inventory.** On a `schemaVersion`
     greater than the consumer's supported major, the session is listed under a distinct
     `unsupported` state (identity + error naming both majors; remedy = upgrade the
     consumer, not re-replay) — never dropped, never fact-indexed. Unknown additive
     fields are ignored; absent version fields mean a pre-versioning (legacy) artifact,
     which stays readable.
   - A breaking change bumps `schemaVersion` with a migration note.

## Evidence bounds (adopted claims are scoped to their measurement)

- Conservation, warmth-agreement behavior, calibration factors, and corpus content-freedom
  are enforced by executable checks: 15 model tests, 16 live-TUI tests, and 22 corpus
  tests including a cross-package test that replays a synthetic session through the real
  replayer (IR drift fails the consumer's gate).
- **Warmth is adopted as model + validation method with a measured bound of one provider
  family** (gpt-5.x via the Radius router). It is *not* adopted as a general pricing
  claim; multi-provider generality is gated (RFC §9).
- Wire order itself is unobserved; its claim-relevant effect is now bounded by measurement
  (`docs/project/2026-08-26-wire-order-drift-bound.md`: 5 sessions / 5 provider identities /
  2851 requests — p90 ≤ 3.9%, median ≤ 0.4%, discontinuity tail 0.6%–5.7% at near-total
  divergence). P3 positional/warmth instruments must state the per-session bound
  (`meta.warmthAgreement` mae/p95/max) and flag or exclude tail requests (Δ > 0.5); no
  global "replay order ≈ wire order" claim — enforced mechanically by
  `tests/rfc-freshness.test.mjs`, which also fails on stale RFC counts/paths.

## Consequences

- Deadness figures always travel with their estimator (`meta.estimator` + RFC §3
  lineage rows); future estimator changes append rows rather than rewrite history.
- A corpus spanning mixed schema majors shows `unsupported` rows for newer artifacts
  instead of silently wrong facts; upgrading the corpus restores them.
- The live TUI gains warmth/runway/history only if a host surface exposes the required
  measured data; otherwise those instruments remain forensic-only.
- `pi-session-insights` remains a separate IR (`pi.session-insights.v1` chat facts);
  the two never merge.
- P3 scope note: the compaction tradeoff calculator shipped forensic-side on 2026-08-26
  under the wire-order licensing (bound stated per session; tail flagged) — recorded in
  `docs/project/2026-08-26-p3-compaction-tradeoff.md`. The AGENTS-edit re-cold warning and
  P4 remain unadopted.

## Alternatives considered

Recorded in RFC §2 (token-turns vs occupancy; reference mining vs provider-side
liveness; replay order vs wire order; artifact-level vs doc-level lineage) and in the
corpus prompt (package split, jq DSL, no-HTTP slice).
