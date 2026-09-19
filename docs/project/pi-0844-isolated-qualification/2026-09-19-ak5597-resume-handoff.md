---
summary: "SUPERSEDED the same day: premise stale, AK5597 closed failed-as-superseded; read 2026-09-19-ak5597-supersession-reconciliation.md instead. Original: AK5597 resume handoff, 2026-09-19: the claim is 8 days stale, the heavy-job retained-run deadlock that refused the third provisioning attempt is fixed and cleared, and the preserved third-run artifact is outside the scratch root."
read_when:
  - "Resuming AK5597 offline provisioning after 2026-09-19."
  - "You expected the three stranded heavy-job runs and they are gone."
type: reference
---

# AK5597 resume handoff — 2026-09-19

> **Superseded 2026-09-19.** Do not follow the steps below. The 2026-09-10 doc was
> not the controlling state, the preserved tar is the V6 failure (9177), not the third
> run, and the provisioning path was retired by the operator (9807, 9846). AK5597 is
> closed failed-as-superseded (10027, 10028). See the
> [supersession reconciliation](2026-09-19-ak5597-supersession-reconciliation.md).
> The text below is kept unchanged as written.

Written by the dspx session that fixed the heavy-job retention deadlock. It changes the
**environment** AK5597 runs in; it changes nothing about AK5597's own governance, and it
grants no admission.

## Read these first, in order

1. [2026-09-10 offline provisioning progress](2026-09-10-offline-provisioning-progress.md)
   — the controlling state, especially "Next legal steps".
2. [2026-09-10 offline provisioning audit](2026-09-10-offline-provisioning-audit.md).
3. [2026-09-09 artifact acquisition source review](2026-09-09-artifact-acquisition-source-review.md).

## What changed under you

**The claim is stale.** `ak task show 5597` reports
`claimed_by: session-01a08914-49b7-7187-a076-63b6f3e00e58`, lease expired
**2026-09-11T11:36:38Z**. No live session holds it (checked 2026-09-19). Release and
re-claim before any work:

```
ak task unclaim 5597
ak task claim 5597 --agent "<your-agent-id>"
```

**The heavy-job deadlock is fixed and the queue is empty.** Admission was refused for
every lane: three retained runs from boot `78e6cbd0…` could never be cleaned, because
`protected_process_baseline` is keyed `pid:start-time` and no post-reboot process can be
in a pre-reboot baseline. Root cause, fix and tests:
`infra/workstation/docs/project/2026-09-19-heavy-job-boot-aware-retained-cleanup-rfc.md`
(r7) and commit `ab4bef84`. `retained_run_count` is now **0 of 5**.

Consequences for this campaign:

- **Your two stranded runs are gone**: `ak5597-artifact-acquisition` and
  `ak5597-offline-provisioning`. Their **failure records are preserved** in
  `~/.cache/ai-society-scratch/records/`.
- The third run's "guarded target-only disposition" in step 2 of Next legal steps is
  **moot** — no eight-identity comparison, no per-run disposition plan is needed. That
  step can be struck; steps 1, 3, 4 and 5 stand unchanged.
- **The 155M artifact was preserved before cleanup**, byte-identical, at
  `~/.local/state/heavy-job-preserved/ak5597-offline-provisioning/`
  (`provisioned-tree.tar`, `pre-node.json`, `worker.json`). Treat it as prior-attempt
  output, not as accepted input.
- A D154/D160 age deferral is no longer needed to be admitted. Admission is ordinary.

## What is NOT granted

No provisioning attempt is authorized by this note. Your own next legal steps still
govern: a NEW inert proposal updating only current worker/contract pins, sizes and
freeze; independent source/effect review; **fresh owner D154 admission**; one bounded
attempt; stop and preserve on refusal. Do not add generalized tracing, waive guards,
prune records or edit old baselines.

## Suggested first moves

1. Re-claim the task; reverify current source, freeze and the third-failure evidence
   (8916) against what is actually on disk now.
2. Record in a dated continuation doc that step 2 is discharged by the environment fix,
   citing `ab4bef84`, so the next reader does not re-derive the disposition plan.
3. Build the new inert proposal (step 3) and take it to independent review.
4. Stop at the owner admission boundary and ask.

The repository working tree has 45 uncommitted paths (38 untracked). Establish what is
yours before committing anything, and commit explicit paths only.
