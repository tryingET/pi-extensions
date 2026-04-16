---
summary: "Draft Prompt Vault seed for the pi-autoresearch capability, including insert-ready template metadata, draft template bodies, and the governed vocabulary gaps that currently block the router template."
read_when:
  - "Before inserting pi-autoresearch control-plane prompts into Prompt Vault."
  - "When deciding whether current governed Prompt Vault router vocabulary can represent experiment-loop routing truthfully."
system4d:
  container: "Root-level prompt-plane design note for the pi-autoresearch capability inside the pi-extensions monorepo."
  compass: "Make the first Prompt Vault seed concrete without pretending the current governed router vocabulary already fits experiment-loop routing."
  engine: "Choose the minimum template inventory -> bind truthful metadata -> draft the initial template texts -> isolate vocabulary blockers -> define the smallest lawful insertion order."
  fog: "The main risks are over-generalizing too early, forcing experiment semantics into review/analysis vocabulary that does not fit, or letting package-local prompt blobs remain the real control plane by default."
---

# Prompt Vault template set — `pi-autoresearch`

## Status

Draft.

This note turns the RFC's minimum Prompt Vault inventory into an explicit first seed.
It is intentionally **insert-ready where current governed vocabulary already fits** and **explicitly blocked where it does not**.

## Decision summary

Use this first seed:

1. `pi-autoresearch-setup`
2. `pi-autoresearch-next-hypothesis`
3. `pi-autoresearch-finalize`
4. `pi-autoresearch-state-router`

### Chosen metadata posture

- **owner_company:** `software`
- **visibility_companies:** `["software"]`
- **artifact_kind:** `procedure` for all four templates
- **control_mode:**
  - `one_shot` for setup, next-hypothesis, finalize
  - `router` for state-router
- **formalization_level:**
  - `workflow` for setup, next-hypothesis, finalize
  - `structured` for state-router

### Important implementation decision

Do **not** use `control_mode=loop` in the first Prompt Vault seed.
The runtime/package layer should own iteration, receipts, bounded execution, and stop conditions.
Prompt Vault should own the durable decision and instruction templates used **inside** that runtime.

### Insertability result

- **Insert now:** `pi-autoresearch-setup`, `pi-autoresearch-next-hypothesis`, `pi-autoresearch-finalize`
- **Blocked pending governed vocabulary expansion:** `pi-autoresearch-state-router`

## Why the names are capability-scoped first

The RFC used generic placeholders such as `experiment-setup` and `experiment-finalize`.
That is fine for concept discussion, but not yet the right insertion posture.

At this stage:

- the capability is still being incubated inside `pi-extensions`
- its ontology seed is repo-local first
- its runtime shape is still package-specific
- the state-router semantics are not yet proven broad enough for a shared core contract

So the first truthful Prompt Vault names should stay capability-scoped:

- `pi-autoresearch-setup`
- `pi-autoresearch-next-hypothesis`
- `pi-autoresearch-finalize`
- `pi-autoresearch-state-router`

Only after reuse proves out should a later pass consider generic shared names such as `experiment-setup`.

## Evidence used for this draft

This note was grounded by:

- `docs/project/pi-autoresearch-integration-analysis.md`
- `docs/project/pi-autoresearch-problem-description.md`
- `docs/project/pi-autoresearch-rfc.md`
- `../../contrib/pi-autoresearch/skills/autoresearch-create/SKILL.md`
- `../../contrib/pi-autoresearch/skills/autoresearch-finalize/SKILL.md`
- `vault_vocabulary()` output from the current runtime
- retrieved visible router templates such as `analysis-router`, `post-review-router`, `review-closeout-router`, and `prompt-method-router`
- `packages/pi-vault-client/src/vaultMutations.ts` and `packages/pi-vault-client/src/vaultDb.ts` for the current router-contract requirements

## Recommended seed inventory

| template | purpose | metadata | readiness |
|---|---|---|---|
| `pi-autoresearch-setup` | Turn an optimization request into a lawful campaign packet and artifact contract | `procedure` / `one_shot` / `workflow` | ready now |
| `pi-autoresearch-next-hypothesis` | Choose the single best next experiment move from real run history and ASI | `procedure` / `one_shot` / `workflow` | ready now |
| `pi-autoresearch-finalize` | Turn kept runs into reviewable finalization groups and a draft `groups.json` packet | `procedure` / `one_shot` / `workflow` | ready now |
| `pi-autoresearch-state-router` | Route campaign state to continue / rebaseline / finalize / stop / escalate-review | `procedure` / `router` / `structured` | blocked by router vocabulary gaps |

## Template 1 — `pi-autoresearch-setup`

### Proposed metadata

