---
summary: "Status note for the bounded orchestrator-side supervision surface that observes one exact manifest-driven pi-autoresearch campaign and optionally records evidence-only AK projections above the package seam."
read_when:
  - "You need the shortest truthful answer to what actually landed for orchestrator-side manifest campaign supervision."
  - "Before claiming that pi-society-orchestrator can observe one exact manifest-driven llama.cpp campaign and write bounded AK evidence without polling or lifecycle mutation."
  - "When reviewing task 1702 or later follow-ons above the manifest campaign-control slice in pi-autoresearch."
type: "reference"
system4d:
  container: "Package-local closure note for orchestrator-side manifest campaign supervision in pi-society-orchestrator."
  compass: "State exactly what the new supervision surface does without overstating it as a second control plane, polling daemon, or task lifecycle owner."
  engine: "Summarize the contract -> implementation -> proof chain -> record what changed and what remains outside scope."
  fog: "The main risk is reading one-shot observation plus evidence projection as whole-campaign orchestration or automatic task completion."
---

# Status — orchestrator-side supervision for manifest-driven `pi-autoresearch` campaigns

## What is now real

`pi-society-orchestrator` now exposes one dedicated bounded tool above the landed package seam:

- `autoresearch_manifest_campaign_supervision`

That tool can now:

- observe one exact manifest-driven llama.cpp campaign from one exact `cwd + manifestPath`
- reuse the package-derived control snapshot from `pi-autoresearch` instead of inventing a second manifest state model
- refresh the same package projection artifact the package control surface already uses
- optionally record AK evidence for one exact `taskId` only after verified live task context yields one package-derived AK binding
- dedupe repeated unchanged observations by `taskId + checkType + projection_key`
- stay evidence-only even when the package binding says `terminal_stage_complete`

## What it still does **not** do

This landed surface still does **not**:

- poll in the background
- create or manage live sessions
- run `advance`, `execute_stage`, or `prepare_fork`
- infer tasks or manifests fuzzily
- auto-complete or auto-fail AK tasks
- reinterpret receipts into benchmark winners or recommendations
- invent an orchestrator-owned milestone schema for the manifest concern

## Code path

Primary package-local implementation artifacts:

- [`extensions/society-orchestrator.ts`](../../extensions/society-orchestrator.ts)
- [`src/runtime/autoresearch-manifest-campaign-supervision.ts`](../../src/runtime/autoresearch-manifest-campaign-supervision.ts)
- [`tests/autoresearch-manifest-campaign-supervision.test.mjs`](../../tests/autoresearch-manifest-campaign-supervision.test.mjs)
- [`tests/autoresearch-manifest-campaign-control-plane.test.mjs`](../../tests/autoresearch-manifest-campaign-control-plane.test.mjs)

Package truth reused from `pi-autoresearch`:

- `inspectLlamacppCampaignControl(...)`
- `buildLlamacppCampaignAkBindingDetails(...)`
- the existing manifest campaign projection artifact path/content

## Proof that landed

The added runtime/control-plane tests now prove:

1. exact-manifest observation stays one-shot and persists the same package projection artifact
2. `record_evidence` fails closed when task verification is not `verified_live`
3. unchanged `projection_key` values do not spam duplicate evidence rows
4. terminal-stage manifest milestones remain evidence-only and never call task completion/failure
5. the operator-facing tool contract requires an exact `taskId` for evidence writes and reports bounded results clearly

## Verification commands run

From `packages/pi-society-orchestrator`:

```bash
node --test tests/autoresearch-manifest-campaign-supervision.test.mjs tests/autoresearch-manifest-campaign-control-plane.test.mjs
npm run check
```

Task `#1703` refreshes the proof chain by keeping the supervision-specific tests green and adding guardrail coverage in the broader orchestrator seams:

```bash
node --test tests/autoresearch-manifest-campaign-supervision.test.mjs tests/autoresearch-manifest-campaign-control-plane.test.mjs tests/execution-seam-guardrails.test.mjs tests/runtime-shared-paths.test.mjs
```

The refreshed guardrails prove:

- orchestrator source reaches `pi-autoresearch` only through the package runtime seam, not by re-parsing manifest internals or importing narrower package files directly;
- the public tool contract advertises and exposes exact-anchor one-shot observation / evidence-only projection only, without polling, stage, or build inputs.

## Bottom line

The orchestrator now has the smallest truthful follow-on above manifest-driven `pi-autoresearch` campaign control:

- one-shot exact-manifest observation
- optional idempotent AK evidence projection from verified task context
- no polling
- no lifecycle mutation
- no second manifest control plane
