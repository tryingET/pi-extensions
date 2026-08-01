---
summary: "Owner contract for immutable D2E Prompt Vault bindings and the applied/proposal workflow transfer gate."
read_when:
  - "Changing a D2E Prompt Vault binding or vault_execute_template workflow dispatch."
  - "Reviewing D2E_TRANSFER_COMPLETE_V1 receipts or fail-closed errors."
type: "implementation-contract"
system4d:
  container: "Pi-owned D2E Prompt Vault workflow dispatch gate."
  compass: "Only exact AK lineage plus a live un-deferred task claim can reach applied execution."
  engine: "Immutable binding -> exact readback -> authorization gate -> workflow executor -> receipt."
  fog: "Accepted decisions, proposal output, or generic proceed language can be mistaken for execution authority."
---

# D2E transfer workflow gate

Exactly three Prompt Vault procedures have immutable `workflow_execute` bindings to
`D2E_TRANSFER_COMPLETE_V1`:

- `layer12-040-direction-to-execution-ak-native` — owner `software`;
- `repo-direction-to-execution` — owner `holding`;
- `execution-memory-transfer` — owner `core`.

Every binding requires exact `procedure` / `one_shot` / `workflow` metadata and its listed owner.
There is no binding for the non-existent `direction-to-execution` template.

## Modes

- Caller mode defaults to `proposal` when omitted. `proposal` validates Prompt Vault artifact kind/owner/version/content identity and exact AK packet,
  task scope, canonical task intent/acceptance contract, decision, claimant, lease, and deferral
  readback. It is lawful read-only success, never prepares or dispatches a workflow, and returns the
  template, task-scope, and task-intent digests needed for a later explicit apply. Task intent binds
  the exact title and nullable description, complete done-contract (including required outcomes,
  validation, and review questions), and complete guardrails. When description is null, the title
  plus task-native contract/guardrails—not caller objective alone—controls execution.
- `applied` requires those exact proposal digests. A caller-supplied actor, the current Pi session
  identity, and the live AK claimant must be byte-equal. After workflow preparation and clean Git
  pre-state capture, it re-reads all AK state. Any packet, canonical task/decision link set, actor, entity version, lease,
  deferral, scope, task title/description/contract/guardrail, or decision drift refuses before
  dispatch. The caller objective must exactly select the live title or non-null description.
- Immediately after that second read, the exact Prompt Vault template and prepared bytes pass
  `authorizePreparedExecution` then single-use `claimPreparedExecution`; no asynchronous
  preparation occurs between claim and the ASC-backed workflow executor call.

A `done` status is insufficient. Completion requires a new committed HEAD, a clean worktree, exact
changed paths inside allowed scope and outside forbidden scope, all required path effects, one
closed `D2E_WORKFLOW_RESULT_V1` JSON object bound to canonical task intent, caller selector,
scope, heads, and paths, and a final unchanged AK actor/lease/deferral/scope/intent/packet/decision
readback. No-op and unrelated work fail.

## Authorization, readiness, effects, and schema boundary

Transfer materialization authorization is the exact live AK claimant/lease/deferral authorization
used by this gate. It does not grant downstream implementation authorization: every proposal and
completion receipt explicitly reports downstream implementation as `not_authorized` and requires a
separate downstream owner authorization.

A proposal reports `status: ready` only when materialization is both authorized and controller
activation is enabled; otherwise it reports `not_ready`. A missing, mismatched, or otherwise blocked
required packet fails with `status: not_ready` and no materialized effect. Every failure carries a
typed `D2E_TRANSFER_FAILURE_V1` envelope produced by the sequencer. The
envelope records its trusted `execution_phase`, required-packet disposition, transfer-materialization
authorization (including whether it existed at dispatch), separate downstream authorization, and
effect disposition. Adapters forward this envelope; they do not classify effects from error codes.

Effect disposition is `not_materialized` before dispatch, `indeterminate` after the executor is
invoked until final AK readback and Vault settlement both succeed, and `materialized` only in a
completed receipt. Preparation and initial required-packet failures are therefore
`not_materialized` / `not_authorized`. Final packet/task/contract/decision readback failures and
post-effect Vault settlement failures are `status: not_ready` / `effect: indeterminate` while
preserving the exact transfer authorization that existed at dispatch. If failure settlement also
fails, the envelope may advance to `execution_phase: vault_settlement`, but it preserves the
original readback boundary (including `required_packet: blocked`) and exact `original_cause`.
Downstream implementation authorization remains separately `not_authorized` in every case.

`D2E_WORKFLOW_RESULT_V1` is the closed inner output emitted by the one bounded workflow step. It is
never itself a transfer receipt. After repository effects and final AK state are verified, the gate
wraps its digest and observed effects in the outer `D2E_TRANSFER_COMPLETE_V1` receipt. That outer
receipt authorizes no work beyond the exact transfer materialization it records.

## Authority boundaries

The gate does not create, claim, defer, resume, complete, or otherwise mutate AK state. It does not
mutate Prompt Vault, grant authorization, publish, install, or infer implementation permission from
an accepted decision alone. In particular, Decision 87 task 4381 remains blocked while its explicit
operator-authorization deferral is active.

## Activation and rollback

The core sequencer defaults to disabled when activation is omitted, before any AK read, repository
inspection, Vault claim, preparation, or workflow effect. Applied execution remains disabled unless
the controller explicitly sets
`PI_ORCH_D2E_TRANSFER_MODE=enabled` after installed/live closeout proof. Rollback sets the value to
`disabled` or removes it. Proposal readback remains available, while applied execution stops before
workflow preparation, Vault claim, or side effects. Source tests, package checks, and packed dry
runs are not live installed proof and do not authorize controller activation.