```json
{
  "name": "pi-autoresearch-setup",
  "description": "Turn a bounded optimization request plus repo reality into the first lawful pi-autoresearch campaign packet.",
  "artifact_kind": "procedure",
  "control_mode": "one_shot",
  "formalization_level": "workflow",
  "owner_company": "software",
  "visibility_companies": ["software"]
}
```

### Draft content

```md
# PI-AUTORESEARCH SETUP

Turn a bounded optimization request plus current repo reality into the first lawful `pi-autoresearch` campaign packet.

## Inputs
Use the actual provided context first:
- optimization objective
- current repo/runtime context
- AK task scope or explicit file bounds
- constraints and off-limits
- existing benchmark, test, or profiling surfaces
- any prior `autoresearch.*` artifacts already present

## Goal
Produce the smallest setup packet that lets the runtime or operator begin a campaign without inventing authority later.

## Required output
Emit exactly these sections:
1. `STATUS:` `ready` or `blocked`
2. `GOAL:` one-sentence campaign goal
3. `PRIMARY_METRIC:` `<name> (<unit>, lower|higher is better)`
4. `SECONDARY_METRICS:` comma-separated list or `none`
5. `BENCHMARK_COMMAND:` exact baseline command to run
6. `FILES_IN_SCOPE:` repo-relative paths
7. `OFF_LIMITS:` repo-relative paths or rules
8. `HARD_CONSTRAINTS:` tests, latency ceilings, dependency bans, UX limits, etc.
9. `CHECKS_REQUIRED:` `none | reuse_existing_checks | create_autoresearch_checks_sh`
10. `AUTORESEARCH_MD_PLAN:` exact sections that `autoresearch.md` must contain
11. `AUTORESEARCH_SH_CONTRACT:` what `autoresearch.sh` must do and what metrics it must emit
12. `BASELINE_PLAN:` the first measurement plan, including whether repeated median runs are needed
13. `FIRST_EXPERIMENT_RULES:` the first keep/discard rules that should govern iteration
14. `MISSING_INFORMATION:` `none` or the exact blockers

## Rules
- Prefer existing benchmark/test scripts when they already express the workload truthfully.
- If the objective, metric, or scope is too ambiguous to begin lawfully, set `STATUS: blocked` and name the exact missing information.
- Keep file scope aligned to the provided AK scope or explicit repo bounds; do not widen scope casually.
- Recommend `autoresearch.checks.sh` only when correctness backpressure is actually required.
- If the benchmark is fast and noisy, say so explicitly and require repeated inside-script runs with a median or similarly robust aggregate.
- Treat `autoresearch.jsonl` and related local artifacts as receipts/projections, not the sole authority.
- Do not start execution, invent git actions, or pretend the setup packet itself is the runtime.
- Do not output generic benchmarking advice detached from the actual repo context.
```

## Template 2 — `pi-autoresearch-next-hypothesis`

### Proposed metadata

```json
{
  "name": "pi-autoresearch-next-hypothesis",
  "description": "Choose the single best next experiment move from campaign history, benchmark signal, checks output, and ASI.",
  "artifact_kind": "procedure",
  "control_mode": "one_shot",
  "formalization_level": "workflow",
  "owner_company": "software",
  "visibility_companies": ["software"]
}
```

### Draft content

```md
# PI-AUTORESEARCH NEXT HYPOTHESIS

Choose the single best next experiment move from the real campaign evidence.

## Inputs
Use the actual provided experiment packet first:
- campaign goal and constraints
- baseline, current best, and recent kept/discarded/crash/checks_failed runs
- ASI notes and dead-end memory
- current benchmark/check outputs
- files in scope and off-limits
- ideas backlog if present

## Goal
Emit one bounded next move that is worth trying now.
Do not emit a menu.
Do not re-explain the whole campaign.

## Required output
Emit exactly these sections:
1. `STATUS:` `ready | rebaseline_needed | finalize_candidate | blocked`
2. `STATE_READ:` shortest truthful reading of the campaign state
3. `NEXT_HYPOTHESIS:` one sentence
4. `WHY_NOW:` evidence-based reason tied to actual run history
5. `TARGET_FILES:` repo-relative paths
6. `CHANGE_SHAPE:` the smallest useful code or benchmark change to attempt
7. `EXPECTED_PRIMARY_EFFECT:` what should improve and why
8. `RISK_TO_GUARD:` correctness, noise, scope, or complexity risk
9. `RUN_PLAN:` exact next benchmark/check sequence
10. `ASI_TO_CAPTURE_IF_KEPT:` what should be remembered if this wins
11. `ASI_TO_CAPTURE_IF_DISCARDED:` what should be remembered if this loses or crashes
12. `STOP_CONDITION:` what observation should cause this line of attack to stop immediately

## Rules
- Choose exactly one next move.
- Use real evidence from run history and ASI; do not optimize by vibe.
- Do not repeat a dead end unless new evidence clearly changes the expected outcome.
- Prefer instrumentation or benchmark-quality fixes when the signal is too noisy to justify more code churn.
- If the benchmark target, metric contract, or workload changed enough to invalidate the baseline, emit `STATUS: rebaseline_needed` instead of pretending continuation is lawful.
- If the campaign has already harvested the meaningful wins and should be grouped for review, emit `STATUS: finalize_candidate` instead of inventing extra churn.
- Keep the proposed change inside the known allowed scope.
- Prefer simpler changes when expected upside is similar.
- Do not propose manual whole-tree git cleanup or out-of-scope edits.
```

