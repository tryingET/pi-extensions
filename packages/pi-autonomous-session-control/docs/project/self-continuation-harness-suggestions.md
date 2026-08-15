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

`self` may rank slice candidates with `rank continuation slices`; the top candidate remains `nextMove` for `prefill suggested next move` compatibility.

| Situation visible to `self` | Suggested slice | Prefill target |
|---|---|---|
| Continuation, handoff, or compaction pressure | temporal + artifact/packet | `/compact-focus ...` or handoff text |
| Repeated unrecovered failures, loop recovery, or ambiguous stuckness | temporal + failure-recovery + source-owner + authority-risk | `/scoutpeer ...` |
| Stale failures followed by successful validation/check commands | no failure-recovery peer by default; prefer the next local or owner-correct slice | no prefill unless another current cue remains |
| Unclear boundary or design risk | source-owner + authority-risk | `/scoutpeer ...` |
| Multiple touched sibling files/packages | horizontal + artifact/packet + source-owner | natural-language request naming `context_plan` |
| Bounded implementation alternative | vertical + artifact/packet | `/parallelquest ...` |
| Missing future context packet | source-owner + artifact/packet | natural-language request naming `context_plan` |
| Obvious local verification | vertical + local-validation | local validation command |
| Multi-step workflow coordination | phase/lifecycle + authority-risk | society-orchestrator-owned slash/workflow surface |

## Prefill rule

A prefilled suggestion should name:

1. the slice;
2. the owning harness move;
3. the smallest objective;
4. non-authorizations.

Use the interactive slash-command projection when one exists. Do not prefill model-callable tool syntax such as `scout_peer_spawn(...)`; the Pi editor is an operator input surface. The machine-readable projection owner is `packages/pi-little-helpers/src/capabilityManifest.ts` (`LITTLE_HELPERS_TOOL_COMMAND_PROJECTIONS`), currently mapping `scout_peer_spawn -> /scoutpeer` and `candidate_peer_spawn -> /parallelquest`.

When `controller handoff summary` returns `nextMove`, the caller can ask `self` to bridge it into the editor:

```text
self({ query: "prefill suggested next move" })
```

Example:

```text
/scoutpeer Review whether ASC/self continuation hints preserve owner boundaries. Keep self mirror-only; do not edit files, run destructive commands, or claim compaction/orchestration/AK authority.
```

## Recovery evidence rule

A successful validation/check command after the latest failed command is recovery evidence. It should suppress stale failure-loop and error-loop cues from becoming the top continuation slice and should frame handoff failed-command cues as recovered history rather than active failure-recovery advice. Active failure-recovery ranking starts after the latest recovery-evidence command; older failures remain mirror history only. Store recovery classification when the command is tracked from the full command input; do not classify recovery from truncated display command text. Read-only inspection commands such as `git status`, `git diff`, and provenance helpers may still be productive progress context, but they are not recovery evidence.

## Stop rule

If the next move is obvious and local, do not suggest a peer, loop, compaction, or context packet.
Prefer the boring command.

If the suggestion needs a long explanation, do not prefill it; ask for a narrower decision first.

## Self-driving send budget and follow-up policy

Continuation-class `pi.sendUserMessage` sends are fail-closed, bounded, and observable (canonical kernel: `extensions/self/follow-up-policy.ts`):

- The action line must affirmatively match the low-risk local-validation command allowlist; anything else degrades to editor prefill.
- A consecutive-send budget (3 continuations / 8 notifications) is enforced between operator-authored user messages; over-budget sends prefill with `self_driving_budget_exhausted`.
- Identical text inside a 10-minute dedup cooldown is suppressed (`self_driving_dedup_suppressed`).
- `PI_SELF_SEND_USER_MESSAGE_MODE` binds classes to the autonomy ladder (`notifications_only` < `bounded_continuation` < `owner_bridge`, default ceiling).
- The send seam is guarded (failures report `userMessageSendFailed` and fall back to prefill), delivered continuations mark their candidate consumed, and outcomes are recorded as `self.follow_up_send.v1` telemetry visible in `action summary`.

Other extension-originated `pi.sendUserMessage` seams (for example pi-autoresearch auto-continuation) must implement the same contract at their own boundary — fail-closed text scans, bounded counts, and honest delivery reporting — until a shared package-level kernel exists.
