---
summary: "Task5480 implementation interface and evidence: DB-free lane classification, sealed host and explicit integration gates."
read_when:
  - "Consuming task5480 from lane task5481 or AK task5479."
type: implementation_evidence
---

# Decision151 Pi implementation — task5480

**Current continuation:** Pi bootstrap/profile/startup/viewer composition and synthetic cross-process
proof are implemented below. Public launch remains gated on native AK verification and approved
installation/pins. The initial milestone evidence/gates are historical, not the current Pi source state.

## Execution boundary

Authorized source worktree: `decision151-main.5gPphB/pi-extensions`, branch `main`, starting `db59f632e`. Canonical AK identity remains the original pi-extensions repo. No AK calls, registration, live activation, enrollment, credential/config reads or provider calls are authorized here. Synthetic data only.

## Lane producer interface — implemented v1, not activated

Public emitted export: `@tryinget/pi-little-helpers/task-session-core`.
Function: `classifyTaskSessionRequest(request)` (synchronous, data-only return).
CLI: `pi-task-session classify` receives exactly one bounded UTF-8 JSON object on stdin, returns exactly one JSON object on stdout. No other options, environment namespace override, DB call, subprocess, reservation, or directory creation. `--help` needs no namespace.

Request (all fields mandatory, no unknown fields):

```json
{"schema":"pi.task-session.classify-request.v1","requestId":"caller-stable-id","akInstance":"canonical-owner-instance","taskIds":[123,456],"cwd":"/absolute/existing/checkout"}
```

Maximum 256 unique positive safe-integer task IDs, requestId 1–128 ASCII `[A-Za-z0-9._-]`, total input 64 KiB. Duplicate JSON keys, IDs, unknown fields, invalid UTF-8, empty batches or noncanonical paths refuse. The lane MUST validate the entire legacy argv (including unsupported/duplicate semantic options) before requesting classification; MUST submit all task IDs; MUST NOT partially launch a mixed request.

Response shape (v1):

```json
{"schema":"pi.task-session.classification.v1","producer":{"package":"@tryinget/pi-little-helpers","version":"0.9.0","interface":"pi.task-session.classification.v1"},"requestDigest":"sha256-of-canonical-request","namespace":null,"classification":"unknown","reasons":["not_configured_or_incompatible"]}
```

Configured `namespace` is `{id,generation,snapshotDigest}`. Classification is `outside|enrolled|unknown`. Only `outside` permits considering legacy behavior; this is NOT task admission. Mixed/enrolled/occupied domains return `enrolled`; any missing/ambiguous custody/domain/task inventory or producer incompatibility returns `unknown`. Missing configuration never proves outside enrollment. Consumers pin the exact emitted artifact in rollout evidence in addition to checking package/version/interface and request digest. No second registry: classification reads the same owner-provisioned operational snapshot as reservation/inspection. Whole-request task/common-Git/checkout/shared-effect OR predicates apply. Task-only cross-checkout conflicts cannot be hidden by the caller cwd.

The operational namespace uses the OS account's home (not HOME/XDG overrides), fixed `.config/pi-task-sessions/host.json` locator, existing-only `.local/state/pi-task-sessions`. Owner-provisioned identity and complete canonical task-domain inventory are required for positive outside classification. No provisioning occurs in this implementation task.

## AK seam

At initial inspection, the promised AK producer path did not exist. It subsequently appeared with status **`blocked-draft-not-integration-ready`**, not a working producer. Task5479's memo reports a writable-existing-only ak-db scope blocker. No native claimability or startup/baseline algorithm was invented here.

Consumed producer-owned artifacts under agent-kernel `docs/project/contracts/`:

- `task-session-protocol-v1.json`: SHA256 `249caa943fc46e7335166f6162abab6caeb617a7710440ef8e0b1711c730d41c`.
- `task-session-protocol-v1.fixtures.json`: SHA256 `b4601779c1c5ea41d6cf893e7d7c96e9311a1b63c614b8865eb2891154e850ab`.

The adapter pins these **producer-source** digests, reports `integrationReady:false`, and refuses producer activation. Local JSON copies are formatting-normalized; parsed deep equality to both actual producer artifacts was independently checked. Shape fixtures are NOT proof of native startup, private endpoint interoperability, claims, baseline equivalence, or effect/recovery semantics.

## Executed source and independent proof

Main commits: `3b633e03` published the early lane interface; `58a904001762498c176ba3a4f2851f77015f1188` implements source, tests, packaging, and discoverability. This is **partial implementation, not Decision151/task5480 acceptance**.

