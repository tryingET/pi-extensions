## 3. Cross-domain decision register

This section records the integrated decisions that govern implementation.

### 3.1 Programming-languages and compiler architecture

Security meaning is compiled, not rediscovered. Strict JSON is the human-authored DSL. Rust domain types are the semantic IR. Protocol Buffers are wire DTOs only. Deterministic CBOR is the canonical hashed representation.

**Decision:** create separate crates/modules for policy parsing, normalized/effective IR, subset proof, operation IR, semantic plans, backend-rendered plans, attestation, canonical encoding, and golden vectors. The IR crate imports no Pi, QEMU, Gondolin, Firecracker, systemd, SQLite, or filesystem implementation.

### 3.2 Database and durable-workflow engineering

A synchronous durable transaction on every read contradicts the million-call and voice-latency goals. Durability therefore follows the effect boundary:

```text
D0: enforced read-only, replay-safe, non-authoritative result
D1: workspace mutation or arbitrary process with possible workspace effect
D2: future external dispatch where bytes may leave the boundary
```

**Decision:** D0 uses in-memory/volatile admission plus buffered bounded audit. D1 uses SQLite durable admission before effect and durable terminal disposition before success. D2 remains schema-reserved but disabled.

### 3.3 Linux kernel containment

The privileged parser surface inside the guest must be tiny. The root launcher should not parse policy, Protobuf tool arguments, shell text, paths, environment maps, or arbitrary mounts.

**Decision:** split `boundary-init` from `boundary-agent`. The launcher accepts only a fixed compiled `CellLaunchIR`, creates the process atomically in its cgroup/namespaces, drops privilege, and returns pidfd/cgroup identity. The unprivileged broker handles higher-level protocol and workspace operations.

### 3.4 Host containment and Landlock

The daemon is trusted, but a memory-safety or parsing defect should not automatically expose the entire home directory. Landlock is a stackable unprivileged restriction layer and is useful defense in depth.

**Decision:** the daemon opens exact state, runtime, image, KVM, systemd, and source descriptors, then applies systemd restrictions and the strongest supported Landlock ruleset. Effective ABI and rules appear in attestation. Missing Landlock does not silently claim equivalent confinement; policy may either reject the host or record the reduced defense-in-depth posture according to the operator grant.

### 3.5 Virtualization security

A backend brand is not evidence. Gondolin has strong agent-oriented integration; direct QEMU minimizes adapter layers; Firecracker is a useful minimalist reference where the host and workload fit its model.

**Decision:** Phase 0 renders one semantic plan through at least Gondolin and minimal direct QEMU, and through Firecracker when host compatibility permits. Only one backend is selected for production 0.1. Supporting multiple production backends is explicitly not a goal.

### 3.6 Cryptographic protocol identity

The host must distinguish the intended fresh guest and exact TCB generation from a stale, replayed, or miswired agent.

**Decision:** every boot gets a 256-bit host-generated secret and nonce through a channel unavailable to workload cells. HMAC-SHA-256 binds lease ID, boot nonce, semantic plan digest, rendered plan digest, protocol version, kernel, initramfs, rootfs, `boundary-init`, and `boundary-agent`. This is endpoint freshness and configuration binding, not remote hardware attestation.

### 3.7 Supply-chain engineering

A lease cannot be stronger than its kernel, image, daemon, compiler, and agents.

**Decision:** each complete TCB generation carries artifact digests, SBOMs, provenance, build identities, vulnerability/denylist status, and compatibility metadata. Running leases never receive in-place component replacement.

### 3.8 SRE and realtime voice

Static weights cannot detect actual contention. Linux PSI measures CPU, memory, and I/O stall impact and supports load-shedding triggers.

**Decision:** global admission combines static reservations with PSI and model-server latency signals. New batch work is refused or paused when thresholds are crossed. Unknown D1 effects are never preempted as though they were replay-safe D0 reads.

### 3.9 Privacy and information flow

No guest NIC is not equivalent to “data stays local.” Tool results flow to the active model provider and host connectors may create separate egress.

**Decision:** `DataExposureIR` reports guest networking, current model-provider locality, connector grants, raw-output retention, change-set retention, and quarantine retention. Unknown locality is always displayed as unknown.

### 3.10 Formal QA

The controller protocol contains concurrency, cancellation, resource admission, output-credit, workspace-generation, and upgrade-generation interactions that deserve model checking.

**Decision:** the TLA+ model is expanded and TLC evidence is a release artifact. The model does not prove Linux/QEMU isolation; it verifies controller-level invariants that implementation and fault tests refine.
