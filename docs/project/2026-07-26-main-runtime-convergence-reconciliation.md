---
summary: "AK-4263 consensus-first plan for converging the split pi-extensions histories, live runtime, verification, and retained worktrees."
read_when:
  - "Working on AK-4263 or IW7 repository/runtime convergence."
  - "Selecting an integration topic from local main versus origin/main."
  - "Changing live Pi package sources or cleaning pi-extensions worktrees."
type: "reconciliation-plan"
status: "completed"
date: "2026-07-26"
system4d:
  container: "AK-4263 projection for IW7 convergence."
  compass: "Converge without losing unique work, preserve owner boundaries, and make live runtime provenance reproducible."
  engine: "Preserve -> audit -> select by consensus -> integrate bounded topics -> prove one-lineage runtime -> clean conservatively."
  fog: "A passing package proxy or mutable install path can conceal history loss and runtime split-brain."
---

# Main and runtime convergence reconciliation

## Authority and status

Canonical execution authority is AK task `4263`, linked to active direction wave `IW7` under `SF6`.
This document is a reviewable projection of that task, not a parallel task, evidence, decision, or runtime state store.

AK task `4257` remains a bounded pending Toolbox leaf. Its scope is not broadened by this controller.
Package implementation requires separately scoped owner leaves.

Controller posture applied during execution:

- consensus-first history selection;
- no wholesale merge, reset, rebase, force push, or mass cherry-pick;
- two-phase live-runtime stabilization followed by final-main activation;
- conservative archive-before-cleanup;
- no completion claim until the AK done contract is satisfied.

## Completed closeout projection

Observed closeout state on 2026-07-26 and finalized after interactive reload on 2026-07-27:

- canonical remote `main` was fast-forwarded from audited `7ae6b3440fd6606593b7243d6782158703a6e278` through the reviewed controller lineage; no divergent local-main merge, rebase, reset, or force push was used;
- accepted local cohorts were integrated through AK owner leaves `4285`–`4292`; explicit owner deferrals for L03, L06, and L22 are recorded in AK evidence `5482` against their original owner tasks and non-authorizations;
- the final runtime package snapshot is the immutable `ee469a8e66f4b7bdba37f3cc4ff635de7b5daead` worktree at `~/.local/share/pi/live-worktrees/pi-extensions-ee469a8e`;
- exactly ten governed package settings select that snapshot, no governed setting retains `a0a72e4c` or `53481dbc`, and `~/.pi/agent/settings.json` remains mode `0600` with SHA-256 `dcec2a0dede94710313f4929aab5a74482e22ada439c15bf8baf1cc530b7702e`;
- production materialization and verification report 20 resolved runtime edges, and the production canary completed once with handoff `97a879b6-db39-41f4-a2ed-5ef7e235bde7`;
- a fresh Pi process exposed 79 tools: all 54 closed-owner tools resolve from `ee469a8e`, while the six separately retained SCI tools remain explicitly pinned to `26fd79e5`; no closed-owner tool resolved from an old or mixed lineage;
- real governed deep review executed once through `workflow_execute`, returned `status=done`, handoff `75b7d789-a0c0-4f21-b69a-5c7906798845`, preflight nonce `e1f0a7a3-8401-4982-a4af-e6d69ba9db39`, receipt digest `8a89fde229672cae3a96c362857714af1adce44d238a6c6bf6a08bbe5ea3a919`, registry `a6b456f3e4598520030e83b6b69b453fca65f49517fba26197c55ed4ddbd03f2`, and exactly one Nexus release;
- after the operator explicitly reloaded this interactive Pi session, a second governed `vault_execute_template` deep review returned `details.ok=true`, `executionSurface=workflow_execute`, non-empty handoff `71455971-5f80-4018-b661-8e5be51b4e72`, and `status=done`; AK evidence `5494` records the exact current-session tool call and links it to prior preflight and exactly-once Nexus proof `5490`;
- GitHub runs `30217291692` (CI), `30217291693` (release-check), `30217291695` (compatibility canary), and `30217291705` (release-please) passed after CI began production-materializing the mandatory governed canary in an exact SHA-named detached worktree;
- cleanup removed only the 20 independently reviewed absent-filesystem Git worktree metadata records. Registered worktrees moved from 100 to 80 at cleanup time; zero filesystem directories, branch refs, Git objects, dirty trees, active trees, runtime roots, rollback roots, or owner-retained trees were deleted. The separately added final-main runtime worktree brings the final retained registry count to 81;
- rollback roots `53481dbc`, `a0a72e4c`, `edb96b46`, `c70967ac`, and `0a4025a6`, the retained SCI root `26fd79e5`, ambiguous `f5384ff5`, detached `9982214e`, and the dirty local-main checkout remain preserved;
- the local `main` ref/worktree intentionally remains at preserved `b6b5dcef` because it carries extensive staged, unstaged, and untracked owner state. Remote `main` is canonical; moving the dirty local worktree would violate the lossless cleanup membrane.

