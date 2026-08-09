---
summary: "Pi-owner configured-source and synthetic canary evidence for the D2E pre-RFC decision membrane."
read_when:
  - "Reviewing Pi-owner evidence for D2E Prompt Vault bindings, legacy transfer disablement, execution-memory observation, or fenced runtime-status behavior."
  - "Deciding whether the FCOS D2E convergence packet is ready for Tier-1 RFC promotion."
type: "evidence"
status: "owner_evidence_partial_no_go"
---

# D2E installed consumer and canary evidence

## Owner verdict

**NO-GO for RFC promotion on the Pi prerequisite at this revision.**

This owner bundle proves the configured on-disk package identities and the current source-level fail-closed D2E contracts. It does **not** prove that the already-running Pi process loaded those bytes. More importantly, the temp-isolated synthetic incident-fence canary fails: `/runtime-status` invokes the injected AK sentinel once while clearance is modeled as unknown and the incident fence as active.

No live `/runtime-status`, AK executable, AK database, `society.v2.db`, WAL, SHM, package install, `/reload`, Prompt Vault mutation, or runtime activation was used.

## Scope and observation boundary

Captured at `2026-08-09T22:12:41Z` from:

- monorepo source ref `019870f97fb3aa24c266a9623bf8f940c7e9ede7`;
- configured Pi user settings at `~/.pi/agent/settings.json`;
- configured local-path package sources;
- deterministic direct Node package tests;
- a temp-isolated sentinel harness over the configured local orchestrator source.

Observed facts, owner interpretations, and unproven claims are kept separate below. This artifact does not authorize activation, D2E applied execution, AK access, downstream implementation, or RFC promotion.

## Configured package identity

The selected settings entries are:

```json
[
  "/home/tryinget/.local/share/pi/live-worktrees/pi-extensions-4c82c3d7/packages/pi-vault-client",
  "../../ai-society/softwareco/owned/pi-extensions/packages/pi-society-orchestrator"
]
```

Configuration digests:

| Evidence | SHA-256 |
|---|---|
| Full user settings file | `21520bdd91629cc306020d776fe1f1a4624577d94d40746c59f1b00762c908ce` |
| Canonical JSON array containing only the two selected entries | `976b1f1cb81edd13ca6fd4955872ba5bcc2552d15cfea7bcf89bc54f63493a08` |

Machine-readable normalized receipt: `docs/project/evidence/2026-08-09-d2e-pi-owner-receipt.json`. The settings digests attest the captured file/selected-entry bytes only; the receipt does not reproduce or disclose unrelated settings fields.

Package identity:

| Package | Configured source | Source ref | Version | Tracked-tree observation |
|---|---|---|---|---|
| `@tryinget/pi-vault-client` | `/home/tryinget/.local/share/pi/live-worktrees/pi-extensions-4c82c3d7/packages/pi-vault-client` | `4c82c3d7f5c8fecec31eee18ac1cd1cb96d67463` | `0.4.0` | 188 tracked paths; index digest matches the current monorepo package exactly. Only untracked `node_modules/` was present. |
| `@tryinget/pi-society-orchestrator` | local path resolving to this monorepo's `packages/pi-society-orchestrator` | `019870f97fb3aa24c266a9623bf8f940c7e9ede7` | `0.5.1` | 370 tracked paths; no tracked package diff existed before this evidence slice. Pre-existing untracked diary captures were excluded and untouched. |

Tracked index digests:

```text
configured pi-vault-client: 57367f74e37c68d7676416fb509507816ffe9ea0a6dc09a4aac26f6cd3febdd9
current    pi-vault-client: 57367f74e37c68d7676416fb509507816ffe9ea0a6dc09a4aac26f6cd3febdd9
current pi-society-orchestrator: faa577f0639214de7fe9502d2067fbe4f189bc491f7111dfca355a5bf9029337
```

Each index digest is the SHA-256 of the exact newline-delimited output from `git -C <repo> ls-files -s -- <package-path>`, including path, mode, stage, and Git blob identity.

The equal Vault index digest establishes tracked on-disk package parity between the configured worktree and current package tree. It does not establish active-process load parity.

### Runtime-significant file digests

Configured Vault files and their parity-equivalent current counterparts:

| File | SHA-256 |
|---|---|
| `package.json` | `43e55aab41ac4d45b5ac9f9da03e0a731e68433afda839a82d782f8d8be93596` |
| `extensions/vault.js` | `b5d653fbead4a6b6c783ff9e8443cc16836e81432b6307fc70229f851c4b5f95` |
| `src/dispatchPosture.js` | `d89178975ba3cce36916ff3c3008f91999465ef82814785e2fd6781af036bb92` |
| `src/dispatchPosture.ts` | `a63046bdd9fb07aca23f28f20186629254afcc3c2426cb12d2eceb2d91ebfbc0` |

