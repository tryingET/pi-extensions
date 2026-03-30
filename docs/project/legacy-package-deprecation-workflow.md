---
summary: "Reusable workflow for shutting down legacy standalone extension repos after their canonical home moves into the pi-extensions monorepo."
read_when:
  - "Migrating an extension from ~/programming/pi-extensions/* into this monorepo."
  - "Preparing to archive and delete a legacy standalone extension repo."
  - "Relocating legacy Pi session history to a canonical monorepo package path."
system4d:
  container: "Legacy deprecation workflow for pi-extensions migrations."
  compass: "Move ownership once, preserve useful history, archive exactly once, then delete cleanly."
  engine: "Verify canonical ownership -> classify inventory -> relocate session history -> rewrite handoff -> archive -> validate -> delete."
  fog: "The main failure mode is mixing root-owned assets, package-owned assets, and operator history into an ad-hoc cleanup that cannot be repeated safely."
---

# Legacy package deprecation workflow

## Goal

Provide one repeatable shutdown workflow for legacy extension repos under:

- `~/programming/pi-extensions/*`

Use this **after** canonical work has moved into:

- `~/ai-society/softwareco/owned/pi-extensions/`

This workflow must work for both:

- **simple-package** migrations
- **package-group** migrations

## Core rule

A legacy repo should stop being a development target as soon as the canonical monorepo destination is viable.

From that point on:
- implementation continues only in the canonical monorepo home
- the legacy repo becomes an inventory, archive, and deletion problem
- do not split new feature work across both homes

## Ownership model

Before deleting anything, classify what the canonical destination now owns.

### Monorepo root owns

Examples:
- shared `.github/` workflows and issue templates
- `.githooks/`
- root validation scripts
- monorepo governance and root docs
- cross-package operator prompts such as `.pi/prompts/commit.md`

Reference:
- [Root capabilities](root-capabilities.md)

### Canonical package or package-group owns

Examples:
- runtime code
- package tests
- package docs
- package metadata
- package-local prompts and examples
- package-specific release/validation wrappers

## Topology classification

Decide the canonical destination shape explicitly.

### `simple-package`

Use when one package root is the canonical destination.

Example destination:
- `packages/pi-autonomous-session-control`

Scaffold rule:
- create the canonical package root from `~/ai-society/softwareco/owned/pi-extensions-template/` before porting brownfield code
- use `simple-package` as the canonical scaffold mode for this destination shape
- if an older automation path still says `monorepo-package`, treat it as a compatibility alias for the same one-package monorepo scaffold

### `package-group`

Use when one logical capability now lives as a group root containing multiple related packages.

Example destination:
- `packages/pi-interaction`

## Required workflow

### 1. Verify canonical ownership transfer

Confirm all three are true:

1. canonical runtime code is already in the monorepo
2. package-local validation passes in the canonical home
3. monorepo-root validation passes with the canonical package included

For `simple-package` migrations, the canonical package root must be a **real monorepo package scaffold**, not an ad-hoc copy of the legacy repo.

Operational rule:
- if `packages/<target>` does not exist yet, create it first from `~/ai-society/softwareco/owned/pi-extensions-template/`
- use the package-first monorepo scaffold path with `simple-package`
- `monorepo-package` may still exist as a compatibility alias in some tooling paths, but `simple-package` is the canonical name
- only then port legacy package-owned implementation into that scaffold

Do not start deletion work before this checkpoint.

### 2. Build a structured inventory comparison

Use deterministic, `jq`-friendly inventories.

Required comparison buckets:
- moved to monorepo root
- moved to canonical package
- archive-only context
- runtime/editor junk
- safe to delete

Recommended inventory sources:
- `find ... -type f | sort`
- JSON inventories via `scripts/legacy-package-deprecation.sh inspect ...`
  - includes `sharedRelativeFiles`, `legacyOnlyFiles`, `canonicalOnlyFiles`
  - includes the computed session-relocation plan and recommended action
  - includes a reusable ownership/classification outline for `moved-to-root`, `moved-to-package`, `archive-only`, `runtime-junk`, `safe-to-delete`
- explicit path maps for `legacy path -> canonical destination`

### 3. Classify legacy contents with an explicit checklist

For each notable path in the legacy repo, assign exactly one class.

| Class | Meaning | Typical action |
|---|---|---|
| `moved-to-root` | now owned by monorepo root | verify canonical copy, then delete legacy copy |
| `moved-to-package` | now owned by canonical package/group | verify canonical copy, then delete legacy copy |
| `archive-only` | useful historical context, not live runtime material | preserve via one-shot archive |
| `runtime-junk` | session caches, node_modules, temp dirs, editor noise | exclude from archive when appropriate, then delete |
| `safe-to-delete` | low-value leftovers already superseded | delete after validation |

### 4. Handle legacy Pi session history intentionally

Legacy Pi history must be reviewed explicitly, not ignored.

Inspect:
- `~/.pi/agent/sessions/`

Default policy:
- **relocate** history to the canonical destination path
- only fall back to archive-only handling if relocation semantics are unclear or unsafe

#### Path-based relocation rule

Relocation must be derived from:
- the **actual old absolute path**
- the **actual canonical absolute path**

Do **not** derive the target folder from basename-only matching.

Example:
- old: `/home/tryinget/programming/pi-extensions/pi-autonomous-session-control`
- new: `/home/tryinget/ai-society/softwareco/owned/pi-extensions/packages/pi-autonomous-session-control`

The session folder name should be computed from the full canonical path, not just `pi-autonomous-session-control`.

