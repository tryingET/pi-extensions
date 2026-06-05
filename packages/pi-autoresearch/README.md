---
summary: "Overview and quickstart for monorepo package @tryinget/pi-autoresearch."
read_when:
  - "Starting work in this package workspace."
  - "Looking for the current pi-autoresearch package surface and boundary."
system4d:
  container: "Monorepo package for the governed pi-autoresearch experiment-loop capability."
  compass: "Keep the operator affordance obvious while preserving explicit boundaries to Prompt Vault, AK, and ontology."
  engine: "Scaffold the package shell -> land the bounded runtime kernel -> bind upstream control planes later."
  fog: "The main risk is recreating the upstream monolith before the package seams are explicit and tested."
---

# @tryinget/pi-autoresearch

Monorepo package for the governed `pi-autoresearch` capability in Pi.

- Workspace path: `packages/pi-autoresearch`
- Release component key: `pi-autoresearch`
- Extension entry: `extensions/pi-autoresearch.ts`
- Current phase: `supervised_dogfood_internal_alpha`
- Vision / end-state anchor: [docs/project/vision.md](./docs/project/vision.md)
- Product posture anchor: [docs/project/product-posture.md](./docs/project/product-posture.md)
- Canonical dogfood playbook: [docs/project/dogfood-playbook.md](./docs/project/dogfood-playbook.md)
- Benchmark matrix runbook: [docs/project/benchmark-matrix-runbook.md](./docs/project/benchmark-matrix-runbook.md)

## Why this package exists

This package is the local runtime home for the future `pi-autoresearch` experiment loop described in:

- [pi-autoresearch RFC](../../docs/project/pi-autoresearch-rfc.md)
- [pi-autoresearch foundation status](../../docs/project/pi-autoresearch-foundation-status.md)
- [pi-autoresearch architecture correction](../../docs/project/pi-autoresearch-architecture-correction.md)
- [pi-autoresearch runtime machine and event-ledger status](../../docs/project/2026-04-16-pi-autoresearch-runtime-machine-and-ledger-status.md)
- [Prompt Vault template set](../../docs/project/pi-autoresearch-prompt-vault-template-set.md)
- [Prompt Vault rollout](../../docs/project/pi-autoresearch-prompt-vault-rollout.md)
- [Ontology concept set](../../docs/project/pi-autoresearch-ontology-concept-set.md)

The package started as a small shell and still preserves the recognizable `/autoresearch` operator surface while avoiding a premature re-import of the upstream monolith.
The current boundary is now more specific: the package is the runtime owner for the executable experiment-loop machine, while AK and Prompt Vault remain separate durable-truth owners.
The long-term destination is captured in [docs/project/vision.md](./docs/project/vision.md): autonomous in execution, governed in authority.

## Current public surface

### Command