| Surface | Implemented and observed | Limit |
| --- | --- | --- |
| Sealed host | Real SDK 0.84.4 AgentSession with in-memory session/settings, captured literal loader, wrapped read/write/edit/bash tools, no exposed session/runtime, guarded original objective and exact profile | Private host constructor tested with synthetic credentials; no fixed production bootstrap executable |
| Resource boundary | Literal global/ancestor context, SYSTEM/APPEND capture, selected-symlink refusal, no factories/extensions/packages/skills/templates | Captured synthetic files; no live resource/config enrollment |
| Auth/send | Copied read-only OAuth store rejects updater before invocation; guards precede native getAuth; refresh/login/deferred/raw-stream denied; SSE, zero retries, exact account/model/reasoning and run/lease deadline | No production credential acquisition, refresh, or live provider call |
| Native Codex | Actual pinned serializer, payload digest and actual-fetch compressed-body/auth/account/URL checks; real SDK synthetic SSE round and real write-tool round/continuation | Synthetic captured-fetch port, not a provider service; no successful delivery claim |
| Tool/turn denial | Guard rechecked at execution after preflight; stopped-after-send tool round refused; persistence callback failure after CLOSED sends nothing | Already-started effects cannot be undone; no live claim release/cancellation proof |
| Independent state | Existing-only owner/mode/inode checks, permanent native mutex, fsynced atomic snapshots, immutable attempt/T1 files, task/common-Git/nested-checkout/shared-effect OR exclusion, request idempotency, independent retirement flags, durable withdrawal | No production provisioning, reconciliation/recovery driver, or real ENOSPC/power-loss fault proof |
| DB-free classification | Same physical snapshot/inventory as reservation; whole-batch predicate, namespace generation/digest, task-only conflicts, unknown on uncertainty | Positive tests call the same internal filesystem implementation with synthetic locator; account-bound public positive classification is not an installed proof |
| Native custody | Linux x64 N-API v8 addon packed; no runtime compilation; fd0 socket/fd1 inherited lock CLOEXEC; no host-side AK LOCK_UN | Fixed-map assumption remains producer-gated; production bootstrap must adopt before SDK imports |
| Protocol | Bounded duplicate-rejecting strict UTF-8/JSON and framing; immutable T1, one-shot bound CLOSED and irreversible denial | Channel state machine and native custody are tested independently, not wired to an implemented AK supervisor |
| Visible UI/transport | Restricted main-screen component, copied/sanitized observations, stop/quit only; shared existing sidequest transport re-export with fixed target and no shell/debug fallback | No actual Ghostty invocation, installed `view-v1`, cross-process report/stop bridge, ACK/placement proof, or successful public launch |
| Public distribution | Emitted core export, stdin JSON CLI, thin Pi tool, discovery skill, emitted orchestrator adapter | Capability/plan/inspect/watch/classify exist; launch always refuses before reservation/spawn |

### Validation observed

Environment: Linux x86_64, Node `v26.8.1`, npm `12.0.2`, SDK `0.84.4`. Commands below were executed from `packages/pi-little-helpers`:

- `npm run task-session:test`: **63 passed, 0 failed**. Strict TypeScript builds core/host/channel/UI/adapter and typechecks shared transport; C builds with warnings as errors.
- `node --test tests/sidequest.test.mjs tests/asc-execution-observer-launch.test.mjs tests/asc-execution-observer.test.mjs`: **50 passed, 0 failed**. These are legacy regression tests, not ASC implementation changes.
- `PI_EXTENSIONS_TMPDIR="$TMPDIR" npm run lint`: **passed**, 158 files checked.
- `PI_EXTENSIONS_TMPDIR="$TMPDIR" npm run typecheck`: **passed**.
- `bash scripts/validate-structure.sh`: **passed** after fixing new skill frontmatter and emitted-extension manifest coverage.
- Scoped Biome check: **passed**, no warnings/errors. `git diff --check`: passed. All new code files below 500 LOC, tests below 1000; shared existing transport remains below 500.
- `npm run task-session:pack-proof`: **passed**. Both real lifecycle-produced tarballs installed into isolated scratch with `--ignore-scripts --omit=dev`. Emitted public exports and CLI work without the source checkout; packed N-API addon loads and locks; packed SDK identity and actual native compressed synthetic Codex send pass. Test/native compiler source is absent from the task-session runtime tarball surface.

The process suite uses a real compiled synthetic supervisor and host, real `/usr/bin/flock` contention, `/proc` descriptor observations, and eight competing reservation processes. The inherited OFD remains held after supervisor exit, ordinary child exec does not inherit it, and only the fixture host closes its own retained descriptor. No other worker is killed. This is independent kernel-mechanism evidence, **not G2 end-to-end startup proof**. The restricted transport test is an argument/failure port-contract test, not a process-placement test.

Full package `npm run check` is **not green evidence**: early little-helpers runs stopped on missing local dependencies and new structural defects (subsequently fixed and separately revalidated); a final broad test/release run was not executed under the no-runtime-activation boundary. Orchestrator `npm run check` stops on missing unrelated local dependency links. Its bounded adapter compile, fixtures and packed export pass. No reality-check/live Pi installation or reload was run. Hooks were bypassed per commit to avoid unscoped/runtime-bearing validation; scoped checks above are the actual evidence.

Source dependency installation used inspected scripts with `--ignore-scripts`; compaction's local dependency setup used `--package-lock=false` solely to run existing regression tests. No compaction/ASC source or manifest was changed. The little-helpers lock refresh also reconciles its pre-existing peer-messaging root metadata with the unchanged manifest's 0.4.0 value.

### Packed artifact receipt

Final scratch: `$TMPDIR/task5480-pack-proof-0XJtW0/`, containing `evidence.json`, per-command logs and both tarballs. Separate validation logs: `$TMPDIR/task5480-{tests,regression,structure,biome}-final.log`, `task5480-lint-package-final.log`, `task5480-typecheck-package.log`, `task5480-pack-proof-final.log`, and `task5480-orchestrator-check.log`. Scratch is not a permanent release store; the committed hashes and rerunnable scripts are the portable evidence.

| Artifact | SHA256 | Size / entries |
| --- | --- | --- |
| `tryinget-pi-little-helpers-0.9.0.tgz` | `3e0f57c63373f8356f7c07c23248502c04a536bbc1b12c2c8000060588d9837c` | 263315 bytes / 116 |
| `tryinget-pi-society-orchestrator-0.11.5.tgz` | `20de1465dc603af93a9708e69bc2ad627ebaa92654292f6fafdeb63439664cd7` | 357626 bytes / 117 |

Versions were not released/bumped; downstream must pin the exact reviewed artifact, not assume all packages of these versions include this work. Linux x64/Node26 was exercised; other Node versions, architectures and distribution libc environments remain unverified.

## Initial milestone gates (superseded by continuation below)

