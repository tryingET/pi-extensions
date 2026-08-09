---
summary: "No-code pre-Phase-1 experiment protocol for deciding when accepted task 4720 should resume."
read_when:
  - "Running or evaluating the review-value gate before task 4720 starts."
  - "Recording the deferral or later resumption condition for decision 116."
system4d:
  container: "Operator-attested product-value experiment over existing agent_vent review surfaces."
  compass: "Measure review value before paying the accepted persistent-identity infrastructure cost."
  engine: "Fixed window -> explicit review encounters -> aggregate ratings/burden -> proceed, revise, stop, or inconclusive."
  fog: "Mutable recurrence aliases and local observations can be mistaken for unique groups, verified humans, or canonical outcomes."
---

# Pre-Phase-1 experiment — `agent_vent` review value

Status: **no-code experiment protocol; not implementation, human-identity proof, or owner-system authority**.

Governing decision: AK decision `116`.

Deferred implementation task: AK task `4720`.

Rationale: [many-of-the-greats reevaluation](2026-08-09-many-of-the-greats-task-4720-reevaluation.md).

## Question

Does explicit operator review through the already-landed `agent_vent review`, `outcomes`, and `compare` surfaces create enough local value to justify starting the accepted snapshot/migration/locking/cadence implementation?

## Hard boundary

The experiment adds no package code or automatic action. It does not:

- create a cadence command or startup nudge;
- create snapshot, identity, migration, lock, due, outcome, or handoff state;
- auto-record vents or change review state;
- infer unique group identity across curation, archive/restore, or alias reuse;
- create AK tasks/evidence, GitHub issues, incidents, KES learnings, telemetry, or owner effects from a vent;
- export raw vent text.

An operator may explicitly use existing local review-state commands after inspecting a group. Such state remains local disposition only.

## Fixed experiment window

- `pilot_start_at`: explicit operator-selected UTC timestamp recorded before the first encounter.
- `pilot_end_at`: exactly 30 calendar days after `pilot_start_at`.
- The experiment does not end early for apparent success.
- It stops early only for a privacy, authority, destructive-data, or active-store safety incident.
- Final result is `inconclusive` when fewer than 10 review encounters exist at `pilot_end_at`.

## Measurement unit

The unit is an **operator-attested review encounter**, not a unique recurrence group.

An encounter begins only when the operator explicitly chooses one current recurrence key and inspects it through:

```text
/agent_vent review show <recurrenceKey>
```

The private experiment worksheet assigns a monotonic encounter sequence and records:

- observed UTC timestamp;
- local recurrence key as an alias, not canonical identity;
- whether the same alias appeared in an earlier encounter;
- current local review-state label;
- local disposition decision: `chosen | not_chosen | unknown`;
- rating: `useful | mixed | not_useful | unknown`;
- burden: `under_1m | 1_to_3m | 3_to_10m | over_10m | unknown`;
- freshness confidence: `apparently_current | uncertain | unknown`;
- optional controlled reason code, without raw vent text.

Repeated aliases count as repeated encounters because stable cross-time group identity is intentionally unavailable. Reports must show total encounters, repeated-alias encounters, and distinct observed aliases separately. They must not call the latter unique groups.

Trust level for every observation is `operator_attested_local_experiment`; it is not authenticated human identity, canonical evidence, or owner acceptance.

Burden bands are self-reported with non-overlapping boundaries: `under_1m` is less than 60 seconds; `1_to_3m` is 60 through 180 seconds inclusive; `3_to_10m` is greater than 180 through 600 seconds inclusive; `over_10m` is greater than 600 seconds.

## Allowed reason codes

- `recurrence_visible`
- `decision_clarified`
- `noise_removed`
- `owner_action_considered`
- `insufficient_context`
- `wrong_grouping`
- `stale_or_uncertain`
- `no_incremental_value`
- `excessive_burden`
- `other`

Owner action is an observation only. Any real owner artifact remains governed by its owner surface and is not created by this protocol.

## Exact metrics

