## 1. Normative claim set and semantic trust chain

The words **MUST**, **MUST NOT**, **SHOULD**, **SHOULD NOT**, and **MAY** are normative.

Release 0.1 may claim only:

1. Covered standard Pi computer tools operate on a guest-owned disposable checkout inside an attested local micro-VM.
2. Human policy is parsed once into a closed normalized IR, proven no broader than the operator grant, and compiled into a semantic plan before any backend rendering.
3. Backends receive only a rendered plan. They never interpret source JSON or infer missing security controls from defaults.
4. Every tool call becomes a closed typed requested operation. Effect and durability class are derived by trusted code and cannot be selected by the caller, model, or backend.
5. D0 operations are mechanically read-only, replay-safe, and may use non-durable admission; D1 workspace effects are durably admitted before any effect begins.
6. The canonical repository is not writable from the lease and is not trusted as a promotion target during Release 0.1.
7. The guest receives no controller-injected host credentials and has no guest egress interface.
8. Each arbitrary process call executes in a fresh execution cell under a minimal privileged launcher and cannot remain alive after a clean terminal disposition.
9. A lease becomes READY only after its immutable TCB generation, semantic plan, rendered plan, boot transcript, effective host confinement, and required canaries are bound into one attestation.
10. Every successful D1 call has a durable terminal disposition and known workspace generation.
11. Export is a typed content-addressed change set derived without trusting sandbox Git metadata.
12. No failure may fall back to unrestricted host execution.

The semantic trust chain is:

```text
PolicySource JSON
  -> PolicySourceAST
  -> NormalizedPolicyIR
  -> EffectivePolicyIR + PolicySubsetProofIR
  -> SemanticEnforcementPlanIR
  -> RenderedBackendPlanIR
  -> CanaryPlanIR + CanaryEvidenceIR
  -> AttestationIR
  -> AttestedLeaseIR

Pi tool schema
  -> RequestedOperationIR
  -> AdmittedOperationIR
  -> D0 or D1 execution
  -> EffectDispositionIR
  -> optional ChangeSetIR
```

Every arrow is an explicit typed conversion with validation. No security-significant stage accepts an untyped extension map, arbitrary expression, backend snippet, or caller-supplied effect classification.

Release 0.1 does **not** claim protection from malicious code already loaded into the trusted Pi host process, QEMU/KVM escapes, same-account host attackers, side channels, end-to-end DLP through a remote model provider, arbitrary dirty-tree import, networked package installation, safe automatic promotion, or multiple concurrent writable agents on one checkout.

Operator status MUST expose these dimensions independently and MUST NOT reduce them to a single `secure` flag.
