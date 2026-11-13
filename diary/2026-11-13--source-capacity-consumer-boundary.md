---
summary: "AK8605 isolated source/offline Soma capacity consumer fence; all live activation held."
read_when:
  - "Inspecting AK8605 source evidence or planning separately authorized activation"
system4d:
  container: "Isolated pi-extensions task worktree; canonical main remains the live runtime."
  compass: "Capacity declarations must not turn unknown guarantees into permission."
  engine: "Red fixtures -> reader/admission/dispatch/setup fences -> offline package and SDK checks."
  fog: "Passing isolated tests do not revoke old loaded Pi sessions or existing browser configuration."
---

# AK8605 — source capacity consumer boundary

Operator source/offline assignment: evidence21382. Claim actor:
`session-01a1d4de-7fa1-7226-b061-1f1a5c3b8943`. Worktree:
`../.wt-pi-extensions-ak-8605`, replacement branch `task/8605-reviewed-hooked`, based
on canonical `b61361850debbd3d0bfa03da6c9eb6f505583739`. Original unhooked commit
`9343e8e931fd6022a1b9e5a4457fae0d881501d0` remains intact under
`archive/ak8605-unhooked-9343e8e9` and `task/8605-source-capacity`; its evidence is
not rewritten. The first fully hooked snapshot `0c56eae6abb9761d61080f5db5bcd5e29f5047d0`
is also retained under `archive/ak8605-reviewed-0c56eae6`; the coherence follow-up
below is an additional scoped fix commit, not a rewrite. No canonical landing or
task completion.

## Source changes

Only the two authorized packages and this diary were changed. Canonical tracked
source/HEAD remained unchanged; foreign untracked diary files there were not touched.
No canonical dependency installation, Pi install/reload, service action, global
configuration, browser/profile action, credentials inspection, push or live inference.

- Provider rejects canonical schema1 hints; schema2 retains disabled aliases
  descriptively and never feeds missing capacity to model defaults.
- Independent sources preserve distinct legacy canaries, even after primary
  failure/nonadmissibility. Reserved Soma aliases cannot resurrect through a canary.
- Both normal and provider-only entrypoints reread authoritative bindings at
  canonical admission and final serialized fetch dispatch, including after awaited
  hooks. Owner expiry, consistency, availability, full binding fingerprint and
  serialized reservation are checked. No canonical stale-cache permission.
- Explicit refresh uses supported registration removal; retained UI/selected
  objects remain dispatch-fenced. Unsupported-removal status reports retained
  registrations rather than claiming they disappeared.
- Clipper status is descriptive; setup refuses unusable baseline-multimodal proof.
  Existing file/ownership/symlink/size/credential/browser boundaries remain. Existing
  browser configuration is not revoked and later browser dispatch is not fenced.

[Exact interface, semantics and held release ordering](../packages/pi-workstation-inference-provider/docs/project/2026-11-13-soma-capacity-consumer.md).
The complete fixture is
[`workstation-inference-provider.capacity-v2.example.json`](../packages/pi-workstation-inference-provider/examples/workstation-inference-provider.capacity-v2.example.json),
identical to Clipper's test fixture; SHA-256
`7c308be0eece0d0987f460e7be10674bc9edb107cf5ae1c089813f1b1bff4f3e`.
It is synthetic, not an observed live capacity. Exporters must use the owner decoder,
not copy the fixture's numbers/times. Output reservation bounding is not backend
prompt-token accounting; the SDK may also choose smaller reservations before hooks.

## Verification

- Original red: six new provider capacity tests failed (schema1 canonical admitted;
  schema2 unsupported). Recorded at managed scratch `ak8605-evidence/original-red.log`.
- First candidate package `npm run check`: provider **162/162**, Clipper **69/69**.
  Parent inspection nevertheless confirmed three must-fixes; those passes were not
  complete boundary proof. First fully hooked snapshot package gates: provider
  **180/180**, Clipper **81/81**. Coherence follow-up gates below are **183/183**
  and **81/81**. Zero test skips/failures; lint, typecheck, structure and quick
  packaging checks passed.
- Root docs strict check was run and failed on **25 unchanged existing diagnostics**;
  each affected file was compared with `b61361850` and was unchanged. The provider's
  scoped `docs/project` strict check passed. No unrelated metadata was repaired.
  Root docs' default AK-closure check was not enabled (five existing bound docs);
  package passes are not a full root/fleet/authority-closure pass.
