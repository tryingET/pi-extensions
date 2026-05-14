---
summary: "Disposition ledger for legacy standalone extension repos formerly under ~/programming/pi-extensions/."
read_when:
  - "Checking whether legacy standalone pi-extension repos still need migration or archive cleanup."
  - "Planning any future recovery from a legacy archive."
system4d:
  container: "Legacy disposition ledger for pi-extensions."
  compass: "Keep canonical work in the monorepo and treat legacy archives as read-only history."
  engine: "Check ledger -> use canonical package/owner -> recover from archive only through a fresh owner decision."
  fog: "Reviving archived standalone repos would split package ownership again."
---

# Legacy transition backlog

## Current status

There are no active package-like legacy working copies left under `~/programming/pi-extensions/` after the archive cleanup.

Remaining utility/template directories there are not migration targets:

- `.pi/`
- `_legacy-backups/`
- `_template-smoke/`
- `pi-extensions-template_copier/`

## Disposition ledger

| Legacy repo | Former/current package name | Canonical/disposition status |
|---|---|---|
| `issue-tracker` | unknown/no package manifest detected | archived to `~/programming/pi-extensions/issue-tracker-final-archive.tar.gz`; legacy sessions merged into `~/ai-society/softwareco/infra/issue-tracker` session history |
| `pi-autonomous-session-control` | `@tryinget/pi-autonomous-session-control` | canonicalized at `packages/pi-autonomous-session-control`; legacy archive exists at `~/programming/pi-extensions/pi-autonomous-session-control-final-archive.tar.gz` |
| `pi-evalset-lab` | `@tryinget/pi-evalset-lab` | canonicalized at `packages/pi-evalset-lab`; archived to `~/programming/pi-extensions/pi-evalset-lab-final-archive.tar.gz`; legacy working copy removed |
| `pi-little-helpers` | `@tryinget/pi-little-helpers` | canonicalized at `packages/pi-little-helpers`; legacy archive exists at `~/programming/pi-extensions/pi-little-helpers-final-archive.tar.gz` |
| `pi-user-prompt-compaction` | `pi-user-prompt-compaction` | canonical successor is `packages/pi-session-compaction`; archived to `~/programming/pi-extensions/pi-user-prompt-compaction-final-archive.tar.gz`; legacy sessions merged into the canonical package session history |
| `secure-package-update` | `@tryinget/secure-package-update` | archive-only cleanup; archived to `~/programming/pi-extensions/secure-package-update-final-archive.tar.gz`; no canonical package selected |
| `system4d-intake-workflow` | `system4d-intake-workflow` | archive-only cleanup; archived to `~/programming/pi-extensions/system4d-intake-workflow-final-archive.tar.gz`; no canonical package selected |
| `vault-client` | `@tryinget/vault-client` | canonicalized at `packages/pi-vault-client`; legacy archive exists at `~/programming/pi-extensions/vault-client-final-archive.tar.gz` |

## Rule for future work

Do not resume implementation in an archived standalone folder.

For package work, use the canonical monorepo package under `packages/`. For `secure-package-update` or `system4d-intake-workflow`, create a fresh canonical package from `~/ai-society/softwareco/owned/pi-extensions-template/` only after an explicit owner decision that the capability should return.

If historical context is needed, inspect the relevant `*-final-archive.tar.gz` read-only and port only the specific files required into a canonical owner surface.
