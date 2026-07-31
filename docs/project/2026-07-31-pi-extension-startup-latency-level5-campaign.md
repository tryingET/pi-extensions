---
summary: "Active AK-4368 Level-5 measured portfolio campaign for cumulative startup reductions across enabled repo-owned Pi extensions."
read_when:
  - "Investigating or changing Pi extension startup cost after AK-4140."
  - "Operating or reviewing AK-4368 and its candidate portfolio."
type: "runbook"
---

# Pi extension startup latency — Level-5 portfolio campaign

## Campaign authority and intent

- AK task: `4368`
- current taxonomy: Level 5 means a measured campaign; it does not relax owner gates
- target: configured Pi startup-to-`session_start` RPC median `<=1800 ms`
- model scope: `openai-codex/gpt-5.6-sol`; no model is invoked
- campaign runtime: `pi-autoresearch` receipts are local projections; AK remains durable task/evidence authority
- candidate implementation: admitted lifecycle-v2 `candidate_peer_spawn` worktrees only

Optimization sentence:

> Reduce configured Pi startup latency through a measured portfolio of cumulative, behavior-preserving reductions across all enabled repo-owned extension entrypoints without mutating Pi host source, third-party source, or user model/settings configuration.

This campaign is intentionally broader than the historical AK-4140 campaign. It may accept one large slice and several smaller slices, but it cannot claim portfolio success from one package, one timing datapoint, or arithmetic addition of unremeasured deltas.

## Measurement contract

Primary product metric:

```text
METRIC startup_elapsed_ms_median=<integer>
```

Canonical configured-set command:

```bash
bash scripts/startup-latency/benchmark.sh --profile current --mode rpc --trials 5
```

Reusable entrypoint timing summary:

```bash
node scripts/startup-latency/summarize-timings.mjs \
  --owned-only \
  --output .autoresearch/startup-latency-level5/<summary>.json \
  .autoresearch/startup-latency/runs/<run-dir>
```

Sampling floor:

- unchanged baseline/calibration: at least three benchmark invocations;
- each review-ready candidate cell: at least ten successful trials;
- duration deltas must exceed observed drift/noise, or sub-noise microchanges must be predeclared as one bundled candidate and measured together;
- final savings are real only after the combined configured portfolio is freshly measured.

## Repeated campaign baseline

The first AK-4368 segment produced three unchanged five-trial configured-set medians:

| Invocation | Median |
|---|---:|
| Baseline | 2268 ms |
| Calibration 1 | 2265 ms |
| Calibration 2 | 2277 ms |
| Median of invocation medians | **2268 ms** |
| Invocation-median spread | **12 ms** |

`pi-autoresearch` classifies the current state as `possible_noise`, not candidate evidence. Its conservative current noise band is `±113.4 ms`. The target gap from the campaign baseline is **468 ms**.

Local artifacts:

- `.autoresearch/startup-latency-level5/baseline-portfolio-20260731.json`
- `.autoresearch/startup-latency-level5/baseline-portfolio-20260731.tsv`
- runtime receipts: `autoresearch.jsonl`, `autoresearch.events.jsonl`, `autoresearch.runtime.json`

The reusable `custom` profile now accepts repeated repo-relative or absolute entrypoint paths. Ten-trial isolated baselines were collected before candidate admission:

| Planned cell | Wall-clock median | Entrypoint import/factory median |
|---|---:|---:|
| `pi-interaction` | 1049 ms | 497 ms |
| `pi-evidence-review` | 618 ms | 67 ms |
| `pi-session-compaction` | 602 ms | 53 ms |
| `pi-semantic-code-intelligence` | 602 ms | 67 ms |
| `pi-autoresearch` | 605 ms | 64.5 ms |

The SCI and autoresearch rows were captured as explicit `pi-autoresearch` calibration segments after the operator resumed the campaign. Each segment ran ten fresh RPC trials, passed `scripts/startup-latency/check.sh`, and retained its timing trace and summary under `.autoresearch/startup-latency-level5/`. These are base measurements only. No candidate existed, so they are not improvement evidence.

## Enabled owned portfolio inventory

The first five-trial trace inventory contains 32 enabled owned entrypoints. Their mean extension import/factory contribution totals about **917 ms**. The ten entrypoints at or above 10 ms account for about **849 ms**; the remaining 22 entrypoints total about **68 ms**.

These figures are attribution signals, not additive promises: Pi import timing and process wall time must be remeasured after any combined change.

