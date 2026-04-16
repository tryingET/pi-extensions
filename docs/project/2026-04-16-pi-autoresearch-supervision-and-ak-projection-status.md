---
summary: "Umbrella status note for the bounded pi-autoresearch supervisor and AK milestone projection wave in pi-society-orchestrator."
read_when:
  - "You need the shortest truthful answer to what AK umbrella task 1473 actually landed."
  - "Before claiming pi-autoresearch now has orchestrator-side supervision and AK milestone projection support."
type: "reference"
system4d:
  container: "Repo-root umbrella closure note for the bounded pi-autoresearch supervision and AK milestone projection wave."
  compass: "State exactly what the orchestrator now owns above the package runtime without overstating this slice as a full autonomous control plane."
  engine: "Map child-task outputs -> describe the new supervision/projection surfaces -> record the bounded proof and remaining non-goals."
  fog: "The main risk is claiming the supervisor/projector code is already a live always-on campaign loop when the current landing is still a bounded reusable seam plus proof."
---

# 2026-04-16 — `pi-autoresearch` supervision and AK projection status

## Why this note exists

AK umbrella task `#1473` — `[UMBRELLA] Add orchestrator supervision and AK milestone projection for autoresearch campaigns` — depended on four narrower slices:

- `#1474` — define the autoresearch AK milestone projection contract
- `#1475` — add the autoresearch supervisor machine to `pi-society-orchestrator`
- `#1476` — implement the autoresearch AK milestone projector in `pi-society-orchestrator`
- `#1477` — run an end-to-end autoresearch proof with supervisor + AK projection evidence

Those child tasks are now landed.
This note closes the umbrella by stating the smallest truthful current answer to:

- what `pi-society-orchestrator` can now do above the `pi-autoresearch` runtime
- what kind of AK writes are now supported
- what the bounded end-to-end proof actually proved
- what still remains outside this umbrella

## What is now real

## 1. The first supervision layer above the package runtime now exists

`packages/pi-society-orchestrator` now includes a bounded autoresearch supervisor machine:

- `packages/pi-society-orchestrator/src/loops/autoresearch-supervisor.ts`

This supervisor is intentionally coarse.
It does **not** mirror every runtime micro-transition.
Instead, it observes the bounded runtime/ledger seam exposed by `pi-autoresearch` and classifies that package state into one of a small set of supervision outcomes such as:

- configured
- monitoring
- decision required
- rebaseline needed
- finalize candidate
- blocked
- completed
- projection blocked

This means the repo now has a truthful control-plane layer that can look at package runtime truth and decide whether a durable AK-facing milestone is warranted.

## 2. The orchestrator can now derive compact AK milestone candidates from package runtime truth

`packages/pi-society-orchestrator` now includes an AK projector runtime surface:

- `packages/pi-society-orchestrator/src/runtime/autoresearch-ak-projector.ts`

That surface can now:

- observe a bounded `pi-autoresearch` runtime snapshot
- derive a projectable milestone candidate
- map that milestone to a durable AK `check_type`
- build a compact structured `details` payload
- keep a deterministic `projection_key` for idempotence

The projectable milestone set remains deliberately small:

- `configured`
- `decision-required`
- `rebaseline-needed`
- `finalize-candidate`
- `blocked`
- `completed`

Transient runtime states still remain package-local.

## 3. AK writes are now bounded, anchored, fail-closed, and idempotent

The projector implementation follows the earlier contract rather than inventing a second runtime:

- it requires an **exact AK task id** as the campaign anchor
- it writes **evidence only**, not task lifecycle state
- it fails closed when runtime/ledger integrity is not trustworthy
- it verifies the campaign cwd stays within the anchored repo
- it deduplicates repeated unchanged projections via `projection_key`

So the new AK binding is now real, but it remains intentionally narrow:

- no heuristic task search
- no auto-create task
- no auto-complete task
- no auto-fail task
- no mirroring of every benchmark/check/event transition into AK

## 4. The path is now proven end to end through the real `ak` evidence surface

The final child task added a bounded proof note:

- `docs/project/pi-autoresearch-e2e-proof.md`
- `diary/2026-04-16--pi-autoresearch-e2e-proof.md`

That proof showed that a real bounded campaign snapshot built from:

- `autoresearch.jsonl`
- `autoresearch.events.jsonl`
- actual `pi-autoresearch` runtime helpers
- actual orchestrator supervisor/projector logic

can now produce one attached AK milestone evidence row through the real `ak evidence record` path, and that unchanged re-projection dedupes cleanly.

This closes the end-to-end verification item named in the AK projection contract.

## Authority snapshot after the umbrella

| Concern | Current truthful owner | Why |
|---|---|---|
| Executable experiment-loop state, receipts, and ledger replay | `packages/pi-autoresearch` | This remains package-local runtime behavior |
| Coarse supervision and milestone classification above that runtime | `pi-society-orchestrator` | This is coordination logic above the package runtime |
| Durable campaign task identity and attached evidence truth | AK | This remains campaign/task authority |
| Durable setup / next-hypothesis / finalize procedures | Prompt Vault | These remain governed decision procedures |

## What this umbrella does **not** mean

This umbrella should **not** be read as having implemented any of the following:

- a live always-on autoresearch supervisor loop in the extension runtime
- automatic polling or automatic milestone projection from a background process
- automatic AK task creation, completion, or failure
- Prompt Vault decision execution inside the live runtime loop
- autonomous multi-step campaign supervision beyond the bounded reusable supervisor/projector seam
- installed-package release smoke for this exact supervisor/projector path

The current landing is best described as:

- a **bounded supervision machine**
- a **bounded AK milestone projector**
- a **bounded end-to-end proof**

It is **not** yet the full autoresearch control plane.

## Child-task mapping

| Task | Commit | Landed surface |
|---|---|---|
| `#1474` | `5e22218` | projection-only AK milestone contract + diary |
| `#1475` | `590430e` | bounded autoresearch supervisor machine + tests |
| `#1476` | `be1053b` | AK milestone projector + tests |
| `#1477` | `243980c` | isolated end-to-end proof note + diary |

## Verification for umbrella closure

The umbrella was closed by:

1. verifying all four dependency tasks were completed
2. re-running package validation for `packages/pi-society-orchestrator`
3. confirming the package still exposes the supervisor and projector surfaces under test
4. confirming the bounded end-to-end proof now exists as a durable repo artifact
5. recording this umbrella status note so later sessions do not over-claim the current landing

## Bottom line

`#1473` is complete when read as the bounded wave that gave `pi-autoresearch`:

- an orchestrator-side supervisor machine above the package runtime
- an anchored, fail-closed, idempotent AK milestone projector
- a real end-to-end proof that one bounded campaign milestone can become attached AK evidence

What still comes next is not “invent the first projector.”
That is now landed.
What still comes next is any broader runtime integration above this seam, such as:

- live invocation/polling policy
- richer operator-facing supervision surfaces
- Prompt Vault decision execution inside the runtime lifecycle
- later task-lifecycle automation if the repo explicitly decides it is warranted
