---
summary: "Salvage and integration plan for upstream `pi-rewind-hook`: keep the exact git snapshot/restore mechanics, land the AI Society version under ASC as the execution-plane owner, and project bounded recovery milestones into Replay Fabric instead of adopting the upstream extension as a second authority surface."
read_when:
  - "You are deciding whether to adopt `softwareco/contrib/pi-rewind-hook` directly or reimplement it inside AI Society-owned runtime surfaces."
  - "You need the shortest truthful plan for rewind-style snapshots/restores that stays aligned with the AI Society stack map and runtime authority matrix."
system4d:
  container: "ASC-owned rewind integration plan spanning execution-plane runtime behavior and Replay Fabric recovery projection."
  compass: "Reuse the strong exact-restore mechanics without introducing a second execution/runtime authority beside ASC."
  engine: "inspect upstream reference -> separate salvageable mechanics from authority model -> place the owned implementation in the correct stack layer -> define bounded projection into Replay Fabric."
  fog: "The main risk is copying the upstream extension wholesale and accidentally turning hidden Pi session entries into a second canonical runtime surface outside ASC and Replay Fabric."
---

# Rewind salvage and integration plan

## Decision in one screen

Do **not** adopt `softwareco/contrib/pi-rewind-hook` as the AI Society runtime surface.

Instead:

1. keep the contrib clone as a **reference implementation**
2. salvage its **git snapshot / dedupe / exact restore** mechanics
3. implement the AI Society version **inside ASC** (`pi-autonomous-session-control`), because the stack map places Pi-side execution/runtime behavior there
4. emit only **bounded recovery milestones** into Replay Fabric, because Replay Fabric owns replayable recovery history and guidance, not restore execution
5. consider extracting a separate owned rewind package **only if a second real runtime consumer appears**

Reference inspected:
- repo: `/home/tryinget/ai-society/softwareco/contrib/pi-rewind-hook`
- upstream: `https://github.com/nicobailon/pi-rewind-hook`
- inspected revision: `357671a555326b401c1638a1ced7bcbe74245bf2`

## Why this placement is correct in AI Society

Per the stack map and runtime authority matrix:

- **ASC** owns the **execution/runtime package layer** for Pi-side runtime behavior
- **pi-society-orchestrator** owns coordination/control-plane behavior, not restore execution
- **Replay Fabric** owns durable replay/recovery history and bounded guidance, not restore execution
- **AK / governance layers** should not absorb ordinary local file rewind as if it were society-state authority

So the owned rewind implementation should live where the stack already says runtime-local execution behavior belongs: **ASC**.

## What is strong in upstream `pi-rewind-hook`

The upstream extension is a good technical reference, especially in `index.ts` and `index.test.ts`.

### 1. Exact worktree capture without mutating the real git index

The best salvage candidate is the temp-index capture model:

- set `GIT_INDEX_FILE` to a temp path
- run `git add -A`
- run `git write-tree`
- materialize a snapshot commit with `git commit-tree`

This gives exact snapshots of:
- tracked files
- untracked, non-ignored files

while avoiding accidental mutation of the repo's real index.

### 2. Tree-SHA deduplication

Before creating a new snapshot commit, upstream checks whether the current tree SHA matches the latest exact snapshot tree.
If so, it reuses the existing snapshot commit.

This should be preserved in the owned version.

### 3. Exact restore flow

The restore behavior is strong and should be kept conceptually intact:

- capture the current tree as the undo baseline
- compute deleted paths between current and target tree
- remove paths that exist in current but not in target
- restore the target commit into the worktree only

This is the core of the salvage.

### 4. Single keepalive ref instead of one ref per checkpoint

Using a single repo-local ref for object reachability is a good storage model:

```text
refs/pi-rewind/store
```

That ref should stay an implementation detail for git object retention, not the semantic authority surface.

### 5. Cross-session / parent-session lineage lookup

Upstream's session-lineage reconstruction is useful as a pattern:
- current session lookup
- resumed session lookup
- fork lineage traversal through `parentSession`

We should keep the idea, but move ownership into ASC-owned rewind metadata.

## What must not be adopted as-is

### 1. The upstream extension must not become a second execution owner

Adopting the package as-is would create a separate extension-owned rewind authority beside ASC.
That conflicts with the AI Society stack map.

The problem is not the git mechanics.
The problem is the **authority placement**.

### 2. `install.js` should not be reused

