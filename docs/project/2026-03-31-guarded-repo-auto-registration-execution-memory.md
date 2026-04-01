---
summary: "Execution-memory transfer for the guarded repo auto-registration wave after live Ghostty testing exposed root repo-registration drift in pi-extensions."
read_when:
  - "You are starting the guarded repo auto-registration implementation wave for pi-extensions root/runtime integration."
  - "You need the exact repo classes that are auto-safe, explicit-only, or excluded before touching AK registration logic."
system4d:
  container: "Execution-memory artifact for the root repo-registration bootstrap wave."
  compass: "Auto-register only canonical repo roots; fail closed on ambiguous, external, or disposable git roots."
  engine: "Preserve the repo census -> classify repo-root classes -> bind the implementation wave to AK tasks."
  fog: "The main risk is treating every git root as a canonical repo instead of distinguishing owned/infra/fork leaves from contrib clones, worktrees, submodules, and fixture trees."
---

# Guarded repo auto-registration — execution memory

## 1) Entry decision
- transfer readiness: ready
- why:
  - the target state is now explicit: guarded auto-registration for canonical softwareco repo roots only
  - the key failure mode is known from live runtime evidence: `owned/pi-extensions` was a real repo root but unregistered, while the wider `softwareco` tree contains many git roots that must *not* be auto-registered
  - the repo-class audit is concrete enough to decompose into bounded implementation tasks
- unresolved plan/decision-level uncertainties that block transfer:
  - none that block execution of the first guarded implementation slice
  - special top-level roots (`softwareco`, `owned`, `infra`, `fork`, `ontology`, `softwareco-agents`, `contrib-guide`) stay explicit-only until a later policy pass decides whether any should become first-class auto-safe repo roots

## 2) Source model distilled
- primary workflows / capabilities:
  - detect canonical repo root from any cwd via git
  - classify that repo root into auto-safe, explicit-only, or excluded
  - auto-register only auto-safe roots into AK / `society.db`
  - preserve existing fail-closed behavior for excluded or ambiguous roots
- hard constraints / invariants:
  - `contrib/` remains excluded from auto-registration
  - `fork/` gets AK and is in the auto-safe lane set
  - worktrees, submodules, hidden fixture/backups, and embedded runtime/vendor repos must not auto-register
  - package subdirs inside monorepos must resolve to the canonical repo root, not register themselves
- critical failure modes:
  - polluting `repos` with transient fixtures or embedded repos
  - auto-registering a worktree path instead of the canonical repo root
  - silently mutating canonical state from an ambiguous or external repo root
  - regressing live subagent evidence/runtime behavior after the registration path changes
- required validation themes:
  - git-root resolution
  - lane/path classification
  - exclusion of `contrib/`, worktrees, submodules, hidden fixture/backups, and embedded repos
  - package checks, release smoke, and a live Ghostty-hosted Pi validation pass
- authority boundaries that matter:
  - AK / `society.db` own canonical repo registration state
  - repo docs own the policy note and tactical decomposition
  - package runtime/tests own the implementation and proof packet

## 3) Target-substrate mapping
- belongs in runtime state now:
  - AK tasks `#654` -> `#656`
  - canonical repo registration row for `owned/pi-extensions`
- belongs as repo-tracked lifecycle artifact:
  - this execution-memory note
  - `docs/project/strategic_goals.md`
  - `docs/project/tactical_goals.md`
  - `docs/project/operating_plan.md`
  - `next_session_prompt.md`
- belongs in Prompt Vault procedure layer:
  - none beyond this execution-memory transfer framing
- belongs in KES later:
  - lessons from false positives / false negatives once guarded auto-registration has seen repeated live use
- belongs in Oracle / DSPx later:
  - none yet
- future-state ideas explicitly not assumed runtime-native today:
  - blanket auto-registration for all git roots under `softwareco`
  - automatic handling of special top-level roots without an explicit policy decision

## 4) Proposed execution memory
- id: TG4
- title: Guard root/runtime repo registration so canonical softwareco repos can bootstrap into AK without polluting registry state
- class: execution_unit
- objective:
  - implement guarded repo auto-registration for canonical softwareco repo roots
- outcome:
  - live runtime paths can bootstrap missing canonical repo registrations for safe repo classes, while excluded and explicit-only classes remain fail-closed
- dependencies / legal preconditions:
  - current repo root `owned/pi-extensions` is now explicitly registered so AK tasks can bind to this repo
- authority owner / target substrate:
  - root docs + AK tasks + package runtime/tests
- boundaries / touched surfaces:
  - `packages/pi-society-orchestrator/src/runtime/*`
  - `packages/pi-society-orchestrator/extensions/*`
  - `packages/pi-society-orchestrator/tests/*`
  - root planning docs / handoff
