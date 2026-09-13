---
summary: "AK5582 packet helper RED/GREEN evidence and exact Level-4 integration contract; runner integration remains separate."
read_when:
  - "Integrating verifyLevel4MeasuredPacket into Level-4 inventory."
  - "Reproducing the AK5582 packet-verification tests."
system4d:
  container: "Level-4 measured-packet consumer gate."
  compass: "Owner validation plus exact controller lineage, never file existence."
  engine: "Given/When/Then regressions, red, green, integration."
  fog: "Packet consistency is not authenticated measurement provenance."
---

# AK5582 packet-verification helper

This records the isolated helper slice before integration. For the completed
runner repair, full package gate and installed Pi proof, see
[AK5582 integrated evidence](2026-09-09-ak5582-level4-safety-repair.md).

## Delivered slice

- `src/runtime/autoresearch-level4-runner-packets.ts`
- `tests/live-control-plane/level4-packet-verification.test.mjs`

Runner, existing types/tests, and other packages were not edited by this slice.
The helper is not yet proof of integrated Level-4 behavior.

## API / integration

```ts
verifyLevel4MeasuredPacket({
  cwd,          // controller/measurement cwd
  packetPath,   // exact planned export, cwd-relative or absolute within .autoresearch
  laneId,       // exact cell-scoped hypothesisId, e.g. cell-01-01-candidate-01
  binding,      // resolved Level3 controller binding; missing binding fails closed
  metricName,   // resolved actual measurement metric, required
  direction,    // "lower" | "higher", required
}); // { verified: boolean, issues: string[] }
```

The exported input type is `VerifyLevel4MeasuredPacketInput`; output type is
`Level4MeasuredPacketVerification`. Import directly from the new runtime module.

Resolve bindings unambiguously before calling. Both `binding.laneId` and the
packet's `candidateRun.experiment.hypothesisId` must equal `laneId`. The matrix
measurement builder emits `${cellId}-${laneId}` as hypothesisId. A legacy short
binding ID needs explicit, unambiguous cell resolution before normalization;
never normalize an ambiguous cross-cell binding merely to satisfy this check.
Pass the resolved metric/direction from the measurement contract, not omitted
request defaults. The verifier does not guess metric or lane identity.

Parent integration must use `verified` alone for measured/controllerVerified
classification, propagate `issues`, and derive counts/comparison/fan-in/readiness
from verified rows. Neither file existence nor cockpit state may override failure.
Selection, finalizer, receipts/resume, and owner writes remain separate.

## Checks and limits

The helper reads a regular file of at most 8 MiB inside cwd/.autoresearch, checks
lexical and realpath containment, and rejects missing/unreadable/invalid files.
Reads are bounded and close the descriptor. It calls the public owner API
`validateAutoresearchAdapterPacket` from `@tryinget/pi-autoresearch/src/runtime.ts`
then additionally requires:

- candidate-result v1, non-null candidate/run/closeout;
- exact controller cwd, internally consistent configured campaign, expected metric/direction;
- controller binding with concrete worktree/branch/base/diff/files and visible-peer source;
- worktree distinct from controller cwd (lexical identity; not a fresh Git inspection);
- exact run hypothesis lane and candidate lineage;
- ordinary candidate measurement with finite metric and recognized measured outcome;
- timestamp/iteration shape and consistent non-empty run counts;
- latest candidate-bearing closeout run equal to candidateRun and candidate present in binding inventory.

Finite regression and checks-failed measurements remain measured, not selected.
Baseline, crash, calibration, not-evaluated, and measurement-invalid runs cannot
satisfy this measured-inventory gate. Failed/abandoned lanes therefore need an
explicit owner replan rather than a fabricated measured packet.

V1 lacks immutable measured-tree/task/peer attestation. Internally consistent
stale or forged packets are not authenticated. This helper does not replay run
receipts, inspect current Git, execute benchmarks, select/promote, or write files.
It cannot resolve cross-lane duplicate binding ambiguity on its own.

## Observed RED / GREEN

Commands ran from `packages/pi-society-orchestrator` on Node v26.8.1.

```bash
# RED: temporary fail-open implementation returned { verified: true, issues: [] }.
node --test tests/live-control-plane/level4-packet-verification.test.mjs \
  > "$TMPDIR/ak5582-packet-red.log" 2>&1
# exit 1: 49 tests, 3 passed, 46 failed on rejection assertions.

# GREEN: implemented owner + semantic checks; reran after formatting.
node --test tests/live-control-plane/level4-packet-verification.test.mjs \
  > "$TMPDIR/ak5582-packet-green.log" 2>&1
# exit 0: 49 tests, 49 passed, 0 failed.

./node_modules/.bin/biome check \
  src/runtime/autoresearch-level4-runner-packets.ts \
  tests/live-control-plane/level4-packet-verification.test.mjs
# exit 0: two files checked, no fixes.

./node_modules/.bin/tsc --noEmit
# exit 0: package typecheck.
```

Fixtures use the owner public `createConfigReceipt`, `createRunReceipt`,
`appendReceipt`, and `writeAutoresearchCandidateResultPacket` APIs in test-owned
TMPDIR-aware directories; every pristine fixture must pass owner validation.
Synthetic local run entries are realistic exported packet fixtures, not live
benchmark or candidate-worktree execution evidence. Test names use Given/When/Then.
Tests cover owner-valid positive/rejected/checks-failed outcomes, missing lineage,
identity/count/run mismatches, malformed input, path/symlink escapes, oversized
files, and unchanged controller file contents across successful verification.

The full package `npm run check`/activation was not executed for this isolated,
unwired helper slice: its packaging stage may run manifest-mutating lifecycle
hooks outside the authorized new-file scope. Parent integration must run the
package gate and applicable live proof before claiming integrated behavior.