Configured local orchestrator files:

| File | SHA-256 |
|---|---|
| `package.json` | `afc1a629f9d799a878b52e7c23a27e2a7380e26ea571f6657431932aa5e3a583` |
| `extensions/runtime-footer.ts` | `7fc72b2f17e710db0182a2406f07a52ad47968ebf689eded67200f0de7cf264a` |
| `extensions/society-orchestrator.ts` | `26c756f448d6f3d66b9a7231fe29270747eb31ad952c9d6668330302915264a8` |
| `src/runtime/d2e-transfer-contract.ts` | `ec30729d32052b8fa8367da099f1de0fef2aaa0f56f463f8a3c38bd89bcc71e3` |
| `src/runtime/d2e-execution-memory-contract.ts` | `91bab2ea0c55edbd066f60159f6fecdfcd3916a543b8b93c7e08aebf52124c16` |
| `src/loops/engine.ts` | `511460609279c6a284dbdc67d9aa8d06393052e009bc3bac164c7e9fb3c5ac87` |

## Binding and no-effect canaries

The TAP output hashes below are session-local correlation digests. Node timing fields and randomized managed-temp paths make raw TAP/output bytes intentionally non-canonical across reruns. Durable normalized outcomes live in `docs/project/evidence/2026-08-09-d2e-pi-owner-receipt.json`; the pass/fail counts and named assertions, not byte-identical TAP replay, are the controlling claims.

### Configured Vault path: fail-closed dispatch

Command:

```bash
cd /home/tryinget/.local/share/pi/live-worktrees/pi-extensions-4c82c3d7/packages/pi-vault-client
node --test \
  --test-name-pattern='blocks unbound workflow and unknown governed values|blocks mixed composites and incompatible bindings|classifies control_mode=loop without known binding as missing_execution_binding_fail_closed|separates the negative-only execution-memory consumer from legacy D2E applied bindings' \
  tests/dispatch-posture.test.mjs tests/dispatch-authorization.test.mjs
```

Result: **4 passed, 0 failed**. Output SHA-256: `3f04f21512ff360985100ca488522250f4614e6a23f8d140bfca3b7c92d74ebc`.

A broader direct run of those two files passed **42/42**. Output SHA-256: `596e7cd5263f68763f9a29685babf77823b0a8169f710833aab515ae8ceae41b`.

Observed contract:

- missing/unbound workflow bindings fail closed;
- unknown governed values fail closed;
- mixed/incompatible bindings fail closed;
- legacy `D2E_TRANSFER_COMPLETE_V1` bindings remain separate from `D2E_EXECUTION_MEMORY_V1`.

### Stale projection canary

The parity-equivalent current Vault tree ran `tests/dispatch-projection-receipt.test.mjs`: **3 passed, 0 failed**, including `client fails closed when a quarantined raw file reappears`. Output SHA-256: `8cfc9f984bb530fab12851e46bbb23f77244a349f1a8ff29c849a7382659231d`.

The configured worktree could not directly run this TypeScript-transpiling test because its local untracked dependency tree lacks the `typescript` development dependency. That failed harness attempt is environment evidence, not a product failure. The stale behavior is therefore proven against the tracked parity-equivalent source tree, not against a fully hydrated configured-path test environment.

### Orchestrator legacy-transfer and execution-memory canaries

Command:

```bash
cd packages/pi-society-orchestrator
node --test \
  --test-name-pattern='core sequencer defaults applied activation off with zero effect on omission|rollback disable blocks apply without preparing or claiming|consumer is default-disabled before binary inspection or producer spawn|applied mode is structurally unsupported even when controller enables observation|one exact installed-binary invocation yields only a non-executable observation|all three memory-ready authorization states remain non-executable' \
  tests/d2e-execution-memory.test.mjs tests/d2e-transfer-workflow.test.mjs
```

Result: **6 passed, 0 failed**. Output SHA-256: `e3d7f0a934cd05b42e5516d340988165ac092a7f699ca0d6b0cec6ae05bf3db9`.

A broader direct run of both files passed **32/32**. Output SHA-256: `eb8be4c66eedef05d70ad32caca8407abfc012c392eb3e9a41173a95d3ae7c83`.

Observed contract:

- omitted or disabled legacy applied mode refuses before preparation/claim and performs no effect;
- execution-memory consumption is disabled before binary inspection/spawn by default;
- applied execution-memory mode is structurally unsupported;
- an enabled fixture can emit only `D2E_EXECUTION_MEMORY_OBSERVATION_V1` with `execution_performed=false`, `applied_ready=false`, transfer authorization `not_authorized`, downstream authorization false, and effect `not_materialized`.

These are direct package tests over injected fixtures. They are not a fresh live-host `/reload` proof.

## Synthetic fenced `/runtime-status` canary

Reproducible owner script:

```text
packages/pi-society-orchestrator/scripts/d2e-fenced-runtime-status-canary.mjs
```