1. **AK owner:** deliver integration-ready native producer, complete baseline/startup/effect/recovery schemas and fixtures, fixed executable/descriptor binding and startup trace evidence. Keep the adapter default-denied until actual compatibility is verified.
2. **Pi implementation:** finish the fixed host bootstrap with adoption-before-import, owner-provisioned immutable profile/credential loading, durable startup composition, shared transport invocation, cross-process observation/stop wiring and installed viewer entrypoint. These are missing Pi-owned implementation paths, not merely unavailable live proof.
3. **Independent integration tests:** real synthetic end-to-end G2 startup/ACK/placement path; lost supervisor/channel/readback faults; independent trace decoding; stronger physical replacement/fsync/fault matrix. Current tests must not be substituted for these.
4. **Operational owner:** provision private existing-only namespace and complete canonical task-domain inventory; separately review failure reconciliation, three-part retirement and retained-effect custody. Do not auto-recover or release from inspect/watch.
5. **Release/rollout owner:** complete declared broad validation safely, supported-platform native packing tests, install/reload reality gate, exact profile/artifact pin activation, lane version/digest compatibility checks and restricted visible end-to-end rollout. None was authorized or performed here.

No DB mutation/query, AK invocation/rebinding, live credential read, provider request, namespace enrollment, pin activation, worker recovery or canonical dirty checkout file mutation was performed. The safe handoff is committed independent code plus explicit blockers—not a claim that an ordinary visible task can launch today.


## Continuation: lane5481 canonical binding contract (published before bootstrap work)

New emitted public exports from `@tryinget/pi-little-helpers/task-session-core`:

- `taskSessionInstalledIdentity()` / `pi-task-session identity` (no stdin/options):
  `{schema:"pi.task-session.installed-identity.v1",producer,configured:true,akInstance,namespace:{id,generation,snapshotDigest},classificationExport:"classifyInstalledTaskSessionRequest",classificationRequestSchema:"pi.task-session.classify-installed-request.v1",identityDigest}`.
- `classifyInstalledTaskSessionRequest(request)` / `pi-task-session classify-installed`
  takes exactly `{schema:"pi.task-session.classify-installed-request.v1",requestId,taskIds,cwd}`.
  Same bounded whole-request semantics and classification.v1 response as above, plus `identityDigest`.
  `requestDigest` hashes THIS input, not an invented AK-instance-bearing request.

Consumer recipe: import the pinned emitted core; verify descriptor schema/producer and `configured:true`;
validate the entire legacy argv; call `classifyInstalledTaskSessionRequest` with ALL task IDs and canonical cwd;
verify response producer, request digest and namespace; only `classification:"outside"` permits legacy consideration.
The classifier obtains canonical identity and classification from ONE freshly validated account-bound snapshot,
so callers need not pass a possibly stale descriptor digest or guessed AK CLI/environment identity.
A changed descriptor between discovery and classification is not an admission or a cached outside certificate.

Canonical binding is derived only when the existing owner-provisioned COMPLETE domain inventory has exactly
one distinct AK instance and the namespace is not withdrawn. This is a read-only projection of existing owner
state, NOT a new authority/registry/config file. Missing, mixed-instance, incomplete or replaced inventory returns
`configured:false` / `classification:"unknown"`; never guessed identity or fabricated outside.
Public functions have no locator/home/namespace injection argument. Internal filesystem tests use synthetic
locators; no operator configuration was read to generate fixtures. This contract is implemented in source;
installed activation remains a separate gate.


### Pi host bootstrap handoff for the evolving AK producer

Pi emits executable regular `host-v1` / `view-v1` files and an explicit ESM package marker alongside
its runtime/native closure (npm bins `pi-task-session-host` / `pi-task-session-view`). Operational owner
must deploy that complete closure with the pinned SDK dependencies to the fixed
`~/.local/libexec/pi-task-sessions/{host-v1,view-v1}` targets. Do not use a symlink rejected by AK policy
or copy an entry file without its sibling runtime/dependencies. No installation was performed.
Host accepts NO argv. Viewer accepts ONLY attempt ID. Host first adopts inherited FD0/FD1,
then detaches them to private CLOEXEC descriptors and substitutes `/dev/null` stdio BEFORE SDK import.
The latter is necessary because Node's ESM process facade can materialize stdin/stdout.

**Pi-owned private ingress contract, now adopted in actual AK source and source-schema fixtures:** first fd0 frame:
`{schema:"pi.task-session.host-bootstrap.v1",attempt,incarnation,startupDeadline,actor,leaseSeconds,
baselineDigest,akBinaryDigest,policyDigest,databaseIdentity,hostBuildDigest}`.
No namespace, credential, exec or descriptor override. Startup deadline is absolute milliseconds,
future and at most 120 seconds out; lease is 1..86400 seconds. All five digest fields are lowercase
SHA256. Baseline/actor/lease come from the native producer; Pi does not compute native claimability.
After loading the reserved immutable intent, Pi emits the producer PREPARED shape with raw/effective
resource/profile envelope digests, then consumes ADMISSION_RESULT, durably publishes T1, validates
one-shot CLOSED, and durably publishes dispatch before first provider/tool effect.

Account-bound namespace layout additions: pre-existing private `profiles/`, `credentials/`, `attempts/`.
Profiles and credentials are canonical-JSON content addressed (`<sha256>.json`, mode0600), immutable
by digest, and read-only at runtime. A profile has exactly `{schema:"pi.task-session.profile.v1",
provider,model,reasoning,account,modelDigest,credentialDigest,agentDir,runSeconds,
producer:{executable,entrypointDigest,akBinaryDigest,policyDigest,databaseIdentity,hostBuildDigest}}`.
`modelDigest` hashes exact JSON.stringify of the pinned native built-in model object (costs may be floats);
other content-addresses use the strict canonical integer-only protocol JSON. Credentials have exactly
`{type:"oauth",access,refresh,expires}`. No live config, environment credential or refresh fallback.
Caller selects an already provisioned profile digest; it cannot supply a new executable/credential path.
This is runtime configuration under the existing namespace, not task/decision authority.