- `/autoresearch`
  - with no objective, opens/reports the bounded runtime overview
  - with `dashboard`, opens a read-only operator dashboard in the editor with current posture, metric contract, candidate decision summary, candidate policy, and next legal surfaces
  - with `next` or `candidate next`, first surfaces open matrix candidate-review posture when packet inventory is waiting for owner review; otherwise inspects current candidate posture and prepares the recommended reviewable next call: bind when no candidate exists, plan keep/discard/rewind when evidence points there, or the next runtime/finalize call when more samples/rebaseline/finalize is needed
  - with `bind` or `bind current`, prepares a reviewable `autoresearch_candidate_bind({ ... })` call to inspect a candidate worktree and prepare the exact measurement run call
  - with `measure` or `measure current`, inspects the candidate worktree and prepares the exact reviewable `autoresearch_runtime_run({ ...candidate metadata... })` measurement call only when candidate intake readiness is `ready`; otherwise it falls back to the `autoresearch_candidate_bind({ ... })` intake review call
  - with `candidate`, `decision`, `keep`, `discard`, or `rewind`, prepares a reviewable `autoresearch_candidate_decision({ ... })` call for status or plan-only lifecycle decisions
  - with `open candidates`, opens a read-only open candidate-review posture summary with counts, sample cell inventory, and the exact owner-review call; this does not keep/discard/finalize, merge/reset worktrees, or write evidence
  - with `review` or `review keep|discard|rewind`, opens the final owner decision surface after measured packet inventory is complete; it shows a read-only candidate-decision overlay selector before the editor checklist when TUI overlays are available, and falls back to the editor otherwise
  - with `learning`, `learning export`, or `learning handoff`, prepares the exact `autoresearch_runtime_status({ action: "learning_export" })` call for review so the returned packet path can be handed to the owner-routed KES adapter
  - with `overlay` or `fullscreen`, opens a read-only live TUI dashboard overlay with periodic refresh and recent-run table
  - with `export`, writes `.autoresearch/autoresearch-dashboard.html` as measured packet inventory inspection (candidate-result packets, selected lanes, open candidate-review cells, exported counts, and `export_visibility_blockers` before owner review), opens it in the browser when possible, and refreshes the file every ~2s for the current Pi session; `export off` stops the refresher
  - with `widget on|off`, shows or hides the persistent above-editor status widget for the current session; the widget labels candidate runs, final kept runs, and `checks-failed` receipts separately so historical failed checks are not confused with promotion/finalization state
  - with `run|loop|go|start <objective>`, executes the first bounded foreground autoresearch campaign directly (`runMode: "bounded_loop"`, three-iteration/default 30-minute budget, peer lane planned only) so the operator can give one explicit start instruction and step away until budget/gates stop it
  - with any other objective, prepares a reviewable `autoresearch_campaign_start({ ... })` tool call in the editor
  - keeps durable authority explicit: direct first-entrypoint runs stay bounded/local and still do not secretly spawn peers, commit, merge/delete worktrees, write AK/KES evidence, or promote candidates
- `$$ autoresearch <objective>` / `$$ ar <objective>` when `@tryinget/pi-interaction` or `@tryinget/pi-trigger-adapter` is loaded
  - opens the pi-interaction picker for plan-only, governed setup plan, baseline, or bounded-loop campaign-start modes
  - replaces the editor text with the exact `autoresearch_campaign_start({ ... })` call selected by the operator
  - degrades safely when the optional interaction runtime is not installed
- `$$ autoresearch next` / `$$ ar next`
  - deterministically inserts the recommended next candidate call using the same read-only candidate-decision posture as the dashboard
  - remains review-first; no benchmark, worktree command, or durable promotion is executed automatically
- `$$ autoresearch bind|measure [current|<worktree>]` / `$$ ar bind|measure [current|<worktree>]`
  - when the optional interaction runtime is loaded, opens a candidate-bind/measure picker that inserts either the exact `autoresearch_candidate_bind({ ... })` inspection call or the exact `autoresearch_runtime_run({ ...candidate metadata... })` measurement call selected by the operator
  - also has a deterministic input fallback so candidate intake/measurement does not get mistaken for a campaign objective
  - remains review-first; the bind path is read-only/plan-only, and the measure path only prepares the run call for review rather than executing it automatically when intake readiness is `ready`
- `$$ autoresearch candidate` / `$$ ar candidate` and `$$ autoresearch keep|discard|rewind`
  - when the optional interaction runtime is loaded, opens a candidate-decision picker for status, keep, discard, or rewind planning
  - decorates direct and currently recommended choices when runtime receipts make that possible
  - replaces the editor text with the exact `autoresearch_candidate_decision({ ... })` call selected by the operator
  - also has a deterministic input fallback so non-slash `$$ autoresearch ...` is not captured by PTX's `$$ /template` namespace
  - remains read-only/plan-only; no worktree command or durable promotion is applied by the picker/fallback

### Tools

