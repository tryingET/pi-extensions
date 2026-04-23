---
summary: "Package-local guardrails for the peer-session messaging primitive scaffold."
read_when:
  - "You are editing files under packages/pi-peer-messaging/."
type: "reference"
---

# AGENTS.md — pi-peer-messaging

## Scope
This package owns the communication-only stable core plus the same-machine broker/client runtime for peer-session messaging.
PM-3 now lands fail-closed direct `send` / correlated `ask` semantics over that runtime.
The `intercom`-compatible adapter still lands in a later task.

## Guardrails
- Keep the package communication-only; do not treat messages or replies as canonical authority, evidence, or workflow completion.
- Preserve same-machine language, deterministic local IPC/runtime behavior, and runtime-only fallback aliases for unnamed sessions.
- Preserve fail-closed duplicate-name delivery semantics, exact session-id targeting, explicit reply correlation, and the one-in-flight `ask` rule in the exported runtime behavior.
- Keep orchestrator and ASC as future consumers, not owners of transport semantics.
- Keep the `intercom`-compatible surface as an adapter concern above the core contract.

## Validation
- `npm run check`
