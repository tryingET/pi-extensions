## 11. Closed Operation IR and exact Pi tool mapping

### 11.1 Requested and admitted operations

The old loose call shape is prohibited. The semantic operation is a closed union:

```rust
enum RequestedOperationV1 {
    Read(ReadFileV1),
    Write(WriteFileV1),
    Edit(EditFileV1),
    List(ListDirectoryV1),
    Grep(GrepFilesV1),
    Find(FindFilesV1),
    Exec(ExecProcessV1),
}
```

`effect_class()` and `durability_class()` are total trusted functions of the variant and compiled plan. A caller cannot claim `Exec` is read-only or request weaker durability.

```rust
struct RequestedCallV1 {
    call_id: CallId,
    client_session_id: SessionId,
    client_epoch: ClientEpoch,
    lease_id: LeaseId,
    requested_timeout_ms: u64,
    expected_workspace_generation: Option<WorkspaceGeneration>,
    operation: RequestedOperationV1,
}

struct AdmittedCallV1 {
    call_id: CallId,
    client_session_id: SessionId,
    client_epoch: ClientEpoch,
    lease_id: LeaseId,
    policy_digest: Digest,
    semantic_plan_digest: Digest,
    rendered_plan_digest: Digest,
    attestation_digest: Digest,
    workspace_generation: WorkspaceGeneration,
    effect_class: EffectClass,
    durability_class: DurabilityClass,
    effective_deadline: MonotonicDeadline,
    effective_limits: CallLimitsV1,
    operation: AdmittedOperationV1,
    request_digest: Digest,
}
```

Only `AdmittedCallV1` may execute.

### 11.2 Workspace path type

All structured paths become `WorkspacePathV1`, a normalized segment vector relative to `/workspace`. It contains no host path, tilde, URI, environment expansion, `.`/`..`, NUL, or unsupported Unicode/control form.

The Pi adapter may translate an absolute host path only when it is byte-wise beneath the exact source root captured at lease creation. All components after the adapter see only `WorkspacePathV1`.

### 11.3 Tool map

| Pi surface | Operation IR | Effect | Durability | Execution | Lock | Generation |
|---|---|---|---|---|---|---|
| `read` | `Read` | read | D0 | structured unprivileged agent RPC | shared | unchanged |
| `ls` | `List` | read | D0 | structured unprivileged agent RPC | shared | unchanged |
| `grep` | `Grep` | read | D0 | fixed trusted binary in fresh read-only cell | shared | unchanged |
| `find` | `Find` | read | D0 | fixed trusted walker/binary in fresh read-only cell | shared | unchanged |
| `write` | `Write` | workspace mutation | D1 | structured atomic mutation RPC | exclusive | +1 known success |
| `edit` | `Edit` | workspace mutation | D1 | structured exact/snapshot edit RPC | exclusive | +1 known success |
| `bash` | `Exec` | arbitrary process / possible workspace mutation | D1 | fresh read-write process cell | exclusive | +1 on known completion; unknown quarantines |
| user `!` | `Exec` | arbitrary process / possible workspace mutation | D1 | same as `bash` | exclusive | same |

### 11.4 D0 enforcement

D0 classification is valid only when the mechanism enforces read-only behavior:

- structured read RPC has no mutation primitive;
- fixed-tool cells receive `/workspace` read-only;
- environment and temporary state cannot reach the workspace through another mount;
- no controller or external side-effect capability exists;
- operation schema exposes no arbitrary flags that can execute helpers or write files.

A request cannot promote itself from D1 to D0 through a flag such as `readOnly=true`.

### 11.5 D1 behavior

D1 admission is durably committed before mutation token release or process start. No accepted D1 call is automatically retried. Duplicate call IDs query existing state and never execute twice.

### 11.6 Snapshot-edit boundary

Release 0.1 preserves pinned Pi built-in `edit`. A simultaneous standard-tool override by `pi-snapshot-edit` remains a hard conflict. Later composition should use an operations seam rather than stacking two owners of the same tool name.

### 11.7 Dynamic coverage

The extension verifies ownership at activation and call time. Any uncovered generic computer tool or user shell path fails closed. This prevents accidental bypass but does not contain malicious code already inside the trusted Pi host process.
