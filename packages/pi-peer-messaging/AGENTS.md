---
summary: "Package-local guardrails for the peer-session messaging primitive scaffold."
read_when:
  - "You are editing files under packages/pi-peer-messaging/."
type: "reference"
---

# AGENTS.md — pi-peer-messaging

## Scope
This package owns the communication-only stable core and same-machine broker/client presence runtime for peer-session messaging.
PM-2 lands deterministic local runtime, path, framing, spawn, and presence behavior.
Direct `send` / correlated `ask` semantics and the `intercom`-compatible adapter still land in later tasks.

## Guardrails
- Keep the package communication-only; do not treat messages or replies as canonical authority, evidence, or workflow completion.
- Preserve same-machine language, deterministic local IPC/runtime behavior, and runtime-only fallback aliases for unnamed sessions.
- Preserve fail-closed duplicate-name delivery semantics in the exported contract even where public `send` / `ask` remain deferred.
- Keep orchestrator and ASC as future consumers, not owners of transport semantics.
- Keep the `intercom`-compatible surface as an adapter concern above the core contract.

## Validation
- `npm run check`
