---
summary: "Bounded architecture-convergence slice that moves /evidence onto AK while isolating society_query as an explicit diagnostic sqlite exception."
read_when:
  - "Continuing the remaining raw society read/query convergence work after ontology and evidence-write hardening."
  - "Reviewing why /evidence now uses AK while society_query remains a narrow raw-read exception."
system4d:
  container: "Single bounded architecture note for the residual society read/query family."
  compass: "Reduce raw DB coupling without inventing a fake canonical read surface."
  engine: "move evidence listing to AK -> isolate remaining sqlite diagnostic path -> test -> update docs/handoff."
  fog: "The main risk is pretending society_query already has a sanctioned replacement when only /evidence actually does."
---

# Society read boundary exception — 2026-03-30

## Scope

Complete one bounded pack from `next_session_prompt.md`:
- move `/evidence` off raw sqlite reads onto a sanctioned `ak` path
- keep `society_query` available only as an explicit bounded diagnostic exception
- isolate society-read helper logic so raw diagnostic SQL is no longer embedded ad hoc in the extension entrypoint

## Acceptance criteria

1. `/evidence` no longer queries the `evidence` table through raw sqlite in the extension.
2. `/evidence` reads through `ak evidence search` instead.
3. `society_query` remains read-only, but its raw sqlite behavior is isolated in a dedicated runtime helper that makes the exception explicit.
4. Focused tests cover the new society runtime helper behavior.
5. `README.md`, the architecture backlog, and `next_session_prompt.md` reflect the narrower remaining gap.

## Chosen approach

- Add `src/runtime/society.ts` as the package-local boundary module for the residual society read family.
- Route `society_query` through `runSocietyDiagnosticQuery(...)` so the read-only gate and raw sqlite exception live in one obvious place.
- Route `/evidence` through `previewRecentEvidence(...)`, backed by `ak evidence search`.
- Keep `/evidence` as a UI-oriented text surface; because AK does not currently expose JSON formatting for `evidence search`, the command renders the owner-controlled AK text output instead of re-querying sqlite.

## Resulting state

- `/evidence` is now AK-backed and no longer depends on raw sqlite evidence reads.
- `society_query` is now the only remaining raw society read surface in this package, and it is explicitly framed as a diagnostic exception rather than an accidental primary adapter.
- `src/runtime/boundaries.ts` no longer has to carry extension-specific society behavior directly; the extension now depends on a narrower society runtime helper.

## Non-goals

- Do not invent a fake general-purpose AK read/query API where none exists yet.
- Do not remove `society_query` until a truthful canonical read boundary exists.
- Do not remove SQL fallback from `recordEvidence(...)` in this slice.
