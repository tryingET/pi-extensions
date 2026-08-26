---
summary: "Paste-ready prompt to build the multi-session context-core corpus (index + named jq projections) in a new non-live package, without growing pi-context-overlay or pi-session-insights."
read_when:
  - "Starting the multi-session corpus / agent-feed slice that consumes strata.json."
system4d:
  container: "Package-local execution prompt for the context-core corpus graduate."
  compass: "strata.json is the IR; jq is the DSL; no new session format; no IR merging; no secrets in the index."
  engine: "Scaffold non-live package -> batch/orchestrate replay -> corpus index -> named jq projections -> HTML switcher -> tests + gate + real-session evidence."
  fog: "Corpus tools drift into second session runtimes or secret warehouses; both are fatal here."
---

# Prompt — Context Core corpus (multi-session index + agent feed)

Copy everything below the line into a fresh Pi session at
`/home/tryinget/ai-society/softwareco/owned/pi-extensions`.

---

You are building the **multi-session corpus slice** for context core: a thin,
agent-feedable index over `strata.json` artifacts plus named jq projections.
This is a **new package**. It is not an extension of `pi-context-overlay` and
not an extension of `pi-session-insights`.

## Objective

An operator or agent can currently inspect **one** session at a time
(`context-strata.html` + `strata.json`). Build the multi-session layer:

1. **Corpus build**: read a directory of `strata.json` files (however produced)
   and emit `corpus/index.json` — per-session derived summary facts.
2. **Batch orchestration** (optional flag): given `--sessions <glob>` and
   `--replay-script <path to pi-context-overlay/scripts/context-strata-replay.mjs>`,
   shell out to the existing replay to (re)produce them. Never re-implement
   JSONL parsing.
3. **Named jq projections** (`projections/corpus.jq`): the agent-facing query
   surface. jq **is** the DSL; do not invent a query language.
4. **HTML switcher** (`corpus/index.html`): static list of sessions with the
   summary facts, linking to each per-session `context-strata.html` when
   present. No new instruments, no second visual language.

## Decisions already made — do not relitigate

- **IR**: `strata.json` as emitted today. Do not change its shape from the
  corpus package. If a field is missing, propose an overlay-side change and
  stop; do not fork the schema.
- **DSL**: named jq filters. No new language, no server-side query engine.
- **API**: **no HTTP in this slice.** Files are the store; index + projections
  are the agent feed. A read-only HTTP layer is a separate later decision.
- **Home**: new monorepo package `packages/pi-context-corpus` in
  `pi-extensions`, scaffolded from `../pi-extensions-template`
  (`scaffold_mode=simple-package`). **Deliberately non-live**: no
  `pi.extensions` / `pi.prompts` in `package.json`; record that exception in
  the package-local `AGENTS.md` and README (root AGENTS rule for non-live
  support packages).
- **Not** in `pi-context-overlay`: owner membrane — the overlay is the live
  TUI carrier and the replay owner; a corpus reader there invites JSONL into
  the live path.
- **Not** `pi-session-insights`: different IR. `pi.session-insights.v1` is
  jq-bounded **chat facts**; `strata.json` is an **allocator ledger**. Merging
  them is a type error.
- No cross-package imports. The corpus package has zero dependencies on
  `@tryinget/pi-context-overlay`; it consumes artifacts, not code.

## Non-goals (do not do)

- Do not modify `pi-context-overlay` live TUI, store, or classifier.
- Do not modify the replay semantics or `strata.json` shape.
  Extraction/replay bugs belong in the overlay package — report, don't patch
  from here.
- Do not open, join, or roll up `--data-agnt-*` child sessions (still open
  debt in the RFC).
- No P3 (compaction tradeoff) or P4 (targeted GC).
- No message bodies, tool outputs, previews, base64, or file contents in any
  corpus output. Derived aggregates and path/label metadata only.
- No global price table. Cost comes only from each session's own reported `$`
  in strata meta; cross-session cost is `sum-of-reported`, labeled as such.
- No bulk inventory of `~/.pi/agent/sessions`. Select narrowly (operator-named
  paths or the RFC S1/S2 sessions).

## Read first (in order)

1. `packages/pi-context-overlay/docs/project/2026-08-26-context-core-profiler-rfc.md`
   — §2 epistemic ledger (measured/derived/estimated/inferred), §7 debt, §9.
2. `packages/pi-context-overlay/scripts/context-strata-projections.mjs` —
   `assembleStrata`: the actual `strata.json` shape. **Derive every index field
   from this file. Do not invent field names.**
3. `packages/pi-context-overlay/scripts/context-strata-replay.mjs` — CLI
   contract you may shell out to.
4. `packages/pi-context-overlay/tests/context-strata-lib.test.mjs` — fixture
   patterns (linear, faulted, branched, forked).
5. `~/.pi/agent/skills/pi-session-jsonl/SKILL.md` — secret-bearing-log rules.
   If you touch raw JSONL at all, those rules are binding (jq-only parsing,
   metadata default, never print base64, never auto-open `fullOutputPath`).
