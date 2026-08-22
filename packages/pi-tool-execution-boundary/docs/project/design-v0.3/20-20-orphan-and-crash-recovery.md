## 20. Orphan and crash recovery

### 20.1 Identity sources

Recovery uses:

- systemd unit name and D-Bus unit identity;
- unit cgroup path;
- VM UUID;
- lease ID and nonce hash in SQLite;
- QMP socket under the lease directory;
- QEMU command digest where observable;
- `/proc/<pid>/stat` start time only as corroboration, never sole authority.

Numeric PID alone is never sufficient to signal or adopt a process.

### 20.2 Daemon crash

systemd restarts the daemon. Before accepting clients, it reconciles every nonclosed lease.

Release 0.1 takes the conservative path:

- any VM surviving daemon loss is stopped through its known systemd unit;
- every started/nonterminal call becomes outcome unknown unless a durable terminal record exists;
- the overlay is quarantined;
- no lease is adopted for continued execution after daemon restart.

### 20.3 Pi client crash

Client disconnect does not immediately imply process cancellation. Policy determines a short grace window. After the grace window:

- queued calls are cancelled pre-effect;
- started calls are cancelled and disposed;
- the lease drains and closes or quarantines;
- no call continues indefinitely without a live client.

### 20.4 Host reboot

On reboot, systemd units and VMs are gone. The daemon still treats nonterminal mutation calls as unknown and quarantines their overlays. Read-only calls may be classified failed-known only when no mutation or external effect was possible.

### 20.5 Guest-agent failure

Loss of the trusted agent or control channel:

- stops new calls;
- cancels or kills all known cells;
- stops the VM;
- marks active mutations unknown;
- quarantines the overlay;
- records the exact last verified state.

---
