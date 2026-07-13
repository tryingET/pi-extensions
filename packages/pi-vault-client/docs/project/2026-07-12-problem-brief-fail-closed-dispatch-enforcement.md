---
summary: "Problem brief for turning pi-vault-client dispatch posture from advisory classification into fail-closed execution authorization."
read_when:
  - "Reviewing Prompt Vault execution safety or dispatch ownership."
  - "Implementing the fail-closed dispatch-enforcement wave."
type: "problem-brief"
system4d:
  container: "Prompt Vault preparation and dispatch boundary inside pi-vault-client."
  compass: "A governed template must execute only through its declared control mode and verified binding."
  engine: "Identify every ingress -> classify against governed metadata -> authorize exact identity -> dispatch or block -> correlate receipts."
  fog: "The current classifier can be mistaken for enforcement while raw-text paths remain available."
---

# Problem Brief — Fail-Closed Prompt Vault Dispatch Enforcement

## Trigger

`pi-vault-client` can classify templates through `vault_dispatch_check`, but the package does not enforce that posture at every execution ingress. A template declared as a loop or workflow can still be prepared and submitted as ordinary prompt text through command, live-trigger, or headless prompt-plane paths.

This is an architecture-significant gap because the package presents governed control metadata while execution behavior remains partly advisory.

## Current reality

The package currently has three partially separated planes:

1. **retrieval and preparation** — visibility-aware lookup and package-owned rendering;
2. **dispatch classification** — `text_ok`, orchestrator loop/workflow requirements, and missing-binding diagnostics;
3. **execution ingress** — `/vault`, live `/vault:`, prompt-plane continuations, and downstream consumers.

The first two are mature enough to support enforcement, but the third does not consistently consume the second.

Specific observed failures:

- missing requested templates can produce aggregate `status: "ready"`;
- only exact known `control_mode` values gate, while unknown/future metadata can fall through to `text_ok`;
- binding records are mutable through returned nested objects and public registration;
- authorization is not bound to template ID/version/content, company context, binding-registry version, or execution surface;
- prompt-plane candidates expose executable text without a mandatory execution disposition;
- package receipts prove preparation/send-time identity, not orchestrator execution outcome;
- native/projected prompt invocation can bypass package command wiring unless gated templates are excluded or carry an enforceable host seam.

## Desired reality

Every package-owned execution ingress consumes one package-owned authorization decision immediately before execution.

The decision is a discriminated union:

- `text_ready` — ordinary text execution is lawful;
- `dispatch_required` — execution must use an exact verified orchestrator binding;
- `blocked` — no execution is lawful.

`ready` means all requested templates are present, visible, active, semantically valid, identity-bound, and executable through the returned disposition. Unknown metadata, partial batches, absent bindings, drift, and unsupported surfaces fail closed.

## Authority boundary

- Prompt Vault and `pi-vault-client` own governed template metadata, preparation, dispatch authorization, and authorization receipts.
- The orchestrator/launcher that actually executes a loop or workflow owns runtime lifecycle and outcome receipts.
- AK owns decision, task, direction, evidence, and implementation-wave lineage; it does not become the prompt runtime.
- ROCS owns ontology and controlled-semantic validation; this package consumes versioned semantics rather than inventing them.
- Company resolution in this local client is cooperative governance context, not authenticated multi-tenant authorization.

## Why now

The dispatch-check seam is public and can be read as a safety boundary. Leaving it advisory creates a false-confidence risk greater than an explicit absence of enforcement. This should be corrected before extracting broader shared run contracts, because the Vault boundary carries executable governance semantics and provenance obligations that must remain owner-specific.

## Required decision

Choose whether `pi-vault-client` will:

1. enforce dispatch posture through one exact, versioned authorization contract at every package-owned ingress; or
2. explicitly downgrade dispatch posture to advisory metadata and remove enforcement-like claims.

The recommended direction is option 1.

## Non-goals

This decision does not:

- turn local company context into authentication;
- move orchestrator lifecycle ownership into `pi-vault-client`;
- make AK the prompt runtime;
- create a universal agent-run contract package;
- authorize Prompt Vault schema mutation;
- claim the package can prevent a hostile local process from bypassing its APIs and reading the underlying database directly.
