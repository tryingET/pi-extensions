---
summary: "Plan for freezing the additive Vault Execution Receipt v1 architecture before runtime implementation begins in pi-vault-client."
read_when:
  - "Executing VRE-01 from the receipts/replay backlog."
  - "Before implementing receipt types, sinks, or replay behavior."
system4d:
  container: "Focused package plan for the first receipts/replay architecture slice."
  compass: "Freeze the contract early so later receipt/runtime tasks stay additive and local-first."
  engine: "Read current execution surfaces -> define receipt v1 -> define rollout and privacy boundary -> validate docs-only slice."
  fog: "The main risk is leaving replay or privacy semantics implicit and forcing a schema or storage redesign mid-implementation."
---

# Plan: Vault Execution Receipt architecture

## Scope
Author `docs/dev/vault-execution-receipts.md` as the v1 architecture note for additive execution receipts and replay in `pi-vault-client`.

## Acceptance criteria
- The note defines receipt purpose, schema v1, sink abstraction, privacy boundary, replay contract, rollout phases, and open decisions.
- Terminology is explicit for `invocation_surface`, `invocation_channel`, `selection_mode`, `company_source`, and `llm_tool_call`.
- The note explains why phase 1 intentionally avoids a Prompt Vault schema migration.
- `npm run typecheck` and `npm run check` pass after the docs-only slice.

## Risks
- Under-specifying replay-safe inputs could force later receipt builders to widen scope mid-implementation.
- Over-coupling the design to Prompt Vault DB writes would violate the additive local-first rollout.
- Assuming tool-call provenance is always available would make the receipt contract lie on current slash-command and live-trigger paths.

## Planned files
- `docs/dev/vault-execution-receipts.md`
- `next_session_prompt.md`
