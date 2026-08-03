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

AK task `4267` owns the original implementation. AK task `4282` owns the fail-closed hardening discovered during AK-4265 dogfood. AK task `4265` still owns Pi package installation, settings, reload, live dogfood, and rollback. This note records implementation and local verification; it does not claim the current Pi process reloaded the new code or that canonical history is converged.

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

The symbol is discovery only, not authentication. Little Helpers derives the one exact sibling orchestrator owner-module URL and native owner-registry URL from its own physical source root, rejects any different runtime-declared URL, and accepts only the exact runtime recognized by that canonical registry before `prepare` runs. It never executes a runtime-selected module. A success-shaped forged slot with either a non-canonical or canonical declared URL fails before `prepare`.

Actual Pi loads separate extensions through distinct TypeScript module caches, so a TypeScript-module-local `WeakSet` cannot authenticate across the Little Helpers/orchestrator boundary even when both URLs are identical. The shared identity therefore lives in a package-owned native `.mjs` module that the orchestrator imports statically and Little Helpers imports dynamically only through its derived canonical URL when governed preflight is requested; ordinary standalone Little Helpers loading does not require the orchestrator package. The actual Pi loader probe observes one shared native-ESM registry across the otherwise distinct extension loaders. Node's native ESM module map is not exposed through `require.cache`: mutable and non-configurable fake CommonJS entries at the exact `.mjs` path are ignored, including when the latter is combined with a canonical-URL forged global runtime. Minting a newer genuine runtime revokes stale-runtime attestation. Receipt branding remains private to the runtime closure.

The registry's exact structured-callsite check is defense in depth against direct callers and `Error.prepareStackTrace` replacement, not a JavaScript privilege boundary. No same-process JavaScript design can authenticate against arbitrary already-executing equal-privilege code that can replace Node loader internals or synthesize a VM frame with the canonical filename. The implemented and tested threat boundary is narrower: stale or forged global slots, runtime-selected owner URLs, CommonJS cache preemption of the exact owner path, stale-runtime replay, and mixed physical roots. Equal-privilege native-loader or VM tampering must be excluded by trusted Pi bootstrap or moved to process isolation; it is not represented here as solved behavior.

`pi-little-helpers` invokes that owner only when the persisted loop prompt sequence contains the exact governed deep-review prompt. The invocation occurs before the iteration lease, `child_started`, intercom ACK, plan persistence, or first prompt.

The owner verifies:

- the visible-loop caller and deferred Vault/ASC imports share one physical source root, while `toolbox`, orchestrator tools, direct Vault tools, and direct ASC tools each report the exact expected owner extension file;
- the current Vault database exposes active visible `deep-review` with posture `orchestrator_workflow_gate_required`;
- the loaded immutable registry contains exact `deep-review -> workflow_execute` and the package-owned adapter materializes only `deep-review.v1`;
- the handoff store is package-owned and its exact path has a writable, non-symlink materialization route without writing a fake receipt;
- the v5 materialization manifest matches the loaded Git root/commit, while production preflight independently recomputes source cleanliness, 28 package-input hashes, the npm executable/policy receipt, every closed-list resolution and expected owner, the bounded registry singleton, the complete installed peer-closure lock/tree proof, both retained ASC build receipts, and pinned Typebox plus all four Pi-host package roots/versions/integrities/resolutions/tree digests;
- `toolbox`, `workflow_execute`, and `vault_execute_template` are registered and active after an exact active-set readback.

If activation mutates and any later preflight check fails, the exact previous active set is restored and verified. Before owner preflight, Little Helpers atomically claims one run-scoped attempt and authoritatively records `started`. A terminal `succeeded` or `failed_closed` record must pair with that nonce. Malformed JSONL, an unmatched start, failed failure-record persistence, failed receipt cancellation, a concurrent attempt, an `ACTIVE` lease not owned by the exact process/session, or a `LAUNCHING` lease without its exact claim token all block retry before another owner preflight. The existing explicit `FAILED`-lease recovery contract remains eligible. The attempt claim is released only after verified cancellation or safe transfer into installed active state. The failure path creates no loop lease, child start, ACK, or prompt.

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

# Explicit exception for an exact Pi version already active on the workstation:
# reuse only the four SRI-pinned host tarballs already present in npm cache.
npm run governed:runtime -- materialize \
  --source-root /absolute/path/to/clean-immutable-worktree \
  --expected-commit <full-40-char-sha> \
  --verified-host-cache

npm run governed:runtime -- verify \
  --source-root /absolute/path/to/materialized-worktree \
  --expected-commit <same-full-sha>
