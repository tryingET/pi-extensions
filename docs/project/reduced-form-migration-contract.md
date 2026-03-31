---
summary: "Root migration contract for moving remaining legacy-full package tech-stack surfaces to truthful reduced-form targets."
read_when:
  - "Planning follow-up work for packages still audited as legacy-full in the monorepo root audit."
  - "Deciding whether a package-local tech-stack surface should keep docs, policy metadata, both, or neither."
system4d:
  container: "Root-owned migration contract for package-local tech-stack review surfaces."
  compass: "Keep shared stack policy centralized at root and route local reductions to the smallest truthful owner."
  engine: "Read root stance -> classify package topology -> choose target local form -> route follow-up to the correct repo/package."
  fog: "The main risk is bulk-removing package-local files without preserving real local overrides or the validation boundaries that still belong to packages/templates."
---

# Reduced-form migration contract — remaining legacy-full package surfaces

## Contract decision

- Root keeps the shared stack-policy truth in:
  - `docs/tech-stack.local.md`
  - `scripts/validate-tech-stack-contract.mjs`
- The only accepted **steady states** for package-local tech-stack review surfaces are:
  1. **none** — no local tech-stack surface when the package has no real local override to document
  2. **reduced-form** — `docs/tech-stack.local.md` only when the package truly needs a local override or routing note
- `legacy-full` (`docs/tech-stack.local.md` + `policy/stack-lane.json`) is a transitional state, not the desired end state.
- `policy-only` is **not** an accepted migration target; do not remove the doc while leaving `policy/stack-lane.json` behind as the new steady state.
- New packages/templates should not introduce new legacy-full local surfaces by default.

## Why the root defines this here

- The root audit already classifies live package state in [tech-stack-review-surfaces.md](tech-stack-review-surfaces.md).
- Existing packages still differ by topology and local validation contracts, so the root has to define the boundary before local deletions happen.
- Some follow-up work belongs outside the immediate package path, especially template defaults and adjacent verification lanes.

## Allowed migration sequence

1. Confirm the package's current audit classification in [tech-stack-review-surfaces.md](tech-stack-review-surfaces.md).
2. Decide whether the package has a **real local override** worth keeping in `docs/tech-stack.local.md`.
3. Update package-local docs/scripts/tests first so no package still treats `policy/stack-lane.json` as a required steady-state truth source.
4. Remove `policy/stack-lane.json` only in the same change that lands the truthful target state:
   - keep `docs/tech-stack.local.md` only if a real local override remains
   - otherwise remove both local surfaces
5. Validate from the smallest truthful scope:
   - root: `npm run quality:pre-commit` / `npm run quality:pre-push`
   - package: package-local `npm run check`
6. Refresh the root audit after any package migration wave.

## Exact routing boundaries

### Root owns

- shared stance, contract, and audit docs:
  - `docs/tech-stack.local.md`
  - [tech-stack-review-surfaces.md](tech-stack-review-surfaces.md)
  - this document
- shared helpers that classify or validate the contract:
  - `scripts/tech-stack-review-surfaces.mjs`
  - `scripts/validate-tech-stack-contract.mjs`
- root bootstrap/handoff docs that tell operators where follow-up belongs:
  - `README.md`
  - `next_session_prompt.md`

### Template repo owns

- default scaffold output for newly generated packages:
  - `~/ai-society/softwareco/owned/pi-extensions-template`
- use the template repo when the change is about what fresh package scaffolds should contain by default, rather than retrofitting one already-generated package

### Package-local follow-up owns

- removing or keeping `policy/stack-lane.json` inside an existing package
- editing package-local `docs/tech-stack.local.md`, `README.md`, `AGENTS.md`, scripts, or tests to match the truthful local target
- proving the package still validates after the local surface change

### Routed adjacent verification owners

- Nunjucks live verification for template changes:
  - `packages/pi-vault-client/next_session_prompt.md`
- session/handoff prompt wording and prompt-template changes:
  - `packages/pi-prompt-template-accelerator/next_session_prompt.md`

## Current legacy-full packages and their routed target

| Package path | Topology | Provisional target state | Audit basis | Routed owner |
|---|---|---|---|---|
| `packages/pi-activity-strip` | simple-package root | `none` | boilerplate doc copy (`sha256:04a5fb…0241f`); no distinct local override recorded at root | package-local follow-up in `packages/pi-activity-strip` |
| `packages/pi-autonomous-session-control` | monorepo-package root | `none` | same boilerplate doc copy; no distinct local override recorded at root | package-local follow-up in `packages/pi-autonomous-session-control` |
| `packages/pi-context-overlay` | simple-package root | `none` | boilerplate doc copy (`sha256:04a5fb…0241f`); no distinct local override recorded at root | package-local follow-up in `packages/pi-context-overlay` |
| `packages/pi-interaction/pi-interaction` | package member under reduced-form group root | `reduced-form` | distinct child-package doc (`sha256:ce50c7…d6fa`) still carries a package-specific typecheck/validation note | package-local follow-up in `packages/pi-interaction/pi-interaction` with group-root context |
| `packages/pi-little-helpers` | simple-package root | `none` | boilerplate doc copy (`sha256:04a5fb…0241f`); no distinct local override recorded at root | package-local follow-up in `packages/pi-little-helpers` |
| `packages/pi-ontology-workflows` | simple-package root | `none` | boilerplate doc copy (`sha256:04a5fb…0241f`); no distinct local override recorded at root | package-local follow-up in `packages/pi-ontology-workflows` |
| `packages/pi-society-orchestrator` | simple-package root | `none` | boilerplate doc copy (`sha256:04a5fb…0241f`); no distinct local override recorded at root | package-local follow-up in `packages/pi-society-orchestrator` |
| `packages/pi-vault-client` | simple-package root with adjacent template-verification responsibility | `none` | boilerplate doc copy (`sha256:04a5fb…0241f`); adjacent verification routing does not by itself justify a local stack doc | package-local follow-up in `packages/pi-vault-client` plus template-verification lane when scaffold defaults change |

## Non-goals of this contract

- It does **not** authorize a one-shot root-only mass deletion of every remaining `policy/stack-lane.json`.
- It does **not** replace package-local validation or documentation decisions.
- It does **not** move prompt-template wording or Nunjucks verification into the root repo by accident.
- It does **not** claim that every existing package should keep a local `docs/tech-stack.local.md`; many packages should ultimately land in the `none` state.

## Practical rule

When in doubt:
- change root docs/scripts only when the shared contract itself is changing
- change package files only when a specific package's truthful local state is changing
- change the template repo only when new scaffolds would otherwise keep generating legacy-full surfaces
