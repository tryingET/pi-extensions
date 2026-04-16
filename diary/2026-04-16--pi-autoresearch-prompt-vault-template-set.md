---
summary: "Session diary for drafting the first Prompt Vault template inventory for pi-autoresearch and isolating the governed router-vocabulary gaps that still block the state router."
read_when:
  - "Reviewing how the pi-autoresearch Prompt Vault template set was derived before any vault mutations are attempted."
  - "Checking why three templates are insert-ready now but the state router is still doc-only."
system4d:
  container: "Repo-root diary capture for the pi-autoresearch Prompt Vault follow-on slice."
  compass: "Make the first prompt-plane seed concrete while surfacing vocabulary blockers explicitly instead of forcing them through mismatched router semantics."
  engine: "Review the RFC and upstream behavior -> inspect current governed vocabulary -> choose the first truthful template names/metadata -> draft template texts -> isolate blockers -> verify the docs."
  fog: "The main risks are pretending the current router vocabulary already fits experiment control, over-generalizing template names too early, or quietly leaving package-local prompt prose as the real control plane."
---

# Session diary — pi-autoresearch Prompt Vault template set

## Goal
Draft the first Prompt Vault template inventory for the governed `pi-autoresearch` capability and make any governed vocabulary gaps explicit.

## AK context
- task: `#1414` — `Draft pi-autoresearch Prompt Vault template set and vocabulary gap note`
- scope required paths:
  - `docs/project/pi-autoresearch-prompt-vault-template-set.md`
  - `diary/2026-04-16--pi-autoresearch-prompt-vault-template-set.md`

## Inputs used
- `docs/project/pi-autoresearch-integration-analysis.md`
- `docs/project/pi-autoresearch-problem-description.md`
- `docs/project/pi-autoresearch-rfc.md`
- `../../contrib/pi-autoresearch/skills/autoresearch-create/SKILL.md`
- `../../contrib/pi-autoresearch/skills/autoresearch-finalize/SKILL.md`
- `packages/pi-vault-client/src/vaultMutations.ts`
- `packages/pi-vault-client/src/vaultDb.ts`
- live tool outputs:
  - `vault_vocabulary()`
  - `vault_query()` for visible structured routers
  - `vault_retrieve()` for `analysis-router`, `post-review-router`, `review-closeout-router`, `prompt-method-router`
  - `vault_retrieve()` for the proposed `pi-autoresearch-*` names to confirm they do not already exist

## Output written
- `docs/project/pi-autoresearch-prompt-vault-template-set.md`

## Main decisions

### 1. Keep the first seed capability-scoped
I chose:

- `pi-autoresearch-setup`
- `pi-autoresearch-next-hypothesis`
- `pi-autoresearch-finalize`
- `pi-autoresearch-state-router`

rather than generic `experiment-*` names.

Reason:
- the capability is still incubating inside `pi-extensions`
- ontology posture is repo-local first
- the runtime shape is still package-specific
- generic names would over-claim reuse too early

### 2. Use software-owned, software-visible template posture first
Recommended metadata for the seed:

- `owner_company: software`
- `visibility_companies: ["software"]`

Reason:
- this is the prompt-plane analogue of the repo-local ontology posture
- the seed should be truthful before it is broad

### 3. Keep Prompt Vault out of the long-lived runtime loop
I explicitly chose:

- `one_shot` for setup
- `one_shot` for next-hypothesis
- `one_shot` for finalize
- `router` for state-router
- **not** `loop` for the first seed

Reason:
- package/runtime code should still own repetition, receipts, bounded execution, and stop/resume behavior
- Prompt Vault should own durable decision templates used inside that runtime

### 4. Three templates are insert-ready now; one is not
Current governed vocabulary is sufficient for:

- setup
- next-hypothesis
- finalize

because those are `one_shot` procedures and do not require router controlled vocabulary.

Current governed vocabulary is **not** sufficient for:

- `pi-autoresearch-state-router`

because router insert/update validation requires all controlled-vocabulary dimensions, and the current dimensions only cover analysis/review flows.

### 5. Minimal router vocabulary expansion is small and explicit
Smallest truthful additions identified:

- `routing_context += experiment_followup`
- `activity_phase += active_experiment`
- `input_artifact += experiment_state_summary`
- `transition_target_type += prompt_template`

I treated these as the hard blockers.
I treated `selection_principles += noise_aware | metric_driven | scope_safe` as useful but non-blocking follow-on vocabulary.

### 6. Safe interim posture before router vocabulary changes
Until the router can be inserted truthfully:

- land the three `one_shot` templates first
- let package/runtime code carry the thin state-decision seam temporarily
- make `pi-autoresearch-next-hypothesis` fail safely with `rebaseline_needed`, `finalize_candidate`, or `blocked` instead of assuming continuation is always valid

## Validation

I used these checks during the draft:

```bash
ak task show 1414
ak task scope show 1414
```

Confirmed task scope is limited to `diary/**` and `docs/project/**` and requires the two target files.

```text
vault_vocabulary()
```

Confirmed current governed values:
- router contexts only cover analysis/review followups
- activity phases only cover post-analysis/post-review/closeout
- input artifacts only cover analysis/review artifacts
- transition targets only allow `framework_mode`

```text
vault_retrieve(["pi-autoresearch-setup", "pi-autoresearch-next-hypothesis", "pi-autoresearch-finalize", "pi-autoresearch-state-router"])
```

Confirmed the proposed names do not already exist in visible Prompt Vault state.

```bash
tmp_docs=$(mktemp -d)
tmp_diary=$(mktemp -d)
cp docs/project/pi-autoresearch-prompt-vault-template-set.md "$tmp_docs"/
cp diary/2026-04-16--pi-autoresearch-prompt-vault-template-set.md "$tmp_diary"/
node ~/ai-society/core/agent-scripts/scripts/docs-list.mjs --docs "$tmp_docs" --strict
node ~/ai-society/core/agent-scripts/scripts/docs-list.mjs --docs "$tmp_diary" --strict
git diff --check -- docs/project/pi-autoresearch-prompt-vault-template-set.md diary/2026-04-16--pi-autoresearch-prompt-vault-template-set.md
```

Result:
- strict metadata validation passed for both newly written files when checked in isolation
- `git diff --check` passed for the scoped changes
- a broader `docs-list --docs docs/project --docs diary --strict` repo check still reports pre-existing unrelated diary files without frontmatter; I did not widen this task into fixing that unrelated backlog

## Outcome
The RFC's previously generic Prompt Vault slice is now concrete:

- exact first template names
- exact initial metadata posture
- draft template texts
- explicit insertability split
- explicit minimal vocabulary blockers for the state router

The next truthful follow-on after this note is:
1. insert the three ready `one_shot` templates when desired
2. decide whether to extend governed router vocabulary
3. insert `pi-autoresearch-state-router` only after that vocabulary expansion lands
