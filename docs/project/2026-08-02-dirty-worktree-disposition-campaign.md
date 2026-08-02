---
summary: "AK-4529 owner-aware disposition of pi-extensions dirty worktrees and local branches."
read_when:
  - "Reviewing the 2026-08-02 pi-extensions worktree/branch cleanup campaign."
  - "Explaining why retained worktrees or preservation refs were not deleted."
type: "evidence-note"
status: "executing"
date: "2026-08-02"
---

# Dirty worktree disposition campaign — 2026-08-02

## Authority and boundary

AK task **4529** owns this campaign. `main` and `origin/main` agreed at opening on `b3326a78c20c2d3f94a67dee0e7aa93a39b363bb`.

The operator authorized semantic recovery, normal push, archive-backed cleanup, and local branch/worktree deletion. The campaign does not authorize a stale-history merge, reset, rebase, force-push, live Pi install, reload, publication, activation, settings rewrite, evidence-ref deletion, or Git object pruning.

Detailed NUL-safe path manifests, before-state digests, local archive members, discard declarations, and effect receipts are kept owner-only under:

```text
~/.local/state/pi-quests/worktree-disposition/pi-extensions-ak4529-20260802/
```

The local receipt is operational evidence, not AK authority. Final receipt hashes and counts are recorded below after execution.

## Opening inventory

- 59 registered worktrees
- 55 local branches
- 6 detached HEADs
- 16 `refs/preserve/ak-4263/*` refs
- authoritative target: `b3326a78c20c2d3f94a67dee0e7aa93a39b363bb`

Every worktree received a HEAD/branch relationship check, staged/unstaged/untracked inventory, SHA-256 status and patch digests, current-main comparison, owner/task lookup where available, and liveness/settings review. Duplicate histories and dirty variants were grouped without treating equal HEADs as equal working-tree content.

## Integrated cohorts

### AK-4001 lifecycle closeout facts

The branch-only `integration/ak-4001-v1-archive-review` contained useful closeout facts absent from current main. Those facts were recreated in the current lifecycle reconciliation and RFC documents; its stale 87-commit history was not merged.

### Better OpenAI provider wildcard

The reviewed candidate allowed `openai-codex/*`, but its copied integration test mixed a Codex model with an exact OpenAI-only fixture. The current-main implementation therefore re-created the behavior rather than copying the stale patch:

- provider equality remains mandatory;
- only model id `*` acts as a wildcard;
- exact keys still reject same-provider sibling models;
- default support is `openai-codex/*`;
- docs and package tests describe the same contract.

### Vault source parity recheck

A proposed `pi-vault-client/src/vaultDb.ts` recovery was not applied. Exact target recheck showed current main already contains the guarded array normalization. The dirty primary checkout differed only by removing explicit callback type annotations, so there was no useful missing behavior to recover.

## Cleanup set

Independent reviewers approved cleanup, after owner disposition and archive capture, for:

1. 15 completed ASC/release candidate worktrees;
2. 18 completed autoresearch/orchestrator candidate worktrees under the legacy quest root;
3. merged PR56;
4. two redundant PR62 integration carriers while retaining the failed AK-4390 owner carrier;
5. the superseded AK-4149 SCI ablation harness;
6. the historical source-publication carrier;
7. the superseded AK-3970 reconciliation carrier;
8. the source benchmark whose dirty state deletes its entire 2,327-path tracked set;
9. branch-only `integration/ak-4001-v1-archive-review` after the useful facts land.

The expected cleanup effect is **40 worktrees and 41 local branches**.

## Mandatory preserve set

The truthful target floor is **19 worktrees and 14 local branches**. Preserve:

- clean authoritative `main`;
- the active dirty primary checkout and `safety/pre-integrate-local-main-20260801-ba56c093`;
- failed AK-4164 carriers (`task/4164-adaptive-runtime`, `task/4164-nexus`);
- failed AK-4390 carrier `work/task-4390-d2e-binding`;
- pending AK-4257 branch `task/4257-nexus`;
- pending AK-4368 carrier `task/4368-level5-portfolio`;
- the 559-staged-path AK-4081 carrier and safety branch;
- all five detached live-runtime worktrees;
- detached `9982214e`, because AK-4263 retains it and independent deletion reviews conflicted;
- six autoresearch-owned worktrees/branches with explicit preserve-for-review semantics;
- every AK-4263 preserve ref, `refs/pi-rewind/store`, and both notes namespaces.

The configured but missing `pi-extensions-26fd79e5` SCI path is a settings/runtime blocker, not cleanup permission for its preservation ref.

## Cleanup membrane

For each cleanup target:

1. recheck exact HEAD, branch OID, status digest, settings references, and process cwd/cmdline;
2. record all staged, unstaged, untracked, and ignored-root paths;
3. archive binary patches and untracked bytes with checksums;
4. record explicit discard of reconstructable ignored dependency/cache roots;
5. restoration-check archived untracked bytes and verify any unique-history bundle;
6. recheck the carrier digest;
7. remove the exact linked worktree;
8. delete the branch only with expected-old-OID compare-and-swap;
9. append and checksum the effect receipt.

Any drift or owner conflict stops that carrier without widening cleanup.

## Independent review

Read-only reviews covered every proposed integration and deletion. High-signal conclusions:

- all legacy ASC candidates are integrated, superseded, or correctness-inferior to current main;
- all 18 legacy autoresearch/orchestrator candidates are integrated or losing alternatives;
- six separate autoresearch control copies remain automation-owned and are preserved;
- PR62 merge history is duplicated by the retained AK-4390 carrier and an origin archive ref;
- AK-4081, active runtime roots, preservation refs, and failed/pending tasks are not cleanup-eligible.

## Execution notes

Two deviations are recorded rather than hidden:

1. During Phase 1, one reviewer ran `git write-tree`. No ref, index, worktree, AK record, or settings changed, and no newly timestamped loose object was found; the command still violated the strict read-only protocol.
2. During Phase 2, one validation command initially ran from the dirty primary checkout rather than the clean integration worktree. ROCS rewrote four already-dirty generated ontology files to byte-identical content: the complete carrier digest remained `5a9b91cc51982793f0d19a32a2276ac9ac19837d7580009338fd05d1d972f43d`. Their mtimes changed; no cleanup or revert was attempted in the active checkout.

## Final results

Execution pending. This section is updated only from verified local receipts and post-effect Git readback.
