---
summary: "AK-4533 semantic convergence and archive-backed retirement contract for the final retained pi-extensions carriers."
read_when:
  - "Reviewing why the retained 2026-08-02 worktrees and local branches can be retired."
  - "Reconstructing the semantic, runtime, or restoration evidence for AK-4533."
type: "evidence-note"
status: "active"
date: "2026-08-02"
---

# Retained-carrier final convergence — 2026-08-02

## Authority and evidence boundary

AK task **4533** owns the final convergence campaign. Its authoritative integration target is `main`, advanced only by normal push. The campaign may archive, sanitize, relocate, and remove the retained Git carriers, but it may not merge or replay unreviewed stale history, force-push, prune objects, publish packages, reload Pi, terminate the active Pi process, or mark adjacent pending/failed tasks complete.

Detailed NUL-safe inventories, process/settings snapshots, restoration-tested archives, protected-ref bundles, and resumable effect receipts are owner-only under:

```text
~/.local/state/pi-quests/worktree-disposition/pi-extensions-ak4533-20260802/
```

Those receipts prove observed cleanup effects; they do not replace AK task/evidence authority. This checked-in note records the durable semantic and execution contract. It intentionally does not predict receipt hashes or claim that destructive effects occurred before their verified receipts exist.

## Why a second campaign is required

AK-4529 reduced the repository from 59 worktrees and 55 local branches to a truthful preserve floor of 19 worktrees and 14 branches. That preserve decision was correct at the time: the remaining carriers included failed or pending task state, dirty forensic state, detached runtime roots, autoresearch candidates, a clean authoritative `main`, and settings-bound package paths.

AK-4533 re-reviewed that preserve floor against current owner contracts rather than treating ancestry, task state, or commit count as semantic proof. Useful behavior was reconstructed on current `main`; obsolete implementations remain evidence rather than executable source authority. The final target is exactly one clean worktree on `main` and no non-main local branch.

## Semantic coverage decisions

### Autoresearch continuation behavior

Current `main` now preserves the continuation contract that stale autoresearch candidates exposed:

- objective identity survives resume;
- the measurement contract and continuation arguments survive resume;
- automatically selected lanes retain their peer objectives;
- budgets and legacy snapshot compatibility remain explicit.

The recovery was reconstructed on current code and validated with focused package tests and isolated dogfood. The stale autoresearch worktrees therefore no longer own unique useful behavior; their patches are covered, superseded, or duplicated.

### Governed deep-review and persisted AK task IDs

The pending AK-4257 carrier exposed two residual regression risks. Current `main` now:

- rejects a standalone raw `/deep-review` before ordinary prompt-template expansion;
- rechecks expanded template content so wrappers cannot bypass governed Vault execution;
- recognizes newline-delimited invocations;
- preserves normal ordinary-template behavior;
- accepts persisted AK task IDs such as `4257` without applying a loop-count ceiling, while rejecting invalid numeric identities.

Focused tests, the package quality gate, packed-artifact dogfood, and independent review cover these changes. Removing the Git carrier does **not** complete AK-4257; its task lifecycle remains owner-controlled.

### Adaptive portfolio execution

Adaptive-portfolio planning remains a current requirement, but the failed AK-4164 execution scaffolds are not lawful runtime implementations. Current ASC does not enforce a symlink-safe read scope across every read-capable surface and does not reserve/decrement a hard provider-turn budget before each model request. Retrospective usage observation and prompt-level path metadata cannot satisfy those requirements.

Consequently:

- do not recover or activate the old adaptive execute paths;
- retain the requirement as planning/design truth;
- require ASC-owned enforcement and attestations before a future orchestrator adapter can execute;
- do not treat Vault binding identity as a substitute for runtime enforcement.

Removing the stale carriers preserves their restoration evidence and leaves AK-4164 failed; it does not fabricate implementation or completion.

### Failed D2E binding and forensic carriers

The AK-4390 D2E carrier is obsolete against the current producer/Decision-100 contract. The dirty primary checkout and AK-4081 safety carrier were independently falsified for missing unique useful semantics; the AK-4081 staged index reproduces a historical tree. Their bytes still require restoration-tested archives before sanitation or removal, but they are not integration sources.

AK-4390 remains failed, and AK-4081 retains its recorded task history. Git-carrier retirement is not lifecycle rewriting.

### Detached runtime diaries and KES candidates

The five detached runtime worktrees contain no untracked source files. They contain 83 runtime diary files and four KES candidates. All 87 files must be preserved with collision-aware paths and checksums before worktree deletion.