- `autoresearch_campaign_start`
  - is the supervised campaign front door from one bounded optimization objective
  - composes existing autoplan/setup/loop surfaces instead of inventing a second runtime
  - supports `runMode: "plan_only" | "baseline" | "bounded_loop"`
  - supports `setupMode: "autoplan" | "prompt_vault_setup"`; governed setup uses the package-owned Prompt Vault decision runner and typed parser
  - reports campaign name, metric contract, scope, candidate lifecycle policy, warnings/gates, current machine state, and the next exact tool call
  - supports a policy-only `candidatePolicy` for worktree-based keep/discard/rewind choices; default keep preserves the branch, default discard suggests cleanup after receipt review, and default rewind resets the candidate worktree to base
  - keeps Replay Fabric as observer/history/recovery-clue projection and ASC rewind as live Pi/session recovery; neither becomes the candidate accept/discard executor
  - does not auto-spawn peers, commit, merge/delete worktrees, write AK/KES/evidence, or perform durable promotion
- `autoresearch_candidate_bind`
  - is the read-only / plan-only candidate intake planner
  - inspects a controller-verified candidate worktree/path, detects git worktree status, same-repository posture, branch/ref, HEAD, optional or inferred base-ref resolution, changed files, and a diff summary
  - infers a conservative base ref from `merge-base(HEAD, upstream|main|master)` when `candidateBaseRef` is omitted, while warning the operator to verify before destructive rewind planning
  - prepares the exact `autoresearch_runtime_run({ ... candidateWorktree, candidateBranch, candidateBaseRef, candidateDiffSummary, candidateFilesChanged ... })` call needed to bind and measure the candidate
  - reports intake readiness as `ready`, `needs_review`, or `blocked`, with reasons when the candidate is on trunk, shares the controller cwd, lacks a resolved base, has no detected files, is broad, or is not a usable worktree
  - defaults `candidateWorktree` to `cwd` so `/autoresearch bind current` supports the common current-worktree handoff
  - slash and dollar bind shortcuts omit placeholder base refs so the planner can infer a reviewable base instead of treating `"<base-ref>"` as literal input
  - surfaces read-only git preflight commands and warnings when the worktree or base ref is missing
  - does not run benchmarks, merge, delete/reset worktrees, spawn peers, write AK/KES/evidence, or promote
- `autoresearch_candidate_decision`
  - is the read-only / plan-only candidate lifecycle decision workbench
  - supports `action: "status" | "plan_keep" | "plan_discard" | "plan_rewind"`
  - consumes current runtime status, segment closeout, and candidate-result evidence to summarize candidate source, worktree, branch/ref/base, changed files, and diff summary when bound
  - when `autoresearch_runtime_run` receives a real existing `candidateWorktree`, benchmark and checks commands execute from that candidate worktree while receipts remain in the controller cwd
  - reports empirical posture, promotion readiness, confidence/noise interpretation, checks status, baseline-drift risk, and live candidate artifact posture before suggesting a lifecycle decision
  - recommends keep, discard, rewind, rebaseline, collect more samples, re-bind/re-measure a stale visible candidate artifact, finalize, or no candidate bound yet
  - returns exact next tool calls and plan-only git commands such as `git -C <worktree> reset --hard <baseRef>` without applying them
  - keeps worktree lifecycle as the candidate primitive; Replay Fabric remains observer/history/recovery-clue only, ASC rewind remains live Pi/session recovery only, and durable promotion remains external
  - refuses to turn receipt-only visible candidate-peer evidence into keep/finalize guidance when the referenced candidate worktree and branch are gone; it surfaces `rebind_candidate` instead so stale packets are not mistaken for live promotion material
  - does not merge, delete worktrees, reset worktrees, spawn peers, write AK/KES/evidence, or promote