### Why this one is `one_shot`

The package runtime should decide **when** to invoke the next-hypothesis template again.
This template should only decide **what the next bounded move is**.
That keeps Prompt Vault as the durable control plane without making it the owner of the long-lived loop runtime.

## Template 3 — `pi-autoresearch-finalize`

### Proposed metadata

```json
{
  "name": "pi-autoresearch-finalize",
  "description": "Turn kept autoresearch runs into reviewable finalization groups and a draft groups.json packet.",
  "artifact_kind": "procedure",
  "control_mode": "one_shot",
  "formalization_level": "workflow",
  "owner_company": "software",
  "visibility_companies": ["software"]
}
```

### Draft content

```md
# PI-AUTORESEARCH FINALIZE

Turn a noisy `pi-autoresearch` branch into the smallest reviewable set of independent change groups.

## Inputs
Use the actual provided finalization packet first:
- kept runs from `autoresearch.jsonl`
- campaign context from `autoresearch.md`
- merge-base and trunk target
- per-kept-run commit identity and diff stats
- any ideas backlog that should remain out of the final branches

## Goal
Produce a reviewable grouping proposal plus a draft `groups.json` payload.
Do not execute finalization automatically.
Approval must remain explicit.

## Required output
Emit exactly these sections:
1. `STATUS:` `ready | blocked`
2. `BASE_REF:` merge-base or explicit base commit
3. `TRUNK_REF:` target trunk branch
4. `OVERALL_RESULT:` shortest truthful summary of what the campaign achieved
5. `PROPOSED_GROUPS:` numbered groups in application order; each group must include title, commits, files, metric effect, and dependency notes
6. `GROUPING_RATIONALE:` why the split is the smallest truthful review surface
7. `APPROVAL_REQUIRED:` always `yes`
8. `GROUPS_JSON_DRAFT:` JSON block ready to save as `groups.json`
9. `RISK_NOTES:` overlaps, hidden dependencies, or verification risks
10. `CLEANUP_HINTS:` post-finalization cleanup reminders if branches are created later

## Rules
- Only use kept runs as grouping candidates.
- Preserve application order.
- No two proposed groups may touch the same file.
- If two candidate groups share files or have a tight dependency chain, merge them into one group.
- Flag cross-group dependencies explicitly instead of hiding them.
- Keep each group small and theme-coherent.
- If there is only one truthful group, say so; do not force multiple branches for aesthetics.
- Do not pretend approval already happened.
- Do not run git commands or the finalization script from this template.
```

## Template 4 — `pi-autoresearch-state-router`

### Proposed metadata

```json
{
  "name": "pi-autoresearch-state-router",
  "description": "Route experiment state into the single best next control state and emit the exact next prompt.",
  "artifact_kind": "procedure",
  "control_mode": "router",
  "formalization_level": "structured",
  "owner_company": "software",
  "visibility_companies": ["software"],
  "controlled_vocabulary": {
    "routing_context": "experiment_followup",
    "activity_phase": "active_experiment",
    "input_artifact": "experiment_state_summary",
    "transition_target_type": "prompt_template",
    "selection_principles": ["evidence_based", "constraint_preserving"],
    "output_commitment": "exact_next_prompt"
  }
}
```

### Draft content

