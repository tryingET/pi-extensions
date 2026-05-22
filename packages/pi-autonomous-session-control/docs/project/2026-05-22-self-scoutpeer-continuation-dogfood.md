---
summary: "Dogfood receipt for self nextMove prefill into /scoutpeer with intercom ACK/FINAL report-back."
read_when:
  - "Changing ASC/self continuation suggestions, peer prefill behavior, or /scoutpeer report-back assumptions."
system4d:
  container: "Package-local dogfood receipt for ASC self continuation suggestions."
  compass: "Keep the proven flow operator-mediated and source-owner bounded."
  engine: "self handoff -> prefill suggested next move -> /scoutpeer -> PEER_ACK -> PEER_FINAL -> peer_watch."
  fog: "Do not treat intercom report-back as AK evidence, durable authority, or orchestration completion."
---

# 2026-05-22 — self `/scoutpeer` continuation dogfood

## Scope

Package-local receipt only. This records observed behavior for ASC/self and the visible peer harness. It is not AK evidence, task truth, publication authority, or a promotion record.

## Flow proven

```text
self({ query: "controller handoff summary" })
-> nextMove: source-owner + authority-risk via peer-tools
-> self({ query: "prefill suggested next move" })
-> editor prefilled with /scoutpeer ...
-> operator submitted /scoutpeer
-> peer sent PEER_ACK over intercom
-> peer sent PEER_FINAL over intercom
-> controller peer_watch reported final_received
```

## Concrete dogfood observation

The live smoke peer used:

```text
peer_run_id=scoutpeer-mph7w96u-6499cbc1
```

Controller `peer_watch` reported:

```text
final_received
ACK=1 FINAL=1 PROGRESS=0 duplicateACK=0 duplicateFINAL=0 violations=0
```

The peer final report stated that it inspected no files, ran no commands, made no edits, and used intercom only for the report-back smoke test.

## Contract reinforced

- ASC/self suggests and prefills; it does not launch peers automatically.
- Editor prefill must use operator-facing slash commands, not model-callable tool syntax.
- The peer capability projection owner is `packages/pi-little-helpers/src/capabilityManifest.ts`.
- `/scoutpeer` owns clean visible scout launch and prompt-contract ACK/FINAL behavior.
- Intercom report-back is communication only; it is not durable evidence or completion authority.

## Follow-up boundary

If this flow regresses, debug in this order:

1. `packages/pi-little-helpers/src/capabilityManifest.ts` projection map.
2. `/scoutpeer` generated prompt and launch notification.
3. ASC `self` handoff `nextMove.prefillText`.
4. ASC `prefill suggested next move` action resolver.
5. Live intercom availability and exact controller session id.
