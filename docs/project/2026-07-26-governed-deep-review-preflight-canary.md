---
summary: "AK-4267 design and verification contract for same-process governed deep-review startup preflight, deterministic materialization, and real-owner canary."
read_when:
  - "Changing visible/Nexus startup, Vault deep-review binding execution, or runtime snapshot materialization."
  - "Diagnosing why a governed review failed before child_started or why a source root was rejected."
type: "implementation-evidence-note"
status: "implemented-awaiting-promoted-snapshot-dogfood"
date: "2026-07-26"
system4d:
  container: "AK-4267 recurrence-prevention leaf under AK-4263."
  compass: "Reject mixed provenance before a loop lease, ACK, prompt, authorization, or reviewer dispatch."
  engine: "Materialize one source root -> preflight owner graph -> issue nonce receipt -> execute real Vault/orchestrator seam -> correlate little-helpers barrier."
  fog: "Registered tools and success-shaped events can conceal different physical package lineages or missing production peers."
---

# Governed deep-review preflight and cross-package canary

## Authority and boundary

AK task `4267` owns this implementation. AK task `4265` still owns Pi package installation, settings, reload, live dogfood, and rollback. This note records implementation and local verification; it does not claim the current Pi process reloaded the new code or that canonical history is converged.

The implementation does not execute Prompt Vault bytes from raw retrieval. The only executable route remains:

```text
Vault immutable dispatch policy
-> prompt-plane dispatch authorization
-> durable package-owned handoff
-> orchestrator deep-review.v1 adapter
-> workflow executor
-> exact handoff/preflight receipt correlation
```

## Startup membrane

`pi-society-orchestrator` registers a process-local owner runtime under the global symbol:

```text
tryinget.pi.governed-deep-review-preflight.v1
```

The symbol is discovery only, not authentication. Little Helpers dynamically imports the runtime's declared owner module and requires its private `WeakSet` brand to recognize the exact runtime object and receipt object. Replacing the public global slot with a success-shaped fixture fails before `prepare` runs.

`pi-little-helpers` invokes that owner only when the persisted loop prompt sequence contains the exact governed deep-review prompt. The invocation occurs before the iteration lease, `child_started`, intercom ACK, plan persistence, or first prompt.

The owner verifies:

- the visible-loop caller and deferred Vault/ASC imports share one physical source root, while `toolbox`, orchestrator tools, direct Vault tools, and direct ASC tools each report the exact expected owner extension file;
- the current Vault database exposes active visible `deep-review` with posture `orchestrator_workflow_gate_required`;
- the loaded immutable registry contains exact `deep-review -> workflow_execute` and the package-owned adapter materializes only `deep-review.v1`;
- the handoff store is package-owned and its exact path has a writable, non-symlink materialization route without writing a fake receipt;
- the v2 materialization manifest matches the loaded Git root/commit, while production preflight independently recomputes source cleanliness, 28 package-input hashes, every closed-list resolution and expected owner, the bounded registry singleton, and the pinned Typebox root/version/integrity/tree digest;
- `toolbox`, `workflow_execute`, and `vault_execute_template` are registered and active after an exact active-set readback.

If activation mutates and any later preflight check fails, the exact previous active set is restored and verified. A failed preflight writes one terminal invalidation record and cannot be retried from the same run config. The failure path creates no loop lease, child start, ACK, or prompt.

A successful preflight issues an owner-branded receipt with a SHA-256 corruption digest bound to:

- random nonce;
- run id and canonical cwd;
- process id;
- exact source root and Git commit;
- orchestrator, Vault, and ASC owner module locations;
- Vault policy registry id;
- `deep-review.v1`;
- registered/active/activated tools;
- dispatch handoff-store path;
- materialization manifest path.

Little Helpers binds the owner-branded nonce to the exact observed `toolCallId`; the orchestrator can claim it only with that same tool call immediately before real Vault handoff dispatch. The orchestrator settles it with the workflow result and returns the nonce/digest/registry id. Little Helpers accepts the barrier only when those values match its startup receipt plus the exact non-empty Vault handoff and `status=done`. A parsed persisted receipt cannot authorize recovery: recovery must obtain a fresh owner preflight first. Tools introduced by preflight are reference-counted across overlapping runs and released only after the final owning lease settles or cancels.

## Deterministic runtime materializer

Root entrypoint:

```bash
npm run governed:runtime -- materialize \
  --source-root /absolute/path/to/clean-immutable-worktree \
  --expected-commit <full-40-char-sha>

npm run governed:runtime -- verify \
  --source-root /absolute/path/to/materialized-worktree \
  --expected-commit <same-full-sha>
```

