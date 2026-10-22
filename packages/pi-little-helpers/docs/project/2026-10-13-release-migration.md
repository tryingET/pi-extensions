---
summary: "LH 0.12.0 release target: native original-child attachment hosting and breaking observer-command migration, without worker enrollment."
read_when:
  - "Upgrading little-helpers from 0.11.x alongside ASC native subagent tabs."
type: "reference"
system4d:
  container: "Versioned little-helpers npm migration notes; worker/profile configuration excluded."
  compass: "Make command removals and artifact identity changes explicit before upgrade."
  engine: "Qualified tagged build -> same-wave exact npm artifact -> coordinated package reload."
  fog: "Registry availability is not worker/profile enrollment or arbitrary GUI qualification."
---

# Little-helpers 0.12.0 migration

Release target, not a publication receipt. Operator authorized npm artifact qualification/publication
under AK7076; installed Decision151 worker/profile configuration and retained runtime state are out
of scope and remain untouched.

## Breaking CLI migration

`/subagent-observer` is removed. With compatible ASC installed, use
`/subagents diagnose observer` to explicitly open/arm the detached read-only troubleshooting observer;
`/subagents diagnose observer status` inspects without arming or launching. Ordinary use is the sole
ASC `/subagents` controller command: default running tabs, `<name>` for one child, `status` for counts.
The legacy dashboard overlay is removed. Reload existing controllers after updating both packages.

## Transport and artifact boundaries

The standard sidequest projection hosts native view-only Pi attachment tabs for original ASC attempts
through bounded owner callbacks; it does not clone execution or import ASC's private runtime.
Duplicate eligible listeners share fences; stale/malformed/uncertain requests fail closed without
fallback or automatic retry. Attachment-only shell transport uses fail-closed exec rather than
retaining an executable debug shell after abnormal viewer exit. Other peer transports are unchanged.

Diagnostic observer requests have exact TUI/session/cwd scope, a fixed content-free event shape,
process-wide original-object duplicate fencing, and shutdown/context migration guards. Manual observer
opening and native cancellation have source checks but were not exercised in the latest installed
command-consolidation trial; that trial verifies observer status remains idle.

Packing rebuilds emitted task-session artifacts and changes their identities. Fresh build hashes,
closure and packed-artifact checks are required. Preserving old canonical compiled files is not
qualification of the new tarball. Npm publication does not replace separately published worker/host
pins, producer bindings, profiles or namespace enrollment, and does not retire retained-r2 effects.
Do not use the release as task5482 completion or operational pilot evidence.

## Rollback

Use the previous compatible ASC/LH version pair and coordinate reload/restart; preserve private
reservations, attempt history and custody uncertainty. Do not re-enroll, rewrite worker/profile
bindings, remove locks, cancel children or reset observer launch slots as a package rollback shortcut.
Existing operational owners retain any required worker-publication/rollback duties independently.
