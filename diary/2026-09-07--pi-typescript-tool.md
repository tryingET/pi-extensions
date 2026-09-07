---
summary: "Task 5508 fresh-template TypeScript tool port, review and actual Pi execution."
read_when:
  - "Locating the Pic-derived TypeScript extension and its verification evidence."
type: "implementation"
---

# pi-typescript-tool — fresh template port

Operator requested committing the Pic write-ups, creating a new extension from
pi-extensions-template, updating the scaffold, and porting the earlier spike.

## Observed starting state

Both contrib write-ups were already tracked and clean: deep dive commit
`166647d31`, execution follow-up commit `199d7b68f`. No duplicate commit was made.
The historical spike is preserved at `a0411c361453c082822d9cdb05f177a9948c9f1a`
on `spike/pic-typescript-tool`.

Current canonical checkout was `feat/activity-ribbon-agent-tabs` at
`ecbc51da7edab969b7157c4405485a5fb759b12e`, with extensive unrelated dirty work.
`main` was checked out in another session's decision151-main worktree. No branch
switch, stash, index mutation, commit, merge or push was performed by this port.

## Execution

- Created and claimed AK task 5508.
- Generated `packages/pi-typescript-tool/` using Copier from clean template commit
  `8bcc39a85a62b6b8dc4b96e5879f79b4e97d8192`; retained generated lineage metadata.
- Selectively ported the TypeScript contract/compiler mechanism and fs-only tool;
  customized package docs, prompts, manifests, dependency pins, tests, validation
  and notices. Private package, no release component or publication.
- Fixed the spike's initial invocation timeout and stable symlink escapes; bounded
  normal helper I/O and returned payloads. VM remains trusted-only, not a sandbox.
- Independent reviewer identified decorator-emission and type-wrapper function
  classification bugs. Fixed both, added regression tests, obtained rereview
  approval. No saved-function registry or arbitrary Pi-tool dispatcher added.
- Installed the local package with `pi install`.

## Verified proof

Final controller gate:
`cd packages/pi-typescript-tool && PI_EXTENSIONS_TMPDIR="$TMPDIR" npm run check`.
Passed **42 tests**, lint/typecheck/structure/budgets, **18-file artifact allowlist**
and **nine provider-free packed-artifact checks**. Log:
`/home/tryinget/.local/state/pi-quests/tmp/task5508-final-check.mzxp6R.log`.
An earlier controller documentation check failed for missing system4d metadata;
metadata was corrected and the full gate rerun successfully, not bypassed.

Actual fresh Pi SDK/model/tool loop on Pi 0.84.4 and Node 26.8.1:
four calls/four results/five assistant turns/no retries. Verified combined list +
marker read, wrapped function result 42, decorated class result, and host error
for invalid fs.write. Fixture hashes unchanged. This was real model-driven tool
execution, not mocked registration/direct execute. Evidence and precise limits:
[package verification](../packages/pi-typescript-tool/docs/project/verification.md).
Tester removed its inactive scratch credential copies after proof; sanitized
artifacts remain. Parent's original auth/config was untouched.

## Remaining boundaries

Current controller not reloaded; full-stack/global autodiscovery and live
interruption/session replacement untested. No Node 22 run, sandbox guarantee,
registry publication or claim of main landing. Async CPU loops can still hang Pi;
filesystem guards are not race-proof. These are explicit package limits.

New package and this diary remain uncommitted pending coordination with the
main-worktree custodian, `session-01a0728e-b862-7544-a5bd-f198b710f81d`.
Do not land on the unrelated activity-strip branch or mutate its worktree by
convenience. Implementation/validation and Git landing are distinct statuses.
