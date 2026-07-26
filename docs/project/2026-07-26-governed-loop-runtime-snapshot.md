---
summary: "AK-4264 selection and proof of the immutable origin/main snapshot for temporary governed-loop runtime stabilization."
read_when:
  - "Executing AK-4265 live governed-loop runtime alignment."
  - "Checking why 7ae6b344 was selected instead of the older 29199dd1 live worktree."
type: "evidence-note"
status: "selected-awaiting-live-alignment"
date: "2026-07-26"
system4d:
  container: "Wave-1 runtime snapshot selection under AK-4263."
  compass: "Use one exact compatible package lineage before claiming governed execution."
  engine: "Compare candidates -> validate package family -> resolve transitive imports -> select -> hand off with rollback."
  fog: "A worktree name or successful direct tool can conceal a different actual commit or transitive import root."
---

# Governed-loop runtime snapshot selection

## Authority

AK task `4264` owns this read-only selection artifact.
AK task `4265` owns any later install, settings, reload, and dogfood effects.
This note does not activate a runtime or declare final canonical history.

## Decision

Select exact commit:

```text
7ae6b3440fd6606593b7243d6782158703a6e278
```

for the temporary Wave-1 governed-loop runtime package family.
The selected commit is protected by:

```text
refs/preserve/ak-4263/origin-main-7ae6b344
```

The selection is an immutable commit identity, not the moving name `origin/main`.
If the remote-tracking ref advances, AK-4265 continues to use the selected hash unless a new review explicitly supersedes it.

This does not decide the final consensus baseline for canonical history.

## Candidate comparison

### Candidate A — `29199dd1`

Observed strengths:

- exact commit `29199dd121b9ee6326f9a4a55cd2cb0f5c59449b`;
- contains complete governed deep-review commit `f5384ff5`;
- AK-4110 records prior live governed proof;
- package family resolves orchestrator Vault and ASC imports within one source root;
- package versions are internally coherent:
  - little-helpers `0.4.0`;
  - toolbox `0.2.0`;
  - orchestrator `0.4.0`;
  - Vault `0.3.0`;
  - ASC `0.2.1`;
  - peer messaging `0.2.0`.

Observed blockers:

- the live path name `pi-extensions-f5384ff5` does not identify its actual HEAD `29199dd1`;
- the worktree contains 18 untracked diary/learning files and is not a clean activation source;
- current package validation fails in little-helpers on five Biome/import/format findings in candidate-lifecycle v2 files;
- Toolbox and peer-messaging checks cannot run in that worktree without restoring their missing local development dependencies;
- origin later repaired the little-helpers validation drift.

Disposition: `covered` and preserved as historical live-proof ancestry, but rejected as the new activation snapshot.

### Candidate B — `7ae6b344`

Observed strengths:

- contains `29199dd1` and complete governed deep-review commit `f5384ff5` by ancestry;
- retains the exact Vault `deep-review -> workflow_execute` binding and orchestrator `deep-review.v1` adapter;
- contains later little-helpers candidate-lifecycle quality fixes;
- contains later Toolbox SCI baseline integration without changing the governed-review binding owners;
- relevant package versions remain compatible with Candidate A;
- exact package and host canaries pass as recorded below.

Observed caveat:

- this is a temporary runtime snapshot selected from one side of the still-divergent history;
- local-only accepted topics, including later bound-loop and D2E work, still require consensus review and reconciliation;
- final canonical runtime activation remains a later AK-4263 wave.

Disposition: `accept_exact` for reversible Wave-1 runtime stabilization only.

## Validation evidence

### Ancestry and source integrity

Observed:

```text
7ae6b344 contains f5384ff5: yes
7ae6b344 contains 29199dd1: yes
tracked diff after validation: none
```

The selected hash is preserved independently of moving branches.

### Package checks

Exact selected-source checks:

| Package | Result |
| --- | --- |
| `pi-little-helpers` | pass; 143/143 tests; release quick check pass |
| `pi-toolbox-discovery` | pass; 39/39 tests; release quick check pass |
| `pi-peer-messaging` | pass; 45/45 tests; release quick check pass |
| `pi-society-orchestrator` | pass on `29199dd1`; package tree unchanged through `7ae6b344` |
| `pi-vault-client` | pass on `29199dd1`; package tree unchanged through `7ae6b344` |
| `pi-autonomous-session-control` | pass on `29199dd1`; package tree unchanged through `7ae6b344` |

The little-helpers check was rerun in the real selected Git worktree because archive-only validation cannot execute its restoration-verified `git bundle verify` tests.
The first archive probe failed only because the extracted tree intentionally had no Git repository; the same source passed all 143 tests in the real worktree.

### Root Pi host compatibility

Command:

```bash
npm run compat:canary
```

Observed result:

```text
profile: current
host: @earendil-works/pi-coding-agent@0.80.6
selected: 8
passed: 8
failed: 0
```

The canary covered interaction coexistence, Vault live trigger behavior, ASC parallel event correlation and settlement, prompt-mode base composition, autoresearch packet contracts, and orchestrator/autoresearch supervision seams.

### Same-root dependency resolution

From the selected source root, orchestrator resolved:

```text
@tryinget/pi-vault-client/dispatch-runtime
  -> <selected-root>/packages/pi-vault-client/src/dispatchRuntime.js
@tryinget/pi-vault-client/prompt-plane
  -> <selected-root>/packages/pi-vault-client/src/promptPlane.js
@tryinget/pi-autonomous-session-control/execution
  -> <selected-root>/packages/pi-autonomous-session-control/execution.ts
```

