---
summary: "Bounded plan for migrating ontology_context and /ontology off raw ontology SQL onto the sanctioned rocs-cli adapter path."
read_when:
  - "Implementing the next architecture-convergence slice after unified execution/evidence hardening."
  - "Reviewing why ontology lookups no longer depend on the local society.db ontology table shape."
system4d:
  container: "Single-slice plan for ontology adapter migration."
  compass: "Move ontology reads to the sanctioned ROCS boundary without broadening into society-query or prompt-plane work."
  engine: "resolve ontology through rocs-cli -> preserve search/useful output -> test with deterministic fixtures -> update docs/handoff."
  fog: "The main risk is replacing raw SQL with a new boundary while accidentally hard-coding fragile workspace assumptions or dropping useful search behavior."
---

# ROCS ontology adapter — 2026-03-11

## Scope

Complete one bounded pack from `NEXT_SESSION_PROMPT.md`:
- migrate `ontology_context` and `/ontology` from raw society SQL to a sanctioned `rocs-cli` path
- keep `society_query`, `/evidence`, and prompt-vault seams out of scope for this slice
- update package docs/handoff to reflect the narrower remaining architecture backlog

## Acceptance criteria

1. `ontology_context` no longer queries the local `ontology` SQL table directly.
2. `/ontology` no longer queries the local `ontology` SQL table directly.
3. Ontology lookup now resolves through `rocs-cli` against a configured ontology repo/workspace root.
4. Search remains useful for concept ids, labels, and definition text.
5. Deterministic package tests cover the new adapter path without depending on a live ROCS repo or network.
6. `README.md`, `docs/dev/status.md`, `docs/dev/plans/2026-03-10-architecture-backlog.md`, and `NEXT_SESSION_PROMPT.md` reflect the completed ontology migration and the next remaining bounded work.

## Chosen approach

- Add a package-local ROCS runtime helper that:
  - invokes `rocs build --json`
  - reads ROCS-generated `resolve.json` + `id_index.json`
  - resolves concept docs by layer/path
  - extracts searchable concept metadata from the markdown docs
- Default the sanctioned ontology repo/workspace settings to the SoftwareCo workspace, while keeping env overrides explicit.
- Preserve bounded search/output behavior in `ontology_context` and `/ontology` using the shared helper.
- Prove behavior with fake `rocs` fixtures in package tests instead of relying on live ontology repos.

## Risks / non-goals

- Do not broaden into replacing `society_query` or `/evidence` yet.
- Do not finalize prompt-plane seams.
- Do not change loop execution or evidence semantics in this slice.
