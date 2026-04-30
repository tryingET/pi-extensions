---
summary: "Contract for the bounded orchestrator-side follow-on that defines how pi-society-orchestrator may supervise manifest-driven pi-autoresearch campaigns and write AK evidence without turning the package into a whole-campaign controller or adding task lifecycle mutation by default."
read_when:
  - "Before implementing or reviewing task 1701 for manifest-driven pi-autoresearch campaign supervision in pi-society-orchestrator."
  - "When deciding what pi-society-orchestrator may observe or write into AK for manifest-driven llama.cpp campaign state above the pi-autoresearch package seam."
  - "When you need the exact evidence-only owner split for orchestrator-side follow-on work after the public campaign-control and task-verification slices landed in pi-autoresearch."
type: "reference"
system4d:
  container: "Package-local contract note for the orchestrator-side follow-on above manifest-driven pi-autoresearch campaign control."
  compass: "Reuse package-derived manifest campaign truth for bounded supervision and AK evidence without reviving a hidden daemon, second controller, or direct lifecycle automation policy."
  engine: "State the landed package baseline -> freeze the owner split -> define exact observation/evidence policy -> define what stays outside the orchestrator in v1."
  fog: "The main risks are duplicating package-local campaign logic inside the orchestrator, writing AK evidence from caller-asserted rather than verified task context, or quietly widening into task completion / whole-campaign control."
---

# Contract — orchestrator-side supervision and AK evidence policy for manifest-driven `pi-autoresearch` campaigns

## Why this note exists

The manifest-driven llama.cpp campaign concern in `packages/pi-autoresearch` now already has the lower layers this orchestrator-side follow-on must build on:

1. a checked manifest-driven campaign surface
2. stage-scoped `41 / 42 / 43` execution binding
3. one package-local manifest campaign projection artifact
4. one non-mutating exact-task AK-binding helper for manifest campaigns
5. one bounded campaign-local autonomy helper
6. one bounded public campaign-control seam with explicit verified/unverified task-context semantics

Those facts are already captured in:

- [`packages/pi-autoresearch/docs/project/product-posture.md`](../../pi-autoresearch/docs/project/product-posture.md)
- [`packages/pi-autoresearch/docs/project/llamacpp-campaign-control-surface-status.md`](../../pi-autoresearch/docs/project/llamacpp-campaign-control-surface-status.md)
- [`packages/pi-autoresearch/docs/project/2026-04-18-public-ak-task-verification-rfc.md`](../../pi-autoresearch/docs/project/2026-04-18-public-ak-task-verification-rfc.md)
- [`packages/pi-autoresearch/docs/adr/2026-04-18-public-ak-task-verification-semantics.md`](../../pi-autoresearch/docs/adr/2026-04-18-public-ak-task-verification-semantics.md)

What is still missing is the exact orchestrator-side policy for the later follow-on:

> how `pi-society-orchestrator` may observe manifest-driven campaign truth and write bounded AK evidence above that package seam without taking over campaign execution, duplicating package-local logic, or turning package-local completion into automatic task lifecycle mutation.

This note freezes that contract for task `#1701`.
Implementation status and refreshed proof coverage for the bounded follow-on now live in [pi-autoresearch manifest campaign supervision status](./pi-autoresearch-manifest-campaign-supervision-status.md).

---

## Current truthful starting point

Today the truthful repo state for this concern is:

- `packages/pi-autoresearch` owns manifest validation, stage binding, campaign projection, autonomy, public control, and exact-task AK-binding derivation
- `pi-autoresearch` public control now distinguishes:
  - no task requested
  - verified live task context
  - task not found
  - verification unavailable
- the lower-level technical `build_ak_binding` helper remains caller-driven and non-mutating below the public seam
- `pi-society-orchestrator` already owns:
  - bounded AK evidence writing policy
  - live supervision for the earlier runtime-kernel concern
  - complete-only lifecycle automation for the earlier runtime-kernel concern
- there is **not** yet any separate orchestrator contract for manifest-driven campaign observation/evidence policy

So this follow-on is **not** about inventing the manifest concern, inventing campaign AK binding, or making the orchestrator the campaign runtime owner.
It is about freezing the smallest truthful **orchestrator-side observation and evidence policy** above the now-landed package seam.

---

## Contract in one sentence

`pi-society-orchestrator` may observe one exact manifest-driven campaign and, when given one exact verified AK task anchor, write coarse AK evidence by reusing package-derived manifest campaign AK-binding truth, but it must stay evidence-only in v1 and must not add live polling, automatic task completion/failure, stage execution, or whole-campaign control for this concern.

