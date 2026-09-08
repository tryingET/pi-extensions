---
summary: "Task5480 public producer integration coordination and bounded implementation evidence."
read_when:
  - "Implementing or reviewing the separate-worker public task-session path."
type: implementation_evidence
task_id: 5480
---

# Task5480 — conditional public producer integration

## Coordination status (not activation authority)

Deployment binding `5a86a3646` / evidence8488 is the selected owner boundary: preserve ordinary AK pin
cdeef5bfedcb1b19ee18921008f876ecd05eb8ca, use a separately approved worker on the same canonical DB/flock.
Existing task5513 evidence/reports are immutable historical inputs, not runtime permission.

Initial targeted inspection found AK main at c7ab0e196 with no newly published separate-worker descriptor
schema/memo under its task-session contract/document surfaces. Awaiting the AK owner's exact schema,
fixed entrypoint/closure and publication semantics before writing producer verification. No guessed describe
command, consumer policy interpretation or source-status permit will be used. The construction fence is
still present at this coordination checkpoint; replacing it remains unfinished, not rejected in principle.

Independent bounded work: add DB-free profile discovery to the public CLI/Pi tool so an operator can find
existing profile hashes and exact requested/resolved labels without ad-hoc scripts or credential logging.
This does not provision a namespace/profile, publish a worker, grant admission or claim native readiness.
All tests must use isolated synthetic resources. No actual Astra mapping, live provider/configuration,
global AK pin, live namespace or installation action is authorized.


## Profile discovery slice verified

The owner early publication appeared during this slice: AK
`docs/project/2026-09-08-visible-task-session-separate-worker.md` and
`contracts/task-session-deployment-v1.json` plus fixtures were read in full. They declare descriptor.v1,
worker.v2, separate pins and fixed gate describe/plan/supervise/recover routes. Implementation/staging is
still pending in that owner's memo; source examples are not runtime permits. Integration may now target
these exact fields rather than inventing them.

Public CLI/Pi-tool `profiles` is implemented as bounded existing-only inspection (<=256 private profile
references). It discloses requested/resolved identities, reference and non-secret pin facts, reports
profile_preflight_passed/unavailable, and explicitly sets admissionAssessed/publicationPerformed:false.
No raw credentials, provider/AK calls, profile writes, namespace creation or automatic selection occurs.
A test-only OS-home shim relocates resources and throws on every subprocess/provider call while invoking
actual emitted CLI/Pi-tool code. Controls remain outside release files. Negative diagnostics do not echo
malformed credential contents; unexpected inventory entries refuse.

Verification: 150 focused tests; 590 declared little-helpers tests with explicit live-smoke skip and isolated
HOME; final source profile CLI/tool tests 3/3; 86 packed startup/review tests (including synthetic PTY) pass.
The first packed run found a test path pointing at scratch rather than the installed module; test root is
now derived from its actual imported module, and final packing passes. Receipt:
`$TMPDIR/task5480-pack-proof-V7s1mq/`. Little-helpers SHA256
14f3650042cf4e19862ded7706111c315d8a0697fede806a97d6dd22f55f4692 (324476 bytes / 152 entries);
orchestrator SHA256 32356f3d3cfa67f9d2aca59cf9b2b7e09418d8af72dbcbd4b6694083963beddd.
Logs: `$TMPDIR/task5480-public-{profiles,focused,check,pack}.log`.
This slice does NOT replace producer fencing or prove public G2; those remain current implementation work.

## Conditional installed producer (source implemented; current validation below)

The unconditional source fence has been replaced, not bypassed. The Pi-owned private namespace
requires an existing mode0600 single-link regular `producer.json` with exactly:

```json
{"schema":"pi.task-session.producer-binding.v1","publication":"owner-approved","bindings":"<object matching the owner bindings definition; not this string>"}
```

`bindings` is the closed `$defs/bindings` object from the AK-owner deployment schema. It includes
full policy SHA/generation; independently selected ordinary and worker paths/hashes/commits;
worker ABI/manifest; fixed gate/helper/supervisor/protocol/deployment closure; host bytes/build;
and opaque database-selector digest. No credential, database path, arbitrary executable override,
FD selector or environment transport is admitted in public requests. This file is an **owner
publication**, not a source-created default. No live provisioning/publication operation was run here; isolated fixture publications are described below.

