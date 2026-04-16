---
summary: "Umbrella status note for re-anchoring pi-autoresearch to stack-map-aligned runtime, prompt, semantic, and learning-capture boundaries."
read_when:
  - "You need the shortest truthful answer to what AK umbrella task #1465 actually changed."
  - "Before claiming pi-autoresearch is aligned to the stack map and runtime authority matrix."
type: "reference"
system4d:
  container: "Repo-root umbrella closure note for the pi-autoresearch boundary realignment wave in the pi-extensions monorepo."
  compass: "Bind the correction note, federated-learning note, and doc refresh into one concise statement of current truthful ownership."
  engine: "Map child-task outputs -> align them to stack-map/runtime-authority layers -> record what is now true vs still not implemented."
  fog: "The main risk is claiming the runtime/control-plane split is implemented end to end when the current landing is still primarily a boundary correction and doc realignment wave."
---

# 2026-04-16 — `pi-autoresearch` stack-map-aligned boundary status

## Why this note exists

AK umbrella task `#1465` — `[UMBRELLA] Re-anchor pi-autoresearch architecture to stack-map-aligned runtime/control-plane boundaries` — depended on three narrower slices:

- `#1466` — write the `pi-autoresearch` architecture correction note
- `#1467` — review KES stance and define federated learning boundaries for `pi-extensions`
- `#1468` — refresh older `pi-autoresearch` and self-to-ontology docs to match the revised architecture

Those child tasks are now landed.
This note closes the umbrella by stating the smallest truthful current answer to:

- which layer owns what now
- what the child tasks actually corrected
- what still remains unimplemented after the correction wave

## What is now aligned

## 1. Executable experiment-loop state belongs in the package runtime

`pi-autoresearch` is now documented as a **package-local runtime owner** for its executable experiment-loop state.

That means:

- the package owns the domain machine
- the next truthful implementation slice is a package-local state machine around the bounded helpers
- the runtime machine should not be modeled primarily as AK rows or Prompt Vault routers

This aligns the capability with the stack map's **execution/runtime package layer** and with the runtime authority rule that host/package execution is distinct from durable governance truth.

## 2. AK owns durable campaign truth, not runtime microstate

The correction wave now makes explicit that AK should own things like:

- campaign identity
- scope
- durable objective/milestones
- evidence/result references

It should **not** become the sink for transient local runtime microstate such as benchmark/check transitions or local decision branches inside one session.

This aligns `pi-autoresearch` with the runtime authority matrix rule that repo-local task/campaign truth belongs in AK, while execution runtime behavior remains a separate owner.

## 3. Prompt Vault owns durable decision procedures, not the runtime state machine

The corrected durable Prompt Vault minimum is now the three one-shot procedures:

- `pi-autoresearch-setup`
- `pi-autoresearch-next-hypothesis`
- `pi-autoresearch-finalize`

The earlier `pi-autoresearch-state-router` draft remains a possible later surface, but it is no longer treated as the main near-term blocker for truthful runtime evolution.

This aligns the capability with the stack map's **transition-procedure layer**:

- Prompt Vault shapes governed decision procedures
- Prompt Vault does not own runtime truth by itself

## 4. Semantic staging remains controlled and narrow

The self-to-ontology side of the correction wave now reads consistently with the federated-learning boundary:

- `self` owns semantic-pressure annotation memory at the mirror layer
- `ontology_proposal` owns plan-only ontology assessment
- repo-root `governance/ontology-candidates/` is a narrow ontology-specific candidate staging surface
- candidate staging does **not** become a generic root `docs/learnings/` learning bus

This keeps semantic evolution in the stack map's **semantics layer** and **human crystallization layer** without letting either one over-claim runtime authority.

## 5. Learning capture stays federated by owner

The repo now has an explicit root-level statement that:

- orchestrator KES remains a **package-owned** seam
- package-local capture should stay package-local
- root-level docs should synthesize across owners only after explicit review
- repo-root ontology-candidate staging is a narrow exception for repo-root semantic work, not a precedent for general monorepo learning centralization

This aligns the `pi-autoresearch` correction wave with the stack map rule that learning/crystallization surfaces must not silently become runtime authority or cross-package control planes.

## Authority snapshot after the umbrella

| Concern | Current truthful owner | Why |
|---|---|---|
| Executable `pi-autoresearch` runtime state and transitions | `packages/pi-autoresearch` | Domain runtime behavior belongs in the package/runtime layer |
| Durable campaign identity, scope, and evidence/result truth | AK | Campaign/task truth belongs in runtime authority, not local receipts |
| Durable setup / next-hypothesis / finalize procedures | Prompt Vault | These are governed decision procedures, not runtime microstate |
| Experiment semantics | repo-local ontology | Semantic meaning belongs in ontology/ROCS surfaces |
| Learning capture / candidate staging | owner-local surfaces with explicit promotion | KES and repo-root semantic staging remain candidate/projection layers, not general authority |

## What this umbrella does **not** mean

This umbrella should **not** be read as having implemented any of the following yet:

- the actual package-local XState runtime
- AK binding inside the live `pi-autoresearch` package runtime
- machine-invoked Prompt Vault decision steps inside the runtime
- a governed router inserted into Prompt Vault
- autonomous resume/loop lifecycle
- a generalized monorepo learning substrate

The umbrella is complete as a **boundary realignment wave**, not as the full implementation of the next runtime slices.

## Child-task mapping

| Task | Commit | Landed surface |
|---|---|---|
| `#1466` | `7951283` | `docs/project/pi-autoresearch-architecture-correction.md` + diary |
| `#1467` | `2706ed8` | `docs/project/federated-learning-and-kes-boundaries.md` + diary |
| `#1468` | `02dc7a0` | refresh of older `pi-autoresearch` / self-to-ontology docs + diary |

## Verification for umbrella closure

The umbrella was closed by:

1. verifying all three dependency tasks were already completed
2. adding this umbrella status note and a scoped diary note
3. realigning package-facing `pi-autoresearch` docs with the corrected optional-router posture
4. re-validating the touched markdown artifacts with strict docs validation
5. re-running package checks for `packages/pi-autoresearch`

## Bottom line

`#1465` is complete when read as a stack-map-aligned **authority correction and doc realignment** wave:

- package runtime owns executable experiment-loop state
- AK owns durable campaign truth
- Prompt Vault owns one-shot governed decision procedures
- ontology/semantic candidate staging stays controlled
- learning capture stays federated by owner

What still comes next is implementation of the package-local state machine and its later AK / Prompt Vault runtime bindings.
