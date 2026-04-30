---
summary: "Contract for Workstream B of pi-autoresearch: package-owned resume snapshot, operator control surface, and local artifact model for lawful continue / rebaseline / finalize / stop decisions without inventing a second lifecycle plane."
read_when:
  - "Before implementing or reviewing tasks 1534, 1535, or 1536 in the resume/control workstream."
  - "When deciding what resume state should live in package artifacts versus AK, Prompt Vault, ASC, or orchestrator."
  - "When you need the exact local artifact model and operator-action contract for continue / rebaseline / finalize / stop."
type: "reference"
system4d:
  container: "Package-local contract note for Workstream B of the pi-autoresearch target control-plane rollout."
  compass: "Make fresh-session resume and operator control real inside the package while keeping AK as campaign-truth owner, Prompt Vault as decision owner, and ASC as adjacent execution-lifecycle owner."
  engine: "State current truth -> freeze owner split -> define the resumable artifact model -> define the operator control overlay -> bound verification and non-goals."
  fog: "The main risks are turning local snapshot files into durable campaign authority, collapsing operator control into hidden machine mutations, or recreating a second long-lived lifecycle plane beside ASC."
---

# Contract — resume/control surface and artifact model for `pi-autoresearch`

## Why this note exists

`pi-autoresearch` now already has the two lower layers Workstream B must build on:

1. a package-local runtime machine + append-only event ledger
2. live governed Prompt Vault decisions for setup / next-hypothesis / finalize

Those facts are already captured in:

- [product-posture](./product-posture.md)
- [runtime machine and event-ledger status](../../../../docs/project/2026-04-16-pi-autoresearch-runtime-machine-and-ledger-status.md)
- [Prompt Vault runtime-decision contract](./prompt-vault-runtime-decision-contract.md)
- [Prompt Vault runtime-decision status](./prompt-vault-runtime-decision-status.md)
- [architecture correction](../../../../docs/project/pi-autoresearch-architecture-correction.md)
- [pi-autoresearch RFC](../../../../docs/project/pi-autoresearch-rfc.md)

What is still missing is the exact contract for the next bounded slice:

> how the package should persist a resumable runtime snapshot and expose explicit operator control choices across fresh sessions without pretending that local artifacts, AK, Prompt Vault, or ASC have switched owners.

This note freezes that contract for Workstream B.

---

## Current truthful starting point

Today the package truth is:

- the package owns the executable campaign machine, receipt projection, and append-only event ledger
- the bounded runtime can already derive machine state from the ledger when aligned, or from bounded receipt fallback when needed
- the package can already invoke governed setup / next-hypothesis / finalize decisions live
- post-run next-hypothesis output already maps into package-owned machine states such as:
  - `ready`
  - `rebaseline_needed`
  - `finalize_candidate`
  - `blocked`
- the package does **not** yet persist an explicit resume/control overlay for fresh sessions
- the package does **not** yet expose one truthful operator control surface for:
  - continue
  - rebaseline
  - finalize
  - stop
- `/autoresearch` still truthfully describes the broader autonomy lifecycle as out of scope

So Workstream B is **not** about inventing the machine, inventing Prompt Vault decisions, or moving campaign truth into local JSON.
It is about adding the first package-owned **resume/control overlay** above the already-landed machine.

---

## Contract in one sentence

`pi-autoresearch` should add one projection-only local runtime snapshot that stores resumable machine context plus explicit operator control intent, and one bounded operator control surface that can set `continue` / `rebaseline` / `finalize` / `stop` lawfully across fresh sessions, while ledger/receipts remain the reconstructible runtime source, Prompt Vault remains the decision owner, AK remains durable campaign truth, and ASC remains the adjacent execution-lifecycle owner.

---

## Governing owner split

