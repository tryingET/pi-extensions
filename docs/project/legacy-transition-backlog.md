---
summary: "Disposition ledger for legacy standalone extension repos formerly under ~/programming/pi-extensions/."
read_when:
  - "Checking whether legacy standalone pi-extension repos still need migration or cleanup."
  - "Confirming the former programming/pi-extensions workspace disposition."
system4d:
  container: "Legacy disposition ledger for pi-extensions."
  compass: "Keep canonical work in the monorepo and do not revive deleted standalone repos."
  engine: "Check ledger -> use canonical package/owner -> recreate only through a fresh owner decision."
  fog: "Reviving deleted standalone repos would split package ownership again."
---

# Legacy transition backlog

## Current status

`~/programming/pi-extensions/` was deleted after the package-like legacy working copies were either canonicalized or explicitly discarded. There are no remaining migration targets in that workspace.

## Disposition ledger

| Legacy repo | Former/current package name | Canonical/disposition status |
|---|---|---|
| `issue-tracker` | unknown/no package manifest detected | legacy workspace deleted; legacy sessions merged into `~/ai-society/softwareco/infra/issue-tracker` session history |
| `pi-autonomous-session-control` | `@tryinget/pi-autonomous-session-control` | canonicalized at `packages/pi-autonomous-session-control`; legacy workspace deleted |
| `pi-evalset-lab` | `@tryinget/pi-evalset-lab` | canonicalized at `packages/pi-evalset-lab`; legacy workspace deleted |
| `pi-little-helpers` | `@tryinget/pi-little-helpers` | canonicalized at `packages/pi-little-helpers`; legacy workspace deleted |
| `pi-user-prompt-compaction` | `pi-user-prompt-compaction` | canonical successor is `packages/pi-session-compaction`; legacy workspace deleted; legacy sessions merged into the canonical package session history |
| `secure-package-update` | `@tryinget/secure-package-update` | discarded with deleted legacy workspace; no canonical package selected |
| `system4d-intake-workflow` | `system4d-intake-workflow` | discarded with deleted legacy workspace; no canonical package selected |
| `vault-client` | `@tryinget/vault-client` | canonicalized at `packages/pi-vault-client`; legacy workspace deleted |

## Rule for future work

Do not resume implementation in a deleted standalone folder.

For package work, use the canonical monorepo package under `packages/`. For `secure-package-update` or `system4d-intake-workflow`, create a fresh canonical package from `~/ai-society/softwareco/owned/pi-extensions-template/` only after an explicit owner decision that the capability should return.

No local `~/programming/pi-extensions/*-final-archive.tar.gz` recovery path remains after the parent workspace deletion.
