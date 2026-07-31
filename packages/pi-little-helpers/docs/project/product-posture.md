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
- current strategic line: keep `/visible-loop` and `/nexus-loop` truthful as execution harnesses, not evaluators or evidence stores, while preserving bound objectives and typed success/deferred/blocked closeout guards through launch, queue cancellation, continuation, and completion
- release posture: package has local loop validation scripts and tests for prompt expansion, checkpointing, completion, commit delegation, and visible peer capability registration
- latest candidate-handoff hardening: `/visible-loop --candidate evolution-...` resolves only a matching fresh candidate from a correlated preceding assistant `self` tool call and `self` tool result in the active Pi branch, requires a canonical direct `packages/<owner>/...json` artifact of kind `self.evolution_owner_artifact.v1` with exact candidate/owner binding, persists the full audit envelope plus parsed artifact, and injects only the safe manifest, owner-approved hypothesis/metric/falsifier/scope/validation data, and guard requirements into the first child prompt; child start/restore/completion recheck age and source-session binding, and candidate completion returns a typed accepted/rejected result after correlating evidence references to host-observed package-check calls, ordered ASC proof-ledger runs, and canonical owner artifacts

## Current landed capability baseline

`pi-little-helpers` currently owns:

- slash commands for `/sidequest`, `/scoutpeer`, `/parallelquest`, `/visible-loop`, and `/nexus-loop`;
- model-callable visible peer spawn tools for bounded peer launch surfaces;
- visible-loop state files, visible child launch, prompt queue delivery, intercom report-back, explicit completion checkpointing, candidate-bound self-evolution envelopes, and a narrow extension-originated `sendUserMessage` bridge for pi-little-helpers-owned `/visible-loop` / `/nexus-loop` commands;
- typed `visible_loop_child_defer` terminal control for owner-gated or otherwise unlawful bound work: bounded deferred-item references and next actions are persisted in a mode-0600 no-replace terminal record, surfaced through tool/UI/status/intercom, and cancel the remaining queue without incrementing completion;
- deterministic expansion of text-safe slash prompt templates such as `/commit` from repo-local and global prompt directories, while governed `deep-review` dispatches only through `vault_execute_template` and its verified `workflow_execute` binding;
- commit delegation for `/nexus-loop` and `/visible-loop --delegate-commit` through `dispatch_subagent` after prompt expansion, with command-aware delegation prompt names and run-id wording;
- default visible-loop prompts that read `docs/project/vision.md` and `docs/project/product-posture.md`, implement a bounded slice, run review/fixup/validation, refresh product posture, and only then commit/complete;
- launch-time execution binding for both loops: exactly one operator objective, AK task id, or validated self-evolution candidate must be supplied before config creation or visible child launch; the binding is persisted in a mode-0600 no-replace config and guards every delivered prompt after slash-template expansion;
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
10. **Execution scope precedes iteration** — `/visible-loop` and `/nexus-loop` require exactly one `--task`, `--objective`, or `--candidate` binding. Missing/conflicting bindings fail before launch; stale, completed, inaccessible, ambiguous, cross-repo, or owner-gated bindings stop before mutation. Visible-loop does not select a replacement product slice, and Nexus only hardens the bound implementation.
11. **Governed review precedes fixup** — loop prompts are released sequentially. `deep-review` must produce one exact successful `vault_execute_template` receipt with `executionSurface=workflow_execute`, non-empty handoff identity, and `status=done`; raw local prompt files, duplicate calls, failures, missing receipts, and recovery without the receipt stop before Nexus, posture, commit, or completion.
12. **Terminal closure differs from success** — when the binding becomes stale, owner-gated, or otherwise unlawful, the child records one typed `deferred` or `blocked` terminal outcome before settling. The runtime cancels later prompts and rejects completion/restart for that config; the recorded refs and next actions are local loop-control diagnostics, not task/decision authority. Lawful continuation requires a fresh binding and run after the owning source changes.

## Cost-aware prompt posture — 2026-07-11

