## 10. Split guest TCB and fresh execution cells

### 10.1 Three security domains

```text
boundary-init
  minimal privileged launcher; no rich protocol parser

boundary-agent
  unprivileged protocol, structured tools, workspace coordinator, export scanner

workload cells
  untrusted processes and fixed read-only utilities
```

### 10.2 `boundary-init` contract

`boundary-init` accepts only a compact fixed `CellLaunchIR` from `boundary-agent`. It MUST NOT accept:

- policy JSON or expressions;
- arbitrary paths;
- shell source text;
- environment maps of unbounded keys;
- mount specifications;
- backend configuration;
- network policy;
- Protobuf tool envelopes.

The launch IR refers only to pre-opened/validated resources and bounded IDs. The launcher:

1. verifies caller identity and monotonic request sequence;
2. opens/creates the pre-approved per-call cgroup;
3. sets all limits;
4. uses `clone3(CLONE_INTO_CGROUP | CLONE_PIDFD | required namespace flags)`;
5. creates private PID, mount, IPC, network, and UTS namespaces;
6. installs fixed mounts from a closed template;
7. drops UID/GID, groups, capabilities, dumpability, and privileges;
8. installs the selected seccomp profile;
9. closes all undeclared descriptors;
10. returns pidfd and cgroup identity;
11. never interprets command output or workspace content.

### 10.3 Launcher isolation

Workload cells cannot signal, ptrace, read, modify, impersonate, or connect to `boundary-init` or its control channel. The launcher runs under a distinct UID, immutable executable/configuration, non-dumpable state, private control socket/descriptor, and a process relationship invisible from workload PID namespaces.

### 10.4 `boundary-agent`

The unprivileged agent owns:

- Protobuf DTO decoding and conversion to semantic operation types;
- workspace path validation;
- structured `read`, `write`, `edit`, and `ls`;
- fixed `grep`/`find` request compilation;
- mutation locking and workspace generation;
- source materialization and export scanning;
- result streaming and call-level evidence.

It cannot modify rootfs/launcher binaries or broaden the rendered plan.

### 10.5 Fresh cells and cleanup

Each arbitrary process or fixed utility call gets private namespaces, cgroup, temporary state, clean environment, bounded output, and pidfd supervision. No untrusted instruction runs before atomic cgroup placement. A clean terminal disposition requires recursive `cgroup.events: populated=0`; failure to prove emptiness quarantines the lease.

Guest-local Unix sockets are allowed inside a call. The invariant is absence of host socket reachability, inherited unexpected socket descriptors, cross-cell abstract-socket visibility, and controller-channel access—not a blanket socket-creation ban.
