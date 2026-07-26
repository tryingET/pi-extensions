---
summary: "AK-4266 disposition of every local-main and origin-main divergence cohort plus a no-delete retained-state inventory."
read_when:
  - "Selecting the canonical pi-extensions history after the 2026-07 split."
  - "Integrating local-only topics or cleaning retained pi-extensions worktrees."
type: "reconciliation-audit"
status: "review-candidate"
date: "2026-07-26"
system4d:
  container: "AK-4266 topic-cohort and retained-state audit."
  compass: "Preserve unique behavior and dirty state while converging on one reviewed main lineage."
  engine: "freeze tips -> partition commits -> compare patches/content -> disposition cohorts -> gate integration and cleanup"
  fog: "An ancestry-only merge can silently abandon local behavior; a clean-looking worktree can still be active, unique, or owner-retained."
---

# Divergent topic-cohort disposition

## Authority and conclusion

AK task `4266` owns this audit. AK task `4263` owns later canonical integration and cleanup. This document is a reviewable projection, not a substitute for AK task, evidence, or owner authority.

The audit accounts for every non-merge commit on both sides of the split:

- local-only: 95 non-merge commits in 29 cohorts, plus 2 structural merges;
- origin-only: 128 non-merge commits in 29 cohorts, plus 34 structural merges;
- controller: 13 accepted commits above the audited origin tip.

The current controller is **not yet a lossless final-main candidate**. The local audit found 17 `accept_exact` commits and 12 `accept_reconciled` commits whose behavior is not fully present. Eight more commits are explicitly `defer_owner`; they may remain deferred only through owner-scoped closeout. Therefore a direct update of canonical main to `395a80a2` is blocked until the accepted local cohorts are integrated or their dispositions are independently corrected.

Cleanup is also fail-closed. Of 99 registered worktrees, only 20 absent-filesystem registry records are eligible for targeted metadata-only pruning. The other 79 remain retained. No filesystem or branch deletion is authorized by this audit.

## Frozen tips and reproducible graph facts

Read-only remote inspection and local object inspection agreed at review preparation time:

```text
local main       b6b5dcef8cffa8a677fe0f1f7b0b74a5ce55ad68
origin/main      7ae6b3440fd6606593b7243d6782158703a6e278
remote main      7ae6b3440fd6606593b7243d6782158703a6e278
controller       395a80a27e20c85a2bc780747b206fd6bbe512f9
merge base       68885841bd101e2bf42314b9dd8427c2620b13ea
```

```text
origin/main...main             162 origin-only / 97 local-only commits
origin/main...main non-merges  128 origin-only / 95 local-only commits
origin/main...controller       0 origin-only / 13 controller-only commits
```

Reproduce without moving refs:

```bash
git ls-remote --heads origin refs/heads/main
git merge-base main origin/main
git rev-list --left-right --count origin/main...main
git rev-list --count --no-merges origin/main..main
git rev-list --count --no-merges main..origin/main
git rev-list --left-right --count origin/main...task/4263-controller
git cherry origin/main main
git cherry main origin/main
```

All abbreviated commit IDs below are unique in this repository and are resolved exactly with `git rev-parse <id>^{commit}`. Stable patch identity was computed from non-merge diffs; path and tree comparisons were used when patch identity was insufficient.

## Allowed dispositions

- `accept_exact`: preserve the exact patch/content in final main.
- `accept_reconciled`: port the behavior onto the selected baseline under its current owner contract.
- `covered`: patch-equivalent or demonstrably stronger content is already present.
- `reject`: retain history but keep the proposed behavior inactive.
- `defer_owner`: owner-scoped acceptance or rejection remains required; parent integration does not absorb it.
- `historical_only`: retain lineage/evidence without replaying it as active implementation.

## Local-only cohort matrix

