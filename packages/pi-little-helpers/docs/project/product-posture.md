---
summary: "Product posture for pi-little-helpers: visible helper launch, visible-loop prompt queue, and controller-owned verification."
read_when:
  - "Before changing /visible-loop, /nexus-loop, visible peer launch, or visible-loop prompt templates."
  - "When deciding whether a recursive-improvement workflow belongs in pi-little-helpers or another package."
type: "reference"
system4d:
  container: "Package-local product posture for visible helper and loop surfaces."
  compass: "Make helper work visible and reviewable without turning loop output into authority."
  engine:
    invariants:
      - "Visible-loop queues bounded work, review, posture refresh, and commit prompts in a visible child session."
      - "Product-posture refresh is a required loop artifact, not an optional changelog."
      - "Controller inspection and owner validation remain the authority gate."
  fog:
    risks:
      - "A visible child can appear authoritative because it is visible and automated."
      - "Root-launched loops can update root posture when the real work belongs to a package."
      - "Prompt queues can drift from package-local vision/product posture and lose self-evolution rationale."
---

# Product posture — `pi-little-helpers`

## Vision relation

The package north star lives in [vision.md](./vision.md). This posture file states the current product promise, boundaries, visible-loop behavior, and next bets for `pi-little-helpers`.

For recursive-improvement routing across packages, use the root [visible self-evolution spine](../../../../docs/project/visible-self-evolution-spine.md). For loop category and owner boundaries, use the root [loop taxonomy boundary contract](../../../../docs/project/loop-taxonomy-boundary-contract.md). For capability registration and runtime compatibility, use the [visible peer capability contract](./2026-05-05-visible-peer-capability-contract.md).

## Product promise

`pi-little-helpers` makes helper work visible, bounded, inspectable, and easy to continue while keeping verification and promotion with the controller and owning surfaces.

Short form:

```text
launch visible helper work; do not make helper output authority
```

## Current product maturity

- maturity: `internal alpha / visible peer and visible-loop harness operational`
- current strategic line: keep `/visible-loop` and `/nexus-loop` truthful as execution harnesses, not evaluators or evidence stores, while preserving candidate-bound objectives and closeout guards through launch, continuation, and completion
- release posture: package has local loop validation scripts and tests for prompt expansion, checkpointing, completion, commit delegation, and visible peer capability registration
- latest candidate-handoff hardening: `/visible-loop --candidate evolution-...` resolves only a matching fresh candidate from a correlated preceding assistant `self` tool call and `self` tool result in the active Pi branch, requires a canonical direct `packages/<owner>/...json` artifact of kind `self.evolution_owner_artifact.v1` with exact candidate/owner binding, persists the full audit envelope plus parsed artifact, and injects only the safe manifest, owner-approved hypothesis/metric/falsifier/scope/validation data, and guard requirements into the first child prompt; child start/restore/completion recheck age and source-session binding, and candidate completion returns a typed accepted/rejected result after correlating evidence references to host-observed package-check calls, ordered ASC proof-ledger runs, and canonical owner artifacts

## Current landed capability baseline

`pi-little-helpers` currently owns:

- slash commands for `/sidequest`, `/scoutpeer`, `/parallelquest`, `/visible-loop`, and `/nexus-loop`;
- model-callable visible peer spawn tools for bounded peer launch surfaces;
- visible-loop state files, visible child launch, prompt queue delivery, intercom report-back, explicit completion checkpointing, candidate-bound self-evolution envelopes, and a narrow extension-originated `sendUserMessage` bridge for pi-little-helpers-owned `/visible-loop` / `/nexus-loop` commands;
- deterministic expansion of configured slash prompt templates such as `/deep-review` and `/commit` from repo-local and global prompt directories;
- commit delegation for `/nexus-loop` and `/visible-loop --delegate-commit` through `dispatch_subagent` after prompt expansion, with command-aware delegation prompt names and run-id wording;
- default visible-loop prompts that read `docs/project/vision.md` and `docs/project/product-posture.md`, implement a bounded slice, run review/fixup/validation, refresh product posture, and only then commit/complete;
- package-local implementation of the visible execution loop category defined by the root loop taxonomy boundary contract.

