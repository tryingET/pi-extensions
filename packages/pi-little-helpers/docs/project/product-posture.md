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
- current strategic line: keep `/visible-loop` and `/nexus-loop` truthful as execution harnesses, not evaluators or evidence stores, while making product-posture refresh unavoidable before completion
- release posture: package has local loop validation scripts and tests for prompt expansion, checkpointing, completion, commit delegation, and visible peer capability registration
- latest loop-prompt/profile hardening: implementation prompts now keep the child's attention on the bounded slice and direct proof, while detailed repo-loop-validation guidance is reserved for delegated commit/validation-command selection; `/visible-loop` configs now record cwd-level `docs/project/product-posture.md` and `docs/project/vision.md` launch hints so checkpoints can name the expected posture target; `/nexus-loop` carries the required product-posture refresh before delegated commit and uses command-aware labels instead of generic visible-loop report-back wording; the root loop taxonomy names visible execution loops separately from orchestrator cognitive/workflow loops and repo validation phases

## Current landed capability baseline

`pi-little-helpers` currently owns:

- slash commands for `/sidequest`, `/scoutpeer`, `/parallelquest`, `/visible-loop`, and `/nexus-loop`;
- model-callable visible peer spawn tools for bounded peer launch surfaces;
- visible-loop state files, visible child launch, prompt queue delivery, intercom report-back, and explicit completion checkpointing;
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
-> design membrane
-> bounded implementation
-> validation and dogfood where relevant
-> deep review / fixup
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
6. **Dirty worktree is protected** — unrelated files are not staged or overwritten.

## Next product bets

### Bet 1 — Product-posture-first visible loops

Make the default visible-loop prompts keep product posture active from the first design membrane through the final refresh. Done means a loop cannot satisfy the default prompt by only changing code/tests and treating posture as an afterthought.

### Bet 2 — Package-owned posture routing

Improve prompt wording and tests so root-launched loops route posture updates to the owning package when implementation is package-local, while leaving root posture as a router/control-plane surface.

### Bet 3 — Completion safety clarity

Keep completion checkpoint wording aligned with the actual prompt queue so child sessions know not to mark a loop complete when product-posture refresh, validation, or commit/delegated commit failed.

Recent proof: the model-facing `visible_loop_child_complete` description now matches the checkpointed completion flow instead of implying ordinary `agent_end` completion.

### Bet 4 — Readability ratchet for visible-loop internals

`src/visibleLoop.ts` remains over the brownfield LOC budget, but delegated commit prompt rendering has been moved into `src/visibleLoopPromptTemplates.ts`; command profiles/labels live in `src/visibleLoopProfiles.ts`; state/config/status sidecar helpers live in `src/visibleLoopState.ts`; and argument/type contracts live in `src/visibleLoopArgs.ts` / `src/visibleLoopTypes.ts`, so the state-machine file owns less prompt, persistence, command-profile, and parsing plumbing. Next refactor should split more launch and completion state transitions without changing runtime behavior.
