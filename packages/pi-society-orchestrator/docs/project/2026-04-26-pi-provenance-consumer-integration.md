---
summary: "Design packet for the first pi-provenance consumer integration: orchestrator-governed review lanes should request source-owned Pi provenance without making AK or orchestrator the runtime fact owner."
read_when:
  - "You are wiring pi-provenance into pi-society-orchestrator, ASC, workflow_execute, or governed review-lane evidence."
  - "You need to decide who sets PI_PROVENANCE_REVIEW_LANE_ID and PI_PROVENANCE_OUTPUT_FILE."
  - "You are preserving source-owner boundaries for provider/model/API provenance."
type: "design"
system4d:
  container: "Cross-package consumer-integration design for Pi provenance in governed review lanes."
  compass: "Let orchestrated review lanes request provenance while keeping Pi runtime/session facts source-owned by pi-provenance."
  engine: "Inspect current seams -> name first consumer -> define marker/output contract -> defer schema and broad logging."
  fog: "Without explicit marker and ownership rules, provenance capture can become generic surveillance or downstream governance authority."
---

# pi-provenance Consumer Integration — Governed Review Lanes

## Status

Design packet for AK task `1842` in the `pi-extensions` monorepo.

Related source-owner packet in `agent-kernel`:

- `~/ai-society/softwareco/owned/agent-kernel/docs/project/2026-04-26-pi-review-lane-provenance-routing-packet.md`

Related package charter:

- `../../pi-provenance/docs/project/2026-04-26-pi-provenance-package-charter.md`

## Decision

The first durable consumer should be `pi-society-orchestrator`, but only as the **workflow/evidence placement owner**.

`pi-provenance` remains the **source-runtime extractor**.

```text
pi-society-orchestrator decides: this governed review lane needs provenance.
ASC executes: this lane as a child Pi runtime when delegated.
pi-provenance extracts: persisted assistant-message provider/model/API/session refs.
review-lane evidence stores: a copy of the minimal provenance block.
AK projects/joins later: only after source evidence exists and query pressure justifies it.
```

## Current seam findings

| Seam | Current truth | Integration consequence |
|---|---|---|
| `pi-provenance` | Provides `extractLatestAssistantMessageProvenance(ctx.sessionManager)` and an inert-by-default `agent_end` handler gated by `PI_PROVENANCE_REVIEW_LANE_ID` + `PI_PROVENANCE_OUTPUT_FILE`. | It is already shaped as background/library-first. Consumers must supply explicit review-lane markers and output path. |
| `pi-society-orchestrator` subagent adapter | `src/runtime/subagent.ts` wraps ASC's public execution runtime and passes objective/model/cwd/prompt envelope, but does not currently expose child extension sources or per-execution environment markers. | Orchestrator is the right consumer, but needs a narrow adapter addition before it can activate child-lane provenance capture. |
| ASC public runtime | `DispatchSubagentRequest` already supports `extensions?: string[]`; `resolveSubagentExtensionSelection` feeds child `--extension` sources. | Child Pi can load `pi-provenance` if orchestrator passes the extension source through. |
| ASC spawn path | `subagent-spawn.ts` spawns the helper with `env: { ...process.env }`; the helper then spawns raw `pi` with inherited env plus isolated agent-dir. There is no request-scoped env overlay today. | Do not mutate `process.env` around concurrent execution. Add a small ASC-owned per-execution env overlay if child-lane background capture is implemented. |
| `workflow_execute` | Workflow steps have agent/objective/cwd only; no lane id or evidence/provenance output path. | The first implementation should add an internal generated lane id/output path, not burden the public workflow request unless operator-authored evidence paths become necessary. |
| Evidence writer | Orchestrator can record AK evidence and write KES artifacts, but governed review-lane evidence artifacts are not yet a first-class package-local writer here. | First implementation should write a sidecar artifact and return its path in tool details; AK ingestion remains downstream. |

## First consumer contract

For each orchestrator-launched governed review lane that opts into provenance:

1. Orchestrator creates a lane id:

   ```text
   orch-review-lane:<workflow-run-id>:<step-index>:<agent>
   ```

2. Orchestrator creates an output path under a package/runtime-owned temp or artifact root:

   ```text
   <run-artifacts-dir>/provenance/<safe-lane-id>.json
   ```

3. Orchestrator asks ASC to run the child with:

   ```ts
   extensions: ["/absolute/path/to/packages/pi-provenance"]
   env: {
     PI_PROVENANCE_REVIEW_LANE_ID: laneId,
     PI_PROVENANCE_OUTPUT_FILE: outputFile,
   }
   ```

4. The child Pi session loads `pi-provenance`.
5. At child `agent_end`, `pi-provenance` writes the minimal provenance block.
6. Orchestrator reads the sidecar after ASC returns and copies the block path or contents into the review-lane result/evidence artifact.

## Required seam additions before implementation

### 1. ASC-owned request-scoped environment overlay

Add a small field to the ASC public execution contract:

