## 17. Strict policy DSL, typed lattice, and compiler pipeline

### 17.1 Human DSL

Release 0.1 policy syntax is strict JSON validated by `pi-tool-boundary-policy/v1`. It is deliberately non-programmable:

- no includes;
- no environment interpolation;
- no variables, expressions, functions, loops, conditionals, or arbitrary regex;
- no backend snippets;
- no unknown fields;
- integer units only;
- closed enums and bounded arrays;
- one explicit source/profile version.

The DSL describes intent, not enforcement mechanics.

### 17.2 Compiler stages

```text
PolicySourceJSON
-> PolicySourceAST (with source locations)
-> NormalizedPolicyIR (defaults expanded, sets sorted, units exact)
-> PolicySubsetProofIR against OperatorGrantIR
-> EffectivePolicyIR
-> SemanticEnforcementPlanIR + HostFactsIR + TCBGenerationIR
-> RenderedBackendPlanIR
-> CanaryPlanIR
-> AttestationIR
```

Every stage has a versioned schema and domain-separated digest.

### 17.3 Partial order

`is_no_broader_than(proposal, grant)` returns `equal`, `narrower`, `broader`, or `incomparable` plus field-level proof. Only equal/narrower activates without a new operator grant.

The field lattice is explicit: fewer tools/capabilities, lower resource maxima, shorter retention, fewer persistence surfaces, stricter source profile, and stronger required attestation are narrower. Incomparable matcher languages or backend-specific fields require operator approval.

### 17.4 Semantic plan versus rendered plan

`SemanticEnforcementPlanIR` describes required controls without naming QEMU/Gondolin/Firecracker flags. A backend compiler either produces a complete `RenderedBackendPlanIR` and proof of capability coverage or rejects the plan. Missing backend controls cannot be replaced by documentation wording.

### 17.5 SourceArtifactIR SHOULD

The schema defines `SourceArtifactIR` for future content-addressed immutable source-image caching. Release 0.1 continues using the trusted source snapshot/import channel. Source artifacts remain disabled until benchmarks demonstrate a material bottleneck and security review approves cache lifecycle and cross-source isolation.
