## 0. Revision disposition and change closure

Specification v0.3 supersedes Revision 2.1. It preserves the Release 0.1 product boundary—offline local micro-VM execution against guest-owned storage—but changes the semantic architecture so implementation cannot distribute authority across ad hoc parsers and backend flags.

The revision integrates every MUST and SHOULD item from the simulated cross-domain panel. The panel was a structured reasoning exercise, not a claim that named external experts personally endorsed the design.

### 0.1 Binding v0.3 deltas

| Domain | Binding change |
|---|---|
| Semantic architecture | Human policy compiles through closed, versioned IR stages. Backends never interpret source policy. |
| Tool calls | `toolName + effectClass + opaque bytes` is removed. Calls use a closed requested-operation union and a separately constructed admitted-operation IR. |
| Durability | D0 replay-safe reads use volatile admission and buffered audit; D1 workspace effects use durable pre-effect admission; D2 is reserved for later external effects. |
| Guest TCB | Minimal privileged `boundary-init` is separated from unprivileged `boundary-agent` and untrusted workload cells. |
| Host daemon | After opening required resources, the daemon applies systemd hardening and Landlock where supported, then attests the effective restrictions. |
| Boot identity | READY requires a one-boot challenge/response bound to lease ID, boot nonce, plans, protocol, and all TCB artifact digests. |
| Guest root | Production root is immutable and integrity-verified; writable workspace and temporary state are separate. |
| Backend choice | Phase 0 compares Gondolin, minimal direct QEMU, and Firecracker where compatible; one production backend is selected by evidence. |
| Realtime protection | Admission combines cgroup controls, PSI, and measured local-inference latency rather than relying on static weights alone. |
| Upgrade | Leases bind to immutable complete TCB generations; no in-place mixed-generation upgrade is permitted. |
| Supply chain | Every TCB artifact has a digest inventory, SBOM, and provenance; denylisted generations cannot start new leases. |
| Formal QA | The TLA+ model expands to D0/D1, multiple clients and epochs, output credits, resources, workspace generations, and TCB generations. TLC evidence is a release gate. |
| Storage evolution | `SourceArtifactIR` is defined for future immutable source-image caching but remains disabled until benchmarks justify it. |
| Privacy | `DataExposureIR` reports guest network, model egress, host connectors, content retention, and quarantine separately. Unknown locality stays unknown. |
| Operator UX | Versioned JSON and human `doctor`, `status`, `explain`, and `destroy` surfaces are normative. |
| Database | The daemon reads back and asserts effective SQLite pragmas, application ID, schema version, and checkpoint policy. |

### 0.2 Scope remains deliberately narrow

The compiler architecture is not permission to pull future capabilities into Release 0.1. The following remain deferred:

```text
network access
secret brokerage
shared-kernel production profile
dirty-tree import
automatic canonical apply
automatic commit/push/PR
GPU passthrough
cross-repository writable cache
used-VM clean pooling
model-visible backend selection
general workflow DSL
```

### 0.3 Go/no-go disposition

```text
Specification v0.3 semantic baseline: CLOSED
Slice A — semantic core: GO
Phase 0 backend conformance bake-off: GO in parallel
Slice B — durable daemon without VM: GO after Slice A type/digest gates
Effectful VM product code: GO only after Phase 0 selects a conforming backend
Production release: BLOCKED until every v0.3 release gate has evidence
```

The next implementation step is therefore **Slice A plus Phase 0**, not an immediate end-to-end VM implementation.
