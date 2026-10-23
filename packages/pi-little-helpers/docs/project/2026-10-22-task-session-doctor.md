---
summary: "AK7390 diagnostic-only doctor: bounded unverified observations and a separate identity-reconciliation proposal."
read_when:
  - "Diagnosing namespace_identity_changed without changing admission or retained custody."
  - "Distinguishing source-tested diagnostics from authorized live identity recovery."
system4d:
  container: "Fixed account-local diagnostic observations, not admission or migration."
  compass: "Useful diagnosis with unchanged identity and custody conditions."
  engine: "Bounded no-follow reads, consistency checks and synthetic verification."
  fog: "Historical continuity, effects and live authorization remain unverified."
---

# Task-session doctor — diagnostic source candidate

## Release boundary

AK7390's current done contract and guardrails, D151 `post_adr_execution` reevaluation
(receipt18862) and authorization-record evidence16629 release source/tests/docs only.
They do not authorize canonical landing, installation/publication, namespace migration,
profile changes, historical-attempt retirement, worker launch or task completion.
Evidence16629 records permission, not passing behavior. Current authority must be read
from AK; this document is not a continuing authorization.

## Interface and interpretation

The additive CLI operation is `pi-task-session doctor`; the emitted public core exports
`taskSessionDoctor()` with no parameters. This slice does not add a Pi tool operation.
CLI `--help` discovers it. Extra arguments, including `--repair`, refuse with exit2.
A successfully emitted diagnostic report exits0 **even when it contains problems**.
Do not interpret its exit status as admission, continuity, custody or fitness for use.

The `pi.task-session.doctor.v1` report contains:

- `status`: `observed`, `incomplete` or `inconsistent`; never an admission verdict.
- `authority:false`, `admissionAssessed:false`, `repairPerformed:false`.
- `continuity:"unverified"`, `custody:"unverified"`, including when coordinates match.
- Expected/observed root and lock device/inode coordinates (decimal strings).
- A raw-byte locator digest and safely available state digest/generation/counters.
- At most32 attempt summaries, preferring unresolved entries, with hashed attempt/incarnation
  references, task IDs and independent host/effect/claim flags. Omission count and total
  unresolved count remain explicit. State provenance is always `unverified`.
- Allowlisted issues, hypotheses, limitations and named owner actions, not raw exceptions.

A device-only mismatch with matching inode numbers may suggest
`device_number_change_possible`; `replacement_or_restore_not_excluded` remains explicit.
An inconsistent read discards identity/state/digest/hypothesis projections rather than
presenting a mixed-time report. A stable read is not a transaction or writer exclusion.

The fixed OS-account locator and namespace paths are used, not caller HOME/XDG/cwd or
profile overrides. No paths from state domains are opened. On Linux x86_64, directory
components are pinned individually with `O_DIRECTORY|O_NOFOLLOW`, including ancestors.
Leaf objects are pinned with `O_PATH|O_NOFOLLOW` BEFORE regular-file/private identity
checks. Only a verified regular inode is reopened for reading through its own held
`/proc/self/fd` reference and checked again; the candidate pathname is never reopened
for data. A FIFO/device is not opened for IO, even across substitution after a check.
Reads are limited to1MiB per JSON file; at most128 read-only/path descriptors and64 path
components are allowed. Opened objects and their named
edges are rechecked, and JSON bytes are read twice. All descriptors close on success or
refusal. Unsafe/missing root or lock leaves state unobserved; a safe object whose saved
coordinates differ can still supply explicitly unverified diagnostic evidence.

Node22.23.3 and26.9.0 do not export `fs.constants.O_PATH`. The Linux x86_64 UAPI value
is `1 << 21` (`010000000` in glibc's `bits/fcntl-linux.h`; also
`asm-generic/fcntl.h`). Numeric pass-through is not assumed: before any candidate leaf,
a per-observation runtime probe must pin the procfs symlink for an already-held directory
as a symlink and a read on that path-only FD must fail with `EBADF`. Dropped/unsupported
flags fail closed before leaf access. The probe uses only its own kernel FD reference,
never a candidate device. Tests exercise the real mechanism on both Node versions and
simulate ignored flags. This is not portability proof for other architectures.

There is no namespace mutex acquisition, write/create/rename/unlink, directory scan,
AK invocation, provider request, terminal launch, profile/credential/transcript read,
repair flag, subprocess-based filesystem probe or automatic retry. The strict admission,
classification and existing inspection readers are unchanged.

## Confirmed defect versus probable historical cause

The pre-repair public `inspect` shares `readSnapshot` with admission. Its namespace
root/lock device/inode checks run before state history is read. Consequently, a namespace
identity refusal also hides retained-state inspection, leaving only an error code; installed
classification correctly remains unknown. The old hardening regression covers checkout/Git
topology replacement, not a changed namespace-root/lock device number.

