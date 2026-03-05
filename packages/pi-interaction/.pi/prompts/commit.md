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
6. After the final commit is created, run once:
   - `npm run quality:pre-push`
7. If the pre-push gate fails, stop and fix before any push.

Output:
- Commit groups and staged paths per group
- Commands run for each gate
- Final pass/fail status
