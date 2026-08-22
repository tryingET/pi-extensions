## 5. Concrete semantic and runtime architecture

```text
Human policy JSON
  │ parse / reject unknowns
  ▼
PolicySourceAST
  │ normalize units, sets, defaults, path profiles
  ▼
NormalizedPolicyIR
  │ prove proposal <= operator grant
  ▼
EffectivePolicyIR + PolicySubsetProofIR
  │ combine HostFactsIR + TCBGenerationIR + backend capabilities
  ▼
SemanticEnforcementPlanIR
  │ backend compiler
  ▼
RenderedBackendPlanIR
  │ derive exact negative-canary set
  ▼
CanaryPlanIR -> CanaryEvidenceIR
  │ bind boot transcript and effective host restrictions
  ▼
AttestationIR -> AttestedLeaseIR
```

Runtime call path:

```text
Pi standard tool call
  ▼
TypeScript adapter
  - pinned Pi schema parity
  - host-to-workspace path translation
  - no caller effect/durability field
  ▼
RequestedOperationIR
  │ policy authorization
  │ derive effect + D0/D1
  │ clamp limits/deadline
  │ bind lease/epoch/workspace generation
  ▼
AdmittedOperationIR
  ├── D0: volatile admission + bounded audit
  └── D1: durable SQLite admission + mutation token
  ▼
self-confined user daemon
  ▼
attested persistent micro-VM lease
  ├── immutable verified root
  ├── bounded writable workspace disk
  ├── unprivileged boundary-agent
  └── minimal privileged boundary-init
          ▼
structured RPC or fresh execution cell
          ▼
EffectDispositionIR
          └── optional typed ChangeSetIR
```

### 5.1 Component trust split

- **Pi adapter:** trusted compatibility adapter; no generic local execution.
- **User daemon:** trusted authority for policy compilation, resources, durable D1 calls, recovery, and attestation; self-confined after initialization.
- **Backend renderer:** trusted deterministic conversion from semantic plan to exact backend plan.
- **Micro-VM/VMM and guest image:** trusted TCB generation components.
- **`boundary-init`:** minimal privileged cell launcher with a compact fixed request schema.
- **`boundary-agent`:** unprivileged structured-tool and protocol broker.
- **Workload cells:** untrusted.

### 5.2 One user-scoped daemon

One daemon coordinates all Pi sessions, global resource reservations, TCB-generation inventory, SQLite D1 authority, D0 audit buffering, retention, and orphan recovery. The daemon is a systemd user service or socket-activated service. Its control socket is owner-only and peer UID is verified.

### 5.3 Host daemon self-confinement

Before accepting clients the daemon:

1. opens descriptor-rooted state, runtime, image, source, `/dev/kvm`, and systemd communication resources;
2. verifies directory ownership and permissions;
3. installs systemd service hardening;
4. applies Landlock filesystem and, where supported and useful, network restrictions;
5. closes unexpected descriptors and audits inherited sockets;
6. records effective restrictions in `HostConfinementIR`;
7. refuses READY if a profile-required restriction is absent.

Landlock is defense in depth, not the primary workload boundary. The operator grant states whether unsupported Landlock is a hard failure or a visible reduced-hardening state.

### 5.4 Closed IR dependency direction

```text
semantic IR
  ↑ policy compiler
  ↑ backend compilers
  ↑ daemon
  ↑ Pi adapter
  ↑ guest agent
```

The semantic IR package MUST NOT import backend or transport implementations. Generated Protobuf objects are converted immediately into domain types and are never journal or digest authority.