| # | Source commits | Primary topic/paths | Evidence and disposition |
|---:|---|---|---|
| L01 | `658922fa 78f8f316 fa3dfc70 2918f137` | snapshot-edit protocol, `packages/pi-snapshot-edit/**` | Patch-equivalent to `4b3d3a3d 9ea8d63f c5f7e0f2 0cacb0e3`; `covered`. |
| L02 | `238da631 f3092bd4 9579d085 efc48a77` | snapshot-edit release/model timeout/jq analyzer | Candidate contains equal or stronger release isolation and exact jq/timeout behavior; `covered`. |
| L03 | `efaa073f a99e1cfc fd852d34` | little-helpers adaptive controller | Candidate lacks the controller/runtime pair; architecture differs; `defer_owner`. |
| L04 | `6d0dd16b a642aef5 b7189550` | engineering-core pins/docs | Candidate v0.8 contract supersedes v0.6/v0.7; `covered`. |
| L05 | `888c3445 cdb4207e` | old engineering advice/receipts | Version-specific evidence only; `historical_only`. |
| L06 | `a008c134 30bb80c1` | orchestrator Layer-12 readback/presentation | No equivalent owner implementation found; `defer_owner`. |
| L07 | `d95cfaf3 6b82075f` | context-packer source-selection decision/harness | Patch-equivalent harness plus later explicit rejection/dissolution; `covered`. |
| L08 | `f4137b4e 495bd2b4 ac45053e 2583ba36 6993fe97 02469090 e845ce2a 484152d3 a6c6f35e 1d6fc468 8af8390d 03b4c59b ef3b4e94 73306f94` | source/read metadata across package and root surfaces | All 14 patches apply cleanly to `395a80a2`; `accept_exact`. |
| L09 | `6fa52f73 54fddba2 08deb928 5033c02c` | source metadata on evolved context/peer/prompt/toolbox/little-helpers files | Candidate has fewer declared summaries and exact patches conflict; owner-aware port required; `accept_reconciled`. |
| L10 | `f4941909 45fb944f 02e9aa8f 27481b03 3ed543eb 628dce83 c98c0a9c ca22e897` | semantic-preflight v0 designs/reviews/fixtures | Later integrated and hardened runtime supersedes active use; retain design history; `historical_only`. |
| L11 | `be51342d a2b8350a 69772799 9fde3d1e bfec05af` | pi-modes package/release/canary | Patch-equivalent to five origin commits and followed by newer policy work; `covered`. |
| L12 | `1b87e1ba 71293612 b4cbbc20` | ASC/orchestrator profiles and role-semantics ADR/RFC | Machinery remains but exact profile split and canonical docs do not; `accept_reconciled`. |
| L13 | `d2297ad6` | `Justfile`, engineering local policy | Coherent-slice behavior applies cleanly and is absent; `accept_exact`. |
| L14 | `3bd23303 7f67c23c eb0db086 18f2f306` | pi-evidence-review | Final package trees compare equal; `covered`. |
| L15 | `32b11433 6bc799c2 09221227` | generated AK work-item/scope projections | AK is live authority; `historical_only`. |
| L16 | `6e6162aa` | ASC resume handles | Patch-equivalent to `c11c5d23`; `covered`. |
| L17 | `2e37f63c ce606e9e 5719669c 7d558db3 ffbfadf2` | ontology runner/TUI/release attestations | Patch-equivalent or subsumed by integrated and hardened origin runtime; `covered`. |
| L18 | `7e6d4dac 8065b226` | Vault dispatch/schema-v9 | Patch-equivalent to `a81e3dec b71ebbd1`; `covered`. |
| L19 | `963dcbfc` | model-selection/session-compaction host boundary | Reconciled and strengthened by `12a4976d 0053376b`; `covered`. |
| L20 | `91a58664 7f2feb89 701cd59e 91e8a938 fda14e30 7128c4ac 583d7997 0964a920 fac45ff6` | candidate lifecycle v2 and archive | Candidate retains identical ADR plus stronger decomposition, bounded events, and authorization; `covered`. |
| L21 | `fa6ce7b9 1d107280 3f9cbefa` | AK-3927 scope projections | Intermediate receipts; `historical_only`. |
| L22 | `4eb08234 49bf03c1 2aac1681` | candidate-peer closeout reducers/artifacts | Separate crash-safe reducer model lacks one-to-one coverage proof; `defer_owner`. |
| L23 | `12cf52cd` | semantic-code-intelligence package boundary | Candidate retains implementation with stronger tests; `covered`. |
| L24 | `34e3c14f` | Vault startup I/O deferral | Exact patch applies and eager schema/Dolt startup remains otherwise; `accept_exact`. |
| L25 | `891a8fd5 94584218` | Ghostty controller-tab targeting/liveness | Behavior absent; evolved sidequest prevents exact application; `accept_reconciled`. |
| L26 | `678105fb` | visible-loop task binding/admission | Owner binding is absent and not replaced by governed preflight; `accept_reconciled`. |
| L27 | `22ee40e1 d310ac04` | direction-controller readback and Toolbox registration | Owner implementation absent; reconcile owner and Toolbox together; `accept_reconciled`. |
| L28 | `eeac7cda` | deep-review receipt barrier | Stronger three-owner preflight/handoff/provenance path now exists and passed real dogfood; `covered`. |
| L29 | `b6b5dcef` | peer-messaging ECONNRESET handling | Exact fix and regression are absent and apply cleanly; `accept_exact`. |

