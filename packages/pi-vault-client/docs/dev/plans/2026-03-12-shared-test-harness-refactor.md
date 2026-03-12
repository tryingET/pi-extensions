---
summary: "Plan for a small internal pi-vault-client maintenance slice: ignore package-local test tempdirs and extract duplicated transpile/tempdir test harness helpers."
read_when:
  - "Refactoring duplicated test harness setup across pi-vault-client integration-style tests."
  - "Reviewing why .tmp-test/ is now ignored in this package."
system4d:
  container: "Internal package maintenance plan for test-harness cleanup."
  compass: "Reduce fixture drift without changing package runtime behavior."
  engine: "Document scope -> extract shared helper -> migrate affected tests -> validate package and release gates."
  fog: "Main risk is widening a test-only cleanup into behavior changes or brittle helper magic."
---

# Plan: shared test harness refactor

## Scope
- add `.tmp-test/` to the package `.gitignore`
- extract the repeated transpile/tempdir harness used by the package's integration-style tests into a shared helper under `tests/helpers/`
- migrate the affected tests to the shared helper without changing runtime behavior

## Acceptance criteria
- `.tmp-test/` no longer appears as untracked package noise
- duplicated per-suite transpile/tempdir boilerplate is reduced materially
- affected tests still exercise the same runtime entrypoints and fixtures
- `npm run typecheck`, `npm run check`, and `npm run release:check` pass

## Non-goals
- no runtime behavior change in `src/`
- no replay/receipt contract changes
- no broad test-suite redesign beyond the repeated transpile/tempdir setup
