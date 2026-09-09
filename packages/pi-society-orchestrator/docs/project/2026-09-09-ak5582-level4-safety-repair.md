---
summary: "AK5582 Level-4 non-dispatching safety repair: effect truth, bound resume cursors, measured packet gates, and validation."
read_when:
  - "Resuming a Level-4 campaign or investigating legacy executed receipts."
  - "Reviewing AK5582 red-green and installed Pi validation evidence."
system4d:
  container: "Orchestrator Level-4 runner and its registered live tool."
  compass: "Never upgrade permission, waiting, or file existence into effect proof."
  engine: "Given/When/Then regressions -> observed red -> implementation -> green -> review -> live probe."
  fog: "Controller assertions and packet consistency remain weaker than authenticated owner effects."
---

# AK5582 — Level-4 safety repair

## Decision and implementation boundary

The previous runner labelled allowed measure/export/review calls `executed_by_level4`
without invoking an execution adapter. It also used journal row count as the resume
cursor and file existence/cockpit labels as measured verification.

This repair removes those false claims; it does **not** add an unattended executor:

- `execution: not_executed_by_orchestrator` is explicit. Both permission flags and
  the legacy action budget remain accepted but never dispatch owner actions.
- V2 journal rows carry `effectStatus: not_dispatched`, request/action-plan digests,
  an observation timestamp, and deterministic IDs. Waiting/blocked observations
  never increment the cursor, and duplicate observations do not append.
- `completedActionCount` is an explicit **controller assertion**, not verified
  effect evidence. The asserted cursor persists across fresh processes for the
  unchanged request and action plan, including a terminal empty-call observation.
  Rewind, out-of-range cursors, and skipping dangerous action gates are rejected.
- Invalid, torn, legacy, foreign-request, and changed-plan journals fail closed.
  No v1 `executed_by_level4` entry is accepted as proof or mechanically retried.
- Packet verification calls the `pi-autoresearch` owner validator and additionally
  checks exact cell-scoped binding, run lineage, metric/direction, measured status,
  finite values, and consistent run inventory. Reads are regular-file/size bounded
  and reject path/symlink escapes. See [helper evidence](2026-09-09-ak5582-packet-verification-evidence.md).
- A failed row has verification issues and neither verification boolean. It cannot
  become selected or unlock aggregate review/finalizer guidance. Finite measured
  regressions remain reviewable, not automatically selected.
- A cell review requires that cell's complete verified packet set. Matrix review
  and post-fan-in handoff require all matrix packets and the accepted checkpoint.
  This preserves the interleaved cell-measurement/review cursor sequence.
- Waiting and blocked runner results return a blocked metric and `details.ok:false`.
  These are successful tool observations of a blocked workflow, not tool exceptions.

## Resume/migration rules

1. Treat prior v1 execution claims as unverified. Inspect actual owner results before
   deciding whether an effect happened. Do not delete history to force a retry.
2. Reconcile request/lineage/action-plan drift with the owner. A new journal is
   appropriate only after that reconciliation, not as an automatic recovery bypass.
3. Execute and verify each emitted action through its owning tool. Advance the
   explicit cursor only for those externally verified actions. An indeterminate
   effect must be reconciled before either replay or advancement.
4. Keep exact cell-scoped candidate binding IDs (`cell-01-01-candidate-01`), not
   ambiguous short IDs shared across cells.

Journals are local cursor hints, not AK evidence or tamper-authenticated receipts.
Appends flush the file, but power-loss/directory durability is not proven. The
workspace directory tree is trusted against concurrent hostile replacement;
component symlink checks are not a filesystem sandbox. Candidate-result v1 has no
immutable measured-tree attestation: internally consistent stale/forged packets
cannot be authenticated here. No benchmark/candidate launch, merge, finalizer,
cleanup, release, or promotion was performed by this repair's live probes.

## Gherkin-style TDD evidence

Node test names use Given/When/Then; no new DSL dependency was needed.

