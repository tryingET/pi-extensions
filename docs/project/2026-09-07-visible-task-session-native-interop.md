---
summary: "Task5513 actual frozen native AK/Pi interop: 16 cases pass, including owner-model alias and recovery; schema40/new fault controls/latest I04 remain pending."
read_when:
  - "Reviewing executed task5513 native integration evidence, not the initial static preparation."
  - "Resuming schema40 and native statement/readback fault integration after the next owner export."
type: implementation_evidence
---

# Task5513 — actual native interop executed

**16 passed, 0 failed, 4 explicit pending entries; overall task NOT complete.**
The final full run took 86.203 seconds on Linux x64 / Node26.8.1. Exit **78** is
intentional: the implemented cases passed, but required coverage remains pending.
No static count or Node TODO is counted as a native pass.

This supersedes the execution status in the [initial preparation](2026-09-07-visible-task-session-native-integration.md),
not its historical receipts. [Committed machine evidence](2026-09-07-visible-task-session-native-interop.evidence.json)
contains per-case native state versions, send metadata, lock observations and receipt/trace hashes.
Raw full evidence and synthetic DB/attempt histories remain in owned parent TMPDIR.

## Exact tested artifact pair — not current source or release pins

| Binding | Observed identity |
| --- | --- |
| AK source | `d719b17a6615a50b53f56eace88129bc0c3159b1`; parent evidence commit `f8cc16b240c43e882fd0a4f03d430e3c271db6ab` |
| Native worker fixture ELF | `a4f336bd9e31ef719febe0abdf80ea1c968560625abfc8e3574a2a0f18976c26` |
| Candidate debug ELF | `cbb098d0670cf0f8968253efcfac585e59b2dceea9d2ff9a9cabc526f6331ab2` — copied/hash-verified, **not invoked** |
| Owner source manifest | `606fe0c0eac6c6e53d532123ff7bbe5c7aa3d39e0bbf60df87dea363fe482485` |
| Pi feature / evidence | `026b607874818cb382334a9df36a63fc4c453e18` / `9eedfcb9e4afe504870f869069db16c45ab4b9bf` |
| Little-helpers packed artifact | `7ac4a7aaadc74a7b351a831f782bdf8f582499d0e066e684b688fc5809966a49` |
| Frozen packed host build digest | `04980cd060aa1fcac9cb4b8f8c1aec7a52438e86412443f301d13c705ac7f5c3` |
| Packet | `$TMPDIR/task5513-frozen-zMrgha/` (392 MiB reported by du) |
| Packet pins SHA256 | `862b820ec4058c2c9032d728d667ca902ba639769c8d677b1b94ce48db6f6c4a` |

The freezer materialized **184 AK files from exact d719 Git blobs**, all matching the
export's source manifest. One explicit exception: `.cargo/config.toml` is ignored,
not in Git. Its non-runtime build-settings bytes were read only after identifying
that mismatch, hash-matched to the export and copied as a labelled build appendix.
No build or use of its target directory occurred. This is not described as an all-Git
source tree. The exported ELF includes the same production worker/identity source.

Pi source was extracted from its evidence ref; the emitted runtime and dependency
closure were copied from the reviewed `task5480-pack-proof-UiGJKJ` installation.
Every packaged file was compared against the hash-bound tarball. All **20,845** copied
runtime/dependency file/link entries are inventoried, with external symlink refusal.
Production SDK identity checks also execute. Before/after packet verification passed;
source/emission correspondence relies on the owner's exact pack provenance, not a
new independent rebuild. Shared dist/node_modules and production source were untouched.

The packet has no Git checkout registration or canonical AK binding. Source copies
are verification inputs, not a consumer-owned production implementation. Live Pi HEAD
moved from `a785b9935764c0ea30337ef63b3d7d6a633a6da7` through unrelated/I04 work while
these tests ran; AK R6 was concurrently changing. The tests deliberately attest to
this frozen historical pair, **not** those moving sources. Native baseline observations
show maximum migration **43** in every case; schema40 is not inferred compatible.

## Executed cases and independent observations

| Cases | Actual result |
| --- | --- |
| Builtin complete + explicit recovery | Native pending/v1 → claimed/v2 → pending/v3. Bound admission/T1/readback digests, actual serialized two-send SDK write/continuation and separate owner recovery. Missing effect disposition and replay refused. |
| Nonbuiltin owner-model alias + recovery | Same actual native/SDK/recovery path. Requested `synthetic-owner/synthetic-requested-alias` resolved to `synthetic-wire-provider/synthetic-native-wire-model`; exact identity persisted in intent/dispatch/terminal. No builtin substitution. Valid metadata uses `off:"none"`, requested `high`. |
| Baseline drift | Actual native title change before startup causes preclaim denial, pending/v1; zero sends. Not a claim-statement fault. |
| Native commit-result loss | Actual compiled worker commits, writes result, exits 91. No `ak-admission.json`, zero sends, claimed/v2 retained; surviving host OFD excluded another flock. |
| Host failure; supervisor failure | Only owned synthetic processes terminated at admission. Zero sends; claimed/v2 and reservation retained. Supervisor loss leaves actual host-held custody. |
| Envelope mismatch; model-profile mismatch; producer-pin mismatch | Zero sends and pending/v1. Model-profile refusal precedes reservation/spawn. No scripted native result. |
| Namespace withdrawal after CLOSED | Dispatch refused before send; claimed/v2 retained. |
| Git-domain topology drift after first send | Exactly one captured send; actual SDK write tool and second send denied, no proof file. Claim/reservation retained. |
| Real lease expiry before CLOSED consumption | No clock mock: wait for actual native lease. `lease_expired`, zero sends, claimed/v2 retained. |
| CLOSED loss; post-CLOSED persistence failure | Zero sends, no successful dispatch; retained claim and reservation. CLOSED loss is injected at the receiving test callback after observing actual T2. |
| Corrupted durable T1; policy drift before T2 | Supervisor refuses; zero sends; surviving host retains actual OFD custody. |

