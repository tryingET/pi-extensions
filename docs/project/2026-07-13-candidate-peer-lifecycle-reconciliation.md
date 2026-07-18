---
summary: "One-by-one reconciliation of the candidate-peer registry census and the process correction required before cleanup."
read_when:
  - "Reviewing candidate worktrees for promotion, preservation, rejection, reconciliation, or cleanup."
  - "Changing candidate-peer lifecycle or cleanup behavior."
type: "evidence-note"
---

# Candidate peer lifecycle reconciliation — 2026-07-13

## Status

This is a read-only review result for **302 registry records representing 225 distinct worktrees**. It is not promotion or deletion authority. No worktree, branch, process, registry record, archive, or candidate commit was changed during this census. Refresh a row immediately before acting because live lanes can drift after capture.

Before the emergency spawn hold was installed, concurrent sessions increased the registry to **308 records** and storage to approximately **143 GB**. The 225-row table remains the completed review snapshot; the six later records require the same resource-level inventory/reconciliation process rather than being silently folded into this evidence.

Canonical execution authority for the remediation is AK task **3927**. The registry remains operational metadata, not task/evidence/decision authority.

## Lifecycle-v2 execution closeout

The historical table below remains the immutable review snapshot. Execution subsequently completed through lifecycle v2 against a fresh inventory captured at `2026-07-13T18:02:17.590Z`:

- **309 peer-run aliases** grouped into **226 physical resource generations**;
- **129 resources / 201 aliases** reached terminal `cleaned` after refreshed review, owner disposition, exact integration proof when accepted, isolated restoration-tested archive, separate expiring authorization, and exact worktree/branch effect receipts;
- **69 resources / 74 aliases** reached terminal `reconciled_missing` after per-resource path/ref/object/archive investigation. This includes the original 67 missing resources plus two FCOS resources that disappeared after review; absence was recorded as loss/risk, never inferred as successful cleanup;
- **28 resources / 34 aliases** remain intentionally `deferred`, each bound to a named owner, concrete action, exact reviewed generation, and `2026-07-20` review date. These are the surviving preserve cohort; no unreviewed or implicitly abandoned registered resource remains;
- all **22 original ACCEPT resources** were integrated and validated against immutable target OIDs before cleanup: DSPx open-decision work, 17 pi-extensions source-metadata tips, two pi-snapshot-edit fixes, the context-packer ablation harness, and SCI structural-evidence receipt v1;
- the one physical resource added after the original 225-resource review was independently reviewed, restoration-archived, authorized, and cleaned. The other six later registry records were aliases of already reviewed resources;
- the controller-captured per-resource `du -sb` ledger totals **130,555,973,628 bytes (121.59 GiB) reclaimed**. The 28 retained registered generations occupy **3,543,868,084 bytes (3.30 GiB)**. Seven preserved cohort capture tables deterministically reconcile to all 157 cleaned/deferred resources; terminal resource records do not themselves store footprint bytes. Lifecycle-v2 restoration archives occupy approximately **2.1 GiB** and remain owner-only;
- current registered-resource states sum exactly to 226: `129 cleaned + 69 reconciled_missing + 28 deferred`.

Canonical local operational evidence:

- inventory: `~/.local/state/pi-quests/candidate-lifecycle-v2/inventory-2026-07-13.json`;
- resource records/events: `~/.local/state/pi-quests/candidate-lifecycle-v2/resources/<resource-id>/`;
- restoration archives: `~/.local/state/pi-quests/candidate-lifecycle-v2/archives/<resource-id>/<generation-id>/`;
- cohort authorization and terminal summaries: `~/.local/state/pi-quests/candidate-lifecycle-v2/cohorts/`;
- final 226-resource aggregate, authorization, terminal, controller-captured footprint ledger/provenance, seven cohort measurement sources, and checksum manifest: `~/.local/state/pi-quests/candidate-lifecycle-v2/cohorts/final-2026-07-13/`;
- active admission hold: `~/.local/state/pi-quests/candidate-spawn.HOLD.json`.

The remaining bytes under the broad `pi-quests/worktrees/` directory include the 28 deliberately retained registered candidates plus paths not represented by this 309-alias candidate registry. They were not silently classified or deleted by this task.

## Census

| Recommended disposition | Worktrees | Meaning |
|---|---:|---|
| `ACCEPT` | 22 | Coherent candidate worth scoped integration and validation. |
| `REJECT` | 10 | Superseded/losing candidate; archive its evidence, then clean. |
| `PRESERVE` | 30 | Unique, dirty, stale, or active work requiring owner review. |
| `ARCHIVE+CLEAN` | 93 | No unique value remains; archive losslessly, verify, then remove exact worktree/branch. |
| `BLOCKED` | 3 | Would otherwise be cleanup-ready, but current process/activity evidence blocks action. |
| `RECONCILE` | 67 | Worktree is already missing; record what is recoverable/lost and terminally reconcile the registry. |

Observed defects:

- 77 duplicate registry records alias reused physical worktrees.
- 67 registered worktrees are already missing.
- Current cleanup archives omit untracked file bytes; verified historical loss already occurred.
- Registry v1 has launch state but no mandatory disposition, archive, integration, or terminal reconciliation state.
- Some `repoRoot` values point at transient candidate worktrees or `/tmp` repositories.
- Cleanup eligibility is not bound to a reviewed HEAD/status digest and durable fan-in disposition.
- The worktree store consumed approximately 142 GB at capture time.

## Mandatory process correction

Before bulk cleanup, the owner implementation must:

1. Model one physical candidate resource with multiple peer-run attempts instead of one cleanup owner per run.
2. Require an explicit disposition (`accepted`, `rejected`, `superseded`, `deferred`, or `reconciled_missing`) bound to repository identity, branch, HEAD, and status digest.
3. Archive every non-reconstructable byte, including untracked files, or record explicit path-level discard approval; write a manifest, hashes, verification result, and atomic completion marker.
4. Refuse cleanup for dirty/unique/active/drifted candidates, duplicate aliases, incomplete archives, or stale review bindings.
5. Prove accepted work is integrated through an exact target commit/patch relationship before cleanup.
6. Keep promotion and deletion separate: candidate review never silently merges, and successful integration never silently deletes.
7. Surface an inventory command/dashboard and warn or block new spawning when unresolved candidate pressure exceeds an owner-set threshold.
8. Persist terminal lifecycle receipts so a missing worktree is not forever reported as an unresolved live candidate.

