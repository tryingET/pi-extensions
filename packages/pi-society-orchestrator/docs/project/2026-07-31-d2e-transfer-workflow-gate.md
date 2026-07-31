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

The Prompt Vault procedures `direction-to-execution`, `repo-direction-to-execution`, and
`layer12-040-direction-to-execution-ak-native` share one immutable `workflow_execute` binding:
`D2E_TRANSFER_COMPLETE_V1`.

## Modes

- `proposal` performs exact AK packet, task, decision, and task-claim authorization readback. It is
  read-only, never calls the workflow executor, and emits `D2E_TRANSFER_PROPOSAL_V1` with
  `applied: false`.
- `applied` repeats the same readback immediately before handoff. It requires one canonical packet
  link to the exact accepted/unblocked decision and post-ADR task, plus a live claimed task lease
  with no active deferral. Missing or drifted state fails closed with a stable
  `D2E_TRANSFER_*` error.

After authorization, the gate delegates one bounded builder step through the existing ASC-backed
workflow executor. The exact repo, packet, task, decision, and task-scope boundary are included in
that step. A `D2E_TRANSFER_COMPLETE_V1` receipt exists only when exactly one step returns `done`.

## Authority boundaries

The gate does not create, claim, defer, resume, complete, or otherwise mutate AK state. It does not
mutate Prompt Vault, grant authorization, publish, install, or infer implementation permission from
an accepted decision alone. In particular, Decision 87 task 4381 remains blocked while its explicit
operator-authorization deferral is active.