| Concern | Owner in Workstream B | Why |
|---|---|---|
| Executable experiment machine, receipt summaries, event replay, and control-intent consumption rules | `packages/pi-autoresearch` | This is domain runtime behavior |
| Fresh-session runtime snapshot and control overlay artifact | `packages/pi-autoresearch` local artifacts | These are package-owned resume projections, not durable society truth |
| Durable campaign/task truth, scope, and evidence/result ownership | AK | Workstream B still does not move campaign authority into local files |
| Durable setup / next-hypothesis / finalize procedures | Prompt Vault | These remain governed decision procedures |
| Exact template preparation and company-bound prompt-plane semantics | `pi-vault-client/prompt-plane` | Workstream A already fixed this seam and Workstream B does not replace it |
| Generic long-lived execution/session lifecycle invariants | `pi-autonomous-session-control` | Workstream B must not recreate a second generic runtime-lifecycle plane |
| Higher-order polling, supervision, and later campaign automation | `pi-society-orchestrator` | Still a separate upper-layer concern |

Interpretation rule:

> `pi-autoresearch` owns the **domain control overlay** for this experiment runtime.
> It does **not** become the owner of generic session runtime, durable campaign truth, or governed prompt procedures.

---

## Workstream B target done-state

Workstream B is done when the following are all true:

1. the package writes one exact local runtime snapshot artifact for the current campaign segment
2. that snapshot stores:
   - resumable machine projection facts
   - bounded Prompt Vault decision summary facts already surfaced by the runtime
   - explicit operator control intent for continue / rebaseline / finalize / stop
3. the snapshot is explicitly projection-only and is validated against current ledger/receipt truth before reuse
4. a fresh session can reload the bounded runtime and recover the same lawful control posture without inventing missing history
5. the package exposes one explicit operator control surface above the machine
6. that surface advertises only the actions that are lawful for the current runtime posture
7. choosing `continue`, `rebaseline`, `finalize`, or `stop` becomes typed package-owned control intent, not ad hoc prose or hidden state mutation
8. the bounded runtime consumes those operator choices fail-closed:
   - `continue` may permit the next bounded run
   - `rebaseline` holds the campaign for reconfiguration/setup work
   - `finalize` holds the campaign for finalization orchestration
   - `stop` halts package-local progression until explicitly changed
9. tests prove snapshot write/load behavior, stale-snapshot rejection, action legality, and fresh-session resume behavior
10. a later status/proof note can close the umbrella without overstating Workstream B as full autonomy or finalization materialization

### Explicitly included in this done-state

- a package-local resumable runtime snapshot
- a control-state loader that merges current runtime truth with saved operator intent
- an operator-facing control surface for exact bounded actions
- truthful status/help reporting for resume state and selected control intent
- fail-closed handling when saved control state is stale or illegal for the current machine posture

### Explicitly **not** included in this done-state

- a background autonomous loop
- generic session spawning / cancellation / reservation logic owned by ASC
- AK task lifecycle automation
- finalization branch creation or `groups.json` materialization
- Prompt Vault router insertion
- local artifacts becoming the durable control plane

---

## Local artifact model

Workstream B should keep the existing append-only history artifacts and add exactly one current-state projection artifact.

| Artifact | Kind | Role in Workstream B | Authority posture |
|---|---|---|---|
| `autoresearch.jsonl` | append-only receipt log | config/run history and bounded decision-summary history | reconstructible runtime projection only |
| `autoresearch.events.jsonl` | append-only event ledger | machine replay/projection source when coherent | reconstructible runtime projection only |
| `autoresearch.runtime.json` | latest snapshot projection | current resumable machine + control overlay for fresh-session reuse | projection only; never sole runtime truth |
| `autoresearch.md` | local operator notes / plan | useful setup context | local aid only |
| `autoresearch.sh` | benchmark script | executable benchmark surface | package-local runtime input |
| `autoresearch.checks.sh` | checks script | executable correctness gate | package-local runtime input |
| `autoresearch.ideas.md` | bounded ideas backlog | optional context for later decisions | local aid only |

### Why only one new current-state artifact

The current machine state is already reconstructible from ledger + receipts.
What is not cleanly reconstructible today is the explicit **operator control overlay** that says which bounded action the operator has chosen for the current posture.

So Workstream B should not add a forest of local status files.
It should add one compact current-state snapshot that can be cross-checked against the append-only history.

---

## Snapshot contract

A truthful first shape is:

```ts
type AutoresearchOperatorAction = "continue" | "rebaseline" | "finalize" | "stop";

type AutoresearchControlStateKind =
  | "none"
  | "awaiting_operator"
  | AutoresearchOperatorAction;

interface AutoresearchControlStateV1 {
  kind: AutoresearchControlStateKind;
  allowedActions: AutoresearchOperatorAction[];
  reason: string | null;
  selectedAt: number | null;
}

interface AutoresearchRuntimeSnapshotV1 {
  type: "runtime_snapshot";
  version: 1;
  phase: "bounded_runtime_kernel";
  cwd: string;
  updatedAt: number;
  segmentKey: string | null;
  runtimeKey: string | null;
  projectionSource: "ledger" | "receipt_fallback";
  machine: {
    state: CampaignMachineStateValue;
    resumeState: CampaignMachineResumeState | null;
    blockedReason: string | null;
    completionReason: string | null;
  };
  segment: {
    name: string | null;
    metricName: string | null;
    metricUnit: string;
    direction: MetricDirection | null;
    benchmarkCommand: string | null;
    checksCommand: string | null;
    runCount: number;
    successfulRunCount: number;
    baselineMetric: number | null;
    bestMetric: number | null;
    lastRunStatus: RunStatus | null;
    lastRunMetric: number | null;
  };
  decision: {
    availability: AutoresearchPromptVaultDecisionAvailability;
    lastPostRunDecision: AutoresearchRunDecisionSummary | null;
  };
  control: AutoresearchControlStateV1;
}
```

### Field interpretation

#### `segmentKey`
A deterministic fingerprint of the current configured segment.
It should change when the benchmark/check/config contract changes materially.

#### `runtimeKey`
A deterministic fingerprint of the current derived runtime posture.
It should include enough information to detect stale control overlays, such as:

- current segment identity
- run counters
- last run status/metric
- machine state
- latest governed decision timestamp/status when present
- projection-source integrity facts relevant to reuse

#### `projectionSource`
This reports whether the snapshot was derived from:

- `ledger` — the preferred replayable source, or
- `receipt_fallback` — a bounded degraded reconstruction path

The loader may still reuse a snapshot derived from `receipt_fallback`, but it must label the resumed posture truthfully.

#### `control`
This is the only part of Workstream B that is not already reconstructible from append-only history.
It is therefore the main reason the snapshot exists at all.

---

## Resume loader contract

The loader must treat the snapshot as a **checked overlay**, not as the runtime's new root authority.

### Required source precedence

1. derive the current runtime posture from the event ledger when the ledger is coherent
2. fall back to receipt reconstruction only when ledger truth is missing/stale and the existing bounded runtime already does so lawfully
3. load `autoresearch.runtime.json` only after the current posture is derived
4. reuse the saved `control` block only when the snapshot still matches the current derived posture closely enough
5. clear or degrade stale control state instead of pretending it still applies

### Required staleness rules

The loader must reject or clear the saved control overlay when any of the following is true:

- `cwd` does not match the current runtime cwd
- `segmentKey` no longer matches the current configured segment
- `runtimeKey` no longer matches the current derived posture
- the saved `control.kind` is not legal for the current runtime posture
- the saved snapshot claims a more advanced state than the current replayable history supports

### Required degraded behavior

If the snapshot is missing or stale:

- rebuild current runtime truth from ledger/receipts
- derive the default control state from the rebuilt runtime posture
- report that the saved control overlay was not reused
- do **not** fabricate a remembered operator choice

This is the main fail-closed rule for Workstream B.

---

## Default control-state derivation

When no valid saved control overlay can be reused, the package should derive a default control posture from the current machine/runtime state.

| Derived runtime posture | Default control kind | Allowed actions | Why |
|---|---|---|---|
| `ready` | `none` | `continue`, `stop` | The runtime is lawful to keep running, but the operator may still halt it |
| `awaiting_decision` | `awaiting_operator` | `continue`, `rebaseline`, `finalize`, `stop` | A bounded next move is needed and the operator may need to choose explicitly |
| `rebaseline_needed` | `awaiting_operator` | `rebaseline`, `stop` | Continuing without baseline repair is not lawful |
| `finalize_candidate` | `awaiting_operator` | `continue`, `finalize`, `stop` | The operator may accept finalization or explicitly keep iterating |
| `blocked` | `awaiting_operator` | `stop` | Workstream B should not pretend every block can be solved by package-local continuation |
| `segment_unconfigured` | `none` | `stop` | No continuation should be advertised before configuration exists |
| `completed` | `none` | [] | Terminal package posture for this bounded workstream |

