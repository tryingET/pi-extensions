---
summary: "AK5621 Research Observatory requirements, typed consumer contract and validation limits."
read_when:
  - "Maintaining the autoresearch dashboard or interpreting its measurements and Level 4 observations."
system4d:
  container: "Read-only pi-autoresearch dashboard/export projection."
  compass: "Separate declared autonomy, actual owner execution reports and empirical observations."
  engine: "Bounded discovery -> identity/validator checks -> typed model -> offline editorial HTML."
  fog: "Filesystem provenance is unauthenticated; snapshot presence never establishes permission or liveness."
---

# Research Observatory — AK5621

## Scope and entrypoint

`exportAutoresearchDashboardHtml` and `/autoresearch export` remain the export path.
No application server, second control plane, launch control, benchmark, AK write,
activation, or evaluator/receipt schema changes are introduced by this rewrite.
Live view reloads the exported local file every two seconds; a pause/resume button
and session storage preserve scroll/open details/summary focus on unchanged layouts.
With storage blocked it fails to manual refresh. Pi's existing exporter owns file updates;
page reload is not a heartbeat or execution. CSP permits only the fixed hash-pinned
refresh script and inline styles, with no network assets or source-text execution.

## Level requirements, not a selector

- **Level 1 / decision 42:** explicit measured substrate, visible candidate lanes,
  controller measurement, local review packets. Plain runtime receipts remain visible.
- **Level 2 / decision 44:** checkpointed glue; launch, finalizer, cleanup, evidence,
  merge and promotion remain exact owner/token boundaries.
- **Level 3 / decision 45:** accepted exact task/cwd manifest and typed policy;
  transition receipts are local review inputs, not AK evidence. The ADR authorizes a
  governed design, not proof that every current runner dispatches actions.
- **Level 4 / current owner:** observe the existing non-dispatching runner result.
  It reports launch/watch plans, blockers, packet inventory and controller cursors.
  Waiting receipts, prepared calls and `completedActionCount` are not effects.

Read the root ADRs:
[Level 1](../../../../docs/adr/2026-05-14-campaign-automation-graduation-level-1.md),
[Level 2](../../../../docs/adr/2026-05-14-level-2-checkpointed-campaign-automation.md),
[Level 3](../../../../docs/adr/2026-05-14-level-3-autonomous-campaign-runner.md).
The Level 4 producer's [consumer contract](../../../pi-society-orchestrator/docs/project/2026-09-10-level4-dashboard-observation.md)
is authoritative for the observation envelope, not execution authorization.

## Typed consumer API

`discoverAutoresearchMatrixCampaignArtifacts(cwd)` retains its public export and
compatibility summary fields. New typed members:

- `campaigns: DashboardCampaign[]`: exact task/canonical cwd/objective identities,
  declared artifact level, execution boundary, observed time, owner posture,
  controller-reported cursor/counts, source paths, experiment cells and lane histories.
- `DashboardLane`: expected inventory, separately correlated historical paths, raw
  owner state/verification report, all matching attempts and missing-measurement paths.
- `DashboardAttempt`: metric and empirical outcome separate from lifecycle disposition;
  schema validity, structural run lineage, valid-measurement flag, verification report,
  unauthenticated provenance, comparison identity/key/withheld reasons, raw run/source.
- `comparisonGroups: DashboardComparisonGroup[]`: same campaign, cell, lane, metric,
  unit, direction, scenario, subject binding, immutable base and evaluator command
  contract only. A plot/table never concatenates workflow metrics with measurements.
- `unresolvedPackets`: readable but not scoreable or automatically merged. Legacy
  `cells` consumers also receive isolated `unresolved_inventory` references so
  review/cleanup does not hide these files; measured/selectable counts remain zero.

`buildResearchObservatoryModel(status, closeout, matrix, asOf?)` in
`runtime-dashboard-model.ts` provides the typed HTML projection:
`ResearchObservatoryModel`, kind `autoresearch.research_observatory.v1`.
It includes current headline/gate, source-labeled runtime projection, freshness
warning and plain local runtime attempts, kept separate from matrix campaigns.

Compatibility fields have conservative semantics:

- `completedCellCount` / selected fields are controller assertions, not effects.
- `observedMeasurementCount` counts unique structurally valid attached run reports;
  **not** independent samples. `exportedPacketCount` is packet file inventory.
- `coverageGapLaneCount` retains its old name but counts actual expected packet slots
  lacking valid measurements, not `laneProgress` arithmetic. Unspecified inventory
  means unknown coverage. Zero gaps or visibility blockers does not prove success.
- Per-cell `latestMetric/latestOutcome*` stay null. No newest-mtime winner.
- Aggregate `chart` stays empty; consumers must use `comparisonGroups`. No global best.

## Truth requirements mapping