Local accounting:

```text
covered=42
accept_exact=17
accept_reconciled=12
historical_only=16
defer_owner=8
reject=0
total=95
```

The two local-only structural merges are:

```text
11467e13044885299f206a317576c748a21bc959
  merge: preserve controller local main snapshot-edit history
d05dedf04a99c46c08e1dfba27c12f471e5dd93d
  merge: refresh remote main release authority
```

They are historical structure, not behavior patches.

## Origin-only cohort matrix

The controller contains all 162 origin-side commits by ancestry. Ancestry alone does not make every historical or guarded behavior active, so the matrix records semantic disposition too. Reverse-application against `395a80a2` proves 17 exact accepted patches remain. For evolved commits, the table distinguishes stronger coverage from exact retained behavior using current path/content probes rather than ancestry.

| # | Source commits | Primary topic | Disposition |
|---:|---|---|---|
| O01 | `4b3d3a3d 9ea8d63f c5f7e0f2 0cacb0e3 6fd1a7c8 fe167dee 88d65b66 01eba1ad a2d00b4b eb28b963 8662b2a8 da68740f` | snapshot-edit protocol/release | The first four and `eb28b963` are locally patch-equivalent. Release hardening/tarball/workflow, timeout, and standard-tool behavior from `6fd1a7c8 88d65b66 01eba1ad a2d00b4b 8662b2a8` survive in stronger evolved content; those ten are `covered`. Documentation from `fe167dee` remains by content, and `da68740f` reverse-applies; those two are `accept_exact`. |
| O02 | `7a4e4046 0040b3cb e55f8961 e23d601c 664b2fa8 e3b27dd2 f5914fdf ecd5e1ad 969cb5d0 c0acdf1a 934b6d49 fe518f76 31567d9e d2bbb385 0890fed7 76a29e31 c6e757fd 11bd5ddb 1ac43844 0f09eafd 5bfaabd3 7da9bebf 77984e95 a9848669 9a328daf 378c1fd7 c569e191 bead3782 2825c678 173b508b` | generated release outputs | Retain versions/changelogs without replay; `historical_only`. |
| O03 | `dfaf2071 f5f91b0e b051fe76 07c44fe6 68d73b50 3e091cc0` | pi-modes implementation/composition | First five are locally patch-equivalent (`covered`); composable policy implementation from `3e091cc0` remains in evolved files by path/content proof (`accept_exact`). |
| O04 | `c11c5d23` | ASC resume handles | Locally patch-equivalent; `covered`. |
| O05 | `a81e3dec 6a82411a 6bccc011 b71ebbd1` | Vault fail-closed/schema-v9 | Two locally equivalent (`covered`); fixtures/publishing commits are `accept_exact`. |
| O06 | `5b0e2af3 6f92529d 6034e757 55a927dc` | portable release infrastructure | `6034e757` explicitly removes the earlier uv and machine-local materialization changes from `5b0e2af3 6f92529d`, so those two are `historical_only`. The portable gate including `PI_ENGINEERING_SMOKE=0` from `6034e757` and serialized release/publication dispatch from `55a927dc` remain by current content proof; those two are `accept_exact`. |
| O07 | `c3ef828f 8939d05a` | workflow dependency updates | `accept_exact`. |
| O08 | `39ba1716` | inert SCI evidence review | Package and inert review content remain with minor later evolution by path/tree comparison; `accept_exact`. |
| O09 | `1dcd1ce3` | superseded divergence plan | `historical_only`. |
| O10 | `162819e4` | interaction changelog metadata | `accept_exact`. |
| O11 | `11c51771` | verified ROCS semantic runner | Runner behavior is present and subsequently hardened; `covered`. |
| O12 | `56a73b59 8fbe4187 320d1705 7bd60188 2bef62ad 61fd0c6b e6ef3835 3187ad3a b19dc644` | provenance/source metadata wave | Retained provenance only; `historical_only`. |
| O13 | `8e4c8418 60441b46 abd111f5` | ASC self routing/memory | Self-routing and memory behavior from the first two remain in evolved files by current content probes; `abd111f5` reverse-applies. All three are `accept_exact`. |
| O14 | `4fef0e0e 595906cc a938a9b0 afb1562b ca8b2ff6 64d8aae9` | ontology release/preflight | Default-off owner guard remains; `defer_owner`. |
| O15 | `da00c3d3 44029ecb 13c1b2e4 4ee9f582 e67b1071 357af566 feb21d50 4b0b67f4 f6604f43 aa93a547 8ff5c6d5 40a834db 627b7898 a66304d1 94de97b3 6843d33e 363ec56f` | source-selection experiments | Retained experiment/audit artifacts, not standing execution authority; `historical_only`. |
| O16 | `12a4976d 0053376b` | host-owned session compaction | Host-owned compaction from `12a4976d` is strengthened by `0053376b` (`covered`); `0053376b` itself reverse-applies (`accept_exact`). |
| O17 | `5af2bb1b 91d203ab 6793232b 4e51ba62 4c18a407 29199dd1 1dcd4faa ada38134 5f64377c` | candidate lifecycle v2 | Active owner holds remain; `defer_owner`. |
| O18 | `0f36c0a8` | startup-context abort test | `accept_exact`. |
| O19 | `60c71d2c` | Vault public declaration boundary | `accept_exact`. |
| O20 | `937488e5` | ASC transport diagnostics | `accept_exact`. |
| O21 | `a3649e4b` | engineering-core v0.8 pin | `accept_exact`. |
| O22 | `5bcfb2ba` | orchestrator Vault fixtures | Fixture intent remains in evolved dispatch tests by current content proof; `accept_exact`. |
| O23 | `9570427c` | generated Vault JS mirror | Source-mirrored generated content; `covered`. |
| O24 | `f5384ff5` | governed deep-review provider path | Required provider behavior remains and is substantially hardened by the controller preflight/provenance commits and real live proof; `covered`. |
| O25 | `c2075d6b 1b976713` | semantic-delivery identity add/revert | Exact net-zero pair; `historical_only`. |
| O26 | `5c0007e9` | root context-packer routing | `accept_exact`. |
| O27 | `05850991 79c13d4b 77e5c904 7ae6b344` | source-list integration/treatment proposals | Active records reject integration/tuning/standing experiments; `reject`. |
| O28 | `11276275 69cd268c` | bounded reliability fixes | `accept_exact`. |
| O29 | `f95555d2 61ef4d28 26fd79e5` | recovered SCI package/Toolbox composites | Recovered implementation from `f95555d2` is completed by later composites (`covered`); `61ef4d28 26fd79e5` reverse-apply (`accept_exact`). |

