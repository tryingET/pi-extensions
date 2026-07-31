---
summary: "Implemented rollout plan for composable, drift-aware pi-modes."
read_when:
  - "Reviewing pi-modes implementation coverage, validation, or remaining host integration work."
system4d:
  container: "Delivery and verification plan for the prompt-mode package."
  compass: "Land safe prompt composition while keeping execution authority out of modes."
  engine: "Kernel -> adapter -> observability -> release hardening -> fresh runtime dogfood."
  fog: "Feature breadth can hide unverified adapter, release-artifact, or live-host behavior."
---

# Implementation plan

## Implemented kernel

1. Strict schema v2 with legacy v1 reading, bounded fields/files, canonical keys, JSON schemas, and CLI linter.
2. Native/`replace_base`/exclusive `replace_final` base plus ordered `append` overlays.
3. Explicit `requires`, `conflictsWith`, `before`, and `after` validation without hidden graph mutation.
4. Global/builtin/trusted-ancestor precedence, per-file diagnostics, symlink/path guards, and atomic saves.
5. Chronological v1/v2/v3 replay with fingerprinted v3 migration and fail-closed drift.
6. Named composition presets with layered discovery and portable JSON/base64url import/export.
7. Composition report hashes, bytes, token estimates, provenance, drift, and fallback diagnostics.

## Implemented Pi adapter

1. Searchable atomic `/mode` selector with details, live summary, Apply/Cancel, ordering, and exact-final gates.
2. Scriptable semantic `+`, `-`, and exact `set` commands with role-aware completion.
3. Interactive exact-final confirmation and headless `--confirm-exact` acknowledgement.
4. JSON status/preview, explicit reapproval and drift policy commands.
5. Authoring that saves without activation and blocks changed active definitions until reapproval.
6. Named preset save/use/export/import/list commands.
7. `PI_MODES` structured startup precedence plus legacy `PI_MODE` compatibility.
8. No continuation, dispatch, campaign, mutation, promotion, or authority behavior.

## Release hardening

1. Reconcile package history from published/tagged `0.2.0` to candidate `0.3.0` and restore changelog truth.
2. Fail release checks when local SemVer trails npm; tolerate only an already-published same-version dry-run guard.
3. Constrain Pi peers to the tested `>=0.80.6 <0.81.0` range.
4. Preserve complete-output parity testing against the pinned Pi host builder.
5. Install the packed artifact into an isolated Pi agent directory and run extension behavior smoke.
6. Run package, root scoped, docs, diff, install/reload, fresh RPC, and fresh visible Pi dogfood before closeout.

## Acceptance scenarios

- Native plus ordered overlays.
- Replace-base plus real context and ordered overlays.
- Exact-final byte equality and confirmation gates.
- Constraint acceptance/rejection, including incremental breakage and exact atomic success.
- v1/v2 to fingerprinted v3 migration.
- Prompt/provenance drift block, explicit reapproval, and warn/allow policy behavior.
- Named preset save/off/use/export/import round trip.
- Search/filter/details/live selector summary.
- Machine status/preview and semantic errors in RPC/print surfaces.
- Trusted/untrusted ancestor mode and preset behavior.
- Packed-artifact registration and real fresh-host activation.

## Remaining upstream improvement

Propose a public Pi host builder or `systemPromptOptions` patch seam. Remove the package-local parity builder only after supported API adoption plus compatibility and live proof.

## Deferred autonomy

Autonomy remains outside `/mode`. Future measured/supervised execution must route through its owner and may consume only a non-authoritative prompt-composition snapshot. Modes and presets never carry execute bits, objectives, budgets, tool grants, or authority tokens.

## Rollback

- `/mode off` restores native host assembly for subsequent turns.
- Package disable/removal leaves Pi's native prompt files and flags unchanged.
- A pre-v3 downgrade may reveal an older v2 entry; explicitly select that version's off state or disable it.
