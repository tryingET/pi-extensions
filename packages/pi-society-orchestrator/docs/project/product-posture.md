---
summary: "Product posture for pi-society-orchestrator as the above-seam coordinator, fan-in gate, and evidence projector."
read_when:
  - "Before choosing the next pi-society-orchestrator product or implementation slice."
  - "When deciding whether supervision, candidate-wave, matrix, workflow, evidence, or KES work belongs in orchestrator or a lower owner package."
  - "When aligning autoresearch/matrix campaign work with the orchestrator vision without absorbing pi-autoresearch runtime ownership."
type: "reference"
system4d:
  container: "Package-local product posture for above-seam coordination and witness UX."
  compass: "Make cross-owner work feel supervised and coherent while preserving exact owner seams and durable authority boundaries."
  engine:
    invariants:
      - "Coordinate through public owner seams instead of reimplementing lower-plane runtimes."
      - "Gate fan-in and evidence projection on exact artifacts, task identity, and owner-approved review posture."
      - "Keep runtime truth, durable authority, and promotion outside orchestrator unless an explicit owner seam grants a bounded projection."
  fog:
    risks:
      - "Convenient orchestration can silently become execution ownership."
      - "Peer communication can be mistaken for measured evidence."
      - "Matrix/candidate-wave UX can multiply unmanaged parallelism unless fan-in is explicit."
---

# Product posture — `pi-society-orchestrator`

## Vision relation

The package north star lives in [vision.md](./vision.md). This document is the current product posture bridge: promise, maturity, strategic line, next bets, and boundary reminders.

## Product promise

`pi-society-orchestrator` coordinates exact owner-seam workflows, supervises artifacts, gates fan-in, and projects verified evidence without owning lower-plane runtime truth.

Short form:

```text
coordinate above the seam; gate before authority
```

## Primary users

- Pi operators coordinating multi-surface work.
- Controller agents supervising exact `taskId + cwd` runtime artifacts.
- Package owners who need owner-seam choreography without giving up runtime ownership.
- Evidence/learning consumers that need deduped, verified projection rather than raw session claims.

## Job to be done

When work spans packages, peers, runtime receipts, AK, KES, Prompt Vault, or candidate worktrees, I want one above-seam coordinator to show the legal path, fan in measured artifacts, block premature authority moves, and explain the next owner-approved step.

## Current product maturity

- maturity: `internal alpha / above-seam supervision proven`
- target control plane: landed for exact live autoresearch supervision, manifest observation, self-hosting observation, KES learning adapter, workflow execution over ASC, candidate-wave plan/review slices, Level-4 prompt-runner packet inventory, and post-integration cleanup handoff
- current strategic line: managed candidate-wave fan-in, measured matrix-campaign dogfood, and exact post-fan-in cleanup handoff before broader automation
- release posture: package checks pass; product remains pre-public for supervised campaign UX until candidate-wave fan-in plus closeout cleanup are consistently packet-driven rather than chat-managed

## Product success criteria

The package is product-healthy when:

1. an operator can see which layer owns each next action;
2. fan-in does not score raw peer claims or partial planned lanes as final evidence;
3. exact `taskId + cwd` identity is visible wherever authority depends on it;
4. evidence writes are deduped, scoped, and tied to verified owner artifacts;
5. workflows and loops expose owner-specific gates instead of hiding them inside generic execution;
6. matrix/candidate-wave campaigns produce reviewable above-seam summaries without owning pi-autoresearch receipts or promotion.

## Current landed capability baseline

The package currently owns:

- `autoresearch_live_supervision` for exact runtime observe/start/status/stop, campaign start delegation, candidate-wave planning, candidate-wave review, matrix-campaign planning, and Level-4 prompt-runner/closeout packet surfacing;
- candidate-wave review from inline summaries or `autoresearch.candidate_result.v1` packet paths, including explicit missing-packet lane visibility and owner decision options;
- candidate-wave fan-in gating: explicit planned missing packet paths block final owner selection until measured/exported or owner-replanned;
- Level-4 candidate closeout packets with packet inventory states for pending launch, lineage verification, measurement/export, candidate-result packet, and controller-verified measured packet;
- Level-4 post-fan-in promotion handoff packets that stop proof-loop repetition by showing the owner-gated tail as one sequence: compare measured packets, owner-select a lane, validate, request `finalize_post_fanin`, apply only with exact token, record evidence only through AK owner surfaces, then cleanup only after successful integration closeout;
- Level-4 post-integration cleanup-ready packets that validate candidate peer registry sidecars before naming exact `candidate_peer_cleanup` dry-run calls, and successful-closeout execute calls including `closeVisibleResources: true` only after exact peer ids/worktrees/branches plus successful integration closeout verify;
- candidate-wave reliability/recovery output: `review_candidate_wave` emits typed plan-only guidance for missing lane, stalled lane, late packet, and non-selected lane stop/cancel handling without launching peers, promoting, merging, or cleaning worktrees;
- `autoresearch_manifest_campaign_supervision` for exact manifest observation and evidence-only AK projection;
- `autoresearch_self_hosting_supervision` for exact self-hosting artifact observation and evidence-only projection;
- owner-routed `autoresearch_learning_kes_adapter` for KES diary/learning-candidate materialization from `pi-autoresearch` learning packets;
- workflow/loop surfaces over the public ASC seam, specifically cognitive/control-plane loops rather than visible Ghostty child-session loops;
- exact governed `deep-review.v1` execution through `vault_execute_template`: immutable Prompt Vault binding, prompt-plane V2 sealed bytes, durable Vault handoff, one explicit reviewer workflow, and ASC effect correlation; all other unbound workflow-grade templates remain process gates;
- package-owned KES materialization for loop outputs;
- read-only runtime/status, AK close-frame, and boundary-inspection UX.