| Requirement | Implementation and adversarial coverage |
| --- | --- |
| Prepared is not launched | `runtime-matrix-model.ts` classifies `locked_until_checkpoint` as awaiting controller launch; fabricated selectable posture with no measurements stays unmeasured. |
| Running requires owner evidence | Only a clean runtime ledger projection may be described as owner-reported running, always with source/export-as-of and `liveVerified:false`. Receipt fallback, rejected events and sync issues cannot establish running. No elapsed-time inference. |
| Inventory is not measurement | Existing `validateAutoresearchAdapterPacket` plus finite metric, known success status, checks, timestamp, run/binding membership and matching closeout/config identity. Empty/null/malformed reports cannot score. |
| Measurement is not authentication | Owner validation is structural. Verification booleans are labeled reports. Local files, hashes, packet paths and PEER text are never called authenticated provenance. |
| Comparability | Explicit dimensions in `DashboardMeasurementIdentity`; missing values withhold comparison. Mutable base refs cannot pin evaluator identity. Current closeout packets omit actual per-run benchmark/check overrides. Segment configuration cannot establish evaluator provenance; comparisons remain withheld until that evidence is available from the owner. |
| Lifecycle is not verdict | Regression+keep remains regression, possible_noise+discard stays inconclusive, threshold-preserved/satisfied are not improvements. Checks failure, crash, resource censor, baseline and reported improvement remain distinct. Free text is not parsed into censored status. |
| All attempts, not newest files | Retain all `closeout.runs`, including earlier other-candidate failures and unbound baselines as unscoreable history; dedupe repeated history with combined source paths. Extra history files attach only through one unambiguous exact campaign/candidate binding anchored by a valid planned packet. Unknown history remains unresolved. |
| Campaign isolation | Task/canonical cwd/exact objective key, never cell ID or same cwd alone. Shared packet paths, duplicate exports, conflicting cell identity, stale objective digest and mismatched campaign fail closed. |
| Missing coverage | Expected path inventory minus sources containing valid measurements. Controller completed/lane progress numbers are separately labeled assertions. |
| Level 4 bridge | Exact envelope/filename SHA-256/identity checks; consume `result.sourceLevel3Executor.level3Runner`, `promptRunnerBundle.visibleLaunchWatchPlan`, and `candidateCloseoutPacket.packetInventory.rows`. Embedded actions are inert text. |

## Discovery limits and security posture

Read-only roots: `.autoresearch/campaigns`, `.autoresearch/matrix-campaign`,
`.autoresearch/candidate-wave`, standalone candidate-result packet and
`.autoresearch/dashboard/level4`.

Caps: 512 JSON files, depth 12, 4096 visited entries, 32 MiB scan budget, 8 MiB per
file. Every parent is checked; files use no-follow/nonblocking bounded descriptor
reads. Symlinks, multi-link files, oversize, malformed JSON and changed-during-read
files fail closed with issues. This is not a security sandbox: concurrent malicious
parent replacement cannot be fully excluded by portable Node pathname checks.

Level 4 envelopes require a positive safe task integer, exact UTF-8 objective hash,
canonical envelope cwd, ISO observation time, non-authority flags and matching nested
owner identity. Absolute aliased result cwd may resolve to the canonical cwd. Relative
`result.cwd` is deliberately unresolved because the producer process's original cwd
is unavailable to the consumer. This conservative limitation is displayed as an issue.

Snapshots are one latest observation per exact identity, not a complete campaign
history. Missing snapshots do not establish inactivity; old snapshots may remain
when a producer export fails. The consumer does not read journals as resume cursors,
count journal rows as effects, launch tools, or fabricate owner data.

## Measurement and provenance limits

Runtime packet schema lacks an authenticated task id, full environment/protocol
attestation and independent-sample design. Expected paths plus exact campaign and
candidate binding establish local correlation only. Scenario/base/evaluator unknowns
therefore intentionally withhold many historical comparisons. Plain runtime receipts
still show their numeric and failure reports even when scenario identity is unknown.

The owner `timingInterpretation.sampleCount` is its eligible segment-run count;
`noiseBand` is the duration heuristic `max(abs(baseline)*0.05, MAD*2, 1)` in metric
units. Neither is a confidence interval. The whole-segment owner report is collapsed
and not repurposed as uncertainty for a lane/comparison group. The rewrite makes no
new statistical significance, independent-sample, best-candidate or success claim.

## Design contract and validation posture

`../../DESIGN.md` was authored before implementation. The host's existing Foundry
CLI lint returned **0 errors, 1 warning** (prose-defined semantic tokens not all used
by the component token map). CSS and agent-prompt exports informed implementation.
No external design tool was built or installed. Warm paper/navy, vermilion against,
evergreen reported support, amber/cobalt status, local serif/sans/mono, native
keyboard controls and single-column narrow layout follow that contract.

Tests include actual owner-built candidate packets and the actual non-dispatching
Level 4 runner in owned scratch, then adversarially mutate those returned shapes.
Five regression tests were run before replacements and failed on the old behavior.
These are model/export tests, not installed runtime, visual browser or pixel proof.
The parent owns actual live `/autoresearch export` and browser review at 390/1440px.

