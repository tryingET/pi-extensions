---
summary: "Package guardrails for the non-live multi-session context corpus over strata.json artifacts."
read_when:
  - "Editing packages/pi-context-corpus."
  - "Changing the corpus index schema, projections, or batch orchestration."
system4d:
  container: "Local package rules inside the pi-extensions monorepo."
  compass: "strata.json is the IR; jq is the DSL; no new session format; no secrets in the index."
  engine: "Targeted reading -> implement -> validate -> summarize."
  fog: "Drift into a second session runtime or a secret warehouse is the fatal failure mode."
---

# AGENTS.md — pi-context-corpus

## Owner boundary

This package owns the multi-session corpus layer over `strata.json` artifacts:
`corpus/index.json`, named jq projections, and the static HTML switcher.

It does not own:

- session JSONL parsing or replay semantics (`pi-context-overlay`);
- the `strata.json` IR shape (`pi-context-overlay/scripts/context-strata-projections.mjs`);
- chat-fact insights (`pi-session-insights`, different IR: `pi.session-insights.v1`);
- live Pi extension surfaces — none exist here.

## Non-live exception (deliberate)

- This package is a **deliberately non-live** private support package: no
  `package.json#pi.extensions`, no `pi.prompts`, no skills, no slash command,
  no live install/reload, no release, no publication (`releaseConfigMode=none`).
- `scripts/validate-structure.mjs` enforces this: a `pi` manifest, an
  `extensions/`/`prompts/`/`.pi/`/`skills/` directory, or release scripts all fail.

## IR contract

- `strata.json` as emitted today is the only input IR. Never change its shape
  from here, never re-derive it from JSONL.
- If a needed field is missing from the IR (current case: session `cwd`),
  propose an overlay-side change and stop; do not fork the schema and do not
  invent substitute sources.
- Zero cross-package imports: no dependency on `@tryinget/pi-context-overlay`.
  The corpus consumes artifacts, not code. Batch mode shells out to the overlay
  replay script path the operator provides.
- **Index-field standing rule**: identity + measured provenance + already-derived
  strata facts only. Any new *question* becomes a named jq projection — never a
  new column, never a presentation widget. Measured provenance may cross into
  the index (`sourceSession` = operator-given session path, recorded verbatim);
  derived convenience never (e.g. a `cwd` decoded from the sessions directory
  name would be inferred class posing as measured — forbidden).
- Row ordering is a build-time decision in tested code (on-chain `$` descending,
  failed sessions last, ties by id). The HTML switcher stays inert; no
  client-side sort/filter/second query engine.

## JSONL rule

- This package never opens session JSONL itself. When raw-session handling is
  needed, it is delegated to the overlay replay (which owns it) via
  `--sessions <glob>` + `--replay-script <path>`.
- Corpus outputs are content-free: derived aggregates and path/label metadata
  only. Message bodies, tool outputs, previews, base64, and file contents are
  forbidden in `corpus/index.json` and `corpus/index.html` (test-enforced).
- `null` means unknown/not-measurable; never coerce it to `0`.

## Monorepo package constraints

- This folder is a package workspace, not a git root. Use plain installed `ak`
  for task/work-item operations; direction authority stays at the monorepo root.
- Keep release metadata (`x-pi-template`) aligned: `releaseComponent` stays
  `pi-context-corpus`, `releaseConfigMode` stays `none`.
- Documentation placement: dated RFCs/runbooks/evidence in `docs/project/`;
  adopted decisions in `docs/adr/`; no new `docs/dev/` trees.

## Validation

Run after any change:

```bash
npm run fixtures:test   # fast
npm run check           # full package gate
```
