---
summary: "Operating plan for the completed runtime-truth wave in pi-society-orchestrator."
read_when:
  - "You need the current package-local operating slices and exact AK task bindings for runtime-truth work."
  - "You are about to claim the next slice under the active tactical goal."
system4d:
  container: "Operating layer for the runtime-truth tactical wave."
  compass: "Keep one active wave, bind exact AK tasks, and make the next ready slice obvious."
  engine: "Choose active tactical goal -> list exact tasks -> state dependencies and validation surfaces."
  fog: "The main risk is mixing the addition, wording follow-ups, and speculative footer redesign into one undifferentiated queue."
---

# Operating plan — runtime-truth wave completed

Active tactical goal:
- no active runtime-truth tactical wave is currently materialized

Current baseline after the completed runtime-truth wave:

- `src/runtime/status-semantics.ts` is the shared operator-visible runtime-truth surface
- `/runtime-status`, `session_start`, footer wording, routing-selection notices, and installed-package smoke now consume that shared contract
- user-facing routing now presents internal `full` as `all agents`, and coverage exists in both package-local tests plus installed-package smoke
- the footer now uses prioritized slots so compact DB/Vault health badges can appear at wider widths while seam/routing stay primary on tighter widths

## Completed slices

| Order | AK task | State | Deliverable |
|---|---:|---|---|
| 1 | `#939` | done | Shared runtime-truth descriptor + `/runtime-status` inspector anchored in package-local runtime truth rather than scattered string literals. |
| 2 | `#940` | done | Footer/startup/routing-selection UI rewired to the shared runtime-truth surface. |
| 3 | `#941` | done | Runtime-truth / footer semantics documented in package docs and README. |
| 4 | `#942` | done | Remaining routing vocabulary audited, including the user-facing `full` -> `all agents` decision. |
| 5 | `#943` | done | Scenario and installed-package release-smoke coverage expanded for routing/runtime-truth states. |
| 6 | `#944` | done | Slot-based footer prototype landed with optional DB/Vault health badges that yield before seam/routing on compact widths. |

## Active operating slices

- none; any next runtime-status/footer work should be materialized from a new evidence-backed concern rather than continuing this completed wave

## Validation surfaces

- package-local regression tests: `packages/pi-society-orchestrator/tests/runtime-shared-paths.test.mjs`
- seam guardrails: `packages/pi-society-orchestrator/tests/execution-seam-guardrails.test.mjs`
- installed-package smoke: `packages/pi-society-orchestrator/scripts/release-smoke.mjs`
- runtime-truth contract docs: `packages/pi-society-orchestrator/docs/project/runtime-status-semantics.md`
- package truth/charter docs: `packages/pi-society-orchestrator/README.md`

## Future trigger

- Reopen this operating area only if additional operator-visible runtime truth can no longer be expressed clearly within the current prioritized slot behavior.

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
    - `TG3` — keep footer density coherent when additional runtime truth appears
      - `#944` — land slot-based footer behavior for optional health state