## One-by-one worktree review

Rows mentioning multiple registry aliases must be archived as one physical resource with every alias retained. Exact peer ids remain in the registry sidecars.

| Owner | Worktree | HEAD | Disposition | Review evidence |
|---|---|---|---|---|
| agent-kernel | iw14b-ak-b0-task-3809 | 09081509 | ARCHIVE+CLEAN | All candidate commits are patch-equivalent to current main. |
| agent-kernel | iw14b-b1-ak-integration-3826 | 5e6888a6 | ARCHIVE+CLEAN | All candidate commits are patch-equivalent to current main.; 2 registry aliases |
| agent-kernel | iw14b-b1-ak-task-3813 | b0c1f1ed | ARCHIVE+CLEAN | All candidate commits are patch-equivalent to current main.; 3 registry aliases |
| agent-kernel | iw14b-b2-ak-3832 | d9164ace | ARCHIVE+CLEAN | All candidate commits are patch-equivalent to current main. |
| agent-kernel | iw14b-b2-ak-integration-3845 | 047f8a2d | ARCHIVE+CLEAN | All candidate commits are patch-equivalent to current main. |
| agent-kernel | iw14b-b3-ak-3854 | 406b87ac | ARCHIVE+CLEAN | All candidate commits are patch-equivalent to current main.; 2 registry aliases |
| agent-kernel | iw14b-b3-ak-integration-3884 | cbec9b1e | ARCHIVE+CLEAN | All candidate commits are patch-equivalent to current main. |
| agent-kernel | iw14b-b4-ak-3908 | 0d82119b | ARCHIVE+CLEAN | All candidate commits are patch-equivalent to current main.; 3 registry aliases |
| agent-kernel | iw14b-b4-selection-3893 | f9209481 | ARCHIVE+CLEAN | All candidate commits are patch-equivalent to current main.; 3 registry aliases |
| cleanup dogfood temp repo | candidatepeer-create-a-tiny-candidate-change-for-cleanup-registry-dog-b22dd665e7 | - | RECONCILE | Dogfood worktree is gone; archive omitted its untracked candidate file, which is unrecoverable. |
| dep-diet | fcos-revalidate-depdiet | - | RECONCILE | Read-only revalidation worktree is gone; owner commit/artifact receipt remains verifiable. |
| dep-redteam | fcos-revalidate-depred | - | RECONCILE | Read-only revalidation worktree is gone; owner commit/artifact receipt remains verifiable. |
| dep-viz | fcos-revalidate-depviz | - | RECONCILE | Read-only revalidation worktree is gone; owner commit/artifact receipt remains verifiable. |
| dspx | dspx-3577-a-combined-lane | a42a993a | ARCHIVE+CLEAN | Candidate content is patch-equivalent or already represented on current main. |
| dspx | dspx-3577-b-adjacent-fixtures | 47cf7dfe | PRESERVE | Distinct coherent experiment remains unlanded but stale; rebase and remeasure before selection. |
| dspx | dspx-3577-c-dataset | 8e2de254 | PRESERVE | Distinct coherent experiment remains unlanded but stale; rebase and remeasure before selection. |
| dspx | dspx-3577-d-module-corpus | 559bcf82 | PRESERVE | Distinct coherent experiment remains unlanded but stale; rebase and remeasure before selection. |
| dspx | dspx-3577-e-a-plus-c | da8b8dc0 | REJECT | Composition adds no value beyond retained lane, or early dirty xdist work is superseded by current test infrastructure. |
| dspx | dspx-artifact-envelope | - | RECONCILE | Worktree/branch/archive are absent; record terminal missing-resource reconciliation. |
| dspx | dspx-ci-release | - | RECONCILE | Worktree/branch/archive are absent; record terminal missing-resource reconciliation. |
| dspx | dspx-execution-replay | - | RECONCILE | Worktree/branch/archive are absent; record terminal missing-resource reconciliation. |
| dspx | dspx-runtime-object-decomposition | - | RECONCILE | Worktree/branch/archive are absent; record terminal missing-resource reconciliation. |
| dspx | dspx-semantic-benchmarks | - | RECONCILE | Worktree/branch/archive are absent; record terminal missing-resource reconciliation. |
| dspx | dspx-test-xdist-readiness | 32c47eaa | REJECT | Composition adds no value beyond retained lane, or early dirty xdist work is superseded by current test infrastructure. |
| dspx | iw14b-b1-dspx-task-3823 | f01dbe3f | ARCHIVE+CLEAN | Candidate content is patch-equivalent or already represented on current main.; 3 registry aliases |
| dspx | iw14b-b2-dspx-3836 | e46eb1c7 | ARCHIVE+CLEAN | Candidate content is patch-equivalent or already represented on current main. |
| dspx | iw14b-b3-dspx-3869 | b47788bf | ARCHIVE+CLEAN | Candidate content is patch-equivalent or already represented on current main. |
| dspx | iw14b-b4-dspx-3915 | 834a0b47 | ACCEPT | Scoped open-decision family commit is coherent and validated; rerun focused evidence before promotion. |
| dspx | iw14b-dspx-b0-task-3803 | 72b66dca | ARCHIVE+CLEAN | Candidate content is patch-equivalent or already represented on current main.; 2 registry aliases |
| dspx | source-metadata-dspx | 82975326 | ARCHIVE+CLEAN | Candidate content is patch-equivalent or already represented on current main. |
| dspx (mis-rooted) | source-metadata-00 | d85d3bb2 | ARCHIVE+CLEAN | Mis-rooted metadata shard is contained in the landed aggregate; repair owner-root metadata during cleanup. |
| dspx (mis-rooted) | source-metadata-01 | ab9cfea1 | ARCHIVE+CLEAN | Mis-rooted metadata shard is contained in the landed aggregate; repair owner-root metadata during cleanup. |
| dspx (mis-rooted) | source-metadata-02 | c8b6038f | REJECT | Shard was deliberately omitted or replaced by a parser-corrected aggregate already landed. |
| dspx (mis-rooted) | source-metadata-03 | 7f0b4e35 | ARCHIVE+CLEAN | Mis-rooted metadata shard is contained in the landed aggregate; repair owner-root metadata during cleanup. |
| dspx (mis-rooted) | source-metadata-04 | 8f9e64d7 | ARCHIVE+CLEAN | Mis-rooted metadata shard is contained in the landed aggregate; repair owner-root metadata during cleanup. |
| dspx (mis-rooted) | source-metadata-05 | cba97e78 | ARCHIVE+CLEAN | Mis-rooted metadata shard is contained in the landed aggregate; repair owner-root metadata during cleanup. |
| dspx (mis-rooted) | source-metadata-06 | 4fd5d65a | ARCHIVE+CLEAN | Mis-rooted metadata shard is contained in the landed aggregate; repair owner-root metadata during cleanup. |
| dspx (mis-rooted) | source-metadata-07 | fa1bd61b | ARCHIVE+CLEAN | Mis-rooted metadata shard is contained in the landed aggregate; repair owner-root metadata during cleanup. |
| dspx (mis-rooted) | source-metadata-08 | 9d0898b9 | ARCHIVE+CLEAN | Mis-rooted metadata shard is contained in the landed aggregate; repair owner-root metadata during cleanup. |
| dspx (mis-rooted) | source-metadata-09 | 4dec5037 | REJECT | Shard was deliberately omitted or replaced by a parser-corrected aggregate already landed. |
| dspx (mis-rooted) | source-metadata-09b | 381843a2 | ARCHIVE+CLEAN | Mis-rooted metadata shard is contained in the landed aggregate; repair owner-root metadata during cleanup. |
| dspx (mis-rooted) | source-metadata-10 | 42743684 | ARCHIVE+CLEAN | Mis-rooted metadata shard is contained in the landed aggregate; repair owner-root metadata during cleanup. |
| dspx (mis-rooted) | source-metadata-11 | 881cfbcb | ARCHIVE+CLEAN | Mis-rooted metadata shard is contained in the landed aggregate; repair owner-root metadata during cleanup. |
| dspx (mis-rooted) | source-metadata-12 | 85befab9 | ARCHIVE+CLEAN | Mis-rooted metadata shard is contained in the landed aggregate; repair owner-root metadata during cleanup. |
| dspx (mis-rooted) | source-metadata-13 | 250d3363 | ARCHIVE+CLEAN | Mis-rooted metadata shard is contained in the landed aggregate; repair owner-root metadata during cleanup. |
| dspx (mis-rooted) | source-metadata-14 | 5146d6c4 | ARCHIVE+CLEAN | Mis-rooted metadata shard is contained in the landed aggregate; repair owner-root metadata during cleanup. |
| dspx (mis-rooted) | source-metadata-15 | 7a5f1163 | ARCHIVE+CLEAN | Mis-rooted metadata shard is contained in the landed aggregate; repair owner-root metadata during cleanup. |
| dspx (mis-rooted) | source-metadata-16 | d2aaa329 | ARCHIVE+CLEAN | Mis-rooted metadata shard is contained in the landed aggregate; repair owner-root metadata during cleanup. |
| dspx (mis-rooted) | source-metadata-17 | 1d4130a6 | ARCHIVE+CLEAN | Mis-rooted metadata shard is contained in the landed aggregate; repair owner-root metadata during cleanup. |
| dspx (mis-rooted) | source-metadata-18 | 1a1680b4 | ARCHIVE+CLEAN | Mis-rooted metadata shard is contained in the landed aggregate; repair owner-root metadata during cleanup. |
| dspx (mis-rooted) | source-metadata-19 | 99d6021d | ARCHIVE+CLEAN | Mis-rooted metadata shard is contained in the landed aggregate; repair owner-root metadata during cleanup. |
| dspx (mis-rooted) | source-metadata-20 | 73e7af63 | ARCHIVE+CLEAN | Mis-rooted metadata shard is contained in the landed aggregate; repair owner-root metadata during cleanup. |
| dspx (mis-rooted) | source-metadata-21 | 568d9d67 | REJECT | Shard was deliberately omitted or replaced by a parser-corrected aggregate already landed.; 2 registry aliases |
| dspx (mis-rooted) | source-metadata-21b | edd5335f | ARCHIVE+CLEAN | Mis-rooted metadata shard is contained in the landed aggregate; repair owner-root metadata during cleanup. |
| dspx (mis-rooted) | source-metadata-22 | 40d5407d | ARCHIVE+CLEAN | Mis-rooted metadata shard is contained in the landed aggregate; repair owner-root metadata during cleanup.; 2 registry aliases |
| dspx (mis-rooted) | source-metadata-23 | 32402da2 | ARCHIVE+CLEAN | Mis-rooted metadata shard is contained in the landed aggregate; repair owner-root metadata during cleanup.; 2 registry aliases |
| dspx (mis-rooted) | source-metadata-24 | 4f3ea270 | ARCHIVE+CLEAN | Mis-rooted metadata shard is contained in the landed aggregate; repair owner-root metadata during cleanup.; 2 registry aliases |
| engineering-core | engineering-metadata-manual-a | 747f8ab6 | ARCHIVE+CLEAN | All candidate commits are patch-equivalent to current main. |
| engineering-core | engineering-metadata-manual-b | 046bb839 | ARCHIVE+CLEAN | All candidate commits are patch-equivalent to current main.; 2 registry aliases |
| engineering-core | engineering-metadata-manual-c | cf7a3ca6 | ARCHIVE+CLEAN | All candidate commits are patch-equivalent to current main.; 2 registry aliases |
| engineering-core | engineering-metadata-manual-d | 3bdb4ea1 | ARCHIVE+CLEAN | All candidate commits are patch-equivalent to current main.; 2 registry aliases |
| engineering-core | source-metadata-engineering-core | 2d2d9ecf | ARCHIVE+CLEAN | All candidate commits are patch-equivalent to current main. |
| fcos-control-board | context-evidence-continuation | 548bd1bd | PRESERVE | Worktree changed after census and has live peer activity; preserve active unique work. |
| fcos-control-board | fcos-closed-evidence-resolution | - | RECONCILE | Worktree is missing; related commits remain reachable but exact deleted tip was not recorded.; 2 registry aliases |
| fcos-control-board | fcos-designmd-dspx-continuation | 548bd1bd | PRESERVE | Worktree changed after census and has live peer activity; preserve active unique work. |
| fcos-control-board | fcos-revalidation | - | RECONCILE | Worktree is missing; related commits remain reachable but exact deleted tip was not recorded.; 2 registry aliases |
| local-ai-control-plane | artifact-acquisition | f10f6e45 | ARCHIVE+CLEAN | Candidate is ancestor, patch-equivalent, or semantically superseded by stronger current-main implementation. |
| local-ai-control-plane | autonomous-cleanup-supervisor | a11e3fcd | ARCHIVE+CLEAN | Candidate is ancestor, patch-equivalent, or semantically superseded by stronger current-main implementation.; 13 registry aliases |
| local-ai-control-plane | capability-fit | d2066608 | ARCHIVE+CLEAN | Candidate is ancestor, patch-equivalent, or semantically superseded by stronger current-main implementation. |
| local-ai-control-plane | capability-graph-execution | fb94bf57 | ARCHIVE+CLEAN | Candidate is ancestor, patch-equivalent, or semantically superseded by stronger current-main implementation.; 3 registry aliases |
| local-ai-control-plane | experiment-cli | 111e2959 | ARCHIVE+CLEAN | Candidate is ancestor, patch-equivalent, or semantically superseded by stronger current-main implementation. |
| local-ai-control-plane | experiment-packs | aa99d9e4 | ARCHIVE+CLEAN | Candidate is ancestor, patch-equivalent, or semantically superseded by stronger current-main implementation. |
| local-ai-control-plane | experiment-recovery-complete | 1f280c9c | ARCHIVE+CLEAN | Candidate is ancestor, patch-equivalent, or semantically superseded by stronger current-main implementation.; 6 registry aliases |
| local-ai-control-plane | governed-promotion | c24530e0 | ARCHIVE+CLEAN | Candidate is ancestor, patch-equivalent, or semantically superseded by stronger current-main implementation. |
| local-ai-control-plane | hardware-inventory | 71e037cf | ARCHIVE+CLEAN | Candidate is ancestor, patch-equivalent, or semantically superseded by stronger current-main implementation. |
| local-ai-control-plane | https-acquisition-proof | 6a6392e5 | ARCHIVE+CLEAN | Candidate is ancestor, patch-equivalent, or semantically superseded by stronger current-main implementation. |
| local-ai-control-plane | installed-wheel-proof | a4cb0323 | ARCHIVE+CLEAN | Candidate is ancestor, patch-equivalent, or semantically superseded by stronger current-main implementation. |
| local-ai-control-plane | invocation-replay-artifacts | 901045ab | ARCHIVE+CLEAN | Candidate is ancestor, patch-equivalent, or semantically superseded by stronger current-main implementation. |
| local-ai-control-plane | laneop-wave1-read-model | cbcbf016 | ARCHIVE+CLEAN | Candidate is ancestor, patch-equivalent, or semantically superseded by stronger current-main implementation.; 3 registry aliases |
| local-ai-control-plane | laneop-wave1b-status-gpu | 539828b6 | PRESERVE | Two commits plus six unique unstaged correctness/security files; tests are still missing.; 2 registry aliases |
| local-ai-control-plane | legacy-contract-reduction | 9506c23e | ARCHIVE+CLEAN | Candidate is ancestor, patch-equivalent, or semantically superseded by stronger current-main implementation. |
| local-ai-control-plane | lifecycle-core | 01a05870 | ARCHIVE+CLEAN | Candidate is ancestor, patch-equivalent, or semantically superseded by stronger current-main implementation. |
| local-ai-control-plane | mechanical-refactor-wave | 7d9e95de | ARCHIVE+CLEAN | Candidate is ancestor, patch-equivalent, or semantically superseded by stronger current-main implementation. |
| local-ai-control-plane | ollama-managed-lifecycle | 815abcc9 | ARCHIVE+CLEAN | Candidate is ancestor, patch-equivalent, or semantically superseded by stronger current-main implementation. |
| local-ai-control-plane | parity-oracle | feefa331 | ARCHIVE+CLEAN | Candidate is ancestor, patch-equivalent, or semantically superseded by stronger current-main implementation. |
| local-ai-control-plane | policy-rich-selection | 5dc55cfe | ARCHIVE+CLEAN | Candidate is ancestor, patch-equivalent, or semantically superseded by stronger current-main implementation.; 4 registry aliases |
| local-ai-control-plane | posture-history | 7921bb87 | ARCHIVE+CLEAN | Candidate is ancestor, patch-equivalent, or semantically superseded by stronger current-main implementation. |
| local-ai-control-plane | profile-experiment-core | 97bdee8c | ARCHIVE+CLEAN | Candidate is ancestor, patch-equivalent, or semantically superseded by stronger current-main implementation. |
| local-ai-control-plane | profile-policy-state | df3138fd | ARCHIVE+CLEAN | Candidate is ancestor, patch-equivalent, or semantically superseded by stronger current-main implementation. |
| local-ai-control-plane | promotion-cli-proof | 898c9daa | ARCHIVE+CLEAN | Candidate is ancestor, patch-equivalent, or semantically superseded by stronger current-main implementation. |
| local-ai-control-plane | resource-aware-scheduler | 2054c387 | ARCHIVE+CLEAN | Candidate is ancestor, patch-equivalent, or semantically superseded by stronger current-main implementation.; 15 registry aliases |
| local-ai-control-plane | secret-safe-auth | 802743e6 | ARCHIVE+CLEAN | Candidate is ancestor, patch-equivalent, or semantically superseded by stronger current-main implementation. |
| local-ai-control-plane | sglang-typed-lifecycle | 146880f4 | ARCHIVE+CLEAN | Candidate is ancestor, patch-equivalent, or semantically superseded by stronger current-main implementation. |
| local-ai-control-plane | split-experiment-core | 77e3e356 | ARCHIVE+CLEAN | Candidate is ancestor, patch-equivalent, or semantically superseded by stronger current-main implementation. |
| local-ai-control-plane | split-oversized-runtime-files | 960d1bad | ARCHIVE+CLEAN | Candidate is ancestor, patch-equivalent, or semantically superseded by stronger current-main implementation. |
| local-ai-control-plane | streaming-chat | 55435175 | ARCHIVE+CLEAN | Candidate is ancestor, patch-equivalent, or semantically superseded by stronger current-main implementation. |
| local-ai-control-plane | switch-recovery-complete | fd7257a4 | ARCHIVE+CLEAN | Candidate is ancestor, patch-equivalent, or semantically superseded by stronger current-main implementation.; 5 registry aliases |
| local-ai-control-plane | unified-capability-resolution | f06e2489 | ARCHIVE+CLEAN | Candidate is ancestor, patch-equivalent, or semantically superseded by stronger current-main implementation. |
| local-ai-control-plane | vllm-docker-hardening | b95951a8 | REJECT | Losing sibling implementation superseded by the stronger final-convergence architecture on main.; 2 registry aliases |
| local-ai-control-plane | vllm-docker-lifecycle | d83451e4 | ARCHIVE+CLEAN | Candidate is ancestor, patch-equivalent, or semantically superseded by stronger current-main implementation.; 2 registry aliases |
| local-ai-control-plane | vllm-final-convergence | 8903d509 | ARCHIVE+CLEAN | Candidate is ancestor, patch-equivalent, or semantically superseded by stronger current-main implementation. |
| pi-extensions | activity-better-openai-24 | 4af0300b | ACCEPT | Coherent additive source-metadata shard; promote scoped tip after owner-package validation. |
| pi-extensions | activity-runtime-20 | 703c2391 | ACCEPT | Coherent additive source-metadata shard; promote scoped tip after owner-package validation. |
| pi-extensions | ar-3040-c01-naming | - | RECONCILE | Worktree is missing; reconcile registry against surviving archive/branch evidence. |
| pi-extensions | ar-3040-c02-dirty | - | RECONCILE | Worktree is missing; reconcile registry against surviving archive/branch evidence. |
| pi-extensions | ar-3040-c03-closeout | - | RECONCILE | Worktree is missing; reconcile registry against surviving archive/branch evidence. |
| pi-extensions | ar-3040-c04-registry | - | RECONCILE | Worktree is missing; reconcile registry against surviving archive/branch evidence. |
| pi-extensions | ar-3040-c05-duplicates | - | RECONCILE | Worktree is missing; reconcile registry against surviving archive/branch evidence. |
| pi-extensions | ar-3040-c06-errors | - | RECONCILE | Worktree is missing; reconcile registry against surviving archive/branch evidence. |
| pi-extensions | ar-3040-c07-tests | - | RECONCILE | Worktree is missing; reconcile registry against surviving archive/branch evidence. |
| pi-extensions | ar-3040-c08-docs | - | RECONCILE | Worktree is missing; reconcile registry against surviving archive/branch evidence. |
| pi-extensions | ar-3040-c09-synthesis | - | RECONCILE | Worktree is missing; reconcile registry against surviving archive/branch evidence. |
| pi-extensions | ar-3060-c01-bind | - | RECONCILE | Worktree is missing; reconcile registry against surviving archive/branch evidence. |
| pi-extensions | ar-3060-c02-review | - | RECONCILE | Worktree is missing; reconcile registry against surviving archive/branch evidence. |
| pi-extensions | ar-3060-c03-closeout | - | RECONCILE | Worktree is missing; reconcile registry against surviving archive/branch evidence. |
| pi-extensions | ar-3060-c04-dashboard | - | RECONCILE | Worktree is missing; reconcile registry against surviving archive/branch evidence. |
| pi-extensions | ar-3060-c05-packets | - | RECONCILE | Worktree is missing; reconcile registry against surviving archive/branch evidence. |
| pi-extensions | ar-3060-c06-owner-gates | - | RECONCILE | Worktree is missing; reconcile registry against surviving archive/branch evidence. |
| pi-extensions | ar-3060-c07-next-calls | - | RECONCILE | Worktree is missing; reconcile registry against surviving archive/branch evidence. |
| pi-extensions | ar-3060-c08-missing | - | RECONCILE | Worktree is missing; reconcile registry against surviving archive/branch evidence. |
| pi-extensions | ar-3060-c09-synthesis | - | RECONCILE | Worktree is missing; reconcile registry against surviving archive/branch evidence. |
| pi-extensions | ar-3462-candidate-01-88956e50 | - | RECONCILE | Worktree is missing; reconcile registry against surviving archive/branch evidence. |
| pi-extensions | ar-3462-cell-01-02-candidate-01 | - | RECONCILE | Worktree is missing; reconcile registry against surviving archive/branch evidence. |
| pi-extensions | ar-3462-cell-01-03-candidate-01 | - | RECONCILE | Worktree is missing; reconcile registry against surviving archive/branch evidence. |
| pi-extensions | ar-3462-cell-02-01-candidate-01 | - | RECONCILE | Worktree is missing; reconcile registry against surviving archive/branch evidence. |
| pi-extensions | ar-3462-cell-02-02-candidate-01 | - | RECONCILE | Worktree is missing; reconcile registry against surviving archive/branch evidence. |
| pi-extensions | ar-3462-cell-02-03-candidate-01 | - | RECONCILE | Worktree is missing; reconcile registry against surviving archive/branch evidence. |
| pi-extensions | ar-3462-cell-03-01-candidate-01 | - | RECONCILE | Worktree is missing; reconcile registry against surviving archive/branch evidence. |
| pi-extensions | ar-3462-cell-03-02-candidate-01 | - | RECONCILE | Worktree is missing; reconcile registry against surviving archive/branch evidence. |
| pi-extensions | ar-3462-cell-03-03-candidate-01 | - | RECONCILE | Worktree is missing; reconcile registry against surviving archive/branch evidence. |
| pi-extensions | ar-3462-cell-04-01-candidate-01 | - | RECONCILE | Worktree is missing; reconcile registry against surviving archive/branch evidence. |
| pi-extensions | ar-3462-cell-04-02-candidate-01 | - | RECONCILE | Worktree is missing; reconcile registry against surviving archive/branch evidence. |
| pi-extensions | ar-3462-cell-04-03-candidate-01 | - | RECONCILE | Worktree is missing; reconcile registry against surviving archive/branch evidence. |
| pi-extensions | ar-ux-export-review-a | - | RECONCILE | Worktree is missing; reconcile registry against surviving archive/branch evidence. |
| pi-extensions | ar-ux-export-review-b | - | RECONCILE | Worktree is missing; reconcile registry against surviving archive/branch evidence. |
| pi-extensions | asc-crystallization-priority | 096542c1 | ARCHIVE+CLEAN | Clean empty/ancestor or patch-equivalent candidate verified against main. |
| pi-extensions | asc-dispatch-22 | eeb153bb | PRESERVE | Source files changed after candidate base; refresh/rebase and owner-review before promotion. |
| pi-extensions | asc-self-cap | 5d298ec7 | PRESERVE | Unique uncommitted self-tool capability-routing patch with tests. |
| pi-extensions | asc-self-memory | 5d298ec7 | PRESERVE | Unique uncommitted self-memory/topic-filtering patch with tests. |
| pi-extensions | asc-self-reflect | 5d298ec7 | PRESERVE | Unique uncommitted controller-handoff/reflection patch with tests. |
| pi-extensions | asc-tests-b-21 | 069f86ed | PRESERVE | Source files changed after candidate base; refresh/rebase and owner-review before promotion. |
| pi-extensions | autoresearch-extension-a-22 | 6db015c9 | ACCEPT | Coherent additive source-metadata shard; promote scoped tip after owner-package validation. |
| pi-extensions | autoresearch-extension-b-22 | 03c0d913 | ACCEPT | Coherent additive source-metadata shard; promote scoped tip after owner-package validation. |
| pi-extensions | candidatepeer-the-self-tool-can-better-answer-capability-discovery-questions-with-actionable-routing-examples-while-preserving-toolbox-and-repo-map-boundaries.-sample-1-under-scenario-capability-discovery-and-routing-clarity | 5d298ec7 | ARCHIVE+CLEAN | Clean empty/ancestor or patch-equivalent candidate verified against main. |
| pi-extensions | candidatepeer-the-self-tool-can-improve-memory-trap-recall-so-remembered-patterns-and-traps-are-more-useful-across-turns-without-becoming-canonical-ak-kes-authority.-sample-1-under-scenario-memory-recall-and-trap-protection-usefulness | 5d298ec7 | ARCHIVE+CLEAN | Clean empty/ancestor or patch-equivalent candidate verified against main. |
| pi-extensions | candidatepeer-the-self-tool-can-improve-operation-reflection-summaries-so-closeout-and-handoff-are-easier-for-controllers.-sample-1-under-scenario-self-state-and-operation-reflection-closeout | 5d298ec7 | ARCHIVE+CLEAN | Clean empty/ancestor or patch-equivalent candidate verified against main. |
| pi-extensions | compaction-workstation-21 | 4a965f2d | PRESERVE | Source files changed after candidate base; refresh/rebase and owner-review before promotion. |
| pi-extensions | context-packer-23 | 83db496b | ACCEPT | Coherent additive source-metadata shard; promote scoped tip after owner-package validation. |
| pi-extensions | evalset-designmd-ci-21 | 758ada27 | ACCEPT | Coherent additive source-metadata shard; promote scoped tip after owner-package validation. |
| pi-extensions | interaction-a-25 | 4d291ec8 | ACCEPT | Coherent additive source-metadata shard; promote scoped tip after owner-package validation. |
| pi-extensions | interaction-b-22 | 56c574cc | ACCEPT | Coherent additive source-metadata shard; promote scoped tip after owner-package validation. |
| pi-extensions | level2-packet-planning-cell01-token-schema | - | RECONCILE | Worktree is missing; reconcile registry against surviving archive/branch evidence. |
| pi-extensions | level2-packet-planning-cell02-anti-narrowing | - | RECONCILE | Worktree is missing; reconcile registry against surviving archive/branch evidence. |
| pi-extensions | level2-packet-planning-cell03-operator-ux | - | RECONCILE | Worktree is missing; reconcile registry against surviving archive/branch evidence. |
| pi-extensions | level3-slice1-cell01-manifest-schema | - | RECONCILE | Worktree is missing; reconcile registry against surviving archive/branch evidence. |
| pi-extensions | level3-slice1-cell02-policy-gates | - | RECONCILE | Worktree is missing; reconcile registry against surviving archive/branch evidence. |
| pi-extensions | level3-slice1-cell03-preflight-ux | - | RECONCILE | Worktree is missing; reconcile registry against surviving archive/branch evidence. |
| pi-extensions | level4-dogfood-cell-a-receipt-queue | - | RECONCILE | Worktree is missing; reconcile registry against surviving archive/branch evidence. |
| pi-extensions | level4-dogfood-cell-a-state-machine | - | RECONCILE | Worktree is missing; reconcile registry against surviving archive/branch evidence. |
| pi-extensions | level4-dogfood-cell-b-operator-ux | - | RECONCILE | Worktree is missing; reconcile registry against surviving archive/branch evidence. |
| pi-extensions | level4-dogfood-cell-b-selection | - | RECONCILE | Worktree is missing; reconcile registry against surviving archive/branch evidence. |
| pi-extensions | level4-self-dogfood-prompt-runner | - | RECONCILE | Worktree is missing; reconcile registry against surviving archive/branch evidence. |
| pi-extensions | little-helpers-a-21 | 1e68b1ef | ACCEPT | Coherent additive source-metadata shard; promote scoped tip after owner-package validation. |
| pi-extensions | little-helpers-b-21 | 8cf1806b | ACCEPT | Coherent additive source-metadata shard; promote scoped tip after owner-package validation. |
| pi-extensions | maintained-tests-a-20 | fda6b7fc | PRESERVE | Source files changed after candidate base; refresh/rebase and owner-review before promotion. |
| pi-extensions | ontology-core-20 | 11f2ba2b | PRESERVE | Source files changed after candidate base; refresh/rebase and owner-review before promotion. |
| pi-extensions | overlay-root-21 | b2c75e0d | ACCEPT | Coherent additive source-metadata shard; promote scoped tip after owner-package validation. |
| pi-extensions | peer-messaging-23 | a6b48a8e | ACCEPT | Coherent additive source-metadata shard; promote scoped tip after owner-package validation. |
| pi-extensions | pi-evidence-review-v1 | 417482a8 | BLOCKED | Integrated, but registry/controller process hint is still live; confirm quiescence before archival cleanup. |
| pi-extensions | pi-ext-startup-context-async | - | RECONCILE | Worktree is missing; reconcile registry against surviving archive/branch evidence. |
| pi-extensions | pi-ext-startup-context-cache | - | RECONCILE | Worktree is missing; reconcile registry against surviving archive/branch evidence. |
| pi-extensions | pi-ext-startup-context-two-tier | - | RECONCILE | Worktree is missing; reconcile registry against surviving archive/branch evidence. |
| pi-extensions | pi076-core-tools | b1c471d0 | ARCHIVE+CLEAN | Migration content is already on main or subsequently evolved; preserve complete dirty archive before cleanup. |
| pi-extensions | pi076-foundation-support | b1c471d0 | ARCHIVE+CLEAN | Migration content is already on main or subsequently evolved; preserve complete dirty archive before cleanup. |
| pi-extensions | pi076-interaction-stack | b1c471d0 | ARCHIVE+CLEAN | Migration content is already on main or subsequently evolved; preserve complete dirty archive before cleanup. |
| pi-extensions | pi076-prompt-templates | b1c471d0 | ARCHIVE+CLEAN | Migration content is already on main or subsequently evolved; preserve complete dirty archive before cleanup. |
| pi-extensions | pi076-provider-model | b1c471d0 | ARCHIVE+CLEAN | Migration content is already on main or subsequently evolved; preserve complete dirty archive before cleanup. |
| pi-extensions | pi076-society-stack | b1c471d0 | ARCHIVE+CLEAN | Migration content is already on main or subsequently evolved; preserve complete dirty archive before cleanup. |
| pi-extensions | pi076-ui-helpers | b1c471d0 | ARCHIVE+CLEAN | Migration content is already on main or subsequently evolved; preserve complete dirty archive before cleanup. |
| pi-extensions | prompt-execution-quality-21 | d7f9d841 | ACCEPT | Coherent additive source-metadata shard; promote scoped tip after owner-package validation. |
| pi-extensions | ptx-a-21 | 7aa400ca | ACCEPT | Coherent additive source-metadata shard; promote scoped tip after owner-package validation. |
| pi-extensions | ptx-b-21 | 224fafc7 | ACCEPT | Coherent additive source-metadata shard; promote scoped tip after owner-package validation. |
| pi-extensions | selection-toolbox-startup-21 | b927fd0e | PRESERVE | Source files changed after candidate base; refresh/rebase and owner-review before promotion. |
| pi-extensions | slice6-cell01-visible-binding | - | RECONCILE | Worktree is missing; reconcile registry against surviving archive/branch evidence. |
| pi-extensions | slice6-cell02-packet-chain | - | RECONCILE | Worktree is missing; reconcile registry against surviving archive/branch evidence. |
| pi-extensions | slice6-cell03-finalizer-cleanup-gate | - | RECONCILE | Worktree is missing; reconcile registry against surviving archive/branch evidence. |
| pi-extensions | snapshot-core-21 | 9affa3ca | ACCEPT | Coherent additive source-metadata shard; promote scoped tip after owner-package validation. |
| pi-extensions | snapshot-edit-default-ownership | 8662b2a8 | PRESERVE | Unique committed default-ownership behavior remains absent from main; dirty generated artifacts also exist. |
| pi-extensions | snapshot-edit-jq-compat | eb28b963 | ACCEPT | Focused bug fix remains absent from main; promote scoped tip only and rerun package tests. |
| pi-extensions | snapshot-edit-model-screen | 6a861490 | REJECT | Implementation is already present on main through an equivalent or stronger integration.; 3 registry aliases |
| pi-extensions | snapshot-edit-node22-timeout | a2d00b4b | ACCEPT | Focused bug fix remains absent from main; promote scoped tip only and rerun package tests. |
| pi-extensions | snapshot-edit-npm-release | 01eba1ad | PRESERVE | Four non-equivalent release commits remain on a reused dirty worktree; tip-level review required.; 4 registry aliases |
| pi-extensions | snapshot-edit-occurrence-protocol | 682b9484 | REJECT | Implementation is already present on main through an equivalent or stronger integration.; 2 registry aliases |
| pi-extensions | snapshot-edit-production-hardening | f3092bd4 | ARCHIVE+CLEAN | Clean empty/ancestor or patch-equivalent candidate verified against main. |
| pi-extensions | snapshot-edit-scale-crossover | 47899278 | REJECT | Implementation is already present on main through an equivalent or stronger integration.; 3 registry aliases |
| pi-extensions | snapshot-edit-token-benchmark | bf47b93c | REJECT | Implementation is already present on main through an equivalent or stronger integration.; 3 registry aliases |
| pi-extensions | source-list-provider-pilot-3728 | 35922f0a | BLOCKED | Integrated, but registry/controller process hint is still live; confirm quiescence before archival cleanup. |
| pi-extensions | source-metadata-pi-extensions | df45ea25 | BLOCKED | Integrated, but registry/controller process hint is still live; confirm quiescence before archival cleanup. |
| pi-extensions | target3-cell01-lane-a | - | RECONCILE | Worktree is missing; reconcile registry against surviving archive/branch evidence. |
| pi-extensions | target3-cell01-lane-b | - | RECONCILE | Worktree is missing; reconcile registry against surviving archive/branch evidence. |
| pi-extensions | target3-cell02-lane-a | - | RECONCILE | Worktree is missing; reconcile registry against surviving archive/branch evidence. |
| pi-extensions | target3-cell02-lane-b | - | RECONCILE | Worktree is missing; reconcile registry against surviving archive/branch evidence. |
| pi-extensions | vent-provenance-23 | 1fa1ceb9 | ACCEPT | Coherent additive source-metadata shard; promote scoped tip after owner-package validation. |
| pi-extensions temp benchmark | ablation-harness | 17eba772 | ACCEPT | Scoped tip applies cleanly to current main and focused tests passed; promote tip only. |
| pi-extensions temp benchmark | asc-runtime-a-20 | b39786f5 | PRESERVE | Unique scoped metadata tip conflicts with current main; reapply tip only, never shared branch history. |
| pi-extensions temp benchmark | society-runtime-a-20 | d916e8ca | PRESERVE | Unique scoped metadata tip conflicts with current main; reapply tip only, never shared branch history. |
| pi-extensions temp benchmark | vault-runtime-a-20 | 91f3c11f | PRESERVE | Unique scoped metadata tip conflicts with current main; reapply tip only, never shared branch history. |
| runtime-trace-insights | fcos-revalidate-runtime | - | RECONCILE | Read-only revalidation worktree is gone; owner commit/artifact receipt remains verifiable. |
| semantic-code-intelligence | contract-v1 | c837007b | ACCEPT | Structural evidence receipt Phase-A contract is additive; 9 focused tests, typecheck, Biome, and diff check passed. |
| semantic-code-intelligence | phase2-evidence-review-handoff-contract | 55ea895f | ARCHIVE+CLEAN | Both commits are patch-equivalent to main. |
| test-capabilities | fcos-revalidate-tc | - | RECONCILE | Read-only revalidation worktree is gone; owner commit/artifact receipt remains verifiable. |
| ts-quality | fcos-revalidate-tsq | - | RECONCILE | Read-only revalidation worktree is gone; owner commit/artifact receipt remains verifiable. |
| workstation | max-qwen36-cell-01-01-native-fp8 | 67922044 | PRESERVE | Untracked experiment code/evidence is valuable and current archive packets would omit it. |
| workstation | max-qwen36-cell-02-02-conversion-path | 67922044 | PRESERVE | Untracked experiment code/evidence is valuable and current archive packets would omit it. |
| workstation | max-qwen36-cell-03-03-fail-proof | 67922044 | PRESERVE | Untracked experiment code/evidence is valuable and current archive packets would omit it.; 2 registry aliases |
| workstation | max-qwen36-iterative-repair | 67922044 | PRESERVE | Untracked experiment code/evidence is valuable and current archive packets would omit it.; 2 registry aliases |
| workstation | max-qwen36-mtp-cell-01-01-candidate-01 | 67922044 | PRESERVE | Untracked experiment code/evidence is valuable and current archive packets would omit it. |
| workstation | max-qwen36-mtp-cell-01-02-candidate-01 | 67922044 | PRESERVE | Untracked experiment code/evidence is valuable and current archive packets would omit it. |
| workstation | max-qwen36-mtp-cell-01-03-candidate-01 | 67922044 | PRESERVE | Untracked experiment code/evidence is valuable and current archive packets would omit it. |
| workstation | max-qwen36-mtp-cell-02-01-candidate-01 | 67922044 | PRESERVE | Untracked experiment code/evidence is valuable and current archive packets would omit it. |
| workstation | max-qwen36-mtp-cell-02-02-candidate-01 | 67922044 | ARCHIVE+CLEAN | Clean ancestor lane with no candidate artifacts or unique commits. |
| workstation | max-qwen36-mtp-cell-02-03-candidate-01 | 67922044 | ARCHIVE+CLEAN | Clean ancestor lane with no candidate artifacts or unique commits. |
| workstation | max-qwen36-mtp-cell-03-01-candidate-01 | 67922044 | ARCHIVE+CLEAN | Clean ancestor lane with no candidate artifacts or unique commits. |
| workstation | max-qwen36-mtp-cell-03-02-candidate-01 | 67922044 | PRESERVE | Untracked experiment code/evidence is valuable and current archive packets would omit it. |
| workstation | max-qwen36-mtp-cell-03-03-candidate-01 | 67922044 | PRESERVE | Untracked experiment code/evidence is valuable and current archive packets would omit it. |