On 2026-07-27 the operator explicitly reloaded the interactive Pi process. That same session then exposed the governed owner tools and completed the exact `deep-review.v1` workflow contract through `vault_execute_template`; evidence `5494` closes the reload gap without superseding the stronger preflight and exactly-once Nexus proof in evidence `5490`.

The remaining sections preserve the controller's opening observations and execution plan as historical context. Terms such as candidate, unreviewed, and before Wave describe that planning state unless a passage is explicitly marked as closeout state.

## Observed facts

### Divergence chronology at controller opening

| Event | Observed result |
| --- | --- |
| Last shared commit | `68885841bd101e2bf42314b9dd8427c2620b13ea` on 2026-07-11 |
| Local reconciliation merge | `d05dedf04a99c46c08e1dfba27c12f471e5dd93d`, combining local `238da631...` with shared remote `68885841...` |
| Remote continuation | `origin/main` continued independently from `68885841...` through `4b3d3a3d...` and later commits |
| AK-3970 inventory | wholesale merge rejected at approximately 83 local / 91 remote commits |
| Audited local `main` at controller opening | `b6b5dcef8cffa8a677fe0f1f7b0b74a5ce55ad68` |
| Audited `origin/main` at controller opening | `7ae6b3440fd6606593b7243d6782158703a6e278` |
| Audited merge base at controller opening | `68885841bd101e2bf42314b9dd8427c2620b13ea` |
| Audited graph divergence at controller opening | 97 local-side / 162 origin-side commits |
| Closeout local `main` | preserved dirty at `b6b5dcef8cffa8a677fe0f1f7b0b74a5ce55ad68` |
| Closeout `origin/main` and remote-advertised `main` | `ee469a8e66f4b7bdba37f3cc4ff635de7b5daead` |
| Closeout divergence | 97 preserved local-side / 207 canonical remote-side commits |

The split persisted because bounded recovery work continued on `origin/main` while new local work continued on the divergent local `main`.
Completed package tasks proved individual slices; none owned whole-repository convergence or final installed-runtime identity.

### Governed deep-review recurrence

AK-4078 produced the complete three-owner repair at:

```text
f5384ff524a92e78ea9af07c4d5c634bb31356d1
```

That commit was an ancestor of the audited `origin/main` at controller opening, remains an ancestor of canonical closeout `origin/main`, and is not an ancestor of the preserved divergent local `main`.
It added:

- the immutable `deep-review -> workflow_execute` Vault binding;
- the exact `deep-review.v1` orchestrator adapter;
- dispatch authorization and durable handoff propagation;
- workflow execution tests;
- visible-loop receipt enforcement.

Later local commit `eeac7cda88df4027f89c4f0348420b5d051c055e` ported only the `pi-little-helpers` receipt barrier into the local bound/adaptive loop architecture.
It did not port the Vault and orchestrator execution owners.
The local loop therefore required a receipt that its local execution lineage could not produce.

A failed broad local reconciliation immediately before `eeac7cda` included thousands of deletions and was reset rather than adopted.
The narrower replacement correctly preserved the consumer gate but accidentally left its provider dependency on the other history.

### Live runtime split-brain

At capture time, Pi settings resolved relevant owners from multiple mutable source trees:

| Runtime owner | Settings-resolved source | Git lineage |
| --- | --- | --- |
| `pi-little-helpers` | canonical local checkout | local `main` at `b6b5dcef` |
| `pi-toolbox-discovery` | canonical local checkout | local `main` at `b6b5dcef` |
| `pi-society-orchestrator` | canonical local checkout | local `main` at `b6b5dcef` |
| direct `pi-vault-client` tools | `~/.local/share/pi/live-worktrees/pi-extensions-f5384ff5` | actual HEAD `29199dd121b9ee6326f9a4a55cd2cb0f5c59449b` |
| direct ASC tools | `~/.local/share/pi/live-worktrees/pi-extensions-9570427c` | detached `9570427c639418b936050ce4370e897ec7a3ca6d` |
| direct SCI tools | `~/.local/share/pi/live-worktrees/pi-extensions-26fd79e5` | detached `26fd79e5d44c2cf24a48be2a9e89e28a5c1d00c1` |

`pi-society-orchestrator` uses sibling `file:` dependencies.
Its dynamic import of `@tryinget/pi-vault-client/dispatch-runtime` therefore resolves to the local-main sibling package, not the separately installed Vault package containing `f5384ff5`.
Tool registration and Toolbox activation can succeed while deferred owner execution resolves different code and fails.

This is a provenance failure, not a prompt-selection failure.
`pi-modes` changes prompt posture only; it cannot align extension source, dependency resolution, tool activation, or workflow bindings.

### Retained-state risk

Read-only inventory found:

- 95 registered Git worktrees;
- 21 stale registry entries already marked prunable;
- 104 local branches;
- 19 branches with commits absent from all `origin/*` refs;
- 17 branches with ref-exclusive commits;
- 40 quest-cohort worktrees, 33 dirty, occupying approximately 17 GiB;
- active live-worktree pins and active Pi processes;
- dirty/untracked state in the primary checkout and selected retained worktrees;
- an unreferenced detached commit `9982214e` protected only by worktree metadata.

These observations prohibit aggressive cleanup.

## Preservation membrane

Before integration, controller-owned no-replace refs were created:

```text
refs/preserve/ak-4263/local-main-b6b5dcef      -> b6b5dcef8cffa8a677fe0f1f7b0b74a5ce55ad68
refs/preserve/ak-4263/origin-main-7ae6b344     -> 7ae6b3440fd6606593b7243d6782158703a6e278
refs/preserve/ak-4263/deep-review-f5384ff5     -> f5384ff524a92e78ea9af07c4d5c634bb31356d1
refs/preserve/ak-4263/task-4257-cad43d58       -> cad43d58922916de4de00a5d4747d947a5249a1b
refs/preserve/ak-4263/live-vault-29199dd1      -> 29199dd121b9ee6326f9a4a55cd2cb0f5c59449b
refs/preserve/ak-4263/live-asc-9570427c        -> 9570427c639418b936050ce4370e897ec7a3ca6d
refs/preserve/ak-4263/live-sci-26fd79e5        -> 26fd79e5d44c2cf24a48be2a9e89e28a5c1d00c1
```

These refs preserve commit reachability only.
They do not preserve staged, unstaged, untracked, ignored, symlink, LFS, or nested-repository state.
Dirty-state archives and manifests remain required before filesystem cleanup.

## Many-of-the-greats adjudication

### School 1 — Lossless Git archaeology

- Core claim: canonical convergence is a topic-disposition problem, not a merge-command problem.
- What it sees: patch-equivalent commits, merge-only structure, generated projections, and unique local work cannot be distinguished by graph counts alone.
- Demand: inventory both lines, preserve refs, select coherent topics, and prove content coverage before promotion.

### School 2 — Hermetic runtime provenance

- Core claim: a repository is not converged while the running process imports same-named packages from divergent source trees.
- What it sees: tool registration, Toolbox activation, direct package tools, and orchestrator-internal imports can each resolve different modules.
- Demand: one immutable release-train identity, no live mutable aliases, no cross-lineage `file:` links, and same-process provenance readback.

### School 3 — Explicit AK authority