Fixed gate is OS-account-home-relative `ai-society/softwareco/owned/agent-kernel/scripts/ak-runtime-gate.sh`;
fixed host is `.local/libexec/pi-task-sessions/host-v1`. HOME/XDG do not select them. Before executing
the gate, Pi verifies its owner-approved closure, complete host/SDK identity, separate binary/manifest
bytes, canonical ownership/modes/link identity and Linux x64 worker ELF identity. Every database-family
prefix is excluded from artifact hashing using the opaque selector digest. Policy stays opaque:
**the Pi consumer never opens returned policy_path**. Exact owner `-- task-session describe` facts
provide policy currentness, including synchronous bounded rechecks at actual dispatch/tool guards.
Describe is owner DB/lock-free; it is not an ordinary AK database read. No policy rules are shadowed.

Plan invokes exactly `-- task-session plan` with `{task_id}`, validates the published owner plan
schema and full native baseline, and compares database identity and bindings. Profiles, resources,
Git topology, enrollment and snapshot stability are checked; invalid I03/I04 requests refuse before
native planning. Plan creates no attempt/viewer/host or claim. Launch repeats preflight before
reservation, opens the restricted viewer, invokes fixed `-- task-session supervise`, and uses the
real host entrypoint's positive custody adoption and unchanged native PREPARED/T0/T1/T2/CLOSED path.
`launchable:true` and descriptor availability are not admission or placement ACKs.

Missing publication, disabled/recovery-only/unavailable state, test-support/unknown ABI, unsupported
schema, changed source/artifact/policy/profile or expired/invalid model metadata fail closed.
There is no ordinary-worker fallback. Repeated same-semantic launch returns the existing attempt
without new effects, even after publication loss; inspect/history/classify/stop remain AK/DB-free.
Independent host/effect/claim retirement is unchanged, with no automatic release/recovery.

### Owner source consumed

AK commit `1e42800678344dddbf9848a9bf92d02d74ea83a9`, worker ABI `ak.task-session.worker.v2`.
The earlier in-progress schemas were correctly refused, then replaced by the committed owner schemas:

- Protocol SHA256 `c10e1fb35e04371345791aeb2eb7b5e88656e584f53473f41db6151029e095a2`.
- Deployment SHA256 `0c9eb6ddc3fe7774d418cc8b1284c2503f734f1fee05a034401a2624cf433e09`.
- Gate `277ac3fc4931886b63c9d10863e3c524eaa98f552bdca597890f31872e9b43d8`.
- Binding helper `f8bf20a2eae83b452674a64fbb88953d0f80d94e077121f345fcda14679a9dbc`.
- Supervisor `38ed0b59f2cf80f05b35b873e32fca68413a145fbee7a219aeae4feb0b624ae5`.

### Public-native proof construction (not release/installation)

New root scripts `task-session-public-freeze.mjs` and `task-session-public-integration.mjs` do not
modify the historical task5513 packet/report. The former verifies owner export source hashes against
committed Git objects and freezes the default debug worker/closure into a NEW owned TMPDIR packet.
It does not compile, stage a release, alter branches or publish policy. The latter requires an exact
packet (missing packet is an error, never a skipped/passing substitute).

Current packet: `$TMPDIR/task5480-public-packet-dKB22Z/packet.json`. Default debug worker SHA256
`ea0b6fac1d3f6777b4fea142681d5561b82de446472c402e7bc3de605ddf19f5` (128729080 bytes), source identity
`ab8920f8d2b4d3b003bada3351ebb3d2bec00813ec07f51bc5ddf3af336efae2`. This is the owner-exported
**default, no-test-support debug build**, not a clean release pin. Its precommit Git version is not
misrepresented as a release rebuild. Old task5513 fixture is used only for NEW synthetic storage
initialization/read-only oracles, never as the admitted worker or current runtime authority.

