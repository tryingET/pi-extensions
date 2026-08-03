---
summary: "AK-4152 session record: verified the existing controller-targeted Ghostty repair and completed a two-cell ACK/FINAL matrix dogfood."
type: "diary"
date: "2026-08-03"
task: "AK-4152"
---

# AK-4152 — repair matrix peer launch and report-back

## What happened

The task predated two repairs already present on current `main`:

- `500dd6a6` targets the controller Ghostty process rather than the sidequest broker.
- `6751938a` uses no-reply D-Bus activation so a launch timeout cannot kill the visible peer after successful delivery.

Current code also enforces exact `parentPeerTarget` values and a bounded canonical `PEER_ACK` / `PEER_FINAL` prompt.

I prepared a two-cell orchestrator matrix and dogfooded it through real visible candidate sessions. Admission v2 permits one active candidate in this repository, so the cells ran sequentially.

- `candidatepeer-msczgk4v-f1a012ac`: ACK=1, FINAL=1, no duplicates or violations.
- `candidatepeer-msczqq4u-f2552991`: ACK=1, FINAL=1, no duplicates or violations.

Both launched in controller-targeted Ghostty tabs, stayed alive through their work, returned exact clean worktree identity, and produced no patch. Controller-side Git verification confirmed both isolated worktrees were clean at `5be92d398e96055aae14b65b25415628be9f66eb`.

## Closeout

Each candidate was rejected/ignored as no-diff, restoration-archived, closed through lifecycle-v2, and released from admission control. The peer process groups were terminated only after archive verification. Final pressure: zero active admissions, zero unresolved resources, zero unresolved bytes.

Evidence root:

```text
~/.local/state/pi-quests/matrix-peer-dogfood/ak4152-20260803/
```

The checksummed `controller-protocol-and-checkpoint-snapshot.json` retains the exact final `peer_watch` entries, ACK/FINAL message ids, and accepted checkpoint entry. Its SHA-256 is `326bd2ef2a639527cdc6d3124869bc010e0e6912b6c9b3d1b985941816113960`; extraction from the controller session JSONL used `jq` only. This snapshot is protocol observation, not authority by itself.

Canonical validation note:

- [Matrix peer launch and report-back repair](../docs/project/2026-07-25-peer-matrix-report-back-repair.md)

## Verification

- focused pi-little-helpers launch/report-back tests: 31/31 passed
- pi-peer-messaging package check: 46/46 passed
- pi-little-helpers package check: 234/234 passed
- pi-society-orchestrator package check: 361/361 passed
- matrix checkpoint: accepted after both ACK/FINAL reports and controller lineage verification

No install, reload, push, publication, merge, or production compaction occurred. Unrelated dirty files were preserved.
