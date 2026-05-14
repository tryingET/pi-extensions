---
summary: "Validation, rollout, and rollback plan for level-2 checkpointed campaign automation."
read_when:
  - "Validating an implementation slice for the level-2 checkpointed campaign automation ADR."
  - "Rolling out or disabling level-2 campaign automation."
  - "Checking required tests for launch/finalizer/evidence/cleanup token gates."
type: "validation_rollout_rollback"
status: "planned"
date: "2026-05-14"
decision: "AK decision #44"
adr: "docs/adr/2026-05-14-level-2-checkpointed-campaign-automation.md"
system4d:
  container: "Post-ADR validation, rollout, and rollback plan for level-2 campaign automation."
  compass: "Prove checkpointed automation stays below hidden execution and can roll back to level-1 runbooks."
  engine: "Define validation matrix -> rollout stages -> rollback triggers and commands."
  fog:
    risks:
      - "A generated packet is mistaken for owner authorization."
      - "Cleanup or promotion sneaks into finalizer logic."
      - "Rollback removes review evidence before it is archived."
---

# Validation, rollout, rollback — level-2 checkpointed campaign automation

## Validation matrix

Every implementation slice must run through a measured campaign closeout unless the task is explicitly classified as a small deterministic fix. Campaign closeout can use current level-1 visible mechanics while level-2 runtime helpers are being implemented.

Minimum campaign closeout evidence for implementation slices:

- AK execution task id;
- campaign target and primary blocker metric;
- matrix/candidate lane inventory or explicit no-candidate rationale;
- controller-verified changed-file inventory;
- package/root validation commands;
- candidate disposition table when visible candidates were used;
- rollback and cleanup disposition;
- AK evidence id after verification.

Every implementation slice must run the smallest truthful package tests plus the relevant contract tests below.

| Contract | Required proof |
| --- | --- |
| No hidden peer launch | Missing `launch_visible_candidate_lanes` token yields blocked packet; no peer tool is called. |
| No hidden finalizer | Missing `finalize_post_fanin` token yields blocked finalizer posture; no finalizer action is emitted. |
| No hidden evidence write | Candidate-result packet export remains non-authoritative and does not call AK/KES/Oracle/DSPx/Prompt Vault/ROCS writers. |
| Missing lane fail-closed | Missing expected lane creates blocker unless incomplete-matrix exception exists. |
| Duplicate lane fail-closed | Duplicate lane creates blocker unless explicit reconciliation exists. |
| Anti-narrowing | Proof-only/baseline-only output cannot close a real matrix target without explicit downgrade. |
| Cleanup gated | Worktree removal/branch deletion requires `candidate_cleanup` token. |
| Promotion gated | Merge, push, PR, release, and promotion require explicit owner token. |
| Level-1 fallback | Operator output names the level-1 playbook/runbook fallback. |

## Suggested package checks

For `pi-society-orchestrator` slices:

```bash
npm --prefix packages/pi-society-orchestrator run check
node --test packages/pi-society-orchestrator/tests/autoresearch-live-control-plane.test.mjs
```

For `pi-autoresearch` slices:

```bash
npm --prefix packages/pi-autoresearch run check
node --test packages/pi-autoresearch/tests/runtime.test.ts
```

For root documentation-only or cross-package docs changes:

```bash
node ~/ai-society/core/agent-scripts/scripts/docs-list.mjs --docs . --strict --require-system4d-path docs/adr/ --require-system4d-path docs/decisions/
git diff --check
ak direction check
```

Use narrower test-name filters when a full package test is too expensive, but record the reason and the exact command.

## Rollout stages

### Stage 0 — ADR recorded, no behavior changed

Current target state after this packet:

- ADR accepted;
- implementation plan attached;
- validation/rollout/rollback packet attached;
- no runtime behavior changed.

### Stage 1 — Packet-only planning

Enable only packet generation with missing-token posture. No peer launch, benchmark, export, review, cleanup, or promotion action is executed.

This stage should be implemented through a bootstrap measured campaign using current level-1 mechanics and the ADR's level-2 token vocabulary. The campaign must not claim the new level-2 helper exists until the slice lands.

Exit criteria:

- campaign closeout records `level2_packet_planning_blockers = 0`;
- tests prove packet-only behavior;
- operator output names tokens and forbidden actions;
- anti-narrowing posture is visible;
- level-1 fallback remains visible.

### Stage 2 — Binding and metrics over existing artifacts

Enable binding and metric computation over controller-supplied candidate outputs.

Exit criteria:

- missing and duplicate lane tests pass;
- candidate-result packets distinguish peer assertions from verified facts;
- no evidence write occurs.

### Stage 3 — Review-packet generation

Enable candidate-wave/matrix-review packet generation.

Exit criteria:

- anti-narrowing tests pass;
- review packet cannot claim promotion;
- owner next actions are explicit.

### Stage 4 — Finalizer-token request preparation

Enable finalizer-token request preparation only.

Exit criteria:

- finalizer remains blocked without exact token;
- cleanup and promotion remain separate token scopes;
- rollback to Stage 1 is documented.

## Rollback triggers

Rollback immediately to level-1 runbooks if any implementation slice:

- launches a peer without explicit launch token;
- writes AK/KES/Oracle/DSPx/Prompt Vault/ROCS without owner token;
- hides benchmark/export/review execution;
- deletes worktrees or branches without cleanup token;
- emits merge/release/promotion commands without owner token;
- treats peer text or local receipts as durable evidence;
- closes a real matrix target with proof-only output and no downgrade/exception record.

## Rollback actions

1. Disable the level-2 command or feature flag introduced by the slice.
2. Return operators to:
   - `docs/project/measured-implementation-wave-campaign-playbook.md`
   - `docs/project/2026-05-14-target3-whole-matrix-execution-controller-runbook.md`
3. Preserve candidate-result packets as non-authoritative review inputs unless cleanup is explicitly authorized.
4. Record an AK evidence note describing the failed boundary.
5. Open a corrective task or decision only if the ADR envelope itself needs to narrow.

## Release posture

Do not release a level-2 implementation slice until:

- package-local tests pass;
- root docs validation passes when docs changed;
- `ak direction check` passes;
- README/operator surface documents the exact token and fallback behavior;
- the implementation task records validation evidence.