- `autoresearch_runtime_status`
  - returns the current bounded-runtime status
  - supports `action: "dashboard"` for a compact read-only operator dashboard that is easier to scan than the full diagnostic status and now includes the same candidate decision summary/next legal surface plus a unified Authority handoff section for closeout, `ak_evidence`/suggested `evidence_record(...)`, `learning_export` -> owner-routed KES adapter, and `oracle_evidence_export` -> DSPx owner preflight calls
  - can build a package-local segment closeout packet (`action: "closeout"`, packet kind `autoresearch.closeout.v1`) summarizing runs, hypotheses, candidate bindings, empirical decision, timing interpretation, recommended action, Oracle-ready evidence readiness, and the adapter/evidence boundary before external promotion
  - can build a non-mutating Oracle-ready evidence packet (`action: "oracle_evidence"`, packet kind `autoresearch.oracle_evidence.v1`) and locally export it for DSPx owner preflight (`action: "oracle_evidence_export"`, default `.autoresearch/oracle_evidence.json`) with run-level empirical records; export is an explicit local write unavailable in read profile, constrained under `cwd/.autoresearch/`, and overwrite-gated; it does not write Oracle Postgres, migrate local `coordinates.db`, write AK/KES, choose winners, or promote
  - can build a non-mutating exact-task AK evidence packet (`action: "ak_evidence"`, `akTaskId`, packet kind `autoresearch.ak_evidence.v1`) with a suggested explicit `evidence_record(...)` controller call; it does not mutate AK itself
  - can build an adapter-ready learning/KMS packet (`action: "learning"`, packet kind `autoresearch.learning.v1`) and locally export that packet for owner-routed KES/notes handoff (`action: "learning_export"`, default `.autoresearch/learning.json`); export is an explicit local write unavailable in read profile, constrained under `cwd/.autoresearch/`, and overwrite-gated; it does not write AK/KES, external authority, or promotion state
  - can build a candidate-result packet (`action: "candidate_result"`, packet kind `autoresearch.candidate_result.v1`) and locally export it for owner-visible candidate-wave review (`action: "candidate_result_export"`, default `.autoresearch/candidate-result.json`); exports under `.autoresearch/candidate-wave/` include a default-discovery aggregate `review_candidate_wave` call seed, while explicit packet paths remain available when planned-but-missing lanes should appear as `missing_packet`; export is an explicit local write unavailable in read profile, constrained under `cwd/.autoresearch/`, and overwrite-gated, and it does not mutate candidate lifecycle, worktrees, AK/KES/evidence, or promotion state. Matrix dashboard/export discovery now surfaces an explicit open candidate-review posture so packet counts are visible as review inventory rather than live keep/finalize authority. In orchestrator-supervised matrix campaigns, `pi-society-orchestrator` may hand the controller a post-checkpoint `autoresearch.matrix_cell_controller_command_packet.v1` that spells out the exact bind -> metric run -> candidate-result export -> wave review -> matrix review sequence and an `autoresearch.matrix_campaign_cockpit.v1` dashboard summary with `matrix_cockpit_blockers` target `0`; `pi-autoresearch` still owns the run/export calls, receipts, dashboards, and candidate-result packets, and neither packet is hidden execution or promotion authority.
  - can list the current adapter contract catalog (`action: "adapter_contracts"`, packet kind `autoresearch.adapter_contracts.v1`) so downstream extensions can discover supported packet kinds without scraping docs
  - can structurally validate adapter packets (`action: "validate_packet"`, packet kind `autoresearch.adapter_validation.v1`) before a target adapter plans or applies an external write
  - documents the adapter contract in `docs/project/adapter-contracts.md` so AK, Beads, KES, notes, issue trackers, or custom KMS integrations can be implemented as separate Pi extensions consuming stable packet shapes
  - surfaces receipt summaries, machine projection, event-ledger state, current one-shot Prompt Vault alignment, the current llama.cpp manifest-campaign projection state when one has been projected locally, a top-level empirical posture sentence with promotion readiness and recommended next action, and visible peer-lane recommendations for optional `scout_peer_spawn` / `candidate_peer_spawn` use without auto-spawning peers
