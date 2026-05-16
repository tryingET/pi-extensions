---
summary: "Current-track review memo for the level-3 autonomous campaign runner RFC."
read_when:
  - "Before advancing AK decision #45 toward ADR."
  - "When checking whether the level-3 autonomous campaign runner RFC is ready or needs revision."
type: "review_memo"
status: "ready_for_adr"
date: "2026-05-14"
reviewed_artifact: "docs/project/2026-05-14-level-3-autonomous-campaign-runner-rfc.md"
decision: "AK decision #45"
review_outcome: "ready_for_adr"
system4d:
  container: "Current-track RFC review for level-3 autonomous campaign runner."
  compass: "Judge whether the level-3 RFC is strong enough for ADR without authorizing hidden authority inference."
  engine: "Review problem intent, level-2 closeout, and RFC -> identify blockers -> emit legal review outcome."
  fog:
    risks:
      - "Treating manifest policy as a broad blank check."
      - "Letting cleanup, AK writes, or promotion ride along with finalizer automation."
      - "Skipping receipt/audit requirements needed to roll back autonomous execution."
---

# Review — level-3 autonomous campaign runner RFC

Reviewed artifacts:

- problem intent: `docs/project/2026-05-14-level-3-autonomous-campaign-runner-problem-intent.md`
- predecessor closeout: `docs/project/2026-05-14-level-2-checkpointed-campaign-closeout.md`
- RFC: `docs/project/2026-05-14-level-3-autonomous-campaign-runner-rfc.md`

## Outcome

```text
ready_for_adr
```

## Findings

The level-3 chain is in the expected shape:

```text
level-2 closeout -> level-3 problem intent -> RFC/design -> review -> ADR
```

No blocking RFC revision is required before ADR.

## Why ready

- The problem is clearly different from level 2: manual slice sequencing and candidate lifecycle/closeout are now the bottleneck.
- The RFC recommends the correct middle path: manifest-driven autonomy with typed policy gates, not chat- or peer-text-driven autonomy.
- The proposed manifest, state machine, receipt model, token rules, rollback posture, and staged slices are specific enough for an ADR to authorize implementation without authorizing hidden execution.
- Owner boundaries remain explicit across `pi-society-orchestrator`, `pi-autoresearch`, visible peer/worktree tools, AK, KES, Oracle/DSPx, Prompt Vault, ROCS, and promotion surfaces.
- Dangerous actions remain separable: launch, measurement/export, finalizer, cleanup, AK writes, and promotion each require distinct policy/token gates.
- The RFC retains downgrade to level 2 as the safety fallback.

## Non-blocking ADR constraints

The ADR should carry these clarifications forward:

1. **Accepted manifest policy is not chat authority**: a manifest must be durable, scoped, validated, and explicitly accepted before policy may authorize actions.
2. **Receipts are not durable evidence**: level-3 transition receipts are audit inputs until projected through AK owner-write policy.
3. **Cleanup and promotion remain separate**: cleanup must require `candidate_cleanup` or exact manifest cleanup policy; merge/release/promotion must require a separate promotion token.
4. **AK writes are exact and deduped**: evidence/task completion must require `ak_owner_write`, exact task/cwd/manifest hash matching, and deterministic projection keys.
5. **Candidate lifecycle owner seam**: the ADR should name whether cleanup execution belongs in `pi-society-orchestrator`, `pi-little-helpers`, or a narrow shared seam before implementation widens.
6. **Rollback state is mandatory**: every automated transition must preserve a last-good receipt and level-2 fallback route.

## Recommendation

Proceed to ADR accepting Option B: **Level-3 governed manifest runner**, with the constraints above recorded as ADR requirements and implementation gates.
