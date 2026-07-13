---
summary: "Independent current-track review of candidate-peer lifecycle v2 and approval of the emergency P0 destructive-cleanup hold."
read_when:
  - "Reviewing AK decision 59."
  - "Checking whether the emergency candidate cleanup hold is safe to land."
type: "review"
status: "changes_required"
---

# Candidate peer lifecycle review — 2026-07-13

## Decision scope outcome

**Lifecycle v2: CHANGES REQUIRED / review remains open.**

The first independent review found the resource-level RFC directionally sound but identified critical risks in the original P0 implementation: historical serialized packets could bypass new archive logic; untracked/ignored/HEAD drift was incomplete; archive verification and retry semantics were incomplete; duplicate-alias grouping had a TOCTOU gap; and archive permissions were not owner-only.

The RFC was clarified so:

- `deferred` returns to review and is never cleanup-eligible;
- `reconciled_missing` is terminal without archive/cleanup;
- only `accepted`, `rejected`, and `superseded` can progress toward archive/cleanup;
- physical identity uses canonical Git-common-dir/worktree identity with explicit relocation reconciliation.

Full lifecycle v2 still requires resource-level persistence, disposition binding, integration proof, locks/leases, terminal receipts, inventory/pressure UX, and rollout evidence before ADR acceptance.

## Emergency P0 outcome

**APPROVE.**

The revised P0 change is safe to land independently while decision 59 remains `review_pending`:

- every `execute: true` cleanup request returns before registry records are read or serialized commands can execute;
- dry-run only reads sidecars and constructs inventory; it does not invoke the command runner;
- historical unsafe v1 packets are therefore unable to perform destructive cleanup;
- prospective new-record archive packets preserve untracked bytes, block ignored files, compare pre/post tracked state, HEAD, path manifests, and untracked content digests;
- archive hashes, branch bundle, and compressed tar are verified before atomic `COMPLETE` publication;
- archive staging uses owner-only permissions;
- duplicate worktree aliases are surfaced in dry-run inventory;
- docs and tool descriptions state that destructive cleanup is held pending decision 59 and must not be bypassed manually.

## Validation evidence

- Focused candidate-peer tests: 14/14 passed during independent rereview.
- Full `pi-little-helpers` package gate: 100/100 passed, including lint, typecheck, structure, tests, and packaging checks.
- Repo docs strict check passed.
- File-budget warnings remain pre-existing/warn-only for oversized package files; this P0 safety change does not attempt that separate refactor.

## Boundaries

This review approves only the emergency destructive-cleanup hold and prospective archive hardening. It does not:

- accept lifecycle v2;
- authorize any candidate merge, promotion, deletion, process termination, or cleanup;
- turn registry metadata into AK/KES/evidence authority;
- resolve the 225 reviewed candidate resources automatically.