Discard the installer model that:
- downloads raw files from GitHub `main`
- writes directly to `~/.pi/agent/extensions/rewind`
- mutates `~/.pi/agent/settings.json`

That is a convenience installer, not an AI Society-owned package lifecycle.

### 3. Upstream hidden session entries should not become our long-term public contract

Upstream writes hidden session entries such as:
- `rewind-turn`
- `rewind-op`
- `rewind-fork-pending`

The pattern is useful, but the names and schema should not become our stack contract by accident.

### 4. Ad hoc interop flags should not be treated as stable owned seams

Examples such as boomerang-specific globals are acceptable upstream shortcuts but should not become our long-term package contract without explicit owner review.

## Recommended owned architecture

## A. Keep rewind execution in ASC

Implement an ASC-owned rewind slice under package-local runtime ownership, for example:

```text
extensions/self/rewind/
  git-snapshot.ts
  keepalive-store.ts
  exact-restore.ts
  session-ledger.ts
  retention.ts
  event-hooks.ts
  replay-fabric-projection.ts
```

Target ownership split:

- `git-snapshot.ts` — temp-index capture, tree SHA calculation, snapshot creation
- `keepalive-store.ts` — keepalive ref management and live-set rewrites
- `exact-restore.ts` — restore/undo mechanics
- `session-ledger.ts` — ASC-owned session bindings and lineage lookup
- `retention.ts` — optional retention / live-set computation
- `event-hooks.ts` — Pi event integration (`turn_start`, `turn_end`, `/fork`, `/tree`, compaction aliases, resume/fork initialization)
- `replay-fabric-projection.ts` — bounded milestone emission into Replay Fabric

## B. Keep session metadata, but make it ASC-owned

Do not throw away the idea of session-native metadata.
It is appropriate for Pi-local execution continuity.

But the owned version should:
- write ASC-owned rewind metadata, not upstream package-specific metadata
- treat that metadata as **ASC execution continuity state**, not as a generic society authority surface
- optionally read upstream `rewind-*` entries during migration, but only write the owned schema

Suggested migration posture:

- **read** both legacy upstream `rewind-*` and owned `asc-rewind-*` records when present
- **write** only owned `asc-rewind-*` records after cutover

## C. Keep the git keepalive ref initially

For the first owned slice, keep the repo-local ref name:

```text
refs/pi-rewind/store
```

Reason:
- lower migration cost
- easy reuse of existing reachable snapshot objects
- no need to rename a working storage implementation detail before the owned runtime stabilizes

If a later owned migration wants a new ref name, do it explicitly and with compatibility tests.

## Replay Fabric integration model

Replay Fabric should **not** receive every silent automatic snapshot.
That would create noisy recovery history and confuse runtime authority.

### Local-only state in ASC

Keep these local to ASC and the repo's git storage:
- silent per-turn snapshots
- entry-to-snapshot bindings
- latest current/undo snapshot state
- lineage reconstruction caches
- retention bookkeeping

### Project only meaningful recovery milestones to Replay Fabric

Emit milestones only for operator-meaningful rewind actions.

Suggested mapping:

| ASC rewind event | Replay Fabric event family | `eventKind` | Notes |
|---|---|---|---|
| operator creates an explicit named/pinned rewind point | recovery | `checkpoint.created` | use only for explicit checkpoints worth replay/history visibility |
| operator starts restoring files from an exact rewind point | recovery | `restore.started` | emitted before worktree mutation |
| exact restore succeeds | recovery | `restore.completed` | include restore mode + checkpoint ref |
| exact restore fails | recovery | `restore.failed` | include bounded failure reason and optional exit/diagnostic metadata |
| operator uses undo-last-rewind | recovery | `restore.undo` | model undo as an explicit recovery outcome |

Suggested source label:
- `source: "asc-rewind"`

### Artifact refs for Replay Fabric

When a milestone needs a durable artifact ref, prefer a repo-local manifest path such as:

```text
.git/pi-rewind/manifests/<checkpoint-or-restore-id>.json
```

Those manifests can hold bounded fields such as:
- `checkpointRef`
- `snapshotCommitSha`
- `treeSha`
- `sessionId`
- `correlationId`
- `restoreMode`
- `createdAt`
- `boundary`

Replay Fabric can preview these as local artifacts without becoming restore authority.

## Proposed checkpoint model

Distinguish two checkpoint classes clearly.

### 1. Silent runtime snapshots

Purpose:
- power exact `/fork` and `/tree` restore
- provide undo
- support lineage continuity

