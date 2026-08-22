---
summary: "@tryinget/pi-tool-execution-boundary package overview."
read_when:
  - "Starting work in this package."
  - "Choosing where Pi computer tools execute."
  - "Reviewing the implementation and release boundary."
---

# @tryinget/pi-tool-execution-boundary

A local-first execution-plane boundary for Pi computer tools. The target architecture preserves the standard model-visible tools (`read`, `write`, `edit`, `ls`, `grep`, `find`, and `bash`) while routing their effects through a persistent, policy-bound, attested sandbox lease.

## Current status

**Semantic and controller implementation. Real computer effects remain disabled.**

Implemented:

- strict Release 0.1 policy normalization and a complete field-level subset proof;
- closed requested/admitted operation IR with trusted effect and D0/D1 derivation;
- complete request identities binding call/lease/client identity and every normalized operation field;
- deterministic CBOR and domain-separated SHA-256 identities;
- backend-neutral `microvm-offline` semantic plans and capability coverage proofs;
- verified attestation and production-backend identity types;
- bounded protocol framing and a typed Protobuf generation pipeline;
- a controller state machine with output credits, single-writer generations, cancellation, ambiguity, and quarantine;
- SQLite WAL/FULL D1 authority as a TypeScript conformance implementation;
- bounded content-minimized D0 audit;
- typed source snapshot, change-set, disposition, and data-exposure IR;
- a direct-QEMU candidate renderer and non-authoritative host-fact probe;
- an independent Rust semantic-core implementation;
- a bounded TLA+ controller model;
- diagnostics-only `/tool-boundary status|doctor|explain` commands.

Not implemented or claimed:

- starting a VM or selecting a production backend;
- overriding Pi standard tools;
- executing a host or guest command;
- importing or mutating a real workspace;
- guest image, `boundary-init`, or `boundary-agent`;
- network, secrets, or automatic promotion;
- any host-execution fallback.

## Semantic chain

```text
strict JSON policy
  -> normalized/effective policy + subset proof
  -> semantic enforcement plan
  -> rendered and attested backend plan (future)

Pi tool call
  -> requested operation
  -> admitted operation
  -> D0 or D1 controller state
  -> attested execution (future)
  -> effect disposition and optional ChangeSet
```

## Test doubles

The reference model and scripted adversarial peer are under `tests/support/`. They are not exported, not published, carry no attestation, cannot activate a lease, and are never fallbacks.

## Development

```bash
npm install
npm run vectors:generate
npm run proto:lint
npm run proto:generate
npm test
npm run rust:test
TLA2TOOLS_JAR=/path/to/tla2tools.jar npm run formal:check
npm run validate:artifacts
npm run bakeoff:host-facts
```

## Current gate

The code may not enable real effects until an owner-workstation bake-off selects one backend and evidence binds its exact rendered plan, guest image, control channel, resource controls, cleanup behavior, and voice/inference interference.
