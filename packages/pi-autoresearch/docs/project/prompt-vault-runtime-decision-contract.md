---
summary: "Contract for the first live Prompt Vault decision layer inside pi-autoresearch: exact template set, supported prompt-plane seam, typed decision packets, machine mapping, and the truthful Workstream A target state."
read_when:
  - "Before implementing or reviewing tasks 1529, 1530, or 1531 in the Prompt Vault decision-integration workstream."
  - "When deciding how pi-autoresearch should invoke governed Prompt Vault templates without turning Prompt Vault into the runtime state machine."
  - "When you need the bounded target done-state for live setup / next-hypothesis / finalize decisions."
type: "reference"
system4d:
  container: "Package-local contract note for Workstream A of the pi-autoresearch target control-plane rollout."
  compass: "Make live Prompt Vault decisions real inside the package runtime while preserving Prompt Vault as decision owner, pi-vault-client as prompt-plane owner, and the package as runtime owner."
  engine: "State current truth -> freeze owner split -> define the exact decision seam -> map template outputs into machine/runtime behavior -> bound verification and non-goals."
  fog: "The main risks are copying prompt bodies into the package, treating Prompt Vault as the runtime state machine, or widening this slice into AK binding, autonomous resume, or finalization materialization."
---

# Contract — live Prompt Vault decisions for `pi-autoresearch`

## Why this note exists

`pi-autoresearch` already has the two lower layers needed for a truthful next step:

1. a package-local runtime machine + event ledger
2. three live governed one-shot Prompt Vault templates

Those facts are already captured in:

- [product-posture](./product-posture.md)
- [runtime machine and event-ledger status](../../../../docs/project/2026-04-16-pi-autoresearch-runtime-machine-and-ledger-status.md)
- [Prompt Vault template set](../../../../docs/project/pi-autoresearch-prompt-vault-template-set.md)
- [Prompt Vault rollout](../../../../docs/project/pi-autoresearch-prompt-vault-rollout.md)
- [architecture correction](../../../../docs/project/pi-autoresearch-architecture-correction.md)

What is still missing is the exact contract for the next bounded slice:

> how the package runtime should invoke those live Prompt Vault procedures, parse them, and consume them without recreating a second control plane.

This note freezes that contract for Workstream A.

---

## Current truthful starting point

Today the package truth is:

- the package owns the executable campaign machine and append-only local event ledger
- Prompt Vault already owns three durable one-shot procedures:
  - `pi-autoresearch-setup`
  - `pi-autoresearch-next-hypothesis`
  - `pi-autoresearch-finalize`
- the optional router draft `pi-autoresearch-state-router` is still intentionally **not** inserted
- the bounded runtime still uses a local thin iterate bridge after a run completes
- the runtime does **not** yet invoke Prompt Vault templates live

So the missing Workstream A slice is **not** template drafting and **not** runtime-state ownership.
It is the live decision seam between the package runtime and the already-landed Prompt Vault procedures.

---

## Contract in one sentence

`pi-autoresearch` should consume the exact visible Prompt Vault templates through the supported `pi-vault-client/prompt-plane` seam, execute them through one bounded package-local decision runner, parse their required output sections into typed decision results, and map those results into package-owned machine/runtime behavior without requiring the blocked router or moving runtime ownership out of the package.

---

## Governing owner split

| Concern | Owner in Workstream A | Why |
|---|---|---|
| Executable campaign state, machine transitions, decision-packet shaping, and runtime-side fallback behavior | `packages/pi-autoresearch` | This is domain runtime behavior |
| Prompt visibility, exact template preparation, company-context enforcement, and render semantics | `pi-vault-client/prompt-plane` | This is the package-owned prompt-plane seam already accepted upstream |
| Durable prompt text and governed template metadata | Prompt Vault | These procedures already landed there and remain canonical |
| Durable campaign/task truth | AK | Still out of scope for Workstream A implementation |
| Local receipts and event ledger | `packages/pi-autoresearch` local artifacts | Projection/runtime surfaces only, not durable cross-session campaign authority |

Interpretation rule:

> Prompt Vault owns **what the decision procedure says**.
> `pi-vault-client` owns **how a visible governed template is prepared lawfully**.
> `pi-autoresearch` owns **when the runtime invokes a decision and how its result affects the machine**.

---

## What counts as a **live** Prompt Vault decision here

A decision step counts as **live** only when all of the following are true:

1. the runtime targets an **exact known template name**
2. the template is prepared through `pi-vault-client/prompt-plane`, not copied from local package prose or private imports
3. the prepared prompt is actually executed through one bounded package-owned decision-runner seam
4. the output is parsed against the required section contract for that template
5. the parsed result is returned as either:
   - a typed decision result, or
   - an explicit blocked/error result

What does **not** count as live:

- merely retrieving the template body
- manually copy/pasting template text into local code
- using fuzzy picker behavior when the runtime already knows the exact template it needs
- treating arbitrary prose output as if it were a valid decision packet

---

## Workstream A target done-state

Workstream A is done when the following are all true:

1. `pi-autoresearch` can invoke these exact templates live:
   - `pi-autoresearch-setup`
   - `pi-autoresearch-next-hypothesis`
   - `pi-autoresearch-finalize`
2. template preparation goes through the supported public seam:

   ```ts
   import { createVaultPromptPlaneRuntime } from "pi-vault-client/prompt-plane";
   ```
3. the runtime uses **exact template names**, not fuzzy matching, for all three procedures
4. each template has a typed packet builder and a typed parser for its required output sections
5. `pi-autoresearch-next-hypothesis` results are mapped into package-owned machine decisions without needing a Prompt Vault router
6. the runtime fails closed when preparation, execution, or parsing is not lawful
7. no local prompt-body copy becomes the real control plane
8. tests prove preparation, parsing, negative paths, and machine mapping
9. a status note records what actually landed and what still remains outside Workstream A

### Explicitly included in this done-state

- live governed decision invocation
- typed parsing of setup / next-hypothesis / finalize outputs
- package-local mapping from next-hypothesis status to machine decision
- bounded runtime/status-surface integration
- bounded fallbacks and proofs

### Explicitly **not** included in this done-state

- AK campaign binding
- autonomous resume / control lifecycle
- finalization branch materialization
- governed router insertion
- Prompt Vault becoming the runtime state machine
- package-local copies of the template bodies as operational truth

---

## Required prompt-plane seam

The first live decision slice must consume Prompt Vault through the supported public seam from `pi-vault-client`, not raw package internals and not ad hoc vault queries:

```ts
import { createVaultPromptPlaneRuntime } from "pi-vault-client/prompt-plane";
```

### Required use rules

1. use `prepareSelection(...)`, not private `src/*` imports
2. pass the package/runtime `cwd` so company resolution stays truthful
3. target exact template names as the `query` for these three decisions
4. append runtime packet text through the preparation context rather than editing the source template text
5. fail closed if company context, visibility, or exact-template lookup is not lawful

### Forbidden use rules

Do **not** in Workstream A:

- read Prompt Vault tables directly from `pi-autoresearch`
- vendor/copy the three template bodies into the package as the operational path
- use fuzzy search for a known decision template
- silently degrade from an exact template to a picker fallback
- let caller-supplied company context widen beyond the resolved package cwd/company truth

---

## First bounded decision-runner seam

Workstream A needs one package-local seam above prompt preparation and below runtime/machine consumption.
It does **not** need a second general orchestration plane.

A truthful first shape is:

```ts
interface AutoresearchDecisionExecutionContext {
  cwd: string;
  model?: string;
  signal?: AbortSignal;
}

interface AutoresearchDecisionRuntime {
  runSetup(packet: SetupDecisionPacket, ctx: AutoresearchDecisionExecutionContext): Promise<SetupDecisionResult>;
  runNextHypothesis(
    packet: NextHypothesisDecisionPacket,
    ctx: AutoresearchDecisionExecutionContext,
  ): Promise<NextHypothesisDecisionResult>;
  runFinalize(
    packet: FinalizeDecisionPacket,
    ctx: AutoresearchDecisionExecutionContext,
  ): Promise<FinalizeDecisionResult>;
}
```