- `autoresearch_runtime_autoplan`
  - explores the local repo/problem space from a bounded objective and proposes campaign setup: name, metric, optional explicit `metricThreshold`, direction, benchmark command, checks command, scope, risks, and exact next tool call
  - surfaces an explicit measurement contract for metric freshness, causal linkage, and optimization authority before any proposed setup call
  - avoids inferred duplicate benchmark/check execution when package scripts or generated `autoresearch.sh` wrappers resolve to the same command, while warning if an operator explicitly asks to run equivalent gates twice
  - reports noise-aware timing interpretation for duration metrics so one-off lower timings are not mistaken for meaningful improvements
  - reports an explicit empirical decision class (`baseline`, `insufficient_samples`, `possible_noise`, `calibration_signal`, `candidate_improvement`, `candidate_regression`, and related invalid/check states) plus an operator-facing empirical posture classification (`calibration_only`, `baseline_drift_suspected`, `candidate_review_ready`, and related states) so run status is not mistaken for result meaning or promotion readiness
  - supports calibration runs that update timing/noise interpretation without competing as candidate improvements; calibration-only faster samples are surfaced as `calibration_signal`, not candidate wins
  - when a generic benchmark command such as `npm test` would not emit `METRIC <name>=<value>`, proposes a conservative local `autoresearch.sh` script only when its measurement contract is fresh, causal to the current run, and allowed to drive optimization
  - supports `planner: "dspx_program"` to return or materialize a local DSPx-generated DSPy planner assembly for an `AutoresearchSetupPlanner` candidate while keeping Pi as the outer controller
  - when DSPx `behavior_results.json` exists, reads it as setup input; static behavior evidence remains advisory unless a bounded campaign-start path explicitly runs DSPx program-gen in the current call and validates the generated DSPy planner output
- `autoresearch_campaign_start`
  - can run bounded local DSPx `program-gen` with `planner: "dspx_program"`, `runDspxProgramGen: true`, and optional `dspxProgramGenTimeoutSeconds`, then use the generated DSPy planner output in `behavior_results.json` as the campaign setup plan before baseline/bounded-loop execution
  - still keeps Pi / pi-autoresearch as the outer controller: DSPx materializes and runs the DSPy planner, while pi-autoresearch validates the generated campaign-plan output and owns setup application, receipts, bounded runs, peer gates, and stop conditions
- `autoresearch_runtime_setup`
  - plans, applies, or baselines a campaign/segment config, including optional explicit `metricThreshold` targets for threshold-style success, without requiring a human slash-command wizard
  - can append a config receipt without running, or bootstrap a baseline run through the same bounded run machinery
  - can write explicit `autoresearch.sh` / `autoresearch.checks.sh` content when requested and refuses to overwrite existing scripts unless allowed
- `autoresearch_runtime_run`
  - executes one bounded local benchmark/check run
  - can bind optional hypothesis/result lineage (`hypothesisId`, `hypothesis`, `interventionSummary`, `expectedPrimaryEffect`, `hypothesisTargetFiles`, `experimentRisk`) into the run receipt so later evidence export can say what was tested and why
  - can bind controller-verified visible candidate lane metadata (`candidateSource`, `candidateWorktree`, `candidateBranch`, `candidateBaseRef`, `candidateDiffSummary`, `candidateFilesChanged`) without spawning, merging, or promoting the candidate
  - records an empirical decision class on new run receipts so downstream closeout/evidence steps can distinguish operational status from measured meaning
  - bootstraps config receipts when needed
  - appends config/run receipts to `autoresearch.jsonl`
  - appends machine/event entries to `autoresearch.events.jsonl`
  - can enforce an optional posture command before benchmark execution and fails closed when the posture requires reconciliation
  - reports optional peer-lane recommendations after the run: scout peers for failed or ambiguous results, candidate peers for isolated patch exploration, and fork peers only when inherited context is intentional
- `autoresearch_runtime_peer_assist`
  - plans one canonical visible peer lane without launching it
  - emits exact `scout_peer_spawn`, `candidate_peer_spawn`, or `fork_peer_spawn` calls using the cleaned visible-peer tool surface
  - preserves the evidence boundary: peer/intercom output remains communication until controller verification