### Important rule about `continue`

`continue` is **not** a command to ignore constraints.
It is only legal where the runtime posture still allows another bounded move.
In particular:

- `continue` is legal from `ready`
- `continue` may also be used as an explicit operator override from `finalize_candidate`
- `continue` is **not** legal from `rebaseline_needed`
- `continue` is **not** a synonym for clearing arbitrary blocks

---

## Operator control surface contract

Workstream B needs one explicit operator mutation surface above the machine.
A truthful first shape is a dedicated tool rather than silently overloading status text:

```ts
interface AutoresearchRuntimeControlInput {
  action?: "status" | "set";
  decision?: "continue" | "rebaseline" | "finalize" | "stop";
  reason?: string;
}
```

A truthful first output should include at least:

- current derived machine/runtime posture
- whether the saved snapshot was reused or discarded
- current `control.kind`
- currently allowed actions
- the selected action timestamp/reason when present
- the shortest truthful next-step explanation

### Why a dedicated control surface is required

This keeps Workstream B explicit:

- `autoresearch_runtime_status` stays the main read surface
- `autoresearch_runtime_run` stays the bounded execution surface
- the operator's explicit choice lives in one small mutation surface instead of leaking into hidden runtime side effects

`/autoresearch` may summarize and point to the control surface, but the real write-path should remain typed and testable.

---

## Exact action semantics

Workstream B actions are **operator intent overlays**.
They do not automatically materialize every downstream step in the same slice.

### 1. `continue`

Meaning:
- the operator approves another bounded iteration from the current lawful posture

Required behavior:
- legal only when the current posture allows another bounded move
- writes `control.kind = "continue"`
- allows the next bounded run surface to consume that intent
- once a new run starts successfully, the consumed control intent should clear back to `none`

### 2. `rebaseline`

Meaning:
- the operator accepts that baseline/config truth must be refreshed before another normal run

Required behavior:
- legal only when the current posture requires or plausibly permits rebaseline work
- writes `control.kind = "rebaseline"`
- prevents ordinary bounded `run` execution until reconfiguration/setup work consumes the intent
- later setup/reconfigure flow may clear this intent back to `none`

Important boundary:
- Workstream B does **not** yet define the whole reconfiguration materialization path
- it defines the control intent and gating behavior only

### 3. `finalize`

Meaning:
- the operator chooses finalization as the next control-plane phase

Required behavior:
- legal only when the runtime posture is finalize-worthy
- writes `control.kind = "finalize"`
- prevents ordinary bounded `run` execution until a later finalization slice consumes the intent
- may coexist with the already-landed governed finalization proposal packet from Workstream A

Important boundary:
- Workstream B does **not** create branches, materialize groups, or mark the whole campaign complete solely from this selection
- those belong to Workstream C

### 4. `stop`

Meaning:
- the operator explicitly stops package-local campaign progression

Required behavior:
- legal from any non-terminal active posture
- writes `control.kind = "stop"`
- prevents further package-local run progression until a later explicit action changes the control state
- persists across fresh-session resume

Important boundary:
- `stop` is a package-local control decision, not automatic AK task completion
- Workstream B must not silently rewrite it into society-level truth

---

## Runtime gating rules

Once the control overlay exists, bounded runtime entrypoints must respect it.

### Required gating behavior

| Control kind | `autoresearch_runtime_run` | Setup/reconfigure path | Finalization path |
|---|---|---|---|
| `none` | allowed when runtime posture itself allows it | allowed when requested | allowed when requested |
| `awaiting_operator` | blocked | allowed only if independently lawful | allowed only if independently lawful |
| `continue` | allowed and consumes the intent | no special effect | no special effect |
| `rebaseline` | blocked | this is the expected consuming path | not the expected path |
| `finalize` | blocked | not the expected path | this is the expected consuming path in Workstream C |
| `stop` | blocked | blocked unless an explicit later change supersedes stop | blocked unless an explicit later change supersedes stop |