The default `/visible-loop` now uses six real prompts instead of nine: the three ambiguous `proceed` turns are replaced by one membrane completion audit, and Nexus implementation plus atomic completion share one bounded fixup prompt. `/nexus-loop` similarly uses four prompts instead of five. The optimized sequence preserves independent deep review, one independent post-fix review when reviewer tooling is available, Prompt Vault dispatch gating, owning-posture refresh, commit provenance, final repo impact/landing validation, and the explicit completion checkpoint.

The completion audit forbids silently selecting another product slice and introduces validation invalidation: prior proof remains reusable only while its relevant inputs are unchanged; development reruns the smallest invalidated proof, while the repo-declared final impact-aware or landing gate selected by the commit workflow remains mandatory on the final state. This reduces redundant model turns and overlapping test runs without treating cached diagnostics as authority or weakening owner, dirty-tree, posture, commit, or closeout gates.

Proof is owned by the visible-loop launch/checkpoint tests, which assert the six-prompt and four-prompt queues, completion-audit wording, consolidated independent-review/atomic-fixup contract, posture-before-commit ordering, and unchanged completion checkpoint behavior. The remaining cost gap is Vault's intentionally separate query/retrieve/dispatch-check contract and expensive reviewer/full-gate execution; any future reduction should optimize those through owner-provided composite receipts or weighted budgets, not by deleting governance or independent review.

## Direction-to-execution binding gate — 2026-07-25

The visible execution loops no longer infer their own product slice. `/visible-loop` and `/nexus-loop` now require exactly one of `--task AK-ID`, `--objective "bounded objective"`, or `--candidate evolution-...`. The parser rejects missing, malformed, oversized, repeated, or conflicting bindings before any config write or Ghostty launch. Task mode performs a read-only AK preflight: exact identity and current-repo containment must match, active deferral is rejected, a claim needs a live lease, and pending work must appear in `ak task ready`. Candidate mode keeps its correlated envelope/owner-artifact checks; objective mode is explicit operator scope without an AK dependency.

The typed binding is mandatory at child-config load, so legacy or manually constructed unbound configs fail before prompt delivery with relaunch guidance. Candidate mode also requires the exact matching typed envelope; task/objective modes reject candidate envelopes. Valid configs use mode `0600` and no-replace creation, and every delivered turn—including governed deep-review dispatch, Nexus, posture, delegated commit, and completion prompts—is guarded by the same binding. This closes the category error between direction-to-execution and execution iteration while keeping the binding as scope rather than missing owner authority.

The governed-review integration now ports the previously landed remote dispatch membrane into the current bound/adaptive loop architecture. Raw `deep-review.md` is neither required nor accepted as execution. Host-correlated tool start/end events admit exactly one successful Vault workflow handoff per iteration; duplicate starts or end receipts fail closed. Diagnostic active-state files never restore a successful workflow claim, and sequential prompt delivery withholds every downstream turn until a fresh in-process receipt passes the barrier.

## Typed terminal disposition — 2026-07-31

A bound loop can now terminate truthfully when discovery finds no lawful implementation slice. Every bound prompt carries the exact internal terminal-tool coordinates. `visible_loop_child_defer` accepts only bounded `deferred` or `blocked` requests with unique owner/task/decision/trigger references and explicit next actions; it requires the exact active run and iteration, persists a no-replace mode-0600 terminal record before stopping the queue, reports remaining prompts as cancelled, and emits no `iteration_completed` or `loop_completed` event.

The terminal record, status JSONL, tool result, UI notification, and intercom report are local loop-control and operator-visibility surfaces only. They do not resolve AK deferrals, accept decisions, satisfy triggers, close tasks, or authorize resuming the old config. To take deferred work through completion, resolve or review it at the owning surface and launch a fresh bound run; AK task mode re-applies the normal live ready/claim admission check. This closes the historical deadlock where a correct prose refusal still released every generic follow-up and then made the success-only checkpoint unreachable.

Live headless Pi RPC dogfood loaded only the package's `sidequest` extension and exercised the real agent/tool lifecycle. A synthetic owner-blocked run invoked `visible_loop_child_defer`, persisted a mode-0600 `blocked` record, reported one cancelled remaining prompt, settled without completion events, and rejected replay before `agent_start`; a separate fresh objective-bound config was then admitted and cleanly recorded its own `deferred` terminal outcome. This proves the runtime stop/replay/fresh-run path without mutating repository or owner-authority state.

