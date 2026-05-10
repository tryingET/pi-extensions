---
summary: "Implementation and dogfood check for the bounded campaign-endurance smoke proof."
read_when:
  - "You are reviewing AK task #2749 or ADR 2026-05-10 campaign endurance proof."
  - "You need to distinguish smoke proof from hour-scale endurance proof."
type: "implementation-check"
system4d:
  container: "Package-local implementation check for campaign endurance smoke dogfood."
  compass: "Verify runtime receipts/dashboard/resume proof without overclaiming hour-scale autonomy."
  engine: "Run bounded smoke loop -> inspect dashboard/closeout/resume -> record evidence -> leave hour-scale proof open."
  fog: "A successful three-iteration smoke run can be mistaken for couple-hours endurance."
---

# Implementation check — campaign endurance smoke proof

## Scope

ADR: [2026-05-10 campaign endurance runtime proof](../adr/2026-05-10-campaign-endurance-runtime-proof.md)

AK anchors:

- task: `#2749` — `Prove bounded pi-autoresearch campaign endurance before matrix automation`
- decision: `#37` — `Adopt bounded pi-autoresearch campaign endurance proof before matrix automation`
- direction: `SF4 -> IW2`

This check verifies the **smoke proof** tier only.
It does not claim hour-scale endurance.

## Dogfood command shape

A bounded local loop was executed through package runtime code with:

- campaign name: `campaign-endurance-smoke`
- metric: `campaign_endurance_smoke_blockers`
- direction: `lower`
- threshold: `0`
- max iterations: `3`
- max wall-clock: `2` minutes
- peer mode: `plan`
- stop gates: `crash`, `checks_failed`, `blocked`
- benchmark: fresh local check that required the problem/RFC/review/ADR files to exist and emitted `METRIC campaign_endurance_smoke_blockers=<n>`
- checks: local file-existence gate for the RFC and ADR

## Observed result

| Check | Result |
|---|---|
| Requested iterations | `3` |
| Completed iterations | `3` |
| Stop reason | `maxIterations reached` |
| Successful runs | `3` |
| Best metric | `0` |
| Empirical class | `threshold_preserved` |
| Dashboard export | `.autoresearch/autoresearch-dashboard.html` |
| Resume plan packet | `autoresearch.resume_plan.v1` |
| Resume reusable | `true` |

## Conformance to ADR smoke proof

| Requirement | Status | Note |
|---|---|---|
| Explicit objective | Conforms | Goal named campaign endurance before matrix automation. |
| Explicit metric contract | Conforms | Fresh benchmark emitted `campaign_endurance_smoke_blockers`. |
| Explicit budgets | Conforms | `maxIterations=3`, `maxWallClockMinutes=2`. |
| Receipt-producing loop | Conforms | Local `autoresearch.jsonl` was updated by runtime execution. |
| Event-ledger-producing loop | Conforms | Local `autoresearch.events.jsonl` was updated by runtime execution. |
| Dashboard non-empty after receipts | Conforms | Dashboard export showed configured campaign/run history after the loop. |
| Resume posture inspectable | Conforms | Resume packet exists and reports reusable. |
| No hidden authority write | Conforms | No AK/KES/promotion write was performed by `pi-autoresearch`; AK evidence is recorded separately by controller. |
| No hour-scale claim | Conforms | This document labels the run as smoke only. |

## Remaining proof gap

The hour-scale proof remains open.

A later endurance run should use an explicit `60-120` minute or operator-approved equivalent budget and verify live dashboard usefulness during execution, stop/resume posture after a longer run, and source-control cleanliness of regenerated runtime artifacts.

## Validation commands

Package/docs validation for this slice:

```bash
npm --prefix packages/pi-autoresearch run check
node ~/ai-society/core/agent-scripts/scripts/docs-list.mjs --docs packages/pi-autoresearch --strict --require-system4d-path docs/adr/ --require-system4d-path docs/decisions/
```

## Result

Status: **smoke proof passed**.

The landed package runtime can run a bounded three-iteration campaign segment, generate runtime truth, refresh the dashboard, and expose resume posture. This is enough to proceed to a deliberately scheduled hour-scale proof, but not enough to claim couple-hours self-sustaining campaign maturity.
