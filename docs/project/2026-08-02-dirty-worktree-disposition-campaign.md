---
summary: "AK-4529 owner-aware disposition of pi-extensions dirty worktrees and local branches."
read_when:
  - "Reviewing the 2026-08-02 pi-extensions worktree/branch cleanup campaign."
  - "Explaining why retained worktrees or preservation refs were not deleted."
type: "evidence-note"
status: "completed"
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

Deviations and recoveries are recorded rather than hidden:

1. During Phase 1, one reviewer ran `git write-tree`. No ref, index, worktree, AK record, or settings changed, and no newly timestamped loose object was found; the command still violated the strict read-only protocol.
2. During Phase 2, one validation command initially ran from the dirty primary checkout rather than the clean integration worktree. ROCS rewrote four already-dirty generated ontology files to byte-identical content: the complete carrier digest remained `5a9b91cc51982793f0d19a32a2276ac9ac19837d7580009338fd05d1d972f43d`. Their mtimes changed; no cleanup or revert was attempted in the active checkout.
3. A separate validation run left the clean integration worktree with four generated ROCS files rewritten to worktree-local paths and ROCS version `0.2.1`. Their exact patch was retained owner-only as SHA-256 `fa02f464508d6a0254aa14cd7898783446d87bf1f532fd3725c1e655dfd667b8`, then the four session-generated files were restored to committed `HEAD` before capture. The integration worktree was clean at the cleanup membrane.
4. Archive capture exceeded one command window after 31 verified carriers. It resumed by verifying completed per-carrier archive manifests before finishing all 40. An initial bundle-head comparison then failed only on space-versus-tab normalization; no deletion had started. The normalized 41-ref comparison passed.
5. Cleanup exceeded one command window after 37 completed worktree/ref receipts. The resumable membrane validated capture identity, archive identity, exact live sets, and completed receipts, then finished the remaining three worktrees and branch-only ref. No carrier was marked complete before both worktree removal and expected-old-OID ref deletion read back successfully.

## Final results

Observed post-effect state:

- integration commit `fe785646b1e690eaba9812c3dbb46704c984971f` was pushed normally before cleanup;
- **40 worktrees removed**, leaving exactly **19**;
- **41 local branches deleted**, leaving exactly **14**;
- all **6 detached worktrees**, **16 `refs/preserve/ak-4263/*` refs**, `refs/pi-rewind/store`, and both notes namespaces remain;
- all **41 effect receipts** are completed: 40 worktree-plus-branch receipts and one branch-only receipt;
- every approved target path and local branch is absent on exact readback;
- no live Pi install, reload, publication, activation, settings rewrite, force-push, stale-history merge, or object pruning occurred.

Owner-only integrity anchors:

| Artifact | SHA-256 |
|---|---|
| phase-one worktree inventory | `cc72677a2576d4ef6f02d5b6f1d649795c2fb739d795cfbb649dbf8c06b851b5` |
| exact 40-target manifest | `1dbd8e96bc442a5a42845870ed6244fc20f319b5313e58f7958c19cfe2f0497e` |
| verified 41-ref branch bundle | `40d49d7345a74e946956f65d21d7e23b4b1936f00bb4fcc79a4cafe8e037459a` |
| capture-complete receipt | `85ce6acc55a3be7a33b1e5c3e0c1e998df9ad90dcb7b278ee836099839caf7f9` |
| cleanup-complete receipt | `0ade151e364e43a470add47188886afd2f9be9dceebed3906092d9cc6634b65d` |
| effect receipt array | `3e2e41afecfabdc10d7202cef63c181d00ff6563d136c81f8f2514eebd384b48` |
| receipt checksum manifest | `b28ec54f795b82a017d2027885b737c920b5e06b18c9401351ba6574af8dc6af` |

### Exact retained blockers

The 19-worktree / 14-branch floor remains truthful rather than cosmetically clean:

- the primary checkout remains active with 71 unstaged and 13 untracked paths;
- AK-4164 and AK-4390 remain failed, with their distinct dirty evidence carriers preserved;
- AK-4257 and AK-4368 remain pending;
- the AK-4081 safety carrier still has 559 staged paths;
- five detached live-runtime worktrees remain, including settings-bound packages under `pi-extensions-ee469a8e-r2` and observed source references to the `ee469a8e` runtime;
- detached `9982214e` remains protected by AK-4263 and its preserve ref;
- six autoresearch-owned carriers remain dirty or review-retained;
- the configured but missing `pi-extensions-26fd79e5` SCI source remains a settings/runtime blocker;
- detached live runtime `7c0b0126` grew from 8 to 16 untracked orchestrator diary files during the campaign and was preserved rather than normalized.

The receipt reports two phase-one carrier mismatches at close: the expected clean `main` mismatch caused by advancing from the opening commit to `fe785646`, and the active `7c0b0126` diary growth above. The clean authoritative `main` worktree had zero staged, unstaged, or untracked paths at cleanup completion.
