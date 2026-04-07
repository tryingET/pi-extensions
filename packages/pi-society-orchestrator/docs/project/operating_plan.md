---
summary: "Operating plan for the active runtime-truth wave in pi-society-orchestrator."
read_when:
  - "You need the current package-local operating slices and exact AK task bindings for runtime-truth work."
  - "You are about to claim the next slice under the active tactical goal."
system4d:
  container: "Operating layer for the runtime-truth tactical wave."
  compass: "Keep one active wave, bind exact AK tasks, and make the next ready slice obvious."
  engine: "Choose active tactical goal -> list exact tasks -> state dependencies and validation surfaces."
  fog: "The main risk is mixing the addition, wording follow-ups, and speculative footer redesign into one undifferentiated queue."
---

# Operating plan — TG2 queued after the initial runtime-truth landing

Active tactical goal:
- [TG2 in tactical_goals.md](tactical_goals.md#tg2--resolve-remaining-routing-vocabulary-and-coverage-after-the-truth-surface-lands)

Current baseline after the initial runtime-truth wave:

- `src/runtime/status-semantics.ts` is now the shared operator-visible runtime-truth surface
- `/runtime-status`, `session_start`, footer wording, routing-selection notices, and installed-package smoke now consume that shared contract
- docs/README now describe the same runtime-truth contract instead of treating footer/status wording as incidental copy

## Recently completed slices

| Order | AK task | State | Deliverable |
|---|---:|---|---|
| 1 | `#939` | done | Shared runtime-truth descriptor + `/runtime-status` inspector anchored in package-local runtime truth rather than scattered string literals. |
| 2 | `#940` | done | Footer/startup/routing-selection UI rewired to the shared runtime-truth surface. |
| 3 | `#941` | done | Runtime-truth / footer semantics documented in package docs and README. |

## Active operating slices

| Order | AK task | State | Deliverable |
|---|---:|---|---|
| 4 | `#942` | pending | Remaining routing vocabulary audited, including a user-facing decision for `full`. |
| 5 | `#943` | blocked by `#942` | Scenario and release-smoke coverage expanded for routing/runtime-truth states. |

## Deferred slice

| Order | AK task | State | Deliverable |
|---|---:|---|---|
| 6 | `#944` | deferred | Slot-based footer prototype only if additional runtime-truth state later exceeds the current single-line contract. |

## Validation surfaces

- package-local regression tests: `packages/pi-society-orchestrator/tests/runtime-shared-paths.test.mjs`
- seam guardrails: `packages/pi-society-orchestrator/tests/execution-seam-guardrails.test.mjs`
- installed-package smoke: `packages/pi-society-orchestrator/scripts/release-smoke.mjs`
- runtime-truth contract docs: `packages/pi-society-orchestrator/docs/project/runtime-status-semantics.md`
- package truth/charter docs: `packages/pi-society-orchestrator/README.md`

## HTN

- `G0` — make operator-visible runtime semantics truthful and inspectable in `pi-society-orchestrator`
  - `SG1` — make operator-visible runtime semantics truthful, inspectable, and compounding
    - `TG1` — introduce a shared runtime-truth surface and `/runtime-status` inspector
      - `#939` — add runtime-truth descriptor + `/runtime-status`
      - `#940` — rewire footer/startup/routing-selection UI to the truth surface
      - `#941` — document runtime-truth semantics
    - `TG2` — resolve remaining routing vocabulary and coverage after the truth surface lands
      - `#942` — decide user-facing treatment of `full`
      - `#943` — expand scenario/release-smoke coverage
    - `TG3` — revisit footer density only if new runtime-truth state outgrows the current line
      - `#944` — deferred footer-density prototype
