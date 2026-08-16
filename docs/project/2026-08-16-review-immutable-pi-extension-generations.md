---
summary: "Independent architecture review and owner disposition for immutable Pi extension runtime generations."
read_when:
  - "Reviewing decision 125 or the immutable Pi extension generation RFC."
type: "review_memo"
---

# Review: immutable Pi extension runtime generations

Date: 2026-08-16  
Decision: AK decision 125  
Reviewed RFC: `docs/project/2026-08-16-immutable-pi-extension-generations-rfc.md`  
Reviewed RFC SHA-256: `0b8c6c3557e925fb327f1988e4aa8fbf8e7641c51603399906a20134688d649a`  
Outcome: `ready_for_adr`

## Review scope

An independent read-only review checked the RFC against current Pi package-manager, resource-loader, extension-loader, and reload behavior. It covered:

- local/npm/git install locations and mutation behavior;
- local package identity across user and project settings;
- complete `file:`/lock/build closure;
- install and settings coordination;
- extension-load diagnostics and partial reload;
- package-use leases and generation retention;
- rollback and crash-recovery claims;
- fresh-process, reload, provenance, and concurrency verification;
- realistic hardening versus unnecessary complexity.

The review did not modify Pi, package settings, package roots, or live `node_modules`.

## Findings resolved in the RFC

The first review required corrections before acceptance:

1. exact G1 and G2 paths are distinct Pi package identities, so activation must own one settings scope and reject conflicts in the other;
2. reload may continue with a partial extension set, so fresh-process activation must be primary and reload externally supervised;
3. isolated Pi settings are not an OS sandbox for extension factories;
4. materialization must cover manifest, lockfile, installed-link, generated-output, import, and peer closure;
5. published generations cannot be deleted safely without host-owned leases or proven global quiescence;
6. settings activation requires a recovery journal, interoperable coordination or writer quiescence, and conditional compare-and-swap rollback.

The revised RFC resolves these findings. Re-review found no remaining blockers.

## Feasibility disposition

- **Feasible with current Pi:** bounded local-package generation selection for one quiescent settings scope, using exact immutable generation paths and fresh-process activation.
- **Experimental only with current Pi:** reload into a generation, because the old runner is invalidated before the new set is proven complete and extension-load errors may be non-fatal diagnostics.
- **Requires upstream Pi changes:** first-class npm/git generations, cross-process package locks, host-owned leases, safe published-generation garbage collection, generation provenance APIs, and transactional reload/rollback.

## Owner disposition

The repository owner selected:

- accept bounded local fresh-process generations and route first-class semantics upstream;
- record architecture only, with no implementation authorization and no AK implementation task;
- record the upstream semantic gap without opening an upstream issue yet.

## Legal next move

Record the ADR for decision 125. Do not create an implementation task, modify live package roots, edit settings, reload for activation, or open an upstream issue under this decision step.
