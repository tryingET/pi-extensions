# @tryinget/pi-peer-messaging

Stable core contract for the accepted same-machine peer-session messaging primitive in `pi-extensions`.

## Current posture

PM-1 established the stable core contract.
PM-2 added the deterministic same-machine broker/client presence runtime.
PM-3 now lands fail-closed direct `send` / correlated `ask` semantics while keeping the package **private/source-first** until PM-5 handles publish/release proofing.

Current posture:

- the package is separate from `pi-society-orchestrator`
- the package is separate from `pi-autonomous-session-control`
- same-machine runtime, path, framing, spawn, and presence behavior live here
- fail-closed direct `send` / correlated `ask` semantics now live here
- `send` fails closed as a `DeliveryResult`, while `ask` fails closed by rejecting on delivery failure, timeout, disconnect, or ambiguous reply correlation
- the `intercom`-compatible adapter is still deferred to a follow-on task

## What this package owns right now

The package now makes the stable core plus the PM-2 / PM-3 runtime surface explicit:

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
- `createPeerMessagingRuntime()` for broker spawn/reconnect, local presence registration/listing/status, direct `send`, direct `ask`, and inbound message subscription helpers
- `createStubPeerMessagingRuntime()` for contract-first development where the live runtime is not needed

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

## Still not in PM-3

This package does **not** yet implement:

- the `intercom`-compatible tool / overlay adapter
- orchestrator or ASC policy helpers
- any networked or cross-machine behavior

## Validation

```bash
npm run check
```