Synthetic policy/manifest construction consumes the frozen owner `configure` fixture, not a Pi policy
implementation. The independently selected ordinary slot is its explicitly labeled harmless old
stub with the cdeef commit label; this proves separate selection, not ordinary binary behavior.
The real/global ordinary pin `cdeef5bfedcb1b19ee18921008f876ecd05eb8ca` was never changed.

Unshipped seams relocate OS account home and supervisor resource constructors, attach an observation-only
kernel flock probe, supply synthetic PTY desktop transport and fake SSE fetch, and collect actual
Pi-tool registration/execution. They do not replace compatibility, native plan, admission, effect
accounting or CLOSED verdicts. Actual host-entry, viewer, SDK/native serializer, write tool and second
send execute. Loader audits refuse consumer reads of the owner policy/database family. These seams
are absent from npm artifacts; no real Pi reload, Ghostty, provider request or live namespace is used.

Initial execution exposed stale in-progress schema pins (correctly denied), an incomplete old synthetic
policy fixture (replaced by owner configure), an incorrectly copied mode0755 model-source directory
(correctly denied), and incorrect test expectations that G1 remained locked after CLOSED. Those are
recorded fixture/proof corrections, not passing evidence. A stop-test argv error was fixed and its
owned waiting fetch was released without claim reset or other-worker signaling.

Latest observed intermediate result: 17/17 public native cases on schema43, including actual CLI and
Pi projection positives, alias fidelity, bound T1 under held flock and CLOSED after unlock, real write/
second send, exact replay/no duplicate ports, retained claimed occupancy after withdrawal, negative/stop combinations. Expanded schema40/43, current source checks and packed results follow;
this intermediate run does not certify later edits or installed readiness.

Validation correction: the first updated pack probe still used the old synchronous capability assertion.
The new async capability entered OS-account locator lookup before that assertion failed; the probe had
not yet relocated OS home. This was an unintended live-locator lookup attempt, not authorized proof.
It performed no publication/provider send or mutation. Exact locator bytes accessed were not audited
retroactively. The probe now installs its isolated OS-home seam before calling/awaiting capability;
all public/native fixtures already had explicit OS-home relocation. No further live lookup was used
for diagnosis. This limitation is retained rather than claiming zero locator reads for the failed run.

## Final committed source and packed/default-release proof

Source commit **`39a1cdad0da75646ede1a9ebd583fc976416f973`**, following profile discovery
`4ed4eca3b`. Normal scoped hooks passed, without bypass. Owner source is
`1e42800678344dddbf9848a9bf92d02d74ea83a9`; owner stage attestation is `890795c6e`.
No staging was performed by this Pi worker. AK5479's separately authorized ONE inert stage was consumed.

Final packet: `$TMPDIR/task5480-public-release-packet-kZi4f7/packet.json`.
`task-session-public-freeze.mjs` additionally supports an exact expected stage-manifest SHA argument;
it verifies all staged file bytes/sizes against that manifest, closure against committed Git objects,
and actual DB-free native version/ABI. The final packet uses the real optimized default release:

- Worker `d5ce60e7555d8ea140014e8e2027e29511c1dc94285d039fc46f021448405221`, 22019192 bytes.
- Manifest `181337d21967a2c91ef3b192800f4a09956d1e65d4a6ad9e40d520bfbd1b4c6c`.
- Exact clean version `ak 0.1.0+git.1e42800678344dddbf9848a9bf92d02d74ea83a9`;
  ABI v2, schemas40/43, test_support:false. Stage remains `not_published`.

**34/34** public packed/default-release cases passed after the source commit: **17 schema40 + 17
schema43**. Each has three actual CLI/Pi-projection native+SDK positives, thirteen meaningful-baseline
negative cases, and one actual public stop-after-send case. This is not a shape-only or scripted-worker
substitute: actual native admission/effect accounting/T1/CLOSED, retained claimed occupancy and packed
SDK/tool dispatch ran on NEW synthetic storage. Kernel probes observe unavailable flock during
ADMISSION_RESULT/T1 and available only after actual T2/CLOSED, with zero lock bytes. All loader audit
checks prohibit Pi-side owner-policy/database-family reads. Native plans preserve whole-family regular
names/bytes and raw oracles. Invalid owner off:null and builtin max profiles refuse before plan/effect
ports; changed gate cannot execute its marker. Every negative first proves the unmodified fixture's
real public plan succeeds. Repeated launch and publication loss never duplicate effects or clear claims.