Origin accounting:

```text
accept_exact=25
covered=23
historical_only=61
reject=4
defer_owner=15
accept_reconciled=0
total=128
```

The 34 origin structural merges are historical integration/release structure:

```text
snapshot-edit PR/release (7):
  e4bd7549 78f6fc60 ff835b5d c19099db da3b1dbb 1b8ad2dd 5871de5b
release-train PR merges (25):
  840bbc8f a00b10a7 720f9334 1ec45607 a537ad05 72910795 39d747b6
  af592e6f 5d6c721c f10738b5 70006665 152b6beb 0ce33ce7 cb078c8d
  84cde714 485224d1 ffb2f8ea a384fad5 339de326 124d9f73 67d8d799
  4c540336 545c9dd5 c28b24aa 83606012
dependabot PR merges (2):
  ec3cae62 54e2c784
```

## Controller commits

All 13 commits above the exact origin tip are accepted controller/owner-leaf results:

```text
b998b01b docs: govern main and runtime convergence
471dc7b5 docs: select governed loop runtime snapshot
69066468 docs: close runtime snapshot owner graph
0a4025a6 fix(autoresearch): declare trigger runtime dependency
5c9a844e docs: promote governed loop runtime snapshot
1a651888 feat: preflight governed deep review runtime
7475245f fix: support inherited materializer output
05b386f7 fix: isolate missing peer materialization probe
d353f156 fix: materialize pinned Pi host peers
edb96b46 fix: verify import-only Pi host peers
c70967ac fix: close governed deep-review provenance gaps
a0a72e4c fix: harden governed preflight owner attestation
395a80a2 docs: record live governed runtime stabilization
```

