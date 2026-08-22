## 8. Immutable guest root, TCB generation, and supply chain

### 8.1 Complete TCB generation

A production lease belongs to one immutable `TCBGenerationIR` containing exact identities for:

- Pi adapter;
- user daemon;
- policy and semantic-plan compiler;
- canonical-CBOR implementation/version;
- backend renderer and backend binary;
- QEMU or selected VMM;
- guest kernel and initramfs;
- immutable root filesystem;
- `boundary-init`;
- `boundary-agent`;
- Protocol Buffer schema and compatibility profile;
- SQLite schema/application ID;
- required canary implementations.

Mixed generations cannot negotiate READY.

### 8.2 Root filesystem

The production root filesystem is read-only and integrity-verified. Phase 0 selects one mechanism, such as dm-verity or a backend-equivalent measured immutable image, and binds its root digest into the rendered plan and boot transcript.

Writable state is separated:

| Storage | Mutability | Lifetime |
|---|---:|---|
| root filesystem | read-only, verified | TCB generation |
| workspace block device | read-write, bounded | lease |
| optional per-lease cache | read-write, bounded | lease only |
| `/tmp`, `/var/tmp`, `/dev/shm`, `HOME`, XDG runtime | read-write | call-private unless explicitly stated |
| controller configuration and binaries | read-only | TCB generation |

Rootfs tamper or digest mismatch prevents READY.

### 8.3 Image contents

The image includes only the selected compatibility tier: minimal init, `boundary-init`, `boundary-agent`, Bash/sh, Git, ripgrep, find/walker, coreutils, and explicitly pinned development runtimes. It contains no SSH server, network manager, cloud agent, package-update daemon, production credentials, or debug service.

Debug images have a distinct profile, artifact identity, and attestation class and can never satisfy production `microvm-offline` policy.

### 8.4 SBOM and provenance

Every TCB artifact has:

- immutable SHA-256 digest;
- build recipe identity;
- dependency/material inventory;
- SPDX or CycloneDX SBOM;
- SLSA-compatible provenance or equivalent signed statement;
- vulnerability and denylist evaluation result;
- compatibility metadata and deprecation date.

Moving tags are prohibited. Offline verification must succeed before installation and before a generation becomes eligible for new leases.

### 8.5 Upgrade and rollback

```text
install complete new generation
-> verify artifacts, SBOM, provenance, schema, and canaries
-> mark generation eligible
-> new leases use new generation
-> existing leases drain or are explicitly destroyed
-> no in-place agent/kernel/rootfs/compiler replacement
```

Rollback selects a complete previously attested generation. Upgrade and rollback drills are release gates.
