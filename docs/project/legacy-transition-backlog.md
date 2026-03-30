---
summary: "Current backlog of legacy standalone extension repos still expected to transition into the pi-extensions monorepo."
read_when:
  - "Planning the next legacy-package migration from ~/programming/pi-extensions/."
  - "Prioritizing remaining standalone repos after a canonical package move."
system4d:
  container: "Legacy transition backlog for pi-extensions."
  compass: "Use one reusable migration/deprecation workflow across the remaining standalone repos."
  engine: "Pick next package -> create canonical home -> validate -> deprecate legacy repo with the standard workflow."
  fog: "Without an explicit backlog, transition work becomes opportunistic and package shutdowns drift."
---

# Legacy transition backlog

## Decision

Because there are multiple remaining standalone repos to transition, the highest-leverage next step is to standardize the migration/deprecation workflow instead of handling each repo ad hoc.

That workflow now lives in:
- [legacy-package-deprecation-workflow.md](legacy-package-deprecation-workflow.md)
- `scripts/legacy-package-deprecation.sh`

## Remaining standalone repos to transition

These appear to be the active remaining candidates under `~/programming/pi-extensions/`, excluding:
- already transitioned: `pi-autonomous-session-control`
- already represented in monorepo: `pi-prompt-template-accelerator`
- non-target utility/template dirs: `.pi`, `_legacy-backups`, `_template-smoke`, `pi-extensions-template_copier`

| Legacy repo | Current package name | Canonical status |
|---|---|---|
| `issue-tracker` | unknown/no package manifest detected | not yet transitioned |
| `pi-evalset-lab` | `pi-evalset-lab` | not yet transitioned |
| `pi-little-helpers` | `@tryinget/pi-little-helpers` | not yet transitioned |
| `pi-user-prompt-compaction` | `pi-user-prompt-compaction` | not yet transitioned |
| `secure-package-update` | `@tryinget/secure-package-update` | not yet transitioned |
| `system4d-intake-workflow` | `system4d-intake-workflow` | not yet transitioned |
| `vault-client` | `@tryinget/vault-client` | not yet transitioned |

## Recommended execution rule

For the remaining set, do this per package:

1. choose the next canonical package or package-group shape
2. migrate into `~/ai-society/softwareco/owned/pi-extensions/packages/...`
3. validate the canonical home
4. run the legacy deprecation workflow
5. relocate Pi session history using full-path-derived folder names
6. archive once with `tar.gz`
7. delete the legacy repo

## Recommendation

Do **not** try to archive/delete all seven manually from memory.

Use the helper script first (inventory diff + session relocation plan + handoff rendering):

```bash
cd ~/ai-society/softwareco/owned/pi-extensions
./scripts/legacy-package-deprecation.sh inspect \
  --legacy ~/programming/pi-extensions/<legacy> \
  --canonical ~/ai-society/softwareco/owned/pi-extensions/packages/<target>
```

Then apply the standard workflow doc before deletion.
