---
summary: "Crystallized lessons from implementing and dogfooding immutable Pi extension runtime generations (AK-4820 / decision 125)."
read_when:
  - "Building generationed/atomic activation systems for Pi packages or similar plugin hosts."
  - "Designing settings-level rollback, publish-last artifacts, or crash-recoverable locks."
type: "learning"
source: "AK task 4820; decision 125; evidence docs/project/2026-08-16-immutable-pi-extension-generations-dogfood-evidence.md"
---

# Learning: immutable extension generations that actually survive review

## What worked

1. **Exact-commit, commit-backed inputs are the foundation.** Planning from `git cat-file`/tree data — never the working tree — eliminated the dirty-checkout provenance problem that invalidated early designs. Every generation ID is commit + input digest.

2. **Publish-last with atomic hard-link of a fully written temp marker.** The first design created the final marker then wrote it, exposing partial files and unrecoverable half-published generations. Writing the complete temp, fsyncing, then hard-linking made crash states recoverable and EEXIST collisions safe.

3. **Test adversaries found the real bugs, not the happy path.** Independent review/testing cycles caught, in order: in-process-only crash tests (real SIGKILL needed), symlinked state-root pre-effect mutation, opaque npm/git sources bypassing family checks, probe accepting partial extension inventory, tampered retained markers passing recovery, journal path traversal via unvalidated transactionId, and crafted self-consistent plans bypassing replanning. Each became a regression before dogfood.

4. **First-slice denial beats partial generalization.** The largest residual risk was accepting packages with runtime/optional dependencies while skipping `node_modules` attestation. Rejecting non-empty dependency sets outright kept the no-install canary claim exactly matched to evidence. The neighboring `file:` churn requirement was satisfied by a synthetic fixture inside the harness, not by broadening production support.

5. **Settings-level atomicity is scoped honesty, not a runtime transaction.** Exact generation paths in one private scope + journaled CAS rollback + fresh-process proof is the strongest truthful claim with current Pi. Reload was proven observational: old runner invalidated before new load, and partial extension sets are possible — so the evidence states that explicitly.

6. **Probe receipts must carry process-bound identity.** Adding PID, argv, timestamps, close result, and canonical host executable SHA-256 turned "we ran Pi" into checkable evidence. Exact expected inventory (selected command + pinned inline commands) caught Pi's inline `llama` command, which naive provenance checks rejected.

## What was deferred deliberately

- Host-owned package-use leases and published-generation GC (requires upstream Pi).
- Transactional reload (current Pi invalidates the old runner first).
- npm/git managed-source generations (upstream install roots are mutable/in-place).
- Runtime-dependency closure attestation (deny-by-default in slice 1).

## Reusable rules

- Never let a planner's output be the only authority at materialization: replan and require canonical equality before effects.
- Validate every identifier before it becomes a filename (UUID check + containment for journal history).
- Concurrency claims need explicit barriers and structured traces, not "minimum N iterations while a promise runs."
- Isolated HOME is not a sandbox: extension factories execute arbitrary code; call this out in every evidence note.
- CI lanes needing a real host binary must provision it explicitly (`PI_GENERATION_TEST_PI` gate + pinned workflow), or default CI silently tests nothing.
