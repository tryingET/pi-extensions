---
summary: "AK5597 closed failed-as-superseded on 2026-09-19 by operator authorization: its gated 0.84.4 qualification goal was withdrawn (9807, 9846), never achieved (SDK 0/10); provisioning succeeded only under AK5702. Corrects the same-day resume handoff."
read_when:
  - "Resuming, auditing or citing AK5597 after 2026-09-19."
  - "You followed the 2026-09-19 AK5597 resume handoff or the 2026-09-10 progress doc."
  - "A later Pi upgrade asks whether 0.84.4 was qualified."
type: reference
---

# AK5597 supersession reconciliation — 2026-09-19

The [2026-09-19 resume handoff](2026-09-19-ak5597-resume-handoff.md) asked a new
session to re-claim AK5597 and build a new inert offline-provisioning proposal from
the [2026-09-10 progress doc](2026-09-10-offline-provisioning-progress.md). Its
premise was stale. This note records what is actually true, why, and the disposition
the operator authorized.

## Disposition

AK5597 is closed **failed as superseded**. It is not closed as done and not qualified.
The operator authorized this in session on 2026-09-19 ("do 2 after analysis if this
is really the correct way") after being shown the options. The exact AK evidence
and transition ids are listed at the end.

The closure says only what the record supports:

- No 0.84.4 compatibility pass or fail is asserted, and SDK consumption was neither
  proven nor disproven.
- AK5597 provisioned nothing. All six attempts under it were refused.
- The repository's 0.84.4 alignment did not come from AK5597.
- The task's done contract is not satisfied (see close-check below).
- No run was disposed and no artifact removed by this closure.
- 5659, 5661, 5618, 5624, 5639, 5640 and 5694 are untouched; see Follow-ups.

## What happened after the 2026-09-10 doc

The 2026-09-10 doc was written at attempt 3. AK evidence continues well past it:

| Evidence | Task | Fact |
| --- | --- | --- |
| 8879, 8898, 8916, 8933, 8949 | 5597 | Offline-provisioning attempts V1–V5, all refused |
| 9054 | 5597 | Pre-node observation passed (not provisioning) |
| 9072–9104 | 5597 | Production isolation port, fixtures 9+53, V6 packet review |
| 9177 | 5597 | V6 (run-1789118712): 166 npm commands passed, host export refused on a PAX long-directory trailing-slash defect; retained failure |
| 9178–9192 | 5659 | Defect diagnosed, 8 PAX fixtures pass; repair lineage continues under 5689 |
| 9601 | 5702 | Isolated core-SDK provisioning and complete host tar export **accepted** (run-1789244315, tar `c589c1e3…`) — under 5702, not 5597 |
| 9793 | 5694 | M3 real SDK scenarios 0/10; remaining owner contracts held |
| 9807 | 5733 | Operator adopted 0.84.4 as repository development baseline **without** SDK qualification ("make the sdk unnecessary") |
| 9846, 9851 | 5738 | Operator: "get rid of the sdk"; bespoke SDK qualification/provisioning machinery removed in `6a3c7fef` |
| 9936–9961 | 5743, 5746 | Main converged and pushed at `e54cc3a3` |
| 10026 | 5597 | Heavy-job retained-run deadlock fixed (`ab4bef84`); environment note, grants nothing |

## Step 1 reverification against disk (2026-09-19)

- HEAD `a203c01a7` (adds the handoff, local only) on `origin/main` `e54cc3a39`;
  `6a3c7fef` is an ancestor. No `scripts/pi-host-compatibility-canary/artifact-provision*.py`
  exists on HEAD or on disk.
- Source clone `S/ak5597-source.nINZEw58/repo` is still detached at `ea457b21`.
  Four provisioning files match the 2026-09-10 pins. `artifact-provision-worker.py`
  (`8e0f5fac…`) and `artifact-provision-tests.py` (`b1db2f21…`) no longer match
  them (`f2840a1f…`, `bfd66ac6…`), consistent with the later production-port and
  PAX work. Freeze `w44wc6vr` is present; its digest was not recomputed.
- `~/.cache/ai-society-scratch/runs/` is empty. Failure records remain for the four
  AK5597-labelled runs 1788975594, 1789018508, 1789025931 and 1789118712.
- No task depends on 5597. `ak task close-check 5597`: `ready_to_close: false`,
  missing class `isolated_qualification` and the qualification outcomes/validation.

## Corrections to the 2026-09-19 handoff

1. The preserved `~/.local/state/heavy-job-preserved/ak5597-offline-provisioning/provisioned-tree.tar`
   (161,361,920 bytes, sha256 `bccd9c52927e3e88176dd33a479e9fa31b5a48c69e91a5585c1928e2016cdcda`)
   is the **V6 retained failure (9177)**, not the "third run". V3 (8916) produced no
   tar, pre-node or export.
2. It is not the only copy. The 9177 export directory
   `S/ak5597-offline-provision-v6-after9054/export-parent/ak5597-offline-provisioning-v6-after9054/`
   still holds the byte-identical tar, `pre-node.json` (`83cfd036…`), `worker.json`
   (`177667a8…`), `incomplete.json` and `inventory.jsonl.partial` (`00cafcf3…`).
   The heavy-job fix lost none of AK5597's evidence.
3. The 2026-09-10 doc was not the controlling state; see the table above.
4. "Steps 1, 3, 4 and 5 stand unchanged" is wrong. Step 3 edits files that main no
   longer has, would duplicate the accepted 5702 export, and contradicts 9807/9846.

## Why failed-as-superseded, not done

Adjudicated with Prompt Vault `many-of-the-greats` v3 by an independent read-only
reviewer and the controller separately; both reached the same result.

- **Truthful authority record** decides the verb. A terminal `done` is a claim that
  future readers act on. The goal was *qualify before aligning*; the operator removed
  the gate (9807) and retired the machinery (9846). That withdraws the goal, it does
  not achieve it by another route.
- **Successor accounting** loses on the verb but decides the content. This AK closes
  `done` / `completed_via_successor` only when a successor delivered the goal (5238).
  Withdrawn scope closes `failed` / "Superseded" (5234, 5208, 5205, 5672). No
  successor qualified anything, so the error text cites what successors did deliver.
- **Operator sovereignty** decides timing. An expired lease is not consent, and
  every successor declined to touch this claim. The claimant session is dead, so the
  operator is the only authority left, and the operator authorized it.
- **Preservation** decides prerequisites. The option value lives in the evidence,
  the docs, the exports and the Git preimages, not in an open task bound to 0.84.4 and
  deleted scripts. Record first, and dispose of nothing.

Leaving the task open is not neutral. It shows false P1 work in progress, and a global
`ak task release-expired` would drop it into `ak task ready` with no deferral. A later
session could then restart the retired campaign from this record.

## Root cause

Work moved from 5597 to successors (5659, 5689, 5702, 5694, 5738) with the
supersession recorded only on the successors. The no-foreign-claim-takeover norm and
the no-silent-rewrite norm (9851) each held correctly, but together they left 5597
undisposable by anyone except the operator, and nobody asked. So 5597's own record
kept asserting a withdrawn premise. A cross-lane session then read the newest
5597-named doc and a heavy-job run label, not the evidence tail or the successor
graph, and wrote a handoff that prescribed the retired path and misattributed the tar.

This closure writes the missing edge on the origin task. The same pattern still holds
the tasks below.

## Follow-ups for the operator (not done here)

Dead session `session-01a08914-…` still claims these, all with expired leases:

- **5659** (repair V6 export): repair appears to have reached 5702 through 5689.
  Plausibly `completed_via_successor`; verify the lineage first.
- **5618, 5624, 5639** (workstation, guarded removal of one run each): each removed
  its own target through its guarded path, with verified exact-removal evidence
  (8798 and 8799, 8847, 9008). Their goals appear met; they were never completed
  because the claimant died. Verify, then close `done`.
- **5661** (preserve and gate removal of V6 run `run-1789118712-2b5ae9355131321a`)
  has no evidence of its own. The generic fix `ab4bef84` released "both AK5597 runs"
  (10026), probably including this one. Confirm that before writing closure text.
- **5640** (exact 29-path union composition) is claimed by the same session.

Not claimed, but open under the same direction:

- **5694** (M3 successor, pending, deferred) and the related pending M3 tasks 5703,
  5705, 5725, 5726 and 5732 (no dependency edges are recorded) need their own
  decision under 9846. Closing 5597 makes 5694's
  "preserve 5597 claims" clause historical, not violated.

(Corrected 2026-09-19 before commit: the first version listed 5694 as claimed, omitted
5640 and 5705, and attributed all four targets to `ab4bef84`, although 5618, 5624 and
5639 removed theirs themselves. Evidence 10027 and 10028 carry the original list.)

## AK record of this disposition

All on 2026-09-19 by controller `session-146ca35d-5fa1-4aad-bdde-bbb0712515e3`:

1. `ak task unclaim 5597` released the expired claim of `session-01a08914-…`.
2. `ak task claim 5597` under this controller.
3. Evidence **10027** `operator_disposition_authorization`: the operator's message,
   limited to 5597, with no takeover of any other task.
4. Evidence **10028** `supersession_reconciliation`: the facts, corrections, root
   cause, preservation and not-claimed list in this note.
5. `ak task fail 5597` at 03:12:35Z with the "Superseded without qualification
   verdict" error text, citing 10027 and 10028.