```md
# PI-AUTORESEARCH STATE ROUTER

Route the current campaign state into the single best next control state and emit the exact next prompt.

You must choose exactly one state:
- `CONTINUE`
- `REBASELINE`
- `FINALIZE`
- `STOP`
- `ESCALATE_REVIEW`

## Input priority
Use the actual provided experiment-state artifact first:
- campaign goal and constraints
- baseline / best / recent run history
- checks status and noise/confidence signal
- scope and off-limits
- current branch/finalization posture

## Required output
1. `SELECTED_STATE:` one of the five states
2. `WHY:` shortest convincing reason tied to actual campaign evidence
3. `EVIDENCE_BASIS:` the key state facts that forced the routing choice
4. `NEXT_TEMPLATE:` exact Prompt Vault template to run next, or explicit review/escalation template if the next move leaves the local experiment loop
5. `NEXT PROMPT:` the exact next prompt to run

## Routing rules
- Choose `CONTINUE` when the baseline is still valid, the scope is still lawful, and one more bounded experiment is clearly justified.
- Choose `REBASELINE` when the workload, metric contract, or benchmark setup changed enough that the old baseline is no longer trustworthy.
- Choose `FINALIZE` when the campaign has already harvested meaningful wins and the highest-leverage next move is grouping for review.
- Choose `STOP` when the objective is met, no lawful moves remain inside scope, or further search is mostly churn.
- Choose `ESCALATE_REVIEW` when the blocker is now an authority, architecture, safety, or tradeoff decision rather than another experiment.
- Do not choose `CONTINUE` when confidence is too weak, correctness is failing structurally, or the baseline has drifted.
- Prefer the smallest truthful state transition, not the most dramatic one.
- `NEXT_TEMPLATE` should usually target one of:
  - `pi-autoresearch-setup`
  - `pi-autoresearch-next-hypothesis`
  - `pi-autoresearch-finalize`
  - an explicit external review/decision template when escalation is required
```

## Governed vocabulary gap note

The current governed router vocabulary is:

- `routing_context`: `analysis_followup`, `review_followup`, `review_closeout`
- `activity_phase`: `post_analysis`, `post_review`, `closeout`
- `input_artifact`: `analysis_output`, `review_findings`, `review_summary`
- `transition_target_type`: `framework_mode`
- `selection_principles`: `evidence_based`, `constraint_preserving`, `minimal_change`
- `output_commitment`: `exact_next_prompt`

The current router mutation contract also requires **all router dimensions** to be present and valid.
So the state-router cannot be inserted truthfully by just “using the closest thing.”

### Blocking mismatches

| dimension | current allowed values | why they do not fit `pi-autoresearch-state-router` | recommended first addition | blocking? |
|---|---|---|---|---|
| `routing_context` | analysis/review followups only | experiment-loop state routing is neither analysis followup nor review followup | `experiment_followup` | yes |
| `activity_phase` | `post_analysis`, `post_review`, `closeout` | the router acts during an active experiment campaign, not after analysis/review | `active_experiment` | yes |
| `input_artifact` | analysis/review artifacts only | the router consumes campaign state, run history, checks state, and confidence signal | `experiment_state_summary` | yes |
| `transition_target_type` | `framework_mode` only | the router should usually target the next Prompt Vault template, not a framework mode | `prompt_template` | yes |
| `selection_principles` | evidence / constraints / minimal change | workable but not fully expressive for noise-aware experiment routing | optional later: `noise_aware`, `metric_driven`, `scope_safe` | no |
| `output_commitment` | `exact_next_prompt` | sufficient for the first seed | none required | no |

### Smallest truthful vocabulary expansion

The minimum expansion needed to insert the router truthfully is:

- `routing_context += experiment_followup`
- `activity_phase += active_experiment`
- `input_artifact += experiment_state_summary`
- `transition_target_type += prompt_template`

That is the smallest change set that lets the router describe what it actually is doing.

### Optional later refinements

If experiment-loop routing becomes a broader contract, consider adding:

- `selection_principles += noise_aware`
- `selection_principles += metric_driven`
- `selection_principles += scope_safe`

Those are **not** required for the first insertion, because `evidence_based` and `constraint_preserving` are already serviceable.

## Practical insertion order

1. Insert `pi-autoresearch-setup`
2. Insert `pi-autoresearch-next-hypothesis`
3. Insert `pi-autoresearch-finalize`
4. Extend governed router vocabulary with the minimum experiment-loop additions
5. Insert `pi-autoresearch-state-router`

## Interim posture before the router exists

Until the router vocabulary is expanded:

- the three `one_shot` templates can still land now
- package/runtime code may handle the thin continue/rebaseline/finalize decision locally
- `pi-autoresearch-next-hypothesis` should fail safely with `STATUS: rebaseline_needed`, `finalize_candidate`, or `blocked` instead of pretending continuation is always lawful

That keeps the first seed useful without smuggling false router semantics into the governed vocabulary.

## Promotion criteria for later genericization

Only consider promoting these into generic shared `experiment-*` templates when all of the following become true:

1. the capability is reused outside the first `pi-autoresearch` package shape
2. the router vocabulary additions are proven stable beyond this repo-local incubation
3. at least one non-`pi-autoresearch` consumer wants the same control-plane semantics with minimal adaptation
4. owner/visibility expansion would make the templates more truthful, not just more convenient
