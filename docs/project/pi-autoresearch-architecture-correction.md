---
summary: "Architecture correction for pi-autoresearch: a package-local XState runtime should own executable loop state, while AK owns campaign truth and Prompt Vault owns durable decision prompts."
read_when:
  - "Before implementing AK binding, Prompt Vault invocation, or new autonomous pi-autoresearch runtime behavior."
  - "When deciding whether runtime state belongs in the package, Agent Kernel, or Prompt Vault."
system4d:
  container: "Root-level correction note for the pi-autoresearch architecture inside the pi-extensions monorepo."
  compass: "Keep executable loop state local to the package while preserving clean truth boundaries to AK and Prompt Vault."
  engine: "Name what earlier docs left under-specified -> place executable state in XState -> split durable truth across AK and Prompt Vault -> sequence the next implementation slices."
  fog: "The main risks are trying to encode the runtime state machine in Prompt Vault routers, pushing microstate into AK rows, or letting local receipts quietly become the real control plane."
---

# Architecture correction — `pi-autoresearch`

## Status

Adopted correction for the next implementation wave.

This note corrects parts of these earlier artifacts:

- `docs/project/pi-autoresearch-integration-analysis.md`
- `docs/project/pi-autoresearch-rfc.md`
- `docs/project/pi-autoresearch-prompt-vault-template-set.md`
- `docs/project/pi-autoresearch-foundation-status.md`

Those docs were directionally right about the need for explicit authority boundaries.
What they left under-specified was one critical question:

> who owns the executable experiment-loop state machine?

The corrected answer is:

- **the `pi-autoresearch` package itself, via a package-local XState runtime**

with clean truth splits to:

- **AK** for campaign/task truth
- **Prompt Vault** for durable decision prompts

---

## Correction in one sentence

`pi-autoresearch` should use a **package-local XState machine** as the executable experiment runtime, while **AK** owns campaign identity/scope/evidence truth and **Prompt Vault** owns durable setup / next-hypothesis / finalize prompt content; a Prompt Vault router is an optional later decision surface, **not** the runtime state machine itself.

---

## What earlier docs got right

The earlier design work already established the right high-level constraints:

1. local `autoresearch.*` files must not become sole authority
2. AK should own durable campaign/task truth
3. Prompt Vault should own durable prompt/control-plane text
4. ontology should own governed experiment semantics
5. upstream-style monolithic auto-resume and broad git mutation should not be imported wholesale

Those points still stand.

---

## What needs correction

## 1. Prompt Vault router was treated as too central

Earlier notes treated `experiment-state-router` / `pi-autoresearch-state-router` as part of the minimum control-plane set.
That was a reasonable first draft, but it over-coupled two different things:

- **runtime state transitions**
- **governed prompt decisions**

Those are not the same.

A package runtime still needs an executable statechart even if no Prompt Vault router exists.
The current router-vocabulary blocker is therefore a sign that the state machine should not be modeled primarily as a Prompt Vault router in the first place.

## 2. AK truth was not separated sharply enough from runtime microstate

Earlier notes correctly said AK should own campaign truth.
But they did not make explicit enough that AK should **not** become the sink for every transient runtime detail such as:

- benchmark currently running
- checks currently running
- awaiting decision after one run
- rebaseline branch of the current local session
- finalize-candidate branch of the current local session

Those are runtime states, not campaign-truth rows.

## 3. Runtime-lifecycle adjacency was named, but the domain runtime owner was not

Earlier notes correctly warned against inventing a second autonomy plane outside existing session-control seams.
But that still leaves a real package-local question:

- what executes the `pi-autoresearch` domain machine itself?

The answer should not be “AK rows” and it should not be “Prompt Vault routers.”
It should be:

- **a local state machine in the package runtime**

with broader session-lifecycle integration remaining a separate seam.

---

## Why XState is the right runtime owner

A package-local XState runtime is the most truthful next architectural move because it gives `pi-autoresearch` an explicit executable model for:

- allowed states
- allowed transitions
- guards
- invoked async work
- effect boundaries
- pause/resume checkpoints
- deterministic testing of loop behavior

### Why this fits the current package shape

The package already has a useful effect/projection layer:

- `packages/pi-autoresearch/src/core/runtime.ts`
- `packages/pi-autoresearch/extensions/pi-autoresearch.ts`

That code already separates important runtime concerns such as:

- benchmark/check execution
- metric parsing
- receipt append/load
- baseline/confidence summaries
- operator-facing status/help rendering

So the next move should **not** be a rewrite from scratch.
It should be to wrap the current bounded helpers inside an explicit state machine.

### Why XState is better than leaving the flow implicit

Without an explicit runtime machine, future AK binding and Prompt Vault invocation will tend to leak into ad hoc conditionals and command handlers.
That would recreate the same architectural blur the package is trying to avoid.

XState gives a clean separation:

- **machine logic** = what state the experiment loop is in and what may happen next
- **effects/services** = run benchmark, run checks, append receipt, call Prompt Vault, update AK evidence, etc.

That is exactly the separation this capability now needs.

---

## Corrected ownership split

