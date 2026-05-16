---
summary: "Validation, rollout, and rollback plan for the level-3 governed autonomous campaign runner."
read_when:
  - "Validating implementation slices for level-3 autonomous campaign runner."
  - "Rolling out, disabling, or downgrading level-3 campaign autonomy."
  - "Checking required tests for manifest policy, receipts, cleanup, AK writes, and promotion gates."
type: "validation_rollout_rollback"
status: "planned"
date: "2026-05-14"
decision: "AK decision #45"
adr: "docs/adr/2026-05-14-level-3-autonomous-campaign-runner.md"
system4d:
  container: "Post-ADR validation, rollout, and rollback plan for level-3 governed autonomous campaign runner."
  compass: "Prove manifest-governed autonomy moves faster without hidden authority or irreversible cleanup/closeout drift."
  engine: "Define validation matrix -> rollout stages -> rollback triggers and downgrade route."
  fog:
    risks:
      - "Accepted manifest policy silently widens into blanket authorization."
      - "Receipts are mistaken for AK evidence."
      - "Cleanup/task completion happens before operator-visible rollback is safe."
---

# Validation, rollout, rollback — level-3 autonomous campaign runner

## Validation matrix

Every implementation slice must run as a measured autoresearch campaign unless explicitly classified as a small deterministic fix.

Minimum campaign closeout evidence:

- AK execution task id;
- campaign manifest/packet identity and hash when available;
- campaign target and primary blocker metric;
- matrix/candidate lane inventory or explicit no-candidate rationale;
- controller-verified changed-file inventory;
- package/root validation commands;
- candidate disposition and cleanup posture;
- transition receipt inventory for level-3 surfaces;
- rollback/downgrade posture;
- AK evidence id after verification.

Required contract checks:

| Contract | Required proof |
| --- | --- |
| Manifest preflight | Invalid/missing manifest fails closed; chat text cannot substitute for accepted manifest. |
| No hidden launch | Missing launch policy/token blocks visible candidate launch. |
| Measurement/export gate | Measurement/export/review occurs only through approved `pi-autoresearch` seams and manifest policy. |
| Finalizer gate | No finalizer action without exact `finalize_post_fanin` token. |
| Cleanup gate | Cleanup requires exact `candidate_cleanup` token or accepted manifest cleanup policy naming exact worktrees/branches. |
| AK owner-write gate | Evidence/task writes require `ak_owner_write`, task/cwd/manifest hash match, and deterministic projection key. |
| Promotion separation | Merge/cherry-pick/push/PR/release/promotion require separate promotion token and are never bundled into cleanup/finalizer. |
| Receipt semantics | Transition receipts are local audit inputs, not durable AK evidence. |
| Anti-narrowing | Proof-only/baseline-only output cannot close a real matrix target without explicit downgrade/exception. |
| Rollback | Level-2 fallback and last-good receipt are visible at every stage. |

## Suggested checks

For `pi-society-orchestrator` slices:

```bash
git diff --check
node --test --test-name-pattern '<focused level-3 tests>' packages/pi-society-orchestrator/tests/autoresearch-live-control-plane.test.mjs
npm --prefix packages/pi-society-orchestrator run check
ak direction check
```

For docs-only decision/plan changes:

```bash
git diff --check
node ~/ai-society/core/agent-scripts/scripts/docs-list.mjs --docs . --strict --require-system4d-path docs/adr/ --require-system4d-path docs/decisions/
ak direction check
```

Use narrower test-name filters when full package checks are too expensive, but record the reason and exact command.

## Rollout stages

### Stage 0 — ADR recorded, no behavior changed

Current target after this packet:

- ADR accepted;
- implementation plan attached;
- validation/rollout/rollback packet attached;
- no runtime behavior changed.

### Stage 1 — Manifest schema and read-only preflight

Enable only manifest parsing, validation, policy posture, and no-action reporting.

Exit criteria:

- `level3_manifest_preflight_blockers = 0`;
- invalid/missing manifest tests pass;
- no peer launch, measurement, cleanup, AK write, or promotion can occur;
- level-2 fallback visible.

### Stage 2 — Slice sequencing dry-run

Enable dry-run state-machine sequencing and transition receipts.

Exit criteria:

- `autonomous_slice_sequence_blockers = 0`;
- receipts are produced and marked non-authoritative;
- dependency/policy blockers stop sequence;
- no lower-plane action executes.

### Stage 3 — Visible candidate lifecycle automation

Enable visible candidate launch and binding only through accepted manifest policy or exact launch token.

Exit criteria:

- `candidate_lifecycle_automation_blockers = 0`;
- launched lanes are scoped to task/cwd/files/off-limits/DoD;
- missing/duplicate lanes fail closed;
- cleanup remains plan-only unless cleanup gate is accepted.

### Stage 4 — Measurement/export/review automation

Enable manifest-approved measurement/export/review through `pi-autoresearch` seams.

Exit criteria:

- `candidate_measure_export_review_blockers = 0`;
- candidate-result packets bind to lanes;
- review packets remain non-authoritative;
- stale/missing/duplicate/proof-only cases fail closed.

### Stage 5 — Authorized finalizer and cleanup automation

Enable finalizer and cleanup actions only through exact gates.

Exit criteria:

- `authorized_finalizer_cleanup_blockers = 0`;
- finalizer token matching is exact;
- cleanup policy names exact worktrees/branches;
- cleanup does not imply merge/promotion;
- rollback receipt is preserved.

### Stage 6 — Authorized AK closeout automation

Enable AK evidence and task completion only through exact AK owner-write policy.

Exit criteria:

- `authorized_ak_closeout_blockers = 0`;
- projection key/deduping tests pass;
- task/cwd/manifest hash mismatch blocks closeout;
- failed AK write leaves manual level-2 closeout route visible.

## Rollback triggers

Rollback immediately to level 2 if the runner:

- launches a peer without accepted manifest policy or exact launch token;
- treats chat/peer text as manifest acceptance;
- runs measurement/export/review outside `pi-autoresearch` seams;
- applies finalizer without exact finalizer token;
- cleans worktrees/branches without cleanup policy/token;
- writes AK evidence or completes tasks without `ak_owner_write`;
- emits merge/release/promotion commands without promotion token;
- treats receipts, packets, or peer text as durable evidence;
- closes proof-only/baseline-only matrix work without downgrade/exception.

## Rollback actions

1. Disable the level-3 runner entrypoint/feature flag.
2. Preserve manifests, receipts, candidate-result packets, and review packets as non-authoritative review inputs.
3. Return operators to level-2 surfaces and runbooks:
   - `docs/project/2026-05-14-level-2-checkpointed-campaign-closeout.md`
   - `docs/project/2026-05-14-implementation-plan-level-2-checkpointed-campaign-automation.md`
   - `docs/project/2026-05-14-validation-rollout-rollback-level-2-checkpointed-campaign-automation.md`
4. Perform cleanup/evidence/task closeout only through explicit owner gates.
5. Record AK evidence describing the failed boundary.
6. Open a corrective decision if the level-3 authorization envelope needs to narrow.

## Release posture

Do not release a level-3 slice until:

- package-local tests pass;
- root docs validation passes when docs changed;
- `ak direction check` passes;
- README/operator surface documents the exact manifest/policy/token behavior;
- implementation task records validation evidence;
- candidate cleanup posture is explicit.
