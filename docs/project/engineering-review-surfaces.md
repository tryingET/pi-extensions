---
summary: "Audit map for root-owned and package-local engineering review surfaces in the pi-extensions monorepo."
read_when:
  - "Reviewing whether engineering policy should stay centralized at monorepo root."
  - "Before changing package or template outputs for engineering-lane metadata."
system4d:
  container: "Tech-stack review surface audit."
  compass: "Keep root policy centralized while making package-local divergence explicit and minimal."
  engine: "Inspect root surfaces -> inspect package surfaces -> route template/package follow-up to the correct repo."
  fog: "The main risk is changing template/package outputs without first seeing which packages still depend on the older full surface."
---

# Tech-stack review surfaces — pi-extensions monorepo

## Reduced-form target

For this monorepo, the intended direction is:

- monorepo root owns the shared policy and validation stance
- package/template outputs shrink toward a reduced local form
- reduced local form means keeping `docs/engineering.local.md` only when a package has a real local override to document

Current root-owned sources of truth:

- `docs/engineering.local.md`
- `scripts/validate-engineering-contract.mjs`
- [reduced-form-migration-contract.md](reduced-form-migration-contract.md)

## Live audit command

From repo root:

```bash
npm run engineering:review-surfaces
```

JSON form:

```bash
node ./scripts/engineering-review-surfaces.mjs --json
```

The script enumerates every package root under `packages/` and reports whether it still carries:

- package-local `docs/engineering.local.md`
- package-local `policy/engineering-lane.json`
- package role (`package-root` vs `package-group-root`)
- scaffold mode when `x-pi-template.scaffoldMode` is present

## Current audit snapshot

Audited on 2026-05-16.
Refreshed on 2026-05-21 from `node ./scripts/engineering-review-surfaces.mjs --json` after adding `packages/pi-agent-vent`.
Refreshed on 2026-07-11 after registering `packages/pi-snapshot-edit`, which raised the audited package count to `29`.
Refreshed again on 2026-07-11 after adding `packages/pi-modes`, which raised the audited package count to `30`.
Refreshed on 2026-07-12 after adding `packages/pi-evidence-review`, which raised the audited package count to `31`.
Refreshed on 2026-07-25 after recovering `packages/pi-semantic-code-intelligence` on the current canonical line, which raised the audited package count to `32`.
Refreshed on 2026-08-01 after recovering `packages/pi-eval-kernel` onto the current released line, which raised the audited package count to `33`.
Refreshed on 2026-08-03 after adding `packages/pi-session-insights`, which raised the audited package count to `34`.
Refreshed on 2026-08-15 after adding `packages/pi-telemetry`, which raised the audited package count to `36`.
Refreshed on 2026-08-27 after adding `packages/pi-context-corpus` and `packages/pi-agent-registry`, which raised the audited package count to `38`.

Snapshot summary:

- package entries audited: `38`
- legacy-full: `29`
- reduced-form: `1`
- policy-only: `0`
- no local surface: `8`

### Legacy full surface (`docs/engineering.local.md` + `policy/engineering-lane.json`)

- `packages/pi-agent-interaction-canary`
- `packages/pi-agent-registry`
- `packages/pi-agent-vent`
- `packages/pi-autoresearch`
- `packages/pi-better-openai`
- `packages/pi-context-corpus`
- `packages/pi-eval-kernel`
- `packages/pi-context-overlay`
- `packages/pi-context-packer`
- `packages/pi-designmd-foundry`
- `packages/pi-evalset-lab`
- `packages/pi-evidence-review`
- `packages/pi-interaction` (`package-group-root`)
- `packages/pi-little-helpers`
- `packages/pi-model-selection`
- `packages/pi-modes`
- `packages/pi-ontology-workflows`
- `packages/pi-prompt-template-execution`
- `packages/pi-provenance`
- `packages/pi-semantic-code-intelligence`
- `packages/pi-session-compaction`
- `packages/pi-session-insights`
- `packages/pi-snapshot-edit`
- `packages/pi-society-orchestrator`
- `packages/pi-society-startup-context`
- `packages/pi-telemetry`
- `packages/pi-toolbox-discovery`
- `packages/pi-vault-client`
- `packages/pi-workstation-inference-provider`

### Reduced-form package-local surface (`docs/engineering.local.md` only)

- `packages/pi-interaction/pi-interaction`

