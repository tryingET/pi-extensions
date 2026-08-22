## 29. Deferred releases and explicit debt boundaries

### 29.1 SourceArtifactIR

`SourceArtifactIR` is specified for future immutable, content-addressed source-image caching. It is a SHOULD-level design artifact, disabled in Release 0.1. Enabling requires evidence that current source materialization is a material bottleneck plus a security review of artifact tenancy, lifecycle, and poisoning resistance.

### 29.2 Network and D2

Network and secret brokerage require a separate policy language/IR, L7 enforcement plan, pre-dispatch D2 durability, DNS/redirect/private-address controls, secret-reflection defense, and host capability composition. Release 0.1 constructs no D2 operation.

### 29.3 Shared-kernel profile

A Bubblewrap/Sandbox Runtime profile remains deferred. It receives a distinct semantic plan variant and truthful reduced-isolation claim; it cannot be represented as optional fields inside the micro-VM plan.

### 29.4 Automatic promotion

ChangeSet application to the canonical checkout remains a separate transaction design with base-digest conflict, root-safe path handling, crash rollback, and explicit authorization.

### 29.5 VM pooling

Only never-used attested VMs may later enter a clean prewarm pool. A VM that has executed untrusted code never returns to that pool.

### 29.6 Immutable scanner VM

A separate scanner/export VM is a COULD-level future hardening option only if baseline trusted guest export becomes an evidenced risk or bottleneck.