The four candidates route to their owner surfaces:

1. repository-admission and atomic-reporting heuristics → workstation/shell owner;
2. OutputAccumulator `EDQUOT` containment → Pi host owner;
3. AK-4170 drift preflight/preservation lesson → Agent Kernel owner;
4. source-list invocation posture → `pi-context-packer` owner.

Two unrelated learning candidates share a filename, so a flat copy would be lossy. The archive keeps worktree identity in the path and records object digests. Archival is preservation, not KES promotion or owner acceptance.

## Settings and live-runtime membrane

The final settings state uses canonical package paths under:

```text
~/ai-society/softwareco/owned/pi-extensions/packages/
```

This replaces the missing SCI live-worktree path, settings-bound `ee469a8e-r2` paths, and any remaining package sources rooted in cleanup carriers. Every replacement must resolve to an existing package manifest. The exact pre-change settings file, mode, digest, generated replacement, post-change digest, and rollback copy belong in the owner-only receipts.

No `/reload` is authorized for this campaign. Existing native module mappings may legally remain mapped after Linux unlinks their old worktree files; that is not evidence of a future load path. A removal is blocked by any target-root process cwd, root, open file descriptor, or command-line reference. Map-only references are recorded and allowed only for detached Pi live-runtime worktrees after settings point future loads to canonical paths. The active Pi process must not be terminated.

The primary checkout retains its active `.ontology/` runtime database on disk. `.ontology/` is locally excluded through shared Git metadata because it is runtime/cache state, not source truth. Sanitation restores tracked paths and removes archived untracked paths while leaving that ignored runtime state in place.

## Archive and cleanup membrane

Before the first destructive effect:

1. freeze every carrier identity from HEAD, branch/detached state, porcelain-v2 status, staged patch, unstaged patch, and content-aware untracked manifest;
2. inventory staged, unstaged, untracked, and ignored roots with NUL-safe path lists;
3. archive binary patches plus every non-reconstructable untracked or ignored object;
4. restoration-test the combined carrier in a disposable clone;
5. preserve all local heads and protected refs in a verified Git bundle;
6. recheck protected refs, owner registries, AK lifecycle states, settings digest, process references, and authoritative remote `main`;
7. fail closed on any drift.

Each worktree/ref effect uses an `authorized` receipt before mutation and a `completed` receipt only after exact readback. Local branch deletion uses `git update-ref -d <ref> <expected-old-oid>` compare-and-swap semantics. The scripts are resumable from receipts and must reject an unreceipted missing carrier.

The cleanup order is constrained:

1. migrate settings to canonical package paths;
2. archive and sanitize the primary checkout while retaining ignored runtime state;
3. remove ordinary stale worktrees and their branch refs;
4. make the primary checkout the clean `main` worktree at the authoritative commit;
5. remove the former clean-main worktree;
6. remove map-only detached runtime roots, with `ee469a8e-r2` last;
7. verify one registered worktree, one local branch named `main`, unchanged protected refs, canonical settings, a clean worktree, and agreement among local `main`, `origin/main`, and remote `main`.

No Git object pruning is part of cleanup. `refs/preserve/ak-4263/*`, `refs/pi-rewind/*`, and notes refs remain unchanged even when their former worktrees disappear.

## Validation contract

The semantic recovery is not established by cleanup itself. Required evidence includes:

- focused package tests and package quality gates for each recovered cohort;
- packed-artifact or equally isolated dogfood for executable recovery;
- canonical root CI and strict documentation validation on authoritative `main`;
- independent adversarial review of semantic coverage and cleanup tooling;
- exact post-effect Git, settings, process, archive, and restoration receipts.

The packed `pi-little-helpers` dogfood specifically proves raw deep-review rejection, wrapper rejection, and persisted task ID `4257`. The autoresearch recovery has separate continuation and dogfood evidence. Passing these gates authorizes semantic disposition; it does not authorize publication, live activation, or adjacent task completion.

## Final interpretation rule

The desired topology is operational hygiene, not semantic proof. A carrier is eligible for retirement only because current behavior was implemented and verified, or because independent review classified it as obsolete, superseded, rejected, duplicated, or purely reconstructable runtime state **and** its non-reconstructable bytes have a restoration-tested archive.

Final completion is established only when AK-4533 records the verified receipt anchors and close-check passes. Until then, this document is the checked-in convergence contract, not a completion claim.