```

The materializer deliberately has no `pi install`, settings edit, reload, Git cleanup, worktree removal, or branch operation.

It requires an explicit full `--expected-commit`, a clean exact Git commit, and a path containing the commit prefix. Production `materialize` is strictly fresh-root and one-shot: a recursive lexical inventory rejects every pre-existing `node_modules` entry anywhere under the standalone candidate, including Git-ignored source-adjacent roots, as well as ASC `dist`, manifest, receipt, or quarantine targets. A process-external mode-`0600` `O_EXCL` lock lives in a deterministic sibling directory keyed by canonical source root, independent of `TMPDIR`/XDG choices, and serializes cooperating materializers across the entire transaction. A failed candidate is durably quarantined under its generated root and cannot be retried in place; create a new commit-named standalone candidate instead. The materializer never intentionally deletes or replaces a prior materialization.

Clean means no staged/index changes, no `assume-unchanged` or `skip-worktree` bits, no working-tree byte or mode drift against a fresh alternate index populated from `HEAD`, and no ordinary untracked source; generated `node_modules` paths and ignored generated ASC `dist/` outputs are excluded from Git cleanliness but covered by separate runtime proofs. The fresh-HEAD comparison does not trust the live index stat cache or its concealment flags. It hashes the exact `package.json` and `package-lock.json` pair for all 14 closed-list packages. Production dependency installs first build the complete package set under one ignored UUID-named generation root. Their projected manifests omit every local owner named by the closed `LOCAL_EDGES` graph, all shared Typebox/Pi host peers, file-backed declarations, and dev/peer inputs outside the ASC compiler slice; links are added only after npm's hidden locks describe the retained physical closure, and any replaced lock entries are removed. Only after every install, local-owner alignment, peer closure, and Typebox reproduction has succeeded does the materializer publish each package `node_modules` with creation-only `symlinkSync` to its physical subtree in that retained generation. An appearing target produces `EEXIST`; no directory rename can replace it, and the generation is never removed after publication. Tracked source manifests are never rewritten.

Before repair the materializer accepts only the exact `MODULE_NOT_FOUND` for `typebox` from the staged `pi-trigger-adapter`; that historical observation is recorded but is not treated as current-state authentication. It creates one pinned peer layer containing `typebox@1.3.7`, `pi-ai@0.83.0`, `pi-agent-core@0.83.0`, `pi-coding-agent@0.83.0`, `pi-tui@0.83.0`, and the complete npm-installed runtime dependency closure. Before any npm effect it records and validates the exact Node executable and npm CLI realpaths, bytes, device/inode, size, modes, npm version, dynamic effective `before`, `min-release-age >= 7`, canonical registry, real cache/TMPDIR roots, disabled offline/prefer-offline/force posture, and absence of policy-impacting npm environment overrides. Every `ci`, cache `pack`, and peer `install` effect revalidates both executables before and after running as `<exact-node> <exact-npm-cli> ...` under a closed sanitized environment: the exact effective `before` cutoff is supplied explicitly (npm forbids combining it with `min-release-age`), user/global config is neutralized, `NODE_OPTIONS` and other ambient variables are absent, and cache/registry/TMPDIR/offline policy remains explicit. The manifest retains an ordered receipt for every effect, including argv, complete executable identities, environment digest, and canonical CWD before/after. Package CWDs must equal the physical retained-generation package roots; peer effects must equal the one physical peer-layer root. Verification rejects lexical symlink escapes and reconstructs the complete effect inventory.

The default `registry_resolution` mode uses ordinary registry resolution. The explicit `verified_cache_tarballs` mode is a narrower owner/operator exception for the exact host version already running: it requires `command -v pi` to report `0.83.0`, reads the four already-cached host tarballs by immutable registry URL through `npm pack --offline`, verifies every tarball against its pinned SHA-512 SRI before installation, and lets transitive dependency installation continue under the unchanged workstation npm policy. It neither attributes registry SRI to local Git/worktree bytes nor symlinks live host roots into the governed closure. Missing cache bytes fail closed; the script does not edit npm configuration, fetch a young host tarball, install Pi packages, or edit Pi settings. Whether this bounded cache consumption is policy-approved remains an owner activation decision; successful local proof does not grant that authority.

Host provenance is derived from the peer manifest plus both regular and hidden lockfiles; the verifier never selects a branch from the manifest label. All four Pi packages must use one unmixed form. Registry form requires exact `0.83.0` selectors and canonical registry `resolved` URLs. Cache form requires exact deterministic `file:tarballs/...` selectors/resolutions whose physical non-symlink bytes match the pinned SRI. Every package must occupy its one exact physical top-level root with no nested duplicate. The peer closure proof records complete lock digests, root mode, exact hidden-lock-to-physical-package enumeration, internal symlink inventory, installed package count, and a mode-sensitive full `node_modules` tree digest; unlisted/phantom packages and escaping symlinks fail closed.

Every one of the 14 published package `node_modules` roots also has a reconstructed closure proof. Verification requires all public roots to be absolute creation-only links into the expected package subtrees of the same retained UUID-named generation; a physical public directory, relative/equivalent link, mixed generation, or escaping target fails closed. The root `node_modules` parent must itself be physical and mode-bound, and its complete child inventory must contain exactly that one physical UUID-named generation—an extra dependency, second generation, file, or symlink is fatal. The complete lexical inventory must additionally contain exactly the root plus those 14 public links, so ignored nested/source-adjacent `node_modules` cannot influence Node resolution. Missing npm hidden locks are materialized as explicit empty lockfile-v3 inventories before publication. Verification binds each publication path/target/link mode, physical target-root and generation-root modes, hidden-lock digest, exact lock-entry-to-physical-package enumeration, mode-sensitive child-tree digest, and complete internal symlink inventory; it rejects targets outside the selected source root and physical nested copies of any `LOCAL_EDGES` owner. Local owners remain only exact sibling-root links.

ASC retains only its non-host build dependencies in the generation install and receives the verified host/Typebox links. Its compiler verifier resolves the physical `@typescript/native-preview` owner beneath ASC's retained-generation `node_modules` target rather than requiring an impossible lexical-path equality through the public symlink. The materializer removes `dist` between two clean-output builds and durably retains one mode-`0600` receipt per pass. Each pass revalidates the captured Node executable before and after running under a closed environment with no ambient `NODE_OPTIONS`; each receipt binds that full executable identity/environment digest, a distinct nonce, source commit, all package/config/build-script/runtime-source hashes, the exact compiler version/SRI/regular+hidden resolution/physical root/tree, and the complete mode/size/hash inventory of every generated output. Verification requires both retained receipts to match each other and the reconstructed final derivation; it never synthesizes a two-pass claim from one output tree.

Verification reconstructs the v5 proof instead of trusting declarative manifest fields. It resolves every closed-list imported surface from its consumer context, requires the exact package name and canonical owner root for each extension edge, and requires one physical `pi-runtime-registry` across the enumerated registry consumer contexts. It re-derives the exact lexical `node_modules` layout, registry/cache provenance, cached tarball bytes when applicable, npm-effect receipts, all 14 package closures/root modes, complete peer lock-to-filesystem closure, Typebox, all four host-package proofs, both ASC receipts, and every consumer resolution. It also imports the actual autoresearch trigger picker to require a functional post-repair surface. Source/layout, npm executable/policy/effect, package-input/closure, resolution, registry, cache bytes, Typebox, ASC-runtime, or host-package drift is fatal.

The final mode-`0600` manifest is the commit point. It is written last through an `O_NOFOLLOW`/exclusive temporary file, file `fsync`, atomic no-clobber hard-link publication, temporary-link removal, and parent-directory `fsync` under ignored runtime dependencies:

```text
packages/pi-society-orchestrator/node_modules/.tryinget-governed-runtime.json
```

A reinstall that removes this manifest intentionally causes production preflight to fail closed. Because production materialization is one-shot, repair uses a new standalone commit-named candidate rather than rerunning against the consumed root.

The transaction lock, creation-only package links, and no-clobber receipt publication protect against cooperating concurrent materializers and ordinary target-appearance races. A caught failure after any effect, including a forced post-package-publication fault in the test-only path, durably quarantines the retained candidate; partial links are never rolled back or reused. Equal-privilege code that can swap arbitrary parent directories or rewrite a coherent runtime plus manifest remains outside this same-process filesystem threat boundary. Activation must externally anchor the accepted manifest SHA-256 and derived host-source mode in AK/settings-transaction evidence; the local verifier does not claim historical provenance against an equal-privilege coherent rewrite.

## Real-owner canary

Command:

```bash
npm run governed:runtime -- canary \
  --source-root /absolute/path/to/materialized-immutable-worktree \
  --expected-commit <full-40-char-sha>
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

Public `canary` always verifies source identity and the production materialization manifest before building its fixture, requires the owner preflight to verify that manifest again, and reconstructs the production proof in a `finally` path whether the harness succeeds or throws. Success JSON is emitted only after that mandatory post-canary verification succeeds. There is no CLI flag that disables these gates. The separate public `test` action is explicitly labeled `development-test`; it exercises the deterministic integration harness without claiming canary authority and includes a negative missing-manifest assertion.

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

AK-4282 also closes the durable handoff final-component race: Vault opens the receipt with `O_NOFOLLOW`, checks the opened descriptor is a regular file with `fstat`, and invokes no executor if a symlink is substituted between readiness/lstat and open. Unsupported `O_NOFOLLOW` platforms fail closed.

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