Adjacent lower-plane capability exists in `pi-autoresearch`: bounded runtime, candidate binding, measurement receipts, candidate-result packets, dashboards, closeouts, learning exports, and self-hosting runtime. Those are not orchestrator ownership claims.

## Product non-goals

`pi-society-orchestrator` must not become:

- a replacement for AK task/evidence/direction authority;
- a package-local experiment runtime;
- a direct peer spawner hidden behind orchestration language;
- a direct generated-DSPy executor or Oracle memory writer;
- a direct KES/notes writer outside explicit owner-approved adapter plans;
- a promotion, merge, cleanup, or winner-selection authority;
- a hidden daemon manager;
- a portfolio research operating system.

## Trust gates

Above-seam recommendations are trustworthy only when:

1. **Identity** — exact `taskId + cwd` or artifact path is present where authority depends on it.
2. **Owner seam** — lower-plane work was read from public package seams or explicit owner artifacts.
3. **Measurement** — candidate claims are controller-measured through `pi-autoresearch`, not copied from peer text.
4. **Fan-in** — all explicit planned lanes are measured/exported, or the owner has deliberately replanned the lane set.
5. **Projection** — evidence/KES writes are deduped, scoped, and routed through the owning surface.
6. **Boundary report** — output says what was not done: no promotion, merge, pre-closeout worktree cleanup, AK direction mutation, or hidden peer launch.
7. **Cleanup readiness** — post-integration cleanup dry-runs require exact peer run ids backed by valid candidate-peer registry sidecars, and executable cleanup/fallback commands require exact peer run ids/worktrees/branches from registry/controller-verified sidecars plus successful integration closeout.
8. **Vault workflow identity** — a bound workflow executes only after exact template/binding authorization, durable handoff persistence, and executor correlation; missing bindings, identity drift, disabled dispatch, or mismatched handoff ids fail closed without raw-template fallback.

## Current strategic line

Prioritize product coherence over adding more generic orchestration power.

The highest-leverage line is:

```text
managed candidate-wave fan-in -> measured matrix cell as managed wave -> implementation-wave dogfood substrate -> exact post-integration cleanup handoff
```

For visible self-evolution work, orchestrator should coordinate only after the owning package seams are clear. Use the root [visible self-evolution spine](../../../../docs/project/visible-self-evolution-spine.md) and [loop taxonomy boundary contract](../../../../docs/project/loop-taxonomy-boundary-contract.md) instead of restating the owner map here.

This order matters. Matrix campaigns multiply unmanaged parallelism unless one candidate wave already has explicit plan, launch, final-only measurement, missing-lane gates, aggregate review, and non-selected-lane stop/cancel guidance. Cleanup must remain after successful integration closeout and must consume exact registry sidecars rather than peer text or fuzzy tab names.

## Next product bets

### Bet 1 — Managed candidate-wave fan-in — active

The package should make a candidate wave feel like one supervised object while preserving owner seams:

```text
planned lane set
-> approved visible launches
-> peer final as communication
-> controller bind/measure/export per lane
-> aggregate review only when complete or owner-replanned
-> owner selection
-> explicit stop/cancel guidance for non-selected lanes
```

Orchestrator owns the above-seam state model and report. `pi-autoresearch` owns measurement and candidate-result packets. Peer tooling owns visible candidate launch plus exact registry-sidecar cleanup. Operators and owner surfaces own promotion and any cleanup execution decision.

### Bet 2 — Matrix campaign cells as managed waves — first slices landed