- failure modes:
  - classifying disposable repos as canonical
  - mutating repo registry from package subdirs or external cwd
  - breaking live Ghostty Pi flows while fixing registration
- validation / evidence required:
  - exact repo-class tests and a post-change live Ghostty subagent retest

### Decomposed AK units

- id: 654
- title: [TG4] Implement guarded repo-root classification for softwareco auto-registration
- class: execution_unit
- objective:
  - codify repo-root resolution and class policy for auto-safe vs explicit-only vs excluded roots
- outcome:
  - runtime code can distinguish:
    - auto-safe: `owned/<repo>`, `infra/<repo>`, `fork/<repo>` leaf repos
    - excluded: `contrib/**`, worktrees, submodules, hidden fixture/backups, embedded runtime/vendor repos
    - explicit-only: `softwareco`, lane roots, `ontology`, `softwareco-agents`, `contrib-guide`
- dependencies / legal preconditions:
  - none
- authority owner / target substrate:
  - package runtime/tests + root policy docs
- boundaries / touched surfaces:
  - `packages/pi-society-orchestrator/src/runtime/ak.ts`
  - `packages/pi-society-orchestrator/src/runtime/evidence.ts`
  - `packages/pi-society-orchestrator/tests/runtime-shared-paths.test.mjs`
  - this execution-memory note if classification changes
- failure modes:
  - package-subdir misclassification
  - missing worktree/submodule detection
  - forgetting hidden fixture/backups under `.tmp` / `.migration-backup`
- validation / evidence required:
  - targeted unit tests for each repo class found in the current `softwareco` census

- id: 655
- title: [TG4] Wire guarded auto-registration into repo-aware runtime paths with explicit exclusions
- class: execution_unit
- objective:
  - connect the classifier to the actual runtime mutation path so safe roots can register themselves while excluded/explicit-only roots fail closed with actionable guidance
- outcome:
  - runtime paths stop relying on manual pre-registration for safe canonical roots
  - excluded/explicit-only roots do not mutate registry state silently
- dependencies / legal preconditions:
  - depends on `#654`
- authority owner / target substrate:
  - package runtime implementation
- boundaries / touched surfaces:
  - `packages/pi-society-orchestrator/src/runtime/ak.ts`
  - `packages/pi-society-orchestrator/src/runtime/evidence.ts`
  - `packages/pi-society-orchestrator/extensions/society-orchestrator.ts`
  - `packages/pi-society-orchestrator/src/loops/engine.ts`
- failure modes:
  - accidental mutation in excluded classes
  - repeated registration churn for already-registered repos
  - mutation from a non-root cwd instead of the canonical repo root
- validation / evidence required:
  - deterministic tests plus repo-local smoke proving safe roots register and excluded roots remain non-mutating

- id: 656
- title: [TG4] Verify guarded auto-registration with regression tests, release checks, and live Ghostty smoke
- class: reevaluation_unit
- objective:
  - prove the guarded implementation works in package tests, release smoke, and a real Ghostty-hosted interactive Pi session
- outcome:
  - the proof packet closes with runtime and live-operator evidence instead of only local unit tests
- dependencies / legal preconditions:
  - depends on `#655`
- authority owner / target substrate:
  - package tests + live operator verification
- boundaries / touched surfaces:
  - `packages/pi-society-orchestrator/tests/runtime-shared-paths.test.mjs`
  - `packages/pi-society-orchestrator/scripts/release-smoke.mjs`
  - `next_session_prompt.md`
  - optional diary capture if the live run surfaces new runtime lessons
- failure modes:
  - package checks pass while live Ghostty still fails
  - registration succeeds but evidence/runtime behavior regresses
  - excluded roots start mutating in live sessions
- validation / evidence required:
  - `npm run docs:list`
  - `npm run check`
  - `npm run release:check`
  - one live Ghostty interactive Pi retest with receipt-backed proof

## 5) Coverage audit
- source element -> execution-memory mapping:
  - git-root detection -> `#654`
  - lane/class policy -> `#654`
  - runtime mutation path -> `#655`
  - tests + release smoke + live Ghostty validation -> `#656`
- units with weak or missing source backing:
  - none
- source elements still not represented:
  - later policy decision for special top-level roots remains explicitly out of scope for this first wave

## 6) Runtime-reality audit
- what this transfer can express in currently implemented systems:
  - repo-tracked planning artifacts
  - AK tasks and dependencies
  - package runtime/tests/release-smoke changes
- what still depends on process/docs because runtime support is not native yet:
  - explicit policy decisions for top-level special roots
  - any later KES capture if implementation teaches a reusable lesson
- where false confidence would arise if those were conflated:
  - assuming “git root” alone is enough for canonical registration
  - assuming special top-level roots are auto-safe without an explicit policy choice

## 7) Verdict
- execution_memory_ready: yes
- smallest next correction if no:
  - n/a
