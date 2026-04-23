---
summary: "Post-ADR implementation plan for the first bounded peer-session messaging slice in pi-extensions: land a separate same-machine messaging package, preserve communication-only semantics, and keep orchestrator/ASC as consumers rather than owners."
read_when:
  - "After ADR acceptance for decision 19 and before implementing the first peer-session messaging slice."
  - "When turning the peer-session messaging ADR into bounded execution work without reopening the owner split."
type: "plan"
---

# Plan — first bounded peer-session messaging slice for `pi-extensions`

## Scope of this plan

This plan covers only the first bounded post-ADR slice under `decision:19`.
It does **not** authorize orchestration policy, execution-runtime widening, room/network semantics, or authority-bearing message flows.

## Goal

Land the minimum owned package/runtime surface required to make the accepted peer-session messaging contract real:

- a **separate narrow package** under `pi-extensions`
- a package-local presence/message/runtime contract
- same-machine broker/client delivery with local presence
- fail-closed direct `send` / bounded correlated `ask`
- an `intercom`-compatible adapter over the owned core
- focused docs/tests proving the primitive stays communication-only and consumer-neutral

Interpretation rule:
- the primitive must become reusable without becoming authoritative
- orchestration demand proves consumption, not transport ownership
- execution adjacency proves coexistence, not ASC ownership

## Package placement and naming posture

This slice must land in a **new separate narrow package** under `packages/`.

The first scaffold commit now uses `packages/pi-peer-messaging`.
That name remains an execution-scoped choice rather than an architecture-significant commitment as long as all of the following remain true:

- the package remains separate from `pi-society-orchestrator`
- the package remains separate from `pi-autonomous-session-control`
- the package owns only the messaging primitive, not workflow policy or execution runtime
- consumer packages import the primitive rather than re-owning its transport semantics

## Execution graph

The first slice has one dominant dependency shape:

1. package scaffold and stable contract shape first
2. same-machine broker/client runtime and presence depend on that contract
3. addressing + `send` / `ask` semantics depend on the runtime being explicit
4. the `intercom`-compatible adapter depends on the core semantics already being stable
5. docs/tests/package validation close the slice only after the earlier units are real

Interpretation rule:

- do not start with overlay UX
- do not let an adapter name define the stable contract
- do not let orchestrator or ASC integration appear before the primitive itself is truthful

## Units

### PM-1 — package scaffold + stable core contract

- objective:
  - create the separate package scaffold and make the stable core explicit
- outcome:
  - package manifest and public entrypoint(s)
  - package-local `PeerPresence`, `PeerMessage`, `PeerAttachment`, and `PeerMessagingRuntime` contracts
  - explicit note that messages/replies are communication only, not canonical authority
- dependencies / legal preconditions:
  - ADR `docs/decisions/peer-session-messaging-primitive.md`
- authority owner / target substrate:
  - new package under `packages/`
- boundaries / touched surfaces:
  - new package files only
  - root docs only where needed to explain the package boundary
- failure modes:
  - contract shape quietly absorbs consumer policy
  - package scaffold defaults to orchestrator/ASC-coupled semantics
- validation / evidence required:
  - package contract tests
  - docs proving the stable core vs adapter boundary
- current execution status:
  - implemented at `packages/pi-peer-messaging` as a private/source-first scaffold with contract exports, boundary metadata, and package contract tests
  - publish/release proofing is intentionally deferred to PM-5 so PM-1 can stay contract-first

### PM-2 — same-machine broker/client runtime + presence

- objective:
  - implement deterministic local presence and delivery runtime behavior
- outcome:
  - broker spawn/reconnect path
  - same-machine IPC framing/path handling
  - peer registration/listing/status semantics
  - runtime-only fallback addressability for unnamed sessions
- dependencies / legal preconditions:
  - PM-1
- authority owner / target substrate:
  - new messaging package runtime/test surface
- boundaries / touched surfaces:
  - package runtime files
  - package tests
- failure modes:
  - implicit network creep
  - presence identity drift or hidden persistence assumptions
  - unnamed fallback alias becoming stored session title truth by convenience
- validation / evidence required:
  - broker/path/framing tests
  - presence registration/listing tests
  - fallback-alias tests

### PM-3 — fail-closed addressing + direct `send` / `ask` semantics

- objective:
  - implement the bounded interaction rules that make the primitive truthful rather than convenient-but-ambiguous
- outcome:
  - explicit session-id targeting
  - duplicate-name fail-closed behavior for name-based delivery
  - bounded default timeout for `ask`
  - explicit reply correlation
  - one in-flight `ask` per local session in the first stable contract
