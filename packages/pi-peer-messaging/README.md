# @tryinget/pi-peer-messaging

Stable core contract for the accepted same-machine peer-session messaging primitive in `pi-extensions`.

## PM-1 posture

This first slice is intentionally **contract-first**:

- the package is separate from `pi-society-orchestrator`
- the package is separate from `pi-autonomous-session-control`
- the package currently stays **private/source-first** while PM-5 handles publish/release proofing
- runtime delivery, broker/client behavior, and the `intercom`-compatible adapter are deferred to follow-on tasks

## What this package owns right now

The scaffold makes the stable core explicit:

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
- `createStubPeerMessagingRuntime()` for contract-first development before the real runtime lands

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

## Not in PM-1

This package does **not** yet implement:

- broker spawn/reconnect
- same-machine IPC framing or path handling
- peer registration/listing runtime behavior beyond contract wrappers
- direct `send` / correlated `ask` runtime semantics
- tool/overlay adapters
- orchestrator or ASC policy helpers

## Validation

```bash
npm run check
```