6. `../pi-extensions-template` README + root AGENTS "Package guidance" for the
   scaffold and the non-live exception wording.

## Data contract

`corpus/index.json`:

```jsonc
{
  "generatedAt": 0,               // epoch ms
  "corpusDir": "…",
  "sessions": [
    {
      "id": "<session id or file stem>",
      "source": "<relative path to strata.json>",
      "replayStatus": "ok" | "empty" | "failed",  // failed/empty are LISTED, never dropped
      "html": "context-strata.html" | null,       // link if present
      // Derived facts, sourced from strata meta/requests — confirm names in assembleStrata:
      "cwd": "…",
      "models": ["provider/id"],     // from modelChanges if present
      "requests": 0, "turns": 0, "faults": 0,
      "onChainCostUsd": 0,           // sum-of-reported
      "cacheHitShare": 0.0,
      "warmthAgreementMae": 0.0,
      "forks": 0,
      "lastResidentEst": 0, "contextWindow": 0,
      "runwayRequestsRemaining": 0 | null,
      "ghostShareOfToolTokenTurns": 0.0,
      "topCategories": [ { "id": "toolResult", "share": 0.0 } ]   // ≤5, share of token-turns
    }
  ]
}
```

- Every numeric field inherits its strata epistemic class. Do not launder an
  estimate into a measured number, and do not blend classes in one field.
- If `assembleStrata` turns out to emit message text or previews anywhere in
  `strata.json`, that is an overlay bug: stop and report it. Do not silently
  strip-and-continue.

`projections/corpus.jq` — named filters, each emitting bounded JSON:

| name | input | emits |
|---|---|---|
| `occupancy` | index.json | per-session last occupancy + window |
| `faults` | index.json | sessions with faults, count + last fault request |
| `spend` | index.json | per-session on-chain `$` + cache-hit share |
| `ghosts` | index.json | sessions ranked by ghost share |
| `runway` | index.json | sessions ranked by requests-until-fault |
| `topfiles` | strata.json (one) | top path-qualified allocations by token-turns |

Usage must be one line, e.g.
`jq -f projections/corpus.jq --arg p spend corpus/index.json` (pick one
dispatch convention — named wrapper functions keyed by `--arg p` — and pin it
in tests and README).

`corpus/index.html`: static, self-contained, no external assets; a table of
the index facts with links. Escape `<` in embedded JSON exactly like the
overlay template does.

## Implementation notes

- Node ≥22, ESM, zero runtime deps. Tests with `node:test` + `tsx` only if
  TypeScript is used; plain `.mjs` is fine and preferred here.
- File budgets: code 500 LOC / 50KB per file; markdown 800 / 60KB.
- CLI surface (keep tiny): `node bin/corpus.mjs index <corpusDir>` and
  `node bin/corpus.mjs project <name> [file]`. Batch flags on `index`:
  `--sessions <glob> --replay-script <path>`.
- Honor `TMPDIR`; never `/tmp` for builds/caches. Scratch only what you own.
- The package must pass `bash scripts/quality-gate.sh ci` (root gate handles a
  new package automatically; verify `local-package-links` stays at 0 links).

## Tests (extend as you go; all must pass in the gate)

- Index build over ≥3 fixture sessions: linear, faulted, and one
  `replayStatus: "failed"` (corrupt/empty strata) — failed one must appear in
  the index, not vanish.
- Each projection pinned against a fixture index (exact JSON equality).
- **Content-free assertion**: fixture strata containing known secret-marker
  text; assert no marker appears anywhere in index.json or index.html.
- HTML: every ok session row links to its html when present; `<` escaped in
  the embed.
- CLI: unknown projection name fails closed with a listing; missing corpus
  dir fails closed.
- `topfiles` on a fixture strata: path-qualified, ranked, bounded.

## Proof

1. `bash scripts/quality-gate.sh ci` from the new package — green including
   file-budget.
2. Run against **two real sessions** (operator-named, or the RFC S1/S2
   sessions). Produce `corpus/index.json` + `corpus/index.html`.
3. In your report, paste: one index entry, one projection output (`spend`),
   and the file list of the corpus dir.
4. Commit only `packages/pi-context-corpus/**` plus the two overlay doc files
   (this prompt + the RFC §9/§8 pointer) if the pointer is not yet committed.
5. Live HTTP/API/agent-loop proof: **explicitly deferred** — say so; do not
   claim agent verified.

## Done when

- `packages/pi-context-corpus` exists, non-live exception recorded, gate green.
- Index + ≥6 named projections + switcher work over ≥2 real sessions.
- No message content in any corpus output (test-enforced).
- `strata.json` shape untouched; zero cross-package imports.
- Report lists: files changed, gate evidence, corpus evidence, open questions.

## Return

Files changed • gate evidence • index/projection evidence • explicitly-deferred
items • open questions for the RFC (§9).