The materializer deliberately has no `pi install`, settings edit, reload, Git cleanup, worktree removal, or branch operation.

It requires an explicit full `--expected-commit`, a clean exact Git commit, and a path containing the commit prefix. Clean means no staged/unstaged changes and no ordinary untracked source; generated `node_modules` paths are excluded. It hashes the exact `package.json` and `package-lock.json` pair for all 14 closed-list packages and runs production installs with dev and peer dependencies omitted. Before repair it accepts only the exact `MODULE_NOT_FOUND` for `typebox` from `pi-trigger-adapter`; that historical observation is recorded but is not treated as current-state authentication. It then creates one pinned Typebox peer layer at `1.1.38`, verifies npm SRI plus installed-tree digest, links every runtime Typebox consumer to that one physical package, aligns orchestrator ASC to the selected sibling, and aligns little-helpers peer messaging.

Verification reconstructs the v2 proof instead of trusting declarative manifest fields. It resolves every closed-list imported surface from its consumer context, requires the exact package name and canonical owner root for each edge, and requires one physical `pi-runtime-registry` across the enumerated registry consumer contexts. It rechecks Typebox root/version/SRI/tree digest and every consumer resolution, and imports the actual autoresearch trigger picker to require a functional post-repair surface. Source, package-input, resolution, registry, or Typebox drift is fatal.

The final mode-`0600` manifest is written under ignored runtime dependencies:

```text
packages/pi-society-orchestrator/node_modules/.tryinget-governed-runtime.json
```

A reinstall that removes this manifest intentionally causes production preflight to fail closed until materialization is rerun.

## Real-owner canary

Command:

```bash
npm run governed:runtime -- canary --source-root "$PWD"
```

The canary uses an inert Dolt fixture and a deterministic reviewer executor; it does not launch a model reviewer. Everything around that deterministic leaf is real package owner code:

```text
real Toolbox orchestrator-gated activation
-> real little-helpers child startup
-> real same-process orchestrator preflight
-> real Vault dispatch check and prompt-plane authorization
-> real dispatch guard and durable handoff
-> real deep-review.v1 materializer
-> deterministic reviewer leaf
-> real orchestrator result correlation
-> real little-helpers barrier verification
-> exactly-once Nexus frontier release
```

The canary does not inject a success-shaped `vault_execute_template` event. It calls the registered owner tool and forwards its actual result to Little Helpers.

Observed local proof on the AK-4267 implementation worktree:

```text
ok=true
ownerExecution=true
syntheticToolReceipt=false
executionSurface=workflow_execute
status=done
registryId=a6b456f3e4598520030e83b6b69b453fca65f49517fba26197c55ed4ddbd03f2
nexusReleaseCount=1
```

Handoff ids are volatile per run. The latest local run produced a non-empty durable handoff; no observed handoff is reusable authorization.

## Failure expectations

The previously observed mixed local-main / fixed-Vault / detached-ASC runtime fails before child startup because at least one of these comparisons differs:

- caller root versus orchestrator root;
- orchestrator deferred Vault root versus direct `vault_dispatch_check` owner root;
- orchestrator deferred ASC root versus direct `dispatch_subagent` owner root;
- selected-root materialization manifest versus loaded root/commit.

Toolbox activation alone still does not satisfy preflight or execution proof.

## File-size exception

The root executable currently keeps materialization, verification, and the real-owner canary in one auditable entrypoint and exceeds the default 500-LOC code budget. The two security-critical owner modules (`governed-deep-review-preflight.ts` and `governed-runtime-materialization.ts`) also remain over the default LOC budget so their closure-owned branding/lease state and reconstructed proof stay inspectable without another runtime import boundary during stabilization. AK-4267 records these as owner-scoped exceptions rather than hiding secondary executable entrypoints outside its allowed scope. A later package/root-maintenance task may split pure inventory and harness modules while retaining `scripts/governed-deep-review-canary.mjs` as the sole operator entrypoint; that behavior-preserving refactor is not required for the live-runtime proof owned by AK-4265.

## Rollback

Code rollback is the bounded AK-4267 commit revert. The pre-existing post-prompt deep-review barrier remains fail-closed.

Runtime rollback remains AK-4265-owned: restore the prior settings transaction, reload, and verify old owner roots. Do not delete the promoted or prior runtime snapshots during this leaf.

## Remaining live proof

After the accepted AK-4267 commit is materialized in a new immutable runtime snapshot, AK-4265 must:

1. install every top-level owner from that one root;
2. reload Pi;
3. prove the production preflight manifest/root/commit in a fresh process;
4. execute the exact real governed deep-review call;
5. run a visible/Nexus child through exactly-once Nexus release;
6. retain rollback until those proofs are accepted.
