## 25. Correct implementation sequence

The correct next step after this revision is implementation, but in constrained slices.

### Slice A — semantic core (start immediately)

Deliver without VM dependencies:

- strict policy JSON Schema;
- PolicySourceAST, NormalizedPolicyIR, OperatorGrantIR, EffectivePolicyIR;
- field-level subset proof;
- closed Requested/AdmittedOperationIR;
- derived effect and D0/D1 classification;
- WorkspacePath type;
- SemanticEnforcementPlanIR and backend capability contract;
- deterministic CBOR specification and Rust/TypeScript golden vectors;
- test-only reference call model and adversarial scripted protocol peer;
- Pi tool-schema differential fixtures;
- generated requirements artifacts.

Exit gate: no caller/backend-supplied effect or durability field, closed-type property/mutation tests pass, and cross-language canonical vectors match.

### Phase 0 — backend and host conformance (parallel with Slice A)

Probe exact workstation facts and compare Gondolin, direct QEMU, and Firecracker where compatible. Produce evidence for boot/device/descriptor/storage/control channel, root integrity, Landlock/systemd, cgroups/clone3/pidfd, warm/cold latency, memory footprint, and implementation burden.

Exit gate: select one production backend or stop. Do not implement three production adapters.

### Slice B — durable daemon without VM

Deliver:

- user daemon and owner-only socket;
- DTO-to-domain conversion;
- D0 volatile state + bounded audit;
- D1 SQLite state machine and effective PRAGMA assertions;
- output credits, cancellation, client epochs, global reservations;
- Landlock/systemd self-confinement;
- generation inventory;
- doctor/status/explain/destroy against the scripted protocol peer;
- implementation-conformance tests against TLA actions.

### Slice C — one attested VM

Deliver selected renderer, immutable root, TCB generation manifest, boot HMAC transcript, one structured D0 read, no NIC or host filesystem, canary evidence, and lease lifecycle.

### Slice D — workspace mutations and export

Deliver D1 write/edit, generation/locking, SQLite power-loss matrix, typed ChangeSet export, and independent host validation. No automatic promotion.

### Slice E — process cells

Deliver `boundary-init`, fresh cells, clone3/cgroup/pidfd, Bash/user `!`, fixed grep/find, cleanup proof, unknown/quarantine behavior, and parser fuzzing.

### Slice F — release campaign

Differential standard tools, adversarial canaries, fault injection, TLC evidence, SBOM/provenance/denylist, upgrade/rollback, PSI/voice campaign, soak/leak tests, and real-repository dogfood.
