---
summary: "Refreshed inventory and bounded recovery order for the divergent legacy pi-extensions main line."
read_when:
  - "Selecting an IW7 recovery slice from the divergent July 2026 local main."
  - "Checking why wholesale merge, candidate-peer recovery, or stale package replay remains unsafe."
type: "reconciliation-plan"
status: "refreshed-second-slice-selected"
date: "2026-07-16"
---

# Main divergence reconciliation

## Decision

Do **not** merge the legacy local `main` wholesale and do not implement new package work in its dirty checkout.

Recover one completed package/topic at a time in a clean worktree rooted at current `origin/main`. Each recovery requires a fresh bounded AK task, current-target reconciliation, package and root validation, independent review, and an exact integration commit. Generated AK projections are not live authority and must not be replayed as package implementation.

The first bounded slice, `pi-evidence-review`, is complete on `origin/main` at `39ba1716632dead053859a4106b9236f5f4899cc`. The selected second slice is the schema-v9 dispatch-authorization correction from completed AK task `3896`, limited to four `pi-vault-client` runtime/test paths.

## Refreshed baseline

Captured after fetching `origin/main` and completing the first recovery slice:

| Surface | Value |
| --- | --- |
| legacy local `main` | `fac45ff6f681172b6fdcc1902bb7aa9155892324` |
| current `origin/main` | `39ba1716632dead053859a4106b9236f5f4899cc` |
| merge base | `68885841bd101e2bf42314b9dd8427c2620b13ea` |
| graph divergence | 83 local-side commits / 92 origin-side commits |
| patch-equivalent non-merge commits | 12 in each comparison |
| unique local non-merge patches | 69 |
| unique origin non-merge patches | 46 |
| paths changed from base on local side | 664 |
| paths changed from base on origin side | 284 |
| exact changed-path overlap | 184 |
| legacy dirty checkout | 355 changed paths with untracked files expanded (`20` modified, `335` untracked) |

The dirty checkout was not reset, cleaned, staged, or used as integration authority.

## Completed first slice

`pi-evidence-review` was recovered as a bounded package/root-routing slice and pushed to `origin/main`:

- AK task: `3971`;
- integration commit: `39ba1716632dead053859a4106b9236f5f4899cc`;
- package tree: `16bc18630e866b7b7f3037d7feff1691268890ea`;
- package tests: 28/28;
- scoped root gate, explicit-path TUI, bounded picker TUI, headless fail-closed behavior, and independent review: pass;
- follow-up AK evidence `4582` records the stable canonical package installation, fresh explicit-path/picker/headless proof, removal of the temporary source, and package-tree equality.

## Selected second slice

### `pi-vault-client` schema-v9 dispatch authorization correction

Recover the completed correction commit `8065b226dbdf976fafffb8ca59f7cf37904b0655` by reconciling its exact four-path change onto current `origin/main`:

```text
packages/pi-vault-client/src/dispatchRuntime.js
packages/pi-vault-client/src/dispatchRuntime.ts
packages/pi-vault-client/tests/dispatch-authorization.test.mjs
packages/pi-vault-client/tests/vault-dolt-integration.test.mjs
```

Why this is next:

1. AK task `3896` is complete with 53 focused tests, 249 package tests, live canonical-Vault proof, and independent/adversarial review in its result.
2. The patch is absent from `origin/main`.
3. Current `origin/main` still asks schema-v9 storage for a nonexistent `render_engine` column. Render selection belongs to content frontmatter and package-owned preparation identity, not a database column.
4. The correction also normalizes real Dolt boolean values and omitted nullable controlled vocabulary while preserving content-hash drift enforcement.
5. The four paths overlap the current target lineage: patch-equivalent base feature commit `a81e3dec` touches three, and origin-only fixture commit `6a82411a` touches the real-Dolt test. The correction still applies cleanly with offsets, so the slice must reconcile and retest current target content rather than replaying old snapshots blindly.

Do not replay the broader historical vault implementation or release commits. Reconcile only this correction and validate against current package/runtime dependencies.

## Ranked later candidates

These remain candidates, not authorizations:

| Rank | Slice | Boundary and leverage | Main caveat |
| ---: | --- | --- | --- |
| 1 | `pi-ontology-workflows` deterministic ROCS semantic runner | Highest semantic/runtime leverage; completed AK tasks `3820`, `3821`, `3871`–`3873` with evidence `4287`, `4288`, and `4329`–`4333` | Larger protocol slice; retain development-only/default-off posture and verify external ROCS/Pi compatibility |
| 2 | `pi-society-orchestrator` inert Layer-12 presentation contracts | Small ten-path slice, zero origin overlap, deterministic shadow corpus, repeated authority-laundering reviews | Historical direction names; must remain inert with no policy/default/authority wiring |
| 3 | `pi-context-packer` source-selection ablation harness | Small five-path correction commit `6b82075f` from completed AK task `3930`; informs whether provider wiring is worthwhile | Recover the task-backed harness only; do not imply positive experiment outcome or automatic wiring |
| 4 | `pi-session-compaction` host-owned model completion | Removes extension-local model ownership; AK task `3906` has live evidence | Must first verify the required Pi host patch is present in the active/upstream host |
| 5 | engineering-core exact-pin posture | Improves root governance and reproducibility | Historical local-file coordinate must be revalidated against the current engineering-core release; do not replay blindly |

Adaptive visible-loop and candidate-peer/spawn work are excluded while the emergency candidate-spawn hold remains active.

## Separate root-validation cleanup

Full strict documentation validation has a small independent baseline failure: four `packages/pi-interaction/*/CHANGELOG.md` files lack required documentation frontmatter/read-when metadata. Repair these only in a separate scoped task after the selected package slice; do not combine them with runtime recovery.

## Validation and evidence posture

This refresh used two independent read-only inventories:

- commit/path inventory: exact merge base, divergence, patch equivalence, net-path overlap, coherent commit boundaries, and validation commands;
- AK inventory: completed-task results, evidence IDs, target-tree presence, direction status, and owner-boundary caveats.

Both inventories rejected wholesale merge and candidate-spawn work. They differed on the smallest next candidate; the AK-backed vault correction was selected because it repairs a current released runtime/storage mismatch in only four paths, whereas the Layer-12 slice is inert presentation capability.

## Non-authorizations

This plan does not authorize:

- merging, resetting, cleaning, or deleting the legacy local checkout;
- replaying generated governance projections;
- combining multiple recovery slices;
- lifting the candidate-spawn hold;
- publishing a package merely because its recovery checks pass;
- activating semantic-preflight, presentation, experiment, or model-host behavior by default;
- treating historical task completion as current integration authority.

Every implementation slice requires its own bounded AK task and current-target proof.
