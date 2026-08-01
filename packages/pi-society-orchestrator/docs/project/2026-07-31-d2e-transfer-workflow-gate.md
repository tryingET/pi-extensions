---
summary: "Owner contract for legacy D2E transfer gates and the separate Decision 100 execution-memory consumer."
read_when:
  - "Changing a D2E Prompt Vault binding or vault_execute_template workflow dispatch."
  - "Reviewing D2E_TRANSFER_COMPLETE_V1 receipts or fail-closed errors."
type: "implementation-contract"
system4d:
  container: "Pi-owned D2E Prompt Vault workflow dispatch gate."
  compass: "Keep legacy transfer materialization separate from Decision 100 negative-only execution memory."
  engine: "Immutable binding -> owner-native observation -> fail-closed receipt; only legacy gates retain an executor."
  fog: "Accepted decisions, proposal output, or generic proceed language can be mistaken for execution authority."
---

# D2E transfer workflow gate

Two legacy Prompt Vault procedures retain immutable `workflow_execute` bindings to
`D2E_TRANSFER_COMPLETE_V1`:

- `layer12-040-direction-to-execution-ak-native` — owner `software`;
- `repo-direction-to-execution` — owner `holding`.

`execution-memory-transfer` — owner `core` — is deliberately separated onto
`D2E_EXECUTION_MEMORY_V1`. That consumer invokes only the exact immutable Decision 100 AK producer
and can emit only a read-only, non-executable `D2E_EXECUTION_MEMORY_OBSERVATION_V1` receipt.

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

## Decision 100 execution-memory consumer

The `execution-memory-transfer` path does not run the legacy packet/task/contract/decision
reconstruction and never derives authorization from claimant, session, lease, admission, decision,
or deferral state. It executes one exact immutable binary invocation:

```text
<immutable-ak> decision execution-memory-check <decision-id> \
  --profile d2e-transfer-v1 --repo <repo> \
  --packet-id <id> --packet-key <key> \
  --packet-source <immutable-github-blob> \
  --packet-source-sha256 <sha256> \
  --expect-task <id> --expect-dependency <id>:<dependencies> \
  --machine
```

Before spawning, Pi resolves the configured binary to its real path and verifies its raw SHA-256.
It then validates the closed machine envelope, exact profile/schema/database/capability contract,
request echo, profile health, and negative-only authorization shape. Unknown schemas, profiles,
codes, states, fields at the interpreted boundaries, malformed output, killed processes, transport
failure, binary drift, or schema-40 rejection all fail closed.

`ok=true` means only that AK produced one canonical coherent observation. Even
`pre_execution_memory_ready=true` can result only in
`memory_ready_authorization_blocked`, `memory_ready_authorization_unproven`, or
`memory_ready_authorization_indeterminate`. Pi always reports `applied_ready=false`, both transfer
and downstream authorization as `not_authorized`, and `effect.disposition=not_materialized`.
Applied mode is structurally unsupported and cannot reach preparation, Prompt Vault claim,
repository inspection, workflow dispatch, task mutation, or cached optimistic readiness.

## Authority boundaries

The gate does not create, claim, defer, resume, complete, or otherwise mutate AK state. It does not
mutate Prompt Vault, grant authorization, publish, install, or infer implementation permission from
an accepted decision alone. In particular, Decision 87 task 4381 remains blocked while its explicit
operator-authorization deferral is active.

## Activation and rollback

Both paths are disabled by default before any owner read or effect.

- Legacy applied transfer remains disabled unless the controller explicitly sets
  `PI_ORCH_D2E_TRANSFER_MODE=enabled` after its own installed/live closeout proof.
- Decision 100 observation remains disabled unless the controller sets
  `PI_ORCH_D2E_EXECUTION_MEMORY_MODE=enabled` and supplies exact
  `PI_ORCH_D2E_AK_BIN` plus `PI_ORCH_D2E_AK_SHA256` values from the immutable R4 receipt.

Execution-memory rollback removes or disables its mode and clears/fences any consumer-held receipt;
the implementation keeps no readiness cache. Disabled mode refuses before binary inspection or
spawn. Producer absence/error, unknown schema/code, or stale caller data cannot become execution.
Applied mode remains impossible even while observation is enabled.

Source tests, package checks, and packed dry runs are not installed proof. R6 requires the exact
installed Pi package and AK binary against disposable schema-40/schema-41 subjects with bounded
no-effect evidence.