Script SHA-256 before this evidence commit: `cd7a94cc24c4dd4e99353f0e139237ca54dd7ae6680280813c1b72898cfea84b`.

Commands:

```bash
node packages/pi-society-orchestrator/scripts/d2e-fenced-runtime-status-canary.mjs
node packages/pi-society-orchestrator/scripts/d2e-fenced-runtime-status-canary.mjs --require-zero-ak
```

The first emits a JSON receipt. The second is a future acceptance gate and exits nonzero while zero-AK behavior is absent.

Normalized observed-result excerpt (randomized managed-temp paths removed; `observed.ak_calls[]` reduced to the one command shape):

```json
{
  "schema": "d2e.pi.synthetic-fence-canary.v1",
  "synthetic_fence": {
    "clearance": "unknown",
    "incident_fence": "active",
    "current_runtime_contract_supports_these_inputs": false
  },
  "expected": {
    "ak_invocations": 0,
    "society_db_artifacts_created": 0,
    "tracked_worktree_changed": false
  },
  "observed": {
    "ak_invocations": 1,
    "ak_command": "strategy list --repo <configured-orchestrator-package> -F json",
    "society_db_artifacts_created": [],
    "tracked_worktree_changed": false,
    "runtime_status_rendered": true
  },
  "pass": false
}
```

Session-local report output SHA-256: `52ab8ae9c14e3faed7e34210d5b00d2de8cf270ab172edf08b7d57a8cb9fb756`. The actual script receipt additionally includes `owner_surface`, isolation metadata, `observed.ak_calls[]`, and `interpretation`; its paths are confined to managed `TMPDIR` plus the configured package path and contain no live store path.

Isolation facts:

- the canary imports the configured local orchestrator source directly into a mock extension host;
- it constrains `PATH` to a sentinel-only directory, selects explicit sentinel `ak` and `dolt` executables, pre-resolves system Git for the tracked-status comparison, and selects a nonexistent temp-only `society.v2.db` path;
- the inspected execution path selected the explicit temp AK sentinel and did not select a live AK executable or live society database;
- no artifact was created at the three selected temp DB/WAL/SHM paths;
- the tracked package worktree was unchanged;
- no package install, `/reload`, live `/runtime-status`, task action, or activation occurred.

Current source corroboration: `extensions/runtime-footer.ts` calls `readAkCloseFrameStatus(...)` unconditionally in the `runtime-status` handler, and `scripts/release-smoke.mjs` currently asserts exactly one synthetic runtime-status AK call. The package has no supported incident-fence/clearance input at this revision. The environment names used by the canary express the requested synthetic state but are intentionally marked unsupported rather than misrepresented as a landed contract.

## Evidence classification

| Required Pi evidence | Result | Classification |
|---|---|---|
| Configured package source/version/digests | Pass | Observed configured on-disk fact |
| Configured Vault tracked-source parity | Pass | Exact tracked index and selected-byte parity |
| Active running Pi loaded-byte parity | **Unproven** | Requires fresh install/reload or owner-approved active-host attestation |
| Missing binding fails closed | Pass | Configured-path direct test |
| Incompatible binding fails closed | Pass | Configured-path direct test |
| Stale projection fails closed | Pass with limitation | Parity-equivalent current tree; configured test deps incomplete |
| Legacy applied transfer remains disabled by default | Pass | Direct injected package test |
| Execution memory remains query-only/non-authorizing | Pass | Direct injected package test |
| Fenced `/runtime-status` performs zero AK invocation | **Fail** | One temp sentinel invocation observed |
| Fenced canary creates no selected temp DB/WAL/SHM artifacts | Pass | Before/after observation of the three selected managed-`TMPDIR` paths |
| No repository/task effect | Pass for this canary | Tracked status unchanged; no live owner executable selected |

## Required owner follow-up

Before FCOS may treat the Pi prerequisite as satisfied:

1. define a supported, owner-reviewed incident-clearance input with explicit absent/unknown behavior;
2. branch `/runtime-status` before `readAkCloseFrameStatus(...)` so absent or unknown clearance performs zero AK invocation;
3. update the synthetic canary so `--require-zero-ak` exits zero;
4. run a fresh installed-package Pi canary after install/reload, with the inspected fenced path selecting only owner-approved sentinels and no live AK or society DB;
5. record installed loaded-byte identity and output hashes in a successor owner evidence artifact;
6. obtain independent review of that exact tracked successor revision.

## Owner statement

At the cited source/configuration revisions, Pi ownership confirms the configured package identities and the source-level D2E fail-closed/no-effect results above. Pi ownership does **not** confirm fenced zero-AK `/runtime-status` behavior, active-process loaded-byte parity, safe activation, or RFC readiness. This bundle is a truthful blocker receipt, not an implementation authorization or promotion receipt.
