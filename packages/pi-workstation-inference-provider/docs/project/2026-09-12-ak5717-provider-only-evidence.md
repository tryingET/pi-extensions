---
summary: "AK5717 registration-only entrypoint: bounded implementation, real red/green receipts, and proof limits."
read_when:
  - "Reviewing or embedding the explicit workstation provider-only entrypoint."
system4d:
  container: "Uncommitted package-only implementation; AK lifecycle remains with the dispatching parent."
  compass: "Reuse contract and transport semantics without granting cold workers audio authority."
  engine: "Executable Given/When/Then tests, isolated RED, GREEN, refactor, and package gate."
  fog: "Hermetic compatibility is not installation, live inference, or AIconvo integration proof."
---

# AK5717 — explicit provider-only entrypoint

## Scope and decision

Operator-approved bounded implementation, separate from unpublished AIconvo work.
No branch switch, staging, commit, installation/reload, publication, live model,
external owner/config modification, or live service access.

Added `extensions/workstation-inference-provider-only.ts`, with only
`registerProvider` used at bootstrap. The unchanged contract loader, model mapper,
and `streamWorkstationInference` are reused, not replaced with a generic transport
or loaded through an API shim that silently discards full-factory hooks.

The entrypoint is in `files`, **not** in default `pi.extensions`. The full factory
and every pre-existing runtime module remain byte-identical. Bootstrap explicitly
refreshes contracts without health checks; invalid/missing primary contracts and
refresh errors throw before registration. Existing optional-source merge rules
remain. Unsupported models are excluded; an empty supported catalog throws.

Admission rejects scheduler authority, runtime profiles, any advertised native
audio or audio policy, and reserved Inkling identity. Invocation checks exact
provider/model/API, rejects shared armed audio without consuming or cleaning it,
checks image capability, and validates the inherited payload-hook result against
native audio and route substitution. Contract content changes or detected refresh
errors require a new bootstrap. Normal contract TTL observation and invocation
health semantics remain cached; this is not instantaneous file revocation.

Registration uses inert key metadata; the unchanged stream resolves the actual
contract credential at invocation. No Pi credential command expression is needed
at bootstrap. Arbitrary hooks/fetch functions remain trusted process code; this
entrypoint is not an adversarial-JavaScript sandbox.

## Executed TDD receipts

All runs used Node v26.8.1 (the installed executable), no dependency installation.
Initial tests used Given/When/Then titles with executable Node assertions, not
a formal step runner. The review revision below adds executable step bindings.
No tests use mocked replacement streams. The real Pi serializer/parser receives fake SSE;
the fetch boundary records serialized requests and compares image base64 and
decoded bytes. No real inference endpoint was used.

Artifacts are in:

```text
/home/tryinget/.local/state/pi-quests/tmp/ak5717-provider-only.U792OD/
```

| Run | Observed result | Receipt |
| --- | --- | --- |
| Baseline package check | 96/96 tests; packaging failed, exit 226 | `baseline-check.log` |
| Initial RED, before implementation | 13 tests: 11 failed, 2 passed; exit 1 | `red.log`, `red.sha256`, `red-source/` |
| First implementation attempt | 9/13 passed; image wire assertions failed | `green-attempt-1.log`, `green-attempt-1.sha256` |
| GREEN 1 | 13/13 passed | `green-1.log`, `green-1.sha256`, `green-1-source/` |
| Installed-host GREEN 1 | 13/13 passed | `green-host-1.log` (same source as GREEN 1) |
| Behavioral RED 2 | 14/15 passed; audio wrapped as image incorrectly dispatched | `red-2.log`, `red-2.sha256`, `red-2-source/` |
| GREEN 2 | 15/15 passed after image-shape validation | `green-2.log`, `green-2.sha256`, `green-2-source/` |
| Refactor | 15/15 passed; removed even the internal unknown-id placeholder binding; formatted only new files | `refactor-green.log`, `refactor.sha256`, `refactor-source/` |
| GREEN 3 | 16/16 passed, including timer/filesystem mutation instrumentation | `green-3.log`, `green-3.sha256`, `green-3-source/` |
| Behavioral RED 3 | 16/17 passed; text-only tool-result images were silently discarded | `red-3.log`, `red-3.sha256`, `red-3-source/` |
| GREEN 4 | 17/17 passed after tool-result image admission | `green-4.log`, `green-4.sha256`, `green-4-source/` |

Initial RED was feature absence: the entrypoint did not exist and the file
allowlist assertion failed. Two rejection scenarios also passed on missing-module
errors; those initial passes are **not** rejection-behavior proof. RED 2 and RED 3
are additional observed behavioral failures against the implemented entrypoint.

