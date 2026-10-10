---
summary: "Single current-status entrypoint for AK6634 delivery, receiver limits and task/evidence routing; historical reports are not current authority."
task_id: 6634
read_when:
  - "Checking current Clipper deployment or choosing a follow-up task."
---

# Clipper current status

Observed 2026-10-10. This page is a projection, not task authority. Read the
current `ak task show`, `ak task contract show` and `ak evidence task` outputs
before execution. A historical passing check is not continuing live proof.

## Deployment and use

Pi selects the canonical `packages/pi-obsidian-clipper`, not the original
AK6634 candidate. PRs #230–233 are merged; #233 includes the AK6873 closeout docs
and the browser/dependency/native qualification work. Subsequent reconciliation
and the AK6871 qualification addendum landed and were checked-hook pushed at
`3803ccabb70310573b070e81a11154d04df714d7` (evidence **14771**).
The earlier unpushed `4c1c87f0e` docs are therefore already delivered; do not push
that old commit again. No publication is authorized by this status page.

The adapter provides explicit `status`, `setup`, `help` and native extract.
See [README](../../README.md) for trusted configuration and invocation details.
Native extraction is **no-save**. It returns untrusted Markdown evidence.
On Node below 25, extraction refuses by default: an explicitly accepted
in-process network guard is weaker than Node's native network permission.
See [native closure contract](2026-10-10-ak6872-native-closure-contract.md) for
same-UID/TOCTOU, SQLite and non-sandbox assumptions.

The default workstation declaration remains an October 4 snapshot. Setup rejects
a stale declaration; an owner-generated read-only export is needed for a fresh
preview. Isolated Chromium proof does **not** configure a personal profile.
The official Interpreter sends text only. Opt-in page images exist only in the
tracked patched build, not the Web Store build; see
[patch recipe](../../upstream-patches/obsidian-clipper-6d56d618/README.md).

## Work and evidence map

Task states below were observed on 2026-10-10; consult AK for changes.

| Work | Observed disposition | Evidence / detailed qualification |
| --- | --- | --- |
| AK6634 original delivery | Open; terminal acceptance remains the operator's decision | 14605/14606 delivery/receiver; 14621 delivery CI |
| AK6856 host/TypeBox repair and AK6873 handback | Both done; separately explicit operator takeover, no repair reapplication | 14641 and 14656 |
| AK6870 browser Interpreter | Isolated-browser qualification recorded; task still open | 14665/14666; [report](2026-10-10-ak6870-browser-qualification.md) |
| AK6871 compiler/dependencies | TS7/tsx qualified, adapter audit clear; native DOMPurify disposition separate; task still open | 14763/14771/14775; [dossier](2026-10-10-ak6871-dependency-qualification.md) |
| AK6872 closure/transport | Enforcement and real receiver proof delivered; task still open | 14668/14671; [contract](2026-10-10-ak6872-native-closure-contract.md) |
| AK6888 note images / AK6889 optional Interpreter images | Qualification and tracked patch delivered; both tasks still open | 14680/14681; [image findings](2026-10-10-ak6888-image-handling.md) |
| AK6898 test/custody/documentation debt | Candidate focused checks pass; reversible quarantine done; full gates/landing blocked pending disk capacity | `ak evidence task 6898`; custody 14841; [fixture contract](../../tests/fixtures/README.md) |

## Limits and unresolved findings

- Personal browser profiles, other browser families, future authentication
  changes and real-world patched image payloads are not covered by the isolated
  browser observation. Later follow-up work must publish its own receipts.
- Images are remote Markdown links, not imported files. The Wikipedia lazy-image
  `/wiki/File:` issue and 32 KiB native output limit are separate findings, not
  promises fixed by the hidden-debt test changes.
- Native dependency trust checks and Node permission boundaries are not a
  security certificate or OS sandbox. Keep the documented exceptions explicit.
- AK6634 completion, follow-up task completion and upstream publication require
  their own authority; this consolidation performs none of them.

## Historical evidence, not a second current-status page

Preserved reports retain the original observations, including stale blockers and
superseded text-only/deferred-work decisions. Start here, then read the exact
receipt/report needed:

- [October 4 adapter/native evidence](ak6634-evidence.md)
- [October 10 continuation checkpoints](2026-10-10-ak6634-continuation.md)
- [Initial grouped disposition](2026-10-10-atomic-completion.md)
- [AK6856 repair diary](../../diary/2026-10-10--fix-pi110-host-peer-ak6856.md)

Retained worktrees/stash are evidence custody, not installed runtime sources.
AK6898 custody evidence **14841** records reversible quarantine beneath
`~/.local/state/pi-quests/quarantine/AK6898/`: the complete original
`pi-obsidian-clipper-ak6634` and `ak6856-clipper-host.6LBZ27` directories remain
there with branches, ignored installs and proofs intact. Git worktree registrations
were repaired. The old stash object was already absent from the live stash list;
it is now pinned by `refs/quarantine/AK6898/stash48c096c3` to prevent collection.
Move roots back and use `git worktree repair` to restore paths; apply the stash
only in an owner-authorized isolated worktree. No proof was deleted, and quarantine
freed no capacity. Holder checks found no references among inspectable processes;
eight protected desktop/system processes were not inspected. The original
AK6634 owner explicitly released custody; this is not exhaustive process proof.
