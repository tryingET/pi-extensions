---
summary: "Bounded plan for finishing the shared lower-plane boundary hardening pack identified by deep review."
read_when:
  - "Implementing the next high-leverage boundary hardening slice after the ontology and execution/evidence passes."
  - "Reviewing why read-side boundary helpers became async, bounded, and more contract-strict."
system4d:
  container: "Single-slice plan for lower-plane boundary hardening."
  compass: "Make lower-plane adapter behavior explicit, bounded, and less drift-prone before further architecture convergence."
  engine: "tighten boundary contract -> route runtime callers through it -> prove with focused regressions -> update docs/handoff."
  fog: "The main risk is leaving read-side helpers looking centralized while still keeping silent split-brain, schema, or blocking behavior."
---

# Lower-plane boundary hardening — 2026-03-12

## Scope

Complete one bounded hardening pack from the deep-review NEXUS recommendation:
- move runtime lower-plane read paths onto async, supervised helper boundaries
- make explicit DB targeting outrank ambient env drift for `ak`
- require cognitive-tool retrieval by name to stay cognitive-only
- widen the read-only SQL gate to allow valid read-only CTE diagnostics
- stop routine `release:check` from mutating the user's default global npm install space

## Acceptance criteria

1. Runtime `sqlite3`, `dolt`, and `rocs` read paths no longer depend on synchronous `execFileSync` in package runtime code paths.
2. `ak` invocation honors the explicitly configured `societyDb` target even when ambient `AK_DB` is set.
3. `getCognitiveToolByName(...)` cannot return a non-cognitive template.
4. `society_query` accepts valid read-only `WITH ... SELECT ...` diagnostics while still rejecting mutating or stacked SQL.
5. `npm run release:check` installs the tarball into an isolated npm prefix instead of the user's default global npm package space.
6. Regression tests cover the new boundary behavior.
7. `README.md`, `CHANGELOG.md`, and `next_session_prompt.md` reflect the new state and remaining backlog.

## Chosen approach

- Add async boundary helpers for external command reads/writes on top of the existing supervised process runtime.
- Route runtime call sites (`society_query`, `/evidence`, cognitive-tool lookup, ontology lookup) through those async helpers.
- Keep sync helpers only for narrow test/local utility coverage where runtime code no longer depends on them.
- Tighten domain constraints in the cognitive-tool adapter itself instead of relying on callers.
- Keep `society_query` as a bounded diagnostic exception for now, but make its SQL classifier less needlessly restrictive for read-only CTEs.
- Isolate release smoke npm installs with a temporary `NPM_CONFIG_PREFIX` tied to the release-check temp workspace.

## Risks / non-goals

- Do not broaden into replacing `society_query` or `/evidence` with a fully sanctioned `ak` read adapter yet.
- Do not remove SQL fallback from `recordEvidence(...)` in this slice.
- Do not finalize prompt-plane ownership beyond tightening the current local cognitive-tool helper contract.