The first release-backed negative run hit copied read-only closure permissions before the intended
mutations. Only each NEW fixture's copied gate/helper was made owner-writable for its explicit tamper;
the original stage was untouched. The repeated 34-case run passed; logs distinguish the initial failure.

Other latest validation:

| Gate | Observed |
| --- | --- |
| Focused task-session | 181/181 |
| Little-helpers declared check, isolated HOME / concurrency4 | 621/621 + lint/typecheck/structure/release checks; explicit live-smoke skip |
| Safe recursive orchestrator | 474/474 + lint/typecheck; exact live-loader case excluded |
| Extracted npm startup/review suites | 117/117, including I03/I04 full membership matrix and synthetic PTY |
| Main hooks / whitespace | passed, scoped staging, no bypass |

AK contract JSON is now copied byte-for-byte through compilation (TypeScript's JSON reformatting is
reversed) and checked against the published SHA pins. A formatter-only override covers exactly those
two owner-owned JSON files; no broad lint exemption. Current emitted build manifest equals the packed
one byte-for-byte: `570142be179a27609b75aa386de73586fe04826f9bf7aa4ba9f175d50e8bd23c`.

Packed receipt: `$TMPDIR/task5480-pack-proof-wY2IJh/evidence.json`.

| Tarball | SHA256 | Bytes / entries |
| --- | --- | --- |
| little-helpers0.9.0 | `f7137c0202027484bc803eb22a4820794bc286842899e5a77d3c636cd8af5d6b` | 329826 / 154 |
| orchestrator0.11.5 | `408309a7cd1fb8c347203b8e89d15a58815015f760f4530e9c6d7a44f6e5660a` | 369582 / 119 |

[Machine receipt](task-session-public-verification-v1.json) binds source, artifacts and final logs.
The package-only receipt's producerIntegration:false remains truthful for that script; the separate
34-case ROOT receipt establishes the bounded actual-native integration above. Versions remain unreleased.

### Remaining authority/operational gates

Independent review/acceptance of this public replacement is pending. Source/packed/native synthetic
success is not Task5480 or Decision151 closeout. Owner publication of the exact worker/configuration,
namespace/enrollment, full fixed-target installation, actual model/account/profile pins, custody and
rollback remains separate. Real Ghostty placement/G2, installed Pi, provider canary/live schema40 fit,
broader platform/libc and complete fault/power-loss coverage are not proved. The ordinary cdeef pin,
canonical DB, real accounts and original dirty checkout were not mutated. No claim reset/recovery,
automatic retirement or other-worker signaling occurred. The failed pack locator-lookup exception is
disclosed above; no claim of zero locator reads is made for that failed run. Full root pre-push remains
unclaimed because of reported unrelated missing local links; scoped closure checks are not its proxy.


## D151-DEP-R1/R2 reopened — scope v8 / e8504

Operator reports UNKNOWN custody and **DO NOT ENROLL Compass**. No live publication, locator,
credentials, Astra lookup, Pi/Ghostty install or namespace/pin changes are authorized by this repair.
The earlier failed-pack locator attempt remains unknown reads as recorded, not zero reads.

R1: owner withdrawal/recovery invariant and original physical lock identity are under AK5479 repair.
The prior release/34-case report is historical, not replacement authority. Pi will consume only the
new committed owner contract and newly authorized inert stage, without inventing policy-diff semantics.
R2: the Pi schema interpreter uses JavaScript RegExp.test, unlike owner Python re.fullmatch; generation
and reason can accept prefixes/suffixes (including final LF). Reproduction/parity tests precede repair.
The two owner-JSON formatter-only exceptions remain the entire lint exception scope.

At this reopening, AK HEAD remains 890795c6e and the new owner schema/stage is not yet published.
Independent pattern tests can proceed; replacement public native success cannot be claimed yet.

### DEP-R1/R2 continuation disposition — independent checks passed; new stage pending

Main commits:
- `429b202d416bd040635c806a1542261e5eefa850`: opened findings and committed deliberately red
  Python/JavaScript generation/reason full-string counterexamples before repair.
