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
- target control plane: landed for exact live autoresearch supervision, manifest observation, self-hosting observation, KES learning adapter, workflow execution over ASC, and candidate-wave plan/review slices
- current strategic line: managed candidate-wave fan-in and matrix-campaign dogfood before broader automation
- release posture: package checks pass; product remains pre-public for supervised campaign UX until candidate-wave fan-in is no longer chat-managed

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

- `autoresearch_live_supervision` for exact runtime observe/start/status/stop, campaign start delegation, candidate-wave planning, candidate-wave review, and matrix-campaign planning;
- candidate-wave review from inline summaries or `autoresearch.candidate_result.v1` packet paths, including explicit missing-packet lane visibility and owner decision options;
- candidate-wave fan-in gating: explicit planned missing packet paths block final owner selection until measured/exported or owner-replanned;
- `autoresearch_manifest_campaign_supervision` for exact manifest observation and evidence-only AK projection;
- `autoresearch_self_hosting_supervision` for exact self-hosting artifact observation and evidence-only projection;
- owner-routed `autoresearch_learning_kes_adapter` for KES diary/learning-candidate materialization from `pi-autoresearch` learning packets;
- workflow/loop surfaces over the public ASC seam;
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
6. **Boundary report** — output says what was not done: no promotion, merge, worktree cleanup, AK direction mutation, or hidden peer launch.

## Current strategic line

Prioritize product coherence over adding more generic orchestration power.

The highest-leverage line is:

```text
managed candidate-wave fan-in -> matrix cell as managed wave -> implementation-wave dogfood substrate
```

This order matters. Matrix campaigns multiply unmanaged parallelism unless one candidate wave already has explicit plan, launch, final-only measurement, missing-lane gates, aggregate review, and non-selected-lane stop/cancel guidance.

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

Orchestrator owns the above-seam state model and report. `pi-autoresearch` owns measurement and candidate-result packets. Peer tooling owns visible candidate launch. Operators and owner surfaces own promotion/cleanup.

### Bet 2 — Matrix campaign cells as managed waves — first slices landed

Each matrix cell now carries a managed candidate-wave posture and fan-in gate. The matrix plan exposes `autoresearch.matrix_managed_candidate_wave_substrate.v1`, and `review_matrix_campaign` aggregates managed cell-wave reviews into `autoresearch.matrix_campaign_review.v1` so the campaign is explainable as:

```text
scenario × hypothesis cell -> managed candidate wave -> packetized review -> AK-ready evidence context
```

These slices are still plan/review choreography: they do not launch peers, run benchmarks, write evidence, merge, or promote. Their job is to prevent matrix campaigns from multiplying loose sidequests by requiring every cell to pass through managed candidate-wave planning, controller-measured candidate-result packets, explicit missing-lane gates, and matrix-level review before owner selection.

An integrated closeout slice now makes the full supervised matrix campaign handoff reviewable as `autoresearch.matrix_campaign_closeout.v1`: selected cell lanes, packet paths, dashboard-first owner route, AK projection readiness after owner review, and explicit not-done boundaries. The dogfood contract is `scripts/dogfood-integrated-matrix-campaign-closeout-contract.mjs` with expected metric `unresolved_integrated_matrix_campaign_closeout_blockers=0`.

### Bet 3 — Owner-facing review UX polish — first slice landed

The existing `/autoresearch export` and `/autoresearch review` surfaces are good lower-plane affordances. Candidate-wave and matrix review reports now make the handoff explicit: dashboard first for situational awareness (`/autoresearch export`, with `/autoresearch overlay` fallback), candidate decision workbench only for final plan-only lifecycle decisions (`/autoresearch review`).

### Bet 4 — Evidence projection hardening — first slice landed

Keep evidence projection boring: exact anchors, dedupe, fail-closed verification, and no expansion into runtime ownership.

The first hardening slice records the exact AK task anchor in projected autoresearch milestone evidence and dedupes by `projection_key` across all matching task/check rows, not only the latest row. This prevents stale or replayed milestone states from writing duplicate evidence after later milestone rows have appeared, while preserving the existing fail-closed task/repo boundary check. The dogfood contract is `scripts/dogfood-evidence-projection-hardening-contract.mjs` with expected metric `unresolved_evidence_projection_hardening_blockers=0`.

## Ownership map

| Concern | Owner |
|---|---|
| Experiment runtime, receipts, empirical interpretation, candidate-result packets | `packages/pi-autoresearch` |
| Above-seam workflow, fan-in gates, supervision, evidence projection explanation | `packages/pi-society-orchestrator` |
| Visible peer launch and isolated candidate worktrees | `packages/pi-little-helpers` / peer tooling |
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
- Manifest campaign supervision contract: [pi-autoresearch-manifest-campaign-supervision-contract.md](./pi-autoresearch-manifest-campaign-supervision-contract.md)
- Self-hosting supervision contract: [pi-autoresearch-self-hosting-supervision-contract.md](./pi-autoresearch-self-hosting-supervision-contract.md)