#### Observed folder-name normalization

Current Pi session directories under `~/.pi/agent/sessions/` use an observed cwd-derived pattern like:

```text
--home-tryinget-programming-pi-extensions-pi-autonomous-session-control--
```

Operational rule for migrations:
- replace `/` path separators with `-`
- preserve the full absolute path information in the derived folder name
- keep the surrounding `--...--` envelope used by existing session directories

Because this is path-derived, semantic renames are preserved correctly.

#### Relocation checklist

1. compute old session dir name from old canonical path
2. compute new session dir name from new canonical path
3. verify old dir exists
4. verify new dir does not already contain conflicting history, or merge intentionally
5. rename/move the directory
6. sanity-check a few session files after relocation
7. record the relocation in the migration notes

Fallback only if needed:
- if safe relocation cannot be proven, archive the old session-history directory with the repo archival material and record the downgrade decision explicitly

### 5. Rewrite the legacy handoff before deletion

The legacy repo's `next_session_prompt.md` must become a short deprecation handoff.

It should say:
- canonical monorepo root path
- canonical package/group path
- implementation must not continue in the legacy folder
- legacy repo is pending archive-and-delete workflow only

Helper option:
- `scripts/legacy-package-deprecation.sh render-handoff ...` prints a reusable deprecation handoff body that can be dropped into `next_session_prompt.md`

### 6. Create exactly one archival artifact

Use one final archive artifact for the legacy repo:

- `tar.gz`

Rules:
- create exactly one final archive snapshot
- do not create iterative backup folders inside the repo
- do not leave ad-hoc `backup/`, `backup-2/`, `final-final/` directories behind
- archive should represent the final legacy state at deletion time

Suggested contents:
- archive-only docs/context
- rewritten legacy handoff
- any remaining metadata worth preserving

Suggested exclusions when safe:
- `node_modules/`
- temp dirs
- ephemeral editor junk
- regenerated caches

### 7. Delete only after validation and archive verification

Required pre-delete checks:

1. canonical package validation passes
2. monorepo root validation passes
3. one-shot `tar.gz` archive exists
4. archive was sanity-checked
5. Pi session history was either relocated successfully or explicitly downgraded to archive handling
6. legacy handoff was rewritten to point to the canonical home

Only then should the legacy repo be removed.

## Reusable operator checklist

### For `simple-package` migrations

- [ ] canonical destination identified under `packages/<name>`
- [ ] root-owned assets verified at monorepo root
- [ ] package-owned assets verified at canonical package root
- [ ] inventory diff created
- [ ] legacy paths classified
- [ ] Pi session history relocated using `old absolute path -> new absolute path`
- [ ] legacy `next_session_prompt.md` rewritten as deprecation handoff
- [ ] one-shot `tar.gz` archive created and checked
- [ ] canonical package validation passes
- [ ] monorepo root validation passes
- [ ] legacy repo deleted

### For `package-group` migrations

- [ ] canonical group root identified under `packages/<group-name>`
- [ ] root-owned assets verified at monorepo root
- [ ] group-root assets verified
- [ ] child package ownership verified
- [ ] inventory diff created
- [ ] legacy paths classified with `root vs group-root vs child-package` ownership
- [ ] Pi session history relocated using `old absolute path -> new absolute path`
- [ ] legacy `next_session_prompt.md` rewritten as deprecation handoff
- [ ] one-shot `tar.gz` archive created and checked
- [ ] canonical group/package validation passes
- [ ] monorepo root validation passes
- [ ] legacy repo deleted

## Recommended command skeleton

```bash
# 1. validate canonical home
cd ~/ai-society/softwareco/owned/pi-extensions/packages/<target>
npm run check

cd ~/ai-society/softwareco/owned/pi-extensions
./scripts/ci/full.sh

# 2. inspect legacy vs canonical paths in a jq-friendly form
./scripts/legacy-package-deprecation.sh inspect \
  --legacy ~/programming/pi-extensions/<legacy> \
  --canonical ~/ai-society/softwareco/owned/pi-extensions/packages/<target>

# 3. render the legacy handoff body before deletion
./scripts/legacy-package-deprecation.sh render-handoff \
  --legacy ~/programming/pi-extensions/<legacy> \
  --canonical ~/ai-society/softwareco/owned/pi-extensions/packages/<target>

# 4. dry-run the Pi session-history relocation
./scripts/legacy-package-deprecation.sh relocate-sessions \
  --legacy ~/programming/pi-extensions/<legacy> \
  --canonical ~/ai-society/softwareco/owned/pi-extensions/packages/<target>

# 5. execute relocation once verified
./scripts/legacy-package-deprecation.sh relocate-sessions \
  --legacy ~/programming/pi-extensions/<legacy> \
  --canonical ~/ai-society/softwareco/owned/pi-extensions/packages/<target> \
  --execute

# 6. archive once
cd ~/programming/pi-extensions
tar -czf <legacy>-final-archive.tar.gz <legacy>
```

Treat the command block as a skeleton only; always apply the classification and verification steps above.

## Non-goals

This workflow does not yet guarantee:
- automatic inventory classification
- automatic safe merge of conflicting session-history directories
- automatic archive creation/deletion orchestration end-to-end

Those can be scripted later once enough migrations confirm the contract.

## Recommendation

Use this workflow as the default playbook for future migrations from:
- `~/programming/pi-extensions/*`

If repeated a few times without surprises, promote the stable parts into:
- a helper script
- template/operator docs in `pi-extensions-template`
- root validation or migration tooling