- Core claim: completed bounded tasks do not aggregate into repository convergence without a controller contract, linked leaves, and closeout evidence.
- What it sees: AK-3970, AK-3982, AK-4078, AK-4110, AK-4149, and AK-4228 were individually truthful but owned different slices and histories.
- Demand: IW7 controller authority, bounded package leaves, explicit dependencies, root gates, runtime proof, and cleanup closeout.

### School 4 — End-to-end reliability

- Core claim: synthetic success-shaped tool events are not proof that governed execution exists.
- What it sees: little-helpers tests fabricate the receipt, Toolbox tests assume registration, and package gates stop before the live cross-owner seam.
- Demand: same-process preflight plus a real cross-package canary that reaches Vault authorization, orchestrator execution, durable handoff, and Nexus release.

### School 5 — Conservative stewardship

- Core claim: cleanup without liveness, uniqueness, ownership, and restoration proof is data loss.
- What it sees: active processes, runtime-pinned worktrees, dirty candidate trees, detached-only commits, and unsafe `/tmp` locations.
- Demand: archive first, migrate unsafe locations, remove clean inactive worktrees, prune registry separately, and delete files last.

### Fundamental confrontations

| Clash | Irreducible tension | Decision |
| --- | --- | --- |
| Fast remote-first recovery vs consensus-first selection | `origin/main` contains critical accepted fixes, while local `main` contains unique later work | Consensus-first topic audit; remote ancestry is not automatic topic acceptance and local recency is not canonicality |
| Immediate runtime repair vs waiting for final convergence | Operators need governed review now, while final history selection takes longer | Two-phase runtime alignment to one audited immutable snapshot, then final-main activation |
| Package-local tests vs root live proof | package tests are fast and owner-specific, but cannot prove cross-owner module identity | Retain package gates and add a root same-process canary; neither substitutes for the other |
| Aggressive cleanup vs preservation | disk/backlog cost is real, but unique dirty state is not reproducible | Archive/migrate first; cleanup only after convergence and runtime migration |
| Pi mode vs runtime profile | prompt posture is useful, but cannot establish executable capability | Keep modes prompt-only; introduce an explicit immutable child runtime profile |

### Chosen path — true synthesis

No single school is sufficient.
The controller adopts a staged synthesis:

1. Git archaeology selects content.
2. AK declares authority and owner leaves.
3. Hermetic runtime construction selects executable package identity.
4. End-to-end reliability proves the live seam.
5. Stewardship cleans only after the preceding four succeed.

The synthesis rejects fake balance. Canonical history integration does not begin until full topic consensus exists. Emergency runtime stabilization may proceed earlier only after a narrower snapshot-specific consensus review proves the selected commit family, transitive dependency identity, rollback, same-process provenance, and real governed execution. It does not prejudge the final canonical baseline.

## Consensus-first topic protocol

Every local-only and origin-only cohort receives one explicit disposition:

- `accept_exact` — adopt the exact commit when cleanly applicable and current-target valid;
- `accept_reconciled` — implement equivalent behavior on the selected baseline with a new commit;
- `covered` — prove patch equivalence or stronger content coverage already exists;
- `reject` — record why the behavior is obsolete, unsafe, wrong-owner, or superseded;
- `defer_owner` — identify the owner, blocker, and follow-up authority;
- `historical_only` — preserve as history without active integration.

Selection evidence for each topic must include:

1. exact source commits and paths;
2. `git cherry` or stable patch-id classification for non-merge commits;
3. tree/content comparison where patch identity is insufficient;
4. AK task/result/evidence linkage when one exists;
5. target-baseline compatibility and owner boundary;
6. validation and rollback requirements;
7. independent review of the proposed disposition.

Initial fixed dispositions:

| Topic | Disposition | Basis |
| --- | --- | --- |
| `f5384ff5` governed deep-review provider path | `accept_exact` as required ancestry/content | completed AK-4078, origin ancestry, prior live proof, current failure demonstrates absence locally |
| `eeac7cda` bound/adaptive consumer barrier | `accept_reconciled` | current local architecture needs its stricter correlation behavior, but provider owners must accompany it |
| schema-v9 dispatch correction `8065b226` / `b71ebbd1` | `covered` on origin | prior patch-equivalence and current-target validation |
| task-ID parser fix `cad43d58` | `defer_owner` pending little-helpers leaf review | unique local commit, preserved by ref, not part of controller doc scope |
| generated governance projections | `historical_only` unless regenerated by owner | AK remains live authority |
| failed broad reconciliation with mass deletions | `reject` | violates lossless and bounded integration guardrails |