### Why this gating matters

Without it, Workstream B would merely record operator intent cosmetically while the runtime kept behaving as if the control surface did not exist.

---

## Projection and local-artifact rule

Workstream B may add the snapshot because it is useful for:

- fresh-session resume after compaction/restart
- truthful operator inspection
- explicit control-intent persistence across sessions
- later upper-layer supervision that wants one bounded current-state artifact

But Workstream B must **not** use the snapshot to:

- replace ledger replay as the preferred runtime derivation path
- replace AK as durable campaign truth
- replace Prompt Vault as decision-procedure truth
- smuggle generic execution/session lifecycle ownership away from ASC
- store raw model transcripts or copied prompt bodies as the real control plane

The snapshot is for **bounded resumable projection**, not for creating a second system of record.

---

## Verification contract for tasks 1534–1536

Workstream B is only truthful when it proves all four layers below.

## 1. Snapshot write/load proof

Tests should prove:

- the runtime can write `autoresearch.runtime.json`
- fresh-session load reconstructs the same current control posture when the snapshot still matches current history
- missing snapshot falls back cleanly to derived runtime truth
- stale snapshot control overlays are rejected or cleared

## 2. Action-legality proof

Tests should prove:

- illegal actions fail closed for the current posture
- `continue` is rejected from `rebaseline_needed`
- `finalize` is rejected when the runtime is not finalize-worthy
- `stop` persists as a blocking control intent until explicitly changed

## 3. Runtime-gating proof

Tests should prove:

- `continue` enables the next lawful bounded run and is then consumed
- `rebaseline` blocks ordinary run execution until the reconfigure/setup path consumes it
- `finalize` blocks ordinary run execution while preserving finalization intent for later work
- `stop` blocks run execution across fresh-session reload

## 4. Bounded fresh-session proof

The final proof/status task should show at least one bounded end-to-end path where:

1. the runtime reaches a control-relevant state
2. the package records a snapshot with explicit operator intent
3. a fresh-session load resumes from current history plus the valid saved control overlay
4. the resumed runtime surfaces that control state truthfully
5. bounded verification commands are recorded in the status note

---

## Non-goals for this workstream

Workstream B must not silently grow into any of the following:

- a background always-on supervisor loop
- generic subagent/session runtime features already owned by ASC
- AK task completion/failure automation
- finalization materialization and branch choreography
- a new governed Prompt Vault router
- a local second durable control plane parallel to ledger/AK/Prompt Vault

---

## Implementation sequence for the child tasks

### Task `#1534` — resumable runtime snapshot + loader

Implement:

- `autoresearch.runtime.json` snapshot write/read helpers
- deterministic `segmentKey` / `runtimeKey` generation
- control-state derivation rules from current runtime posture
- loader rules that merge current derived runtime truth with valid saved control overlays only
- snapshot/loader negative-path tests

### Task `#1535` — operator control surface

Implement:

- one explicit control mutation surface for `continue` / `rebaseline` / `finalize` / `stop`
- allowed-action computation from the current runtime posture
- runtime gating that respects selected control intent
- truthful status/help reporting for selected control state and resume reuse/discard

### Task `#1536` — proof + status update

Prove and record:

- fresh-session resume from a valid saved control overlay
- stale-snapshot fail-closed behavior
- action legality and runtime gating behavior
- what changed in operator/runtime behavior
- what still remains outside Workstream B
- update:
  - `packages/pi-autoresearch/docs/project/resume-control-surface-status.md`
  - `packages/pi-autoresearch/docs/project/product-posture.md`

---

## Bottom line

The next truthful resume/control slice for `pi-autoresearch` is **not** a full autonomous loop and **not** a new generic lifecycle runtime.

It is a bounded package-owned overlay where:

- ledger + receipts still reconstruct runtime truth
- one checked snapshot persists the current resumable control posture
- the operator can choose exact local actions for continue / rebaseline / finalize / stop
- the runtime respects those choices across fresh sessions
- Workstream C can later consume `finalize` intent without Workstream B pretending finalization is already materialized

That is the smallest truthful contract that makes resume and operator control real without breaking the owner split established by the earlier architecture notes.
