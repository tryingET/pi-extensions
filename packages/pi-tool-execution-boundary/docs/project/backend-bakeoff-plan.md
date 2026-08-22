---
summary: "Phase 0 conformance bake-off selecting one Release 0.1 micro-VM backend."
---

# Phase 0 backend conformance bake-off

## Objective

Render the same `SemanticEnforcementPlanIR::MicrovmOffline` through:

1. Gondolin;
2. a minimal direct QEMU/QEMU-microvm path;
3. Firecracker as a reference control where compatible.

The goal is to select **one** production backend. Candidate adapters remain disposable spikes until the selection ADR is accepted.

## Fixed test fixture

Each candidate receives the same:

- pinned guest kernel/initramfs/root artifacts;
- `boundary-init` and `boundary-agent` digests;
- source snapshot fixture;
- workspace virtual size;
- vCPU/memory/PID/I/O plan;
- boot-secret and attestation protocol;
- canary plan;
- structured-read workload;
- process-cell workload;
- cleanup/fault campaign.

A candidate may not replace a required control with a weaker backend-specific approximation without failing conformance.

## Mandatory evidence

### Security and identity

- exact backend/VMM versions and digests;
- complete device, mount, descriptor, socket, and process inventory;
- verified root and separate workspace-block layout;
- boot challenge/transcript support;
- stale/wrong/mixed guest rejection;
- no NIC, host filesystem, GPU, USB, audio, clipboard, TUN/TAP, Docker socket, or undeclared device;
- control channel unreachable from workload cells;
- root tamper prevents READY.

### Process and resources

- atomic initial cgroup placement;
- pidfd lifecycle;
- fresh cell namespaces and private temporary state;
- effective CPU/memory/PID/I/O controls and readback;
- cgroup kill and recursive empty proof;
- orphan/reboot recovery;
- quota and minimum-free-space behavior.

### Compatibility

- Node, Python, Rust, C/C++, Git;
- TypeScript build/test;
- package-manager offline-cache behavior;
- fixed grep/find semantics;
- PTY/user-shell behavior or explicit unsupported result;
- long-running tests and cancellation.

### Performance

- cold boot p50/p95/p99;
- warm lease acquisition;
- guest READY latency;
- structured RPC p50/p95/p99 and throughput;
- read-only and read-write process-cell startup;
- block read/write/fsync;
- VMM RSS/CPU;
- host I/O/CPU PSI under load;
- local-inference TTFT/inter-token regression while active;
- 30-minute mixed workload and 24-hour soak.

### Maintainability

- production code and dependency surface;
- upstream security/advisory posture;
- update cadence and rollback;
- image/build complexity;
- operator prerequisites;
- expected solo-maintainer burden.

## Decision rule

1. Reject every candidate missing a MUST capability or release SLO.
2. Among conforming candidates, choose the smallest maintainable implementation meeting owner-workstation p99 and voice-coexistence targets.
3. Publish raw evidence, not only weighted scores.
4. Record the winner and rejected alternatives in an ADR.
5. If none conforms, Release 0.1 remains blocked; no MUST is weakened to accommodate a candidate.

