---
summary: "AK6999 atomic handback: inherited-GID host-proof repair, pinned completion-result caller-shape clarification, and fresh AK6881 duplicate verification; closed AK6872 and accepted security limits unchanged."
task_id: 6999
read_when:
  - "Reproducing the native owner proof under setgid scratch ancestry."
  - "Explaining AK6872's historical advisory missing mappings without reopening its completion."
  - "Reconciling duplicate AK6881 with AK6898's existing offline-artifact fix."
---

# Atomic handback cleanup — AK6999

## Authority and scope

The operator requested Prompt Vault `atomic-completion` (`text_ok`). A native
interview explicitly approved a new exact scoped task, **AK6999**, and conditional
completion after proof; **15455** records that authorization. Scripts/tests/docs
only; no runtime, manifest, lock, SQLite, Node22 or external-owner change. The same
interview authorized fresh verification and conditional closure of duplicate
**AK6881**, not reimplementation or takeover of AK6634.

AK6872 remains completed under its accepted trusted-engine contract. Its closed
result, contract, evidence 15271 and completion history are not replayed or repaired.
Read `ak task show` and `ak evidence task` for final lifecycle/evidence; this document
is a projection, not a replacement for receipts.

## Findings and dispositions

| Finding | Classification | Action |
| --- | --- | --- |
| Owner-proof inherited GID | Reproducible host qualification defect | Normalize only the fresh test-owned dependency inode to the primary GID before controls; retain real same-inode foreign-owner rejection/restoration |
| Proof-runner interrupted cleanup | Newly surfaced test-process lifecycle risk | Use `spawn` with a real private process group; causal interruption proof checks group IDs, readiness, prompt rejection and descendant disappearance rather than natural exit |
| AK6872 advisory missing result matches | Caller payload shape, not established product defect | Read-only source inspection at approved AK pin; correct future payload example below; additive clarification, no closed-result mutation |
| Pending duplicate AK6881 | Existing fix already delivered by done AK6898 | Fresh empty-private-cache/offline artifact and integrity-control proof; use original task for authorized duplicate disposition, no new code fix |
| Trusted-engine residual risks | Explicitly accepted limitations | Preserve SQLite, Node<25 opt-in bypasses, same-UID/root/signals/hardlinks/protocol ambiguity; no OS containment claim or new authorization inferred |

Independent inspection `dispatch-1791690531311` found no new runtime blocker in the
bounded final-verification diff; it identified the inherited-GID issue. This is not
exhaustive discovery or proof that all package/workspace debt is eliminated.

## Real setgid-ancestry proof

Before the repair, the actual script fails when its scratch parent uses mode 2700
and an operator secondary group (observed group 965): the namespace cannot change
ownership of an inode with an unmapped inherited group. Restoring `0:0` could also
fail the original-GID assertion. That is a fixture assumption, not an admission bug.

`scripts/native-owner-proof.ts` now normalizes the fresh dependency file's GID before
its baseline. It still proves admitted -> foreign UID rejected -> restored admitted
on the same inode/mode/size, with restored content hash unchanged. No production file
or directory is normalized.

Reproduce the inherited-group regression from the package root:

```bash
node --import tsx scripts/native-owner-group-proof.ts
```

This is explicit host qualification, not portable CI or a skipped test. It requires
Linux user namespaces/subordinate mappings, util-linux/newuidmap/newgidmap, an ordinary
non-root operator and a secondary group. It creates only private test-owned directories,
sets their real group/setgid bit, then runs the actual owner proof once under primary
and once under secondary-group ancestry. Each run asserts actual inheritance and
normalization, foreign rejection and restored admission. Missing prerequisites fail.
Observed on Node 22.23.3 and 26.9.0: inherited 1000/965 -> normalized 1000, both controls
pass. No native engine, network, sudo or workstation configuration operation occurs.

The group runner uses `owner-proof-process.ts` to create a private process group with
`spawn`, bound output and deadline, and kill the owned group on interruption/error.
An early draft incorrectly used `execFile({detached:true})`; a trace showed it did
not create that group and an initial weak test waited for natural sleeper exit. Those
intermediate results are not accepted cleanup proof. Reproduce the corrected proof:

```bash
node --import tsx scripts/native-owner-process-proof.ts
```

It first proves normal execution, then waits for a real test-owned Node child and
user-namespace sleeper to become ready, checks their host process-group IDs, aborts,
and requires both PIDs gone within five seconds (not the sleeper's 60-second natural
exit). Final Node22/Node26 observations: both gone, cleanup 1 ms. These are fixture
lifecycle observations, not a hostile-descendant isolation guarantee.

## Completion result shape — source-grounded clarification

The approved AK source pin inspected read-only was
`1c0085b658f41d5ca7c227ed3de6c2549e3f402b`; bundle
`616fdb32cbb5c37ea60906439377b8e8ccd39040`. Inspection:
`dispatch-1791690786775`, owner repo `softwareco/owned/agent-kernel`.

At that pin, `crates/ak-core/src/tasks.rs:163–165` names done-contract fields
`required_outcomes` and `required_validation`. The **result consumer** at 1305–1315
instead collects `outcomes` / `completed_outcomes` / `summary`, and `verification` /
`validation` / `validations`. Lines 1094–1147 collect strings and recursive arrays,
ignore objects, and match exact case-sensitive contract strings. CLI close-check
reads stored `Task.result`, not a proposed replacement.

For example, if the actual contract contains these exact strings:

```json
{"outcomes":["An exact required outcome."],"validation":["An exact required validation."]}
```

Arrays of strings are the recommended multi-entry form; scalar strings are also
accepted under the recognized keys. Object maps do not contribute entries, including
strings used only as object keys. Explanatory evidence mappings can coexist under
another field. Result matches alone do not satisfy evidence-class or required-reconciliation
checks.

AK6872 used object mappings named `required_outcomes` and `required_validation`.
Those are not consumed by this pinned matcher, explaining the observed missing
matches without establishing an AK product defect. Historical advisory
`ready_to_close:false` remains truthful; the report's `advisory:true` was never false.
No database, completed result, contract or AK implementation was changed to fabricate
readiness. Current new-task completion uses the consumer's accepted keys/types.

## Duplicate AK6881

AK6898 already delivered the checksum-bound local production dependency fixture.
Fresh tests now verify: package-local legacy `.scratch/npm-cache` absent before and
after; a fresh empty private npm cache asserted by the test; unreachable loopback
registry; unchanged packed extension installed with `--offline`; authored/installed
version and lock integrity checked; stale/tampered fixtures rejected. Direct artifact
and integrity-control tests pass 3/3 with zero skips on Node22 and Node26.

This settles the original cache-priming defect; it does not certify other dependencies,
upstream CI, browser configuration, image backports or source-owner containment.

## Atomic completion boundaries

All newly surfaced local task-shaped items above are paid in this pass. There is no
new deferred fix disguised as prose. Accepted limitations remain in the
[residual assessment](2026-10-10-ak6872-residual-assessment.md). Separately owned
browser/dependency/image work remains in its existing AK tasks; no lifecycle is
inferred or changed except explicitly authorized AK6881 and this exact AK6999.
Publication, ordinary push and parent AK6634 completion remain unauthorized.
