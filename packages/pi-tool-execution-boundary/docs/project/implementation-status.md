---
summary: "Current implementation and verification status for pi-tool-execution-boundary."
read_when:
  - "Assessing what is implemented versus only designed."
  - "Deciding whether real Pi tool execution may be enabled."
---

# Implementation status

## Implemented and testable in ordinary CI

- strict policy and complete Release 0.1 subset lattice;
- closed requested/admitted operation IR;
- full request identity;
- deterministic CBOR and cross-language vector source;
- semantic plan and backend capability coverage;
- attestation and production backend identity types;
- controller state and output credits;
- bounded D0 audit and SQLite D1 conformance authority;
- protocol framing and generated DTO pipeline;
- source snapshot, ChangeSet, disposition, and data-exposure IR;
- direct-QEMU candidate rendering without execution;
- Rust semantic-core mirror;
- bounded TLA+ controller model.

## Explicitly disabled

- VM start;
- tool override activation;
- workspace import/mutation;
- process execution;
- network or secret access;
- automatic apply, commit, push, or PR.

## Remaining evidence gate

The owner workstation must select and verify one backend against the exact TCB generation. Required evidence includes KVM/cgroup/systemd/Landlock facts, device and descriptor inventory, immutable root, boot challenge, controller-channel isolation, source import, fresh process-cell cleanup, disk/resource limits, p99 latency, PSI, and local voice/model interference.

Until that gate is accepted, `realExecutionEnabled` remains false and no standard tool is overridden.