- dependencies / legal preconditions:
  - PM-2
- authority owner / target substrate:
  - new messaging package runtime/test surface
- boundaries / touched surfaces:
  - package runtime helpers
  - targeting/correlation logic
  - package tests
- failure modes:
  - best-effort routing hides duplicate-name ambiguity
  - `ask` waiter logic allows silent overlap or ambiguous reply matching
  - timeout/disconnect/cancel paths leak partial truth instead of failing closed
- validation / evidence required:
  - duplicate-name ambiguity tests
  - `ask` timeout/cancel/disconnect tests
  - one-in-flight guard tests
  - reply-correlation tests

### PM-4 — `intercom`-compatible public adapter

- objective:
  - preserve the useful operator-facing entrypoint shape without making it the semantic core
- outcome:
  - one `intercom`-compatible adapter surface over the stable core
  - clear adapter wording for duplicate-name ambiguity and exact targeting
  - no requirement to ship overlay UX in the first slice
- dependencies / legal preconditions:
  - PM-3
- authority owner / target substrate:
  - new messaging package adapter/test/docs surface
- boundaries / touched surfaces:
  - adapter entrypoint/tool wiring
  - package docs/examples
  - optional minimal picker work only if it stays thin
- failure modes:
  - adapter logic redefines transport semantics
  - overlay/picker scope expands into dashboard or orchestration policy
  - `intercom` compatibility is mistaken for authority ownership
- validation / evidence required:
  - adapter tests proving it delegates to the stable core
  - docs stating the adapter is not the authority model

### PM-5 — package docs, validation, and release-proofing

- objective:
  - make the new package publishable, testable, and hard to misread
- outcome:
  - package README / contract docs
  - focused validation commands
  - release/export checks once package packaging exists
  - examples showing direct send/ask and duplicate-name disambiguation
- dependencies / legal preconditions:
  - PM-4
- authority owner / target substrate:
  - new messaging package docs/scripts/tests
- boundaries / touched surfaces:
  - package docs
  - package validation scripts/config
  - root docs only where needed to point to the new package
- failure modes:
  - users infer authority-bearing semantics from examples
  - packaging exports suggest internal-only files are public contract
- validation / evidence required:
  - strict docs validation
  - package `typecheck` / `check`
  - release-check if export/publish surface changes

## Structural rules for implementation

- preserve one dominant implementation story for the first slice rather than scattering truth across many weak notes
- keep the accepted ADR as the durable architecture commitment; do not reopen the owner split inside code tasks
- keep higher-level workflow meaning outside the primitive package
- prefer one thin adapter over multiple competing public surfaces in the first slice
- do not create room/swarm/network semantics because one consumer can imagine them
- do not route message delivery or reply receipt into AK evidence or workflow completion by convenience

## AK task materialization status

The bounded AK task family for this first slice is now materialized.

Current task family:

- `#1818` — `[UMBRELLA] Implement first bounded peer-session messaging primitive slice`
- `#1819` — `PM-1 — scaffold separate peer-session messaging package and stable core contract`
- `#1820` — `PM-2 — implement same-machine broker/client runtime and peer presence`
- `#1821` — `PM-3 — implement fail-closed addressing and direct send/ask semantics`
- `#1822` — `PM-4 — add an intercom-compatible adapter over the stable core`
- `#1823` — `PM-5 — add package docs, validation, and release-proofing`

Dependency shape now encoded in AK:

- umbrella `#1818` depends on `#1819-#1823`
- `#1820` depends on `#1819`
- `#1821` depends on `#1820`
- `#1822` depends on `#1821`
- `#1823` depends on `#1822`

Decision/runtime posture currently encoded in AK:

- umbrella task `#1818` is linked to `decision:19` as `post_adr_execution`
- tasks `#1819-#1823` are materialized as the bounded repo-scoped execution family
- current AK CLI/runtime does not provide a supported reevaluation path for attaching additional new `post_adr_execution` links after a decision is already back in `unblocked`
- therefore the package task family is materialized truthfully, while the umbrella link is the currently recorded decision-runtime anchor

Interpretation rule:
- use the AK task family as the executable leaf queue rather than re-deriving work from this document alone
- preserve the current package-bounded scopes and forbidden paths
- if AK later gains a supported reopen/reevaluation path for this case, attach `#1819-#1823` to `decision:19` rather than creating duplicate execution tasks

## Expected follow-on after this plan lands

After this first slice lands, the next truthful move is not immediate widening.
It is validating whether multiple real consumers are actually blocked by missing transport semantics before broadening the primitive beyond the accepted same-machine direct-message boundary.
