---
summary: "Validation, rollout, and rollback note for the first bounded workflow-composition slice in pi-society-orchestrator: preserve ASC step truth, fail closed on invalid routing/worktree cases, and keep convenience surfaces subordinate to the workflow core."
read_when:
  - "After ADR acceptance for decision 20 and before claiming the first workflow-composition slice is safe to roll out."
  - "When you need the minimum truthful rollout and rollback posture for chain/parallel/worktree UX over ASC."
type: "reference"
system4d:
  container: "Package-local validation and rollout contract for workflow-composition UX over ASC in pi-society-orchestrator."
  compass: "Prove the thin workflow layer without mutating ASC step truth or turning convenience surfaces into authority."
  engine: "Name the invariants -> map each implementation unit to proofs -> stage rollout conservatively -> define rollback triggers that restore the prior posture cleanly."
  fog: "The main risks are hidden execution drift away from ASC, permissive worktree behavior, or wrapper/persistence surfaces quietly becoming the real model."
---

# Validation / rollout / rollback — first bounded workflow-composition slice for `pi-society-orchestrator`

## System4D summary
- boundary: package-local rollout/rollback contract for the first workflow-composition slice above ASC in `packages/pi-society-orchestrator`
- primary driver: prove the thin workflow layer without mutating ASC step truth or promoting wrappers/persistence into authority
- main risks: hidden execution drift away from ASC, permissive worktree behavior, or convenience adapters quietly becoming the real model

## Validation posture

The first workflow-composition slice is only truthful if all of the following are proven:

1. routing/team validation fails closed before execution starts
2. all step execution still flows only through ASC's public seam
3. step status and `failureKind` remain ASC truth and are not reinterpreted locally
4. chain/parallel summaries remain clearly orchestrator-owned aggregation
5. worktree dirty-repo and incompatible-cwd cases fail closed if worktree support lands
6. commands or wrappers, if added, remain thin adapters over the same workflow core
7. `src/chains.yaml` remains non-authoritative unless a later explicit adapter decision says otherwise
8. workflow output does not become canonical task/evidence authority by convenience

Interpretation rule:
- the slice is only truthful if it preserves both accepted splits at once
- ASC keeps execution truth, and the workflow core keeps authority over convenience surfaces

## Unit-to-proof mapping

### WF-1 — workflow core contract

Required proof:
- valid request/result shapes are accepted
- invalid step/parallel/worktree combinations fail closed

Evidence shape:
- focused contract tests
- negative-path fixtures

### WF-2 — thin workflow adapter over ASC

Required proof:
- workflow execution uses only the orchestrator-side adapter over ASC
- routing/team validation runs before launch
- step status and `failureKind` are preserved verbatim

Evidence shape:
- seam-focused tests
- routing fail-closed tests
- step-result pass-through tests

### WF-3 — orchestrator-owned aggregation

Required proof:
- chain and parallel aggregation remain truthful
- workflow-level aggregation does not hide step-level failure information
- workflow summaries are not treated as canonical authority

Evidence shape:
- aggregation tests
- negative-path tests for failure fan-in rendering

### WF-4 — optional worktree coordination

Required proof:
- worktree is limited to eligible parallel groups
- dirty repo and incompatible cwd cases fail closed
- cleanup/summary behavior stays bounded on success and failure

Evidence shape:
- worktree negative-path tests
- cleanup tests
- fan-in diff/summary tests

### WF-5 — optional convenience adapters

Required proof:
- command wrappers or later launch helpers compile down to the same workflow core
- no wrapper or saved artifact becomes a second authority model

Evidence shape:
- wrapper-to-core parity tests
- explicit docs/examples proving adapter status

## Rollout posture

Use a conservative staged rollout:

### Stage 0 — docs + contract only
- land problem/review/ADR/plan/validation artifacts
- no user-facing workflow execution yet

### Stage 1 — workflow core + one thin execution adapter
- enable explicit chain/parallel requests over ASC
- keep persistence and builder surfaces out of scope

### Stage 2 — optional worktree coordination
- enable worktree only for explicitly requested eligible parallel groups
- keep failure cases fail-closed

### Stage 3 — optional command wrappers
- add convenience wrappers only if they stay demonstrably thin over the same core
- do not treat wrappers as a change in authority

Interpretation rule:
- Stage 1 is the real first slice
- later stages are optional and evidence-driven, not automatic

## Rollback posture

Rollback is required when any of the following becomes true:

- workflow execution no longer clearly routes only through ASC
- aggregation hides or mutates step-level execution truth
- worktree support tolerates dirty repo or incompatible cwd states
- a wrapper/persistence surface starts acting like authority

Rollback means:

1. disable or remove the new workflow adapter/wrappers
2. keep the orchestrator -> ASC seam untouched
3. return operators to the prior direct-dispatch + loops posture
4. keep `src/chains.yaml` dormant/non-authoritative
5. update the corresponding AK decision/task evidence before claiming stability again

## Minimal verification commands

At minimum, keep package docs and package checks green:

```bash
cd packages/pi-society-orchestrator
npm run docs:list
npm run check
```

Implementation-phase tests should then prove the architecture invariants named above.

## AK execution alignment

`decision:20` remains the canonical decision-runtime home for this packet.
A bounded repo-local execution family is now materialized in AK:

- `#1817` umbrella
- `#1813` WF-1
- `#1814` WF-2
- `#1815` WF-3
- `#1816` WF-4

Current truth split:

- `decision:20` owns the accepted architecture and legality chain
- tasks `#1813-#1817` now own the executable leaf queue for the first slice
- because the task family was created after `decision:20` was already `unblocked`, the current AK surface does not provide a clean late-link path for new `post_adr_execution` tasks without reopening reevaluation, so the tasks remain unlinked while the decision remains the canonical architecture anchor

Interpretation rule:
- this validation note no longer waits for task materialization
- future implementation should use the bounded AK task family rather than treating this document as execution authority

## Bottom line

Roll out workflow composition only as a thin orchestrator-owned layer above ASC.
If that thinness or boundary discipline is lost, roll the workflow surface back rather than rationalizing a second runtime.