No resolver target crossed into the primary local-main checkout or an older live worktree.

### Binding materialization

The selected Vault policy reported:

```text
template_name: deep-review
posture: orchestrator_workflow_gate_required
execution_surface: workflow_execute
workflow_id: deep-review.v1
registry_id: a6b456f3e4598520030e83b6b69b453fca65f49517fba26197c55ed4ddbd03f2
```

The selected orchestrator materialized the exact one-step reviewer graph with the caller objective and returned `workflowId=deep-review.v1`.
This is a static same-root execution-path proof; AK-4265 still must prove the installed live process and real Vault handoff.

## AK-4265 activation contract

### Required source layout

Create or select one clean detached runtime worktree at exact `7ae6b344`.
The directory name must include `7ae6b344`, and preflight must verify actual `HEAD` equals the full selected hash.
Do not reuse the dirty path named `pi-extensions-f5384ff5`.

All governed-loop packages and transitive local owners must come from that one root:

- `pi-little-helpers`;
- `pi-toolbox-discovery`;
- `pi-society-orchestrator`;
- `pi-vault-client`;
- `pi-autonomous-session-control`;
- `pi-peer-messaging`;
- `pi-autoresearch`;
- `pi-interaction/pi-interaction`;
- `pi-interaction/pi-editor-registry`;
- `pi-interaction/pi-interaction-kit`;
- `pi-interaction/pi-runtime-registry`;
- `pi-interaction/pi-trigger-adapter`;
- `pi-ontology-workflows`;
- `pi-prompt-template-accelerator`.

The list is closed for this snapshot. Adding another selected-root dependency requires updating the manifest and provenance probe before activation.

### Deterministic dependency materialization

A clean Git worktree does not contain `node_modules`, and `pi install <local-path>` records the source path rather than materializing that package's dependencies. AK-4265 must therefore prepare dependencies before changing Pi settings.

In the fresh selected root:

1. record hashes of every selected package manifest and lockfile;
2. run `npm ci --ignore-scripts --no-audit --no-fund` for each listed package that has a lockfile;
3. because orchestrator currently declares ASC as a registry range rather than a local `file:` dependency, replace only its installed ASC dependency with the selected sibling using `npm install --no-save --package-lock=false ../pi-autonomous-session-control`;
4. rerun package-manifest and lockfile hashes and fail on any tracked change;
5. use `import.meta.resolve`, `realpath`, and module-owned provenance output to verify every local owner import below resolves beneath the selected root:
   - orchestrator -> Vault;
   - orchestrator -> ASC;
   - orchestrator -> autoresearch;
   - autoresearch -> Vault;
   - Vault -> interaction-kit;
   - Vault -> runtime-registry;
   - Vault -> trigger-adapter;
   - trigger-adapter -> interaction-kit;
   - interaction -> editor-registry;
   - interaction -> interaction-kit;
   - interaction -> trigger-adapter;
   - editor-registry -> trigger-adapter;
   - ontology-workflows -> editor-registry;
   - ontology-workflows -> trigger-adapter;
   - prompt-template-accelerator -> runtime-registry;
   - prompt-template-accelerator -> trigger-adapter;
   - little-helpers peer-messaging fallback/direct owner;
6. reject duplicate physical copies of runtime-registry or any resolved local owner outside the selected root.

Materialization occurs only in the new snapshot. Existing live source trees and their dependency state remain untouched.

### Pre-effect manifest

Before `pi install` or settings mutation, record:

1. current `pi list` source for every replaced top-level package: little-helpers, Toolbox, orchestrator, Vault, ASC, peer-messaging, autoresearch, interaction, ontology-workflows, and prompt-template-accelerator;
2. exact current settings entries without secret values;
3. current source HEAD and tracked/dirty state;
4. selected replacement paths and full selected hash;
5. package versions and resolver targets;
6. exact rollback commands and old source paths;
7. active Pi sessions that still execute old paths.

Do not delete or repoint old live paths during Wave 1.

### Activation proof

After aligned install and `/reload`, require one same-process provenance probe and one real governed call.
The call must return:

```text
details.ok = true
executionSurface = workflow_execute
handoffId = non-empty exact Vault handoff
status = done
```

The proof must show the tool registration owner and every closed-list transitive owner import resolve beneath the selected root. It must also prove direct Vault/ASC tools and orchestrator-internal Vault/ASC imports share the same physical module lineage.
A success-shaped result without matching source provenance is insufficient.

### Rollback

Rollback restores every previous settings-resolved package source as one transaction, reloads Pi, and verifies exact active-tool readback plus the prior resolver roots.

Forward materialization occurs only in a newly named snapshot path, so rollback must not edit or reconstruct old `node_modules`. It leaves the failed new snapshot quarantined and unchanged until no active session references it, then removes it only through the later cleanup owner. If materialization touched an old source path, rollback is invalid and execution stops.

If either forward activation or rollback produces mixed provenance, stop all governed loop launches and require an operator-visible reload/restart before further use.

## Non-authorizations

This selection does not authorize:

- changing canonical `main` or `origin/main`;
- integrating or rejecting unrelated history topics;
- deleting the old live worktrees;
- bypassing the candidate lifecycle hold for candidate execution;
- claiming the production preflight/cross-package canary is implemented;
- completing AK-4257 or AK-4263;
- treating package checks or static binding materialization as live governed execution.