AK-4265 and AK-4283 record accepted independent review and real live proof at `a0a72e4c`; the final documentation commit does not change the selected runtime bytes.

## Integration disposition

Final-main integration must use the controller/origin lineage as the baseline, then integrate accepted local behavior in owner order. It must not merge the divergent local-main topology wholesale.

Required before promotion:

1. integrate L08, L13, L24, and L29 exactly after current-target checks;
2. port L09, L12, L25, L26, and L27 through bounded package owners;
3. obtain explicit owner defer/closeout for L03, L06, and L22;
4. rerun stable patch/content accounting against the resulting candidate;
5. verify the remote tip is still the audited `7ae6b344`;
6. run package and root gates plus independent lineage review;
7. promote by fast-forwarding remote main from the audited origin lineage.

The dirty local `main` worktree and a second dirty worktree also attached to `main` prohibit moving the local `main` ref in place. Promotion may not reinterpret their staged, unstaged, or untracked bytes. Preserve the old local-main commit and dirty trees independently; use the clean controller lineage for candidate validation and remote fast-forward only after the owner integrations above pass.

## No-delete retained-state inventory

Read-only inventory reports:

```text
99 registered worktrees
  20 stale-registry-only with absent filesystem
  13 clean-inactive candidates pending owner release
  16 clean detached/unique/ref-exclusive
   1 existing broken/ambiguous worktree
   3 runtime-pinned
   1 additional active task/process path
  45 remaining dirty/staged/unstaged/untracked
```

Critical retain paths include:

```text
canonical dirty/active main:
  /home/tryinget/ai-society/softwareco/owned/pi-extensions
selected governed runtime:
  /home/tryinget/.local/share/pi/live-worktrees/pi-extensions-a0a72e4c
selected SCI runtime:
  /home/tryinget/.local/share/pi/live-worktrees/pi-extensions-26fd79e5
active controller:
  /home/tryinget/ai-society/softwareco/owned/pi-extensions/.git/ak-4257-nexus
dirty duplicate main:
  /home/tryinget/.local/state/pi-worktrees/pi-extensions/ak-4081-sci-native
sole unreferenced detached commit:
  /home/tryinget/.local/state/pi-worktrees/pi-extensions/ak-4147-push-gate @ 9982214e
identity-ambiguous retained tree:
  /home/tryinget/.local/share/pi/live-worktrees/pi-extensions-f5384ff5 @ 29199dd1
unregistered rollback tree:
  /home/tryinget/.local/share/pi/live-worktrees/pi-extensions-edb96b46
```

The following exact 20 paths have absent filesystems and may receive targeted registry-metadata cleanup only after an immediate absence recheck:

```text
/tmp/pi-ext-agentvent-012
/tmp/pi-extensions-cleanup-4083
/tmp/pi-extensions-ontology-runner-3984
/tmp/pi-extensions-ontology-stage2-4017
/tmp/pi-extensions-release-wave
/tmp/pi-extensions-session-compaction-4025
/tmp/pi-model-selection-release-0.1.1
/tmp/pi-npm-bootstrap/pi-autoresearch
/tmp/pi-npm-bootstrap/pi-better-openai
/tmp/pi-npm-bootstrap/pi-context-overlay
/tmp/pi-npm-bootstrap/pi-designmd-foundry
/tmp/pi-npm-bootstrap/pi-peer-messaging
/tmp/pi-npm-bootstrap/pi-prompt-template-execution
/tmp/pi-npm-bootstrap/pi-provenance
/tmp/pi-npm-bootstrap/pi-runtime-registry
/tmp/pi-npm-bootstrap/pi-session-compaction
/tmp/pi-npm-bootstrap/pi-workstation-inference-provider
/tmp/pi-release-publish-fixes
/tmp/pi-snapshot-release-pr36
/tmp/pi-vault-publish
```

