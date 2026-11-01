---
summary: "AK7675 Node 22.23.3 to 22.23.4 gate pin: offline calibration (Oct 24), then the 2026-11-01 adoption slice with the full consumer gate on 22.23.4; frozen qualification still held."
read_when:
  - "Inspecting the Node 22.23.3 to 22.23.4 pin proposal or its remaining adoption obligations."
---

# AK7675: Node 22.23.3 → 22.23.4 source candidate

**Status (2026-11-01): committed as the gate pin move; see [Adoption slice](#adoption-slice-2026-11-01). Frozen qualification re-admission is still held.** The Oct 24 text below is the original source-candidate record.

- Date: 2026-10-24. Branch: `ak7675-node22.23.4`.
- Unchanged HEAD: `2c48f5394f12ce7a5ba3e43708a05caeaa14d3b8`; changes are uncommitted.
- Worktree: `/home/tryinget/.local/state/pi-quests/tmp/ak7608-self-boundaries.Fx4FHf/ak7675-node-worktree`.
- Evidence (`E` below): `/home/tryinget/.local/state/pi-quests/tmp/ak7608-self-boundaries.Fx4FHf/ak7675-pin-evidence`.
- Authority: parent dispatch identifies amended AK7675 scope and operator approval17767.
  This child made no AK mutation or independent authority-state claim.
- Approval permits this bounded source slice before adoption gates complete. It does **not**
  authorize install, build, commit, push, landing, global default changes or qualification rebind.
  Canonical checkout, frozen feature93c9, retained v1–v4 subjects and security quarantine were not mutated.

## S0 — Pin inventory and preservation

`pin-inventory-before.json` was produced by the dependency-update-flywheel inventory helper.
It does not parse this repository's custom Node toolchain lock: `dep.entries` is empty,
not evidence of no pins. It also reports unresolved/malformed npm local-link records;
these are inventory limitations, not repaired locks or a security verdict.
`native-pin-inventory-before.txt` records the supplementary tracked-file search.

| Surface | Treatment |
| --- | --- |
| `policy/ci-toolchain-lock.json#nodeVersion` | 22.23.3 → 22.23.4 |
| `.github/workflows/ci.yml` | One setup-node input updated |
| `.github/workflows/compatibility-canary.yml` | Two inputs updated |
| `.github/workflows/immutable-extension-generations.yml` | One input updated |
| `.github/workflows/publish.yml` | Two inputs updated |
| `.github/workflows/release-check.yml` | Two inputs updated |
| `.github/workflows/release-evidence.yml` | One input updated |
| `.github/workflows/release-please.yml` | One input updated |
| `scripts/pi-host-compatibility-canary/selected-tests-protocol.mjs` | Add **exact** v22.23.4 to observed Node 22 dialect after raw calibration |
| `scripts/pi-host-compatibility-canary/completion-fixture-closure.mjs` | Add **exact** v22.23.4 to source-observation support, not admission |
| `scripts/pi-host-compatibility-canary/selected-tests.mjs` | Supported-version comment only |
| `docs/project/pre-push-inputs.md`, `docs/project/pi-host-compatibility-canary.md` | Current pin/support guidance |
| `packages/pi-obsidian-clipper/README.md` | Development pin guidance only; no package implementation change |
| `scripts/node-pin-calibration.test.mjs`, `scripts/gate-inputs.test.mjs` | New offline regressions and counted root-test integration |
| npm12.0.2, nextNode26.9.0, action SHAs, Dolt, all package manifests/locks/engine ranges | Unchanged |
| `ADMITTED_NODE_VERSIONS`, `completion-fixture-inputs.json` | Frozen, unchanged; v22.23.4 is **not admitted** |
| Existing dated dossiers, diary entries and package evidence mentioning22.23.3 | Preserved as historical observations, not rewritten |
| `scripts/select-gate-node.sh`, `scripts/check-gate-toolchain.mjs` | Already pin-derived; exercised unchanged |

No npm package resolution or transitive lock change was made. Node's bundled library changes
are not npm-lock deltas. Vulnerability/license deltas remain unknown without scans.
Older exact dialect labels remain for historical protocol compatibility; they do not authorize
restoring or executing the security-retired binaries.

## S1 — Target, existence and installed provenance

Only the approved22.23.4 candidate was considered. Release date2026-10-21 is approximately
three days before this slice: the security release and explicit approval justify proceeding
with source work before the usual seven-day preference, **not** bypassing adoption gates.

Public read-only GitHub lookups resolved:

- Tag object: `f206f23d067e60ce0cc6506abb28fe5e2f2dc8c3`.
- Peeled release commit: `27f213124280b4db4cd1e3dd42f6f8afd01ceff7`.
- Exact commit status API: `pending`, zero status contexts.
- Exact commit check-runs API: one successful **post-release-actions** check
  ([job](https://github.com/nodejs/node/actions/runs/39586050015/job/119175088845)).
  This is not the upstream test suite. **Exact upstream-suite green remains unrun/not retrieved.**
- Responses and HTTP headers: `upstream-{tag,peeled-tag,commit,status,check-runs}.*` in E.
  No upstream checkout/build, CI dispatch, or claim of exhaustive CI discovery was made.

Installed executable actually used:

```text
/home/tryinget/.local/opt/node-v22.23.4-linux-x64/bin/node
v22.23.4
SHA256 94efd062ed066c1a0b332e18249859c905e920eeada5df55d24c99b919629a90
```

`provenance.sha256` independently matches both the executable and owner receipt:
`/home/tryinget/.local/state/pi-quests/evidence/AK7628-01a16e6c-fd25-731e-a71f-4d8d8b57f3b8/RESULT.md`,
SHA256 `5c9870612e3c2c83c4474183ed3537ad09b21870174e1a8b137c3da12e34cb92`.
Parent cites owner evidence7628/17521. That receipt records official archive SHA256
`1805bcd35e6815559bd2eb97db438d3fdb0eb3a5e6a977b7c1badca76337e9ce` and verified signed
manifest fingerprint `5BE8A3F6C8A5C01D106C0AD820B1A390B168D356`.
Signature verification is owner evidence, not rerun here; neither signature nor official
release status proves an upstream suite passed.

Actual npm remained `/home/tryinget/.npm-global/bin/npm`, resolving to
`/home/tryinget/.npm-global/lib/node_modules/npm/bin/npm-cli.js`; version probe under22.23.4
returned **12.0.2**, CLI SHA256
`8e5f6f3429f8cdbe693cdc29904e9d5a7b127a494bd15c804bd54c7403bfcbe7`.
The selector shims only Node, not the distribution's bundled npm. All npm invocations here
were `--version`; no install or dependency-resolution command ran.

## S2 — Classified consumer impact

Source: retained official [release notes](https://nodejs.org/en/blog/release/v22.23.4)
(`node-release-article.txt`, extracted from owner metadata) and exact release commit metadata.
The notes enumerate25 commits; no test-runner change is listed. This is a release-note digest,
not a complete source-diff audit or a finding that no breaking behavior exists.

| Change / commits | Concrete touchpoint | Class and disposition |
| --- | --- | --- |
| Brotli security backport67d294739f and exposed decoder error a18ec92752; CVE-2026-111497 | CI's Node process; clipper `src/transport.ts#fetchHtml` explicitly requests/requires identity encoding | ADOPT patched executable. Owner benign decoder checks are cited, not exploitability proof; clipper's compressed-input refusal stays unchanged. No re-execution of vulnerable old Node. |
| TLS canonical IP rejection d7663560ac, IPv6 SAN matching beb4cd4cd3, blocked public keys4342503fd8; CVE-2026-106069/106072 in release notes | Clipper `fetchHtml` HTTPS request with `rejectUnauthorized: true`; `publicUrl`/`publicAddress` checks | ADOPT upstream stricter checks. Real transport/package tests unrun; no relaxation of address/certificate policy. |
| DNS NUL rejection19c5056002 and c-ares1.34.9 a538a9515d; CVE-2026-105482 | Clipper `publicUrl` rejects controls before `fetchHtml` calls `lookup` | ADOPT. Existing guard remains; DNS/network integration unrun. |
| HTTP agent guard e7b2985d59; CVE-2026-105481 | Clipper `fetchHtml` uses `agent: false` | ADOPT runtime fix without a local workaround; other fleet HTTP consumers not fully evaluated. |
| Crypto snapshot cache reset dd6b47573b; CVE-2026-106074 | Canary `state-lock.mjs` uses `randomBytes`/`randomUUID` | ADOPT defense in runtime. This slice does not create/reload startup snapshots or qualify live locks. |
| X.509 hardening a62b7d5362, NSS updates68fa0df6d6/ec9e5e4a3e, OpenSSL3.5.9 sources/archs05470dc308/60f4833d41 | Clipper HTTPS certificate verification | ADOPT; trust-store/crypto behavior changes require later full consumer checks. |
| Permission realpathSync check50ab804edc; CVE-2026-106073 | Selector `inside`/`normalizeInventory`; closure `canonicalPath` | ADOPT. Offline fixtures exercise selector `inside`/`normalizeInventory` without permission flags. Closure coverage is limited to support/purpose checks, not `canonicalPath`; permission-mode qualification and the completion runner remain unrun. |
| Undici6.29.1 857be5afa3 | Clipper `src/native-guard.cjs` denies global `fetch`; `fetchHtml` uses `node:https` | ADOPT bundled update, no local fetch adapter change. Not fleet-wide fetch proof. |
| Timezone2026d/e52b4bcab03/1ab9db8a74 | Clipper `src/native.ts#extract` and `src/contract.ts#parseContract` use ISO/UTC dates | IGNORE local adaptation: no local timezone expectation changed. |
| SQLite updates/cherry-pick47333fe4f4,98258b855f,a8349b6408,e9e295bcc1,512a9b61f0,e708247254 | No `node:sqlite` usage in inspected canary source | IGNORE for this bounded seam; no claim about the whole fleet or DB compatibility. |
| macOS notarization4b42e56aaf | Installed Linux x64 binary | IGNORE for this platform; macOS untested. |
| Exact-version protocol admission (consumer shadow, not claimed upstream event change) | `selected-tests-protocol.mjs`, `completion-fixture-closure.mjs` | ADAPT-REQUIRED: calibrated exact22.23.4 only; retain all unknown-version refusals. |
| Adapter timeout/default/cap and completion-runner deadline | `selected-tests.mjs`30000ms default/300000ms cap; fixture runner20000ms | RE-MEASURE bounded probes below; leave constants unchanged. |

## S4–S6 — Implementation boundary

Native targeted text edits were used for this custom toolchain/workflow pin, not a fabricated
dep-surgeon apply result. Tests were authored before implementation and raw22.23.4 events
were inspected before expanding support lists. No reconciliation algorithm, threshold,
engine range, timeout, frozen identity or selector/checker implementation was weakened.
No commit was created. Full frozen qualification re-admission is a separate future subject.

## S7 — Offline verification receipts

The following are retained pre-repair pin-slice receipts. The exact-runtime guard repair
and its new source binding are recorded separately below; earlier logs are not overwritten.

Commands below ran from the worktree with:

```sh
N=/home/tryinget/.local/opt/node-v22.23.4-linux-x64/bin/node
E=/home/tryinget/.local/state/pi-quests/tmp/ak7608-self-boundaries.Fx4FHf/ak7675-pin-evidence
export TMPDIR="$E"
```

| Command | Result / duration | Evidence in E |
| --- | --- | --- |
| `"$N" --test scripts/node-pin-calibration.test.mjs` before pin/support edits | RED exit1; 1 passed, 4 failed;304.958ms | `red-calibrated-node-pin.log` |
| Same command, final source | GREEN exit0;5 passed,0 failed/skipped;417.312ms | `green-final-node-pin-calibration.log` |
| `"$N" --test --test-name-pattern='^Given the root gate' scripts/gate-inputs.test.mjs` before wrapper repair | RED exit1; count assertion exposed child exit0/no tests;73.710ms | `red-root-calibration-count.log` |
| Focused gate-inputs command below | GREEN exit0;5 passed,0 failed/skipped;729.012ms; wrapper additionally requires5 child passes | `green-final-gate-inputs.log` |
| `"$N" --test scripts/workflow-action-pins.test.mjs` | GREEN exit0;5 passed,0 failed/skipped;47.405ms | `green-workflow-action-pins.log` |
| `"$N" --test scripts/pi-host-compatibility-canary/selected-tests.test.mjs` | GREEN exit0;44 passed,0 failed/skipped;5937.113ms | `green-selected-tests.log` |
| `W=<worktree> E=<evidence> bash "$E/probe-toolchain-isolated-v2.sh"` | exit0; before-lock checker1, after-lock checker0; real selector chooses exact22.23.4, forces pinned lane, retains npm12.0.2 | `toolchain-entry-isolated-v2.log` |
| `git diff --check` | exit0 | `diff-check.log` |
| `W=<worktree> "$N" "$E/verify-source-scope.mjs"` | exit0; branch/HEAD, exact changed-path allowlist, all untouched lock fields and frozen inputs checked | `source-scope-verification.json` |

Exact focused command (unescaped alternation):

```sh
"$N" --test --test-name-pattern='^(toolchain admits|a pin move|the next Node lane|commit gates select|Given the root gate)' scripts/gate-inputs.test.mjs
```

The rest of `gate-inputs.test.mjs` was deliberately not run: one test invokes an npm install.
No full-root wrapper ran. The new root-test wrapper clears `NODE_TEST_CONTEXT` and other Node
injection variables, then asserts child test/pass/failure/skip counts; exit0 alone is insufficient.
Its initial exit-only green is retained in `green-gate-inputs-integrated.log` and is **not**
accepted execution evidence for its child. The subsequent count-RED and corrected GREEN supersede it.

Initial `red-node-pin-calibration.log` also caught a test-author mistake: zero selection emits
a **wrapper** pass, not zero total pass events. The corrected assertion inspects the wrapper's
exact file/name/line/column and the per-file zero-test summary. That correction preceded
implementation. The anchored invariant—no selected bodies may count as success—was retained.

### Genuine exact22.23.4 selection and entry paths

Pre-edit raw stream: `node-pin-calibration-3BLGxq/raw-calibration.json`.
Final raw/CLI receipts: `node-pin-calibration-lHsE9K/{raw-calibration,adapter-cli}.json`.
These are live native emissions from the verified binary, not relabelled old fixtures.

- Positive body: enqueue/dequeue/complete/start/pass, exact source tuple, per-file and global
  counts1; no entryFile/testId/parentId/tags. Existing Node22 dialect reconciles it.
- Absent selector: native `node --test --test-name-pattern=^absent$` exits0; per-file tests0,
  global tests1 and wrapper pass. Real `selected-tests.mjs --cwd <scratch> --case <file> absent`
  exits1 (`unexpected plan`), while `present` exits0 with `selected: 1`.
- Missing lifecycle phases, unknown exact versions (including22.23.5 and26.9.0), altered
  proof, skips/failures and interruption cases retain their refusals in the focused suites.
- Real unchanged gate selector/checker were copied byte-for-byte into disposable scratch,
  with before/after source locks and synthetic HOME/npm config. Only22.23.4 was executed
  against the old lock; no retired binary was used. Final trace retains executable/npm paths
  and hashes. Parent/default Node remains `/usr/bin/node`26.12.1.
- First npm probe emitted an ancestral config warning while reporting12.0.2; a first attempt
  to isolate configs failed because npm refuses one file loaded as both user and global config.
  Both logs remain. Distinct empty scratch configs and a scratch package root produced the
  final clean receipt. No user/global config was edited.

### Timing, rollback and security limits

Measured final wall times: raw positive60.701ms, raw zero58.697ms, native no-match main64.917ms,
adapter positive91.189ms, adapter zero93.405ms (`calibration-summary.json`). Existing synthetic
500ms hang-timeout test completed in504.422ms. These are local observations, not a comparative
benchmark or proof for production contention/deadlines. No timing constant changed: no observed
need in the bounded probes, and no safe old/new ratio can be obtained without executing the
security-retired old binary. Completion20000ms and package/network deadlines remain unmeasured.

**Operational rollback proof: unrun and explicitly not authorized.**22.23.3 is deliberately
security-retired/quarantined; never restore or execute it. The approved failure policy is
**withdraw this candidate and keep qualification held**, not restore a vulnerable runtime.
That is a decision/policy, not executed rollback proof or evidence of old-reads-new compatibility.
No new production formats, database writes or lockfile generation were exercised.

## Unrun hard gates and later approvals

| Gate | Why unrun / required later work |
| --- | --- |
| Exact upstream suite at peeled27f213124280b4db4cd1e3dd42f6f8afd01ceff7 | Public status/check lookups did not establish it. Obtain an exact upstream suite receipt or separately authorize the owner-defined suite under heavy-job. Post-release success/signatures cannot substitute. |
| Full consumer suite, builds, typechecks/lints and package check | Explicitly outside this authorization. Later isolated installs/preparation followed by `bash scripts/prepare-gate-builds.sh` and `just ci`; clipper `npm run check` also unrun. Do not invoke without renewed approval. |
| Before/after dep-viz policy scans and owner-schema surface delta | Unrun, not clean. `depviz` exists; `grype`/`cyclonedx-npm` not found on PATH. Scans/container provisioning/network are outside the permitted fixtures. Later `depviz scan <tree> --format json --ci --fail-on high --include-dev --out <absolute-evidence>` on both source states, followed by skill `surface_delta.py --before ... --after ... --fail-on high --schema ...` using its qualified interpreter. No scan exit code or valid depmodel exists here. |
| Native advisory checks and runtime-trace/dep-diet before/after pair | Unrun: no install/network consumer qualification authorized; old runtime execution prohibited. A source-lock refusal probe is not a before/after dependency-load inventory. Resolve a safe owner-approved evidence approach; do not execute22.23.3. |
| Real host/SDK/service/package network workloads, permission/snapshot modes, completion source-regression runner | Unrun: bounded fixture slice only. Support-list tests are not source-runner or host qualification. |
| Operational rollback / old-new timing comparison | Prohibited old binary; approved withdraw-and-hold policy is not proof. Needs an explicitly approved safe alternative before any adoption claim. |
| Frozen qualification rebind | Separate future subject; all frozen admission inputs remain unchanged. |

Parent inspection of the repair and remaining independent conformance audit are next. Separate explicit approvals are
required for further qualification/install/build work, any frozen re-admission, commit,
push, canonical landing/shared pin adoption, and task lifecycle closeout. None was performed.

## Independent inspection repair — dispatch1792876813503

The parent reports that the independent inspector accepted the bounded source slice subject
to two corrections. Both are now in the uncommitted candidate:

1. Calibration initialization calls `withCalibrationRuntime` with its default actual
   `process.version`, requiring **v22.23.4 before scratch creation or fixture execution**.
   The Node22 field-shape assertion is unconditional. Synthetic identity injection exercises
   rejection of v22.23.3, v22.23.5, v26.8.1, v99.0.0 and null; its initializer spy must remain
   untouched. No retired/alternative runtime was executed. The positive synthetic case
   initializes once; actual native calibration still runs on the verified installed binary.
2. The realpathSync impact row now limits observed coverage to selector paths and closure
   support/purpose checks. Closure `canonicalPath`, permission mode and completion-runner
   execution are not claimed as exercised.

New evidence directory (`R`): `E/runtime-guard-repair.82MJYK`.
The original17 candidate hashes matched before repair. Only this dossier and
`scripts/node-pin-calibration.test.mjs` changed in this repair.

Commands from the worktree, using the exact `N` above and `TMPDIR="$R"`:

```sh
"$N" --test --test-name-pattern='^Given exact target identity' scripts/node-pin-calibration.test.mjs
"$N" --test scripts/node-pin-calibration.test.mjs
```

- First command RED: exit1,0 passed/1 failed,42.680ms (`red-runtime-guard.log`).
  The synthetic wrong identity reached its initializer because the guard seam did not
  yet enforce identity; the expected refusal was absent. The red source is retained.
- Same command GREEN after enforcement: exit0,1 passed,0 failed/skipped,241.229ms
  (`green-runtime-guard.log`).
- Full tiny calibration GREEN: exit0,5 passed,0 failed/skipped,413.563ms
  (`green-calibration.log`). The count remains5, preserving the existing root wrapper contract;
  that wrapper was not rerun in this repair. Raw events and real adapter CLI receipts are in
  `node-pin-calibration-kz4LXE/` beneath R.

Effects: authored evidence/synthetic HOME and test files only, with short-lived native test
children. The unchanged selected-tests adapter retains its bounded own-worker process-group
SIGKILL cleanup; no foreign PID or host-service signal was issued. No service, completion
runner, npm, install, build, network, AK mutation, commit or adoption operation ran.

The inspector independently ran only the five workflow tests, per the parent report, under
a dispatch-specific no-signals restriction. Neither this repair nor that inspection reran
the earlier44 selector regressions; those remain original implementer evidence, not an
independent rerun. All unrun adoption obligations above remain held.

`R/source-scope-verification.json` binds the refreshed17 source hashes;
`R/repair-binding.json` compares them to the preserved prior receipt.
`R/prior-receipts-check.log` checks the prior evidence checksums unchanged.
`R/evidence.sha256` binds this repair's new receipts. No previous receipt was overwritten.

## Adoption slice 2026-11-01

Actor `claude-session-1818333e-c52d-47df-a3c4-6f1199a4c078` (Claude Opus 5.5) claimed AK7675 after
resuming deferral 938. The operator chose this route after being told that every pi-extensions
pre-push gate demanded the retired 22.23.3 (owner evidence 18577) and that the 22.23.4 repin was
unfinished.

- Landing subject: branch `task/7675-pin-land`, parented directly on `origin/main` `81304a459`.
  An earlier preparation, parented on the AK7898 commit, was handed to the appointed coordinator
  (18631). The 17 Oct 24 candidate files were applied as one exact patch
  (`candidate-17797.patch`, SHA256 `a906aad7…3053`). `git apply --check` was clean, and none of
  the 17 paths changed between the candidate base `2c48f5394` and `81304a459`.
- The re-run tracked-file search finds 22.23.3 only in dated dossiers, diaries and package
  evidence. Those are historical observations and stay unchanged.
- Release age: 22.23.4 was released 2026-10-21, so it is now 11 days old, past the 7-day
  preference.
- Upstream: the tag still peels to `27f213124280b4db4cd1e3dd42f6f8afd01ceff7`. Its public checks
  are still one successful `post-release-actions` run with combined status `pending`. No public
  release-proposal PR exists, which fits a security release prepared in Node's private repository.
  **The exact upstream-suite receipt remains unrun or not retrievable.** Owner-verified signing
  (17521) and the operator's explicit acceptance of 22.23.4 (17758, 2026-11-01) carry this risk.
  Neither proves upstream tests passed.
- RED → GREEN on the consumer's real entry path, with only the verified 22.23.4 (`94efd062`) and
  npm 12.0.2 on PATH:
  - Parent tree: `node scripts/check-gate-toolchain.mjs` exits 1, `Node 22.23.4; required Node 22.23.3`.
  - This tree: exits 0, `gate-toolchain: ok (Node 22.23.4, npm 12.0.2)`.
  - The selector picks 22.23.4 in both trees.
- Focused root suites on 22.23.4 (gate inputs, calibration, workflow action pins, all
  compatibility-canary tests): 28/28, 0 skipped.
- Route: the coordinator's bespoke qualification packet v1 was not admitted by the resource owner
  (18782, 18864: repairs R1–R6). The coordinator session then ended. On 2026-11-01 the operator
  chose the normal repo gate instead (18940). The pin lands through the repo's own pre-push hook
  (`scripts/ci/full.sh`) on 22.23.4, from an isolated `/data` worktree with fresh `npm ci` in every
  package and `prepare-gate-builds.sh`, run alone under heavy-job. Its receipt is AK evidence on
  7675. Packet v1 stays preserved, unexecuted.
- Still unrun:
  - Before/after dep-viz scans and the surface delta. `grype`/`cyclonedx-npm` remain absent, and
    no package manifest or lockfile changes.
  - The exact upstream suite.
  - Operational rollback, because 22.23.3 must not be executed. The rollback is reverting this
    commit, which restores a gate that refuses every installed runtime. That is availability-only
    and not security, and no 22.23.3 restore is admitted.
  - Frozen qualification rebind. `ADMITTED_NODE_VERSIONS` and `completion-fixture-inputs.json`
    remain unchanged.
- 22.23.3 was not executed or restored by this slice.
