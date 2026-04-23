---
summary: "Validation, rollout, and rollback note for the first bounded peer-session messaging slice in pi-extensions: keep the primitive same-machine, communication-only, and consumer-neutral while staging the adapter conservatively."
read_when:
  - "After ADR acceptance for decision 19 and before claiming the first peer-session messaging slice is safe to roll out."
  - "When you need the minimum truthful rollout and rollback posture for the accepted messaging primitive."
type: "reference"
---

# Validation / rollout / rollback — first bounded peer-session messaging slice for `pi-extensions`

## Validation posture

The first peer-session messaging slice is only truthful if all of the following are proven:

1. the package remains a **separate** primitive rather than drifting into orchestrator or ASC ownership
2. same-machine broker/client delivery is deterministic and does not imply network scope
3. duplicate visible names fail closed for name-based delivery
4. session-id targeting remains the exact delivery path when ambiguity exists
5. runtime-only fallback aliases remain non-persistent and addressability-only
6. `ask` reply correlation is explicit and fails closed on ambiguity, disconnect, timeout, or cancellation
7. the first stable contract allows only one in-flight `ask` per local session
8. the `intercom`-compatible public adapter stays an adapter over the owned core rather than redefining it
9. message delivery and reply receipt do not count as canonical state, evidence, or workflow completion by convenience

Interpretation rule:
- the slice is only truthful if transport narrowness and authority narrowness both hold at once
- a passing local message exchange is not proof that authority boundaries remained intact unless the contract guards above are also proven

## Unit-to-proof mapping

### PM-1 — package scaffold + stable core contract

Required proof:
- the package is structurally separate from orchestrator and ASC
- public types/contracts do not smuggle in workflow policy or authority semantics
- docs make communication-only semantics explicit

Evidence shape:
- package contract tests
- package docs review
- package export-map inspection

### PM-2 — same-machine broker/client runtime + presence

Required proof:
- broker spawn/reconnect and local IPC framing/path behavior are deterministic
- peer registration/listing/status remain bounded to same-machine runtime truth
- fallback aliases for unnamed sessions remain runtime-only and addressability-only

Evidence shape:
- broker/path/framing tests
- presence registration/listing tests
- fallback-alias tests

### PM-3 — fail-closed addressing + direct `send` / `ask`

Required proof:
- duplicate-name ambiguity fails closed for name-based delivery
- explicit session-id targeting remains available and exact
- `ask` correlation is explicit and bounded
- timeout/disconnect/cancel paths fail closed
- one-in-flight `ask` guard holds per local session

Evidence shape:
- duplicate-name and exact-targeting tests
- `ask` correlation tests
- timeout/cancel/disconnect negative-path tests
- one-in-flight guard tests

### PM-4 — `intercom`-compatible adapter

Required proof:
- the adapter delegates to the stable core instead of redefining transport semantics
- duplicate-name ambiguity is surfaced clearly in adapter UX/output
- operator-facing compatibility does not imply authority-bearing behavior
- no first-slice overlay/dashboard drift occurs unless explicitly justified and still thin

Evidence shape:
- adapter delegation tests
- human-facing output/examples for ambiguity handling
- docs stating stable core vs adapter boundary

### PM-5 — package docs and validation surface

Required proof:
- package docs describe the core first and adapters second
- examples do not imply orchestration policy or canonical authority
- package validation/release checks remain green once the package exists

Evidence shape:
- strict docs validation
- package `typecheck` / `check`
- release-check where export/publish behavior changes

## Rollout posture

Use a conservative staged rollout:

### Stage 0 — contract and package scaffold
- land the separate package scaffold and stable contract
- no consumer-specific policy
- no overlay obligation

### Stage 1 — same-machine runtime and fail-closed semantics
- land broker/client presence and direct `send` / `ask`
- keep exact id targeting and duplicate-name fail-closed behavior explicit
- keep one-in-flight `ask` guard active

### Stage 2 — `intercom`-compatible adapter
- expose one thin public adapter over the core
- keep compatibility at the adapter layer only
- do not treat adapter success as authority proof

### Stage 3 — optional minimal picker/overlay only if still thin
- allow a minimal picker/compose flow only if it remains a thin adapter
- do not turn the package into a dashboard, room system, or orchestration layer

Interpretation rule:
- Stage 2 is the default public landing target
- Stage 3 is optional and must not be smuggled into the definition of the stable core

## Rollback posture

Rollback is required when any of the following becomes true:

- delivery/addressing semantics become ambiguous or best-effort in ways that violate the ADR
- the adapter begins to carry workflow policy or authority-bearing meaning
- consumer pressure widens the primitive faster than evidence justifies
- same-machine boundaries erode into implicit network semantics

Rollback means:

1. disable or narrow the owned adapter surface
2. keep the ADR/decision history intact as governance trace
3. preserve the owner split: AK authority, ASC execution/runtime, orchestrator control plane, messaging primitive as communication-only transport
4. correct forward through narrowing or supersession rather than pretending the accepted boundary never existed

## Failure-handling posture before wider adoption

When the first slice fails before broader consumer adoption:

- keep the package separate rather than absorbing it into orchestrator or ASC as a recovery shortcut
- preserve tests/docs/evidence showing which fail-closed rule broke
- do not reinterpret failure as proof that messages should become authority-bearing state
- do not widen transport semantics merely to hide a first-slice contract bug

## Knowledge and compression posture

- explicit knowledge exit classification: `none` for now
- do **not** create KES or `ak knowledge` packets until real implementation/use evidence exists
- compression targets for the first slice remain:
  - this validation note
  - `docs/project/2026-04-23-plan-peer-session-messaging-primitive-first-slice.md`
  - `docs/decisions/peer-session-messaging-primitive.md`
  - `ak decision passport 19`
- later empirical pattern work remains separate from the first-slice architecture proof

## Minimal verification commands

At minimum, keep root docs validation green:

```bash
node ~/ai-society/core/agent-scripts/scripts/docs-list.mjs --docs docs --strict
ak decision passport 19
```

Once the new package exists, add package-local validation such as:

```bash
cd packages/<peer-messaging-package>
npm run docs:list
npm run typecheck
npm run check
# and release-check if export/publish behavior changes
```

## AK execution alignment

This note satisfies the post-ADR validation/rollout/rollback artifact requirement for `decision:19`.
A bounded AK task family is now materialized:

- `#1818` umbrella
- `#1819` PM-1
- `#1820` PM-2
- `#1821` PM-3
- `#1822` PM-4
- `#1823` PM-5

Current linkage truth:

- umbrella task `#1818` is linked to `decision:19` as `post_adr_execution`
- the decision remains `unblocked`
- the package task family exists as the bounded execution queue for the slice
- the current AK CLI/runtime does not expose a supported reevaluation path for attaching additional new `post_adr_execution` links after a decision has already returned to `unblocked`

Interpretation rule:
- execute the slice through this task family rather than weakening it into generic messaging work
- preserve the proof obligations recorded here even where current AK link-state support is narrower than the full task family