All remaining cohorts stay `unreviewed`; that state blocks final integration and cleanup.

## Execution waves

### Wave 0A — Freeze and authorize

- retain preservation refs;
- record the exact audited local and origin tips;
- register the bounded owner-leaf dependency graph in AK;
- capture dirty worktree manifests without cleaning;
- review the Wave-1 snapshot family, transitive dependencies, rollback, and same-process proof plan.

Exit: the runtime snapshot has an explicit consensus disposition and its owner leaves are authorized. Unrelated historical cohorts may remain unreviewed, but no canonical-history integration or cleanup may begin.

### Wave 0B — Complete history consensus

- capture deterministic commit/topic inventory from both histories;
- classify patch-equivalent and unique cohorts;
- review and record every topic disposition;
- refresh the audit if either source tip moves.

Exit: no unreviewed unique topic remains. This exit gates Wave 3 and cleanup, not the independently reversible Wave-1 stabilization.

### Wave 1 — Stabilize the live runtime

Select one clean immutable commit that contains the complete deep-review path and compatible package family.
Candidate `29199dd1` contains `f5384ff5` and prior governed live proof, but selection still requires current package gates and provenance checks.

From one immutable checkout, align at minimum:

- `pi-little-helpers`;
- `pi-toolbox-discovery`;
- `pi-society-orchestrator`;
- `pi-vault-client`;
- `pi-autonomous-session-control` and transitive local runtime owners used by orchestrator;
- `pi-peer-messaging` where loop report-back requires it.

Before changing settings:

1. record exact current package sources and hashes;
2. prepare a rollback manifest;
3. validate every selected package and compatibility seam;
4. reject duplicate package identities or divergent runtime-registry copies;
5. run a same-process owner probe through the exact deferred imports execution will use;
6. require the probe to report one source lineage, the `deep-review.v1` binding, policy registry identity, and receipt-store readiness;
7. run the operator-equivalent cross-package canary far enough to prove Vault authorization and orchestrator workflow dispatch before live activation.

Then install from the same immutable source, `/reload`, and perform a real governed call requiring:

```text
details.ok = true
executionSurface = workflow_execute
handoffId = non-empty exact Vault handoff
status = done
```

The success result must correlate to the same-process provenance receipt and exact selected snapshot; a success-shaped payload alone is insufficient. No stabilized-runtime claim is allowed before both provenance and governed execution proofs pass.

### Wave 2 — Make recurrence impossible

Promote the Wave-1 proof harness into an owner-registered production preflight that reports and verifies:

- resolved module URLs;
- package versions and source commit/integrity;
- policy registry ID;
- exact `deep-review -> workflow_execute` binding identity;
- registered and active tools;
- template version/content hash;
- ASC/workflow/provenance availability;
- receipt-store readiness;
- a nonce-bound preflight receipt consumed by the loop owner.

The visible/Nexus child must run this preflight before ACK or first prompt.
On failure it must restore the pre-activation tool set, invalidate the run config, emit one terminal failure, and stop.

Add a root cross-package canary using the operator-equivalent local-path/package-resolution topology:

```text
little-helpers child
-> Toolbox orchestrator-gated activation
-> same-process owner preflight
-> Vault authorization of an inert deep-review fixture
-> orchestrator workflow execution
-> deterministic reviewer canary
-> durable handoff receipt
-> little-helpers owner verification
-> exactly-once Nexus release
```

Synthetic tool events remain useful negative/unit fixtures but cannot satisfy the root canary.

### Wave 3 — Converge canonical history

