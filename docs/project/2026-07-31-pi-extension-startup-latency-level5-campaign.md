---
summary: "AK-4368 Level-5 measured portfolio campaign closeout across enabled repo-owned Pi extensions."
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
| AR2 | `d7d9e66d0dad0ac02a417b66f6b128cdd13c6b94` | two ten-trial entrypoint medians of 20 ms versus a same-time unchanged 65 ms median; whole-process medians remained 720–744 ms versus 725 ms | full package gate passed 260 local tests with one environment-dependent live Prompt Vault skip; adversarial matrix passed all 16 lazy callbacks, exact host/session abort reasons, zero post-abort effects, cache reset, schema parity, and receipt isolation | accepted, fast-forward integrated, installed, fresh-process dogfooded, lifecycle cleaned, and admission released |
| I1 | `c89d058c349d6681b6e012b89a18a4f6a2ac4691` | isolated controls/candidates showed repeatable 80–93 ms wall and 88–91 ms entrypoint reductions; fixed-topology configured medians were 2249 ms base versus 2228 ms candidate, a 21 ms observation inside the 50.3 ms noise band | all five package gates and 82 candidate tests passed; RPC dogfood preserved six commands, both built-ins, broker identity, editor mount, manual picker results, settings digests, and zero model/error events; corrected metric review found no meaningful configured reduction | initially accepted and integrated at the isolated slice gate, then exactly reverted by `d9d2aa5e` after the portfolio gate; zero retained I1 savings |

AR1 therefore established a repeatable **46 ms entrypoint reduction**, but it did not establish a whole-process improvement and failed the behavior-preservation gate. No AR1 commit was integrated. A corrected implementation would be a new admitted candidate and must add post-await/callback liveness guards plus regression tests that begin with an already-open editor. Full schema-contract parity coverage remains a non-blocking follow-up beyond AR1's shallow top-level schema assertions.

AR2 preserved a repeatable **45 ms entrypoint reduction** while resolving the AR1 shutdown race and two subsequent rounds of production-path abort findings. The final design gives each session revocable effects, session-local lazy caches, composed host/session cancellation, exact abort-reason propagation, and persistence checks at the core mutation boundary rather than UI-only guards. The final independent matrix exercised every registered lazy callback; passing boundary mocks alone were not accepted as proof.

After exact integration and owner-path installation, three fresh five-trial configured-set invocations measured **2219, 2227, and 2234 ms**. Their 2227 ms median is 41 ms below the original 2268 ms campaign baseline, but intervening Pi 0.83 managed-package updates prevent attributing that entire configured-set difference to AR2. The isolated same-time 45 ms entrypoint result remains the candidate-specific evidence. The 1800 ms configured target is still unmet by 427 ms.

## 2026-08-03 final I1 wave and measurement correction

A fresh three-invocation configured rebaseline before I1 produced `2293`, `2290`, and `2279 ms`; the median of medians was **2290 ms**. Fifteen traces refreshed the enabled inventory to **33 owned entrypoints** with about **805.2 ms** aggregate mean import/factory attribution. This refresh supersedes the earlier 32-entry inventory for closeout.

I1 separated interaction activation from its compatibility facade without deferring `TriggerEditor` or shifting work to `session_start`. Its admitted lifecycle-v2 worktree produced clean commit `c89d058c`, passed all five package gates and 82 tests, passed command/editor/broker RPC dogfood, and repeatedly reduced the isolated interaction cell by about 80–93 ms wall-clock and 88–91 ms entrypoint timing. Independent correctness and isolated-metric reviews initially accepted that bounded claim, so the exact commit was fast-forward integrated and lifecycle-cleaned.

The first configured comparison then appeared to regress from 2242 to 2616 ms. That result was not code-attributable: it changed the interaction package from the active governed live-worktree path, whose packages share one governed peer layer, to the owner checkout, whose package-local `node_modules` trees contain separate dependency copies. Replaying the **base** interaction code at the owner path reproduced a 2249-to-2702 ms median penalty, including about +251.6 ms in ontology workflows, +84.7 ms in PTX, and +76.0 ms in interaction itself. The apparent I1 regression was therefore a path/dependency-topology confound.

