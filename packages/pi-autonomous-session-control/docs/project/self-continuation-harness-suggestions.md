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
| Unclear boundary or design risk | source-owner + authority-risk | `scout_peer_spawn(...)` |
| Bounded implementation alternative | vertical + artifact/packet | `candidate_peer_spawn(...)` |
| Missing future context packet | source-owner + artifact/packet | `context_plan(...)` |
| Obvious local verification | vertical | local validation command |
| Multi-step workflow coordination | phase/lifecycle + authority-risk | society-orchestrator-owned loop/workflow surface |

## Prefill rule

A prefilled suggestion should name:

1. the slice;
2. the owning harness move;
3. the smallest objective;
4. non-authorizations.

Example:

```text
scout_peer_spawn({
  role: "reviewer",
  objective: "Review whether ASC/self continuation hints preserve owner boundaries.",
  context: {
    campaignGoal: "Suggest next harness moves without ASC owning them",
    constraints: [
      "self remains mirror-only",
      "ASC does not own compaction",
      "ASC does not own orchestration"
    ]
  }
})
```

## Stop rule

If the next move is obvious and local, do not suggest a peer, loop, compaction, or context packet.
Prefer the boring command.

If the suggestion needs a long explanation, do not prefill it; ask for a narrower decision first.