### Policy-only package-local surface (`policy/engineering-lane.json` only)

- none

### No package-local engineering review surface today

- `packages/pi-activity-strip`
- `packages/pi-autonomous-session-control`
- `packages/pi-interaction/pi-editor-registry`
- `packages/pi-interaction/pi-interaction-kit`
- `packages/pi-interaction/pi-runtime-registry`
- `packages/pi-interaction/pi-trigger-adapter`
- `packages/pi-peer-messaging`
- `packages/pi-prompt-template-accelerator`

## Classification signal for the next root-owned wave

The `#601` audit confirmed that the original `legacy-full` bucket was not uniform, and the first routed follow-up wave has now proved that classification in practice:

- the current twenty-nine `legacy-full` package-local surfaces still carry both `docs/engineering.local.md` and `policy/engineering-lane.json`:
  - `packages/pi-agent-interaction-canary`
  - `packages/pi-agent-registry`
  - `packages/pi-agent-vent`
  - `packages/pi-autoresearch`
  - `packages/pi-better-openai`
  - `packages/pi-context-corpus`
  - `packages/pi-eval-kernel`
  - `packages/pi-context-overlay`
  - `packages/pi-context-packer`
  - `packages/pi-designmd-foundry`
  - `packages/pi-evalset-lab`
  - `packages/pi-evidence-review`
  - `packages/pi-interaction` (`package-group-root`)
  - `packages/pi-model-selection`
  - `packages/pi-modes`
  - `packages/pi-little-helpers`
  - `packages/pi-ontology-workflows`
  - `packages/pi-prompt-template-execution`
  - `packages/pi-provenance`
  - `packages/pi-semantic-code-intelligence`
  - `packages/pi-session-compaction`
  - `packages/pi-session-insights`
  - `packages/pi-snapshot-edit`
  - `packages/pi-society-orchestrator`
  - `packages/pi-society-startup-context`
  - `packages/pi-telemetry`
  - `packages/pi-toolbox-discovery`
  - `packages/pi-vault-client`
  - `packages/pi-workstation-inference-provider`
- `#634` proved the simple-package `none` path in `packages/pi-activity-strip`, and `#635` proved the matching monorepo-package `none` path in `packages/pi-autonomous-session-control`, so neither package still appears in the `legacy-full` bucket.
- `#636` has now landed the only distinct child-package `reduced-form` case: `packages/pi-interaction/pi-interaction/docs/engineering.local.md` remains as the local override note while `policy/engineering-lane.json` is gone.
- With those three representative pilots complete, the next routed wave is not another generic contract pass; it should refresh audit/readiness truth and materialize only the next smallest justified queue from the remaining boilerplate-only `none` targets.

## Per-package provisional target-state classification

