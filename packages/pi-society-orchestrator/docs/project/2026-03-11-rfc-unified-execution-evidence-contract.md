---
summary: "Bounded plan for unifying execution classification and evidence side effects across direct dispatch and loop execution."
read_when:
  - "Reviewing the execution/evidence cleanup slice after runtime hardening."
  - "Checking why direct dispatch and loops now share one execution/effect policy."
system4d:
  container: "Single-slice plan for execution/evidence contract unification."
  compass: "Make timeout/abort/protocol-failure behavior explicit and shared across callers."
  engine: "Centralize evidence write policy -> route both callers through it -> test degraded paths."
  fog: "The main risk is keeping success/failure semantics aligned while preserving abort safety and bounded SQL fallback."
---

# Unified execution/evidence contract — 2026-03-11

## Scope

Complete the bounded execution-contract pack from `next_session_prompt.md`:
- unify timeout / abort / protocol-failure semantics
- unify evidence recording / fallback eligibility across direct dispatch and loops
- avoid caller-specific interpretation drift

## Acceptance criteria

1. Direct dispatch and loop execution both use one shared execution/effect policy helper.
2. Abort remains fail-closed for execution success and does not emit follow-on evidence writes.
3. Timeout and protocol-failure outcomes record fail evidence under the same policy in both callers.
4. SQL fallback eligibility is shared:
   - allowed for non-abort, non-timeout `ak` evidence failures
   - rejected for aborted/timed-out evidence-write attempts
5. Regression tests cover shared policy behavior under abort, timeout, and fallback paths.

## Chosen policy

- Canonical execution status remains:
  - `done`
  - `aborted`
  - `timed_out`
  - `error`
- Shared evidence/effect policy:
  - `aborted` => execution failure, skip evidence write
  - `timed_out` => execution failure, write fail evidence
  - protocol failure / non-zero exit => execution failure, write fail evidence
  - successful execution => write pass evidence
- Shared evidence-write fallback policy:
  - `ak` success => canonical path
  - `ak` non-timeout/non-abort failure => SQL fallback allowed
  - `ak` abort/timeout => fail closed, no SQL fallback

## Implementation notes

- Introduce `src/runtime/evidence.ts` as the shared contract surface.
- Route both `cognitive_dispatch` and loop execution through `finalizeExecutionEffects(...)`.
- Route concrete evidence writes through one `recordEvidence(...)` helper with injectable runners for deterministic tests.
