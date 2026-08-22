## 9. Persistent lease lifecycle, boot identity, and immutable generation

### 9.1 Lease identity

Every lease binds:

```ts
interface AttestedLeaseIdentityV1 {
  leaseId: string;                    // UUIDv7
  ownerUid: number;
  clientEpoch: string;
  sourceSnapshotDigest: string;
  effectivePolicyDigest: string;
  semanticPlanDigest: string;
  renderedPlanDigest: string;
  canaryEvidenceDigest: string;
  attestationDigest: string;
  tcbGenerationDigest: string;
  backendId: string;
  vmUuid: string;
  bootNonceDigest: string;
}
```

Any change creates a new lease.

### 9.2 Lifecycle

```text
REQUESTED
-> RESOURCES_RESERVED
-> TCB_SELECTED
-> STORAGE_PREPARED
-> BACKEND_STARTING
-> VM_BOOTING
-> BOOT_CHALLENGE
-> HOST_CONFINEMENT_VERIFIED
-> PLAN_ATTESTING
-> CANARIES_RUNNING
-> IMPORTING
-> READY
-> DRAINING
-> CLOSING
-> CLOSED
```

Failure states remain fail-closed: `FAILED_PRE_EFFECT`, `QUARANTINED`, and `DESTROYED_UNKNOWN`.

### 9.3 Boot challenge

The host generates a 256-bit boot secret and independent nonce. The secret is delivered through a boot channel not mounted or inherited by workload cells. The guest returns HMAC-SHA-256 over a canonical transcript containing:

```text
protocol major/minor
lease ID
client epoch
boot nonce
semantic plan digest
rendered plan digest
TCB generation digest
kernel/initramfs/rootfs digests
boundary-init and boundary-agent digests
guest boot ID
monotonic transcript sequence
```

Replay, stale sequence, wrong plan, wrong image, mixed generation, or incorrect HMAC fails and destroys the lease before source import.

This is local freshness/configuration binding, not remote hardware attestation and not a custom confidentiality protocol.

### 9.4 Backend and canary attestation

The selected backend must expose exact rendered device, descriptor, systemd/cgroup, storage, rootfs, and control-channel facts. Required negative canaries derive from the semantic plan; omission of a required canary is itself an attestation failure.

### 9.5 Drain and upgrade

A generation marked draining accepts no new leases. Existing leases may complete within policy or be explicitly destroyed. A running lease never changes daemon semantic version, guest agents, kernel, rootfs, protocol major, canonicalization version, or backend renderer.