- `autoresearch_runtime_loop`
  - executes a bounded in-call loop over `autoresearch_runtime_run` semantics
  - requires `maxIterations` and can also enforce a wall-clock budget
  - can request governed Prompt Vault next-hypothesis decisions between runs
  - keeps a persistent above-editor status widget current while the session is active unless `PI_AUTORESEARCH_WIDGET=0` is set or `/autoresearch widget off` is used
  - streams in-call live progress cards for loop start, iteration start/complete, stop, and completion phases; each update also carries the current dashboard snapshot in tool-update details
  - returns the final read-only dashboard after the run summary, so an operator can start a bounded run, step away, and come back to the final posture without scraping receipts
  - supports explicit `peerMode` values: `off`, `plan`, `launch_scout`, `launch_candidate`, `launch_fork`; `launch_*` modes return an exact canonical peer-tool handoff rather than duplicating or hiding peer-spawn machinery
  - stops on explicit budget, control, machine, posture, or governed-decision gates rather than becoming a hidden daemon
- `autoresearch_self_hosting_run`
  - is the bounded public supervised self-hosting seam for `packages/pi-autoresearch` itself
  - can inspect controller/candidate/evaluator state, plan or apply the candidate worktree, run one bounded controller/candidate/evaluator wave, use `action=start_and_watch` for in-call progress updates while that bounded wave runs, and optionally plan/apply explicit promotion or rollback records
  - stays below hidden daemonized autonomy, direct AK mutation, package-local self-promotion, and automatic controller rotation
- `autoresearch_vllm_campaign`
  - is the read-only campaign cockpit for workstation vLLM speed-optimization autoresearch
  - defaults to `/home/tryinget/ai-society/softwareco/infra/workstation`, the kasimat Qwen3.6 27B AEON FP8 MTP model path under `/data/vllm/hf-cache`, the RTX 6000 PRO WS hardware label, and `../../contrib/blackwell-gpu-wiki`
  - inspects workstation GPU/status probes when the repo-owned scripts are present, reads the m14 LongCoT target catalog posture, plans bounded matrix axes, emits exact `autoresearch_campaign_start(...)` next calls, and can render a fresh-session handoff prompt
  - remains plan/read-only: it does not start/stop services, mutate lane profiles, run benchmarks, spawn peers, write AK/KES/Oracle/evidence, promote candidates, or become a hidden daemon
- `autoresearch_llamacpp_campaign_control`
  - is the dedicated public consumer/control seam for one manifest-driven llama.cpp campaign
  - returns current public control status for one exact checked manifest from one canonical derived snapshot
  - may compose one exact-task AK-ready binding snapshot when the caller already knows the task id
  - plans or applies exactly one truthful next campaign-local step without requiring raw `stage` / `buildId` inputs
  - fails closed on blocked public advance paths instead of advertising a usable next action when prerequisites are missing
  - stays below direct AK mutation, whole-campaign execution, and workstation-owned stage semantics
- `autoresearch_llamacpp_campaign`
  - loads a typed llama.cpp benchmark campaign manifest
  - expands the exact brownfield `phasee/41-43` branch/lane matrix without re-deriving it from chat prose
  - plans or applies fork workspace preparation for later patch transplant work under `../../fork/`
  - plans or applies one exact stage-scoped `41 | 42 | 43` invocation against the existing workstation scripts
  - writes or refreshes one checked `autoresearch.llamacpp-campaign.json` projection artifact for bounded runtime/help use
  - derives one exact-task AK-ready binding snapshot through `action=build_ak_binding` without mutating AK directly
  - derives or applies exactly one truthful next campaign-local stage step through `action=advance_campaign`
  - remains the lower-level technical manifest-helper surface below `autoresearch_llamacpp_campaign_control`
  - does **not** become a whole-campaign runner or a replacement for workstation execution ownership

### Runtime helpers

- `src/core/runtime.ts`
  - local receipt-entry types for config and run events
  - structured `METRIC name=value` parsing
  - bounded benchmark/check execution helpers
  - runtime status/help rendering that now integrates receipt summaries with machine/ledger projection plus the current llama.cpp campaign projection state
