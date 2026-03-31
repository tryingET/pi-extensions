---
summary: "Audit map for root-owned and package-local tech-stack review surfaces in the pi-extensions monorepo."
read_when:
  - "Reviewing whether tech-stack policy should stay centralized at monorepo root."
  - "Before changing package or template outputs for stack-lane metadata."
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
- reduced local form means keeping `docs/tech-stack.local.md` only when a package has a real local override to document

Current root-owned sources of truth:

- `docs/tech-stack.local.md`
- `scripts/validate-tech-stack-contract.mjs`
- [reduced-form-migration-contract.md](reduced-form-migration-contract.md)

## Live audit command

From repo root:

```bash
npm run tech-stack:review-surfaces
```

JSON form:

```bash
node ./scripts/tech-stack-review-surfaces.mjs --json
```

The script enumerates every package root under `packages/` and reports whether it still carries:

- package-local `docs/tech-stack.local.md`
- package-local `policy/stack-lane.json`
- package role (`package-root` vs `package-group-root`)
- scaffold mode when `x-pi-template.scaffoldMode` is present

## Current audit snapshot

Audited on 2026-03-31.

Snapshot summary:

- package roots audited: `14`
- legacy-full: `6`
- reduced-form: `1`
- policy-only: `0`
- no local surface: `7`

### Legacy full surface (`docs/tech-stack.local.md` + `policy/stack-lane.json`)

- `packages/pi-context-overlay`
- `packages/pi-interaction/pi-interaction`
- `packages/pi-little-helpers`
- `packages/pi-ontology-workflows`
- `packages/pi-society-orchestrator`
- `packages/pi-vault-client`

### Reduced-form package-local surface (`docs/tech-stack.local.md` only)

- `packages/pi-interaction` (`package-group-root`)

### Policy-only package-local surface (`policy/stack-lane.json` only)

- none

### No package-local tech-stack review surface today

- `packages/pi-activity-strip`
- `packages/pi-autonomous-session-control`
- `packages/pi-interaction/pi-editor-registry`
- `packages/pi-interaction/pi-interaction-kit`
- `packages/pi-interaction/pi-runtime-registry`
- `packages/pi-interaction/pi-trigger-adapter`
- `packages/pi-prompt-template-accelerator`

## Classification signal for the next root-owned wave

The `#601` audit confirms that the current `legacy-full` bucket is not uniform:

- the following five package-local `docs/tech-stack.local.md` files are still byte-identical boilerplate copies of the same simple-package note (`sha256:04a5fb…0241f`):
  - `packages/pi-context-overlay`
  - `packages/pi-little-helpers`
  - `packages/pi-ontology-workflows`
  - `packages/pi-society-orchestrator`
  - `packages/pi-vault-client`
- `#634` has now proven the simple-package `none` path in `packages/pi-activity-strip`, and `#635` has now proven the matching monorepo-package `none` path in `packages/pi-autonomous-session-control`, so neither package still appears in the `legacy-full` bucket.
- `packages/pi-interaction/pi-interaction/docs/tech-stack.local.md` is the only distinct child-package doc in the `legacy-full` set (`sha256:ce50c7…d6fa`) and still carries a package-specific typecheck/validation note.
- That classification work is now complete, so the next routed wave is not another generic contract pass; it is to prove only the smallest truthful package-local follow-up set.

## Per-package provisional target-state classification

| Package path | Current signal | Provisional target state | Routed next candidate |
|---|---|---|---|
| `packages/pi-activity-strip` | boilerplate doc copy (`sha256:04a5fb…0241f`) at a simple-package root | `none` | completed in `#634`; use as the first simple-package reference path for the generic boilerplate-only reduction |
| `packages/pi-autonomous-session-control` | same boilerplate doc copy at a monorepo-package root | `none` | completed in `#635`; use as the monorepo-package reference path for the same boilerplate-only reduction |
| `packages/pi-context-overlay` | boilerplate doc copy (`sha256:04a5fb…0241f`) at a simple-package root | `none` | package-local reduction candidate in `packages/pi-context-overlay` |
| `packages/pi-interaction/pi-interaction` | only distinct `legacy-full` doc; keeps a child-package typecheck/validation note (`sha256:ce50c7…d6fa`) | `reduced-form` | package-local child-package follow-up: keep the child-specific doc note, remove only `policy/stack-lane.json`, and align it with the `packages/pi-interaction` group-root doc |
| `packages/pi-little-helpers` | boilerplate doc copy (`sha256:04a5fb…0241f`) at a simple-package root | `none` | package-local reduction candidate in `packages/pi-little-helpers` |
| `packages/pi-ontology-workflows` | boilerplate doc copy (`sha256:04a5fb…0241f`) at a simple-package root | `none` | package-local reduction candidate in `packages/pi-ontology-workflows` |
| `packages/pi-society-orchestrator` | boilerplate doc copy (`sha256:04a5fb…0241f`) at a simple-package root | `none` | package-local reduction candidate in `packages/pi-society-orchestrator` |
| `packages/pi-vault-client` | boilerplate doc copy (`sha256:04a5fb…0241f`) at a simple-package root with adjacent template-verification responsibility | `none` | package-local reduction candidate in `packages/pi-vault-client`; when scaffold defaults change, route adjacent Nunjucks verification through this package |