The first attempt also exposed a test fixture/API mismatch: installed Pi 0.84.3
and 0.84.4 types/serializers require `{type: "image", data, mimeType}`, whereas the
newer installed documentation describes `source`. The fixture was corrected to
the actual installed API, not the byte assertion weakened. Unsupported `source`
input now explicitly fails closed. Original failed receipts are retained.

## Coverage

- Strict minimal API throws on any access except `registerProvider`; checks after
  deferred ticks see no fetch. Separate instrumentation detects bootstrap timer
  scheduling and filesystem mutation attempts.
- Real `DefaultResourceLoader` with `noExtensions: true`, explicit file path,
  private settings, and other resources disabled loads one extension with empty
  handlers/tools/commands/shortcuts/flags. Its exact pending registration transfers
  into `ModelRuntime.create({allowModelNetwork: false, refreshOnCreate: false})`.
- Both package Pi 0.84.3 and installed host Pi 0.84.4 loader/runtime paths are
  exercised. Host preparation performs no fetch; exact invalid provider/model
  lookup yields no fallback. Runtime invocation retains image bytes and alias.
- Baseline, visible, canary aliases, ordinary other-family upstream routing,
  thinking effort, text, image bytes, and inherited payload hook changes survive.
- Direct invalid identities, exact latest-user audio markers/native blocks, hook mutation/replacement,
  audio sampling overrides, governed generation changes (including during async
  hooks), unsupported images, and shared armed audio are rejected. Synthetic
  armed state remains untouched; no scheduler consumer is invoked.

## Initial full-gate receipts (historical; see review revision below)

The original baseline and subsequent full `npm run check` runs reach packaging
without code/test failures, then fail at actual `npm pack` because the repository
is read-only in the required sandbox. `readonly-pack.log` independently records
`EROFS`, errno -30 / exit 226, for the package tarball path. This is an isolation
constraint, not a passing full gate. No gate flags, pin changes, or owner-script
bypasses were applied.

The gate itself includes `npm publish --dry-run`; it printed a dry-run success,
not publication. Its later actual pack failed; registry lookup and installation
were not reached in those initial runs. No tarball or deployment success was
claimed for that phase. Pack **dry-run**
checked the allowlist, including the explicit entrypoint.

Report-inclusive `report-check.log`: **113/113 tests passed**, pin/link/structure,
file-budget, lint, typecheck, and 23-file pack dry-run allowlist checks passed;
full command still exited **226** at actual pack. `report-host-green.log`: **17/17
passed** on installed Pi 0.84.4. Neither synthetic SSE nor a metadata registration
proves live model quality,
latency, canary behavior, AIconvo integration, packaging installation, or current
workstation health. The AIconvo worker was only a read-only consumer reference.
The runtime is not tested against future Pi image API shapes.

## Review revision — dispatch-1789226321183

The independent reviewer reproduced two regressions in provider-only admission:
ordinary incomplete-marker source text and an `audio` property in a tool schema
were rejected, while an inherited payload hook could inject `image_url` into a
text-only model. The reviewer's untouched reproduction is in `reviewer/repro.mjs`
and `reviewer/repro.log`; those tests assert the old bugs, not corrected behavior.

### Changes and actual step execution

- Replaced recursive application-data scanning with structured context and wire
  admission. The **unchanged** `latestUserAudioMarker` parser recognizes complete
  `[pi-workstation-audio:v1:[0-9a-f-]{36}]` matches only in the latest user's string
  or text blocks. One or multiple matches deny invocation. Incomplete prefixes,
  old user messages, system text, tool schemas, tool arguments, and tool-result
  text do not acquire audio authority merely by mentioning audio.
- Final wire validation checks actual root/message audio fields and message
  content types, without descending into application schemas/arguments. Hook-
  supplied images require an image-capable model, an `image_url` object, an inline
  image MIME URL containing nonempty canonical base64, and optional valid detail.
  Remote image URLs and malformed/audio wrappers are rejected before dispatch.
- `steps(t)` binds executable `Given`, `When`, and `Then` actions, enforces step
  order, emits diagnostics for each executed step, and propagates assertion
  failures. Core bootstrap, alias/bytes, host-loader, non-baseline identity, and
  new review scenarios use it. Other existing regressions remain ordinary Node
  tests. This is **Gherkin-style executable steps**, not a Cucumber dependency,
  `.feature` parser, or a claim that title text alone is step execution.

### Preserved RED → GREEN

All revision artifacts are under the existing scratch root's `revision/`:

| Run | Observed result | Evidence |
| --- | --- | --- |
| Review RED before admission changes | 26 scenarios: 7 failed, 19 passed; exit 1 | `red.log`, `red.sha256`, `red-source/` |
| GREEN after structured admission | 26/26 passed | `green-1.log`, `green-1.sha256`, `green-1-source/` |
| Step-binding refactor plus valid-hook/argument coverage | 28/28 passed | `refactor-green.log`, `refactor.sha256`, `refactor-source/` |
| Installed Pi 0.84.4 loader/runtime | 28/28 passed | `host-green.log` |
| Declared pre-push gate in writable snapshot | 124/124 tests; pin/link/structure/budget/lint/typecheck passed | `pre-push.log` |
| Genuine npm pack, without installation | exit 0; 23 packed files verified against allowlist and source bytes | `pack.json`, `pack-verification.log` |

The seven REDs were the three ordinary-data cases, text-only hook image injection,
and three malformed image shapes. Existing native-audio rejection stayed green.
Positive coverage now also verifies actual tool-call argument objects named audio
and exact bytes from a valid image-capable hook.

### Packaging boundary and remaining full-gate block

The earlier EROFS was test-infrastructure-limited, not a package defect. A small
exact package snapshot (under 1 MiB, excluding `node_modules`) now resides in
`revision/package/`. `run-snapshot.sh` mounts only that snapshot writable over the
package path inside the private network/PID/IPC namespace; original repository
and existing dependencies remain read-only. No dependencies were copied or
installed. `source-manifest.json` and `snapshot-manifest.json` prove matching file
bytes/modes; `sandbox.log` records package RW/dependency RO mount flags.

The package declares no build or prepack lifecycle script. A genuine `npm pack`
created the tarball in scratch. Its 23 files, default manifest entrypoint, and
byte equality with the snapshot were checked after extraction, without Pi/package
installation. npm 12's package-keyed JSON was normalized with the existing owner
`scripts/npm-pack-json.mjs`, not a modified gate.

**Full `npm run check` remains blocked, not passed.** Inspection shows its CI
packaging stage invokes `release:check:quick`: that includes `npm publish --dry-run`
and an unconditional registry `npm view`. The quick script already skips Pi
installation; the non-quick script explicitly installs into Pi. Those actions
are outside this revision's authority. The revision therefore executed the
unmodified declared `quality:pre-push` gate and actual `npm pack` separately,
without calling the forbidden release phase or changing flags to fake full CI.

### Integration scope and next review

The baseline-multimodal target is a `family: "baseline-text"` contract with a
selected alias advertising text/image input; it is not a new contract family.
Non-baseline families retain the unchanged shared upstream route and may return
`message.model = upstream_model`. An AIconvo-style worker requiring the selected
alias in the response rejects that mismatch. The test now asserts this limitation;
no shared-stream fix or general AIconvo compatibility is claimed.

The reviewer should rerun the explicit step scenarios and inspect the revision
manifests/pack receipt. Any complete release/registry or installation check requires
separate owner approval; no deployment, live health/model, latency, or quality
proof is supplied. AK task lifecycle remains with the parent.

## Review and reproduction

1. Review only `README.md`, `package.json`, the new entrypoint, acceptance test,
   and this report. Confirm default `pi.extensions` and all old runtime hashes.
2. From the package directory, run the preserved sandbox wrapper:

   ```bash
   S=/home/tryinget/.local/state/pi-quests/tmp/ak5717-provider-only.U792OD
   "$S/run-isolated.sh" node --test tests/workstation-inference-provider-only.test.mjs
   "$S/run-isolated.sh" env PI_TEST_SDK=/home/tryinget/.npm-global/lib/node_modules/@earendil-works/pi-coding-agent/dist/index.js node --test tests/workstation-inference-provider-only.test.mjs
   "$S/revision/run-snapshot.sh" npm run quality:pre-push
   "$S/revision/run-snapshot.sh" npm pack --json
   ```

3. Compare `baseline.sha256` and `unchanged-runtime.log`. Only `package.json`
   differs among those baseline inputs. `package-lock.json` is unchanged.
4. Preserve parent-owned AK task/review authority. Do not install, reload, switch
   branch, stage, or commit as part of reproducing these receipts.

The wrapper uses `bwrap` network/PID/IPC namespaces, private HOME/TMPDIR,
`env -i`, read-only repository/npm runtime binds, and tmpfs over host `/home`,
`/root`, `/run`, and `/tmp`. Only the task-owned scratch directory is writable.

Full factory SHA-256 (baseline and final):

```text
7edf1f00023c5f0e1aa8417a03b2f01706f42d6c4709878faed47971cbb89572
```

New entrypoint SHA-256:

```text
8ed0e5898f335bfa73fad9ee42b35e80fd1ee59b30199311e98b242e3c6c64cd
```

Acceptance test SHA-256:

```text
5391004d49ad73157590097655b52b41870aeaf45442bfc878b6f1645b58d3d9
```