- `e9e092a740668694775101133d159fb7c509ed6f`: exact-start/actual-end pattern matching, avoiding
  JavaScript final-newline `$`; preserves regex backtracking and uses Unicode code-point lengths.
- `ce3bac1ba0747225058f4f804ecf1797544ac7ef`: consumes the owner's early-published ABI3 contract,
  mandatory opaque `recovery_invariant_digest`, profile/publication shape checks and prepared ROOT matrix.

The owner memo now publishes the precise config-derived invariant: entire parsed policy except ONLY
`task_session.state` and `task_session.generation`. Pi does not compute that invariant, inspect policy
semantics or open policy/database/lock paths. Profile binding retains the full policy SHA; independently
validated descriptor/publication bindings include the opaque invariant. No duplicate policy-diff engine
or invented profile field was added. The owner owns historical actual T0 lock identity and recovery rules.

Byte-exact owner contract pins currently consumed:
- Protocol `9a7221c1c9d13fd57f1b7e37d9c16046ef6f87f9e7495836364bb8866bb9e64b`.
- Deployment `a9bac2b23ec3f83d6c5f6c206f1021484ccadaa645bc3fea21350c608f3cd4df`.

These are the early-published contract files, not evidence of a committed native fix or completed stage.
At last inspection the owner HEAD was still `890795c6e`; source/native repair was in progress. Future
owner commit may change bytes; recompare exact schema/closure hashes before executing replacement proof.
Old ABI2 descriptors/publications now refuse. The freezer rejects the old stage's ABI2 manifest before
native version/ABI probes or packet promotion; the historical stage is not repurposed as proof.

Observed independent verification on this continuation:

| Check | Result |
| --- | --- |
| Focused package suite | 188/188 |
| Little-helpers declared check | 628/628 + lint/typecheck/structure/release gates; isolated HOME/concurrency4/live-smoke skip |
| Safe orchestrator suite | 474/474 + lint/typecheck; exact live-loader case excluded |
| Extracted package startup/review | 124/124; synthetic SDK/native-addon/PTY, not actual ABI3 AK authority |
| Normal main hooks and whitespace | passed; no bypass / no new lint exceptions |

R2 tests execute isolated Python `re.fullmatch` against owner-schema patterns, compare JS acceptance
for generation/reason LF/CR/CRLF, line separators, non-ASCII/astral characters, whitespace, empty and
length-boundary values, and cover hash/commit trailing terminators and code-point versus UTF-16 length.
Every async public capability test uses OS-identity relocation BEFORE invocation, including the corrected
pack probe. No live locator/credential/provider operation was added. The prior failed pack's unknown
locator reads remain recorded and are not relabeled zero.

Latest independent pack (NOT replacement producer proof):
`$TMPDIR/task5480-pack-proof-W75uOT/evidence.json`, producerIntegration:false / liveActivation:false.
- little-helpers0.9.0: `1cdafc36309a9dec53fda63d04fbe18b2a12b7f7553951ad0e430d4380b1639b`.
- orchestrator0.11.5: `78ff208963aaaef834cd34c9dc95ba50d3b561cadbd8cb0b4c0a1992d39b08de`.

**Prepared, NOT EXECUTED:** the additive ROOT matrix retains the historical 34 case names and adds
18 withdrawal/recovery cases (both schemas), two actual-owner describe file-syscall checks, and four
cross-language tests consuming the owner's frozen fixture corpus/actual Python codec. Planned total
58, NOT a passing count. Each withdrawal case first requires a known-valid public plan, actual default
native admission, SDK effect, host closure and owned effect-disposition receipt. Cases cover unchanged
policy enabled and valid advanced-generation recovery-only; changed-policy enabled, unchanged generation,
changed lock directory, replaced inode (also original OFD held), operational timeout and nominal metadata
drift. Negatives require exact intended owner errors before once-marker/native start with unchanged DB
family/oracles/history. Future synthetic publication/profile are fully repinned from owner descriptor
facts. Real/global policy is never changed. The descriptor test requires no DB/lock path in strace file
syscalls with unreadable synthetic DB and absent lock directory. No native verdict is substituted.