For positive cases the independent oracle compares native postcommit baseline digest,
full exposed authority families and exact claim tuple; T1 is independently read from
its durable file. External `/usr/bin/flock` probes are recorded in `observer-trace.jsonl`;
probe execution errors are not interpreted as exclusion. Host `/proc` flags show
CLOEXEC, and an ordinary exec child observes no leaked canonical lock descriptor.
CLOSED occurs before captured fetch, whose independent flock probe observes T2 unlock.

The captured port receives the **actual native Codex serialized/compressed request**
and returns synthetic SSE. It observes exact model/reasoning/account/auth/URL/objective
and a real SDK write-tool result in the second serialized request. No HTTP request goes
to a provider. The test owns the sole synthetic write effect and supplies its explicit
completed-effect disposition only after host closure. AK recovery does not set Pi's
`hostClosed/effectsDisposed/claimResolved` flags: independent occupancy remains retained.

## Findings and retained failed experiments

No new production defect surfaced in the available sixteen cases. Two concrete
**harness** defects were exposed and fixed without production edits:

1. CJS `require.resolve("@earendil-works/pi-ai/compat")` cannot select this package's
   import-only export. The fixture now resolves the pinned package metadata's ESM entry.
   The failed attempt stopped before DB initialization.
2. Fake-viewer quit left its own render timer active. The first native positive path
   actually completed claim/send/tool/recovery, but cleanup failed and the outer command
   timed out. The test callback now clears its timer before quit. This earlier run is
   retained as a failure, not included in the final passing count.

An initial freezer syntax error and the ignored Cargo appendix discovery also remain
in preparation logs. After repairs, the original 15-case matrix passed, the added alias
case passed, and the final combined **16-case** matrix passed twice (final run includes
persisted independent native/observer records). No expected-refusal catch can swallow a
monitor/oracle assertion failure.

## Evidence and rerun

Final log: `$TMPDIR/task5513-native-verified.log`, SHA256
`772763d15c060530da1c36e70ae375adb95ee5669349267febf4742fd962526b`.
Each case's retained root and hashed observations are in the committed machine evidence.
Additional checks: 8/8 static/oracle-unit, scoped Biome and whitespace. Root normal
precommit validation is run for landing; broad monorepo/release/reality gates are not
claimed. No dependency installation or native/Pi build was performed here.

```bash
# Freeze new exports without requiring a moving working tree to match old artifacts:
node scripts/task-session-native-freeze.mjs \
  /home/tryinget/ai-society/softwareco/owned/agent-kernel \
  <exact-reviewed-AK-commit> <owner-export-dir> <reviewed-Pi-pack-dir> <Pi-evidence-commit>
# The script prints a NEW owned packet's pins path; source mismatches refuse.
node scripts/task-session-native-integration.mjs run <packet>/pins.json
# Optional second argument selects a named case for diagnosis; not full-suite proof.
node scripts/task-session-native-evidence.mjs <packet>/pins.json \
  <full-run.log> <new-raw-evidence.json> <new-compact-evidence.json>
```

## Remaining gates / stop

1. New owner export with schema40 compatibility and external same-production-worker
   **claim-statement / postcommit-readback fault controls**. d719 has neither control;
   old baseline-drift and post-result-exit cases do not substitute. Re-freeze/rerun then.
2. Current I04 `off:null` reasoning-map repair and latest packed artifact need their
   own evidence. This run uses known-valid metadata on the prior reviewed artifact;
   passing the alias case does not certify the changed source or invalid map handling.
3. Public entrypoint/G2, installed gate/host identity, full DB/FK/catalog/crash effect
   audit, real Ghostty/placement, provider canaries and positive enrollment remain
   separate. Internal constructors are the permitted unpublished seam, not public
   launch coverage. Public producer/host fences were not removed.

All DBs/resources/credentials were newly synthetic. No installed/canonical AK invocation, authoritative DB
access/copy, live config/auth/provider, real desktop, install activation, namespace
provisioning/enrollment, retained-scratch cleanup or other-worker action occurred.
Parent retains task5513/final5482 authority; useful native evidence now exists, but
neither task closeout nor current/deployed compatibility is asserted.
