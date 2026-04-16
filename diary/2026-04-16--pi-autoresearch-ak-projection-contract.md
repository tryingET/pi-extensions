---
summary: "Session diary for defining the first projection-only AK milestone contract for pi-autoresearch campaigns."
read_when:
  - "Reviewing why the first autoresearch -> AK binding was frozen as evidence-only milestone projection."
  - "Looking for the exact scope and guardrails chosen before implementing orchestrator-side autoresearch AK writes."
system4d:
  container: "Repo-root diary capture for the pi-autoresearch AK milestone projection contract slice."
  compass: "Make the first AK binding durable enough for campaign progress while keeping AK out of package-runtime microstate ownership."
  engine: "Read current owner split -> freeze the milestone set -> freeze payload/idempotence rules -> verify the new docs."
  fog: "The main risks are overclaiming AK as runtime owner, choosing milestones that are too granular, or leaving the first projector without a dedupe contract."
---

# Session diary — `pi-autoresearch` AK milestone projection contract

## Goal
Define the smallest truthful contract for projecting `pi-autoresearch` campaign milestones into AK before the orchestrator-side implementation work begins.

## AK context
- task: `#1474` — `Define autoresearch AK milestone projection contract`
- parent umbrella: `#1473` — `[UMBRELLA] Add orchestrator supervision and AK milestone projection for autoresearch campaigns`

## What changed
Added the required root artifacts:

- `docs/project/pi-autoresearch-ak-projection-contract.md`
- `diary/2026-04-16--pi-autoresearch-ak-projection-contract.md`

### Contract decisions frozen in the doc
1. **V1 is projection-only and evidence-only**
   - the first binding writes AK evidence on an existing task
   - it does not auto-create, retarget, complete, or fail AK tasks

2. **The milestone set stays coarse**
   - project only `configured`, `decision-required`, `rebaseline-needed`, `finalize-candidate`, `blocked`, and `completed`
   - keep `running_benchmark`, `running_checks`, receipt-recording, and other transient machine states package-local only

3. **The projector must trust package runtime surfaces, not invent its own runtime**
   - use the bounded `pi-autoresearch` runtime/ledger seam
   - fail closed on ledger replay/integrity problems instead of writing fake AK truth

4. **Every projected write needs a deterministic idempotence key**
   - the contract now requires `projection_key` in AK evidence details
   - unchanged polls must not append duplicate evidence rows

5. **AK remains campaign truth, not runtime replay truth**
   - details stay compact and milestone-oriented
   - full receipts, prompt text, and benchmark output stay out of AK evidence

## Verification
Passed:
- targeted strict docs validation for the two new artifacts using an isolated temp tree

Command run:

```bash
tmpdir=$(mktemp -d)
mkdir -p "$tmpdir/docs/project" "$tmpdir/diary"
cp docs/project/pi-autoresearch-ak-projection-contract.md "$tmpdir/docs/project/"
cp diary/2026-04-16--pi-autoresearch-ak-projection-contract.md "$tmpdir/diary/"
node ~/ai-society/core/agent-scripts/scripts/docs-list.mjs \
  --docs "$tmpdir/docs/project" \
  --docs "$tmpdir/diary" \
  --strict
```

Note:
- repo-wide `--docs . --strict` still reports unrelated pre-existing metadata debt elsewhere in the monorepo, so validation for this slice was scoped to the newly added artifacts.

## Outcome
The next implementation slice now has an explicit bounded contract for what an autoresearch -> AK projector may write, when it must stay silent, and how it avoids turning AK into a shadow runtime.
