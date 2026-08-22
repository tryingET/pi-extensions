## 4. Trust and threat model

### 4.1 Trusted computing base

Release 0.1 trusts:

- the host operating system and kernel;
- the operator account;
- the Pi host process and every loaded extension;
- the boundary daemon binary and its Rust dependencies;
- SQLite and the local filesystem behavior it relies on;
- systemd user manager and cgroup v2;
- QEMU/KVM;
- the pinned guest kernel, initramfs, root filesystem, minimal privileged `boundary-init`, and unprivileged trusted `boundary-agent`;
- the source repository's committed bytes only as data, not as trusted executable behavior.

### 4.2 Untrusted

- model output and tool arguments;
- repository code, build scripts, tests, hooks, attributes, configuration, and binaries;
- any process launched in an execution cell;
- the sandbox's synthetic `.git` repository after workload access;
- terminal output and filenames;
- prior retained guest state unless it is the same quarantined lease under review.

### 4.3 Protected assets

- all host paths outside daemon-owned state;
- the canonical Git checkout and repository metadata;
- host credentials and sockets;
- local inference service availability;
- global CPU, memory, PID, and disk availability;
- integrity of the controller database and attestation records;
- correctness of “success,” “cancelled,” and “unknown” outcomes.

### 4.4 Explicit non-goals

- malicious host extension containment;
- side-channel resistance;
- hypervisor zero-day defense;
- complete denial-of-service resistance against a same-account host attacker;
- remote-model confidentiality;
- defending the canonical repository after a separately authorized promotion outside Release 0.1.

---
