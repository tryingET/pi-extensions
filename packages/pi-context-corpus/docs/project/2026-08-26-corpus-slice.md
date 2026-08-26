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
  overlay-side change: emit `meta.cwd` from the session header in
  `context-strata-replay.mjs` / lib. Do not fork the schema from here.
- Read-only HTTP layer over the corpus: **explicitly deferred** (separate
  decision); no agent-loop verification is claimed.
- Child-arena (`--data-agnt-*`) rollup remains overlay debt; not opened here.
