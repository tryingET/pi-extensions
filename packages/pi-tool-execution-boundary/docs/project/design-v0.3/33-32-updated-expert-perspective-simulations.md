## 32. Updated expert-perspective simulations

### 32.1 Programming-languages architect

**Challenge:** “Can two components interpret the same policy differently?”

Resolution: backends never receive human policy. Closed IR stages, total conversions, field-level subset proofs, and deterministic semantic digests make interpretation differences testable. Protocol DTOs are not authority.

### 32.2 Database engineer

**Challenge:** “Why would a pure read pay a power-loss durability transaction?”

Resolution: it does not. D0 reads are enforced read-only and replay-safe; D1 effects commit admission and terminal state durably. Database configuration is read back and asserted.

### 32.3 Linux kernel maintainer

**Challenge:** “Why is the root process parsing rich protocol input?”

Resolution: it is not. `boundary-init` accepts only compact compiled launch records; unprivileged `boundary-agent` handles rich protocol and workspace semantics. Atomic cgroup placement, private namespaces, pidfds, and descendant proof remain mandatory.

### 32.4 Virtualization security engineer

**Challenge:** “Why assume Gondolin is best?”

Resolution: Phase 0 renders one semantic plan through Gondolin and direct QEMU, with Firecracker as a reference where compatible, then selects one backend. Device/descriptor surface, conformance, code size, performance, advisories, and maintenance cost decide.

### 32.5 Host-security engineer

**Challenge:** “A trusted daemon bug still has the user’s full ambient authority.”

Resolution: the daemon opens exact resources and then applies systemd and Landlock restrictions, closes unexpected descriptors, and attests observed controls. This is defense in depth, not a claim that the daemon is untrusted.

### 32.6 Cryptographic-protocol engineer

**Challenge:** “How do you know this is the intended fresh guest and not a replay?”

Resolution: a one-boot secret and nonce authenticate a canonical HMAC transcript binding lease, plans, TCB generation, protocol, and guest artifacts. The design does not invent encryption or remote attestation claims.

### 32.7 Supply-chain engineer

**Challenge:** “What exactly was built and can a mixed generation start?”

Resolution: all TCB artifacts have digests, SBOMs, provenance, and eligibility/denylist state. Leases bind one complete immutable generation; upgrade creates new leases and rollback selects a complete prior generation.

### 32.8 SRE and voice engineer

**Challenge:** “Static CPU weights do not tell you the workstation is thrashing.”

Resolution: admission incorporates PSI and model-server latency, reports p99 separately for D0 and D1, and sheds batch work without treating unknown mutations as restartable.

### 32.9 Privacy engineer

**Challenge:** “Offline guest does not mean local model or no connector egress.”

Resolution: `DataExposureIR` separates guest network, model locality, host connectors, raw output, change-set retention, and quarantine. Unknown remains unknown.

### 32.10 Solo-builder maintainer

**Challenge:** “Is this becoming a platform before it becomes useful?”

Resolution: Release 0.1 remains one source mode, one offline profile, one selected backend, no network, no secrets, no promotion, and no used-VM pooling. The compiler architecture prevents future drift; it does not expand current scope.

---
