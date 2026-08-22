## 23. Operator experience: doctor, status, explain, destroy

All commands have versioned JSON and safe human renderings.

### 23.1 Commands

```text
/tool-boundary doctor [--json]
/tool-boundary status [--json]
/tool-boundary explain policy|plan|operation|denial <id> [--json]
/tool-boundary acquire
/tool-boundary close <lease>
/tool-boundary destroy <lease> [--retain-changeset]
/tool-boundary export <lease>
/tool-boundary leases [--json]
/tool-boundary calls [--json]
/tool-boundary quarantine list|inspect|discard
/tool-boundary attestation [--json]
/tool-boundary coverage [--json]
/tool-boundary generations [--json]
/tool-boundary benchmark
```

### 23.2 `doctor`

Doctor verifies kernel/KVM/cgroup/systemd, backend candidates, SQLite filesystem and pragma behavior, image/provenance/SBOM, Landlock ABI, control-socket permissions, Pi compatibility, tool ownership, free-space/reservation budget, and current model-provider locality. It distinguishes prerequisite failure, optional hardening absence, and backend conformance failure.

### 23.3 `status`

Status reports specification/protocol/TCB generation, policy and plan digests, selected backend, effective Landlock/systemd controls, lease/call/queue/resource states, D0 audit drops, database/WAL/checkpoint state, guest network, model egress, host connectors, retention, quarantine, tool coverage, and whether the generation is production or debug.

### 23.4 `explain`

`explain` returns the compilation path and denial proof:

```text
source field/location
-> normalized value
-> operator grant comparison
-> effective policy field
-> semantic plan requirement
-> backend capability/rendered control
-> attestation/canary evidence
-> operation authorization or denial reason
```

This is essential for a solo builder: failure should identify the invariant and repair action rather than invite host bypass.

### 23.5 `destroy`

Destroy is idempotent and explicit about known/unknown effects. It stops admission, cancels/cleans cells, stops backend unit, reconciles journal/resources, and either discards, exports, retains, or quarantines workspace state. Numeric PID alone is never used as destruction authority.

### 23.6 Debug identity

Debug generations are visually and cryptographically distinct in status, prompt, attestation, artifact names, and policy. They cannot satisfy production release gates or be silently selected by a production profile.
