---
summary: "ADR: keep pi-agent-vent hard-delete out of the v0.1 package surface; use backup-backed archive as the destructive lifecycle baseline."
read_when:
  - "Changing agent_vent retention, archive, restore, delete, purge, or backup behavior."
  - "Deciding whether pi-agent-vent should remove local diagnostic records or backup artifacts."
system4d:
  container: "Package-local retention/delete policy decision."
  compass: "Protect local diagnostic user data while avoiding false evidence/task/incident authority."
  engine: "Prefer reversible archive -> explicit operator filesystem control -> future delete only by new decision."
  fog: "Hard-delete can be mistaken for privacy compliance, evidence deletion, or owner-system lifecycle closure."
---

# ADR — Agent vent retention/delete policy

Date: 2026-05-22

## Status

Accepted.

## Context

`pi-agent-vent` stores local diagnostic user data under the operator's Pi data directory. The package now supports confirmation-gated `retention preview|archive|restore`:

- archive removes reviewed recurrence-group records from the active `vents.jsonl` store;
- archive writes a package-created local backup first;
- restore requires the backup, exact derived restore token, real backup-directory containment, and current-store hash match;
- retention receipts and backups are local diagnostics only, not evidence, tasks, issues, incidents, telemetry, publication, or ASC/self state.

The remaining question was whether the package should also expose a hard-delete surface beyond backup-backed archive.

## Decision

Do **not** add an in-package hard-delete action for v0.1.

The accepted package policy is:

1. Backup-backed archive/restore is the only package-owned destructive lifecycle operation for local vent records.
2. Permanent deletion remains operator-owned filesystem/data-lifecycle control, not a package command.
3. The package may document store and backup paths so operators can inspect, back up, or remove local data deliberately.
4. The package must not claim that local deletion resolves evidence, incidents, tasks, issues, telemetry, publication, or owner-system lifecycle.
5. Any future package hard-delete or purge action requires a new decision/design pass covering confirmation, exact affected-artifact preview, backup/receipt semantics, stale-state handling, path/symlink containment, partial-failure rollback, privacy wording, and explicit non-claims about secure erasure.

## Rationale

Hard-delete sounds simple but creates false expectations:

- local deletion is not secure erasure on all filesystems;
- backups and receipts complicate what “deleted” means;
- deleting diagnostic records could be mistaken for deleting canonical evidence or closing owner-system lifecycle;
- accidental deletion has worse recovery posture than archive/restore;
- the package's product promise is reviewable local maintenance signal, not compliance-grade data destruction.

Backup-backed archive already satisfies the near-term product need: keep active review surfaces small while preserving a rollback path.

## Consequences

- `agent_vent retention` may include read-only planning/history projections such as `candidates` and `history`, while `archive|restore` remain the only package-owned mutating lifecycle actions.
- Product docs should describe archive as the destructive package baseline and retention history as a local receipt projection, not evidence or owner-system lifecycle.
- Future review-ergonomics work can proceed without waiting for hard-delete implementation.
- Operators who need permanent removal must use filesystem-level removal of the local store/backups and remain responsible for their own backup, retention, and secure-erasure requirements.

## Authority boundary

This ADR governs only `packages/pi-agent-vent` local diagnostic data behavior. It does not mutate or define policy for AK tasks/evidence, GitHub issues, incident systems, Prompt Vault, ROCS, publication, KES, ASC/self state, or telemetry systems.