- `src/core/selfHosting.ts`
  - validated controller-owned self-hosting contract, evaluator lock, and promotion/rollback record helpers
  - candidate worktree preparation, scope fencing, snapshot-owned evaluator-suite execution, typed applicability classification, and explicit promotion/rollback planning helpers
  - the core package implementation behind the public `autoresearch_self_hosting_run` seam
- `src/core/llamacppCampaign.ts`
  - typed llama.cpp benchmark campaign manifest model
  - explicit `phasee/41-43` stage matrix expansion
  - fork workspace planning/apply helpers with fail-closed git checks
  - stage-scoped execution binding for one exact `41 | 42 | 43` invocation with prerequisite fencing
  - projection artifact derivation, persistence, and refresh logic for `autoresearch.llamacpp-campaign.json`
  - non-mutating AK-binding snapshot + compact details derivation for exact manifest/task anchors
  - campaign-local autonomy snapshot + one-step advance helper for truthful next-step selection without widening into whole-campaign execution
  - dedicated public campaign-control composition helpers above the autonomy + AK-binding seams
- `src/core/ledger.ts`
  - append-only event-ledger entry types and JSONL helpers
  - ledger replay/projector helpers for the campaign machine
  - replay validation plus receipt-history backfill support for the bounded runtime surface
- `src/machine/events.ts`
  - typed campaign event model for configuration, run execution, receipt recording, decision points, blocking, and completion
- `src/machine/campaign.ts`
  - minimal package-local XState campaign machine for the bounded experiment runtime
  - runtime-status hydration helper for mapping the current bounded status into machine input
- `src/runtime.ts`
  - compatibility re-export for the core runtime surface plus the campaign machine/event model

## Local artifact contract

The bounded runtime kernel now uses the same local artifact plan the shell originally named:

- `autoresearch.jsonl`
- `autoresearch.llamacpp-campaign.json`
- `autoresearch.md`
- `autoresearch.sh`
- `autoresearch.checks.sh`
- `autoresearch.ideas.md`

These stay **local receipts/projections**, not sole campaign truth.

## Prompt Vault alignment

Prompt Vault now already owns three durable one-shot control-plane templates for the capability:

- `pi-autoresearch-setup`
- `pi-autoresearch-next-hypothesis`
- `pi-autoresearch-finalize`

The earlier `pi-autoresearch-state-router` draft still exists as a possible later surface.
But after the architecture correction, it is no longer the main near-term blocker for truthful runtime evolution.
The package now includes a minimal internal XState campaign machine, typed event model, append-only event ledger, one bounded post-target widening surface for manifest-driven llama.cpp benchmark planning/fork preparation, one bounded follow-on surface for stage-scoped `41 | 42 | 43` execution binding, one projection-only `autoresearch.llamacpp-campaign.json` layer for bounded manifest campaign status/help truth, one non-mutating AK-ready manifest-campaign binding helper layer for exact manifest/task anchors, one bounded campaign-local autonomy helper layer for truthful one-step stage advancement, and one bounded public campaign-control seam above those landed helper layers.

The AK-binding slice is now landed and closed in:
- [docs/project/llamacpp-campaign-ak-binding-contract.md](./docs/project/llamacpp-campaign-ak-binding-contract.md)
- [docs/project/llamacpp-campaign-ak-binding-status.md](./docs/project/llamacpp-campaign-ak-binding-status.md)

The campaign-local autonomy slice is now landed and closed in:
- [docs/project/llamacpp-campaign-autonomy-contract.md](./docs/project/llamacpp-campaign-autonomy-contract.md)
- [docs/project/llamacpp-campaign-autonomy-status.md](./docs/project/llamacpp-campaign-autonomy-status.md)

The bounded public campaign-control slice is now landed and closed in:
- [docs/project/llamacpp-campaign-control-surface-contract.md](./docs/project/llamacpp-campaign-control-surface-contract.md)
- [docs/project/llamacpp-campaign-control-surface-status.md](./docs/project/llamacpp-campaign-control-surface-status.md)