Each matrix cell now carries a managed candidate-wave posture and fan-in gate. The matrix plan exposes `autoresearch.matrix_managed_candidate_wave_substrate.v1`, and `review_matrix_campaign` aggregates managed cell-wave reviews into `autoresearch.matrix_campaign_review.v1` so the campaign is explainable as:

```text
scenario × hypothesis cell -> managed candidate wave -> packetized review -> AK-ready evidence context
```

These slices are still plan/review choreography: they do not launch peers, run benchmarks, write evidence, merge, or promote. Their job is to prevent matrix campaigns from multiplying loose sidequests by requiring every cell to pass through managed candidate-wave planning, controller-measured candidate-result packets, explicit missing-lane gates, and matrix-level review before owner selection.

A checkpointed runner-contract slice now adds `autoresearch.matrix_campaign_runner_contract.v1` for the same matrix shape. It is intentionally narrower than a broad executor: `prepare_matrix_campaign_runner` exposes only visible `candidate_peer_spawn` launch calls and a manifest/checkpoint token, while `checkpoint_matrix_campaign_runner` withholds benchmark/export/review calls until the exact controller checkpoint confirms visible peer reports and lineage verification are ready. After the checkpoint is accepted, the runner also emits an `autoresearch.matrix_cell_controller_command_packet.v1` next-call bundle so the controller does not have to reconstruct the sequence by hand: `autoresearch_candidate_bind -> autoresearch_runtime_run` with the cell metric -> `candidate_result_export -> review_candidate_wave -> review_matrix_campaign`. The glue-reduction proof metric is `manual_controller_glue_blockers` (lower is better, target `0`) and is considered covered only when the packet shows the exact per-cell sequence, metric-specific run/export templates, checkpoint and lineage verification, no hidden execution/promotion, and docs/tests alignment. The matrix plan/runner/checkpoint/review reports include an `autoresearch.matrix_campaign_operator_followup.v1` current-state summary with primary metric, lane packet paths, checkpoint/measurement/review posture, and next legal actions; for the operator-UX cell that metric is `operator_ux_blockers` with target `0`. It still does not execute peer launch, benchmark, export, review, evidence, merge, or promotion itself, and the checkpoint token remains a controller confirmation string rather than cryptographic proof.

A cockpit/dashboard slice now adds `autoresearch.matrix_campaign_cockpit.v1` to checkpoint and matrix-review output. The cockpit is the single scan path for matrix-wide progress, compact per-cell posture rows, selected lane and packet inventory visibility, per-cell/campaign next legal actions, dashboard-first owner routing, and no-hidden-execution/promotion boundaries. Its cell-02-01 UX metric is `matrix_cockpit_blockers` (lower is better, target `0`) and is covered only when those cockpit proofs plus docs/tests alignment are present.

An integrated closeout slice now makes the full supervised matrix campaign handoff reviewable as `autoresearch.matrix_campaign_closeout.v1`: selected cell lanes, closeout packet inventory, dashboard-first owner route (`/autoresearch export -> /autoresearch review -> evidence_record`), AK projection readiness after owner review, an exact `evidence_record` handoff call with deterministic projection key, and explicit not-done boundaries. The cell-03-01 handoff metric is `evidence_handoff_blockers` (lower is better, target `0`), with proof coverage for packet inventory, owner decision route before evidence, AK-ready projection guidance, authority-drift boundaries, and docs/tests alignment. The closeout now also carries an explicit owner-routed learning activation packet: `autoresearch_runtime_status({ action: "learning_export" }) -> autoresearch_learning_kes_adapter({ action: "plan" }) -> owner review -> autoresearch_learning_kes_adapter({ action: "materialize" })`. Its learning handoff check is `learning_activation_blockers` (lower is better, target `0`), and it remains advisory/packetized unless the owner adapter explicitly materializes package-owned KES artifacts.

### Bet 3 — Owner-facing review UX polish — measured slice landed

The existing `/autoresearch export` and `/autoresearch review` surfaces are good lower-plane affordances. Candidate-wave and matrix review reports now make the handoff explicit: dashboard first for measured packet inventory and situational awareness (`/autoresearch export`, with `/autoresearch overlay` fallback), candidate decision workbench only for final plan-only lifecycle decisions after packet inventory is complete (`/autoresearch review`). This distinction was dogfooded through the true measured loop: visible candidates were bound, measured, exported as candidate-result packets, and reviewed through `review_candidate_wave` rather than selected from diff text alone.

### Bet 4 — Evidence projection hardening — first slice landed

Keep evidence projection boring: exact anchors, dedupe, fail-closed verification, and no expansion into runtime ownership.

