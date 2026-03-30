---
summary: "Session log for reconciling the subagent execution-boundary packet across pi-society-orchestrator and pi-autonomous-session-control, renaming the ADR, and materializing the next AK wave."
read_when:
  - "Reconstructing why the subagent/runtime architecture docs were reorganized into a single packet map."
  - "Reviewing when AK tasks #604-#606 were created for the ASC public execution-contract wave."
---

# 2026-03-30 — Reconcile the subagent execution-boundary packet

## What I did
- Re-read the cross-package subagent/runtime docs instead of treating the ADR in isolation:
  - `packages/pi-society-orchestrator/docs/project/2026-03-10-ui-capability-discovery.md`
  - `packages/pi-society-orchestrator/docs/project/2026-03-10-rfc-asc-public-execution-contract.md`
  - `packages/pi-society-orchestrator/docs/project/2026-03-10-architecture-convergence-backlog.md`
  - `packages/pi-society-orchestrator/docs/adr/2026-03-11-control-plane-boundaries.md`
  - `packages/pi-society-orchestrator/README.md`
  - `packages/pi-society-orchestrator/next_session_prompt.md`
  - `packages/pi-autonomous-session-control/README.md`
  - `packages/pi-autonomous-session-control/next_session_prompt.md`
  - `packages/pi-autonomous-session-control/docs/project/tool-surface-overview.md`
- Verified the code-level gap the docs were talking around:
  - ASC already owns the stronger runtime in `extensions/self.ts` + `extensions/self/subagent.ts`
  - orchestrator still carries a duplicate execution path in `src/runtime/subagent.ts`
  - ASC still lacks the package-level public execution seam proposed by the RFC
- Renamed the orchestrator ADR from `docs/adr/0001-control-plane-boundaries.md` to `docs/adr/2026-03-11-control-plane-boundaries.md` so the date/chronology is explicit.
- Reconciled the packet so the docs now state clearly:
  - discovery = evidence
  - ADR = boundary decision
  - RFC = seam proposal under the ADR
  - backlog = migration/HTN
- Added a single central packet entrypoint:
  - `packages/pi-society-orchestrator/docs/project/subagent-execution-boundary-map.md`
- Updated the orchestrator and ASC READMEs / handoff prompts to point at the packet map rather than leaving the reader to guess which doc is canonical for which question.
- Materialized the next implementation wave in AK:
  - `#604` expose ASC public execution contract
  - `#605` add parity harness
  - `#606` adopt ASC runtime in orchestrator and retire duplicate path

## What I deliberately did not do
- I did not start the runtime code refactor itself in this pass.
- I did not treat dashboard polish or a new helper package as the next truthful wave.
- I did not reopen the prompt-plane boundary; that remains deferred to the upstream vault boundary.

## Result
- The subagent/runtime docs now read as one packet instead of a contradictory pile.
- The ADR filename now reflects its date and no longer looks like an undated orphan next to dated RFCs.
- There is now one central file to answer "what is what":
  - `packages/pi-society-orchestrator/docs/project/subagent-execution-boundary-map.md`
- AK has a concrete three-step execution wave instead of leaving the public execution seam as prose-only intent.