| Package / entrypoint | Mean total | Initial disposition |
|---|---:|---|
| `pi-interaction/input-triggers.ts` | 466.2 ms | candidate discovery; large slice, not whole campaign |
| `pi-society-orchestrator/society-orchestrator.ts` | 63.6 ms | candidate discovery; keep controller runtime pinned |
| `pi-semantic-code-intelligence/semantic-code-intelligence.ts` | 62.6 ms | candidate discovery; preserve MCP/tool registration |
| `pi-autoresearch/pi-autoresearch.ts` | 60.2 ms | candidate discovery in isolated runtime only |
| `pi-evidence-review/evidence-review.ts` | 58.8 ms | candidate discovery; preserve inert validation/TUI semantics |
| `pi-session-compaction/session-compaction.js` | 50.6 ms | candidate discovery; preserve compaction handler registration |
| `pi-autonomous-session-control/self.ts` | 37.0 ms | candidate discovery; preserve self/action safety gates |
| `pi-ontology-workflows/ontology-workflows.ts` | 23.0 ms | candidate discovery; preserve ROCS fail-closed behavior |
| `pi-context-overlay/context-overlay.ts` | 16.0 ms | candidate discovery; preserve operator UI behavior |
| `pi-vault-client/vault.js` | 11.2 ms | observe; prior large deferral already integrated |
| `pi-little-helpers/sidequest.ts` | 8.0 ms | micro-bundle eligible; no standalone claim |
| installed `@tryinget/pi-modes/mode.ts` | 7.2 ms | micro-bundle eligible; source/current-install drift must be controlled |
| `pi-peer-messaging/intercom.ts` | 6.2 ms | micro-bundle eligible; preserve communication-only boundary |
| `pi-context-packer/context-pack.ts` | 5.8 ms | micro-bundle eligible; preserve read-only planning |
| `pi-prompt-template-accelerator/ptx.ts` | 5.0 ms | micro-bundle eligible |
| `pi-society-orchestrator/runtime-footer.ts` | 4.8 ms | group with orchestrator candidate |
| `pi-workstation-inference-provider/workstation-inference.ts` | 4.2 ms | micro-bundle eligible; preserve read-only provider contract |
| `pi-little-helpers/package-update-notify.ts` | 4.0 ms | micro-bundle eligible |
| `pi-agent-vent/agent-vent.ts` | 3.0 ms | observe; below standalone noise floor |
| `pi-toolbox-discovery/toolbox.ts` | 3.0 ms | observe; already lightweight registration seam |
| `pi-activity-strip/activity-strip.js` | 2.6 ms | observe; below standalone noise floor |
| `pi-prompt-template-execution/prompt-template-execution.js` | 2.6 ms | observe; below standalone noise floor |
| installed `@tryinget/pi-snapshot-edit/snapshot-edit.ts` | 2.6 ms | observe; source/current-install drift must be controlled |
| `pi-better-openai/fast.ts` | 2.4 ms | observe; below standalone noise floor |
| `pi-society-startup-context/society-context.ts` | 1.0 ms | no optimization candidate |
| `pi-little-helpers/codex-reset.ts` | 1.0 ms | no optimization candidate |
| `pi-little-helpers/html-output-browser.ts` | 1.0 ms | no optimization candidate |
| `pi-evalset-lab/evalset.ts` | 0.8 ms | no optimization candidate |
| `pi-little-helpers/stash.ts` | 0.8 ms | no optimization candidate |
| `pi-provenance/provenance.ts` | 0.6 ms | no optimization candidate |
| `pi-little-helpers/code-block-picker.ts` | 0.6 ms | no optimization candidate |
| `pi-little-helpers/session-presence.ts` | 0.6 ms | no optimization candidate |

Entries marked “no optimization candidate” remain part of the measured configured portfolio. They are explicitly dispositioned to prevent low-value churn, not excluded from campaign truth.

## Scenario × hypothesis matrix

### Scenarios

| ID | Scenario | Metric/gate |
|---|---|---|
| S1 | isolated extension entrypoint, fresh RPC process | per-package startup median and import/factory trace |
| S2 | complete configured extension portfolio, fresh RPC process | primary `startup_elapsed_ms_median` |
| S3 | first real command/tool/UI use after deferred loading | package-specific dogfood; no missing registration or semantic drift |
| S4 | disabled, unavailable, or degraded dependency path | package-specific fail-closed checks |

### Hypothesis families

| ID | Candidate family | Expected effect | Main risk |
|---|---|---|---|
| H1 | separate extension registration entrypoints from public re-export/umbrella modules | remove unused transitive imports from startup | public export or package-shape regression |
| H2 | lazy-load UI-, command-, parser-, schema-, or provider-only implementation on first use | move optional work out of extension import/factory | registration gap or first-use race |
| H3 | split lightweight status/registration paths from deep diagnostics and runtime construction | cumulative reductions across medium-cost packages | degraded-state behavior becomes too shallow |
| H4 | predeclared multi-package micro-bundle of mechanically safe import-boundary changes | make several sub-noise improvements measurable together | attribution ambiguity; rollback must stay per slice |

Candidate selection is portfolio-shaped: at least two owned packages must be evaluated. A large `pi-interaction` result may be an accepted slice, but it cannot by itself close this campaign.

### First planned candidate wave

Read-only source inspection selected three independent, revertible cells:

| Cell | Package(s) | Intervention | Estimated entrypoint saving | Critical behavior gate |
|---|---|---|---:|---|
| I1 | interaction umbrella + editor/trigger support packages | governed lightweight subpath exports and narrow runtime imports; preserve package-root exports | 80–140 ms safe slice; larger editor deferral remains separate/high risk | immediate typing, editor mount, `/triggers`, `/trigger-pick` |
| E1 | evidence review | cached first-use reader/validator/Ajv/schema/render loader after lexical/headless gates | 45–55 ms | registration, valid render, invalid/schema fail-closed behavior |
| C1 | session compaction | cached default handler import only on first actual compaction; preserve injected handler | 30–45 ms | exactly-one hook, command tracking, real compaction and handoff surfaces |

A late read-only control/intelligence scout added a second candidate wave. Its estimates remain unverified and non-additive:

| Cell | Package | Intervention | Scout estimate | Critical behavior gate |
|---|---|---|---:|---|
| SCI1 | semantic code intelligence | keep schemas, registrations, and preview/fail-closed guards eager; cache the default MCP bridge import until first use | 45–58 ms | concurrent first use, shutdown, degraded bridge, and live composite-tool dogfood |
| AR1 | pi-autoresearch | separate pure registration/schema/status contracts from cached first-use runtime/domain implementations | 35–50 ms | eager schemas/guards, concurrent loading, receipt isolation, and real status/run dogfood |
| O1 | society orchestrator | defer default autoresearch supervisor/runner and workflow/loop engines while preserving injected instances and schemas | 28–53 ms across two subcells | active controller continuity, injected runtime behavior, and first-use failure semantics |
| H4-footer | runtime-footer manifest duplication | bundle only with an orchestrator candidate | 3–5 ms | manifest identity and no double registration |

SCI1 and AR1 are the preferred first two admitted cells because they are independent packages and directly satisfy the campaign's multi-package evaluation shape. Admission currently permits only one active resource, so they must execute sequentially and receive independent candidate bindings.

A later H4 micro-bundle may combine context-packer, agent-vent, package-update-notify, and similarly mechanical seams. Their current theoretical import total is only about 13 ms, so they receive no individual saving claim and require a higher paired sample count plus combined remeasurement.

## Candidate and promotion gates

1. Read-only scouts map candidate hypotheses before mutation.
2. Each implementation lane uses an admitted lifecycle-v2 isolated worktree.
3. The controller verifies base ref, branch, diff, changed files, and package scope before measurement.
4. Candidate measurement uses a fixed runtime/benchmark substrate and at least ten successful trials.
5. Package checks and scenario-specific dogfood pass.
6. Candidate results are classified as `promoted_slice`, `candidate_review_ready`, `needs_more_samples`, `scenario_gap`, or `rejected_regression`.
7. Integration/promotion is an explicit owner action; candidate cleanup is a separate lifecycle action.
8. Combined configured-set measurement—not arithmetic addition—decides target posture.

## Measured candidate outcomes

| Cell | Candidate | Fresh-process result | Behavioral/review result | Disposition |
|---|---|---|---|---|
| SCI1 | `e09912a2978166bcf056a3de0b126cbe954a5211` | 602 ms wall median and 67 ms entrypoint median, equal to the unchanged baseline | package check passed, but the MCP bridge and SDK remained statically eager | rejected; lifecycle cleaned and admission released |
| AR1 | `f2d7d0f14c3ebb7358f8a2dc3ae5fb015cd51267` | two ten-trial entrypoint medians of 18 ms versus a same-time unchanged 64 ms median; whole-process medians remained 703–709 ms versus 707 ms | package checks and lazy-loader tests passed, but independent review reproduced stale notifications from already-open editor flows and retained picker callbacks after `session_shutdown` | rejected as-is; lifecycle cleaned and admission released |

AR1 therefore established a repeatable **46 ms entrypoint reduction**, but it did not establish a whole-process improvement and failed the behavior-preservation gate. No AR1 commit was integrated. A corrected implementation would be a new admitted candidate and must add post-await/callback liveness guards plus regression tests that begin with an already-open editor. Full schema-contract parity coverage remains a non-blocking follow-up beyond AR1's shallow top-level schema assertions.

## Current state

- runtime control: machine `ready`; `pi-autoresearch` remains measurement evidence rather than campaign authority
- AK lifecycle: task `4368` is claimed by `pi-level5-startup-portfolio`
- baseline contract: configured-set baseline satisfied (three unchanged invocations); AK evidence `5653`
- portfolio inventory: first pass complete (32 owned entrypoints)
- admission reconciliation: AK-4378 completed the exact legacy-terminal reconciliation without weakening the ordinary hardened verifier
- evaluated candidate cells: SCI1 and AR1, satisfying the multi-package evaluation requirement but producing no accepted slice
- lifecycle posture: both candidate branches and worktrees are absent after restoration-verified archives; active admission pressure is zero
- integration/promotion: none performed
- combined configured-set portfolio measurement: still pending because no slice has passed both measurement and behavior gates
- target posture: unmet; the campaign cannot claim savings from rejected candidate deltas
- next legal move: admit a corrected AR follow-up or another ranked independent cell, run its package-specific behavior gates and fresh-process measurements, and remeasure the full configured set only after at least one slice is lawfully integrated
