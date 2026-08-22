## 2. Frozen Release 0.1 product scope and durability classes

### 2.1 Supported host

Release 0.1 is Linux-only and requires:

- x86_64 Linux;
- KVM available to the operator user through `/dev/kvm`;
- cgroup v2 mounted and usable through the user systemd manager;
- systemd user D-Bus available;
- a kernel that supports `clone3()`, `CLONE_INTO_CGROUP`, pidfds, `cgroup.kill`, and recursive `cgroup.events: populated`;
- local storage with SQLite-compatible locking and fsync behavior;
- QEMU built with seccomp support;
- the exact Pi host version pinned in package compatibility metadata.

Unsupported hosts fail the doctor command. There is no degraded host-execution mode.

### 2.2 Supported source repositories

Release 0.1 supports only:

- a Git repository;
- one selected exact commit;
- a clean index and working tree relative to that commit;
- no untracked files except controller-owned paths explicitly outside the repository;
- no unresolved conflicts;
- no gitlinks/submodules in the selected tree;
- supported regular files, directories, and constrained relative symlinks;
- path names that pass the Release 0.1 path profile.

The package MUST reject:

- dirty tracked files;
- staged changes;
- untracked or ignored files requested as task inputs;
- unborn branches;
- submodule entries;
- sparse checkout state;
- partial/promisor repositories with missing required objects;
- replacement refs unless explicitly disabled and proven absent;
- unsupported filename encodings or control characters;
- source roots on filesystems that cannot provide stable reads for the snapshot operation.

The user receives a precise reason and a later-roadmap pointer for explicit snapshot import.

### 2.3 Supported tools

Release 0.1 covers:

```text
read
write
edit
bash
grep
find
ls
user ! commands
```

Coverage is exact and dynamically guarded. Any active generic computer tool that is not routed through the boundary causes strict activation to fail. Read-like tools are D0 only when their mechanism enforces a read-only workspace; mutation and arbitrary-process tools are D1.

### 2.4 Unsupported in Release 0.1

- network access of any kind from guest execution cells;
- package downloads;
- host secret brokerage;
- Docker socket, GPU, USB, TUN/TAP, FUSE passthrough, or arbitrary host devices;
- SSH into or out of the guest in production profile;
- automatic commit, push, issue, PR, email, or other external effect;
- canonical-checkout apply;
- shared mutable cache across leases;
- shared-kernel backend;
- multiple simultaneous writable leases for one source identity.

---
