---
summary: "Task5480 public producer integration coordination and bounded implementation evidence."
read_when:
  - "Implementing or reviewing the separate-worker public task-session path."
type: implementation_evidence
task_id: 5480
---

# Task5480 — conditional public producer integration

## Coordination status (not activation authority)

Deployment binding `5a86a3646` / evidence8488 is the selected owner boundary: preserve ordinary AK pin
cdeef5bfedcb1b19ee18921008f876ecd05eb8ca, use a separately approved worker on the same canonical DB/flock.
Existing task5513 evidence/reports are immutable historical inputs, not runtime permission.

Initial targeted inspection found AK main at c7ab0e196 with no newly published separate-worker descriptor
schema/memo under its task-session contract/document surfaces. Awaiting the AK owner's exact schema,
fixed entrypoint/closure and publication semantics before writing producer verification. No guessed describe
command, consumer policy interpretation or source-status permit will be used. The construction fence is
still present at this coordination checkpoint; replacing it remains unfinished, not rejected in principle.

Independent bounded work: add DB-free profile discovery to the public CLI/Pi tool so an operator can find
existing profile hashes and exact requested/resolved labels without ad-hoc scripts or credential logging.
This does not provision a namespace/profile, publish a worker, grant admission or claim native readiness.
All tests must use isolated synthetic resources. No actual Astra mapping, live provider/configuration,
global AK pin, live namespace or installation action is authorized.


## Profile discovery slice verified

The owner early publication appeared during this slice: AK
`docs/project/2026-09-08-visible-task-session-separate-worker.md` and
`contracts/task-session-deployment-v1.json` plus fixtures were read in full. They declare descriptor.v1,
worker.v2, separate pins and fixed gate describe/plan/supervise/recover routes. Implementation/staging is
still pending in that owner's memo; source examples are not runtime permits. Integration may now target
these exact fields rather than inventing them.

Public CLI/Pi-tool `profiles` is implemented as bounded existing-only inspection (<=256 private profile
references). It discloses requested/resolved identities, reference and non-secret pin facts, reports
profile_preflight_passed/unavailable, and explicitly sets admissionAssessed/publicationPerformed:false.
No raw credentials, provider/AK calls, profile writes, namespace creation or automatic selection occurs.
A test-only OS-home shim relocates resources and throws on every subprocess/provider call while invoking
actual emitted CLI/Pi-tool code. Controls remain outside release files. Negative diagnostics do not echo
malformed credential contents; unexpected inventory entries refuse.

Verification: 150 focused tests; 590 declared little-helpers tests with explicit live-smoke skip and isolated
HOME; final source profile CLI/tool tests 3/3; 86 packed startup/review tests (including synthetic PTY) pass.
The first packed run found a test path pointing at scratch rather than the installed module; test root is
now derived from its actual imported module, and final packing passes. Receipt:
`$TMPDIR/task5480-pack-proof-V7s1mq/`. Little-helpers SHA256
14f3650042cf4e19862ded7706111c315d8a0697fede806a97d6dd22f55f4692 (324476 bytes / 152 entries);
orchestrator SHA256 32356f3d3cfa67f9d2aca59cf9b2b7e09418d8af72dbcbd4b6694083963beddd.
Logs: `$TMPDIR/task5480-public-{profiles,focused,check,pack}.log`.
This slice does NOT replace producer fencing or prove public G2; those remain current implementation work.
