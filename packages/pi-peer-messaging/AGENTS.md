---
summary: "Package-local guardrails for the peer-session messaging primitive scaffold."
read_when:
  - "You are editing files under packages/pi-peer-messaging/."
type: "reference"
---

# AGENTS.md — pi-peer-messaging

## Scope
This package owns the communication-only stable core for same-machine peer-session messaging.
PM-1 is intentionally contract-first: runtime delivery, broker/client behavior, and the `intercom`-compatible adapter land in later tasks.

## Guardrails
- Keep the package communication-only; do not treat messages or replies as canonical authority, evidence, or workflow completion.
- Preserve same-machine language and fail-closed duplicate-name delivery semantics in the exported contract.
- Keep orchestrator and ASC as future consumers, not owners of transport semantics.
- Keep the `intercom`-compatible surface as an adapter concern above the core contract.

## Validation
- `npm run check`