## Execution order

1. Preserve and review the 30 unique/dirty/active lanes.
2. Integrate the 22 accepted candidates one scoped tip at a time, with owner tests and clean target checkouts.
3. Record the 10 rejected candidates as explicitly superseded/rejected.
4. Reconcile the 67 already-missing resources, including exact statements of recoverability or loss.
5. Only after the archive implementation is lossless, process the 93 archive-and-clean lanes in small repository-scoped cohorts.
6. Recheck the three process-blocked lanes after the associated controller sessions are quiescent.

## Important high-value lanes

- SCI `contract-v1` (`c837007`): accept Phase-A structural evidence receipt contract.
- pi-extensions `snapshot-edit-jq-compat` and `snapshot-edit-node22-timeout`: accept only the focused fix tips.
- DSPx `iw14b-b4-dspx-3915`: accept after refreshing focused validation.
- pi-extensions temp `ablation-harness`: accept the scoped tip only.
- workstation `max-qwen36-iterative-repair`: preserve; it contains the strongest runtime receipt, but external installed-file patches still need recovery.
- local-ai-control-plane `laneop-wave1b-status-gpu`: preserve; unique unstaged correctness/security work lacks tests.
- pi-extensions `asc-self-cap`, `asc-self-memory`, and `asc-self-reflect`: preserve unique uncommitted patches with tests for owner review.

## Evidence limitations

- Review used current local owner checkouts; several are dirty or divergent, so integration must occur in a clean owner-controlled lane.
- Patch-ID equality can miss shard-to-squash integration; reviewers checked semantic/main equivalence where this occurred.
- Process command-line matches are conservative activity hints, not proof that a candidate editor is active.
- This note is a reviewed operational projection, not AK evidence or an architectural decision by itself.