## Product non-goals

`pi-little-helpers` must not become:

- AK task/evidence/decision truth;
- the owner of package-local product direction beyond its own helper surfaces;
- a durable diagnostic or recurrence store — [pi-agent-vent](../../../pi-agent-vent/docs/project/vision.md) owns that;
- a measured experiment/evaluator runtime — [pi-autoresearch](../../../pi-autoresearch/docs/project/vision.md) owns that;
- an above-seam evidence projector — [pi-society-orchestrator](../../../pi-society-orchestrator/docs/project/vision.md) owns that;
- a replacement for controller inspection, package-local validation, or owner-surface promotion.

## Visible-loop posture

`/visible-loop` is an operator-visible execution harness in the sense defined by the root [loop taxonomy boundary contract](../../../../docs/project/loop-taxonomy-boundary-contract.md). It should drive a child session through:

```text
read vision/product-posture
-> design membrane + bounded implementation
-> one membrane completion audit without selecting another slice
-> independent deep review
-> consolidated Nexus / atomic fixup with validation invalidation
-> product-posture refresh
-> commit / completion checkpoint
```

The product-posture refresh is not a changelog. It is the next-iteration frontier map: what maturity changed, what proof exists, what gap remains, which owner boundaries matter, and what the next loop must understand before selecting work.

When `/visible-loop` is launched from a monorepo root but routes implementation into a package, the child should update the owning package's `docs/project/product-posture.md`. The root posture should change only when root routing/control-plane behavior changed. If the owning posture file is missing or cannot be truthfully updated, the loop should stop and report the blocker instead of claiming completion.

## Trust gates

A visible-loop result is trustworthy only when:

1. **Owner route is explicit** — root, package, and external owner surfaces are named before mutation.
2. **Posture refresh happened** — the owning product posture was updated or an explicit blocker was reported.
3. **Validation is scoped** — package-local loop/check scripts or truthful fallbacks were run and reported.
4. **No authority drift** — child output, intercom messages, status files, and prompt queues are not treated as AK/evidence/KES/ontology/Prompt Vault truth.
5. **Completion is gated** — the completion checkpoint is sent only after implementation, review/fixup, posture refresh, and commit/delegated commit succeeded or explicitly stopped.
6. **Extension-originated launch is narrow** — only pi-little-helpers-owned `/visible-loop` and `/nexus-loop` messages injected through `pi.sendUserMessage` are bridged into command handlers; the package does not become a general slash-command dispatcher.
7. **Dirty worktree is protected** — unrelated files are not staged or overwritten.
8. **Candidate provenance is correlated but non-authoritative** — a candidate route must match an assistant `self` tool call and its `self` tool result in the active branch; the resulting envelope remains untrusted session-mirror transport, not evidence or authority.
9. **Closeout brakes survive transport** — full source guard snapshots remain in config for audit, while the first child prompt gets only guard requirements and validated typed owner-artifact fields. Required reflection/live-proof/promotion evidence must correlate to host-observed command results, ordered ASC ledger events, or the canonical bound artifact; free-form status labels, invented receipt IDs, missing/stale artifacts, and cross-session/expired configs cannot advance completion.

## Cost-aware prompt posture — 2026-07-11

The default `/visible-loop` now uses six real prompts instead of nine: the three ambiguous `proceed` turns are replaced by one membrane completion audit, and Nexus implementation plus atomic completion share one bounded fixup prompt. `/nexus-loop` similarly uses four prompts instead of five. The optimized sequence preserves independent deep review, one independent post-fix review when reviewer tooling is available, Prompt Vault dispatch gating, owning-posture refresh, commit provenance, final repo impact/landing validation, and the explicit completion checkpoint.

The completion audit forbids silently selecting another product slice and introduces validation invalidation: prior proof remains reusable only while its relevant inputs are unchanged; development reruns the smallest invalidated proof, while the repo-declared final impact-aware or landing gate selected by the commit workflow remains mandatory on the final state. This reduces redundant model turns and overlapping test runs without treating cached diagnostics as authority or weakening owner, dirty-tree, posture, commit, or closeout gates.