Let:

- `E` = all encounters started inside `[pilot_start_at, pilot_end_at)`;
- `R` = encounters with rating `useful`, `mixed`, or `not_useful`;
- `V` = rated encounters with rating `useful` or `mixed`;
- `B` = encounters with a non-unknown burden band;
- `B3` = burden-known encounters in `under_1m` or `1_to_3m`;
- `D` = encounters where local disposition decision is `chosen`;
- `Q` = encounters marked freshness `uncertain`;
- `A` = repeated-alias encounters;
- `U_r` = encounters with rating `unknown` or missing;
- `U_b` = encounters with burden `unknown` or missing;
- `U_f` = encounters with freshness confidence `unknown` or missing;
- `U_d` = encounters with local disposition decision `unknown` or missing.

Report:

- review encounters: `|E|`;
- local-disposition coverage: `|D| / |E|`;
- rating coverage: `|R| / |E|`;
- useful-or-mixed rate: `|V| / |R|`;
- burden-known coverage: `|B| / |E|`;
- at-most-3-minute burden rate: `|B3| / |B|`;
- freshness-uncertain rate: `|Q| / |E|`;
- repeated-alias rate: `|A| / |E|`;
- unknown counts separately: `|U_r|`, `|U_b|`, `|U_f|`, and `|U_d|`;
- count by rating, burden band, and reason code.

A fraction with denominator zero is `not_available`, never zero or success. Every report includes the fixed window, trust level, numerator, denominator, unknown count, and early-stop status.

## Decision rule

Apply this precedence exactly at closeout:

1. any privacy, authority, destructive-data, or active-store safety incident -> `revise_or_stop`;
2. `|E| < 10`, incomplete window/worksheet, a required denominator of zero, or trust/alias ambiguity that prevents aggregation -> `inconclusive`;
3. minimum sample exists but any value/burden gate fails -> `revise_or_stop`;
4. otherwise, when every gate passes -> `proceed_to_task_4720_reevaluation`.

### `proceed_to_task_4720_reevaluation`

Only when all are true at `pilot_end_at` after applying the precedence above:

- `|E| >= 10`;
- rating coverage `>= 0.70`;
- useful-or-mixed rate `>= 0.60`;
- burden-known coverage `>= 0.70`;
- at-most-3-minute burden rate `>= 0.80`;
- no privacy, authority, destructive-data, or active-store safety incident;
- uncertain freshness is reported and did not cause a false human-review/owner-effect claim.

This result authorizes reevaluation, not automatic task resumption or implementation.

### `revise_or_stop`

Use for any safety incident, or when the minimum encounter count and required denominators exist but a value/burden gate fails. Keep task 4720 deferred and revisit product sequencing through AK.

### `inconclusive`

Use when the minimum sample, required denominator, complete window/worksheet, or aggregate trust condition is absent and no safety incident already forced `revise_or_stop`. Unknown or incomplete data never becomes success.

## Storage and privacy

- Keep the encounter worksheet in an operator-owned private experiment location, not the package store or repository.
- Store controlled fields only; no summaries, evidence text, raw logs, session transcripts, secrets, or private user payloads.
- The package neither reads nor writes the worksheet.
- At closeout, only de-identified aggregate metrics and the decision token may cross into an authorized AK evidence note or empirical-owner handoff.

## Validation before use

- confirm current `agent_vent review`, `outcomes`, and `compare` are available;
- record active store hash before and after read-only inspection;
- confirm no automatic review-state mutation occurred;
- confirm the private worksheet path is outside the repository and package store;
- confirm task 4720 remains deferred throughout the window.

## Closeout

At `pilot_end_at`, produce one bounded aggregate note containing:

- window and trust level;
- exact formulas and counts;
- repeated-alias and unknown disclosures;
- safety incidents or explicit zero;
- `proceed_to_task_4720_reevaluation | revise_or_stop | inconclusive`;
- legal next move.

Do not resume task 4720, advance implementation, or promote a learning mechanically from the aggregate result.
