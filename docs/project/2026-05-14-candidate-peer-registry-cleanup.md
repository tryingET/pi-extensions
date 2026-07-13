---
summary: "Candidate peer registry and archive-before-cleanup packet contract."
read_when:
  - "Cleaning up visible candidate peer worktrees."
  - "Debugging candidate_peer_spawn residue after post-fan-in campaigns."
---

# Candidate peer registry cleanup contract

`candidate_peer_spawn` persists a registry JSON sidecar for each launched candidate peer under:

```text
$XDG_STATE_HOME/pi-quests/peer-registry/<peerRunId>.json
```

The record is launch metadata, not authority. It captures the peer run id, parent cwd/repo, worktree path, branch/base ref, dirty-parent warning, report-back target, requested path-scope lists, launch/session hints, and an archive-before-cleanup command packet.

## 2026-07-13 emergency safety hold

The registry census proved that v1 is insufficient for destructive cleanup: reused physical worktrees have multiple peer-run records, lifecycle disposition is absent, and historical archives omitted untracked bytes. At least one historical archive recorded an untracked file name but did not preserve its content.

Therefore `candidate_peer_cleanup` is temporarily **dry-run only**. `execute: true` fails closed and cites AK decision 59. The operator backlog hold at `$XDG_STATE_HOME/pi-quests/candidate-spawn.HOLD.json` also blocks `candidate_peer_spawn` and `/parallelquest` before Git mutation in updated/reloaded sessions. Do not bypass either hold with manual worktree creation/removal or branch deletion.

New prospective archive packets preserve untracked bytes, inventory and block on ignored paths, compare tracked/untracked/ignored/HEAD state before and after capture, verify hashes/bundle/compression, use owner-only permissions, and publish an atomic completion marker. They are not yet destructive-cleanup authority, and historical sidecars retain their serialized v1 packets.

The resource-level replacement is specified in:

- [Candidate peer lifecycle v2 RFC](2026-07-13-candidate-peer-lifecycle-rfc.md)
- [One-by-one candidate registry reconciliation](2026-07-13-candidate-peer-lifecycle-reconciliation.md)

Required future order:

1. group every peer-run alias under one physical candidate resource;
2. refresh and bind an explicit owner disposition to repository identity, branch, HEAD, and status digest;
3. prove accepted work is integrated, or record rejected/superseded/missing disposition;
4. archive every non-reconstructable byte or explicit path-level discard decision;
5. verify and atomically publish the archive;
6. obtain separate exact cleanup authorization;
7. only then terminate a named process, remove one exact worktree, and delete one exact branch;
8. persist a terminal receipt.

The registry remains operational metadata, not AK/KES/evidence or promotion authority. If metadata and visible state disagree, stop and inspect manually instead of widening cleanup.