Proof is owned by the visible-loop launch/checkpoint tests, which assert the six-prompt and four-prompt queues, completion-audit wording, consolidated independent-review/atomic-fixup contract, posture-before-commit ordering, and unchanged completion checkpoint behavior. The remaining cost gap is Vault's intentionally separate query/retrieve/dispatch-check contract and expensive reviewer/full-gate execution; any future reduction should optimize those through owner-provided composite receipts or weighted budgets, not by deleting governance or independent review.

## Proof-carrying adaptive controller Wave 1 — 2026-07-11

`/visible-loop` and `/nexus-loop` now have an opt-in `adaptive-v1` controller behind `PI_VISIBLE_LOOP_ADAPTIVE_CONTROLLER=1`; the hardened fixed profile remains the default and rollback baseline. The run config persists a bounded weighted-event policy, private run-level state carries deeply validated host-recorded prompt-delivery and completion-checkpoint/delegation receipts plus invalidations across child sessions, and completion fails closed before advancing when required transport receipts are absent or stale. After accepted completion, a deterministic HTN decision selects `complete`, `same_session`, `new_session`, or `baseline_fallback`; budget overflow preserves the old transport branch rather than deleting review, posture, commit, or completion gates, while malformed controller state fails closed.

The controller records extension-observable transport cost only. It does not yet measure model tokens, tool latency, subagent cost, validation duration, unique findings, semantic quality, or human intervention, and its receipt/status state is local diagnostic state—not tamper-proof, AK evidence, validation authority, merge/release approval, promotion, or owner truth. Adaptive runs reject evidence-free active-state recreation, while baseline runs retain existing recovery compatibility. Proof exists in pure controller tests for opt-in policy, bounded costs, proof satisfaction, invalidation, delegated completion, and deterministic fallback, plus launch/checkpoint integration proving persisted policy, adaptive completion invariants, and next-session decisions without changing baseline tests.

This establishes the safety shell and measurement substrate, not the final ambitious controller. The next highest-leverage slice is empirical comparison and phase-level planning: measure baseline versus adaptive runs with weighted model/tool/test costs and quality outcomes, then introduce typed `REPAIR_CURRENT | ADJACENT_RATCHET | REQUEST_REVIEW | READY_FOR_POSTURE | BLOCKED` phase decisions only after the host can correlate their proof and invalidate it truthfully.

## Next product bets

### Bet 1 — Product-posture-first visible loops

Make the default visible-loop prompts keep product posture active from the first design membrane through the final refresh. Done means a loop cannot satisfy the default prompt by only changing code/tests and treating posture as an afterthought.

### Bet 2 — Package-owned posture routing

Improve prompt wording and tests so root-launched loops route posture updates to the owning package when implementation is package-local, while leaving root posture as a router/control-plane surface.

### Bet 3 — Completion safety clarity

Keep completion checkpoint wording aligned with the actual prompt queue so child sessions know not to mark a loop complete when product-posture refresh, validation, or commit/delegated commit failed.

Recent proof: the model-facing `visible_loop_child_complete` description now matches the checkpointed completion flow instead of implying ordinary `agent_settled` completion.

### Bet 4 — Readability ratchet for visible-loop internals

`src/visibleLoop.ts` remains over the brownfield LOC budget and Wave 1 necessarily grew its host-integration transitions, while pure controller policy and host-status adaptation landed separately in `src/visibleLoopController.ts` and `src/visibleLoopControllerRuntime.ts`. Prompt rendering remains in `src/visibleLoopPromptTemplates.ts`; profiles in `src/visibleLoopProfiles.ts`; config/run-state paths in `src/visibleLoopState.ts`; and argument/type contracts in `src/visibleLoopArgs.ts` / `src/visibleLoopTypes.ts`. The accepted temporary exception is feature-flagged and regression-covered rather than hidden; deferred AK task 3656 owns the next behavior-preserving split of launch, persistence, completion, and continuation transitions after this controller landing stabilizes.