Bounded observation on2026-10-22 found saved device57/current37 for the namespace root,
permanent lock and enrolled checkout/Git directory, with matching recorded inode numbers.
The current Btrfs mount and previous/current boot journals identify the same filesystem;
current namespace and checkout have the same subvolume ID. Provisioning predates the
current boot. This supports reboot-related device-number reassignment as a hypothesis,
not proof that the old and current objects are continuous. The v1 locator lacks historical
filesystem/subvolume UUID and boot identity. Snapshot restore, replacement, aliases,
unrecorded writers and effects cannot be ruled out using inode numbers alone.

Doctor repairs **diagnostic availability**, not this live identity mismatch. Rewriting
57 to37, ignoring device numbers or reinitializing an empty namespace would be unsafe.
A locator-only rewrite would also leave stored domain identities stale. Retained r2
host/effect/claim uncertainty remains unchanged even if its AK task is now unclaimed.

## Separate proposal to resolve identity/recovery

The following is a proposed owner workflow, not an implemented or authorized command:

1. Preserve the exact locator, permanent lock and complete state/history with owner-held
   hashes, generation and custody evidence. Do not copy credentials into source or reports.
2. Obtain owner-correlated pre/post-boot filesystem/subvolume identity and restore/migration
   history. Current UUIDs, inode numbers, boot logs and path matches are supporting evidence,
   not proof of absence of replacement or restoration. If continuity cannot be established,
   retain the block and route that exact uncertainty to the namespace/filesystem owner.
3. Establish actual admission/namespace writer and queued/restart-route custody. D151
   RFC03 §6 permits only offline migration after admissions/writers stop. A temporarily
   free kernel lock or another worktree does not establish this condition.
4. Specify and independently inspect an evidence-bound reconciliation procedure: exact
   expected input digests/generation, independently supported current physical identities,
   preserved permanent lock and original metadata, all domain/attempt bindings accounted
   for, concurrent-change refusal and crash-consistent publication. Old history must remain
   inspectable after interruption/rollback. Never clear retirement flags as a migration side effect.
5. Obtain separate exact authorization for implementation/application/publication as needed.
   Diagnostics fit the accepted D151 repair scope; a material change to identity assurance,
   custody, recovery or owner allocation requires its decision process. New command syntax
   alone does not require architectural reopening.
6. Rehearse the approved procedure on synthetic cases, including interrupted publication,
   restored old snapshots, replaced lock/root, aliases and competing writers. A green
   source suite is not evidence that the real filesystem is continuous.
7. Apply only through the approved owner route, then independently read back the exact
   resulting state and unchanged retained history. Stop on any uncertain application.
   Host future-dispatch closure, started-effect disposition and AK claim disposition remain
   separate owner operations; no automatic retirement, unclaim or relaunch.

Profile/inventory repair and requested worker launches are not included in this task slice.
Withdrawal/rollback must retain a compatible inspector, not recreate an empty namespace or
restore unsafe legacy fallback. Poor diagnosis creates bypass pressure; this doctor makes
missing evidence explicit without converting confidence into authority.

## Verification and effects

The Gherkin-named synthetic cases are in `tests/task-session-doctor.test.mjs`. They exercise
actual emitted CLI/core code against private scratch accounts, with an unpublished test
loader replacing OS account discovery. No production root override is introduced.
Cases cover device/inode drift, safe unverified history, root/lock substitution, unsafe
ancestors and files, hardlinks, permissions/ownership, missing/withdrawn/malformed/oversized
configuration, ancestor/root/lock/locator/state races, differing second-read bytes,
privacy-safe exceptions, FD cleanup, bounded output, and unchanged strict-reader refusal.

Initial pre-implementation red:24 failures (missing core export/unsupported CLI). First
implementation run:23 pass/1 fail; the wrong-owner fixture contradicted its own fd/path
observations. The fixture was corrected to present the same wrong owner to both readers,
without changing the expected refusal. Original red, intermediate failure and corrected
source are retained in the controller's owned receipt directory. Additional adversarial
cases are subsequent coverage, not retroactively claimed pre-implementation red tests.

Independent inspection of source candidate v1 found a P2 effect violation: opening a leaf
`O_RDONLY|O_NONBLOCK` before rejecting its kind can release a blocked FIFO writer (or
invoke a device driver). Real isolated FIFO tests reproduced this: two failures before
the repair, with the writer demonstrably blocked in the kernel before doctor ran. The
`O_PATH` repair keeps that writer blocked for existing-FIFO and before-open substitution,
and keeps a replacement FIFO untouched after a regular metadata pin. No live device was
tested. Candidate v2 has35 focused cases passing on Node22.23.3 and26.9.0; these source
results do not certify the real namespace or count as installed proof.

Build audit: `task-session:build` emits ignored artifacts inside this worktree's helpers and
orchestrator packages, compiles the private native bridge, and creates/removes its own
TMPDIR emit scratch. Dependency setup used `npm ci --ignore-scripts` only inside owned
scratch, with a private npm cache. Tests use synthetic state, mocked effects or private
local child fixtures; production CLI tests prohibit subprocess/provider effects.
Broader checks and independent inspection must be reported with exact exits/receipts;
this source document does not assert they have passed or that anything was installed.
