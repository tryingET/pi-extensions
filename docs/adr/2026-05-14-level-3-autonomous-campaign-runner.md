---
summary: "ADR accepting level-3 governed autonomous campaign runner: manifest-driven slice sequencing and candidate lifecycle automation with explicit policy gates and receipts."
status: accepted
read_when:
  - "Implementing campaign automation beyond level 2 in pi-society-orchestrator or pi-autoresearch."
  - "Deciding whether a campaign runner may sequence slices, launch visible candidates, cleanup worktrees, write AK evidence, or complete tasks."
  - "Reviewing the boundary between manifest-governed autonomy and hidden authority inference."
type: "adr"
decision: "AK decision #45"
system4d:
  container: "Repo-scoped ADR for level-3 governed autonomous campaign runner in pi-extensions."
  compass: "Authorize more autonomous campaign progress from durable manifests while keeping dangerous transitions policy/token gated and auditable."
  engine: "Level-2 closeout + problem intent + RFC + review -> accepted Option B -> implementation gates and rollback boundaries."
  fog:
    risks:
      - "Manifest policy is treated as a broad blank check."
      - "Transition receipts are mistaken for durable AK evidence."
      - "Cleanup, AK writes, or promotion are bundled into ordinary campaign progress."
---

# ADR — Level-3 governed autonomous campaign runner

## Status

Accepted.

Canonical AK decision: `decision:45` — "Adopt level-3 governed autonomous campaign runner".

Supporting artifacts:

- Level-2 closeout: [`../project/2026-05-14-level-2-checkpointed-campaign-closeout.md`](../project/2026-05-14-level-2-checkpointed-campaign-closeout.md)
- Problem intent: [`../project/2026-05-14-level-3-autonomous-campaign-runner-problem-intent.md`](../project/2026-05-14-level-3-autonomous-campaign-runner-problem-intent.md)
- RFC: [`../project/2026-05-14-level-3-autonomous-campaign-runner-rfc.md`](../project/2026-05-14-level-3-autonomous-campaign-runner-rfc.md)
- Review memo: [`../project/2026-05-14-review-level-3-autonomous-campaign-runner-rfc.md`](../project/2026-05-14-review-level-3-autonomous-campaign-runner-rfc.md)
- Level-2 ADR: [`2026-05-14-level-2-checkpointed-campaign-automation.md`](2026-05-14-level-2-checkpointed-campaign-automation.md)

## Decision

Adopt **Option B: Level-3 governed manifest runner**.

`pi-society-orchestrator` may implement a manifest-driven campaign runner that sequences declared slices and advances candidate lifecycle/closeout steps through typed policy gates and receipts.

Short form:

```text
Let a runner execute the manifest, not the vibes.
Every dangerous transition must be authorized by typed manifest policy or exact owner token, and every transition must emit a receipt.
```

## Authorized level-3 responsibilities

| Owner | Authorized now |
| --- | --- |
| `pi-society-orchestrator` | Campaign manifest parsing, policy preflight, slice sequencing, state-machine/cockpit posture, review/finalizer token choreography, transition receipts, and AK closeout request/application only when exact AK policy permits. |
| `pi-autoresearch` | Measurement execution, receipts, candidate-result packet export, metric/blocker computation, dashboard/export state, and empirical campaign artifacts. |
| Visible peer/worktree surfaces | Candidate peer launch and candidate worktree lifecycle only through explicit manifest policy or exact tokens. |
| AK | Durable evidence/task/decision/direction authority only through `ak_owner_write` policy/token and deterministic projection. |
| Controller/operator | Manifest acceptance, dangerous-token authorization, owner review, rollback, merge/release/promotion decisions. |

## Manifest acceptance requirement

Level-3 autonomy requires a durable campaign manifest, initially:

```text
autoresearch.level3_campaign_manifest.v1
```

A manifest must be:

- scoped to exact `taskId` and `cwd`;
- explicit about `filesInScope`, `offLimits`, metrics, slices/cells, rollback, and policy;
- validated before actions;
- accepted by the controller/operator or by an AK-authorized task contract before policy can authorize actions;
- hashed into every transition receipt.

Chat text, peer/intercom text, checkpoint labels, and packet presence are not manifest acceptance.

## Policy/token gates

| Boundary | Required gate |
| --- | --- |
| visible candidate peer launch | accepted manifest policy or exact `launch_visible_candidate_lanes` token naming lanes/cwd/files/off-limits/DoD |
| measurement/export/review | accepted manifest policy routed through `pi-autoresearch` seams |
| finalizer action | exact `finalize_post_fanin` token naming review packet, metric posture, and permitted scope |
| cleanup / branch deletion / worktree removal | exact `candidate_cleanup` token or accepted manifest cleanup policy naming exact worktrees/branches |
| AK evidence/task write | `ak_owner_write` policy/token naming exact AK operation, task/cwd/manifest hash, evidence source, and projection key |
| KES/Oracle/DSPx/Prompt Vault/ROCS write | owner-surface token from that owner, not generic campaign policy |
| merge / cherry-pick / push / PR / release / promotion | explicit promotion token naming exact repo paths and rollback |

No token may be inferred from chat, peer reports, or checkpoint labels.

## Receipt requirements

Every automated transition must emit a non-authoritative local receipt, for example:

```text
.autoresearch/level3-campaign/<campaignId>/receipts/<sequence>-<transition>.json
```

Receipt kind:

```text
autoresearch.level3_campaign_transition_receipt.v1
```

Receipts are audit/review inputs. They are not AK evidence until projected through explicit `ak_owner_write`.

Receipts must include manifest hash, task/cwd, transition name, policy/token decision, inputs/outputs, metric posture, off-limits/dirty summary where applicable, next state, and rollback hint.

## Anti-authority-drift requirements

- Peer text and `PEER_FINAL` are communication/protocol correlation only.
- Candidate-result packets are review inputs, not durable evidence.
- Review packets and finalizer-token requests are not winner selection, cleanup, merge, release, or promotion authority.
- AK evidence/task completion must be exact, deduped, and tied to task/cwd/manifest hash.
- Cleanup and promotion must stay separate from finalizer application.
- Proof-only/baseline-only completion cannot close a real matrix campaign without explicit downgrade or incomplete-matrix exception.

## Implementation gates

No implementation may claim level-3 conformance until tests or equivalent checks prove:

1. invalid/missing manifest fails closed;
2. no visible candidate launch without accepted manifest policy or launch token;
3. no measurement/export/review outside approved `pi-autoresearch` seams;
4. no finalizer action without exact `finalize_post_fanin` token;
5. cleanup requires exact cleanup policy/token and names worktrees/branches;
6. AK evidence/task completion requires `ak_owner_write`, exact task/cwd/manifest hash matching, and deterministic projection key;
7. promotion remains separate and cannot be bundled into cleanup/finalizer;
8. receipts are generated for transitions and are not treated as durable evidence;
9. stale/missing/duplicate/off-limits/dirty/proof-only cases fail closed;
10. rollback to level 2 is visible and preserves packets/receipts.

## Implementation-by-autoresearch-campaign rule

Implementation of this ADR must itself be run through the current measured/autoresearch campaign substrate, not as a single unmeasured controller patch.

Until Slice 1 lands, use the level-2 lawful surfaces to prepare, run, review, and close implementation campaigns. As level-3 slices land, dogfood the newly landed runner for later slices only after validation proves the relevant gate.

## Rollback

If level 3 causes confusion or authority drift:

1. disable the level-3 runner entrypoint/feature flag;
2. preserve manifests, packets, and receipts as non-authoritative review inputs;
3. fall back to the level-2 packet/checkpoint surfaces;
4. perform cleanup/evidence/task closeout only through explicit owner gates;
5. open a corrective decision if the authorization envelope itself needs to narrow.
