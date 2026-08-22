---
summary: "The exact implementation entry point after the v0.3 design consolidation."
---

# Implementation entry plan

## Decision

Proceed to implementation now, in two controlled tracks:

1. **Slice A semantic core** — production-quality IR, policy compiler, canonicalization, test-only reference state model and scripted protocol peer, Pi schema adapters, requirements generation, and TLA+ model checking.
2. **Phase 0 backend bake-off** — disposable probes of Gondolin, direct QEMU, and Firecracker where compatible.

Slice B daemon work may begin after the core requested/admitted operation and policy/plan IRs stabilize. Do not enable real workspace mutation or arbitrary process execution before one backend has passed Slice C attestation gates.

## First pull request scope

A good first PR contains only:

- package/template scaffold;
- Rust workspace and TypeScript adapter test harness;
- strict policy schema;
- semantic IR crate;
- deterministic-CBOR/domain-digest crate;
- requested/admitted operation conversion;
- policy subset proof;
- test-only reference call model and adversarial scripted protocol peer;
- protocol DTO generation;
- golden vectors in Rust and Node;
- generated requirements/traceability command;
- TLA+ v0.3 model and TLC CI command;
- no VMM dependency and no real effectful execution.

## Gate to effectful VM work

- caller/backend cannot choose effect or durability;
- subset-lattice property and mutation tests pass;
- canonical vectors agree cross-language;
- protocol/parser fuzz targets exist;
- D0/D1 state model passes TLC at agreed bounds;
- reference-model and scripted-peer crash/idempotency tests pass;
- Phase 0 selects a conforming production backend;
- owner accepts measured boot/cell latency and maintenance burden.