| Package path | Current signal | Provisional target state | Routed next candidate |
|---|---|---|---|
| `packages/pi-activity-strip` | boilerplate doc copy (`sha256:04a5fb…0241f`) at a simple-package root | `none` | completed in `#634`; use as the first simple-package reference path for the generic boilerplate-only reduction |
| `packages/pi-autonomous-session-control` | same boilerplate doc copy at a monorepo-package root | `none` | completed in `#635`; use as the monorepo-package reference path for the same boilerplate-only reduction |
| `packages/pi-agent-registry` | new simple-package full surface for the standing-agent manifest registry | `review-first` | classify whether registry-specific release and engineering notes justify a local override before reducing |
| `packages/pi-agent-vent` | new simple-package full surface currently present after package introduction | `review-first` | classify whether the local diagnostics package has a real local override before reducing |
| `packages/pi-autoresearch` | boilerplate doc copy (`sha256:04a5fb…0241f`) at a simple-package root | `none` | package-local reduction candidate in `packages/pi-autoresearch` |
| `packages/pi-better-openai` | simple-package full surface currently present after package introduction | `review-first` | classify whether the OpenAI/image package has a real local override before reducing |
| `packages/pi-context-corpus` | package full surface for context-corpus analysis | `review-first` | classify corpus-specific validation and data-handling notes before reducing |
| `packages/pi-eval-kernel` | template-scaffolded full surface for the Python/JavaScript eval package | `review-first` | retain through released-line recovery and classify whether its code-mode-specific engineering notes justify a local override before reducing |
| `packages/pi-context-overlay` | boilerplate doc copy (`sha256:04a5fb…0241f`) at a simple-package root | `none` | package-local reduction candidate in `packages/pi-context-overlay` |
| `packages/pi-context-packer` | new simple-package full surface currently present after package introduction | `review-first` | classify whether the context-packer package has a real local override before reducing |
| `packages/pi-designmd-foundry` | simple-package full surface currently present after package introduction | `review-first` | classify whether the design-tool package has a real local override before reducing |
| `packages/pi-evalset-lab` | simple-package full surface currently present after package introduction | `review-first` | classify whether the evalset package has a real local override before reducing |
| `packages/pi-evidence-review` | template-scaffolded full surface for the read-only evidence consumer | `review-first` | classify whether the package retains a real local engineering override before any reduced-form migration |
| `packages/pi-interaction/pi-interaction` | distinct child-package doc retained after `#636`; keeps the package-specific typecheck/validation note without local policy metadata (`sha256:ce50c7…d6fa`) | `reduced-form` | completed in `#636`; use as the reference path for future child-package reduced-form reductions |
| `packages/pi-little-helpers` | boilerplate doc copy (`sha256:04a5fb…0241f`) at a simple-package root | `none` | package-local reduction candidate in `packages/pi-little-helpers` |
| `packages/pi-ontology-workflows` | boilerplate doc copy (`sha256:04a5fb…0241f`) at a simple-package root | `none` | package-local reduction candidate in `packages/pi-ontology-workflows` |
| `packages/pi-peer-messaging` | new simple-package scaffold already landing without package-local engineering overrides or local policy metadata | `none` | keep as a proof point that fresh simple-package scaffolds can land directly in the root-owned `none` steady state |
| `packages/pi-provenance` | simple-package full surface currently present after package introduction | `review-first` | classify whether provenance-specific local stack notes are real overrides before reducing |
| `packages/pi-semantic-code-intelligence` | recovered private native-Pi extension package with a full package-local engineering surface | `review-first` | retain through package-boundary recovery and startup-activation proof; classify the local override only in a later owner-scoped review |
| `packages/pi-session-insights` | new private simple-package full surface for deterministic session JSONL analysis | `review-first` | classify whether its jq/Node validation and privacy notes justify a real package-local override before reducing |
| `packages/pi-society-orchestrator` | boilerplate doc copy (`sha256:04a5fb…0241f`) at a simple-package root | `none` | package-local reduction candidate in `packages/pi-society-orchestrator` |
| `packages/pi-toolbox-discovery` | new simple-package full surface currently present after template-based package introduction | `review-first` | classify whether toolbox-specific local stack notes are real overrides before reducing |
| `packages/pi-vault-client` | boilerplate doc copy (`sha256:04a5fb…0241f`) at a simple-package root with adjacent template-verification responsibility | `none` | package-local reduction candidate in `packages/pi-vault-client`; when scaffold defaults change, route adjacent Nunjucks verification through this package |

## Routed next-candidate clusters

- **Cluster A — remaining boilerplate-only `none` targets:** `packages/pi-autoresearch`, `packages/pi-context-overlay`, `packages/pi-little-helpers`, `packages/pi-ontology-workflows`, `packages/pi-society-orchestrator`, and `packages/pi-vault-client` remain explicitly classified as boilerplate-only local surfaces. `#634` and `#635` have already proved the simple-package and monorepo-package reference paths for this cluster, and the next queue should stay narrow instead of opening a blanket migration backlog.
- **Cluster A2 — newly present full surfaces needing classification:** `packages/pi-agent-registry`, `packages/pi-agent-vent`, `packages/pi-better-openai`, `packages/pi-context-corpus`, `packages/pi-eval-kernel`, `packages/pi-context-packer`, `packages/pi-designmd-foundry`, `packages/pi-evalset-lab`, `packages/pi-evidence-review`, `packages/pi-provenance`, `packages/pi-semantic-code-intelligence`, `packages/pi-session-insights`, and `packages/pi-toolbox-discovery` currently appear in the `legacy-full` bucket, but their package-specific status should be reviewed before they are folded into the boilerplate-only reduction queue.
- **Cluster B — completed `reduced-form` reference path:** `packages/pi-interaction/pi-interaction` no longer sits in the `legacy-full` bucket; `#636` now serves as the reference path for the only child-package case that needed to keep a real local override doc while dropping local policy metadata.
- **Adjacent template/default follow-up:** if the next slice changes what fresh package scaffolds emit, route that change to `~/ai-society/softwareco/owned/pi-extensions-template`, then prove the live template lane through `packages/pi-vault-client` when Nunjucks verification is involved.

