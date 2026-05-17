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

Cleanup remains manual/review-gated. Above-seam closeout packets may prepare a `candidate_peer_cleanup` dry-run only when exact peer run ids resolve to valid registry sidecars; they may prepare execute/fallback cleanup commands only after exact peer run ids, worktrees, branches, and successful integration closeout verify. Use the packet only after inspecting the candidate diff and peer final report. Its order is intentional:

1. archive registry metadata plus worktree status/diffs/bundle under `$XDG_STATE_HOME/pi-quests/archives/<peerRunId>/`
2. remove only the recorded git worktree
3. delete only the recorded candidate branch

The packet intentionally does not kill processes, remove arbitrary directories, merge, push, open PRs, or mutate AK/KES/Oracle/Prompt Vault/ROCS. If the metadata and visible state disagree, stop and inspect manually instead of widening cleanup.