| Concern | Correct owner | Why |
|---|---|---|
| Executable experiment-loop state and transitions | `packages/pi-autoresearch` XState runtime | This is domain runtime behavior, not shared task truth or prompt text |
| Campaign identity, allowed scope, durable evidence/result truth | AK | This is durable operator/governance truth |
| Setup / next-hypothesis / finalize prompt content | Prompt Vault | These are governed, reviewable decision procedures |
| Benchmark/check execution helpers and local receipt append | `packages/pi-autoresearch` effect layer | These are package-local runtime mechanics |
| `autoresearch.jsonl`, `autoresearch.md`, `autoresearch.sh`, `autoresearch.checks.sh`, `autoresearch.ideas.md` | local package artifacts | Useful projections/receipts, but not sole authority |
| Broader session-lifecycle supervision, if later needed | adjacent session-control seam | This remains distinct from the package's domain machine |
| Experiment semantics | repo-local ontology | Keeps semantic contracts explicit without widening authority too early |

---

## Prompt Vault correction

## What Prompt Vault should still own

The existing first durable template set still makes sense:

- `pi-autoresearch-setup`
- `pi-autoresearch-next-hypothesis`
- `pi-autoresearch-finalize`

These are decision/instruction surfaces.
They tell the runtime what packet to produce or what bounded move to take.

## What Prompt Vault should not own

Prompt Vault should **not** be treated as the primary owner of the runtime state machine itself.

In particular, the package should not wait on a governed router vocabulary expansion just to gain truthful runtime branching between states such as:

- ready for setup
- ready for next run
- benchmark running
- checks running
- awaiting decision
- rebaseline needed
- finalize candidate
- blocked

Those are package-runtime states.

## New posture on `pi-autoresearch-state-router`

The existing router draft remains useful as an exploration artifact.
But it is no longer the first-order blocker for runtime evolution.

Corrected posture:

1. **runtime branching belongs in XState first**
2. **Prompt Vault one-shot procedures remain the main durable prompt contract**
3. reopen a Prompt Vault router only if later evidence shows a genuinely shared governed routing need that cannot be expressed cleanly as:
   - machine guards + events
   - one-shot prompt decisions
   - AK milestone updates

This means governed router-vocabulary expansion is now a **possible later follow-on**, not a mandatory near-term prerequisite.

---

## AK correction

AK should represent the durable campaign truth, not the machine's internal microstate.

### AK should carry things like

- the existence of the campaign
- the repo-relative scope and required artifacts
- the current durable operator-facing objective
- evidence references produced by runs/finalization
- completion, failure, or follow-on work creation

### AK should not try to carry things like

- every local benchmark/check transition
- every intermediate decision branch
- every transient loop-state flip during one session
- the full executable runtime graph

A useful rule is:

> if losing the value would break operator/governance truth, it belongs in AK; if losing it only means the runtime needs to resume from local receipts/snapshots, it belongs in the package runtime.

---

## Corrected runtime model

The package should gain a small explicit XState machine that sits above the existing helpers.

## Minimum initial machine shape

A truthful first machine could distinguish states such as:

- `idle`
- `segment_unconfigured`
- `ready`
- `running_benchmark`
- `running_checks`
- `recording_receipt`
- `awaiting_decision`
- `rebaseline_needed`
- `finalize_candidate`
- `blocked`
- `completed`

This does **not** mean all future autonomy must land immediately.
It only means the bounded runtime should stop being an implicit state machine spread across handlers and helper calls.

## How it should use current code

The current bounded-runtime helpers should become machine effects/services, for example:

- `executeAutoresearchRun(...)` as invoked benchmark/check work
- receipt loading + summaries as projection helpers
- status/help formatting as read-only views over machine + receipt state

That preserves the bounded kernel while making the next layer explicit.

---

## Sequence implication

This correction changes the truthful order of the next slices.

## Corrected near-term order

1. keep this correction note as the architecture lock
2. introduce a minimal package-local XState runtime around the current bounded helpers
3. define AK binding for campaign identity, scope, and durable evidence/result references
4. connect Prompt Vault one-shot procedures as explicit machine-invoked decision steps
5. revisit safer finalization on top of the machine + AK split
6. only then decide whether a Prompt Vault router still adds real value

## What this reorders from earlier notes

Earlier umbrella notes treated the next slices roughly as:

1. AK binding
2. Prompt Vault router expansion/insertion
3. safer finalization

The corrected order is different because the package first needs its own explicit executable runtime boundary.
Without that, AK and Prompt Vault integration would harden the wrong seam.

---

## Explicit non-goals

This correction does **not** mean:

- moving all experiment policy into package-local prose
- replacing Prompt Vault with local prompt files
- replacing AK with local receipts
- using AK as a high-frequency event log
- claiming that a full autonomous loop should land immediately
- claiming that a Prompt Vault router is never useful

It means only that the next truthful owner of executable runtime state is the package-local XState runtime.

---

## Bottom line

The earlier `pi-autoresearch` design work correctly separated durable truth across package, AK, Prompt Vault, and ontology.

The missing correction is this:

> **the executable experiment-loop machine itself should live in `packages/pi-autoresearch` as a package-local XState runtime**

With that correction in place:

- AK can stay the owner of campaign truth
- Prompt Vault can stay the owner of durable decision prompts
- local receipt files can stay projections
- the package can evolve without smuggling its runtime state machine into the wrong authority plane