| Slice | Observed RED | GREEN |
|---|---:|---:|
| Packet helper rejection scenarios | 46 failures / 49 | 49 / 49 |
| Effect truth/resume/comparison integration | 12 failures / 13 | 13 / 13 |
| Review-discovered terminal/multi-cell regressions | 2 failures / 12 | 12 / 12 |
| Post-dispatch/effect-claim rejection coverage | Added after initial green | 6 / 6 |
| All Level-4 test files, including existing scenario | — | 81 / 81 |

Helper RED used a fail-open stub representing the former existence-only policy;
runner RED exercised the actual prior implementation. Positive packet fixtures
are exported using the owner receipt/packet APIs, not handcrafted thin JSON. They
are synthetic measurements for validation, not live benchmark evidence.

The six additional journal regressions reject claimed dispatched, indeterminate,
failed, aborted, timed-out, and verified-success effects without replay, cursor
movement, or journal mutation. These model untrusted/post-dispatch journal input;
no real Level-4 dispatch was simulated as genuine owner execution.

Commands from this package:

```bash
node --test tests/live-control-plane/level4-*.test.mjs
npm run check
```

Full package gate passed: **553 tests, 553 passed**, plus its structural, docs,
lint/typecheck and release-check stages. The release check treats the already
published `0.11.5` dry-run registry guard as expected; no publication occurred.
Its installed-tarball smoke was explicitly skipped by the declared gate
(`SKIP_PI_SMOKE=1`); the separate fresh Pi proof below covers the changed local tool.
Root `./scripts/ci/smoke.sh` passed. This is scoped package validation, not full
monorepo-wide CI over unrelated dirty packages.

The operator explicitly approved adding three frozen-contract test files to AK5582
scope before editing: runner characterization, execution seam inventory, and public
registration characterization. The owner-import inventory and schema hash were
updated exactly. Level-4's complete normalized output is now frozen by SHA256 in
the authorized characterization test plus explicit effect assertions; unrelated
historical goldens remain checked.

Independent reviewer `dispatch-1788925207373` found the terminal and multi-cell bugs,
then accepted their fixes with no remaining scoped blockers. Review probes were
isolated/mocked and do not substitute for the tests or live calls.

## Installed Pi proof (2026-09-09)

Installed the actual package path with `pi install`, then loaded it into fresh,
non-TUI Pi processes (new module instances, not the controller's cached extension):

```bash
pi --no-extensions --no-skills --no-prompt-templates \
  -e /home/tryinget/ai-society/softwareco/owned/pi-extensions/packages/pi-society-orchestrator \
  --no-session --mode json -p '<bounded safety-probe prompt>'
```

Only real `autoresearch_live_supervision` calls were permitted; emitted actions
were not executed. Both permission flags were true, action budget 25.

| Tool call ID | Cursor | Loaded rows | New rows | Observed result |
|---|---:|---:|---:|---|
| `call_e699cc2e111446aba5ddfa58` | 0 | 0 | 1 | awaiting controller, not dispatched |
| `call_67f6da70409b4b9992648702` | 0 | 1 | 0 | same bind, no false advancement |
| `call_39bcb9859b59451fb8873e8c` | 1 | 1 | 1 | explicit cursor assertion, no execution |
| `call_12977f3fd22e4acd928e1e96` | 1 | 2 | 0 | fresh-process resume, garbage packet not verified |

Every call returned `details.ok:false`, `execution:not_executed_by_orchestrator`,
and awaiting-controller posture. The fresh-process call found zero verified
measured packets; missing exact binding remained an explicit issue despite the
existing garbage packet. Both Pi processes exited 0. Model-pattern configuration
warnings were unrelated to the exercised path.

Raw diagnostic logs were captured under the task-owned TMPDIR directory
`ak5582-live-6cMGit`; they are scratch, not durable authority. This note records
bounded observations for AK task closeout. No unattended readiness claim follows.