- New real pinned SDK 1.4.0 resource-loader/ModelRuntime fixtures exercise both
  entrypoints against fake SSE: an old selected model remains in the host catalog
  after an actual fixture-file withdrawal, yet final transport is not called.
  Actual SDK registration removal is checked separately, without claiming selected
  object erasure. Existing audio/security/transport tests were not skipped.
- Source matrix covers old hints, unknown/stale/contradictory/null/omitted/unsafe
  bounds, unavailable aliases, TTL/future/expiry, warm generations, async hooks,
  callback mutation, toJSON/serialized bytes, reduced current guarantees and dedup.
- Existing legacy latency-cache tests now explicitly identify unrelated canaries;
  canonical alias fixtures use schema2. The old arbitrary small alias in the health
  fixture is explicitly the owner-approved `think-small` alias.
- Node **22.23.4**, npm **12.0.2**, exact existing Pi SDK **1.4.0** dependencies
  reused via isolated worktree dependency links. No host/version replacement or
  gate bypass. New runtime modules stay below 500 LOC; the existing contract module
  is 620 LOC versus 650 at the base (561 in the original candidate, 619 in the first
  fully hooked snapshot), under its
  unchanged owner-scoped exception. Source reading remains in that existing module,
  avoiding an out-of-scope policy edit.

**Offline boundary incident (evidence21387, fail):** the first Clipper full package
check's release helper unexpectedly ran a read-only npm registry lookup (HTTP 404).
No release/write occurred; `npm publish` was dry-run only. This means that first
run was not fully offline. All final checks force the **same** installed npm to
`--offline` through a task-owned scratch wrapper, including the release helper's
`env -i` children. Registry lookups then return `ENOTCACHED` without a request;
that is not registry verification. Live Pi smoke remains skipped by the declared
quick packaging lane (`SKIP_PI_SMOKE=1`), as required by the held activation scope.

Evidence logs and the wrapper are under managed scratch
`$TMPDIR/ak8605-evidence/`; final source evidence is recorded in AK, not a new
repo handoff/status authority. Root-wide fleet checks and live activation are not
claimed by package passes. Parent independent work-product inspection remains.

## Independent inspection corrections and hook delivery

Reviewer `dispatch-1794574691035` confirmed all three defects offline:

1. Optional schema2 copies could resurrect an alias omitted from the primary.
   Canonical aliases now bind exclusively to the designated primary source role.
   Optional declarations retain descriptive proof but are never canonical permission;
   distinct unrelated legacy canaries remain independent. Source identity **and**
   source role participate in both dispatch and provider-only binding comparisons.
2. Provider normalization and Clipper disagreed on contradictory identities and
   runtime profiles. Both now reject unequal declared `id`/`pi_model_id` and the
   same ineligible profiles. Their identical 12-row identity fixture has SHA-256
   `44ba6547049780545a54a8a7b33357b86d4abe69fcb19614e41ca9889f5e2417`.
3. Status could re-register capacity withdrawn during awaited health. Registration
   now rereads independent authoritative sources after that work, immediately before
   admission/registration. Primary authority is read after optional-source I/O;
   canonical-first dedup precedence is preserved. Provider-only builds final bindings
   from a single fresh snapshot instead of earlier per-model await results.

Review red-first commands: `node --experimental-strip-types --test
 tests/workstation-capacity-review.test.mjs` (provider: **18 tests, 9 failed**) and
`node --import tsx --test tests/capacity-identity-parity.test.ts` (Clipper:
**12 tests, 9 failed**). After fixes they pass **18/18** and **12/12**. Actual
factory tests hold warm selected objects and assert zero transport calls for optional
resurrection and source-identity changes; actual status callbacks assert no second
registration of capacity withdrawn during health. No original assertions were weakened.
Logs: `$TMPDIR/ak8605-evidence/reinspection/`.

Evidence21390 remains the truthful failure of the original commit's hook delivery.
The controller explicitly authorized a one-invocation hook-path correction, not a
check bypass or persistent configuration change. The scratch pre-commit wrapper is:

```sh
#!/usr/bin/env sh
set -eu
printf '%s\n' 'AK8605: actual UBS staged check, then unmodified source-worktree pre-commit'
"/home/tryinget/ai-society/softwareco/scripts/ubs-staged.sh" || exit $?
exec "/home/tryinget/ai-society/softwareco/owned/.wt-pi-extensions-ak-8605/.githooks/pre-commit"
```

