---
summary: "Overview and usage for the non-live multi-session context corpus package."
read_when:
  - "Starting work in pi-context-corpus."
  - "Building a corpus index, running named projections, or extending batch orchestration."
system4d:
  container: "Package-local corpus reader over pi-context-overlay strata.json artifacts."
  compass: "strata.json is the IR; jq is the DSL; derived aggregates only, never message content."
  engine: "Scaffold non-live package -> batch/orchestrate replay -> corpus index -> named jq projections -> HTML switcher."
  fog: "Corpus tools drifting into second session runtimes or secret warehouses is fatal here."
---

# @tryinget/pi-context-corpus

Multi-session corpus layer for context core: a thin, agent-feedable index over
`strata.json` artifacts (produced by `pi-context-overlay`'s
`context-strata-replay.mjs`) plus named jq projections and a static HTML switcher.

**Deliberately non-live package.** No `package.json#pi` manifest at all — no
`pi.extensions`, no `pi.prompts`, no skills, no live install/reload. This package
consumes *artifacts*, not code: it has zero imports from (or dependencies on)
`@tryinget/pi-context-overlay`. It never parses session JSONL; JSONL replay is
owned by the overlay and only shelled out to when `--sessions`/`--replay-script`
are passed explicitly. Private, `releaseConfigMode=none`, not published.

## Usage

Build a corpus index over a directory tree of `strata.json` artifacts:

```bash
node bin/corpus.mjs index <corpusDir>
# -> <corpusDir>/corpus/index.json + <corpusDir>/corpus/index.html
```

Batch orchestration (optional): (re)produce the strata artifacts first by shelling
out to the overlay replay, then index:

```bash
node bin/corpus.mjs index <corpusDir> \
  --sessions '<glob of session .jsonl files>' \
  --replay-script <path>/pi-context-overlay/scripts/context-strata-replay.mjs
```

Each session replays into `<corpusDir>/<session-stem>/` (`strata.json`,
`requests.csv`, `speedscope.json`, `context-strata.html`). The replay `--out` is
always explicit, so nothing is written to system `/tmp`. Failed replays are
**listed** in the index (`replayStatus: "failed"`), never dropped.

Run a named projection (jq is the query DSL — one line, pinned convention):

```bash
node bin/corpus.mjs project spend <corpusDir>/corpus/index.json
# or directly:
jq -f projections/corpus.jq --arg p spend corpus/index.json
```

## Projections (`projections/corpus.jq`)

| name | input | emits |
|---|---|---|
| `occupancy` | index.json | per-session last occupancy + context window |
| `faults` | index.json | sessions with faults: count + last fault request |
| `spend` | index.json | per-session on-chain `$` (sum-of-reported) + cache-hit share |
| `ghosts` | index.json | sessions ranked by mined-dead share of pathed tool token-turns |
| `runway` | index.json | sessions ranked by requests-until-fault (nulls excluded) |
| `sessions` | index.json | compact per-session overview |
| `topfiles` | strata.json (one) | top path-qualified allocations by token-turns (≤10) |
| `compaction` | strata.json (one) | P3 tradeoff summary: break-even vs horizon, with warmth bound + tail flag |

Unknown names fail closed with the available listing (both via the CLI and via jq).

## Index data contract (`corpus/index.json`)

Per-session entries carry `id`, `source`, `sourceSession` (measured provenance:
the operator-given session `.jsonl` path, recorded verbatim in batch mode;
`null` otherwise), `cwd` (measured from the session header via `meta.cwd`;
`null` when absent), `replayStatus` (`ok` | `empty` | `failed` | `unsupported`), `html`
(relative link when present), and derived facts sourced only from strata
`meta`/`requests`: `models`, `requests`, `turns`, `faults`, `lastFaultR`,
`onChainCostUsd`, `cacheHitShare`, `warmthAgreementMae`, `forks`,
`lastResidentEst`, `contextWindow`, `runwayRequestsRemaining`,
`ghostShareOfToolTokenTurns`, `topCategories` (≤5, share of token-turns).

`failed` = read/producer problem (remedy: fix or re-replay). `unsupported` = the
artifact's `schemaVersion` major is newer than this package supports (remedy: upgrade
this package — re-replaying cannot help). Both are listed with identity + `error` and
no facts.

Every numeric field inherits its strata epistemic class (measured / derived /
estimated / inferred — see the overlay RFC §2). `null` is preserved as `null`
("unknown"/"no measurable burn"); it is never coerced to `0`. Failed sessions
carry only identity/provenance fields plus an `error` string.

**Standing rule for index fields**: identity + measured provenance +
already-derived strata facts only. Any new *question* becomes a named jq
projection — never a new column, never a widget.

**Row ordering** is chosen at build time in tested deterministic code: on-chain
`$` descending, failed sessions last (still listed), ties broken by id. The
HTML computes nothing; ranking questions route to jq.

`cwd` carries the session's working directory as measured provenance (`meta.cwd`, read
from the session header by the overlay; `null` for artifacts that predate the field).
It is never inferred from the sessions directory name — that would be inferred class
posing as measured.

## Content rules

- **IR contract** (owner: `pi-context-overlay`, RFC §9 / ADR
  `docs/adr/2026-08-26-context-core-allocator-model-and-strata-ir.md`): `strata.json` is a
  declared cross-package IR — additive-only; `meta.schemaVersion` (`1`) + `meta.estimator`
  carry self-identity; unknown additive fields are ignored and absent version fields mean a
  legacy artifact (both pinned). **Newer schema major → `replayStatus: "unsupported"`**:
  the session is listed (identity + error naming both majors), never dropped, never
  fact-indexed; fact projections include only `ok`/`empty`. `tests/corpus-cross-check.test.mjs`
  replays a synthetic session through the *real* overlay replayer and indexes the artifact,
  so IR drift fails this package's gate, not just the overlay's.
- No message bodies, tool outputs, previews, base64, or file contents in any
  corpus output. Derived aggregates and path/label metadata only (test-enforced
  with a secret-marker fixture).
- No cross-session cost modeling: `onChainCostUsd` is sum-of-reported per
  session; there is no global price table.
- `strata.json` shape is owned by `pi-context-overlay`; this package never
  mutates it. Extraction/replay bugs belong there — report, don't patch.

## Deferred

A read-only HTTP layer over the corpus is a separate later decision; this slice
is files-only. No HTTP, no server, no agent-loop verification is claimed.

## Development

```bash
npm run fixtures:test   # node --test tests/corpus.test.mjs
npm run check           # package quality gate (lint/test/structure/file-budget)
```

Requires Node ≥22 and jq (1.6+) on PATH for projections. Zero runtime npm
dependencies.
