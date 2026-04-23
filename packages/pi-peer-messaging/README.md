# @tryinget/pi-peer-messaging

Stable core contract for the accepted same-machine peer-session messaging primitive in `pi-extensions`.

## Current posture

PM-1 established the stable core contract.
PM-2 now adds the deterministic same-machine broker/client presence runtime while keeping the package **private/source-first** until PM-5 handles publish/release proofing.

Current posture:

- the package is separate from `pi-society-orchestrator`
- the package is separate from `pi-autonomous-session-control`
- same-machine runtime, path, framing, spawn, and presence behavior now live here
- direct `send` / correlated `ask` semantics and the `intercom`-compatible adapter are still deferred to follow-on tasks

## What this package owns right now

The package now makes both the stable core and PM-2 runtime surface explicit:

- `PeerPresence`
- `PeerAttachment`
- `PeerMessage`
- `DeliveryResult`
- `PeerRuntimeStatus`
- `PeerMessagingRuntime`
- `DEFAULT_ASK_TIMEOUT_MS`
- `PEER_ATTACHMENT_TYPES`
- `PEER_MESSAGING_BOUNDARY`
- runtime-shape assertion helpers
- presence helpers such as runtime-only fallback alias resolution
- local path/framing helpers for same-machine IPC
- `createPeerMessagingRuntime()` for broker spawn/reconnect and local presence registration/listing/status
- `createStubPeerMessagingRuntime()` for contract-first development where PM-2 runtime behavior is not needed

## Boundary guardrails

The exported contract keeps these decision-level rules visible:

- same-machine only
- communication only, never canonical authority by convenience
- duplicate visible names fail closed
- session-id targeting wins over address-label targeting
- `ask` keeps a bounded documented default timeout and explicit reply correlation
- runtime fallback aliases are addressability-only and non-persistent
- one in-flight `ask` per local session in the first stable contract
- the first stable adapter remains an `intercom`-compatible concern above this core, not the authority model itself

## Still not in PM-2

This package does **not** yet implement:

- public direct `send` / correlated `ask` runtime semantics
- tool/overlay adapters
- orchestrator or ASC policy helpers
- any networked or cross-machine behavior

## Validation

```bash
npm run check
```