A corrected interleaved comparison replayed the exact base and candidate commits at one stable package path with one settings digest and one governed shared-peer generation:

| Fixed-topology cell | Three five-trial medians | Median of medians |
|---|---|---:|
| base `b33732cf` | 2249, 2253, 2246 ms | **2249 ms** |
| I1 `c89d058c` | 2228, 2238, 2225 ms | **2228 ms** |

The observed `-21 ms` configured difference is inside the campaign's `±50.3 ms` noise band. It proves neither regression nor a meaningful configured reduction. Because the campaign gate permits integration only for validated configured reductions, main retains the exact revert `d9d2aa5e`; `1a93f9b4` keeps only the adapted RPC dogfood probe and its harness check. Post-rollback package validation passed 76/76 tests, the startup harness passed, and fresh RPC dogfood again preserved all six commands, both built-ins, one editor mount, manual results, zero model/error events, and unchanged configuration digests.

Final effective configured-set medians after rollback were `2265`, `2219`, and `2249 ms`, for a **2249 ms** median. The 1800 ms target is **unmet by 449 ms**. No isolated delta is arithmetically added to that result. AR2 remains the campaign's retained independently validated slice; I1 contributes zero retained savings.

Artifacts:

- `.autoresearch/startup-latency-level5/current-rebaseline-20260803T145143Z/`
- `.autoresearch/startup-latency-level5/current-rebaseline-20260803T145143Z/i1/fixed-topology-configured/comparison.json`
- `.autoresearch/startup-latency-level5/current-rebaseline-20260803T145143Z/i1/rollback/`
- candidate archive digest `6c5a69fa156c616cfb0506d987d10fba18ae603a14d71264f089fb35d377e64e`

## Final enabled-entrypoint dispositions

The refreshed 15-trial inventory explicitly dispositions every enabled owned entrypoint. “No change” means the measured cost is below the current standalone noise floor or no safe bounded cell cleared discovery; it does not mean the entrypoint is free.