## Earlier implementation validation (before independent-review corrections)

- Pre-rewrite adversarial run: 5 failures on the predecessor behavior.
- Final dashboard suite: 24 tests passed; dashboard plus affected command/status
  consumer tests: **59/59 passed**.
- Final package `npm run check`: **exit 0**, **284 passed / 1 skipped / 0 failed**
  (285 tests), lint and typecheck passed, declared quick packaging gate completed.
  The skipped test required unavailable governed Prompt Vault preparation.
- First package run failed with 9 tests. Fixes remained in dashboard scope:
  nonexistent cwd becomes a diagnostic instead of throwing; unresolved inventory
  remains reviewable without becoming measured/selectable; textual handoff labels
  retain consumer wording without restoring the old measurement claims. A second
  gate run was justified by those fixes. No unrelated command test was edited.
- Scoped code max **400 LOC**, scoped tests max **267 LOC**; all below required
  500/1000 limits and byte budgets. Package budget gate passed with four existing
  out-of-scope owner exceptions. `git diff --check` passed.
- Foundry final lint remains 0 errors / 1 warning. Exports used: CSS, agent-prompt.
- Quick packaging exercised its existing publish **dry-run**; the already-published
  0.5.1 registry guard was explicitly tolerated by that gate. No package manifest
  or lockfile diff remains. Installed-Pi smoke was skipped by the declared quick
  gate (SKIP_PI_SMOKE=1). No install/reload, real launch, commit or push was performed.

Logs in session scratch: `$TMPDIR/ak5621-package-check-final.log`,
`$TMPDIR/ak5621-consumers-final.log`, and `$TMPDIR/ak5621-design-final.json`.
These results are local code/contract/export evidence only. Live command activation,
browser layout/focus/contrast review at 390px and 1440px, and actual campaign
operation remain unverified here and are assigned to the parent.

## Independent review corrections

The initial passing suite was not acceptance proof: independent review found a real
owner segment-name mismatch, dropped other-candidate history, insufficient per-run
evaluator identity, and cockpit display strings misread as paths. Seven owner-contract
regressions now cover those cases; four were observed red before correction. The
corrected dashboard suite passed 31 tests; affected-consumer suite passed 66 tests.
The parent added live refresh with reading-state preservation rather than retaining the
static-only design. Final package and actual command/browser evidence follow separately.

## Final parent verification — 2026-09-10

Independent reviewer `dispatch-1789023992003` accepted the bounded read-only v1
projection after the retained-segment correction. Owner runs keep the first runtime
configuration unless explicitly reconfigured: segment names are labels, not campaign
identity. Actual declared hypothesis id and exact lane text, internal packet/config
consistency, unique expected-path ownership, cwd and candidate checks supply local
correlation. Owner lane text does not authenticate the top-level campaign objective;
stale indistinguishable packets remain a v1 provenance limit, not authority.

- Final package gate: **300 passed, 1 skipped, 0 failed**, exit 0. Existing guarded
  publish dry-run and skipped installed-tarball smoke remain package-gate limitations.
- Reinstalled `pi-autoresearch` and `pi-society-orchestrator` local paths. Fresh Pi RPC
  processes loaded the new modules, not this controller's cached extension instances.
- Actual public Level-4 call under AK5623 returned `blocked_by_level3`,
  `not_executed_by_orchestrator`, and a successful observation export. File readback
  exactly matched the returned owner result. One planned lane appeared, zero measurements.
  No candidate was launched. This is an observation canary, not LayerManager optimization.
- Actual `/autoresearch export` through Pi's RPC UI context wrote the new HTML and
  rewrote it periodically; `/autoresearch export off` stopped rewriting. A final fresh
  command-only process re-exported the same observation without replaying the runner.
- Real Chromium at 1440px and 390px: no page horizontal overflow, no runtime/CSP errors;
  pause/resume worked, and open detail/600px scroll position survived a live reload.
  Desktop/mobile screenshots captured. These checks establish browser behavior, not
  a claim of subjective screenshot inspection or real optimization improvement.
- Current owned proof processes were absent after shutdown. No unrelated candidate,
  native process, branch, or worktree was cleaned up. No Git commit/push performed.

Live proof scratch: `$TMPDIR/ak5621-live-observatory-2iPMPy/` contains `live-proof.json`,
`final-export-proof.json`, raw RPC events, and `browser-final/browser-proof.json` plus
`observatory-1440.png` / `observatory-390.png`. Exact tool call:
`call_qgt4YDb6fdBMXypDhwEp1ubO|fc_0bf8b1811eb8900d016aa25c97fe6487d2a454b929c778cad6`.
Artifacts are session evidence, not a replacement for AK authority. AK5622's real
LayerManager optimization iteration remains unstarted; AK5583 remains closed.