---

## Governing owner split

| Concern | Owner in this slice | Why |
|---|---|---|
| Manifest validation, stage expectation, campaign projection, autonomy, public control, and exact-task AK-binding derivation | `packages/pi-autoresearch` | These are already package-local source seams for the concern |
| Bounded orchestrator-side observation and AK evidence write policy above those package seams | `pi-society-orchestrator` | This is the coordination-plane follow-on being defined here |
| Durable AK task identity, evidence attachment, and any later task lifecycle mutation | AK | Still the durable task/campaign owner |
| Direct campaign stage execution, fork prep, and package-local one-step advancement | `packages/pi-autoresearch` + workstation scripts | These remain below the orchestrator layer |
| Benchmark winner semantics, review closure, or task completion policy for manifest campaigns | explicit later caller / later decision | Not part of v1 evidence policy |

Interpretation rule:

> The orchestrator may reuse package-derived manifest campaign truth.
> It does **not** become the owner of campaign execution, benchmark semantics, or automatic manifest-campaign task lifecycle mutation merely because it can write evidence above the package seam.

---

## V1 policy decision

V1 for this concern is:

- **exact-anchor**
- **package-derived**
- **evidence-only**
- **non-polling by default**

That means:

1. the orchestrator may supervise only when the caller already has one exact manifest path and one exact AK task anchor
2. supervision must reuse package-derived source-level helpers rather than re-deriving a second manifest campaign state model inside orchestrator
3. orchestrator AK writes are limited to evidence for this concern in v1
4. orchestrator does **not** get a live polling/session runner for manifest campaigns in this task
5. orchestrator does **not** auto-complete or auto-fail AK tasks for manifest-driven campaigns in this task

### Why evidence-only is the first truthful move

The package now already has one exact-task AK-binding helper for manifest campaigns.
That helper is strong enough to support bounded orchestrator-side evidence projection.

But the package baseline still does **not** prove all the stronger things an orchestrator-side lifecycle mutator would need for this concern, such as:

- semantic benchmark success beyond stage materialization
- winner/recommendation interpretation
- review or operator sign-off above terminal-stage materialization
- a lawful general rule that terminal stage presence equals task completion for the anchored campaign objective

So v1 must stop at evidence.

---

## Source seam the orchestrator may trust

The orchestrator should trust source-level helpers in:

- [`packages/pi-autoresearch/src/core/llamacppCampaign.ts`](../../pi-autoresearch/src/core/llamacppCampaign.ts)

The key bounded helpers are already there:

- `buildLlamacppCampaignControlSurface(...)`
- `inspectLlamacppCampaignControl(...)`
- `buildLlamacppCampaignAkBinding(...)`
- `buildLlamacppCampaignAkBindingDetails(...)`

### Trust boundary rule

The orchestrator must reuse those source-level helpers directly.
It must **not**:

- parse formatted control text from `formatLlamacppCampaignControlResult(...)`
- parse `/autoresearch` help text
- infer stage/build selections itself
- invent a second persisted supervision artifact for the manifest concern
- reinterpret package-local receipts into benchmark winner semantics

A fresh in-process reuse of the package helper layer is the truthful source. The task `#1703` guardrail proof keeps this concrete by allowing `pi-society-orchestrator` imports of `pi-autoresearch` only through the package runtime seam.

---

## Supervision policy

### Exact observation identity

Any future orchestrator-side observation for this concern must use the exact tuple:

- resolved `cwd`
- exact `manifestPath`
- optional exact `taskId`

No fuzzy manifest discovery.
No fuzzy task discovery.
No repo-wide scan for a likely campaign.

### Observation modes allowed in v1

Allowed in this contract:

- one-shot observe / inspect behavior above exact package helper truth
- bounded evidence write after exact-task verification and package-derived AK-binding derivation

Not allowed in this contract:

- a hidden daemon
- automatic polling loops
- background session state
- a new operator-facing live supervision runner for manifest campaigns

### Why live polling is excluded in v1

The manifest-driven campaign concern does not yet have a committed orchestrator-side runtime/session need analogous to the earlier runtime-kernel supervision wave.
The package already has truthful one-shot public control plus package-local progression semantics.
So the smallest truthful orchestrator move is a one-shot observation/evidence layer, not a second live session runner.

