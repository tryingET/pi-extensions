---
summary: "Task5513 early native integration harness: static checks pass; actual AK/Pi execution blocked on exported native artifacts and frozen owner revisions."
read_when:
  - "Resuming task5513 after task5479 exports its native fixture and debug binaries."
  - "Distinguishing static harness checks from actual native compatibility evidence."
type: implementation_evidence
---

# Task5513 — early native integration, NOT complete

**Historical preparation receipt:** actual native execution subsequently passed sixteen
cases against a frozen artifact pair. See [the native interop continuation](2026-09-07-visible-task-session-native-interop.md).
The initial non-execution statements below describe this earlier preparation only.

## Observed result and stop

**No native integration case has executed.** Both native artifacts in the AK
[owner verification receipt](/home/tryinget/ai-society/softwareco/owned/agent-kernel/docs/project/contracts/task-session-verification-v1.json)
were removed by its heavy-job runner. The real-artifact freeze command exits **78,
PENDING_ARTIFACT**, before SDK import, fixture execution or DB creation. No substitute
worker, local AK build or retained-run cleanup was attempted. Parent resumes this task.
The prior 25 Rust / 15 supervisor cases are **owner historical evidence**, not this
harness's results and not current R1–R5 acceptance.

Executed here: **8/8 static/oracle-unit checks**, scoped Biome checks and whitespace.
Those checks cover JS/Python syntax, production-worker source inclusion, current
producer/consumer schema-definition equality, retained public fences, fail-closed
artifact absence, independent canonical digest agreement and adversarial oracle
self-tests. They do not prove the unexecuted process callbacks work end to end.
[Machine evidence](2026-09-07-visible-task-session-native-integration-evidence.json)
records log hashes and source observations.

## Harness files and intended execution

All new runtime-bearing test code is unpublished, root-scoped:

- `scripts/task-session-native-integration.mjs`: explicit `static`, `freeze`, `run`.
  No AK CLI/build/install fallback. Missing exports or revision drift exit 78.
- `tests/task-session-native/pins.mjs`: ELF magic, executable bytes against owner
  receipt, AK source inventory and Pi source/emitted closure inventories; exact HEAD
  and source rechecks before/after execution. Hashes are test identities, not release pins.
- `fixture.mjs`: invokes only the bounded unshipped fixture API on a new
  `task5479-native-process-task5513-*/new-synthetic.db`, builds synthetic private
  policy/resources/profile/credentials, and binds the real repo/task returned by AK.
  Baseline rows come from actual native `--inspect`; only the transport envelope's
  canonical digest/time wrapper is formed here. No claim algorithm or family fixture.
- `supervisor.py`: imports actual owner Python source and uses its existing private
  `Supervisor` constructor. Passive call/return tracing, no overridden worker method.
- `host.mjs`: adopts actual inherited custody before SDK imports; calls actual emitted
  `openAdoptedChannel` and `runHost`. Checkpoints wrap real channel events without
  synthesizing ADMISSION_RESULT. Captures actual native Codex compressed serialization,
  returns synthetic SSE, and requests an actual SDK write tool plus continuation.
- `viewer.mjs`: actual Pi readiness/control bridge in a separate process, no desktop.
- `oracles.mjs`: independent canonical wire binding/order/replay checks, native
  readback digest/claim tuple and permitted synthetic task/raw-family effect comparison.
- `integration.test.mjs`: fifteen executable case definitions, not passing claims.
- `contracts.test.mjs`, `coverage.mjs`: static/oracle checks and explicit pending
  required cases. Even if the implemented native cases eventually pass, the runner
  returns 78 while required gaps remain; Node TODO counts cannot mint completion.

## Implemented case definitions — all native execution pending

1. Native claim → bound durable T1 → actual T2/private CLOSED → two actual SDK
   synthetic serialized sends and `src/proof.txt` write; exact owner recovery after
   host closure and a separately justified synthetic effect disposition. Missing
   disposition and repeated recovery refuse; Pi occupancy remains unresolved.
2. Changed actual native baseline before startup: preclaim denial, not a claim-statement fault.
3. Actual compiled worker's existing `native-exit-after-result` fault: committed claim,
   failed process result, no fabricated admission or send; surviving host retains OFD.
