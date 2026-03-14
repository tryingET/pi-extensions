---
summary: "Plan for VRE-08 replay core in pi-vault-client: deterministic local replay by execution_id with drift/unavailable classification."
read_when:
  - "Executing VRE-08 from the receipts/replay backlog."
  - "Before adding replay command/tool surfaces in a later slice."
system4d:
  container: "Focused package plan for replay-core delivery before operator surfaces exist."
  compass: "Reuse the existing receipt/runtime contracts, keep replay local-first, and classify truthfully instead of guessing."
  engine: "Reconstruct receipt -> resolve recorded company/template state -> regenerate -> classify -> test -> update handoff docs."
  fog: "Main risks are replaying under the wrong company context, silently rediscovering different grounding frameworks, or introducing a surface before the core contract is stable."
---

# Plan: VRE-08 replay core and drift classification

## Scope
Implement internal replay-core helpers for local receipt replay by `execution_id` in `pi-vault-client`, covering the current receipt surfaces without adding the user-facing replay command/tool yet.

## Acceptance criteria
- Replay loads a local receipt by `execution_id` and regenerates prepared prompt text from replay-safe inputs.
- Replay classifies `match`, `drift`, or `unavailable` with explicit reasons including at least:
  - `template-missing`
  - `version-mismatch`
  - `render-mismatch`
  - `company-mismatch`
  - `missing-input-contract`
- Replay supports the currently emitted receipt shapes:
  - `vault-selection`
  - `route-request`
  - `grounding-request`
- Grounding replay uses stored framework-resolution provenance rather than rediscovering frameworks opportunistically.
- Focused tests prove:
  - same-version replay match
  - controlled drift detection
  - unavailable classification for missing template, bad company, and missing input contract
- `npm run typecheck` and `npm run check` pass.

## Risks
- Replaying under ambient cwd/company instead of recorded company would produce false drift.
- Route replay can drift if it does not reuse the same route-wrapper shape as the live command path.
- Grounding replay can lie if it reruns discovery instead of honoring stored selected framework names.
- Adding the operator-facing replay surface in this slice would widen scope and entangle UX with core classification semantics.

## Planned files
- `src/vaultTypes.ts`
- `src/vaultReceipts.ts`
- `src/vaultGrounding.ts`
- `src/vaultCommands.ts`
- `src/vaultRoute.ts`
- `src/vaultReplay.ts`
- `tests/vault-replay.test.mjs`
- `docs/dev/vault-execution-receipts.md`
- `diary/2026-03-12-vre-08-replay-core.md`
- `NEXT_SESSION_PROMPT.md`