Properties:
- auto-created
- deduped by tree SHA
- not projected to Replay Fabric by default
- runtime-local implementation detail

### 2. Explicit operator checkpoints

Purpose:
- mark an important recovery point intentionally
- make the point legible in replay/recovery history
- optionally pin it against retention if policy says so

Properties:
- explicit user-facing action or strong runtime trigger
- projected to Replay Fabric as `checkpoint.created`
- may create a durable local manifest artifact

This split keeps Replay Fabric signalful while preserving exact local rewind.

## Migration strategy from upstream experiments

If local operators already used upstream `pi-rewind-hook`, the owned slice should begin with **compatibility read support**, not forced migration.

### Read compatibility

Support reading upstream records for lineage resolution:
- `rewind-turn`
- `rewind-op`
- `rewind-fork-pending`

### Write policy

Write only the owned ASC schema once the owned runtime is active.

### Storage compatibility

Reuse existing reachable snapshot commits behind `refs/pi-rewind/store` when possible.

### Replay Fabric compatibility

Do not backfill every historical snapshot into Replay Fabric.
Only project new meaningful checkpoints/restores after the owned runtime is active.

## Proposed implementation phases

## Phase 1 — import the exact snapshot/restore core into ASC

Goal:
- land the git mechanics under ASC ownership

Includes:
- temp-index snapshot capture
- tree dedupe
- keepalive ref management
- exact restore + undo
- package-local tests using real git repos

Does not include yet:
- Replay Fabric projection
- upstream metadata migration writeback
- public package extraction

## Phase 2 — bind the core to Pi session/runtime events inside ASC

Goal:
- make ASC own the runtime-local rewind continuity behavior

Includes:
- session entry bindings
- lineage lookup across parent sessions
- `/fork` and `/tree` restore choices
- exact restore availability rules
- compaction/summary alias behavior where still justified

## Phase 3 — project bounded recovery milestones to Replay Fabric

Goal:
- make rewind visible in replay history without moving execution authority out of ASC

Includes:
- `checkpoint.created`, `restore.started`, `restore.completed`, `restore.failed`, `restore.undo`
- repo-local manifest artifacts for event detail preview
- proof helper that validates milestone payloads against Replay Fabric's recovery contract

## Phase 4 — add compatibility read support for upstream session ledgers if needed

Goal:
- preserve value from local upstream experiments without copying the upstream authority model whole

Includes:
- legacy read adapters for `rewind-turn` / `rewind-op` / `rewind-fork-pending`
- tests proving lineage resolution across legacy + owned entries

## Phase 5 — reconsider package extraction only if real pressure appears

Do **not** split a new owned package by default.
Only extract if:
- a second real runtime consumer appears
- ASC ownership becomes too broad to keep coherent
- the rewind slice needs a supported public package seam of its own

Until then, keep the rewind slice inside ASC.

## Validation plan

The owned rewind slice should be proven across four layers.

### 1. ASC package-local git/runtime tests

Prove:
- snapshot capture
- dedupe
- exact restore
- undo
- retention safety
- lineage lookup

### 2. Live Pi extension smoke

Prove against a real Pi runtime:
- install ASC from local package path
- `/reload`
- `/fork` restore options
- `/tree` restore options
- resume/fork continuity

### 3. Replay Fabric projection proof

Prove:
- emitted milestones hit `/api/milestones/recovery`
- event kinds match the repo-local recovery contract
- artifact refs resolve inside the repo boundary

### 4. Compatibility tests

Prove:
- legacy upstream session entries can still be read when present
- owned ASC entries remain the only written format after cutover

## Non-goals

- Do not make Replay Fabric the restore executor.
- Do not let `pi-society-orchestrator` absorb the rewind runtime.
- Do not treat ordinary local rewind as AK/governance canonical state.
- Do not log every silent snapshot into Replay Fabric.
- Do not reuse upstream `install.js` or raw-download install flow.
- Do not extract a new owned package before there is real second-consumer pressure.

## Practical next step

The next smallest truthful move is:

1. port the upstream git snapshot / exact restore core into ASC under a package-local `rewind/` module split
2. keep the storage ref `refs/pi-rewind/store` initially
3. keep silent snapshots local to ASC
4. add explicit Replay Fabric recovery milestone projection only for named checkpoints and restore/undo outcomes

That path salvages the strongest upstream implementation work while keeping authority placement truthful in AI Society.