Interpretation rule:
- Prompt Vault owns durable decision procedures
- the package owns executable runtime state and may derive compact AK-ready snapshots, one bounded next-step autonomy view, and one bounded public campaign-control view for explicit callers
- AK still owns durable campaign truth, evidence writes, and any later task completion decision
- `autoresearch_llamacpp_campaign_control` is now the public consumer/control seam, while `autoresearch_llamacpp_campaign` remains the lower-level technical helper surface

## Bounded public campaign-control surface

The public/consumer seam for this concern is now:

- tool: `autoresearch_llamacpp_campaign_control`
- contract: [docs/project/llamacpp-campaign-control-surface-contract.md](./docs/project/llamacpp-campaign-control-surface-contract.md)
- status: [docs/project/llamacpp-campaign-control-surface-status.md](./docs/project/llamacpp-campaign-control-surface-status.md)
- bounded role: current control status + one-step public advance + optional exact-task AK context, all derived from one canonical public-control snapshot per call
- current task posture: the original public seam landed through `#1699`, and later hardening under `decision:17` / task `#1709` now makes public task context explicit and verified/unverified rather than caller-asserted by default
- current task-context semantics: optional best-effort live AK verification with surfaced status; public `akBinding`, `taskBound`, and `completionCandidate` now appear only for verified live task context while `status` / `advance` still work package-locally when verification is unavailable
- decision-attending RFC: [docs/project/2026-04-18-public-ak-task-verification-rfc.md](./docs/project/2026-04-18-public-ak-task-verification-rfc.md)
- accepted ADR: [docs/adr/2026-04-18-public-ak-task-verification-semantics.md](./docs/adr/2026-04-18-public-ak-task-verification-semantics.md)

## Current non-goals

This package does **not** yet implement:

- direct AK writes, fuzzy task lookup, or automatic task completion for the new llama.cpp campaign manifests
- direct execution of manifest-driven 41/42/43 campaigns end to end
- semantic interpretation of manifest-stage payloads into benchmark winners, recommendations, or completion truth
- a broader public/autonomous whole-campaign control plane beyond the bounded one-step manifest campaign-control surface
- shared higher-order session-control orchestration
- a second control plane that duplicates workstation `lane-op` or the brownfield 41/42/43 scripts

The package now includes the bounded runtime's machine/event-ledger integration and peer-lane recommendation text for optional visible peer help. It still does not own peer launch: `pi-little-helpers` owns visible peer tools, `pi-peer-messaging` owns communication, peer/intercom messages are not evidence without controller verification, and autoresearch only recommends exact calls such as `scout_peer_spawn(...)`, `candidate_peer_spawn(...)`, or `fork_peer_spawn(...)`. The broader control-plane and autonomy integrations still belong to later bounded slices after the bounded runtime kernel.
Use [docs/project/product-posture.md](./docs/project/product-posture.md) as the package-level alignment anchor for product promise, maturity, trust gates, boundaries, and next product bets.
Use [docs/project/dogfood-playbook.md](./docs/project/dogfood-playbook.md) for the canonical supervised operator flow from setup through baseline/calibration, candidate binding, empirical closeout, and explicit external evidence/learning promotion.
Use [docs/project/benchmark-matrix-runbook.md](./docs/project/benchmark-matrix-runbook.md) when an optimization target is a surface or scenario/hypothesis sweep rather than one bounded candidate patch.

## Example manifest

- `examples/llamacpp-wave-001.json` — scaffold for the typed llama.cpp benchmark campaign surface including build-bin / receipt-root execution-binding fields

## Validation

Run from this package directory:

```bash
npm install
npm run check
npm run release:check:quick
```

## Package boundary reminder

This package owns the **local experiment runtime seam** and the future executable experiment-loop machine.
It does **not** own:

- Prompt Vault control-plane truth
- AK campaign truth
- ontology semantics
- shared higher-order session-control lifecycle
