---
summary: "Closeout note for real candidate-peer registry cleanup dogfood."
read_when:
  - "Reviewing Level-4 cleanup registry-sidecar dogfood evidence."
  - "Checking whether candidate_peer_cleanup was exercised end-to-end."
system4d:
  container: "pi-extensions dogfood evidence note."
  compass: "Verify exact-id candidate cleanup readiness before promotion."
  engine: "Records observed runtime/tool behavior, not AK/KES/Oracle durable authority."
  fog: "Temp repo artifacts may be removed after cleanup; registry/archive sidecars remain audit aids."
---

# Candidate peer registry cleanup dogfood closeout — 2026-05-17

## Scope

Dogfooded the real candidate cleanup path for `pi-society-orchestrator` Level-4 cleanup packets and `pi-little-helpers` `candidate_peer_cleanup` against a temporary repo.

## Runtime facts

- Temp repo: `/tmp/pi-orch-real-candidate-i8NssH`
- Candidate peer run id: `candidatepeer-mp9mn0o4-74743ca2`
- Registry sidecar: `/home/tryinget/.local/state/pi-quests/peer-registry/candidatepeer-mp9mn0o4-74743ca2.json`
- Candidate branch: `candidatepeer/create-a-tiny-candidate-change-for-cleanup-registry-dogfood-add-candida-f109ba51f4`
- Candidate worktree: `/home/tryinget/.local/state/pi-quests/worktrees/pi-orch-real-candidate-i8nssh-15aaa390/candidatepeer-create-a-tiny-candidate-change-for-cleanup-registry-dog-b22dd665e7`
- Archive directory: `/home/tryinget/.local/state/pi-quests/archives/candidatepeer-mp9mn0o4-74743ca2`

## Positive path observed

- `candidate_peer_spawn` created an isolated candidate worktree and registry sidecar.
- Intercom watch observed `PEER_ACK` and `PEER_FINAL` with no protocol violations.
- Autoresearch candidate-result export succeeded after emitting parser-compatible `METRIC cleanup_registry_dogfood_blockers=0`.
- Level-4 `level4_autoresearch_campaign_runner` consumed the real binding and reported:
  - registry sidecar status: `verified_registry_sidecar`
  - cleanup dry-run call: prepared
  - cleanup execute call: prepared only after synthetic successful closeout input
  - blockers: none
- `candidate_peer_cleanup` dry-run reported `execution: dry_run_plan_only` and exact archive/worktree/branch cleanup commands.

## Negative path observed

A Level-4 packet with the same peer id but an intentionally wrong `candidateWorktree` reported:

- registry sidecar status: `mismatched_registry_sidecar`
- blocker: `controller candidateWorktree does not match registry worktreePath`
- cleanup dry-run call: withheld
- cleanup execute call: withheld
- exact fallback cleanup commands: withheld

## Executed cleanup

After explicit operator approval, `candidate_peer_cleanup` ran with:

- `peerRunIds: ["candidatepeer-mp9mn0o4-74743ca2"]`
- `execute: true`
- `closeVisibleResources: true`
- `integrationCloseoutStatus: "successful"`

Observed command results were all `code 0`:

1. `terminate-exact-sidequest-process`
2. `archive-metadata-and-diff`
3. `remove-worktree`
4. `delete-candidate-branch`

Post-cleanup verification:

- registry sidecar remains for audit
- candidate worktree removed
- candidate branch removed
- archive directory exists with `metadata.json`, `status.txt`, `diff.patch`, `staged.diff.patch`, `head.txt`, and `branch.bundle`

## Boundary

This note records dogfood observations only. It is not AK/KES/Oracle durable evidence, not a merge/promotion decision, and not authority to run future destructive cleanup without exact sidecars and explicit closeout approval.
