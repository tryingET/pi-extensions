---
summary: "Validation, isolated rollout, rollback, and dogfood gates for the first immutable Pi extension generation implementation."
read_when:
  - "Validating, activating, rolling back, or dogfooding AK decision 125."
type: "validation_rollout_rollback"
---

# Validation, rollout, and rollback: immutable Pi extension generations

Date: 2026-08-16  
Decision: AK 125  
Scope: first `pi-agent-interaction-canary` slice only

## Safety invariants

- Install and lockfile effects occur only in isolated clones/worktrees or unpublished generation candidates.
- No checkout used by a live consumer has `node_modules` deleted or regenerated.
- Operator Pi settings and managed npm/git roots are out of scope.
- Pi dogfood uses a private `PI_CODING_AGENT_DIR` and private empty cwd.
- Published generations are never deleted.
- Candidate extension code is trusted code; isolated settings are not represented as an OS security sandbox.
- Reload is experimental and externally verified; fresh-process activation is authoritative.

## Validation ladder

### V0 — static and unit

- syntax and root test integration;
- deterministic plan/provenance fixtures;
- path, symlink, mode, and containment rejection;
- manifest/lock tamper tests;
- durable journal state and conditional rollback tests.

### V1 — isolated materialization

From an isolated clean commit containing the implementation:

- materialize G1 and G2 under a private generation state root;
- verify source commit, input digest, manifest/lock/entrypoint hashes, Pi host identity, and published marker;
- inject candidate failures before publication and prove G1 remains unchanged;
- retain candidate failure receipts and every published generation.

### V2 — concurrency regression

Start a fresh Pi process from a verified fixture G1. Repeatedly invoke its command while another process:

- builds G2 in a different candidate root;
- temporarily omits and recreates G2’s neighboring `file:` dependency;
- runs isolated install churn;
- fails once before publication, then completes a new candidate.

Require every G1 invocation to succeed with only G1 provenance. Before activation, fresh Pi must still resolve only G1.

### V3 — real canary fresh process

Activate exact G2 `pi-agent-interaction-canary` path in a private agent directory. A fresh offline Pi RPC process must:

- report zero extension-load errors;
- enumerate `/agent-interaction-canary` from the exact G2 path/baseDir;
- contain no editable-checkout or G1 paths;
- execute compact then expand with stable generation/source/policy bindings;
- fail closed on one altered expected digest.

A real tool-dispatch proof may use an authenticated model only if no secrets enter receipts and no unrelated tool is active. Command-handler dogfood is mandatory and does not depend on paid inference.

### V4 — experimental reload

In one supervised private Pi RPC process:

1. start from G1;
2. activate G2 externally after the G2 generation is complete;
3. invoke `ctx.reload()` through the fixture command;
4. externally assert zero extension errors, full expected inventory, only G2 paths, and successful G2 command behavior.

Failure triggers settings rollback followed by a fresh process. Same-process recovery is not claimed.

### V5 — rollback

- conditionally restore exact G1 settings bytes/mode using the activation journal;
- fresh process reports zero load errors and only G1 provenance;
- optionally measure reload back to G1, without treating it as the recovery guarantee;
- retain both G1 and G2.

### V6 — repository validation

- focused Node tests;
- `git diff --check`;
- scoped fast loop validation;
- explicit wide root CI because scripts/package/Justfile/CI surfaces change;
- fresh-process dogfood receipt reviewed independently.

## Rollout

1. implementation and unit tests in an isolated worktree;
2. isolated fixture generation and concurrency proof;
3. real canary generation in a private agent directory;
4. fresh-process dogfood;
5. experimental reload measurement;
6. conditional rollback proof;
7. independent evidence review;
8. AK task completion only after all required gates pass.

No operator-settings canary or upstream issue is part of this rollout.

## Rollback and stop conditions

Stop and retain state when:

- source commit or Pi host identity drifts;
- manifest, lock, or entrypoint hashes differ;
- any package path escapes the selected generation;
- extension-load diagnostics are non-empty;
- G1/G2 paths mix;
- current settings digest differs from the activated digest;
- a journal is unresolved;
- a published generation would need modification or deletion;
- the active G1 command fails during G2 churn;
- repository validation fails for task-owned paths.

Rollback never reconstructs or edits G1. It restores exact prior settings conditionally, starts a fresh Pi process, verifies G1 provenance and behavior, and leaves all published generations intact.

## Completion evidence

The final evidence note records:

- task and decision IDs;
- exact implementation commit;
- exact Pi executable/version;
- isolated clone/worktree, generation, and agent-directory paths;
- G1/G2 generation IDs and manifests;
- commands and exit status for every gate;
- concurrency trace;
- fresh-process, reload, rollback, and provenance observations;
- retained generations and unresolved limitations;
- independent review disposition.