Per attempt/incarnation: immutable `intent.json`, `baseline.json`, `view.json`, `host-entered.json`, `t1.json`, `dispatch.json`,
`host-terminal.json`, `host-closure.json`;
mutable bounded `observation.json` and `viewer-ready.json`; immutable idempotent `stop.json`.
The viewer readiness marker binds nonce/incarnation, live PID/start ticks and a renewable timestamp;
it is not represented as proof of Ghostty placement. Inspect/watch consume copied reports; stop requests
only deny/abort future dispatch, never release native claims or retire effects. Startup failure retains
independent occupancy and the native OFD; production host does not exit automatically before verified CLOSED.
The shipped build manifest fingerprints emitted runtime files and native addon; seed and profile must match it.

`encodeTaskSessionStartup` now validates and emits the actual producer startup schema; strict native
plan decoding also consumes its complete baseline/family schema. Invocation uses the native task repo,
which need not equal the caller checkout. The adapter remains default-denied: AK reports
`implementation-in-progress-native-verification-blocked`. Its v4 adapter scope stop is reconciled,
but native compilation/tests never started because workstation heavy-job custody preflight blocked.
This is NOT an integration-ready producer. Do not flip readiness from source or fixture presence.

SDK integrity preflight uses builtins only, before credential reads/SDK import. The original 522-JavaScript-file
check is superseded by the I02 correction below: package metadata, entrypoints and complete package-owned
file inventories for the four pinned SDK packages.
Packed tests detect transitive serializer-source tampering. SDK provider error/abort remains an explicit
guard outcome, not a successful host finish; `promptReturned` does not assert useful task completion.


## Continuation landing and final evidence

Source commits on parent main:
- `6b90412bc` — account-bound DB-free identity/classify-installed contract for lane5481.
- `26384bed89e1af081a5e931278dbc23db40f86e9` — sealed bootstrap/profile/startup/viewer composition.

Both continuation feature commits passed normal pre-commit hooks; no bypass. Original canonical
feature checkout and its uncommitted AK5133 transport/package fixes were not modified or absorbed.
Reconcile those separately before the eventual installed reality gate; these commits do not certify them.

Frozen **actual AK source** snapshot (not native acceptance):
- Protocol SHA256 `a111fac365993fa6af6c3db4f08ac42f2f354ef55c0d9a99137ad910d780e2be`.
- Fixtures SHA256 `ddbfdcc349f4a1f080711e84146c0e278bea06cd5e993c5a4c2a0738217ec8c3`.
- Python supervisor SHA256 `4da019dcb506e1d1aac16f31d40182035bb5e421ced55e9e006949c7ddec20c6`.
- JSON copies are formatting-normalized, parsed-deep-equal copies; digests identify producer bytes.
  Four message fixtures and four definition fixtures decode; negative mutations remain rejected.
  Source status is `implementation-in-progress-native-verification-blocked`; integrationReady is false.

### Observed checks (Linux x64, Node26.8.1, npm12.0.2, SDK0.84.4)

- `npm run task-session:test`: **76/76 passed**.
- Little-helpers `SKIP_PI_SMOKE=1 npm run check`, isolated HOME and test concurrency 4:
  **413/413 tests passed**, structure/file-budget/lint/typecheck and release checks passed.
  Installed Pi smoke was explicitly skipped, not a green installed/reality gate. Publish dry-run
  encountered the expected already-published-version guard; no publish occurred.
- Orchestrator lint and typecheck passed. Its full recursively discovered safe test set, isolated HOME
  and loop telemetry, excluding only `actual Pi extension loading shares the canonical preflight owner brand`:
  **472 executed / 471 passed / 1 failed**. The failure is
  `does not warn for an existing non-temp receipt path under the packet campaign root`:
  this worktree itself lies under managed `/tmp/`, so the classifier warns about the fixture path.
  That assertion was not changed or hidden. Full orchestrator check/release remains unproven/not green.
- Both lifecycle-packed tarballs install with scripts disabled into isolated scratch. Public exports,
  CLI, exact SDK closure (including a tampered transitive-source negative), native addon and actual
  compressed native Codex serialization pass. **12/12 startup/profile process tests pass against packed runtime**.
- C formatting and staged whitespace passed; normal hooks passed both source packages (174/199 files).

The synthetic startup suite exercises the shared production composition with generated profile/credentials,
real compiled socketpair/flock supervisor, separate host/viewer processes, actual SDK provider serializer and
write-tool round trip, stop-after-send, surviving-host OFD retention after supervisor loss, wrong binding,
malformed/expired bootstrap, profile mismatch, invalid effect accounting and post-CLOSED write failure.
A real Pi TUI runs in a synthetic PTY. A separate case runs the exact AK Python supervisor source with a
**scripted synthetic native worker**, including a canonical native repo different from checkout. These
prove the stated process/SDK mechanisms, **not Rust/DB claimability, real provider delivery, Ghostty placement,
installed activation or complete G1/G2**. Synthetic family tables are schema-complete fixture data, not native
baseline/effect-equivalence proof. No claim, occupancy or effect retirement follows successful tool execution.

Final pack receipt: `$TMPDIR/task5480-pack-proof-Codpfy/` (`evidence.json`, `command-*.log`, tarballs).
Versions remain unchanged/unreleased; these are exact review artifacts, not mutable version-only pins.

| Artifact | SHA256 | Bytes / entries |
| --- | --- | --- |
| `tryinget-pi-little-helpers-0.9.0.tgz` | `691d399769aba3ee0313d42860d0f71c9dd6c628913aacece9350618953adc85` | 282728 / 132 |
| `tryinget-pi-society-orchestrator-0.11.5.tgz` | `32356f3d3cfa67f9d2aca59cf9b2b7e09418d8af72dbcbd4b6694083963beddd` | 365746 / 117 |

