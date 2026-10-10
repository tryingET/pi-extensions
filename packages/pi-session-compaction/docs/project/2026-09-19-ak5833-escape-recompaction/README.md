---
summary: "AK5833 controlled reproduction: Escape during automatic custom compaction lets the answer continue, then a second threshold compaction starts; local evidence only."
read_when:
  - "Investigating repeated automatic compaction after Escape, or preparing the upstream reply about it."
---

> Archive note (AK6854, 2026-10-10): this bundle moved here from the untracked repo-root `.task-5833/` folder. The run outputs referenced below (`evidence/`, `exploratory-evidence/`, matrix and portable-check logs) were archived unchanged to `/home/tryinget/.local/state/quarantine/2026-10-10-ak6854-pi-extensions/task-5833/`; their sha256 manifest is recorded in AK6854 evidence. The harness sources, including `minimal-hook.mjs`, are inside `compaction-repro-source.tar.gz` (kept packed so repo formatters do not rewrite the 20-line hook).

# Custom compaction restarts after Escape: controlled reproduction

## What this demonstrates

At Pi commit **4d38031fbdbed43bc481ddf9c3c279005ab24674** (contains
**de2de549bcc369726b2e1a50d1626c39806ccc09**), cancelling automatic compaction
between tool completion and the next answer allows the answer to continue.
After that answer, Pi starts another threshold compaction before settlement.

Real InteractiveMode, literal Escape bytes through a Linux PTY:

```text
large tool result
compaction_start #1 (between turns)
custom summary request -> Escape -> aborted compaction_end #1
another answer request -> agent_end
compaction_start #2 (post-agent_end, before session settlement)
custom summary request -> Escape -> aborted compaction_end #2
agent_settled
```

This was reproduced with both the actual `pi-session-compaction` guarded handler
and **`minimal-hook.mjs` (20 lines)**. The small hook reproduces the cancellation
boundary, not the production package's complete summary format or safety features.
The offline driver/harness is additional code; this is not a 20-line whole harness.

## Actual setup and reduced inputs

Actual local configuration: compaction enabled, reserveTokens=15000,
keepRecentTokens=0. The package's custom prompt asks for a self-contained checkpoint
(objective, work, constraints, evidence, next action), because little recent history
is expected to remain verbatim.

The fixture uses:
- In-memory settings/session/credentials; no real provider, credentials or user history.
- A faux model with contextWindow=32000; synthetic tool result of 80000 characters.
- reserveTokens=15000; retention=0, then retention=1 as a control.
- The default actual registration factory -> `runGuardedSessionCompaction` ->
  `runSessionCompaction` -> real host `ctx.modelRegistry.complete()`.
- Actual package config/prompt/model-selection and signal handling, without modifying them.
- Injected unavailable Git context provider and local-only telemetry observers; no Git
  snapshot collection or canonical telemetry writes. Unrelated commands/tools from the
  full live entrypoint and all other user extensions are omitted.
- A faux summary request that waits for its genuine core AbortSignal. The SDK variants
  cancel at that boundary; the TUI variants wait for the external driver to send Escape.
- **No disable-compaction intervention.** Each of the two attempts is cancelled.

The actual handler runs only one prefix summary request per attempt in this fixture
(historyMessages=0). Event boundaries prove this is not parallel history/prefix generation.

## Results

All **12 final scenarios** passed lifecycle/order assertions:

| Hook | Retention | Cancellation | Compaction attempts | Subsequent answer requests |
|---|---:|---|---:|---:|
| Actual + minimal (4 cases) | 0 and 1 | Real PTY Escape | 2 | 1 |
| Actual + minimal (4 cases) | 0 and 1 | SDK abortCompaction() | 2 | 1 |
| Actual + minimal (4 cases) | 0 and 1 | SDK abort() | 1 | 0 |

All settle idle, keep automatic compaction enabled, and commit no compaction entry.
Full-run abort controls also record an assistant error `This operation was aborted`;
zero answer requests is not a claim that all continuation machinery was skipped.

