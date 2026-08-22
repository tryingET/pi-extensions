## 19. Backend conformance bake-off, rendered plans, and attestation

### 19.1 One semantic plan, multiple Phase 0 renderers

Phase 0 compares:

1. Gondolin adapter candidate;
2. minimal direct QEMU/QEMU-`microvm` renderer;
3. Firecracker reference when host architecture and required device/control semantics permit.

The comparison exists to select one production backend, not to create permanent backend proliferation.

### 19.2 Bake-off dimensions

Each renderer must implement the same `SemanticEnforcementPlanIR` and report:

- exact device and descriptor inventory;
- rootfs/workspace block layout;
- host cgroup/systemd plan;
- control-channel semantics;
- boot challenge support;
- no NIC/host filesystem/GPU/socket exposure;
- cold/warm startup and memory footprint;
- structured RPC and process-cell latency;
- cancellation/cleanup proof;
- implementation size and dependency surface;
- update/security-advisory burden.

A renderer missing any MUST is nonconforming. It cannot weaken the semantic plan.

### 19.3 Rendered plan

`RenderedBackendPlanIR` includes exact argv/API calls, image and binary digests, systemd properties, device plan, descriptor plan, cgroup hierarchy, storage paths, guest boot arguments, control channels, and required canary IDs. It is deterministic for the same semantic plan, host facts, TCB generation, and backend version.

### 19.4 Canary plan and evidence

The semantic compiler derives `CanaryPlanIR`. Each canary binds implementation digest, resource cap, timeout, expected result, and rendered plan digest. Canaries run in sacrificial bounded cells/leases. Attestation is incomplete until every required canary has matching evidence.

### 19.5 Attestation contents

`AttestationIR` binds:

```text
effective policy digest
subset proof digest
semantic plan digest
rendered plan digest
TCB generation digest
host confinement digest
boot transcript digest
canary plan/evidence digests
observed backend/device/descriptor facts
timestamp and lease identity
```

Any post-canary plan or TCB change invalidates READY.
