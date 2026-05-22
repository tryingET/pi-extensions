---
summary: "Contract for ASC/self continuation cues that suggest the next Pi harness move via editor prefill."
read_when:
  - "Changing self handoff, checkpoint, followup, or prefill behavior."
  - "Deciding whether ASC/self should suggest peers, context planning, compaction focus, or local continuation."
system4d:
  container: "ASC/self continuation suggestion contract."
  compass: "Use self as a mirror that can suggest the next operator-mediated harness move without becoming the owner of that move."
  engine: "Observe session state -> choose slice -> prefill suggested next command -> operator decides."
  fog: "The trap is turning suggestions into orchestration, compaction, AK authority, or context-packer ownership."
---

# Self continuation harness suggestions

## Contract

`self` may suggest the next Pi harness move by prefilling editor text.
It must not execute that move automatically.

Pattern:

```text
self observes -> chooses slice + owning harness move -> prefills editor -> operator decides
```

## Owner boundaries

- ASC/self owns session-local mirror cues, checkpoints, followups, and editor prefill.
- Peer tools own peer launch and peer reporting.
- `pi-session-compaction` owns compaction summaries and `/compact-focus` behavior.
- `pi-context-packer` owns context packet planning.
- `pi-society-orchestrator` owns multi-step workflow and loop coordination.
- AK owns task/evidence/decision truth.

## Slice-to-harness map

| Situation visible to `self` | Suggested slice | Prefill target |
|---|---|---|
| Continuation, handoff, or compaction pressure | temporal + artifact/packet | `/compact-focus ...` or handoff text |
| Unclear boundary or design risk | source-owner + authority-risk | `/scoutpeer ...` |
| Bounded implementation alternative | vertical + artifact/packet | `/parallelquest ...` |
| Missing future context packet | source-owner + artifact/packet | natural-language request naming `context_plan` |
| Obvious local verification | vertical | local validation command |
| Multi-step workflow coordination | phase/lifecycle + authority-risk | society-orchestrator-owned slash/workflow surface |

## Prefill rule

A prefilled suggestion should name:

1. the slice;
2. the owning harness move;
3. the smallest objective;
4. non-authorizations.

Use the interactive slash-command projection when one exists. Do not prefill model-callable tool syntax such as `scout_peer_spawn(...)`; the Pi editor is an operator input surface, and the peer capability's slash projection is `/scoutpeer` (clean read-only scout) or `/parallelquest` (isolated candidate worktree).

Example:

```text
/scoutpeer Review whether ASC/self continuation hints preserve owner boundaries. Keep self mirror-only; do not edit files, run destructive commands, or claim compaction/orchestration/AK authority.
```

## Stop rule

If the next move is obvious and local, do not suggest a peer, loop, compaction, or context packet.
Prefer the boring command.

If the suggestion needs a long explanation, do not prefill it; ask for a narrower decision first.
