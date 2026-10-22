---
summary: "AK7403: inspect both retained stashes, recover candidate-routing design/test intentions, and preserve non-adopted source without restoring stale receipts."
read_when:
  - "Looking for useful work retained in the two stashes inspected after AK7396."
  - "Resuming AK6427 without mistaking its historical logical-model guard for final-request enforcement."
type: "reference"
---

# Stash salvage — 2026-10-22

## Scope and result

AK7403 follows the operator's request to commit remaining work and salvage useful stash content.
This note recovers the useful design distinctions and test intentions below. It does **not**
restore old runtime code, activate a candidate worker, grant an exception to a task contract,
or certify historical test results. Both original stashes remain retained unchanged.

Compared against canonical commit `0da518922962a1f3f903cb70f93d2ab2f167e57c` and the
documentation-only artifact commits `a8633992f821a67d362c27408e5b66fec58ee698` and
`fa66090696d38b993b0f7b30104b36f7284afef6`. This is a dated observation, not continuing
AK authority. Read current task contracts before resuming implementation.

## AK7396 preservation stash

Stash object: `9e89ddfb6a8ebcdc496465b16a5bf33797554fbd`.

| Content | Observed comparison | Disposition |
|---|---|---|
| Three orchestrator diaries dated October 10–11 | Each untracked-parent blob exactly equals its tracked canonical blob | Already recovered through the reconciliation merge; no duplicate needed |
| Modified [authority-receipt.json](../../ontology/dist/authority-receipt.json) | Changes strict validation receipt to non-authoritative loose build receipt | Retain as historical generated output; do not overwrite current strict validation evidence |
| Deleted [authority-receipt.validate.json](../../ontology/dist/authority-receipt.validate.json) | Canonical tree contains the incoming validation receipt | Do not replay the deletion |
| Untracked ontology/dist/authority-receipt.build.json (stash only) | Reports `authoritative:false`, `best_effort_workspace_loose` | Preserve in stash, not as current validation evidence |

No ontology source or missing runtime implementation was found in this stash. This comparison
checks receipt contents; it does not independently certify the current ontology.

## AK6427 proposal stash

Stash object: `c1f3a7acc7d0eba9f7f5eefd3379b74a79acab50`.
Its first parent is the proposal base; its third parent holds three formerly untracked files.
Inspecting only the tracked diff would miss the handoff and both new test suites.

All paths in the following table are relative to `packages/pi-little-helpers/`.
None of the proposed additions is landed in the compared canonical source. A newer, uncommitted
consumer implementation remains in the existing `task/6427-exact-candidate-model` worktree;
use `git worktree list` and the current AK6427 contract to locate its owner-bound inputs.
That retained worktree was inspected, not changed, committed, retired or accepted by AK7403.

| Path | Inspection result | Salvage disposition |
|---|---|---|
| `README.md` | Proposal/identity limits, including now-stale blocker wording | Recover the distinctions below; do not add an unimplemented feature to current documentation |
| `extensions/sidequestCandidateSpawnTool.ts` | Old forwarding lacks newer executable qualification and strict request-pin integration | Do not restore; continue only from current AK6427 contract and retained newer source |
| `extensions/sidequestContracts.ts` | Proposed optional model selector; exact proposal blob also survives in the newer worktree | Preserve there; schema adoption must accompany supported behavior |
| `extensions/sidequestLaunchResult.ts` | Pure selection helpers plus old logical-model guard | Recover selection intentions; do not treat logical observation as request enforcement |
| `src/candidatePeerRegistry.ts` | Proposed selection metadata | Preserve selection-provenance versus inference-evidence distinction; no isolated type adoption |
| `tests/public-registration-characterization.test.mjs` | Old schema expectation; whole-file restoration would lose newer tab/observer assertions | Future integration must preserve current registrations and use the actually adopted schema |
| `tests/sidequest-candidate-model.test.mjs` (untracked parent) | Exact file also survives in newer worktree; imports helpers absent from canonical source | Recover acceptance intentions below, not an immediately runnable suite |
| `tests/candidate-peer-model.test.mjs` (untracked parent) | Old guard/argv wiring; newer worktree adds qualified-host and custody cases | Do not restore verbatim; adapt only under the current implementation contract |
| docs/project/2026-10-01-ak6427-exact-candidate-model-handoff.md (untracked parent; stash only) | Useful historical chronology, but historical task state and held commands are not current authority | Recover bounded excerpts/specifications here; full original remains in stash |