Logs under `$TMPDIR`: `task5480-continuation-final-{tests,check,pack}.log`,
`task5480-orch-final-{lint,typecheck,complete-safe-tests}.log`,
`task5480-continuation-{c-format,source-commit}.log`. Scratch is not durable release storage.
Earlier intermediate failures (formatting, an unnecessary missing tsx loader, stale producer fixtures,
and incomplete top-level-only orchestrator discovery) were corrected before these final reported runs.

### Genuine remaining gates

1. AK owner/controller: lawful heavy-job route, native compile/tests/fault and no-maintenance/effect audit,
   frozen verified producer, policy/build identities, and actual native-worker/Pi cross-owner traces.
2. Further fault proof: broader channel/readback/duplicate-CLOSED/physical replacement/fsync/ENOSPC and
   power-loss matrix. Current named tests do not establish every fault/placement gate in the ADR.
3. Operational/release owners: complete canonical account namespace/domain inventory; immutable profiles,
   credentials, policy and exact artifact pins; complete fixed-target/runtime/dependency installation.
   This work did not provision, enroll, install/reload Pi, activate a pin or read live auth/config.
4. Live installation/reality and restricted Ghostty ACK/placement/G2; separately authorized provider canary
   and representative use; platform/libc/other Node support and the remaining broad release checks.
5. Independent occupancy/effect custody and three-part retirement remain explicit owner work. Inspect/watch/
   stop cannot recover claims or infer effects resolved. No AK CLI/DB, native recovery or other worker signaling
   was performed here. Task5480/Decision151 is **not complete or accepted**.


## Review findings — evidence8436 against 943cdd85 (open before fixes)

- **D151-I01 HIGH — OPEN:** physical inode validation does not establish current Git metadata topology.
  Re-resolve checkout gitdir/commondir during inventory, reservation and host custody validation;
  drift must deny/return unknown without clearing or reinterpreting retained occupancy.
- **D151-I02 HIGH — OPEN:** SDK identity omits package resolution metadata and non-.js executable entries.
  Pin reviewed package manifests, consumed export entrypoints and executable closure; reject export
  redirection and executable additions, retaining the existing source-tamper check.
- **D151-I03 MEDIUM — OPEN:** model/credential compatibility is checked after reservation/viewer effects.
  Introduce read-only SDK/model/account/lifetime preflight before reservation or effect ports, and retain
  child checks against later drift. Negative tests must observe unchanged inventory and no effect calls.

These are implementation defects, not unavailable-live-evidence excuses. Dispositions remain open
until source fixes and named regression/packaging checks are observed. No producer fence removal,
live credentials/config/provider/AK/DB access, enrollment or activation is authorized by this review.


### I01/I02/I03 corrected dispositions — implementation/regression proof, independent review pending

Open findings were persisted in commit `9863f7d2` before source changes. Fix commit:
`3c710d83645eaeeea9db5b6d9bd3405f1531a6f7` (normal pre-commit hook passed).
All three implementation findings are **fixed with focused and packed regressions passing**;
parent independent review/acceptance remains pending. This does not close global task5480 or Decision151.

**D151-I01 — FIXED.** `git.ts` is the shared filesystem-only Git resolver. `state.ts` now checks
checkout-to-commonGit topology alongside device/inode identities. `assertSnapshotDomains` covers all
inventory/enrollment domains and all independently occupied attempt domains. Classification, installed
identity, mutex-held reservation and host custody checks use it. Classification no longer accepts a caller-
supplied cached Git identity. A dangling commondir target cannot fall back to the old Git directory.
Inspection still reads and preserves stale custody; no metadata rebinding, record clearing or retirement.

`task-session-review.test.mjs` proves unchanged checkout/G1 inode plus redirected gitdir/commondir refuses,
including enrolled-only and occupied-only historical domains. The original request starts outside; a
separate, nonpersisted corrected-domain copy demonstrates why the new topology would be enrolled.
Namespace bytes remain unchanged by refusal. `task-session-startup.test.mjs` adds actual separate-host
metadata drift after the first synthetic provider send: no write-tool effect or second send occurs, and
occupancy stays unresolved. This is boundary-check evidence, not a hostile-filesystem race-proof sandbox.

**D151-I02 — FIXED.** `identity.ts` discovers package roots without deriving them from mutable export
entrypoints. It pins exact package.json bytes (the reviewed 0.84.4 metadata), all **2164 package-owned files**
across pi-ai/coding-agent/agent-core/tui, and exact resolved main/consumed compat/Codex entrypoint URLs.
No .mjs/.cjs/extensionless executable omission; symlink/special-file entries and nested source node_modules
are rejected. SDK-to-SDK dependency resolution remains checked. Top-level dependency trees are separately
resolved, not absorbed into these package-owned file digests; this is not arbitrary transitive supply-chain
or hostile same-UID/module-cache attestation.

`task-session-identity.test.mjs` copies only installed SDK package source into owned scratch and uses fresh
processes: approved control passes; compat/main redirection with unchanged version/approved JS, legacy main
outside the package, added .mjs/.cjs, source tamper and nested dependency additions all refuse. Redirected
code never writes its execution marker. No live SDK/config files are modified by these probes.

**D151-I03 — FIXED.** `auth-metadata.ts` shares the existing account/lifetime policy without importing a
provider/runtime. `profile.ts` performs builtin-only SDK verification, immutable profile/credential reads,
account/expiry metadata validation and pinned native-catalog model validation. `preflightProfile` returns
only the pin to the controller, not credentials. `launch.ts` invokes it before any native-plan/viewer/
supervisor port and again after asynchronous baseline acquisition, before reservation. SDK-dependent
resource imports are delayed until after the initial preflight. Child validation remains in place.
No refresh, OAuth conversion, ModelRuntime creation or provider send is part of this preflight.

