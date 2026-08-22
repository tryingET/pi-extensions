## 7. Guest storage and quota mechanism

### 7.1 Exact Release 0.1 mechanism

The micro-VM boots from:

```text
pinned read-only base rootfs image
+ one per-lease fixed-virtual-size qcow2 writable overlay
```

The overlay is stored under the daemon's private state root, mode `0600`. The guest mounts the resulting ext4 root filesystem read-write. `/workspace` is an ordinary directory on that guest filesystem. There is no writable host filesystem provider.

### 7.2 Default capacity

Normative conservative defaults:

```text
base image virtual size: implementation-pinned
per-lease writable virtual capacity: 12 GiB
minimum host free space before lease: 24 GiB
per-lease imported source cap: 2 GiB
per-call /tmp tmpfs cap: 1 GiB
per-call /dev/shm cap: 256 MiB
per-call combined output cap: 32 MiB
change-set exported-content cap: 2 GiB
```

The operator may grant higher values through the typed policy lattice, subject to global maximums.

### 7.3 What the quota guarantees

The guest cannot write more logical filesystem data than its fixed virtual block device and filesystem permit. The controller additionally reserves the configured virtual capacity in its global accounting before lease start.

The design does not claim that unrelated host processes cannot consume the host disk. A free-space monitor and emergency journal reserve handle that operational risk.

### 7.4 Host storage controls

The daemon maintains:

- a global logical-reservation ledger;
- actual allocated-byte measurements for overlays, imports, exports, journals, logs, and quarantines;
- a minimum-free-space gate;
- a hard global state-root budget;
- a dedicated 64 MiB emergency reserve file that may be removed only to record an unknown disposition and stop admission under ENOSPC.

### 7.5 No shared mutable cache

Release 0.1 permits:

- immutable toolchains and verified cache seeds baked into the image;
- mutable caches inside one lease's writable overlay;
- no reuse of a writable overlay, package cache, compiler cache, or Git object store by a different checkout or lease generation.

A used VM or overlay is never returned to a clean pool.

---
