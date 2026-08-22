## 31. Final implementation recommendation

The specification is now ready to enter implementation, but implementation MUST follow the dependency order established by the IR compiler architecture.

```text
Track 1: Slice A semantic core
  policy schema and compiler
  closed semantic IRs
  deterministic CBOR and golden vectors
  test-only reference call model and scripted protocol peer
  Pi schema differential fixtures

Track 2: Phase 0 backend/host conformance
  workstation prerequisite facts
  Gondolin renderer spike
  minimal direct-QEMU renderer spike
  Firecracker reference where compatible
  one evidence-based backend selection ADR

Only after both tracks pass:
  Slice B durable daemon
  Slice C attested VM
  Slice D D1 mutations/export
  Slice E arbitrary process cells
  Slice F release campaign
```

This is the correct transition from design to implementation because Slice A fixes semantic authority before any backend code can invent its own interpretation, while Phase 0 prevents months of product code from being coupled to an unproven runtime.

The decisive architecture is:

```text
strict human policy
  -> effective typed policy + subset proof
  -> semantic plan
  -> one selected rendered backend plan
  -> attested immutable TCB generation
  -> closed requested/admitted operations
  -> D0 reads or durably admitted D1 effects
  -> typed disposition and change-set evidence
```

Do not begin network, secrets, shared-kernel execution, dirty source import, or automatic promotion during the first implementation campaign.

---