The first hardening slice records the exact AK task anchor in projected autoresearch milestone evidence and dedupes by `projection_key` across all matching task/check rows, not only the latest row. This prevents stale or replayed milestone states from writing duplicate evidence after later milestone rows have appeared, while preserving the existing fail-closed task/repo boundary check. The dogfood contract is `scripts/dogfood-evidence-projection-hardening-contract.mjs` with expected metric `unresolved_evidence_projection_hardening_blockers=0`.

### Bet 5 — Post-fan-in finalizer and cleanup governance — first cleanup handoff landed

The manual tail after managed fan-in review is now split into explicit owner-gated surfaces: scoped integration/finalizer apply remains owner-approved, while candidate cleanup is surfaced as exact post-integration handoff. The level-1.5 finalizer contract in [2026-05-14-post-fan-in-finalizer-governance-contract.md](./2026-05-14-post-fan-in-finalizer-governance-contract.md) still permits only deterministic post-review cleanup after explicit fan-in review, validation receipts, and final operator authorization.

The Level-4 closeout packet now includes `autoresearch.level4_post_fanin_promotion_handoff.v1` and `autoresearch.level4_post_integration_cleanup_ready.v1`. The promotion handoff is the anti-repeat packet: after Level-2/Level-3 fan-in is complete, Level-4 shows the remaining owner-gated sequence instead of starting another proof loop. It prepares owner review/finalizer-token-request guidance only from controller-verified measured packets and keeps finalizer apply, AK evidence, cleanup, and promotion as separate owner gates. Before successful closeout the cleanup packet offers only a `candidate_peer_cleanup({ peerRunIds })` dry-run inventory route. After successful integration closeout and controller-verified candidate bindings, it names the exact `candidate_peer_cleanup({ peerRunIds, execute: true, closeVisibleResources: true, integrationCloseoutStatus: "successful" })` call plus fallback commands. `candidate_peer_cleanup` is owned by `pi-little-helpers`; it consumes exact registry sidecars, archives first, can terminate only sidequest/Pi processes matched by the exact registered worktree path, and removes only named worktrees/branches.

The finalizer/cleanup path is intentionally not a hidden executor: no peer launch, benchmark/run execution, winner selection, merge/push/PR, release, toolbox activation, or Prompt Vault/ROCS/Oracle/KES mutation. Its required result taxonomy is `committed_cleaned`, `review_blocked`, or `failed_closed`, and its target glue metric is `manual_post_fanin_residue` lower-is-better with successful gated runs targeting `0`. The finalizer now emits an explicit closeout receipt for that taxonomy, carrying validation posture, finalizer-apply command posture, AK evidence handoff posture, cleanup handoff posture, blocked reasons, recovery notes, and non-actions so the tail is auditable instead of chat-managed.

## Ownership map

| Concern | Owner |
|---|---|
| Experiment runtime, receipts, empirical interpretation, candidate-result packets | `packages/pi-autoresearch` |
| Above-seam workflow, fan-in gates, supervision, evidence projection explanation | `packages/pi-society-orchestrator` |
| Visible peer launch, `/visible-loop`, `/nexus-loop`, and isolated candidate worktrees | `packages/pi-little-helpers` / peer tooling |
| Execution substrate and subagent execution taxonomy | `packages/pi-autonomous-session-control` |
| Durable task/evidence/direction truth | AK / society authority surfaces |
| Governed procedures | Prompt Vault |
| Ontology and controlled semantics | ROCS / ontology owner repos |
| Learning persistence | KES / notes / selected adapters |

## Read map

- Vision / end-state anchor: [vision.md](./vision.md)
- Autoresearch product posture: [`../../../pi-autoresearch/docs/project/product-posture.md`](../../../pi-autoresearch/docs/project/product-posture.md)
- Integrated supervised autoresearch posture: [`../../../../docs/project/pi-autoresearch-integrated-product-posture.md`](../../../../docs/project/pi-autoresearch-integrated-product-posture.md)
- Matrix campaign RFC: [2026-05-10-rfc-matrix-campaign-implementation-wave-substrate.md](./2026-05-10-rfc-matrix-campaign-implementation-wave-substrate.md)
- Post-fan-in finalizer governance: [2026-05-14-post-fan-in-finalizer-governance-contract.md](./2026-05-14-post-fan-in-finalizer-governance-contract.md)
- Manifest campaign supervision contract: [pi-autoresearch-manifest-campaign-supervision-contract.md](./pi-autoresearch-manifest-campaign-supervision-contract.md)
- Self-hosting supervision contract: [pi-autoresearch-self-hosting-supervision-contract.md](./pi-autoresearch-self-hosting-supervision-contract.md)
- Cross-package loop boundary: [loop taxonomy boundary contract](../../../../docs/project/loop-taxonomy-boundary-contract.md)