### Why this seam is enough

This keeps Workstream A bounded:

- prompt preparation remains owned by `pi-vault-client`
- runtime/machine mapping remains owned by `pi-autoresearch`
- the actual assistant execution path can stay package-local and injectable
- later workstreams can reuse the same typed decision results without reopening ownership

### What this seam must not become

It must **not** become:

- a second Prompt Vault client implementation
- a general autonomous loop engine
- an AK lifecycle runtime
- a finalization branch executor
- a cross-package LLM orchestration substrate

---

## Exact decision inventory for Workstream A

| Decision kind | Exact template | When invoked | Output owner | Runtime effect in Workstream A |
|---|---|---|---|---|
| `setup` | `pi-autoresearch-setup` | when the runtime needs the first lawful campaign packet or a reconfiguration packet | Prompt Vault template + package parser | produce a typed setup packet/result; no automatic repo-wide materialization required in this slice |
| `next_hypothesis` | `pi-autoresearch-next-hypothesis` | when the runtime has recorded a run and needs the next bounded move | Prompt Vault template + package parser | produce the next bounded move and map the returned status into a package machine decision |
| `finalize` | `pi-autoresearch-finalize` | when the runtime is already at a finalize-worthy point and needs grouping guidance | Prompt Vault template + package parser | produce a typed grouping/finalization proposal only; no branch materialization in this slice |

The blocked router is **not** required for Workstream A.
The package already has a runtime machine and can map `next_hypothesis` output statuses locally.

---

## Decision packet contract

Workstream A should keep packets explicit and package-owned.
Prompt Vault receives packet text/context; it does **not** own packet assembly rules.

## 1. Setup packet

The setup packet should carry only the bounded facts the `pi-autoresearch-setup` template requires.
At minimum:

- optimization objective
- repo/runtime context
- explicit scope / off-limits
- current benchmark/check surfaces
- existing `autoresearch.*` artifacts when present
- any known constraints or blockers
- optional AK task id/scope reference **only as input context**, not as a required live dependency

### Setup result contract

The parser should normalize the required sections already defined in the template into a structure equivalent to:

```ts
interface SetupDecisionResult {
  kind: "setup";
  templateName: "pi-autoresearch-setup";
  status: "ready" | "blocked";
  goal: string;
  primaryMetric: {
    name: string;
    unit: string;
    direction: "lower" | "higher";
  };
  secondaryMetrics: string[];
  benchmarkCommand: string;
  filesInScope: string[];
  offLimits: string[];
  hardConstraints: string[];
  checksRequired: "none" | "reuse_existing_checks" | "create_autoresearch_checks_sh";
  autoresearchMdPlan: string[];
  autoresearchShContract: string[];
  baselinePlan: string[];
  firstExperimentRules: string[];
  missingInformation: string[];
}
```

### Setup integration rule

In Workstream A, setup output is a **typed decision packet**, not a license for broad repo mutation.
If later surfaces materialize files from it, that belongs to a narrower follow-on slice.

## 2. Next-hypothesis packet

This is the primary live decision in Workstream A.
Its packet should include, at minimum:

- campaign goal and constraints
- current segment summary
- baseline / best / recent run history
- checks status
- confidence / noise signal when available
- ASI notes or dead-end memory when available
- explicit in-scope / off-limits paths
- ideas backlog when present

### Next-hypothesis result contract

```ts
interface NextHypothesisDecisionResult {
  kind: "next_hypothesis";
  templateName: "pi-autoresearch-next-hypothesis";
  status: "ready" | "rebaseline_needed" | "finalize_candidate" | "blocked";
  stateRead: string;
  nextHypothesis: string;
  whyNow: string;
  targetFiles: string[];
  changeShape: string[];
  expectedPrimaryEffect: string;
  riskToGuard: string[];
  runPlan: string[];
  asiToCaptureIfKept: string[];
  asiToCaptureIfDiscarded: string[];
  stopCondition: string[];
}
```

### Required machine mapping