Any later move to live polling would require a separate bounded contract and task.

---

## AK evidence policy

### Required anchor

An AK evidence write for this concern requires:

- one exact `taskId`
- one successful live AK task verification by the orchestrator-side evidence path
- one package-derived `LlamacppCampaignAkBindingV1`

The orchestrator must not write AK evidence for this concern from:

- caller-supplied task ids that remain unverified
- package-local public control states with `taskContext.verificationState !== "verified_live"`
- guessed or inferred task anchors

### Evidence payload source

The orchestrator must reuse the package helper outputs directly:

- `binding.ak.checkType`
- `binding.ak.result`
- `buildLlamacppCampaignAkBindingDetails(binding)`

That keeps the evidence payload canonical to the package concern instead of inventing a second orchestrator-owned schema for the same milestone.

### Evidence-only milestone set

V1 may write evidence only for the already-defined package binding milestones:

- `planned`
- `materializing`
- `stage41_complete`
- `stage42_complete`
- `terminal_stage_complete`

with the package-defined `checkType` values:

- `autoresearch:llamacpp-campaign:planned`
- `autoresearch:llamacpp-campaign:materializing`
- `autoresearch:llamacpp-campaign:stage41-complete`
- `autoresearch:llamacpp-campaign:stage42-complete`
- `autoresearch:llamacpp-campaign:terminal-stage-complete`

### Idempotence rule

The orchestrator evidence path must stay idempotent under repeated unchanged observations.
So it must dedupe on the same logical ingredients the package helper already surfaces:

- exact `taskId`
- `checkType`
- deterministic `projectionKey`

If the latest visible evidence for that `taskId` + `checkType` already carries the same `projectionKey`, write nothing.

### Evidence interpretation rule

Even when the package helper says `terminal_stage_complete`, the orchestrator-side policy remains:

- **evidence-only**
- **not task-complete**

because the current package concern still binds terminal-stage materialization, not semantic benchmark success or durable operator sign-off.

---

## Lifecycle policy for manifest campaigns in orchestrator v1

The orchestrator must **not** perform any AK task lifecycle mutation for this concern in v1.
That means:

- no `ak task complete`
- no `ak task fail`
- no `ak task claim`
- no scope/title/description mutation

### Why this differs from the earlier runtime-kernel supervision wave

The earlier runtime-kernel live supervision workstream had a stronger package-local completion contract tied to verified finalization materialization of the core runtime concern.

This manifest-driven campaign concern does **not** yet have an equivalent accepted rule that says:

- terminal-stage evidence now means the anchored AK task should complete

So the orchestrator must stop at evidence here.

Any later lifecycle automation for manifest-driven campaigns would need a separate bounded decision proving what extra completion/failure facts exist beyond the current AK-binding helper.

---

## What this slice must not do

V1 must **not** do any of the following:

- add a new live manifest-campaign supervision daemon or polling runner
- auto-run `advance`, `execute_stage`, `prepare_fork`, or whole-campaign execution
- treat a caller-supplied positive `taskId` as enough to write AK evidence without exact live verification
- invent a second orchestrator-owned milestone schema for the same concern
- auto-complete or auto-fail manifest campaign tasks
- reinterpret package-local receipts into benchmark winners or recommendations
- collapse the package public seam and technical helper seam into one orchestrator-owned contract

---

## Verification contract for later implementation

A later implementation above this note is good enough when it proves all of the following:

1. **exact-anchor proof**
   - the orchestrator path requires exact manifest and exact task anchors
2. **package-derived proof**
   - the orchestrator reuses package helper outputs rather than inventing a second manifest campaign state model
3. **verified-task proof**
   - unverified task context never produces an AK evidence write
4. **idempotence proof**
   - unchanged `projectionKey` values do not spam duplicate AK evidence
5. **evidence-only proof**
   - even terminal-stage evidence does not trigger task lifecycle mutation in v1
6. **boundary proof**
   - no polling/session daemon, no stage execution, and no winner semantics are introduced by the orchestrator implementation

---

## Bottom line

The next truthful orchestrator-side move above manifest-driven `pi-autoresearch` campaigns is **not** to build a second control plane.
It is to define one bounded supervision/evidence policy where:

- package-local helpers remain the source of truth for manifest campaign state
- orchestrator may observe that state one-shot and write AK evidence only from exact verified task anchors
- orchestrator stays evidence-only for this concern in v1
- any later live polling or task lifecycle automation still needs a separate explicit bounded decision
