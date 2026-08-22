## 16. Global admission, PSI, inference coexistence, and retention

### 16.1 Static reservations

One user daemon enforces global limits on active/starting leases, aggregate memory/vCPU/PIDs, virtual disk, retained/quarantine bytes, active calls, D1 mutators, and per-client queue depth. Resources are reserved transactionally before backend start.

### 16.2 Pressure and inference signals

Admission observes:

- `/proc/pressure/cpu`, memory, and I/O;
- relevant boundary and inference cgroup pressure/counters;
- host free memory and storage;
- local model-server TTFT and inter-token latency when available through a declared read-only metric adapter;
- active and queued D0/D1 calls;
- database/WAL/quarantine health.

PSI triggers use policy-defined windows and thresholds. Missing model metrics are reported as unknown; they are never fabricated.

### 16.3 Load shedding

When pressure exceeds policy:

1. refuse new batch leases;
2. refuse or defer new batch D1 calls;
3. pause only explicitly restartable D0/read-only batch cells where the backend proves pause semantics;
4. preserve interactive cancellation/control capacity;
5. never kill an unknown D1 effect and classify it as replay-safe;
6. surface the exact signal and recovery guidance.

### 16.4 Voice gates

Release evidence includes idle and voice-active p50/p95/p99 for adapter, D0 admission, D1 admission, cell start, cancellation, cleanup, VM boot, and real workloads. Voice-active acceptance uses measured TTFT and PSI, not merely CPUWeight configuration.

### 16.5 TCB generation inventory

The daemon tracks installed, eligible, active, draining, revoked, and rollback generations. A denylisted/vulnerable artifact prevents new leases. Running leases are not silently mutated; operator policy decides whether they drain or are destroyed.

### 16.6 Retention

Active, exported, retained, and quarantined artifacts share one global storage budget. Exhaustion fails new admission visibly. No used VM or writable cache re-enters a clean pool. Retained state lives outside watched repositories and is never automatically opened or executed.
