---
summary: "Campaign contract for dogfooding pi-autoresearch by traversing its own workflow and fixing product blockers."
read_when:
  - "Before starting or interpreting the workflow-traversal dogfood campaign."
  - "When deciding whether a dogfood finding is a metric result, a product blocker, or an external-promotion concern."
type: "campaign-contract"
system4d:
  container: "Package-local dogfood campaign contract for the pi-autoresearch workflow itself."
  compass: "Use the runtime as the bounded harness while treating workflow friction as the product problem."
  engine:
    invariants:
      - "The primary metric is unresolved workflow/product blockers, not runtime duration."
      - "Every encountered blocker is fixed, explicitly deferred, or recorded with an owner before campaign closeout."
      - "Duration remains a secondary regression-smoke signal only."
  fog:
    risks:
      - "A clean package check is mistaken for a clean operator workflow."
      - "A duration delta is overread as product progress."
      - "Dogfood issues are patched chat-locally without becoming executable contract checks."
---

# Dogfood workflow campaign contract

## Objective

Complete a full supervised `pi-autoresearch` workflow traversal on `pi-autoresearch` itself and reduce unresolved workflow/product blockers to zero.

The campaign is about whether an operator can get through the product loop cleanly:

```text
objective -> measurement contract -> setup/baseline -> calibration/candidate run -> status interpretation -> closeout packet -> explicit external-promotion decision
```

## Primary metric

```text
METRIC unresolved_dogfood_blockers=<number>
```

- unit: `count`
- direction: `lower`
- authority: product/workflow readiness for this package only
- success threshold: `0`

A blocker is any issue encountered while traversing the workflow that would make a careful operator stop, guess, overclaim, mutate through the wrong surface, or distrust the result.

Examples:

- stale docs or examples that do not match actual tool schemas;
- generated next tool calls that are not executable or omit required safety fields;
- read/status paths that persist snapshots unexpectedly;
- metric posture text that encourages overclaiming noisy or stale results;
- closeout/finalization behavior that cannot be reviewed safely;
- missing regression coverage for a workflow bug found during dogfooding.

## Secondary signal

`total_ms` from `autoresearch.sh` remains a secondary regression-smoke signal only. It can catch dramatic slowdowns, but it is not campaign success authority for this workflow-traversal pass.

## Executable benchmark

Run:

```bash
node scripts/dogfood-workflow-contract.mjs
```

The script emits the primary metric and contract lines for known executable checks. When a new dogfood blocker is found, either:

1. fix it and add/update an executable contract check, or
2. explicitly defer it with an owner and rationale in the campaign closeout.

## Checks command

Run:

```bash
npm run check
```

Package validation is required, but it is not sufficient. The campaign can only close cleanly when both are true:

1. `unresolved_dogfood_blockers=0`; and
2. `npm run check` passes.

## Scope

In scope:

- `packages/pi-autoresearch/docs/project/dogfood-playbook.md`
- `packages/pi-autoresearch/docs/project/product-posture.md`
- `packages/pi-autoresearch/docs/project/dogfood-workflow-campaign-contract.md`
- `packages/pi-autoresearch/extensions/pi-autoresearch.ts`
- `packages/pi-autoresearch/src/core/runtime.ts`
- `packages/pi-autoresearch/src/core/finalize.ts`
- `packages/pi-autoresearch/src/toolboxBundle.ts`
- `packages/pi-autoresearch/tests/**`
- `packages/pi-autoresearch/scripts/dogfood-workflow-contract.mjs`

Off limits unless explicitly authorized:

- direct AK/KES/issue-tracker writes;
- Prompt Vault template mutation;
- ontology/ROCS mutation;
- unrelated monorepo package changes;
- unrelated pre-existing `ontology/dist/*` dirty files.

## Start condition

Start from the current package worktree, acknowledging that it already contains the effect-boundary hardening changes. This campaign is therefore not a clean A/B performance experiment. It is a supervised workflow-readiness traversal.

## Close condition

The segment is closeout-ready when:

- the primary metric is `0`;
- package checks pass;
- status/closeout can be generated without hidden authority drift;
- every blocker found during traversal is fixed or explicitly deferred with an owner.