```ts
interface DispatchSubagentRequest {
  env?: Record<string, string>;
}
```

Propagation path:

```text
DispatchSubagentRequest.env
-> SubagentDef.env
-> spawnSubagentWithSpawn helper process env
-> subagent-pi-json-filter raw child Pi env
```

Rules:

- string values only
- no secret capture/logging
- do not echo env values into `result.details` except for allowlisted provenance marker names if needed
- must be per-execution, not `process.env` mutation
- tests must cover concurrent distinct env overlays

### 2. Orchestrator adapter passthrough

Add optional fields to `OrchestratorSubagentExecutionParams`:

```ts
extensions?: string[];
env?: Record<string, string>;
```

Then pass them to ASC's `runtime.execute(...)` request.

### 3. Orchestrator provenance sidecar reader

After a review-lane subagent returns, orchestrator should check whether the expected sidecar exists.

- if present: parse and attach/copy minimal block
- if absent and lane succeeded: report `provenance_missing` as a warning, not execution failure for the first slice
- if absent and lane failed/aborted/timed out: preserve execution status truth and mark provenance as unavailable

## Public workflow request posture

Do not add public `workflow_execute` provenance fields yet.

First slice should be internal and opt-in from an orchestrator-owned governed review-lane mode, because generic workflows are broader than governed review-lineage evidence.

If later public request fields are needed, prefer a narrow optional block:

```ts
provenance?: {
  mode: "off" | "review_lane";
}
```

Do not accept arbitrary output paths from LLM-authored workflow requests until path safety and artifact ownership are specified.

## Evidence artifact shape

The sidecar remains the `pi-provenance` block plus capture context:

```json
{
  "provenance_schema": "pi.assistant_message.provenance.v1",
  "source_owner": "pi-runtime",
  "capture_time": "...",
  "pi_session": {
    "session_id": "...",
    "session_file": "...",
    "message_entry_id": "...",
    "message_parent_id": "...",
    "entry_timestamp": "..."
  },
  "assistant_message": {
    "provider": "...",
    "model": "...",
    "api": "...",
    "response_id": "...",
    "message_timestamp": 0,
    "stop_reason": "...",
    "usage": {}
  },
  "capture_context": {
    "kind": "review_lane",
    "review_lane_id": "..."
  }
}
```

Orchestrator may add an outer wrapper in its own artifact, but must not rewrite the source-owned fields except to copy them verbatim.

## Historical backfill rule

No historical backfill from this integration.

Old `not_surfaced` review-lineage records remain honest unless an exact Pi JSONL file and assistant-message entry id can be resolved.

## Non-goals

This integration does not:

- add AK run/governed-run schema
- widen `ak packet`
- make AK decision closure depend on provider/model provenance completeness
- add generic all-session provenance logging
- capture provider request payloads
- expose a user-facing `/provenance` command
- let LLM-authored workflow requests choose arbitrary sidecar paths
- infer historical model/provider identity from lane names, prompt names, or session aliases

## Acceptance scenarios

### Scenario 1 — Review lane captures provenance in child Pi runtime

```gherkin
Given orchestrator launches a governed review lane through ASC
And provenance capture is enabled for that lane
When the child Pi runtime reaches agent_end
Then pi-provenance writes a sidecar with session file, message entry id, provider, model, API, stop reason, timestamp, and usage
And orchestrator attaches or references that sidecar in the lane result.
```

### Scenario 2 — Generic workflow remains uncluttered

```gherkin
Given an operator runs an ordinary workflow_execute request
When no governed review-lane provenance mode is enabled
Then orchestrator does not set PI_PROVENANCE_REVIEW_LANE_ID
And pi-provenance remains inert.
```

### Scenario 3 — Missing provenance is warning, not false legal failure

```gherkin
Given a review lane completes but the provenance sidecar is absent
When orchestrator renders the lane result
Then the lane execution status remains truthful
And provenance is marked unavailable with a warning
And AK decision closure is not marked illegal solely because provenance is missing.
```

### Scenario 4 — Concurrent lanes do not leak markers

```gherkin
Given two review lanes execute concurrently
When each receives a distinct request-scoped env overlay
Then each writes to its own sidecar path
And neither lane observes the other's PI_PROVENANCE_REVIEW_LANE_ID or output path.
```

## Implementation order

1. ASC: add request-scoped env overlay with concurrency tests.
2. Orchestrator subagent adapter: pass `extensions` and `env` to ASC.
3. Orchestrator review-lane helper: generate lane id + safe sidecar path.
4. Orchestrator result shaping: include `provenancePath` and parsed provenance in lane details when present.
5. Review-lineage integration: only after surfaced source evidence exists, decide whether the existing `ak decision review-lineage` projection should read these sidecars.

## Current recommendation

Proceed with implementation only after accepting the small ASC env-overlay seam. Without request-scoped env, any child-lane implementation would be tempted to mutate `process.env`, which is unsafe for concurrent lanes and violates the source-owner boundary this package exists to preserve.