Stop/handoff: no new committed owner source/inert ABI3 stage had been published at this disposition.
Do not run the matrix with the old stage or claim a replacement result. After AK5479 publishes its one
new stage, verify its exact manifest/closure/Git/version/ABI3, freeze a NEW packet with the existing
script, rerun both public schema matrices and record a distinct hash-bound result. The generic receipt's
`depR1R2` section is distinct; original 34-case fields/logs remain historical. Real operator custody is
still **UNKNOWN / DO NOT ENROLL Compass**. Publication/profile activation, namespace enrollment,
provider/Ghostty/Pi canaries and Task5480/Decision151 acceptance remain held. No other git writers or
unrelated5508/limits/interaction/AK5133 work was modified. No deployment, live claims, cleanup or recovery
was performed by this continuation; new recovery tests remain unexecuted pending the proper stage.


## ABI3 stage resumed — actual 58/58 replacement public proof

This section supersedes the pending-stage disposition above, **not** the historical34 receipts.
Execution source remained `fb8cf30e59c7735b86de2df9dfd4f67b1cdc3a84` (implementation `ce3bac1b`).
No production/harness correction was needed. Controller-reserved main was clean before execution.

Consumed AK source `5e1ee75b1ac0a82b1be320c53d0c760928b547e5`, evidence commit
`77b33b5f1c593adc2c86c9e28a789586a89af202`. Exact owner receipt
`agent-kernel/docs/project/contracts/task-session-dep-r1-verification-v1.json` was compared to the
committed Git blob. Existing stage (NOT rebuilt/re-staged):
`$TMPDIR/task5479-stage-output-eUcGDDKs/libexec/agent-kernel/5e1ee75b1ac0a82b1be320c53d0c760928b547e5`.

- Worker SHA256 `edab3754fd049f1b8bc2c38b12444739c470697013355ed21eede12c93f3135a`.
- Manifest SHA256 `cc2b1138323c607a19e47ea7f3e6483e791d97100bf9bb7ee1a6dcc1e912062e`.
- Actual version/ABI probe: exact clean source version, ABI3, schemas40/43, test_support:false.
- All staged artifacts: hash/size/mode/owner/single-link/canonical path checked; closure compared with
  immutable owner Git objects. Final schema/protocol hashes equal the early-consumed copies exactly.
- Current initializer export `task5479-review-artifacts.xIY8KvGC/native-worker-fixture` SHA256
  `4828006480e59513a111102a08a7cde7e8c9efdba6e9a8110e711988dbd9b0ec` verified before invocation.
  A NEW scratch seed projection references it; historical seed packet/initializer/report is untouched.
  This test-support binary initializes/observes NEW synthetic DBs only; actual admission/recovery uses
  the independently pinned default release. It is never promoted to worker authority.

New packet: `$TMPDIR/task5480-public-release-packet-E1p5Xo/packet.json`.
Executed `node scripts/task-session-public-integration.mjs <packet>`: **58/58**, **29 schema40 +
29 schema43**, 54 NEW isolated synthetic roots. No failures or bounded consumer/harness repair arose.
This is actual packed public CLI/Pi projection/native-release/SDK/tool execution with unshipped OS-home,
desktop/provider and resource-constructor seams, not installed Pi or real Ghostty/provider activation.

Observed replacement coverage:
- Original34 case names retained; SDK/resource/custody/I03/I04 checks remain intact.
- Eighteen withdrawal cases: known-valid public plan/admission, original held T0 path/device/inode,
  completed synthetic SDK write/host closure/owned effect-disposition before explicit test recovery.
- Both schemas: unchanged-policy enabled recovery and changed-policy advanced-generation recovery-only
  recover successfully. Changed-enabled, unchanged generation, changed lock directory, replaced inode
  (including original OFD still held), operational timeout and nominal metadata drift refuse at exact
  intended owner gates, before once-marker/native start. Native family/oracles and historical admission
  receipt remain unchanged for negatives. Pi occupancy is not automatically retired after native recovery.
- Future synthetic publications/profiles are fully repinned from owner-produced descriptor facts, so
  negatives are not pin-hash/permissions shortcuts. Pi consumes only opaque invariant/full-policy binding.
