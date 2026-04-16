---
summary: "Session diary for correcting the pi-autoresearch architecture toward a package-local XState runtime with a cleaner AK/Prompt Vault split."
read_when:
  - "Reviewing why pi-autoresearch runtime state should not be modeled primarily as a Prompt Vault router or AK microstate."
  - "Looking for the first-principles reasoning behind the XState runtime correction."
system4d:
  container: "Repo-root diary capture for the pi-autoresearch architecture-correction wave."
  compass: "Put executable loop state in the package runtime while keeping AK and Prompt Vault truthful to their own authority planes."
  engine: "Reassess runtime ownership from first principles -> separate executable state from durable truth -> record the corrected next-slice order."
  fog: "The main risks are hardening the wrong seam, treating the Prompt Vault router blocker as the central runtime blocker, or letting AK absorb runtime microstate it should not own."
---

# Session diary — pi-autoresearch architecture correction

## Trigger for the correction

The bounded runtime kernel is now real in:

- `packages/pi-autoresearch/src/core/runtime.ts`
- `packages/pi-autoresearch/extensions/pi-autoresearch.ts`

That made one design gap much more obvious:

- earlier notes described the package / AK / Prompt Vault split
- but they still left the **executable runtime-state owner** under-specified

At the same time, the `pi-autoresearch-state-router` draft stayed blocked by governed Prompt Vault router vocabulary.
That blocker is real, but it also exposed a deeper architectural issue:

- if router-vocabulary expansion feels like the main runtime blocker,
- we are probably putting too much of the runtime-state problem into Prompt Vault.

## First-principles conclusion

The next truthful owner of executable experiment-loop state is:

- **a package-local XState runtime inside `packages/pi-autoresearch`**

not:

- Prompt Vault router semantics
- AK row microstate

### Why

1. the package needs an executable statechart whether or not a Prompt Vault router exists
2. AK should represent durable campaign truth, not every transient benchmark/check branch
3. Prompt Vault should own reviewable decision prompts, not the full runtime graph
4. the current bounded helpers already form a good effect layer that a state machine can call

## Multi-order effects considered

### If runtime state keeps drifting into Prompt Vault thinking
- router-vocabulary expansion becomes falsely central
- package branching logic gets coupled to governed router metadata too early
- the runtime machine stays implicit in code while docs pretend it is externalized
- later changes to loop behavior require prompt-plane work even when the change is really local runtime mechanics

### If runtime state keeps drifting into AK thinking
- AK rows would accumulate microstate that does not belong in durable operator truth
- the campaign/task surface would become noisy and harder to reason about
- resume behavior would depend on database-level transient updates instead of package-local runtime snapshots and receipts

### If runtime state is made explicit in a package-local XState machine
- transitions become testable and reviewable
- effect boundaries become clearer
- AK and Prompt Vault integrations can stay narrow and honest
- the package gains a truthful place for pause/resume/decision flow without inventing a second governance plane

## Corrected split

### Package-local XState runtime should own
- executable experiment states
- transition logic
- guards
- invoked benchmark/check/prompt/evidence effects
- mapping from run outcomes to next local state

### AK should own
- campaign identity
- scope bounds
- durable evidence/result references
- operator-facing completion/failure truth

### Prompt Vault should own
- setup
- next-hypothesis
- finalize
- any future governed decision procedures that are genuinely prompt-plane concerns

## Important consequence for the router draft

The `pi-autoresearch-state-router` draft is still useful as a thought artifact.
But it should no longer be treated as the near-term prerequisite for truthful runtime evolution.

The correction is:

- **XState first**
- **AK binding + Prompt Vault one-shot procedures next**
- **router reconsideration later only if still needed**

## Outcome of this correction pass

- added canonical project note: `docs/project/pi-autoresearch-architecture-correction.md`
- recorded this session diary so later tasks can see the reasoning path
- corrected the near-term sequence from “AK + router first” to “explicit runtime machine first, then AK/PV integration”