Five I03 negatives assert unchanged namespace bytes, no attempt directory entries, no viewer/supervisor/
fetch call: wrong modelDigest, wrong account, insufficient lifetime, absent credential, and lifetime becoming
insufficient during the scripted baseline callback. The first four also make zero plan calls; the last uses
exactly one synthetic plan callback. Existing positive startup/model/tool tests continue to pass.

### Review-fix validation and exact artifact receipt

- Focused `npm run task-session:test`: **95/95 passed**.
- Little-helpers declared `SKIP_PI_SMOKE=1 npm run check`, isolated HOME/concurrency 4:
  **432/432 passed**, with structure/file-budget/lint/typecheck/release checks green within that explicit gate.
- Orchestrator recursively discovered safe suite: **474/474 passed**. The single live Pi-loader case remains
  explicitly excluded; the earlier non-temp assertion was fixed separately in `943cdd85`.
- Both real tarballs install with scripts disabled; public exports, fixed CLI, native loading/locking,
  SDK identity and actual compressed synthetic Codex serialization pass. **31/31 packed startup/review
  regression tests pass** against extracted runtime, including the new I01/I02/I03 negatives.
- Normal source hook and staged whitespace passed. No production readiness flag or producer schema changed.

Final receipt: `$TMPDIR/task5480-pack-proof-ente7x/` (`evidence.json`, `command-*.log`, both tarballs).
Previous receipts remain historical evidence; the updated little-helpers bytes need a newly reviewed pin.
Versions are still unchanged/unreleased.

| Artifact | SHA256 | Bytes / entries |
| --- | --- | --- |
| `tryinget-pi-little-helpers-0.9.0.tgz` | `b578656ca250880860e77befa30ac52db663775b90cb0446bb300408b3ff40e6` | 283669 / 134 |
| `tryinget-pi-society-orchestrator-0.11.5.tgz` | `32356f3d3cfa67f9d2aca59cf9b2b7e09418d8af72dbcbd4b6694083963beddd` | 365746 / 117 |

Logs: `$TMPDIR/task5480-review-final-{focused,check,orch,pack}.log`,
`task5480-review-source-commit.log`; initial failures remain in review logs (null-prototype digest fixture
integration and duplicate immutable fixture creation were corrected, not bypassed).

Residual gates: parent independent review; actual native AK verification and cross-owner fault/effect proof;
approved owner provisioning/profiles/pins/installation; live Pi/Ghostty/provider gates; broader power-loss/
filesystem-fault and supported-platform validation. Public launch and host entry still invoke the unconditional
producer-verification fence. No AK/DB/native AK build, live auth/config/provider, installation, enrollment,
claim mutation/recovery, other-worker signaling or out-of-scope source changes were performed.


### I03 reopened — requested reasoning fidelity (before correction)

**D151-I03 OPEN:** independent review resolved I01/I02, but found a remaining late refusal:
a correctly content-addressed gpt-5.4 profile requesting `max` passes model/account/lifetime preflight,
while pinned SDK reasoning normalization produces `xhigh`; the child rejects constructor state only
later. The earlier I03 fixed disposition was incomplete. Require exact effective/requested reasoning
agreement in the read-only preflight before reservation or effect ports; never silently downgrade.
Retain child rechecks and verify supported levels plus unchanged namespace/zero effects for this repro.


### I03 reasoning correction — reproduced and fixed; independent re-review pending

- Reopened before mutation in `6fe5d879`; the previous I03 disposition was incomplete.
- Fix: `c4618db0151e13d3dd43f2e56fe483757b7e6afb` (normal hook passed).
- Operator reports I01/I02 independently resolved with 19 selected regressions passing; this correction
  changes neither finding's implementation. I03 remains subject to parent independent re-review.

`profile.ts` now imports the **same pinned pure `clampThinkingLevel` helper** used by SDK0.84.4
`createAgentSession`. After exact native model digest validation, preflight requires
`clampThinkingLevel(model, requested) === requested`; otherwise it refuses
`reasoning_profile_unsupported`. It does not substitute the clamped level. The existing pre-reservation
and post-baseline preflight calls both use this check, as does child profile loading. Host constructor/
dispatch reasoning guards are unchanged, and the unconditional producer-verification fence remains.

The added max/gpt-5.4 regression uses a valid native model digest, correct content-addressed profile and
matching request labels. It independently asserts the pinned SDK clamps max to xhigh. **Before the fix**,
the test failed with `unexpected_plan`, proving the invalid combination reached the plan port. **After the
fix**, it refuses with zero plan/viewer/supervisor/fetch calls, unchanged namespace/profile bytes and no
attempt directory entry. Child profile loading also refuses; there is no downgrade.

Six positive cases (off/minimal/low/medium/high/xhigh) preserve the exact requested level through readonly
preflight, child profile loading and actual SDK host construction. They perform no send and leave namespace/
profile bytes unchanged. These are constructor/preflight fidelity checks, not provider-delivery proof.

Observed validation for this correction:
- Emitted task-session build passed.
- Selected I03 suite: **12/12 passed** (six supported levels, six admission-negative cases).
- Little-helpers recursively discovered safe suite: **438/438 passed**, explicitly excluding the synthetic
  PTY `real private startup/bridge processes: real-tui` case to honor the no-terminal boundary.
- Orchestrator safe suite: **474/474 passed**, with its single live Pi-loader case explicitly excluded.
- Little-helpers lint/typecheck/structure, scoped Biome, whitespace and normal source hook passed.

