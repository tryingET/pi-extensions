---
summary: "End-to-end proof that a bounded pi-autoresearch campaign can flow through the supervisor and land as attached AK milestone evidence."
read_when:
  - "Before claiming the autoresearch supervisor/projector path is proven beyond mapping and unit tests."
  - "When you need the exact bounded proof that closes task 1477 and the final verification item from the AK projection contract."
type: "reference"
system4d:
  container: "Repo-root cross-package proof note for the bounded pi-autoresearch -> supervisor -> AK evidence path."
  compass: "Prove one truthful campaign milestone can become durable AK evidence without making AK the runtime-state owner."
  engine: "Bootstrap isolated AK state -> seed bounded campaign receipts and ledger -> derive runtime status -> project a milestone -> confirm attached evidence and dedupe."
  fog: "The main risk is treating lower-level unit tests as end-to-end proof or overstating this slice as full campaign automation."
---

# End-to-end proof — `pi-autoresearch` supervisor to AK evidence

## Why this note exists

The projection contract in [pi-autoresearch AK milestone projection contract](./pi-autoresearch-ak-projection-contract.md) named four verification requirements:

1. mapping proof
2. negative-path proof
3. idempotence proof
4. **end-to-end proof**

Tasks `#1475` and `#1476` already landed the supervisor and AK projector implementation, and their package tests cover mapping, fail-closed behavior, and dedupe logic.
What remained for task `#1477` was the last item: prove that a **real bounded `pi-autoresearch` campaign snapshot** can move through the orchestrator path and produce an attached AK milestone evidence row.

This note records that bounded proof.

## Proof goal

Demonstrate all of the following in one isolated run:

1. package-local `pi-autoresearch` artifacts can describe a real campaign state
2. the supervisor observes that state as a projectable milestone
3. the projector writes one attached AK evidence row through the real `ak` path
4. re-projecting the unchanged snapshot does **not** append a second milestone row

## Proof shape

The proof stayed intentionally bounded and isolated:

- **AK DB:** a temporary isolated `society.db`, not the workspace's live task DB
- **Repo anchor:** the real repo root `/home/tryinget/ai-society/softwareco/owned/pi-extensions`, bootstrapped into that temp DB
- **AK task anchor:** one temporary task created in the temp DB for the proof run
- **Campaign cwd:** a temporary path under `diary/.tmp-autoresearch-proof/campaigns/widget-speed`, removed after the run
- **Runtime source:** actual `pi-autoresearch` receipt and ledger helpers from `packages/pi-autoresearch/src/runtime.ts`
- **Projection path:** actual `projectAutoresearchAkMilestone(...)` from `packages/pi-society-orchestrator/src/runtime/autoresearch-ak-projector.ts`
- **Evidence write mode:** real `ak evidence record`, not a stubbed call and not SQL fallback

## What the proof seeded

The proof created the smallest truthful campaign that still reaches a stable projectable checkpoint:

1. one config receipt for segment `widget-speed`
2. one matching `CONFIGURE_SEGMENT` ledger event
3. one baseline run receipt with metric `total_ms=24.1`
4. matching run/check/receipt-recorded ledger events

That produces a runtime projection in state:

- `awaiting_decision`

Which the supervisor maps to milestone:

- `decision-required`

## Observed result

The proof run produced the expected cross-package outcome:

| step | observed result |
|---|---|
| runtime projection | `awaiting_decision` |
| first projector call | `ok=true`, `action=recorded` |
| evidence write path | `via=ak` |
| attached AK row | `check_type=autoresearch:milestone:decision-required`, `result=pass` |
| second projector call | `ok=true`, `action=already-projected` |
| dedupe evidence id | existing evidence row reused instead of inserting a duplicate |

The key evidence row written into the isolated DB had the compact contract fields expected by the projection note:

```json
{
  "check_type": "autoresearch:milestone:decision-required",
  "result": "pass",
  "milestone": "decision-required",
  "runtime_state": "awaiting_decision",
  "summary": "1 runs recorded; best total_ms is 24.1 ms; awaiting next bounded decision."
}
```

The second projector call returned `already-projected`, showing the unchanged `projection_key` was honored and the proof did not create duplicate milestone noise.

## What this proves

This closes the exact end-to-end gap left open by the earlier contract and package-level implementation tasks:

- the package runtime can emit a truthful campaign snapshot
- the supervisor can classify that snapshot into a coarse milestone
- the projector can attach that milestone to an AK task through the real CLI-backed evidence path
- unchanged polls remain idempotent

## What this does **not** prove

This proof should **not** be read as having implemented any of the following:

- automatic AK task creation for live campaigns
- automatic `ak task complete` / `ak task fail`
- autonomous multi-step campaign supervision
- Prompt Vault-driven decision execution inside the live loop
- installed-package release smoke for this path

Those are separate bounded slices.
This proof only establishes that the current package/runtime + supervisor + projector seam already works for at least one real milestone write.

## Verification run

The proof was verified with three layers:

1. **package regression checks**
   ```bash
   cd packages/pi-society-orchestrator && node --test tests/autoresearch-supervisor.test.mjs tests/autoresearch-ak-projector.test.mjs
   ```
2. **isolated end-to-end proof command**
   - bootstrapped the repo into a temp AK DB
   - created a temp AK task anchor
   - seeded a bounded campaign under `diary/.tmp-autoresearch-proof/`
   - called the real projector twice
   - queried the resulting evidence row from the temp DB
3. **scoped strict docs validation**
   ```bash
   node ~/ai-society/core/agent-scripts/scripts/docs-list.mjs --docs <temp-copy-root> --strict
   ```

The exact command transcript and scoped validation notes are captured in:

- `diary/2026-04-16--pi-autoresearch-e2e-proof.md`

## Bottom line

Task `#1477` is complete when read as the bounded proof slice that shows:

- a real `pi-autoresearch` campaign snapshot can be observed by the supervisor
- that snapshot can be projected into one attached AK milestone evidence row through `pi-society-orchestrator`
- re-projecting the unchanged state does not append duplicate evidence

That is the smallest truthful end-to-end proof required by the AK projection contract.