| Entrypoint | Mean | Final disposition |
|---|---:|---|
| `pi-interaction/input-triggers.ts` | 362.2 ms | I1 evaluated in an admitted worktree; configured effect stayed inside noise; reverted, zero retained savings |
| `pi-society-orchestrator/society-orchestrator.ts` | 82.5 ms | O1a/O1b scouted, then deferred; no second admitted cell was lawful after admission became stuck |
| `pi-semantic-code-intelligence/semantic-code-intelligence.ts` | 60.7 ms | SCI1 rejected with no measured effect; no change |
| `pi-evidence-review/evidence-review.ts` | 55.7 ms | E1 scouted as a 45–55 ms first-use candidate; deferred unadmitted |
| `pi-session-compaction/session-compaction.js` | 48.1 ms | C1 scout found only about 3–5 ms expected effect; explicit no-change below noise |
| `pi-autonomous-session-control/self.ts` | 42.7 ms | deferred; no bounded candidate cleared admission and safety review |
| `pi-ontology-workflows/ontology-workflows.ts` | 24.1 ms | deferred; preserve ROCS fail-closed semantics; no safe admitted slice selected |
| `pi-little-helpers/sidequest.ts` | 20.3 ms | deferred to a future predeclared bundle; no standalone claim |
| `pi-autoresearch/pi-autoresearch.ts` | 16.9 ms | AR2 retained; independently validated 45 ms isolated registration-boundary reduction |
| `pi-context-overlay/context-overlay.ts` | 15.7 ms | deferred; no admitted behavior-preserving cell |
| `pi-vault-client/vault.js` | 10.7 ms | observe/no change; prior deferred-startup slice retained outside I1 |
| `pi-workstation-inference/workstation-inference.ts` | 9.3 ms | no change; below standalone noise |
| `pi-modes/mode.ts` | 5.7 ms | no change; below noise and installed/source drift remains a control variable |
| `pi-context-packer/context-pack.ts` | 5.3 ms | no change; future bundle only |
| `pi-prompt-template-accelerator/ptx.ts` | 5.1 ms | no change; path-topology experiment showed attribution sensitivity |
| `pi-peer-messaging/intercom.ts` | 5.0 ms | no change; below standalone noise |
| installed `@tryinget/pi-code-mode/eval.ts` | 5.0 ms | no change; below noise and installed/source drift not mutated |
| `pi-little-helpers/package-update-notify.ts` | 4.5 ms | no change; future bundle only |
| `pi-society-orchestrator/runtime-footer.ts` | 4.4 ms | deferred only with O1; no independent claim |
| `pi-toolbox-discovery/toolbox.ts` | 2.8 ms | no change; already lightweight |
| `pi-prompt-template-execution/prompt-template-execution.js` | 2.7 ms | no change; below noise |
| `pi-agent-vent/agent-vent.ts` | 2.7 ms | no change; below noise |
| `pi-activity-strip/activity-strip.js` | 2.6 ms | no change; below noise and unrelated active work preserved |
| `pi-better-openai/fast.ts` | 2.3 ms | no change; below noise |
| installed `@tryinget/pi-snapshot-edit/snapshot-edit.ts` | 2.0 ms | no change; below noise and installed/source drift not mutated |
| `pi-society-startup-context/society-context.ts` | 1.0 ms | no optimization candidate |
| `pi-provenance/provenance.ts` | 0.9 ms | no optimization candidate |
| `pi-little-helpers/stash.ts` | 0.9 ms | no optimization candidate |
| `pi-evalset-lab/evalset.ts` | 0.8 ms | no optimization candidate |
| `pi-little-helpers/code-block-picker.ts` | 0.7 ms | no optimization candidate |
| `pi-little-helpers/codex-reset.ts` | 0.7 ms | no optimization candidate |
| `pi-little-helpers/html-output-browser.ts` | 0.7 ms | no optimization candidate |
| `pi-little-helpers/session-presence.ts` | 0.5 ms | no optimization candidate |

## Closeout state and residual blocker

- candidate portfolio: SCI1, AR1, AR2, and I1 evaluated across semantic-code-intelligence, autoresearch, and interaction package families; E1, C1, and O1 received explicit read-only dispositions
- retained integration: AR2 only; I1 was independently revertible and is absent from the final interaction tree
- I1 lifecycle: resource `cpr-95a8476f3081a9023d83ac3e` is truthfully `cleaned` at resource version 7; archive verified; branch and worktree absent; terminal receipt digest `e7b8d58bc5b15511f22cd3076684cebe82462a3ad02eee234744a51899551033`
- admission residual: permit `cadm-0165dc3c-fdcb-4add-b78e-4a9edcdadabd` remains `reserved` for 805,306,368 bytes even though its resource is cleaned; active admission pressure is **not zero**
- verifier defect: the resource event ledger is 139,837,394 bytes and its final relevant `cleaned` event is 24,666,609 bytes, above the verifier's 16 MiB relevant-event limit; ordinary release fails closed
- lawful repair boundary: an owner-approved bounded verifier repair or exact anomaly-reconciliation path is required; no permit edit, event-history rewrite, threshold relaxation, or manual lifecycle bypass was used
- owner follow-up: P0 AK-4628 owns the bounded verifier repair and exact once-only admission reconciliation
- campaign control: package-owned `pi-autoresearch` control is explicitly `stop`; its ledger projection still reports `running_checks`, but the stop overlay prevents another bounded run and the inconsistency is not presented as completion
- final target posture: **unmet** at 2249 ms, 449 ms above target; the task closes as a measured unmet-target campaign, not as performance success