Do not run broad `git worktree prune`: Git also marks existing `/tmp/pi-release-automation` prunable, but its filesystem exists and its Git administrative linkage is broken. Preserve it pending owner recovery.

The 13 clean-inactive worktrees remain candidates only, not deletion authority:

```text
/home/tryinget/.local/state/pi-quests/worktrees/pi-extensions-01450151/governed-autoresearch-auto-continuation
/home/tryinget/.local/state/pi-quests/worktrees/pi-extensions-01450151/migrate-pi-evalset-lab-package
/home/tryinget/.local/state/pi-quests/worktrees/pi-extensions-01450151/pi076-integration-dogfood
/home/tryinget/.local/state/pi-quests/worktrees/pi-extensions-01450151/scope-unscoped-pi-packages
/home/tryinget/.local/state/pi-quests/worktrees/pi-extensions-ak4149-remote-main-rebuild/remote-main-1b976713
/home/tryinget/.local/state/pi-quests/worktrees/pi-extensions-ak4149-remote-main/reconcile
/home/tryinget/.local/state/pi-quests/worktrees/pi-extensions-ak4173-adoption/benchmark
/home/tryinget/.local/state/pi-quests/worktrees/pi-extensions-ak4207-refine/source-selection-v3
/home/tryinget/ai-society/softwareco/owned/.worktrees/pi-extensions-ak4203-bounded-cleanup-events
/home/tryinget/ai-society/softwareco/owned/.worktrees/pi-extensions-visible-loop-deep-review-4078
/tmp/pi-extensions-context-packer-4021
/tmp/pi-extensions-d53-3990-reconcile
/tmp/pi-extensions-retained-3997
```

The 16 clean detached, unique, or ref-exclusive trees also remain retained until individually archived and owner-released:

```text
/home/tryinget/.local/share/pi/live-worktrees/pi-extensions-0a4025a6
/home/tryinget/.local/share/pi/live-worktrees/pi-extensions-7ae6b344
/home/tryinget/.local/share/pi/live-worktrees/pi-extensions-9570427c
/home/tryinget/.local/share/pi/live-worktrees/pi-extensions-c70967ac
/home/tryinget/.local/state/pi-worktrees/pi-extensions/ak-4147-push-gate
/tmp/pi-extensions-stage2-current-origin-dogfood
/home/tryinget/.local/state/pi-quests/worktrees/pi-extensions-01450151/asc-release-version-truth-cleanup
/home/tryinget/.local/state/pi-quests/worktrees/pi-extensions-01450151/candidate-asc-execution-export-typecheck
/home/tryinget/.local/state/pi-quests/worktrees/pi-extensions-01450151/scope-unscoped-pi-packages-2
/home/tryinget/.local/state/pi-quests/worktrees/pi-extensions-ak4149-integration/current-main
/home/tryinget/.local/state/pi-quests/worktrees/pi-extensions-source-sci-ablation-v3/ak-4149-harness
/home/tryinget/.local/state/pi-worktrees/pi-extensions/ak-4159-lifecycle-v2-biome
/home/tryinget/.pi/tmp/pi-extensions-d53-identity-owner
/tmp/pi-extensions-ak4144-sci-read-startup
/tmp/pi-extensions-ak4147-sci-boundary-recovery
/tmp/pi-extensions-v1-4001
```

All 45 remaining dirty trees, all runtime/process-selected trees, all branch refs, all rollback roots, and all filesystem directories remain untouched.

## Audit provenance and review gate

Parallel read-only audits supplied the initial matrices:

```text
local cohorts:    dispatch-1785085064808
origin cohorts:   dispatch-1785085064809
cleanup inventory: dispatch-1785085064810
```

Acceptance still requires an independent reviewer to verify commit accounting, challenged dispositions, and the no-delete boundary against this exact document and current refs. Any tip movement invalidates this report until refreshed.