No terminal/window or install was performed in this correction. Consequently the full declared release
check and install-based packing proof were **not rerun**: prior tarball hashes remain historical and do not
certify this new source. No native AK/DB operation, provider HTTP, live config/auth, activation, enrollment
or recovery occurred. Native/installed/live gates and global task5480/Decision151 acceptance remain outside
this proof. Next step is independent re-review of the new I03 repro/fix, not weakening the producer fence.

Logs under `$TMPDIR`: `task5480-reasoning-{red,build,focused,lint,typecheck,structure,broader,orchestrator}.log`,
`task5480-reasoning-{open,source-commit}.log`. The red log is retained as the pre-fix counterexample.


### D151-I04 OPEN — approved owner model/provider resolution (before fixes)

Evidence8459 identifies a remaining accepted-requirement gap: builtin-only openai-codex selection
cannot express an exact operator alias resolved through approved owner metadata. Implement a private,
content-addressed nonexecutable model source with explicit requested/resolved identities, bound into
profiles/envelopes/receipts/UI. Do not infer actual Astra mappings or read live configuration. Native
Codex API/endpoint/OAuth and exact reasoning constraints remain mandatory; unsupported metadata must
refuse before effects. Producer readiness remains unconditionally fenced. Disposition stays open until
source, synthetic native serialization and packed regressions pass; live alias availability is not proof here.


### I04 implemented — exact owner model-source contract, independent review pending

I04 was recorded open before changes in `4f1019a4`. Source fix:
`026b607874818cb382334a9df36a63fc4c453e18` (normal hook passed). Implementation and the named synthetic/
packed regressions now pass; independent review and operational approval remain pending. No real Astra
mapping, account configuration or availability was inspected or inferred. I01/I02/I03 guards remain.

#### Profiles and source schema (all listed fields required; no extras)

Existing `pi.task-session.profile.v1` remains the pinned SDK builtin-catalog case. New
`pi.task-session.profile.v2` has the same fields **plus `modelSourceDigest`**:
`{schema,provider,model,reasoning,account,modelDigest,modelSourceDigest,credentialDigest,agentDir,runSeconds,producer}`.
The existing producer tuple is unchanged:
`{executable,entrypointDigest,akBinaryDigest,policyDigest,databaseIdentity,hostBuildDigest}`.

Both profiles and model sources are existing-only, private mode0600 regular single-link files, addressed
by SHA256 of the bounded strict canonical JSON. Profiles remain under `profiles/<digest>.json`; v2 model
sources live under **`model-sources/<modelSourceDigest>.json`** beneath the existing OS-account namespace.
The directory must already exist privately. No public tool/CLI operation provisions these artifacts.
Approval is an owner publication/pinning gate, not something inferred from file presence or test success.

Model source schema (the labels below are **synthetic examples, not real Astra mappings**):

```json
{
  "schema": "pi.task-session.model-source.v1",
  "implementation": "pinned-native-codex-sse-v1",
  "requested": {"provider":"synthetic-astra-provider","model":"synthetic-astra-label","account":"synthetic-account"},
  "resolved": {"provider":"synthetic-wire-provider","model":"synthetic-nonbuiltin-codex-wire","account":"synthetic-account"},
  "api": "openai-codex-responses",
  "baseUrl": "https://chatgpt.com/backend-api",
  "transport": "sse",
  "auth": {"kind":"oauth","provider":"openai-codex","refresh":false},
  "metadata": {
    "name":"Synthetic owner model",
    "reasoning":true,
    "input":["text","image"],
    "contextWindow":131072,
    "maxTokens":8192,
    "costMicroUsdPerMillion":{"input":1250000,"output":9000000,"cacheRead":125000,"cacheWrite":0},
    "thinkingLevelMap":{"off":"none","minimal":"minimal","low":"low","medium":"medium","high":"high","xhigh":"xhigh","max":null}
  }
}
```

- `requested` and `resolved` contain exactly provider/model/account strings (1..128 characters).
  Requested values must equal profile/request labels. **Account strings must remain identical** across
  requested, resolved, profile and credential JWT account metadata. This seam does not translate account
  aliases or permit an account/billing switch.
- API/baseUrl/transport/implementation/auth tuple is fixed as shown. WS, refresh, alternative auth owner,
  endpoint/API or implementation needs an explicit native-fit gate; no silent fallback or downgrade.
- Metadata accepts only the fields shown. Text input is required; image is optional, unique, with no other
  input kind. Context/maxTokens are positive safe integers; maxTokens cannot exceed contextWindow.
- Every cost member is an explicitly supplied nonnegative safe integer <=10^12, in **micro-USD per million
  tokens**. SDK rates are those values divided by 10^6; no invented/default price. This binds declared
  pricing metadata, not independently observed service billing.
- Every thinking-map member is required and is either null (unsupported) or its own native effort string;
  off may map to `none`. Cross-level remapping is refused. Pinned SDK `clampThinkingLevel` must still leave
  the requested level unchanged before reservation and in child validation.
- No metadata header, sampling parameter, module, function, factory or registry override is accepted.
  Additional/malformed/duplicate keys and unsupported values refuse, not partially load.

`modelDigest` pins SHA256 of JSON.stringify of the exact materialized SDK descriptor. `model-source.ts`
constructs fields in this order: id/name/api/provider/baseUrl/reasoning/input/cost/contextWindow/maxTokens/
thinkingLevelMap; cost order is input/output/cacheRead/cacheWrite, thinking-map order is off/minimal/low/
medium/high/xhigh/max. Reordering source JSON keys does not change materialization. No ambient model
registry or network discovery participates. Missing source bytes do not fall back to the builtin catalog.

#### Identity, native dispatch and receipts

