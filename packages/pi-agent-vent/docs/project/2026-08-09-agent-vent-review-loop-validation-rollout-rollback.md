---
summary: "Validation, rollout, and rollback contract for decision 116 Phase 1 snapshot freshness and pull-based cadence."
read_when:
  - "Validating or rolling out agent_vent snapshot manifests, shared locking, legacy initialization, or cadence."
  - "Recovering from a failed Phase 1 local migration or live Pi dogfood."
system4d:
  container: "Post-ADR validation and rollout membrane for the first agent_vent review-loop slice."
  compass: "Prove local identity and cadence without risking operator data or owner-system authority."
  engine: "Pure tests -> isolated migration/concurrency tests -> package gate -> fresh-session dogfood -> bounded rollout."
  fog: "Passing unit tests can be mistaken for safe migration, active Pi behavior, or owner-loop value."
---

# Validation, rollout, and rollback — `agent_vent` Phase 1

Status: **required post-ADR continuation artifact for AK decision 116; no rollout performed by this artifact**.

Governing ADR: [adopt the review-to-owner-outcome loop](../adr/2026-08-09-agent-vent-review-to-owner-outcome-loop.md).

Implementation plan: [Phase 1 implementation plan](2026-08-09-agent-vent-review-loop-implementation-plan.md).

## Validation invariants

1. Legacy vent records are never rewritten by snapshot initialization.
2. Read-only cadence and initialization preview create no files.
3. Initialization apply is confirmation-, input-hash-, and lock-bound.
4. A crash before atomic rename exposes no partial manifest.
5. Matching completed state plus matching token/hash returns idempotent `already_initialized`; unchanged source after a pre-rename crash may retry.
6. Changed/wrong source, mismatched/partial manifest, or stale projection markers fail closed without automatic deletion or rewrite.
7. Duplicate or reused record ids remain distinct occurrences.
8. Content, membership, or curation change creates a new generation and `needs_rereview`.
9. Archive/restore preserves lineage, occurrence, and reviewed-snapshot identity.
10. Existing local dispositions never become human-approval claims.
11. Phase 1 performs no owner-system, telemetry, startup-notification, or automatic-capture mutation.
12. Snapshot/cadence projections are consumed only when their source hashes/high-water marks match authoritative events; crash drift returns `projection_rebuild_required`.
13. The immutable legacy identity baseline plus identity-bearing new records/curation events reproduce stable identity after complete loss of rebuildable projections.

## Test matrix

### Canonical identity

- RFC 8785 serialization vectors are stable across key order and process restart;
- SHA-256 covers every review-relevant normalized/redacted field;
- changed severity, summary, evidence, expected/actual, tags, tool, package, source, or timestamp changes the record digest;
- duplicate ids and duplicate content receive distinct occurrence identity;
- recurrence aliases cannot substitute for snapshot digest.
- deleting all rebuildable snapshot/cadence sidecars and rebuilding from the immutable baseline plus authoritative events preserves lineage ids, occurrence ids, generations, and snapshot digests byte-for-byte;
- missing/corrupt immutable legacy baseline fails closed and is never regenerated from guesses.

### Legacy initialization

- preview on an uninitialized store emits exact counts, hashes, affected paths, and token without writes;
- apply rejects missing, malformed, changed-source, stale-hash, wrong-store, or conflicting-manifest tokens;
- matching completed state returns `already_initialized` without a second migration;
- unchanged source after a pre-rename crash may retry the same hash-bound token;
- apply uses a sibling temporary file, file fsync, atomic rename, and parent-directory fsync where supported;
- injected failures before rename leave no visible manifest; post-rename crash tests validate the durability claim for the host filesystem;
- partial or conflicting manifests fail closed with recovery guidance.

### Shared lock and concurrency

- vent append, `set_review`, curation, snapshot/due events, retention archive/restore, and initialization share the same lock domain;
- concurrent append versus initialization cannot omit or double-count a record;
- concurrent curation versus snapshot recomputation cannot publish or consume stale membership as current snapshot/cadence state;
- failure injection after every source/projection write boundary for append, `set_review`, curation, due facts, archive, and restore yields either matching projections or `projection_rebuild_required`;
- retention and append behavior preserve existing rollback guarantees;
- stale-lock cleanup remains bounded and does not remove a live lock.

### Freshness and cadence

- generation-specific `eligibleAt` is deterministic;
- `timeDueAt`, `criticalDueAt`, queue-threshold due events, and `effectiveDueAt` follow the ADR;
- status precedence is `clear`, then `overdue`, then `due`, then `current` under an injected clock;
- queue crossing creates one due fact per eligible generation without daily/presentation duplication;
- new members entering an already-due queue receive immediate due facts;
- candidate-incident language remains advisory;
- read-only output exposes counts, reasons, boundaries, and no owner assignment.

### Privacy and failure behavior

- new files enforce existing size, line, symlink, and path-containment safeguards;
- legacy hostile text is redacted before digest/display projection;
- no secrets, raw logs, or private payloads appear in cadence output;
- malformed timestamps cannot control age or priority;
- unknown schema versions and semantic corruption fail closed or quarantine visibly.

### Read-only and owner non-effect proof

For each cadence or initialization-preview action:

1. run in a child process with isolated `PI_CODING_AGENT_DIR`, `PI_AGENT_VENT_DIR`, `TMPDIR`, npm cache/prefix, and an explicit filesystem-write allowlist;
2. capture an immediate recursive inventory of every allowed root with path, file type, size, and sorted SHA-256 content hashes;
3. resolve the real active operator vent path and configure the audit to fail on any read or write access to it;
4. run exactly one action under process-scoped filesystem, network, and process-spawn auditing;
5. repeat inventories and require no vent-root change; when the isolated vent directory was absent, require it remains absent.

Pure/extension tests use dependency-injected I/O and instrument both `node:fs` and `node:fs/promises` mutation entrypoints (`open` write flags, write/append, rename, link/symlink, mkdir, truncate, chmod/chown, unlink/rm) to reject writes outside explicit roots and all writes for read-only actions. They also deny `globalThis.fetch`, Undici dispatch, `node:http`, `node:https`, `node:http2`, `node:net`, `node:tls`, `node:dgram`, and `node:child_process`.

Fresh-process proof records OS-level file/network/process syscalls (for example, bounded `strace -ff` file/network/process classes where supported), permits only expected Pi session/temp writes inside the isolated roots, and fails on network connects, spawned owner adapters, or any access to the real active vent store. A Phase 1 source/registration test also rejects imports or registered actions for AK, GitHub, incident, KES, or owner writers. This proves non-effects without reading owner systems.

## Package and repository gates

From `packages/pi-agent-vent`:

```bash
npm run check
```

From the monorepo root:

```bash
bash ./scripts/package-quality-gate.sh ci packages/pi-agent-vent
node ~/ai-society/core/agent-scripts/scripts/docs-list.mjs --docs packages/pi-agent-vent/docs --strict
git diff --check
```

Brownfield file-budget warnings remain non-blocking only if the implementation extracts new cohesive modules instead of materially growing oversized owner files. Any necessary exception must be explicit and scoped.

## Live Pi proof

Use an isolated store first:

```bash
export PI_AGENT_VENT_DIR="$TMPDIR/agent-vent-phase1-<owned-id>"
pi install "$PWD/packages/pi-agent-vent"
```

Then use a fresh Pi process to prove:

- `agent_vent` remains registered but toolbox activation is on demand;
- cadence on an uninitialized legacy store reports initialization required without writing;
- initialization preview writes nothing;
- apply with the exact token creates one complete manifest;
- cadence and `review due` are read-only after initialization;
- a new record or curation event produces a new generation and `needs_rereview`;
- no default startup notification appears.

Do not point destructive or failure-injection dogfood at the active operator store. After isolated proof, a bounded active-store preview may be run, but active initialization requires separate explicit operator approval and a pre-recorded store hash.

## Rollout stages

### Stage 0 — code dark

- land pure modules and tests without registering new commands;
- prove existing record/review/retention behavior unchanged.

### Stage 1 — read-only preview

- expose snapshot initialization preview and cadence initialization-required status;
- no apply command in default live proof yet.

### Stage 2 — explicit isolated apply

- enable apply only for isolated stores;
- run crash, stale-token, concurrency, archive, and restore tests.

### Stage 3 — local package activation

- reinstall package and verify in a fresh Pi session;
- keep startup nudges and owner integrations absent.

### Stage 4 — optional active-store initialization

- require explicit operator action after showing input hash, counts, paths, and rollback posture;
- retain legacy stores unchanged;
- monitor only local error/status output, not telemetry.

## Rollback and recovery

- Disable cadence/snapshot consumers without deleting manifests or legacy records.
- If initialization fails before rename, remove only the owned temporary file after proving it is inactive; active stores remain unchanged.
- If a complete manifest is semantically rejected after rename, quarantine it from consumers and retain it for owner inspection; do not automatically overwrite or delete it.
- If source/projection markers diverge after an interrupted mutation, consumers return `projection_rebuild_required`; run rebuild preview, verify source hashes/high-water marks, then apply atomically. Never treat a stale sidecar as current.
- If prior code is restored, its mutations may invalidate projections; keep consumers disabled or require rebuild before re-enabling them.
- If new code causes lock contention or stale-lock regressions, disable new mutation paths and restore the prior record/review/retention code while preserving all user data.
- If installed Pi behavior differs from source tests, reinstall the prior known-good package ref and verify `/agent_vent path`; do not claim rollback until a fresh process proves it.
- No rollback action may alter AK tasks/evidence, GitHub, incidents, KES, Prompt Vault, ROCS, or telemetry.

## Stop conditions

Stop rollout and return to design/task review if:

- any read-only action writes;
- legacy records are rewritten or lost;
- snapshot identity changes across archive/restore unexpectedly;
- full projection loss/rebuild changes any stable lineage, occurrence, generation, or snapshot digest;
- duplicate ids alias one occurrence;
- a stale token or race passes;
- any failure-injection boundary exposes stale projection data instead of exact rebuild-required status;
- a local disposition is presented as human approval;
- startup behavior changes;
- owner-system or network effects appear;
- active-store recovery requires guessing or destructive cleanup.

## Evidence and handoff

For the future Phase 1 task, attach:

- focused/full test commands and results;
- isolated-store before/after hashes and file inventory;
- fresh-session Pi proof;
- explicit non-effects for active operator store and owner systems;
- any rollback or recovery exercise result.

Local test logs are not canonical evidence until attached through the authorized AK task/evidence workflow.
