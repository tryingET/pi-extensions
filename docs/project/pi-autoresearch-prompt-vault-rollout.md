---
summary: "Execution note for the first pi-autoresearch Prompt Vault rollout: three software-scoped one-shot templates were inserted successfully, while the state router remains blocked by governed router-vocabulary gaps."
read_when:
  - "After the initial pi-autoresearch Prompt Vault rollout to see what actually landed in Prompt Vault."
  - "Before attempting a follow-on vocabulary expansion or router insertion for pi-autoresearch."
system4d:
  container: "Root-level rollout note for the pi-autoresearch Prompt Vault seed inside the pi-extensions monorepo."
  compass: "Record exactly what was mutated in Prompt Vault, what was verified afterward, and what remains blocked by the governed vocabulary contract."
  engine: "Run DB preflight -> verify vault compatibility -> insert lawful templates -> verify visible results -> record remaining blockers and next move."
  fog: "The main risks are forgetting which templates actually landed, misremembering the router as already rolled out, or widening into vocabulary work without an explicit follow-on decision."
---

# Prompt Vault rollout — `pi-autoresearch`

## Status

Partially landed.

The first Prompt Vault rollout for `pi-autoresearch` was executed against the live governed Prompt Vault surface for the `software` company context.

### Landed now

1. `pi-autoresearch-setup`
2. `pi-autoresearch-next-hypothesis`
3. `pi-autoresearch-finalize`

### Not landed

4. `pi-autoresearch-state-router`

Reason:
its required router semantics still do not fit the current governed controlled vocabulary.

## Preconditions and preflight

Before mutation, I ran the workspace DB preflight required by workspace policy:

```bash
cd /home/tryinget/ai-society
./scripts/db-change-preflight.sh --db-path ./core/prompt-vault/prompt-vault.db --stage db-dev
```

Result:
- database file present
- preflight result: `PASS`

I also ran `vault_schema_diagnostics()` before mutation.

Result:
- Prompt Vault schema required: `9`
- Prompt Vault schema actual: `9`
- schema status: `ok`
- missing prompt/execution/feedback columns: `none`
- current company: `software`
- company source: cwd under `softwareco/owned/pi-extensions`

## Source of rollout truth

The rollout used the draft note in:

- `docs/project/pi-autoresearch-prompt-vault-template-set.md`

That note defined:
- exact first template names
- first-pass metadata posture
- draft template bodies
- the router vocabulary blockers

## Mutations executed

## Inserted templates

### 1. `pi-autoresearch-setup`
- description: `Turn a bounded optimization request plus repo reality into the first lawful pi-autoresearch campaign packet.`
- classification: `procedure / one_shot / workflow`
- owner_company: `software`
- visibility_companies: `software`

### 2. `pi-autoresearch-next-hypothesis`
- description: `Choose the single best next experiment move from campaign history, benchmark signal, checks output, and ASI.`
- classification: `procedure / one_shot / workflow`
- owner_company: `software`
- visibility_companies: `software`

### 3. `pi-autoresearch-finalize`
- description: `Turn kept autoresearch runs into reviewable finalization groups and a draft groups.json packet.`
- classification: `procedure / one_shot / workflow`
- owner_company: `software`
- visibility_companies: `software`

## Intentionally not inserted

### `pi-autoresearch-state-router`

This router was **not** inserted during the rollout.
The blocker was already known from the draft note and re-confirmed against live governed vocabulary.

Current router vocabulary still only allows:
- `routing_context`: analysis/review followups
- `activity_phase`: post-analysis/post-review/closeout
- `input_artifact`: analysis/review artifacts
- `transition_target_type`: `framework_mode`

That is not truthful for the `pi-autoresearch` state router, which needs equivalents of:
- `routing_context = experiment_followup`
- `activity_phase = active_experiment`
- `input_artifact = experiment_state_summary`
- `transition_target_type = prompt_template`

So the router remained doc-only rather than being forced through the wrong governed semantics.

## Verification after rollout

After insertion, I retrieved the exact target names from Prompt Vault.

### Retrieval result

Visible now:
- `pi-autoresearch-setup`
- `pi-autoresearch-next-hypothesis`
- `pi-autoresearch-finalize`

Still absent:
- `pi-autoresearch-state-router`

### Verified properties

The three inserted templates were verified as:
- visible in current company context `software`
- classified as `procedure / one_shot / workflow`
- stored with the expected descriptions
- stored without accidental router controlled vocabulary
- retrievable by exact name with the expected full content

I also re-checked `vault_vocabulary()` after rollout.

Result:
- no governed router vocabulary expansion happened as part of this task
- the state-router blocker remains unchanged

## Why this is the truthful stopping point

This rollout intentionally stopped after the lawful one-shot inserts.
That is the smallest truthful mutation set because:

1. the three one-shot templates already fit the current governed Prompt Vault contract
2. the state router does not
3. widening governed router vocabulary is a separate control-plane decision, not something to smuggle into a rollout note

## Operational result

Prompt Vault now holds the first durable `pi-autoresearch` control-plane templates for:
- setup
- next-hypothesis selection
- finalization grouping

So the capability no longer depends only on package-local prose for those three control-plane steps.

## Remaining blocker

The remaining blocker is **not template drafting**.
It is **governed router vocabulary expansion**.

Smallest truthful addition set:
- `routing_context += experiment_followup`
- `activity_phase += active_experiment`
- `input_artifact += experiment_state_summary`
- `transition_target_type += prompt_template`

## Recommended next move

If `pi-autoresearch` should gain a governed state router next, do this in order:

1. make an explicit follow-on decision about expanding router vocabulary
2. land the smallest truthful vocabulary additions
3. insert `pi-autoresearch-state-router`
4. verify retrieval and routing behavior under the `software` company context