The package runtime, not Prompt Vault, maps the parsed status into the machine/event model:

| Parsed `STATUS` | Package-owned machine decision/event effect |
|---|---|
| `ready` | map to `DECIDE_NEXT_ACTION("iterate")` and retain the next-hypothesis packet as the bounded next move |
| `rebaseline_needed` | map to `DECIDE_NEXT_ACTION("rebaseline")` |
| `finalize_candidate` | map to `DECIDE_NEXT_ACTION("finalize")` |
| `blocked` | map to `DECIDE_NEXT_ACTION("block")` with the shortest truthful blocking reason |

This is the key reason the blocked router is **not** a Workstream A blocker.
The router would have duplicated a package-owned runtime mapping the machine can already do locally.

## 3. Finalize packet

The finalize packet should include, at minimum:

- kept runs and summary context
- campaign context from local artifacts
- merge-base / trunk target when known
- per-kept-run commit identity and diff stats when available
- any known dependencies or overlaps

### Finalize result contract

```ts
interface FinalizeDecisionResult {
  kind: "finalize";
  templateName: "pi-autoresearch-finalize";
  status: "ready" | "blocked";
  baseRef: string;
  trunkRef: string;
  overallResult: string;
  proposedGroups: Array<{
    title: string;
    commits: string[];
    files: string[];
    metricEffect: string;
    dependencyNotes: string[];
  }>;
  groupingRationale: string[];
  approvalRequired: true;
  groupsJsonDraft: unknown;
  riskNotes: string[];
  cleanupHints: string[];
}
```

### Finalize integration rule

In Workstream A, finalize output remains a **proposal packet**.
It does not create branches, materialize `groups.json`, or mark the campaign complete automatically.
That orchestration belongs to Workstream C.

---

## Output parsing rules

The package parser must treat the Prompt Vault template contracts as **structured output contracts**, not as vague writing guidance.

### Required parser behavior

1. require the named section labels expected by each template
2. allow normal whitespace variation, but not missing required sections
3. reject duplicate required section labels
4. parse typed fields where the template explicitly promises a typed shape:
   - setup `PRIMARY_METRIC`
   - finalize `GROUPS_JSON_DRAFT`
   - yes/no style commitments such as `APPROVAL_REQUIRED`
5. keep unknown/freeform text as bounded strings or string arrays, not raw unbounded transcript truth
6. return `blocked` or parser-error failure when the output does not satisfy the contract

### Forbidden parser behavior

Do **not**:

- scrape arbitrary prose outside the contract as if it were authoritative structured output
- accept malformed `GROUPS_JSON_DRAFT` as “good enough”
- silently invent missing status values
- map a parse failure to `ready`

---

## Bounded fallback rules

“Fallback” in Workstream A means bounded runtime safety, **not** a second prompt-plane or local prompt copy.

### Allowed fallbacks

1. **Local machine mapping instead of router use**
   - `next_hypothesis` status maps locally into `iterate` / `rebaseline` / `finalize` / `block`
2. **Blocked result instead of invented decision**
   - if prompt preparation fails, execution fails, or parsing fails, the runtime returns a blocked/error outcome rather than fabricating a next move
3. **Existing bounded runtime state remains readable even when decisions are unavailable**
   - status/help surfaces may still report the current machine/ledger/receipt state without claiming a new decision exists

### Forbidden fallbacks

Do **not**:

- fallback from exact template selection to copied package-local prompt text
- fallback from missing Prompt Vault availability to local heuristic next-hypothesis generation presented as governed truth
- use the absent router as a reason to keep the current unconditional `iterate` bridge forever
- silently continue the runtime when the decision step failed to produce a lawful result

---

## Runtime integration rules

Workstream A should change runtime behavior only where a live Prompt Vault decision is actually relevant.

### Required integration points

1. **setup path**
   - a runtime surface can request a live setup packet when no lawful config exists yet or when a reconfiguration packet is needed
2. **post-run decision path**
   - after a run is recorded, the runtime can invoke `next_hypothesis` instead of relying only on the current thin iterate bridge