## First minimal package-local reduction queue

`#603` turned the classification into a deliberately small routed queue instead of a bulk migration backlog.
The first queue covered only the three distinct follow-up cases the classification exposed.
All three slices are now complete:

| Order | AK task | Package path | Why this is in the first queue |
|---|---:|---|---|
| 1 | `#634` | `packages/pi-activity-strip` | simple-package `none` pilot for the generic boilerplate-only reduction path |
| 2 | `#635` | `packages/pi-autonomous-session-control` | monorepo-package `none` pilot so the boilerplate-only path is proven on the one different root topology before opening more `none` targets |
| 3 | `#636` | `packages/pi-interaction/pi-interaction` | completed the only `reduced-form` child-package case by preserving the child-specific doc while removing only `policy/engineering-lane.json` |

Why the rest stay out of the first queue:

- `packages/pi-autoresearch`, `packages/pi-context-overlay`, `packages/pi-little-helpers`, `packages/pi-ontology-workflows`, `packages/pi-society-orchestrator`, and `packages/pi-vault-client` remain intentionally deferred even after all three representative pilots completed, so the next batch can be materialized explicitly instead of reopening all remaining package-local reductions at once.
- `packages/pi-vault-client` also keeps adjacent template-verification routing, which is not needed to prove the first queue.
- The first queue therefore stays small, representative, and sequential, and its completion is the signal to refresh AK/audit truth before opening the next justified follow-up batch.

## Routing notes

Use this audit before changing generated outputs.

Route follow-up work as follows:

- root migration contract + exact boundaries:
  - [reduced-form-migration-contract.md](reduced-form-migration-contract.md)
- template output changes:
  - `~/ai-society/softwareco/owned/pi-extensions-template/next_session_prompt.md`
- Nunjucks live verification:
  - `~/ai-society/softwareco/owned/pi-extensions/packages/pi-vault-client/next_session_prompt.md`
- session/handoff prompt wording and prompt-template work:
  - `~/ai-society/softwareco/owned/pi-extensions/packages/pi-prompt-template-accelerator/next_session_prompt.md`

## Practical interpretation

This audit does **not** by itself remove package-local `policy/engineering-lane.json` from existing packages.
The accepted steady states and routing boundaries are defined in [reduced-form-migration-contract.md](reduced-form-migration-contract.md).
It makes the current state explicit so template and package follow-up can distinguish:

- packages that still rely on the older full surface
- package roots already closer to reduced form
- package members with no local engineering review surface at all
- surfaces that still need routed package/template follow-up before `policy/engineering-lane.json` can disappear truthfully

Notable refresh outcome for the current alignment wave:

- `packages/pi-activity-strip` and `packages/pi-autonomous-session-control` sit in the `none` bucket after the two completed `none` pilots.
- `packages/pi-peer-messaging` now also sits in the `none` bucket as a fresh simple-package scaffold that landed directly in the root-owned steady state without local engineering duplication.
- `packages/pi-interaction/pi-interaction` remains in the `reduced-form` bucket after `#636`; the surrounding `packages/pi-interaction` package-group root is now a full engineering-core adoption surface.
- `packages/pi-agent-vent`, `packages/pi-autoresearch`, `packages/pi-better-openai`, `packages/pi-eval-kernel`, `packages/pi-context-overlay`, `packages/pi-context-packer`, `packages/pi-designmd-foundry`, `packages/pi-evalset-lab`, `packages/pi-evidence-review`, `packages/pi-little-helpers`, `packages/pi-model-selection`, `packages/pi-modes`, `packages/pi-ontology-workflows`, `packages/pi-provenance`, `packages/pi-semantic-code-intelligence`, `packages/pi-session-insights`, `packages/pi-society-orchestrator`, `packages/pi-toolbox-discovery`, `packages/pi-vault-client`, and `packages/pi-workstation-inference-provider` are among the current `legacy-full` package-local surfaces; `packages/pi-prompt-template-execution`, `packages/pi-session-compaction`, and `packages/pi-society-startup-context` also remain in that bucket.
- no package is currently in a `policy-only` intermediate state.