## Routed next-candidate clusters

- **Cluster A — boilerplate-only `none` targets:** `packages/pi-context-overlay`, `packages/pi-little-helpers`, `packages/pi-ontology-workflows`, `packages/pi-society-orchestrator`, and `packages/pi-vault-client` remain explicitly classified as boilerplate-only local surfaces. `#634` and `#635` have already proved the simple-package and monorepo-package members of this cluster, and `#603` still keeps the broader queue intentionally narrow instead of opening a blanket migration backlog.
- **Cluster B — distinct `reduced-form` target:** `packages/pi-interaction/pi-interaction` remains the only package in the `legacy-full` bucket with a real local override candidate worth preserving as `docs/tech-stack.local.md` after `policy/stack-lane.json` disappears.
- **Adjacent template/default follow-up:** if the next slice changes what fresh package scaffolds emit, route that change to `~/ai-society/softwareco/owned/pi-extensions-template`, then prove the live template lane through `packages/pi-vault-client` when Nunjucks verification is involved.

## First minimal package-local reduction queue

`#603` turns the classification into a deliberately small routed queue instead of a bulk migration backlog.
The first queue covers only the three distinct follow-up cases the classification exposed.
`#634` and `#635` are now complete, so `#636` is the next ready slice:

| Order | AK task | Package path | Why this is in the first queue |
|---|---:|---|---|
| 1 | `#634` | `packages/pi-activity-strip` | simple-package `none` pilot for the generic boilerplate-only reduction path |
| 2 | `#635` | `packages/pi-autonomous-session-control` | monorepo-package `none` pilot so the boilerplate-only path is proven on the one different root topology before opening more `none` targets |
| 3 | `#636` | `packages/pi-interaction/pi-interaction` | the only `reduced-form` child-package case; preserve the child-specific doc while removing only `policy/stack-lane.json` |

Why the rest stay out of the first queue:

- `packages/pi-context-overlay`, `packages/pi-little-helpers`, `packages/pi-ontology-workflows`, `packages/pi-society-orchestrator`, and `packages/pi-vault-client` remain intentionally deferred even after the two completed `none` pilots, so the queue can stay small and move next to the only distinct `reduced-form` child-package case before opening a broader boilerplate-only follow-up batch.
- `packages/pi-vault-client` also keeps adjacent template-verification routing, which is not needed to prove the first queue.
- The first queue therefore stays small, representative, and sequential instead of reopening all remaining package-local reductions at once.

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

This audit does **not** by itself remove package-local `policy/stack-lane.json` from existing packages.
The accepted steady states and routing boundaries are defined in [reduced-form-migration-contract.md](reduced-form-migration-contract.md).
It makes the current state explicit so template and package follow-up can distinguish:

- packages that still rely on the older full surface
- package roots already closer to reduced form
- package members with no local tech-stack review surface at all
- surfaces that still need routed package/template follow-up before `policy/stack-lane.json` can disappear truthfully

Notable refresh outcome for the current alignment wave:

- `packages/pi-activity-strip` and `packages/pi-autonomous-session-control` now sit in the `none` bucket after the two completed `none` pilots.
- recent package/template alignment still leaves `packages/pi-context-overlay` and `packages/pi-little-helpers` in the same legacy-full bucket as the other remaining simple-package roots.
- no package is currently in a `policy-only` intermediate state.
- the only reduced-form local surface is still the `packages/pi-interaction` package-group root.