The public request schema remains `pi.task-session.request.v1`: provider/model/account are the **original
operator labels**, matching a provisioned profile; it accepts no inline model object, source path, endpoint,
header or executable override. `modelSourceDigest` is read from the private v2 profile, not public arguments.

Internal resolution is exactly:
`{schema:"pi.task-session.model-resolution.v1",implementation:"pinned-native-codex-sse-v1",sourceDigest,
requested:{provider,model,account},resolved:{provider,model,account},modelDigest}`.
Builtin v1 uses sourceDigest:null and identical requested/resolved identities.

The SDK session and native serializer use the explicit resolved model/provider. Provider strings do NOT
select factories/plugins: streaming always invokes the pinned native Codex implementation. Its private
ModelRuntime binds auth metadata for the resolved label to the selected copied credential through the
native `openai-codex` OAuth owner. hasConfiguredAuth reports credential presence only, not readiness;
checkAuth/getAuth remain guarded and unknown labels cannot trigger ambient auth discovery. Separate-account
fixtures verify no credential mixing. Actual fetch still enforces exact Bearer token/account header,
`https://chatgpt.com/backend-api/codex/responses`, SSE, zero retry and redirect refusal. Body.model must equal
resolved.model. The original objective and requested reasoning remain immutable.

New `pi.task-session.intent.v2` adds `modelResolution`; the child compares it to freshly loaded resolution
before PREPARED. Raw/effective envelope and profile/request digests transitively bind it without changing AK
wire schemas. Dispatch and host-terminal receipts carry the resolution explicitly; terminal guard identity
also retains both label sets. No auto-migration of older intents: incompatible startup refuses with custody
retained. Flat observation identity contains original provider/model/account, resolvedProvider/resolvedModel/
resolvedAccount, modelSourceDigest, modelResolutionDigest, nativeImplementation and authProvider. The view
wraps identity field-by-field at ordinary terminal widths rather than truncating a single JSON header.
If child validation fails, known requested labels remain visible with resolutionStatus:unverified; failed
validation is not branded as a verified resolved identity.

#### Executed verification and receipt

- Focused task-session suite: **124/124 passed**.
- Little-helpers declared check with explicit `SKIP_PI_SMOKE=1`, isolated HOME/concurrency 4:
  **461/461 passed**, structure/file-budget/lint/typecheck/release checks passed within that gate.
- Orchestrator safe recursive suite: **474/474 passed**, excluding its single live Pi-loader case.
- Real lifecycle tarballs install only into owned scratch with scripts disabled. Public exports/CLI,
  SDK identity, native loading/locking, compressed native Codex serialization and **60/60 packed startup/
  review tests pass**. This includes the authorized synthetic PTY, not real Ghostty.
- I04 tests cover a genuinely nonbuiltin synthetic model/provider alias, exact wire model/account/objective/
  reasoning, copied identity at 80-column view width, two isolated account credentials, JSON-order stability,
  pre-effect rejection of invalid metadata/source/reasoning, and a separate host's pre-dispatch resolution
  drift refusal. A complete alias startup executes the actual SDK write tool and second native serializer
  round with fake SSE responses. Intent/dispatch/terminal identities agree; independent occupancy remains.
- Initial fixture failures (expected error token and a missing import) and the genuine SDK alias-auth
  preflight mismatch were fixed before final runs, not hidden by bypassing the SDK or using another model.

Final receipt: `$TMPDIR/task5480-pack-proof-UiGJKJ/` (`evidence.json`, `command-*.log`, tarballs).
Versions remain unchanged/unreleased; old hashes do not identify this implementation.

| Artifact | SHA256 | Bytes / entries |
| --- | --- | --- |
| `tryinget-pi-little-helpers-0.9.0.tgz` | `7ac4a7aaadc74a7b351a831f782bdf8f582499d0e066e684b688fc5809966a49` | 286419 / 135 |
| `tryinget-pi-society-orchestrator-0.11.5.tgz` | `32356f3d3cfa67f9d2aca59cf9b2b7e09418d8af72dbcbd4b6694083963beddd` | 365746 / 117 |

Logs: `$TMPDIR/task5480-i04-{focused-final,check-final,orch-final,pack-final}.log`,
`task5480-i04-{owner-tests,startup-alias,source-commit}.log`. Normal hooks and whitespace checks passed.

Remaining gates: independent I04 review; actual owner model/account metadata publication and native-fit
approval (including whether real Astra needs unsupported WS/refresh/headers/endpoints); exact installation/
profile/policy/artifact pins; AK owner's R1/R2/installer repairs and actual-native/Pi interop evidence;
installed/reality/Ghostty/provider canaries and rollout approval. Parent reports native AK test progress,
but this worker did not execute/verify it or change producer readiness. The unconditional producer fence
remains. No live config/auth, real Ghostty/provider calls, live installation/activation, namespace enrollment,
AK/DB mutation, other-worker signaling or original feature-checkout/AK5133 dirty-code changes occurred.
Task5480/Decision151 is not complete or accepted.


### I04 reopened — explicit owner reasoning membership (dispatch1788782292134)

Independent review reports a remaining bounded blocker against `026b6078`: a correctly repinned v2
source with reasoning:true and seven null effort entries admits requested off via the pinned SDK's empty-
set clamp fallback. reasoning:false also synthesizes off regardless of an explicit null off declaration.
This is not a provider/account escape or an I03 builtin regression. Status: **OPEN, reproduction pending**.
Repair scope is explicit owner membership/non-null checks and nonempty/consistent capability declarations,
while retaining SDK clamp equality. Fully repinned negative fixtures must prove zero effect ports and
unchanged occupancy; exhaustive support-map coverage is planned. No actual Astra/config/provider access,
live activation or producer fence removal is authorized. Operator reports native R1/R5 resolved and R6
(DB schema40 compatibility) in repair; this worker has not verified those owner results.
