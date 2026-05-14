---
summary: "ADR accepting level-1 campaign automation graduation: default measured campaign route plus checkpointed command packets, without hidden execution or promotion."
status: accepted
read_when:
  - "You are using pi-autoresearch / pi-society-orchestrator as the measured substrate for implementation waves."
  - "You are deciding what campaign automation is currently authorized."
  - "You are proposing whole-matrix execution, hidden peer launch, evidence writes, or promotion automation."
type: "adr"
system4d:
  container: "Repo-scoped ADR for campaign automation graduation level 1 in pi-extensions."
  compass: "Authorize default-use measured campaigns while preserving explicit owner actions for execution and authority mutation."
  engine: "Decision packet + review synthesis + adoption corpus -> accepted level-1 contract -> future level-2 gates."
  fog:
    risks:
      - "Level 1 is misread as permission for hidden whole-matrix execution."
      - "Prepared evidence/KES handoff calls are mistaken for authority writes."
      - "Local campaign receipts are treated as canonical evidence without AK projection."
---

# ADR — Campaign automation graduation level 1

## Status

Accepted.

Canonical AK decision: `decision:42` — "Adopt checkpointed measured campaign substrate as default implementation-wave route".

Supporting artifacts:

- Decision packet: [`../project/2026-05-14-campaign-automation-graduation-decision-packet.md`](../project/2026-05-14-campaign-automation-graduation-decision-packet.md)
- Review synthesis: [`../project/2026-05-14-review-campaign-automation-graduation-decision-packet.md`](../project/2026-05-14-review-campaign-automation-graduation-decision-packet.md)
- Adoption playbook: [`../project/measured-implementation-wave-campaign-playbook.md`](../project/measured-implementation-wave-campaign-playbook.md)

## Decision

Adopt **campaign automation graduation level 1** for `pi-extensions`:

```text
Default-use measured campaign substrate: yes.
Checkpointed command-packet automation: yes.
Hidden execution / promotion automation: no.
```

For ambiguous, high-leverage, or multi-hypothesis implementation waves, the default route is now:

```text
AK task / implementation wave
-> matrix or candidate-wave plan
-> visible candidate lanes where mutation is needed
-> controller-verified pi-autoresearch measurement
-> orchestrator fan-in / owner review
-> explicit evidence and learning handoff
```

## Authorized now

`pi-society-orchestrator` may prepare and render:

- `plan_matrix_campaign` / `plan_candidate_wave` reports;
- managed candidate-wave fan-in gates;
- checkpoint contracts;
- matrix cockpit and operator-followup packets;
- exact controller command packets for bind, measure, export, review, and closeout;
- exact owner-surface handoff calls for AK evidence and KES learning activation after owner review.

`pi-autoresearch` remains authorized to own:

- local campaign runtime;
- benchmark/check execution when explicitly called;
- receipts and event ledger;
- dashboard/export surfaces;
- candidate binding;
- candidate-result packets;
- closeout, AK-evidence packet preparation, learning export, and Oracle-ready packet export.

## Not authorized

This ADR does **not** authorize:

- hidden peer launch;
- hidden benchmark execution;
- hidden candidate-result export;
- hidden candidate-wave or matrix review;
- automatic AK evidence, KES, Prompt Vault, ROCS, Oracle/DSPx, issue-tracker, or external writes;
- automatic keep/discard/rewind, worktree cleanup, merge, branch deletion, or promotion;
- treating peer text, checkpoint tokens, or local `.autoresearch/` receipts as durable authority without owner projection.

## Rationale

The adoption corpus is strong enough for default use:

- bounded endurance proof closed with `30/30` iterations and `unresolved_campaign_endurance_blockers=0`;
- managed candidate-wave fan-in proved missing-lane gates and owner review posture;
- integrated matrix campaigns closed with packet inventories, selected lanes, dashboard-first owner routes, and `evidence_handoff_blockers=0`;
- multiple adoption campaigns reached zero-blocker metrics after real package/root improvements.

The corpus is **not** strong enough for level-2 supervised execution automation because hidden execution would change authority, rollback, idempotency, and operator-surprise risk.

## Consequences

Positive:

- measured campaigns become a normal work mode rather than endless proof repetition;
- candidate comparison becomes packetized and owner-reviewable;
- evidence and learning handoff become explicit instead of chat-local;
- rollback is simple because execution/promotion actions are still explicit.

Costs:

- operators still approve/launch/run/export/review explicit calls;
- small deterministic fixes should bypass the campaign route;
- command-packet and playbook examples must stay aligned with tool schemas.

## Rollback

If level-1 default use creates confusion:

1. stop treating measured campaigns as the default route;
2. keep `pi-autoresearch` local receipts as projections only;
3. return to one-candidate dogfood or ordinary task validation;
4. record corrective AK evidence explaining the overbroad claim;
5. do not delete prior evidence unless it is factually wrong.

## Gates before level 2

A later ADR/AK decision is required before supervised execution automation. Minimum gates:

- two additional non-meta owner waves completed through level 1 with AK evidence;
- one missing/stalled/late-lane recovery campaign;
- rollback design for partially executed matrix cells;
- deterministic idempotency, overwrite-gate, and no-hidden-owner-mutation tests;
- live-host proof that dashboard/export stays useful during longer execution.
