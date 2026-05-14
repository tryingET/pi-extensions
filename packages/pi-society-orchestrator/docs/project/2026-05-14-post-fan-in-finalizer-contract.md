---
summary: "Runtime contract candidate for the post-fan-in finalizer preflight/result/apply-packet surface."
read_when:
  - "You are implementing or reviewing autoresearch post-fan-in finalizer runtime behavior."
  - "You need the exact runtime checks for finalize_post_fanin."
type: "contract"
system4d:
  container: "Runtime contract candidate for pi-society-orchestrator post-fan-in finalizer."
  compass: "Keep finalizer behavior explicit, gated, and fail-closed after fan-in review."
  engine: "Verify selected fan-in packets and validation receipts -> emit exact apply packet or block."
  fog: "The main risk is confusing an apply command packet with hidden promotion or evidence authority."
---

# Post-fan-in finalizer contract candidate

`autoresearch.post_fanin_finalizer_contract.v1` is a package-local runtime candidate for the step after `review_candidate_wave` or `review_matrix_campaign` fan-in.

## Contract

The finalizer is a governed preflight/result surface, not hidden promotion. It checks:

- finals present: selected lane packet evidence exists and the source review is selection-ready
- validation passed: explicit validation command/evidence is supplied as passed
- off-limits clean: selected changed files do not match off-limits specs
- dirty overlap clean: selected changed files do not overlap supplied dirty controller/parent files
- selected lane consistent: requested lane/cell matches reviewed selection and has branch/worktree/base/file proof
- review artifacts current: selected packets are not newer than the supplied review timestamp

## Outcomes

- `failed_closed` — any preflight blocker or wrong authorization token
- `review_blocked` — preflight passed, but explicit apply authorization has not been supplied
- `committed_cleaned` — exact authorization token matched and an apply command packet was emitted for the controller/apply lane

`committed_cleaned` does **not** mean `pi-society-orchestrator` ran checkout, merge, commit, cleanup, evidence, AK/KES, Prompt Vault, ROCS, or promotion. It means the finalizer result reached the terminal authorized posture and exposed `autoresearch.post_fanin_finalizer_apply_command_packet.v1` for an explicit apply lane.

## Metric

The proof metric is `manual_post_fanin_residue` (lower is better, target `0`). It reaches `0` only when preflight passes and the exact authorization token is supplied.