3. **finalize-decision path**
   - when the runtime reaches a finalize-worthy posture, it can request a live finalization proposal packet
4. **status/help truth**
   - user-visible runtime surfaces should say whether live Prompt Vault decisions are:
     - not yet available
     - available but blocked
     - available and last used successfully

### Explicit runtime-limit rule

Workstream A should not widen the runtime into broad autonomous execution.
A live decision packet is still only one bounded control-plane input to the package runtime.

---

## Projection and local-artifact rule

Workstream A may need local projection of decision outcomes for status, replay, or tests.
If it does, keep the projection bounded.

### Allowed projection posture

- small decision-summary fields in package-local status/runtime output
- bounded machine/event recording if needed for replay truth
- package-local test fixtures for parsing/negative-path proof

### Forbidden projection posture

Do **not**:

- store Prompt Vault prompt bodies as the real local authority
- dump whole assistant transcripts into AK evidence or package runtime state as if that were the canonical decision contract
- widen `autoresearch.jsonl` into a second durable control plane without an explicit follow-on contract

If later implementation needs a local summary artifact or new ledger facts, keep them explicitly projection-only.

---

## Verification contract for tasks 1529–1531

Workstream A is only truthful when it proves all four layers below.

## 1. Prompt-plane preparation proof

Tests should prove:

- exact template preparation uses `pi-vault-client/prompt-plane`
- missing/invalid company context fails closed
- missing exact template fails closed
- no fuzzy fallback is used for the three known decision templates

## 2. Parser proof

Tests should prove:

- valid setup / next-hypothesis / finalize outputs parse into the expected typed results
- missing required labels fail closed
- malformed structured fields fail closed
- parser failures do not become `ready`

## 3. Runtime/machine mapping proof

Tests should prove:

- `next_hypothesis.status=ready` maps to package iterate behavior
- `rebaseline_needed` maps to `rebaseline`
- `finalize_candidate` maps to `finalize`
- `blocked` maps to blocked runtime behavior
- the current unconditional iterate bridge is no longer the only post-run outcome when live decisions are available

## 4. Live bounded proof

The final status/proof task should show at least one bounded end-to-end path where:

1. the package prepares a real Prompt Vault template through the public seam
2. the runtime executes the decision
3. the output parses into the typed contract
4. the package surfaces the resulting bounded next state truthfully

---

## Non-goals for this workstream

Workstream A must not silently grow into any of the following:

- AK anchor/task lifecycle automation
- autonomous resume/state restoration across sessions
- generalized operator control-plane UI
- branch creation/materialization/finalization workflow
- router-vocabulary expansion in Prompt Vault
- V4-style prompt lineage/graph storage
- a second prompt-plane runtime inside `pi-autoresearch`

---

## Implementation sequence for the child tasks

### Task `#1529` — decision runtime adapter

Implement:

- exact-template preparation through `pi-vault-client/prompt-plane`
- one bounded package-local decision runner interface
- typed packet builders
- typed output parsers
- negative-path tests

### Task `#1530` — runtime integration

Integrate:

- setup packet invocation
- post-run next-hypothesis invocation and machine mapping
- finalize-proposal invocation
- truthful status/help reporting for live decision availability/outcomes

### Task `#1531` — proof + status update

Prove and record:

- bounded end-to-end live decision flow
- verification commands/tests used
- what changed in runtime behavior
- what is still out of scope
- update:
  - `packages/pi-autoresearch/docs/project/prompt-vault-runtime-decision-status.md`
  - `packages/pi-autoresearch/docs/project/product-posture.md`

---

## Bottom line

The next truthful Prompt Vault slice for `pi-autoresearch` is **not** a router-first design and **not** a new control plane.

It is a bounded package-owned decision seam where:

- Prompt Vault remains the owner of the three durable decision procedures
- `pi-vault-client/prompt-plane` remains the owner of lawful prompt preparation
- `pi-autoresearch` remains the owner of runtime packet assembly, machine mapping, and bounded fallback behavior
- the runtime can finally invoke governed setup / next-hypothesis / finalize decisions live without pretending that Prompt Vault itself owns the state machine
