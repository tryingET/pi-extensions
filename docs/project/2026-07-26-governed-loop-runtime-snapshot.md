---
summary: "AK-4264/4276 selection and proof of the immutable promoted snapshot for temporary governed-loop runtime stabilization."
read_when:
  - "Executing AK-4265 live governed-loop runtime alignment."
  - "Checking why 0a4025a6 superseded validated base 7ae6b344 and older live worktree 29199dd1."
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

AK task `4264` owns the initial read-only selection at `7ae6b344`.
AK task `4276` owns the reviewed supersession after governed dogfood found an undeclared autoresearch dependency and AK-4274 repaired it.
AK task `4265` owns install, settings, reload, rollback, and dogfood effects.
This note does not declare final canonical history.

## Decision

Select exact commit:

```text
0a4025a6b895b65e2128b972be8169cc99640428
```

for the temporary Wave-1 governed-loop runtime package family.
It contains validated origin snapshot `7ae6b3440fd6606593b7243d6782158703a6e278` plus the accepted AK-4274 autoresearch dependency repair.
The selected commit is protected by:

```text
refs/preserve/ak-4263/runtime-snapshot-0a4025a6
```

Initial selection `7ae6b344` remains protected by `refs/preserve/ak-4263/origin-main-7ae6b344`; it is superseded, not rewritten or concealed.
The selection is an immutable commit identity, not a moving branch name.
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

Disposition: `covered` as the validated base for the promoted runtime snapshot.

### Candidate C — `0a4025a6`

A fresh Pi process loaded the aligned `7ae6b344` sources and successfully executed governed deep-review through `workflow_execute`, returning handoff `dc7685c6-1add-46c0-897c-a8274b2abaec`. The review then found a partial-runtime defect: `pi-autoresearch` dynamically imported the trigger surface without declaring a resolvable package dependency.

AK-4274 added the precise required `@tryinget/pi-trigger-adapter` dependency, regenerated the lockfile from a clean package graph, added direct functional resolution coverage, passed 235 package tests with one environment-dependent skip plus release quick checks, and received independent ACCEPT review.

Exact commit `0a4025a6b895b65e2128b972be8169cc99640428` contains the validated base and that repair.

Disposition: `accept_exact` for reversible Wave-1 runtime stabilization only.

## Validation evidence

### Ancestry and source integrity

Observed:

```text
0a4025a6 contains 7ae6b344: yes
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
| `pi-autoresearch` dependency repair | pass at `0a4025a6`; 235 tests passed, one environment-dependent test skipped, release quick pass |

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

Exact `0a4025a6b895b65e2128b972be8169cc99640428` remains the validated Wave-1 base and rollback point. The production recurrence-prevention runtime must use a separately reviewed immutable descendant that contains the accepted AK-4267 preflight/canary implementation. AK-4265 must record that full descendant hash before materialization or settings mutation; this note does not invent it before commit/review.

The directory name must include the selected commit prefix, and preflight must verify actual `HEAD` and the generated materialization manifest match that full hash.
Do not reuse the dirty path named `pi-extensions-f5384ff5` or mutate the currently installed `0a4025a6` rollback source in place.

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

The earlier direct `npm ci --omit=dev --omit=peer` recipe was proven incomplete: `pi-trigger-adapter` synchronously imports non-optional peer `typebox`, while the selected runtime packages carry it only as development/peer metadata. Hydrated development checks therefore passed while a clean production topology failed.

Use the AK-4267 root owner executable instead of reconstructing the sequence manually:

```bash
npm run governed:runtime -- materialize \
  --source-root /absolute/path/to/clean-immutable-worktree \
  --expected-commit <full-selected-sha>

npm run governed:runtime -- verify \
  --source-root /absolute/path/to/materialized-worktree \
  --expected-commit <same-full-sha>
```

The executable:

1. requires an explicit full expected SHA, verifies that exact commit and immutable path name, and rejects staged, unstaged, or ordinary untracked source;
2. records the exact 28-file hash map for `package.json` plus `package-lock.json` across all 14 selected packages;
3. materializes production dependencies with development and peer packages omitted;
4. accepts only the exact pre-repair `MODULE_NOT_FOUND` for `typebox` from `pi-trigger-adapter`;
5. installs one integrity-pinned peer layer containing `typebox@1.1.38` plus Pi AI/coding-agent/TUI host packages at `0.80.6`, then links each runtime consumer to the corresponding single physical owner;
6. aligns orchestrator ASC and little-helpers peer messaging to selected siblings;
7. reruns package-manifest and lockfile hashes and fails on tracked change;
8. resolves every closed-list local edge from the real consumer context, requires its exact package name/root, and rejects cross-root owners or registry duplication across the enumerated registry consumers;
9. imports the actual autoresearch trigger picker and requires a functional trigger surface;
10. writes the mode-`0600` v3 manifest at `packages/pi-society-orchestrator/node_modules/.tryinget-governed-runtime.json`; verification and production preflight independently reconstruct cleanliness, package-input, resolution-owner, registry, Typebox, and Pi-host peer root/version/SRI/tree-digest proofs instead of trusting declarative fields.

Materialization occurs only in the new snapshot. Existing live source trees, settings, and dependency state remain untouched. The executable has no Pi install, reload, Git cleanup, or worktree deletion behavior.

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

After aligned install and `/reload`, require the production same-process preflight, one real governed call, and visible/Nexus release proof.
The call must return:

```text
details.ok = true
executionSurface = workflow_execute
handoffId = non-empty exact Vault handoff
status = done
preflightNonce = exact pending loop nonce
preflightReceiptDigest = exact fresh owner-branded loop receipt digest
preflightRegistryId = exact loaded Vault policy registry id
```

The proof must show the little-helpers caller, Toolbox registration, orchestrator tools, direct Vault/ASC tools, deferred orchestrator Vault/ASC imports, and every closed-list transitive owner resolve beneath the selected root. The loop must release the Nexus frontier exactly once after receipt correlation.
A success-shaped result without matching source provenance is insufficient. Implementation contract: `docs/project/2026-07-26-governed-deep-review-preflight-canary.md`.

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
- claiming the implemented preflight/cross-package canary is installed or live-proven before AK-4265 reload and dogfood;
- completing AK-4257 or AK-4263;
- treating package checks or static binding materialization as live governed execution.
