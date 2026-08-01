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
- current strategic line: keep `/visible-loop` and `/nexus-loop` truthful as concise execution harnesses, not evaluators or evidence stores, while preserving bound objectives and closeout guards through launch, single-frontier continuation, and completion
- release posture: package has local loop validation scripts and tests for prompt expansion, checkpointing, completion, commit delegation, and visible peer capability registration
- latest candidate-handoff hardening: `/visible-loop --candidate evolution-...` resolves only a matching fresh candidate from a correlated preceding assistant `self` tool call and `self` tool result in the active Pi branch, requires a canonical direct `packages/<owner>/...json` artifact of kind `self.evolution_owner_artifact.v1` with exact candidate/owner binding, persists the full audit envelope plus parsed artifact, and injects only the safe manifest, owner-approved hypothesis/metric/falsifier/scope/validation data, and guard requirements into the first child prompt; child start/restore/completion recheck age and source-session binding, and candidate completion returns a typed accepted/rejected result after correlating evidence references to host-observed package-check calls, ordered ASC proof-ledger runs, and canonical owner artifacts

## Current landed capability baseline

`pi-little-helpers` currently owns:

- slash commands for `/sidequest`, `/scoutpeer`, `/parallelquest`, `/visible-loop`, and `/nexus-loop`;
- model-callable visible peer spawn tools for bounded peer launch surfaces;
- visible-loop state files, visible child launch, prompt queue delivery, intercom report-back, explicit completion checkpointing, candidate-bound self-evolution envelopes, and a narrow extension-originated `sendUserMessage` bridge for pi-little-helpers-owned `/visible-loop` / `/nexus-loop` commands;
- a complete operator-visible iteration plan kept separate from executable authority, with exactly one frontier submitted at a time through Pi-native follow-ups and every next step withheld until correlated `message_start` plus `agent_settled` (and any governed receipt) succeeds;
- deterministic expansion of remaining text-safe slash prompt templates such as `/commit` from repo-local and global prompt directories, without accepting raw `deep-review.md` execution;
- commit delegation for `/nexus-loop` and `/visible-loop --delegate-commit` through `dispatch_subagent` after prompt expansion, with command-aware delegation prompt names and run-id wording;
- a six-real-prompt default visible loop—bound design/implementation, completion audit, governed deep review, consolidated Nexus fixup, posture refresh, and commit—and a four-real-prompt Nexus loop that begins at governed review;
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
-> design membrane and bounded implementation
-> completion audit with focused revalidation
-> governed deep review
-> consolidated Nexus fixup, at most one optional non-Prompt-Vault read-only review when available and useful, and atomic completion
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
10. **Governed review is receipt-gated** — exactly one deep-review call may satisfy the barrier, and only after `vault_execute_template` returns the exact `deep-review` / `workflow_execute` identity, a non-empty Vault handoff id, and `status=done`; duplicate, missing, failed, timed-out, or raw-file review paths stop before Nexus, posture refresh, commit, and completion.
11. **Plan visibility is not release authority** — the operator widget shows all six visible-loop or four Nexus real prompts, but only one exact frontier is submitted. `sendUserMessage` submission remains submitted/pending rather than host-queued truth until correlated `message_start`; only that observed run's `agent_settled` may advance the cursor. This is safe under `followUpMode=all` because the extension never batches runnable prompts.
12. **Recovery is explicit and fail-closed** — the atomic schema-5 per-session snapshot binds plan id, iteration, lifecycle, frontier, settled progress, and governed call receipt for recovery, while a separate owner-only run-global lease is the sole cross-session exclusion authority. ACTIVE ownership is session/process-incarnation bound, LAUNCHING handoff consumes one unguessable token, FAILED permits one explicit recovery, and COMPLETED is terminal. Same-process reload renders/resumes without duplicate submission; fresh restart, corrupt state, token replay, or indeterminate submission fails explicitly. A terminal plan is finalized before authoritative checked completion persistence, cannot be reused after continuation-launch failure, and the widget is finalized or cleared on completion.

## Next product bets

### Bet 1 — Product-posture-first visible loops

Make the default visible-loop prompts keep product posture active from the first design membrane through the final refresh. Done means a loop cannot satisfy the default prompt by only changing code/tests and treating posture as an afterthought.

### Bet 2 — Package-owned posture routing

Improve prompt wording and tests so root-launched loops route posture updates to the owning package when implementation is package-local, while leaving root posture as a router/control-plane surface.

### Bet 3 — Completion safety clarity

Keep completion checkpoint wording aligned with the actual prompt queue so child sessions know not to mark a loop complete when product-posture refresh, validation, or commit/delegated commit failed.

Recent proof: the default queue now replaces three context-free continuation turns with one completion audit and combines Nexus implementation plus atomic cleanup into one bounded fixup. Ordinary inline-commit runs receive a separate success-only checkpoint after all real prompts settle; delegated-commit runs call the same completion tool from the still-running terminal commit frontier only after the delegated worker succeeds.

### Bet 4 — Readability ratchet for visible-loop internals

`src/visibleLoop.ts` remains over the brownfield LOC budget, but default queue composition lives in `src/visibleLoopPromptDefaults.ts`; expansion plus delegated commit/completion rendering lives in `src/visibleLoopPromptTemplates.ts`; command profiles/labels live in `src/visibleLoopProfiles.ts`; iteration-bound plan/frontier transitions, recovery classification, validation, and widget rendering live in `src/visibleLoopPlan.ts`; atomic active-snapshot I/O lives in `src/visibleLoopRecovery.ts`; config/status sidecar helpers live in `src/visibleLoopState.ts`; and argument/type contracts live in `src/visibleLoopArgs.ts` / `src/visibleLoopTypes.ts`. Next refactor should split more launch and completion transitions without changing the single-frontier contract.