- start from the consensus-selected baseline;
- integrate accepted topics in owner/dependency order;
- keep each package leaf bounded and reviewable;
- run package gates per leaf;
- run root docs, CI, release-contract, and compatibility gates on integration candidates;
- require current remote CI and no unexplained bypass;
- prove every accepted or covered topic from both histories is contained by ancestry, patch equivalence, or reviewed content coverage;
- prove every unique local and origin topic is accepted, covered, rejected, deferred, or historical-only;
- if `origin/main` is selected as the baseline, additionally prove its audited tip is an ancestor of the candidate.

Immediately before integration and promotion, compare current local and remote-tracking tips to the audited preservation refs. Any movement invalidates cohort counts and requires a refreshed fetch/inventory/review before proceeding.

Promotion must be fast-forward or another explicitly reviewed, lossless operation.

### Wave 4 — Activate final main

- build/install the runtime profile from final canonical main;
- reload Pi;
- prove same-process provenance points only to final lineage;
- repeat the real governed deep-review dogfood;
- run a visible/Nexus loop canary through receipt-gated release;
- retain the Wave-1 runtime rollback until Wave-4 proof is accepted.

### Wave 5 — Conservative cleanup

Cleanup order is fixed:

1. freeze any path used by an active PID or installed runtime;
2. capture status, staged/unstaged patches, untracked manifests/content, HEAD, branch, owner, and checksums;
3. create durable refs/bundles for exclusive and detached-only commits, especially `9982214e`;
4. migrate legitimate `/tmp` worktrees to managed disk-backed storage;
5. obtain task/quest owner closeout;
6. remove clean inactive worktrees first;
7. prune stale Git registry entries separately;
8. delete redundant branch refs only after repeated reachability checks;
9. remove filesystem directories last;
10. defer Git object pruning until after a retention window and restoration test.

The 21 already-prunable entries authorize only later registry cleanup, not deletion of surviving data.

## Required owner leaves

AK-4263 should coordinate, not absorb implementation ownership.
At controller opening, AK runtime reported a registered done contract and guardrails (`ak task contract show 4263`) plus an `IW7` execution-task link (`ak direction check`). At that time the controller had document-only repo scope, preservation refs were its only pre-leaf Git effect, and no owner-leaf dependencies, evidence, result, or reconciliation packet had been recorded. At closeout all nine dependencies are done, evidence `5482`, `5489`–`5491`, and `5494` covers the required classes, and reconciliation packet version 4 is closed with no unresolved gaps and a ready-to-close recommendation.

Before Wave 1, create, scope, link, and dependency-order owner leaves for:

1. deterministic history/topic inventory and consensus dispositions;
2. immutable Wave-1 runtime selection, rollback, install, reload, and dogfood;
3. Vault/orchestrator same-process binding preflight;
4. little-helpers pre-ACK barrier and owner receipt verification;
5. root operator-equivalent cross-package canary;
6. accepted package/topic integrations;
7. final-main runtime activation;
8. archive, migration, registry pruning, and filesystem cleanup.

AK-4257 remains the Toolbox D2E read-profile leaf and may depend on the runtime-stabilization/preflight leaves without changing its file scope.

## Stop conditions

Stop before mutation or cleanup when any of these holds:

- topic disposition required for the current wave is unreviewed or ambiguous;
- current local or remote-tracking tip differs from the audited preservation ref without a refreshed inventory;
- selected baseline or owner authority is missing;
- active PID/session uses the path;
- worktree is dirty, staged, untracked, ignored, or contains unsupported state without an accepted archive;
- commit lacks a durable ref or content-coverage proof;
- runtime/settings still reference the path;
- package identities or resolved module sources disagree;
- root validation requires an unexplained bypass;
- live dogfood lacks the exact owner handoff receipt;
- cleanup restoration has not been tested.

## Completion boundary

Before implementation, open the AK reconciliation packet and register the leaf dependency graph. AK-4263 completes only when its registered AK done contract and guardrails are satisfied, every required leaf is closed or explicitly owner-deferred, that packet is closed, and the required `git_lineage`, `package_validation`, `live_runtime_proof`, and `cleanup_inventory` evidence classes answer the review questions stored in the AK done contract.
This document may move to a completed projection only after canonical main, final live runtime, cross-package proof, and conservative cleanup are all observed and recorded by their owners.
