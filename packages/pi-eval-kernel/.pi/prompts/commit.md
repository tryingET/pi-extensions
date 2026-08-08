---
description: Create commit groups with explicit-path staging and TS lane quality gates
system4d:
  container: "Repo-local commit workflow prompt."
  compass: "Ship coherent commits with deterministic validation gates."
  engine: "Group changes -> stage explicit paths -> validate -> commit -> final push gate."
  fog: "Broad staging or skipped gates can hide regressions."
---

Create commits for the requested changes.

Mandatory workflow:

1. Build commit groups with clear intent.
2. Stage **explicit file paths only** for each group.
   - Allowed: `git add path/to/file`
   - Disallowed: `git add .`, `git add -A`, wildcard staging
3. For each commit group, run:
   - `npm run quality:pre-commit`
4. **Fail fast**:
   - If validation fails, stop immediately, report the error, fix, then rerun.
   - Do not create the commit until the gate passes.
5. Create the commit once the gate passes.
   - Capture the created commit SHA.
   - Prefer `~/ai-society/core/agent-scripts/scripts/git-note-provenance.sh` to attach a YAML git note on `refs/notes/ai-society/provenance` with:
     - `kind: ai-society/commit-provenance/v1`
     - `tool: /commit`
     - `intent`
     - exact `files`
     - `validation.fast_gate` using `npm run quality:pre-commit` with its result
     - `validation.full_gate` using `npm run quality:pre-push` with `status: pending` until the final gate finishes
     - optional short `group.rationale`
     - optional `links.task_ids`, `links.evidence_ids`, and `links.diary` only when they are explicit and real
6. After the final commit is created, run once:
   - `npm run quality:pre-push`
7. If the pre-push gate fails, stop and fix before any push.
8. Rewrite each created commit note with `~/ai-society/core/agent-scripts/scripts/git-note-provenance.sh` so `validation.full_gate` records the final gate command and result.
9. Keep the final success report concise: list commit `sha` + subject and whether provenance notes were attached. Detailed successful-commit metadata belongs in the git note, not the chat response.

Output:
- Commit groups and staged paths per group
- Commands run for each gate
- Final pass/fail status
- On success, keep the final response concise and point to the attached provenance notes for detail
