---
summary: "Post-ADR implementation plan for the first bounded immutable Pi extension generation slice."
read_when:
  - "Implementing AK decision 125 or evaluating its first execution task."
type: "implementation_plan"
---

# Implementation plan: immutable Pi extension generations — first slice

Date: 2026-08-16  
Decision: AK 125  
ADR: `docs/adr/2026-08-16-immutable-pi-extension-generations.md`  
Authorization: operator requested post-ADR execution through verified dogfood

## Objective

Implement and dogfood the smallest truthful generation path:

- exact clean Git commit input;
- complete exported runtime generation outside editable worktrees;
- publish-last provenance;
- isolated Pi agent-directory activation and conditional rollback;
- fresh-process proof as primary;
- externally supervised reload measurement;
- process-level concurrency regression proving active G1 survives G2 installation and neighboring dependency churn.

## First supported canary

`packages/pi-agent-interaction-canary`

Reasons:

- one command and one tool;
- no production or local `file:` dependencies;
- no build/lifecycle output;
- no runtime filesystem, process, cache, or network effects;
- deterministic compact/expand and fail-closed behavior for dogfood.

The production CLI rejects unsupported build recipes and local dependency shapes in this first slice. Synthetic test fixtures exercise neighboring `file:` dependency churn without claiming broad package-family support.

## Owner and file scope

Root control-plane implementation:

- `scripts/pi-extension-generations.mjs`
- `scripts/pi-extension-generations/*.mjs`
- `scripts/pi-extension-generations.*.test.mjs`
- `package.json`
- `Justfile`
- `scripts/ci/full.sh`
- this plan, the validation/rollout/rollback document, and the final dogfood evidence note

No package source, package manifest, package lock, existing package `node_modules`, Pi operator settings, or historical mitigation code is in scope.

## Runtime contract

### Plan

`plan` requires:

- repository root;
- exact full commit;
- selected repo-relative package root;
- explicit generation state root.

It reads package inputs from the commit, not working-tree bytes, and emits a deterministic plan containing commit, package entrypoints, manifest/lock hashes, input digest, generation ID, and intended paths.

### Materialize

`materialize`:

1. acquires an exclusive generation lock;
2. exports the exact commit into a fresh candidate;
3. runs only the first-slice npm command `npm ci --omit=dev --ignore-scripts --legacy-peer-deps` when the selected package has runtime dependencies; otherwise records a no-install closure;
4. rejects tracked manifest/lock drift, local runtime dependencies, lifecycle/build requirements, symlink escapes, and unexpected generated outputs;
5. verifies extension entrypoint containment and hashes;
6. writes verification and provenance records;
7. publishes `generation.json` last using exclusive creation;
8. never replaces or deletes a published generation.

### Verify/status

Reconstruct and compare:

- commit and generation ID;
- package and entrypoint hashes;
- exact manifest/lock inputs;
- publication marker and verification result;
- selected package path under the generation;
- Pi process `sourceInfo.path` and `sourceInfo.baseDir` during dogfood.

### Isolated activation and rollback

Activation is accepted only for a newly created private agent directory beneath the caller’s explicit sandbox root. It:

- rejects symlink/non-regular settings state and unresolved journals;
- requires no running Pi process for primary activation;
- writes a mode-`0600` prepared journal before effect;
- performs a same-directory atomic settings replacement;
- records activated digest and completes the journal.

Rollback is conditional on the exact activated digest and restores prior bytes/mode. Digest mismatch fails closed. The CLI has no operator-home discovery, live-package deletion, or published-generation cleanup command.

## Tests

1. deterministic plan and commit-backed input proof;
2. dirty-working-tree bytes excluded from generation;
3. incomplete candidate never published;
4. same generation cannot be replaced;
5. manifest/lock/build/local-edge rejection for unsupported production paths;
6. private settings activation, mode, journal, crash-state recovery, and conditional rollback;
7. cross-scope/duplicate logical identity rejection in the isolated fixture;
8. provenance reconstruction and tamper detection;
9. active G1 Pi fixture repeatedly succeeds while G2 install/build churns and its neighboring `file:` dependency is absent/recreated;
10. activation yields only G2 in a fresh Pi process;
11. experimental reload yields only G2 with zero load errors and exact inventory;
12. rollback yields only G1 in a fresh process; same-process reload rollback is measured but not a recovery guarantee.

## Dogfood gates

Use only isolated clones/worktrees, exported generations, scratch package caches, and private Pi agent directories.

Dogfood must prove:

- exact Pi executable/version and source commit;
- G1 fresh-process command execution and source provenance;
- concurrent failed and successful G2 materialization do not change G1;
- G2 fresh-process activation and real canary compact/expand/fail-closed behavior;
- experimental G1 -> G2 reload with external full-inventory verification;
- conditional rollback and fresh-process return to G1;
- no G1/G2 mixed paths;
- all published generations retained.

## Explicit non-goals

- operator user/project settings;
- universal package graph support;
- automatic generation deletion;
- hosted git or registry package generations;
- transactional reload claims;
- upstream Pi changes;
- modification of commit `5e6e0611a` or its accepted behavior.
