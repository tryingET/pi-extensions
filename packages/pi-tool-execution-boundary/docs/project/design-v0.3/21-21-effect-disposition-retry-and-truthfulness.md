## 21. Effect disposition, retry, and truthfulness

### 21.1 Multidimensional disposition

Every terminal result contains:

```ts
interface EffectDispositionV1 {
  processExit: "not-started" | "known" | "unknown";
  workspaceMutation: "none" | "known" | "unknown";
  networkDispatch: "none" | "not-sent" | "sent" | "unknown";
  externalOutcome: "none" | "known" | "unknown";
  outputCompleteness: "complete" | "partial" | "unknown";
  descendants: "empty" | "unknown";
  journal: "durable" | "failed" | "unknown";
  retrySafety: "safe" | "unsafe" | "operator-decision";
  workspaceGenerationBefore?: string;
  workspaceGenerationAfter?: string;
  reasons: readonly string[];
}
```

For `microvm-offline`, network dispatch is always `none` if attestation remains valid. External outcome is normally `none`; model-provider and host-connector effects are separate Pi-level surfaces.

### 21.2 Success criteria

A mutating tool returns success only when:

- process/structured operation outcome is known;
- descendants are empty where a process cell existed;
- workspace mutation disposition is known;
- generation-after is durably committed;
- terminal journal is durable;
- output completeness is stated;
- lease remains attested and healthy.

### 21.3 Retry rules

- Rejected or queued-cancelled calls may be retried with a new call ID.
- Read-only structured calls may be retried only when the first call was never accepted or is durably known to have no effect.
- `write`, `edit`, `bash`, and user-shell calls are never automatically retried after acceptance.
- A duplicate call ID queries existing state; it does not rerun.
- Outcome unknown requires operator decision or checkout discard.

### 21.4 Conservative generation behavior

Any arbitrary process that reached `STARTED` and later became uncertain makes workspace mutation unknown, even if the operator believes the command was read-only. The lease is quarantined. This may create false positives; it prevents invisible lost updates and unsafe continuation.

### 21.5 Error taxonomy

Stable machine-readable codes include:

```text
BOUNDARY_UNAVAILABLE
BACKEND_NOT_ATTESTED
SOURCE_DIRTY
SOURCE_UNSUPPORTED
SOURCE_CHANGED_DURING_SNAPSHOT
POLICY_BROADER_THAN_GRANT
RESOURCE_ADMISSION_DENIED
LEASE_NOT_READY
WORKSPACE_STALE
CALL_DUPLICATE_MISMATCH
CALL_DEADLINE_EXPIRED
CALL_OUTPUT_TRUNCATED
CALL_CANCELLED_PRE_EFFECT
CALL_CANCELLED_KNOWN
CELL_CLEANUP_UNPROVEN
WORKSPACE_OUTCOME_UNKNOWN
JOURNAL_DURABILITY_FAILURE
CHANGESET_UNSUPPORTED_ENTRY
HOST_PATH_OUTSIDE_SOURCE
TOOL_COVERAGE_CONFLICT
```

Error text is actionable but not used as protocol logic.

---