### Why the old guard is not safe to adopt

The stashed guard checks `ctx.model` and logical assistant metadata. It does not own final
serialized request identity: a later request transformation can change the physical request
without changing that metadata. The handoff explicitly acknowledges this limit. Restoring it
would not satisfy current AK6427 pre-reservation executable qualification, strict
`--request-identity` forwarding, public custody metadata and checked host-journal correlation.

The old executable tests are not independently useful additions to canonical CI: they import
missing helpers and assert the old guard wiring. Documentation salvage avoids either broken
imports or silently making weaker tests look like proof of the newer contract.

## Recovered design distinctions and acceptance intentions

From the historical handoff (untracked parent, lines 65–67):

> Availability uses `getAvailable()`: configured authentication presence, NOT token validity or a network inference. No catalog refresh, credential resolution or authentication repair is performed.

From its later disposition (lines 341–342):

> Host source completion cannot certify consumer deployment or AK6427 physical-request acceptance.

Useful acceptance intentions retained from the pure-selector suite (lines 17–134):

1. Explicit selection is exact and independent of catalog order/controller identity.
2. Omission does not inspect the registry or change inherited defaults.
3. Malformed, fuzzy, bare-name, duplicate and unavailable selections refuse; never borrow an
   account, synthesize a model or silently select a fallback.
4. Missing registry, catalog drift or mismatched logical identity fails the pure predicate.
   Passing that predicate is **not** final-request enforcement.
5. Thinking is requested through the host's capability mapping; requested is not proven effective.
6. Preserve existing permit, repository, company and effect-uncertainty constraints while adding
   selection. No selection preflight or fixture success grants candidate-launch permission.

These are recovered test intentions, **not newly executed assertions or adopted requirements**.
The handoff reports 17 pure checks and later filtered schema/refusal checks. AK7403 did not
reproduce those historical runs and does not use them to accept the current feature.

## Authority observations and next owner step

Installed AK readback on 2026-10-22:

| Task | Observed state | Meaning for recovery |
|---|---|---|
| AK6427 | pending | Consumer integration/live fidelity remains unfinished; read its current contract |
| AK6449 | done | Exact source/offline request-custody deliverable, not deployed consumer acceptance |
| AK6679 | done | Qualified catalog, not installed runtime capability |
| AK6905 | done | Public custody getter/lifecycle source qualification |
| AK6680 | done | Coherent emitted synthetic qualification, not installed/live adoption |
| AK6681 | pending | Package-owner build/closure disposition remains separately owned |
| AK6682 | pending | Exact installed host/consumer adoption remains separately owned |

The next useful implementation work belongs to those existing tasks, not a new duplicate
backlog or blind stash application. Re-read their exact authority, inspect retained newer
source and current registrations, then qualify the supported integration under its owner.
No old worker claim, command permission or lifecycle completion was resurrected here.

## Preservation and inspection limits

- Both stash object identities remain unchanged; no `pop`, `drop` or history rewrite.
- Older executable work remains in its original stash and existing task worktree.
- Raw cache-research originals were privately archived before producing the separately
  labelled [public redacted derivative](2026-10-18-sidequest-cache/README.md).
- Source/contract comparisons support the disposition. This note is not a live experiment,
  a new model-routing implementation, an exhaustive security audit or knowledge promotion.
- Exact private custody locations and execution receipts belong to AK7403 evidence, not the
  public research package. This public note intentionally contains no private session paths.
