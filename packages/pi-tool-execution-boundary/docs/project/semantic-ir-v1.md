# Semantic IR v1

This companion summarizes the closed types required before backend work.

## Policy chain

```rust
struct PolicySourceAstV1 { /* values plus source locations; no defaults */ }
struct NormalizedPolicyIrV1 { /* defaults expanded; exact units; sorted semantic sets */ }
struct PolicySubsetProofV1 { relation: Relation, field_proofs: Vec<FieldProof>, proposal: Digest, grant: Digest }
struct EffectivePolicyIrV1 { /* closed Release 0.1 fields only */ }
```

Backends receive no source JSON.

## Operations

```rust
enum RequestedOperationV1 {
    Read(ReadFileV1),
    Write(WriteFileV1),
    Edit(EditFileV1),
    List(ListDirectoryV1),
    Grep(GrepFilesV1),
    Find(FindFilesV1),
    Exec(ExecProcessV1),
}

enum AdmittedOperationV1 {
    Read(AdmittedReadFileV1),
    Write(AdmittedWriteFileV1),
    Edit(AdmittedEditFileV1),
    List(AdmittedListDirectoryV1),
    GrepReadOnlyCell(AdmittedGrepFilesV1),
    FindReadOnlyCell(AdmittedFindFilesV1),
    ExecReadWriteCell(AdmittedExecProcessV1),
}
```

Effect and durability are exhaustive trusted derivations. No request field or backend flag can select them.

## Plans

```rust
enum SemanticEnforcementPlanV1 {
    MicrovmOffline(MicrovmOfflinePlanV1),
}

struct RenderedBackendPlanV1 {
    semantic_plan_digest: Digest,
    backend: BackendIdentity,
    exact_controls: ExactControlSet,
    required_canaries: Vec<CanaryId>,
}

struct AttestationV1 {
    effective_policy_digest: Digest,
    semantic_plan_digest: Digest,
    rendered_plan_digest: Digest,
    canary_plan_digest: Digest,
    evidence_set_digest: Digest,
    tcb_generation_digest: Digest,
    boot_transcript_digest: Digest,
}
```

## Durability

```rust
enum DurabilityClassV1 {
    D0ReplaySafeRead,
    D1WorkspaceEffect,
    D2ExternalEffect,
}
```

D2 is not constructible by the Release 0.1 profile.

## Generated evidence

- `SourceSnapshotV1`
- `ChangeSetV1`
- `EffectDispositionV1`
- `DataExposureIRV1`
- `PolicySubsetProofV1`
- `AttestationV1`

These are generated facts, not human-authored DSLs.

## Canonical identity

Semantic artifacts use the deterministic-CBOR v1 application profile and domain-separated SHA-256. Protobuf and diagnostic JSON are adapters, not identity.

## Future source caching

`SourceArtifactIR` is a reserved future type. Release 0.1 runtime policy rejects it until performance evidence and security review approve immutable source-image caching.
