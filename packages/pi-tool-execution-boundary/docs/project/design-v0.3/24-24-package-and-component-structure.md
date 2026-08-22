## 24. Package and component structure

```text
packages/pi-tool-execution-boundary/
├── package.json
├── README.md
├── extensions/
│   └── tool-execution-boundary.ts
├── adapter/
│   ├── requested-operation.ts
│   ├── path-translation.ts
│   ├── coverage.ts
│   └── client.ts
├── protocol/
│   ├── boundary-v1.proto
│   ├── compatibility.md
│   └── generated/
├── ir/
│   ├── policy/
│   ├── operation/
│   ├── plan/
│   ├── source-snapshot/
│   ├── changeset/
│   ├── disposition/
│   ├── attestation/
│   ├── data-exposure/
│   ├── source-artifact/
│   └── canonical-cbor/
├── policy-compiler/
│   ├── parse.rs
│   ├── normalize.rs
│   ├── subset.rs
│   └── compile.rs
├── daemon/
│   ├── database/
│   ├── d0_audit/
│   ├── admission/
│   ├── confinement/
│   ├── pressure/
│   ├── generations/
│   ├── backend/
│   │   ├── gondolin/
│   │   ├── qemu_direct/
│   │   └── firecracker_reference/
│   └── recovery/
├── guest/
│   ├── boundary-init/
│   ├── boundary-agent/
│   └── image/
├── supply-chain/
│   ├── sbom/
│   ├── provenance/
│   ├── denylist/
│   └── generation-manifest/
├── requirements/
│   ├── requirements-v0.3.json
│   └── schema.json
├── canonicalization/
│   ├── deterministic-cbor-v1.md
│   └── golden-vectors.json
├── formal/
│   ├── PiToolBoundaryV03.tla
│   └── PiToolBoundaryV03.cfg
├── tests/
│   ├── unit/
│   ├── property/
│   ├── mutation/
│   ├── protocol-fuzz/
│   ├── canonical-cross-language/
│   ├── backend-conformance/
│   ├── crash-powerloss/
│   ├── differential-pi/
│   ├── pressure-voice/
│   └── supply-chain/
└── scripts/
    ├── generate-requirements.mjs
    ├── verify-generation.sh
    ├── backend-bakeoff.mjs
    └── release-check.sh
```

### 24.1 Semantic-core independence

The IR and canonicalization packages have no backend, Pi, database, systemd, or guest dependencies. This enables property testing and independent Rust/TypeScript canonical-vector implementations before VM work.

### 24.2 Privileged code budget

`boundary-init` is a separate small Rust binary/crate with an explicit code-size/dependency budget and no general serialization framework beyond the fixed launch record. Unsafe code is limited to audited syscall wrappers.

### 24.3 Structured requirements SHOULD

`requirements-v0.3.json` is the source of truth. CSV, Markdown requirement index, test tags, release gates, and missing-evidence checks are generated from it. This is build-time QA metadata, not runtime policy.
