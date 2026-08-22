## 22. Performance, D0/D1 SLOs, PSI, and local voice coexistence

### 22.1 Objective

VM boot is amortized at lease scope; untrusted process state is not. Pure read routing remains cheap enough for high-frequency agent use, while durable mutation latency is measured separately and never hidden inside the D0 SLO.

### 22.2 Separate SLO families

| Path | p50 target | p95 target | p99 target |
|---|---:|---:|---:|
| adapter + RequestedOperationIR construction | < 0.25 ms | < 0.75 ms | < 1.5 ms |
| D0 daemon validation/admission, no guest work | < 0.5 ms | < 1.5 ms | < 3 ms |
| D1 durable admission on owner filesystem | measured separately | measured separately | policy-bound, not conflated with D0 |
| small structured read overhead excluding disk | < 2 ms | < 5 ms | < 10 ms |
| fixed read-only cell start | < 10 ms | < 25 ms | < 50 ms |
| Bash cell start | < 15 ms | < 35 ms | < 75 ms |
| warm VM lease acquisition | < 1 s | < 2 s | < 3 s |
| cancellation initiation | < 10 ms | < 20 ms | < 50 ms |

Targets are provisional gates to measure on the workstation; they do not justify removing controls.

### 22.3 No-fsync D0 invariant

Profiling and syscall/fault tests MUST prove no per-call durable database synchronization on ordinary D0. D0 telemetry batching, database checkpointing, and maintenance occur outside the call completion path.

### 22.4 Voice-active campaign

The owner-workstation campaign runs local inference and boundary workloads simultaneously and records:

- model TTFT/inter-token latency;
- system and cgroup PSI;
- D0 and D1 p99;
- cell start/cleanup;
- VM resource throttling;
- storage latency and WAL/checkpoint behavior;
- cancellation under contention.

Batch admission thresholds are calibrated from this evidence.

### 22.5 Million-call posture

- persistent protocol and lease;
- closed in-memory model/operation dispatch;
- no per-read fsync;
- bounded output credits;
- prepared SQLite statements for D1;
- buffered sampled D0 audit;
- one structured tool request per Pi call, not per guest syscall;
- no per-call VM boot or host CLI wrapper.
