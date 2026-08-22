## 26. Verification strategy and evidence architecture

### 26.1 Structured traceability

`requirements-v0.3.json` maps each requirement to threats, components, tests, evidence types, target slice/release, and residual risk. Generated outputs fail CI if a MUST lacks tests/evidence or if code/test tags refer to unknown requirements.

### 26.2 Semantic core

- JSON Schema negative corpus;
- property and mutation tests for normalization/subset lattice;
- closed-union exhaustiveness tests;
- attempt to smuggle caller effect/durability;
- WorkspacePath Unicode/control/segment corpus;
- semantic-plan completeness and backend capability-coverage tests.

### 26.3 Canonicalization

- RFC 8949 deterministic profile parser/encoder tests;
- reject duplicate keys, floats, indefinite lengths, non-preferred integers, unknown tags;
- Rust/TypeScript golden vectors;
- domain-separation collision tests;
- schema/version migration vectors;
- Protobuf byte-order perturbation proving semantic digest stability.

### 26.4 Database and durability

- PRAGMA readback and deliberate misconfiguration refusal;
- D0 syscall tracing proving no per-call fsync;
- D1 crash/power-loss matrix on owner filesystem;
- WAL growth/checkpoint/backup/ENOSPC;
- duplicate ID and client-epoch recovery;
- started-without-terminal quarantine.

### 26.5 Host/guest TCB

- Landlock/systemd negative canaries;
- boot replay/wrong-plan/mixed-generation/tampered-root tests;
- workload attempts to ptrace/signal/reach launcher/control channel;
- descriptor and socket inventory;
- clone-before-cgroup race test;
- descendants and cgroup populated oracle;
- rootfs immutability and workspace separation.

### 26.6 Backend bake-off

The same semantic plan and canary suite runs on each candidate. Evidence includes functional conformance, device surface, security advisories/version, code/dependency surface, performance, and operator maintenance cost.

### 26.7 Pressure and voice

PSI trigger tests, synthetic CPU/memory/I/O pressure, local-model metric loss/unknown state, batch load shedding, D0 preservation, D1 non-preemption, and voice-active p99 campaign.

### 26.8 Parser attack inventory

Every cross-trust parser/message has owner, limits, fuzz target or explicit rationale: JSON policy, Protobuf frames, CBOR artifacts, SQLite migrations, source manifest, change set, boot transcript, cell launch record, guest structured tool inputs, and rendered backend configuration.

### 26.9 Formal model

TLC must model-check bounded multi-client configurations before release. The artifact bundle records TLC version, JVM, constants, workers, states generated/distinct, diameter, elapsed time, and exit code.
