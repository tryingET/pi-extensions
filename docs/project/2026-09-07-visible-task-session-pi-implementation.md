---
summary: "Task5480 implementation interface and evidence: DB-free lane classification, sealed host and explicit integration gates."
read_when:
  - "Consuming task5480 from lane task5481 or AK task5479."
type: implementation_evidence
---

# Decision151 Pi implementation — task5480

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

## Remaining implementation and rollout gates

1. **AK owner:** deliver integration-ready native producer, complete baseline/startup/effect/recovery schemas and fixtures, fixed executable/descriptor binding and startup trace evidence. Keep the adapter default-denied until actual compatibility is verified.
2. **Pi implementation:** finish the fixed host bootstrap with adoption-before-import, owner-provisioned immutable profile/credential loading, durable startup composition, shared transport invocation, cross-process observation/stop wiring and installed viewer entrypoint. These are missing Pi-owned implementation paths, not merely unavailable live proof.
3. **Independent integration tests:** real synthetic end-to-end G2 startup/ACK/placement path; lost supervisor/channel/readback faults; independent trace decoding; stronger physical replacement/fsync/fault matrix. Current tests must not be substituted for these.
4. **Operational owner:** provision private existing-only namespace and complete canonical task-domain inventory; separately review failure reconciliation, three-part retirement and retained-effect custody. Do not auto-recover or release from inspect/watch.
5. **Release/rollout owner:** complete declared broad validation safely, supported-platform native packing tests, install/reload reality gate, exact profile/artifact pin activation, lane version/digest compatibility checks and restricted visible end-to-end rollout. None was authorized or performed here.

No DB mutation/query, AK invocation/rebinding, live credential read, provider request, namespace enrollment, pin activation, worker recovery or canonical dirty checkout file mutation was performed. The safe handoff is committed independent code plus explicit blockers—not a claim that an ordinary visible task can launch today.