`npm run check` passes 171 package tests plus structure, formatting, lint, type checks, package dry-run, and quick release checks. Full `npm run release:check` also packs and installs the exact tarball into an isolated Pi agent directory and passes the extension smoke. The first full release attempt exposed that runtime `typebox` was only peer/dev-declared; promoting it to a packaged runtime dependency made isolated installation truthful. Live in-place `/reload` verification in an already-running operator session remains separate from the isolated tarball proof.

## Proof-carrying adaptive controller Wave 1 — 2026-07-11

`/visible-loop` and `/nexus-loop` now launch with the `adaptive-v1` controller by default, without requiring a special Pi startup environment. The hardened fixed profile remains the automatic budget fallback and explicit emergency rollback path through `PI_VISIBLE_LOOP_ADAPTIVE_CONTROLLER=0`, `false`, or `off`. The run config persists a bounded weighted-event policy, private run-level state carries deeply validated host-recorded prompt-delivery and completion-checkpoint/delegation receipts plus invalidations across child sessions, and completion fails closed before advancing when required transport receipts are absent or stale. After accepted completion, a deterministic HTN decision selects `complete`, `same_session`, `new_session`, or `baseline_fallback`; budget overflow preserves the old transport branch rather than deleting review, posture, commit, or completion gates, while malformed controller state fails closed.

The controller records extension-observable transport cost only. It does not yet measure model tokens, tool latency, subagent cost, validation duration, unique findings, semantic quality, or human intervention, and its receipt/status state is local diagnostic state—not tamper-proof, AK evidence, validation authority, merge/release approval, promotion, or owner truth. Adaptive runs reject evidence-free active-state recreation, while baseline runs retain existing recovery compatibility. Proof exists in pure controller tests for zero-configuration policy plus explicit rollback, bounded costs, proof satisfaction, invalidation, delegated completion, and deterministic fallback, plus launch/checkpoint integration proving persisted policy, adaptive completion invariants, and next-session decisions without changing baseline safety behavior.

This establishes the safety shell and measurement substrate, not the final ambitious controller. The next highest-leverage slice is empirical comparison and phase-level planning: measure baseline versus adaptive runs with weighted model/tool/test costs and quality outcomes, then introduce typed `REPAIR_CURRENT | ADJACENT_RATCHET | REQUEST_REVIEW | READY_FOR_POSTURE | BLOCKED` phase decisions only after the host can correlate their proof and invalidate it truthfully.

## Next product bets

### Bet 1 — Product-posture-first visible loops

Make the default visible-loop prompts keep product posture active from the first design membrane through the final refresh. Done means a loop cannot satisfy the default prompt by only changing code/tests and treating posture as an afterthought.

### Bet 2 — Package-owned posture routing

Improve prompt wording and tests so root-launched loops route posture updates to the owning package when implementation is package-local, while leaving root posture as a router/control-plane surface.

### Bet 3 — Completion safety clarity

Keep completion checkpoint wording aligned with the actual prompt queue so child sessions know not to mark a loop complete when product-posture refresh, validation, or commit/delegated commit failed.

Recent proof: the model-facing `visible_loop_child_complete` description remains success-only, while `visible_loop_child_defer` now provides a separate terminal path that cancels later prompts and preserves non-completion truth.

### Bet 4 — Readability ratchet for visible-loop internals

`src/visibleLoop.ts` remains over the brownfield LOC budget and Wave 1 necessarily grew its host-integration transitions, while pure controller policy and host-status adaptation landed separately in `src/visibleLoopController.ts` and `src/visibleLoopControllerRuntime.ts`. Prompt rendering remains in `src/visibleLoopPromptTemplates.ts`; profiles in `src/visibleLoopProfiles.ts`; config/run-state paths in `src/visibleLoopState.ts`; task-bound AK admission in `src/visibleLoopTaskBinding.ts`; and argument/type contracts in `src/visibleLoopArgs.ts` / `src/visibleLoopTypes.ts`. The accepted temporary exception is feature-flagged and regression-covered rather than hidden; deferred AK task 3656 owns the next behavior-preserving split of launch, persistence, completion, and continuation transitions after this controller landing stabilizes.
