## 28. Specification v0.3 release gate

### 28.1 Semantic correctness

- strict policy schema and closed IR types are versioned;
- no caller/backend effect or durability field exists;
- policy subset proof passes property and mutation tests;
- semantic and rendered plans are distinct;
- deterministic-CBOR golden vectors pass in Rust and TypeScript;
- Protobuf is not used as canonical digest input.

### 28.2 D0/D1 correctness and durability

- D0 mechanisms are mechanically read-only;
- no per-call fsync on D0 hot path;
- D0 retry cannot mutate or advance generation;
- D1 durable admission precedes effect;
- D1 power-loss/crash matrix passes;
- duplicate D1 IDs do not execute twice;
- effective SQLite pragmas/application ID/schema/checkpoint policy are asserted;
- unknown mutation quarantines.

### 28.3 Host and guest security

- daemon effective systemd/Landlock restrictions are reported and canaries pass;
- privileged launcher is minimal and separate;
- workload cannot reach/ptrace/signal/modify launcher or control channel;
- immutable root tamper prevents READY;
- boot transcript rejects stale/wrong/mixed guest;
- no host filesystem, NIC, GPU, or unexpected descriptor exists;
- descendants are empty before success.

### 28.4 Backend selection

- at least Gondolin and direct QEMU are compared; Firecracker is included where compatible;
- one production backend is selected by evidence;
- selected renderer covers every semantic-plan requirement;
- required canaries bind to the exact rendered plan.

### 28.5 Supply chain and upgrade

- digest inventory, SBOM, provenance, vulnerability/denylist evaluation verify offline;
- debug and production generations are distinct;
- mixed generations fail READY;
- upgrade/drain/rollback drills pass.

### 28.6 Realtime and performance

- D0 and D1 SLOs reported separately through p99;
- PSI/model-latency load shedding passes;
- voice-active workload stays within configured TTFT budget;
- no memory, FD, cgroup, disk, WAL, D0-audit, or quarantine leak in soak tests.

### 28.7 Operability

- versioned JSON/human doctor, status, explain, destroy are usable;
- unknown model locality never displays local;
- dynamic tool-owner conflicts fail closed;
- all retention is enumerable and bounded.

### 28.8 Formal and QA evidence

- TLC passes bounded multi-client models;
- all cross-trust parsers have fuzz evidence or approved rationale;
- differential Pi tool corpus passes or differences are documented;
- evidence bundle is independently inspectable offline.