- Two actual owner strace file-syscall checks show no DB/lock path operations during describe, even with
  unreadable synthetic DB/absent lock directory. No inference from mere successful descriptor output.
- Four cross-language cases consume committed owner fixture corpus and actual owner Python codec,
  comparing generation/reason with packed JS acceptance.

Hash-bound execution receipt:
`$TMPDIR/task5480-public-release-packet-E1p5Xo/execution-evidence.json`, SHA256
`cd6c160348ce8e16f7f94cc24c068bfe2e7cd6389ffb6741fe85941b7439e2d5`.
It binds packet/seed, owner receipt/stage, matrix log and per-root custody/native/recovery/strace receipts.
The repo generic receipt adds **depR1R2Executed** without overwriting historical34 evidence or pretending
that the previous pending-stage report was a passing run.

Fresh independent checks: **188 focused, 628 declared helpers, 474 safe orchestrator, 124 packed**.
Helpers used isolated HOME/concurrency4 and explicit live-smoke skip; the exact orchestrator live-loader
case remained excluded. Lint/typecheck/structure/release checks passed. Root CI is not claimed.
Fresh pack `$TMPDIR/task5480-pack-proof-Gs56l0/` is byte-for-byte identical to the W75uOT tarballs
actually consumed by the matrix, confirmed by cmp and SHA256:
- helpers `1cdafc36309a9dec53fda63d04fbe18b2a12b7f7553951ad0e430d4380b1639b`.
- orchestrator `78ff208963aaaef834cd34c9dc95ba50d3b561cadbd8cb0b4c0a1992d39b08de`.

### Read-only SDK0.84.4 assessment for root owner AK5552/5554

Observed history: helpers' four exact devDependencies (pi-agent-core, pi-ai, pi-coding-agent, pi-tui)
changed from0.84.3 to0.84.4 in initial task-session commit `58a904001`. They are not a new change in
this continuation. Independent typescript-tool pins are not owned or justified by task5480.

**Actual present need is the audited compatibility pin, not a proved minimum API version.**
`identity.ts` pins all four manifests, package-owned trees, consumed entrypoints and dependency-resolution
closure. The host uses SDK AgentSession/ModelRuntime, literal resources, native Codex API/compat imports
and TUI; profile reasoning equality, serializer/tool continuation and model identity were verified
against0.84.4. Pack proof explicitly installs0.84.4. The installed changelog describes intervening fixes,
including tool-result/compaction ordering, but this is not proof those changes are required by our sealed
configuration. No0.84.3 comparative installation/test was done, so neither API incompatibility nor safety
equivalence is asserted. Do not use synthetic success to declare root policy's0.84.3 stale or overridden.

A package.json-only downgrade would diverge from the audited tree/manifests and fail SDK identity;
leaving proof installs at0.84.4 would test the wrong resolution. Aligning0.84.3 requires separately scoped
source/provider/resource/serializer review, lock/dependency consistency, deliberate identity repinning,
reasoning/catalog/model/profile audit and complete focused/packed/native matrix reproof. Build digests
and any future owner host/policy/profile publications must be regenerated together; old receipts cannot
certify new bytes. Conversely retaining0.84.4 needs an explicit root-owner policy disposition, not a local
checker exemption. No root pins/policy/checker were edited, and isolated fix5f0600cc/merge74fad392 was
not merged. Root CI mismatch is controller-reported; these scoped checks do not certify root CI.

### Remaining hold

No new producer defect observed in the58 matrix; independent acceptance remains external. UNKNOWN
custody / **DO NOT ENROLL Compass** still blocks publication/enrollment and live canaries. Ordinary
cdeef, canonical AK/DB, live policy/pins/namespace, credentials and original checkout remain untouched.
No live locator lookup occurred in this continuation; prior failed-pack reads remain **unknown** as
recorded, never recast as zero. No release rebuild, Pi install, Ghostty/provider or live claim operation.
Platform/power-loss/forced COMMIT-I/O/hostile-containment coverage is not expanded by these tests.
Task5480/Decision151 closeout, controlled publication and root engineering-pin reconciliation remain
separate owner gates.
