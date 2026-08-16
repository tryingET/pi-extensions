---
summary: "AK-4820 exact-commit implementation, concurrency, fresh-process, reload, rollback, and provenance evidence for immutable Pi extension generations."
read_when:
  - "Reviewing or closing AK task 4820 and decision 125 implementation dogfood."
type: "evidence_note"
---

# Dogfood evidence: immutable Pi extension generations

Date: 2026-08-16
Decision: AK 125
Task: AK 4820
Final implementation commit: `b94d070fe394c20f7abb38e480f9440cee17da22`
Dogfood root: `/home/tryinget/.local/state/pi-quests/tmp/pi-gen-dogfood-final-4820.zMKMJP`

## Isolation and host

Implementation and all package/install experiments ran in the isolated worktree:

`/home/tryinget/.local/state/pi-quests/tmp/pi-extensions-ak-4820`

Dogfood used a private tool-created agent directory and cwd:

- agent: `/home/tryinget/.local/state/pi-quests/tmp/pi-gen-dogfood-final-4820.zMKMJP/private-host/agent`
- cwd: `/home/tryinget/.local/state/pi-quests/tmp/pi-gen-dogfood-final-4820.zMKMJP/private-host/cwd`

Operator Pi settings, managed npm/git roots, package source files, package locks, and existing package `node_modules` were not used as mutation targets. No package path changed in Git. The accepted behavior at commit `5e6e0611a` was not modified or re-investigated.

Exact host:

- Pi executable: `/home/tryinget/.npm-global/lib/node_modules/@earendil-works/pi-coding-agent/dist/cli.js`
- Pi version: `0.84.1`
- Node: `v26.7.0`
- npm: `12.0.2`

Fresh probe receipts bind the host PID, canonical argv, start/completion timestamps, exit result, executable path, and executable SHA-256.

## Retained published generations

| Generation | Source commit | Generation ID | Final status |
|---|---|---|---|
| G1 | `9d4771069a51b33231dc890920f5cb0ed7bf2800` | `9d4771069a51b33231dc890920f5cb0ed7bf2800-7229fe4ec4804d8339964f52c4bfae8543dd8695c19404e41bd23f10543e7b60` | `published-verified` |
| G2 | `b94d070fe394c20f7abb38e480f9440cee17da22` | `b94d070fe394c20f7abb38e480f9440cee17da22-3817a7cbee93613154e7bba06c9885a0b0edac0837cfafbe303ff6e67e3a5fc5` | `published-verified` |

`status-final.json` reports exactly these generations. `generation-mode-check.txt` reports zero writable descendants and zero symlinks. Both remain retained; no delete or replacement command exists.

The final first slice rejects every runtime and optional dependency. It therefore makes no installed-closure claim beyond this no-install canary.

## Concurrency proof

The final implementation passed:

- hermetic generation tests: 8 passed, 0 failed;
- real-Pi concurrency: 1 passed, 0 failed.

The real offline Pi 0.84.1 regression used production planning, materialization, activation, probe, and rollback code. Explicit barriers held failed and successful G2 materialization in flight after removing a neighboring fixture dependency. A G1 command completed during each barrier. The absent-neighbor npm probe and runtime load both failed; the restored-neighbor install succeeded with lifecycle scripts disabled. One candidate failed before publication; a new candidate published only after verification. Fresh activation selected only G2; rollback selected only G1.

`concurrency.ndjson` is a mode-`0600`, 16-record trace with timestamps, generation IDs, barrier entry/release, overlapping G1 command completion, npm/load exit codes, source base directories, activation, probes, rollback, and terminal `trace-completed`.

Receipts:

- `unit-tests.log`
- `concurrency-test.log`
- `concurrency.ndjson`

## Fresh-process dogfood

Fresh private offline Pi processes proved:

1. G1 compact command and `sourceInfo` only beneath G1;
2. G2 compact command and `sourceInfo` only beneath G2;
3. exact extension inventory: one generation canary plus pinned Pi 0.84.1 inline `llama`;
4. no editable-worktree or opposite-generation command path;
5. empty extension diagnostics and stderr;
6. G2 same-generation expansion;
7. altered policy digest failed closed with exit `1` and:
   `Agent Interaction canary failed closed: expected policy digest join rejected`.

Receipts:

- `g1-compact-probe.json`
- `g2-compact-probe.json`
- `g2-expand-probe.json`
- `g2-altered-probe.exit`
- `g2-altered-probe.stdout`
- `g2-altered-probe.stderr`

## Experimental reload

One supervised private Pi RPC process started on G1 with a scratch-only reload helper. It observed G1 compact behavior, selected already-complete G2 through the explicit experimental host-PID gate, called `ctx.reload()`, and then observed only G2 canary provenance. G2 compact, same-generation expansion, and altered-digest fail-closed behavior passed. Extension diagnostics and stderr were empty.

Receipt: `reload-dogfood.json`

This is an observed current-host reload, not a transactional reload claim. The old runner was not claimed recoverable.

## Rollback

After the reload process exited, conditional journal rollback restored exact G1 settings bytes and mode. A new Pi process then reported only G1 canary provenance, compact success, empty extension diagnostics, and empty stderr.

Receipts:

- `reload-session-rollback-to-g1.json`
- `reload-session-g1-fresh-rollback-probe.json`
- `process-check.txt`

The recorded reload PID was dead at final inspection. Both published generations remained unchanged.

## Validation commands and status

`commands-and-status.txt` records the exact command families and exit statuses.

Passed:

- `git diff --check`;
- CI smoke;
- release component and Pi host compatibility manifest validation;
- hermetic generation, release-component, npm-pack parser, host-canary, recovery, package-quality-gate, local-link, and root-doc-alignment tests;
- task-scope root control-plane `just loop-impact-wide` with exit `0`;
- exact-commit fresh process, reload, fail-closed, and rollback dogfood.

The task-scope root gate explicitly skipped package fanout, release packing, ROCS, and governed deep-review because no package path changed and the isolated worktree intentionally had no package `node_modules` or generated package build outputs. Those lanes are not claimed. The dedicated GitHub workflow pins Pi `0.84.1` in an isolated runner root and is statically validated locally; hosted execution is not claimed in this evidence.

Earlier superseded aggregate attempts invoked package prepack/build commands in the isolated worktree and did not complete. Only tracked Git cleanliness was observed afterward; absence of transient or ignored effects is not claimed. Final retained commands used private HOME/TMP roots.

## Receipt integrity

`receipt-sha256.txt` contains SHA-256 values for every top-level final dogfood receipt except the hash list itself. Generation-internal provenance, verification, and publication records separately bind their selected package inputs and exported runtime tree.

Key evidence remains under:

`/home/tryinget/.local/state/pi-quests/tmp/pi-gen-dogfood-final-4820.zMKMJP`

## Disposition and limits

The bounded first slice is implemented and dogfooded for one no-install package. It verifies complete publish-before-activate generations, separation from editable source, active-G1 survival during isolated G2 neighboring-dependency churn, fresh-process selection, observed reload, conditional rollback, and exact package provenance.

It does not support packages with runtime or optional dependencies, package-specific builds, published-generation deletion, transactional reload, npm/git package generations, or upstream Pi package-loader semantics. Those remain separate future work.
