---
summary: "Accept bounded immutable local Pi extension generations with fresh-process activation; reserve first-class generation and transactional reload semantics for upstream Pi."
read_when:
  - "Implementing or reviewing Pi extension generation materialization, activation, rollback, leases, or upstream package-loader changes."
type: "adr"
status: "accepted"
---

# ADR: bounded immutable Pi extension runtime generations

Date: 2026-08-16  
Status: accepted architecture; implementation not authorized  
AK decision: 125  
RFC: `docs/project/2026-08-16-immutable-pi-extension-generations-rfc.md`

## Context

Current Pi local packages load directly from recorded source paths. npm and git packages use mutable fixed install roots. Current Pi has no package-generation API, package-use leases, package-root coordination, generation rollback ledger, or transactional reload.

Isolated experiments showed that exact local paths and quiescent filesystem pointer changes can be observed by fresh processes and reload, but also that:

- active cached imports do not make a temporarily absent dependency safe for fresh or lazy loading;
- npm reinstalls replace bytes at one managed destination;
- concurrent successful package installs can lose settings updates;
- install success does not prove that a package can load.

## Decision

Accept a bounded `pi-extensions` architecture for selected reproducibility-sensitive local packages:

1. materialize the complete source, local dependency, lock, generated-output, import, and peer closure in a dedicated runtime generation outside editable worktrees;
2. publish only after isolated verification;
3. activate exact generation package paths in one declared, quiescent settings scope;
4. preflight both scopes and refuse conflicting family identities;
5. use fresh-process activation as the supported path;
6. treat reload as experimental and require external zero-error, full-inventory, per-package provenance checks;
7. retain every published generation until Pi supplies host-owned leases or an equivalent proven quiescence mechanism;
8. use journaled, conditional compare-and-swap settings rollback;
9. keep first-class npm/git generations, host leases, package-root coordination, generation provenance APIs, and transactional reload in the upstream Pi owner surface.

A mutable `current` symlink is not the runtime identity. It may be an operator convenience only; Pi settings bind exact generation roots.

## Authorization boundary

This ADR accepts the architecture only.

It does not authorize:

- implementation;
- creation of an AK implementation task;
- live package installation or settings mutation;
- activation, reload, or live canary effects;
- deletion of any published generation;
- an upstream issue or code change.

A later explicit authorization must create a scoped AK task before implementation. That task must require a process-level concurrency regression proving that active G1 survives G2 installation and neighboring dependency churn, followed by fresh-process activation, externally supervised reload measurement, conditional rollback, and unmixed provenance.

## Consequences

### Positive

- Live packages can be separated from editable source and mutable package-local `node_modules`.
- Candidate build/install failure cannot affect an active generation when the contract is followed.
- Fresh-process selection and conditional rollback are feasible without changing Pi loader semantics.
- The design does not overstate current reload or garbage-collection safety.

### Costs and limits

- Published generations accumulate until upstream lease support exists.
- Activation requires one-scope ownership, cross-scope conflict checks, writer quiescence, and recovery journaling.
- Candidate extension loading remains trusted code unless verified inside an OS sandbox.
- Current Pi cannot promise an atomic live-runtime swap or first-class npm/git generation behavior.

## Upstream disposition

Record the semantic gap but do not open an upstream issue yet. Any future upstream proposal should cover staged immutable installs, prepare/validate/activate semantics, target locks, canonical generation snapshots, host-owned leases, provenance/rollback APIs, and transactional reload.