**Exact zero is not necessary.** Retention=1 produces the same trace. This is not a
sweep of ordinary retention budgets. Cancellation commits no new retained boundary,
so it leaves the original context pressure unchanged.

## Why request a change?

The desired user experience is: Escape during automatic compaction stops the current
run and returns control, so the operator can inspect/edit/change direction without
another answer or another automatic compaction first.

Current source explicitly implements weaker **cancel-current-compaction-attempt**
semantics. The reproduction is evidence of that behavior, not proof that its semantics
are unintended. Ask the maintainer to clarify/consider changing that interaction;
do not present stronger cancellation semantics as an already-agreed contract.

Source at the pinned ref:
- `packages/coding-agent/src/modes/interactive/interactive-mode.ts:3448-3456`:
  compaction Escape calls `session.abortCompaction()`.
- `packages/coding-agent/src/core/agent-session.ts:554-571`:
  between-turn preparation proceeds with unchanged messages after the attempt.
- Same file `1204-1240`: post-agent-run processing checks compaction again.
- Same file `1735-1744` versus `2226-2229`: whole-run abort versus attempt cancellation.

The commit fixed other cancellation/auth races; it did not change that compaction
Escape route. This fixture is pinned to the following main commit (Radius catalog
change), not falsely labelled an exact de2de549b build.

## Run the portable reduction

Requirements: Linux, Node compatible with the pinned Pi checkout, `bash`, `git`,
util-linux `unshare` and `script`, enabled user/network namespaces, and an **already
built** checkout at the exact ref above with its dependencies present. The bundle
neither installs dependencies nor builds/modifies Pi.

Copy this directory's source files anywhere. The minimal path does not need
pi-extensions or the custom package installed:

```bash
export PI_REPRO_HOST=/absolute/path/to/built/pi-at-4d38031fb
export TMPDIR=/absolute/path/to/your/scratch-directory
bash run-matrix.sh
```

This runs six minimal-hook scenarios, including two real PTY runs. To additionally
exercise the actual package (its dependencies must already be installed):

```bash
export PI_REPRO_COMPACTION=/absolute/path/to/pi-extensions/packages/pi-session-compaction
# Use a fresh copied bundle, or archive/move prior evidence/ first.
bash run-matrix.sh
```

With that optional variable it runs all twelve scenarios. The runner refuses to
overwrite existing evidence. Each subprocess gets a sanitized environment, scratch
HOME/agent dir, network namespace and fetch tripwire. Scratch is retained for inspection.
A 15-second fixture-only watchdog bounds the synthetic test, not real inference.
The PTY driver observes summary-request records and sends one literal Escape per
attempt; it does not call cancellation APIs or replace Pi's keyboard handler.

```bash
node verify.mjs evidence
```

The verifier checks all directories present; the caller must also check the expected
matrix count (6 minimal-only, 12 including actual). It asserts distinct start/end
intervals, actual hook cancellation, Escape/abort ordering, placement around agent_end,
settlement, and unchanged compaction-enabled state.

## Evidence and limitations

Local `evidence/` retains all twelve final event/result/provenance sets; each run has a
UUID and before/after input fingerprints. Provenance includes the six executable
fixture files, 701 built host JS/MD files, and (for actual-hook runs) extension/prompt,
config presence and model-selection source hashes. These are fingerprints, not a full
hermetic build or transitive-dependency attestation. Independent read-only review
confirmed matching hashes and the lifecycle interpretation.

`exploratory-evidence/` contains earlier investigation runs, including outputs before
provenance capture was added. It is not the final evidence set. Initial code had a
nonexistent ModelRuntime.dispose() cleanup call; this was corrected before final runs.

Faux token accounting exaggerates displayed usage (125.3% in the TUI). The 80000-character
result alone estimates to about 20000 tokens, already above the 17000 threshold.
Do not infer real-provider utilization or latency from this synthetic display.

This does NOT prove the operator's historical episode, an infinite loop, successful
summary quality, full-run queue/input race claims, or installed-runtime behavior.
The observed prompt settles after the second cancellation. No real-provider requests,
production code/settings changes, install/reload, Git commit/push, upload or public
comment were performed for this task.