4. Owned host termination and independent supervisor termination at admission.
5. Outgoing real PREPARED envelope mismatch, invalid profile model digest, producer pin mismatch.
6. Namespace withdrawal after CLOSED; Git topology drift after first send, before tool execution.
7. Real lease expiration before CLOSED consumption (no fake clock/claim tuple).
8. CLOSED delivery loss at the host callback, post-CLOSED persistence failure,
   independently corrupted durable T1, and policy drift before T2.

At checkpoints, an independently opened `/usr/bin/flock` must be excluded during
custody and available after T2. Actual host `/proc` fd flags and ordinary child-exec
noninheritance are checked. No tools/sends may precede valid CLOSED. Scratch is retained;
cleanup only closes/signals this case's owned process identities, never another worker,
retained build, namespace history or canonical lockfile.

## Required handoff gaps

- **5479/controller:** export the next approved passing native fixture and debug ELF
  with hashes and an updated source-verification receipt in the owner implementation
  memo. Old source42b600829 hashes do not certify current R1–R5 work. Ten source paths
  already differed from that receipt during this preparation; no native verdict on
  those edits is asserted.
- **5479/controller:** the inspected external fixture exposes initialize/inspect/drift/
  reassign and post-result process exit, but not the core test's real postcommit
  readback failure or claim-statement conflict. Supply narrowly bounded synthetic
  fault operations using the same production worker; do not return scripted ready
  data or inject a different admission implementation. Current preclaim drift and
  commit-result-loss cases cannot substitute for these obligations.
- **5480/controller:** freeze I04 source and its emitted/build/SDK evidence, then add
  owner-model alias coverage. Current harness provisions builtin v1 Codex profiles.
  Hashing source and dist independently does **not** prove source→emission correspondence;
  consume owner build/pack provenance before calling the pair compatible. No Pi build
  or dependency install was performed here. I04 was actively changing concurrently.
- Native `--inspect` exposes baseline authority families, not an independent complete
  DB/event/receipt export. The oracle checks its full exposed family set and task tuple;
  it is not an exhaustive FK/catalog/native storage effect audit. R1/R2 remain owner work.

## Public-entrypoint / G2-P1 boundary

This tests shared production implementations through **existing unshipped internal
constructors**, not the installed public host/CLI. Production host and public producer
fences are unchanged. The test bootstrap supplies a new synthetic locator/policy and
captured send port, not a test flag choosing fake admission. No real Ghostty/placement,
installed gate/host path, public positive entrypoint, live provider, credentials, config,
namespace enrollment, canary, or final delivery proof is claimed. SDK package identity
remains checked by production startup; arbitrary transitive supply-chain attestation,
power loss, hostile ABA and exhaustive effect retirement are not established here.

## Resume (parent only, after export and owner freeze)

From this ordinary `main` worktree, with existing canonical TMPDIR:

```bash
node scripts/task-session-native-integration.mjs static
node scripts/task-session-native-integration.mjs freeze \
  /home/tryinget/ai-society/softwareco/owned/agent-kernel \
  <updated-owner-verification-receipt.json> \
  <exported-native-fixture-ELF> <exported-candidate-debug-ELF> \
  <reviewed-exact-current-Pi-HEAD> "$TMPDIR/task5513-pins.json"
node scripts/task-session-native-integration.mjs run "$TMPDIR/task5513-pins.json"
```

Freeze output is `FROZEN_NOT_EXECUTED`. It refuses mismatching owner source bytes,
changed HEADs and non-ELF/scripted workers. Native run never automatically rebuilds.
Any changed producer API, I04 profile or emitted closure must be reviewed/refrozen;
do not override checks to reuse historical artifacts. The canonical AK repo identity
remains original pi-extensions; no worktree registration/rebinding or AK command ran.

Source observation: Pi initial `d40b39ee15f4e4faaa4dbaa15942d6abd031fa1c`, prelanding
`0a73e9322accfaacdc263639922d23270c3cd3ef`; AK HEAD stayed
`11b56173df5924be56db652d15b26d3675702575` with concurrent uncommitted owner edits.
Only exact root-scoped harness/docs files are landed. Full monorepo `check`, package
release/reality and live activation were not run under this bounded early-integration
contract. Task5513 and final delivery5482 remain open; parent owns AK authority.