Wrapper: `$TMPDIR/ak8605-evidence/reinspection/resolved-hooks/pre-commit`, SHA-256
`e1ce4a5bedab07e625b75f731a95ab90603ce24a7276837ecb9357ef361a101a`.
The tracked worktree hook matches base bytes, SHA-256
`10dc609b4b1af0574394148601f8d7e052878620f4208266f50cf1f0f6cb17d6`.
The actual UBS helper SHA-256 is
`c34bef2f05cba6f207e7ac435873425af1df1846a74cab7f9c8a31f837972eeb`.
UBS read-only doctor found all modules/tools present, zero failures/warnings; no
install/update was required. The commit invocation is
`git -c core.hooksPath="$TMPDIR/ak8605-evidence/reinspection/resolved-hooks" commit
-m "fix(inference): close reviewed capacity boundaries (AK8605 source-only)" --
packages/pi-workstation-inference-provider packages/pi-obsidian-clipper
 diary/2026-11-13--source-capacity-consumer-boundary.md`.

The replacement branch's one authorized isolated `git reset --soft b61361850`
retains the full staged source snapshot for comparison against the base, rather than
checking only the three corrections. Original custody is retained by the archival
ref. Hook output, staged tree identity and actual execution result belong to the
final AK source evidence; this diary does not substitute for that receipt. Canonical
Git config, hooks, index and main are not edited by this path resolution.

## Legacy registration/dispatch coherence follow-up

The parent recheck cleared the original three safety findings in 59 independent
cases, but found one regression: final registration reread B while legacy dispatch
still used cached A. A normal status health callback could register `:1444/route-B`
but send to `:1334/route-A`; provider-only could successfully bootstrap B and then
reject its immediate unchanged-source invocation as drift.

Two real-factory falsifiers in `tests/workstation-registration-coherence.test.mjs`
were red before the fix (**0/2 passed**). They assert the actual fetch URL, actual
serialized route and successful immediate invocation, not merely registration or
status labels. The final registration source snapshot is now atomically adopted
into the dispatch generation, and its generation ID is used by the bindings and
status. An epoch fence retires older pending refreshes, including their failures,
so neither stale values nor stale error state can overwrite the adopted snapshot.
The new cache publication test was independently red (**18/19 passed**, new test
failed) before implementation. The two factory falsifiers, cache suite and preserved
three-finding review suite now pass **39/39**, no skips. Canonical aliases still
require fresh primary-role capacity checks at registration and final dispatch;
cache publication does not grant canonical permission.

Commands (same pinned Node/npm/SDK and forced-offline npm wrapper):

- `node --experimental-strip-types --test tests/workstation-registration-coherence.test.mjs`
- `node --experimental-strip-types --test tests/workstation-provider-hot-path.test.mjs`
- `node --experimental-strip-types --test tests/workstation-registration-coherence.test.mjs tests/workstation-provider-hot-path.test.mjs tests/workstation-capacity-review.test.mjs`
- `npm run check` in both packages: provider **183/183**, Clipper **81/81**, zero
  failures/skips; original assertions remain unchanged.

Logs are in `$TMPDIR/ak8605-evidence/coherence/`. This follow-up uses the same
controller-authorized actual UBS → unmodified worktree hook chain and an ordinary
additional explicit-path commit on `task/8605-reviewed-hooked`. Its hook checks the
staged **delta against 0c56eae6**, not a newly staged 32-path snapshot. Full package
checks cover the final tree; prior full-snapshot hook evidence remains21396. Exact
staged paths, tree identity, chain output and final source evidence are recorded in
AK after execution. No additional reset or persistent Git configuration change is
needed. Prior evidence21387/21390 and both earlier commits remain intact. The exact
schema2 JSON fixture and its hash are unchanged. All live integration stays held.

## Still held

Producer integration/publication and any Soma restart need their owners. Inventory
and reload/rebootstrap every normal Pi/provider-only consumer before treating a
schema2 file publication as a cutover: old schema1 warm consumers can otherwise
continue dispatching. Owner-authorized canonical land/install, loaded-generation
checks, real denial/health/canary checks, browser actions and coordinated rollback
checks remain separate. Rolling only the file or only the package back can restore
old hint permission. No full-task done/closeout was performed.
