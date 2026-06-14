---
summary: "@tryinget/pi-peer-messaging package overview."
read_when:
  - "Orienting to this package or directory before changing its behavior."
---

# @tryinget/pi-peer-messaging

Stable core contract for the accepted same-machine peer-session messaging primitive in `pi-extensions`.

- Workspace path: `packages/pi-peer-messaging`
- Release component key: `pi-peer-messaging`
- First public adapter: `intercom`

## Package posture

This package now lands the full first bounded slice:

- PM-1 — stable core contract
- PM-2 — deterministic same-machine broker/client presence runtime
- PM-3 — fail-closed direct `send` / correlated `ask` semantics
- PM-4 — thin `intercom`-compatible tool adapter over the stable core
- PM-5 — package docs, validation surface, and release-proofing

The package stays intentionally narrow:

- separate from `pi-society-orchestrator`
- separate from `pi-autonomous-session-control`
- same-machine only
- communication only, never canonical authority by convenience
- no room/swarm/network semantics in this first slice

## Stable core first

The stable package contract is the communication primitive exported from `index.ts`:

- `PeerPresence`
- `PeerAttachment`
- `PeerMessage`
- `DeliveryResult`
- `PeerRuntimeStatus`
- `PeerMessagingRuntime`
- `DEFAULT_ASK_TIMEOUT_MS`
- `PEER_ATTACHMENT_TYPES`
- `PEER_MESSAGING_BOUNDARY`
- `createPeerMessagingRuntime()`
- `createStubPeerMessagingRuntime()`

Decision-level guardrails kept visible by the package:

- duplicate visible names fail closed
- exact session id targeting wins over name-like targeting
- `ask` uses explicit reply correlation
- `ask` keeps a bounded documented default timeout
- one in-flight `ask` per local session in the first stable contract
- runtime fallback aliases are addressability-only and non-persistent

## Intercom-compatible adapter second

The first public adapter is the package-local `intercom` tool surface exposed by:

- `extensions/intercom.ts`
- `src/intercom-adapter.ts`

It is useful on purpose, but it is still only an adapter.
It does **not** redefine the authority model.

For controller-spawned visible peer agents, the adapter can classify and watch the bounded `PEER_ACK` / `PEER_FINAL` message protocol by canonical `peerRunId` without depending on unresolved pending replies. The legacy `QUEST_ACK` / `QUEST_FINAL` protocol by `questId` remains supported as a compatibility alias. `list`/`status` expose pending inbound counts and last-seen freshness cues so stale or waiting peers are visible before targeting them. This is supervision of communication state only; it does not make peer messages durable evidence, merge authority, or completion truth by itself.

Supported actions:

- `intercom({ action: "list" })`
- `intercom({ action: "send", ... })`
- `intercom({ action: "ask", ... })`
- `intercom({ action: "reply", ... })`
- `intercom({ action: "pending" })`
- `intercom({ action: "peer_status", peerRunId: "..." })`
- `intercom({ action: "peer_watch", peerRunId: "...", waitFor: "final", timeoutMs: 30000 })`
- `intercom({ action: "quest_status", questId: "..." })` — compatibility alias for legacy quest protocol messages
- `intercom({ action: "quest_watch", questId: "...", waitFor: "final", timeoutMs: 30000 })` — compatibility alias for legacy quest protocol messages
- `intercom({ action: "status" })`

## Install

Local package install during development:

```bash
pi install /home/tryinget/ai-society/softwareco/owned/pi-extensions/packages/pi-peer-messaging
```

Published-package install once released:

```bash
pi install npm:@tryinget/pi-peer-messaging
```

Then in Pi:

1. run `/reload`
2. verify `intercom({ action: "status" })`
3. verify a real `send` / `ask` flow across two sessions

## Operator examples

### Direct send

```ts
intercom({
  action: "send",
  to: "worker",
  message: "Please review src/runtime.ts before I commit.",
});
```

### Direct ask

```ts
intercom({
  action: "ask",
  to: "worker",
  message: "Should I keep the adapter here or move it into a higher-level package?",
});
```

### Duplicate-name disambiguation

When multiple peers share the same visible name, the adapter fails closed and points you at exact ids:

```ts
intercom({ action: "send", to: "worker", message: "Need a decision." })
// → Message to "worker" was not delivered: Multiple peers matched "worker". Use the exact session id instead.
//   Matching peers: worker (worker-s) → worker-session-aaaaaaaa; worker (worker-s) → worker-session-bbbbbbbb
```

Truthful recovery path:

1. `intercom({ action: "list" })`
2. choose the exact session id
3. retry with that exact id

```ts
intercom({
  action: "send",
  to: "worker-session-aaaaaaaa",
  message: "Need a decision.",
});
```

## Handoff identity preflight and envelope transport

For owner-surface handoffs, use `intercom({ action: "status" })` as the Pi-side identity preflight before sending a packet. The status response includes `details.identityProof` plus an `Exact peer target` line. Treat the proof as runtime communication state only: it verifies the active Pi peer address for delivery, but it is not AK evidence, task authority, or completion truth.

Minimal handoff flow:

1. sender runs `intercom({ action: "status" })` and requires `details.identityProof.status === "verified"`
2. sender copies `details.identityProof.exactPeerTarget` into any receiver preflight or handoff packet that needs an exact peer id
3. sender uses `intercom({ action: "send", to: "<exact-session-id>", ... })` for delivery
4. attach machine-readable command packets as `context` or `file` attachments rather than embedding them in prose

Example envelope attachment:

```ts
intercom({
  action: "send",
  to: "session-...",
  message: "AK receiver command packet; communication-only delivery, not evidence.",
  attachments: [
    {
      type: "context",
      name: "ak-receiver-envelope.json",
      content: JSON.stringify(envelope, null, 2),
      language: "json",
    },
  ],
});
```

Receiver-side tooling may feed that exact JSON to its owner command through `--envelope-json` or stdin when supported. The transport package does not interpret the envelope as authority; it only delivers the bytes and exact reply/target metadata.

## Peer report-back protocol

Canonical visible-peer report-back messages use `peerRunId`:

```text
PEER_ACK peer_run_id=<id>: started
PEER_FINAL peer_run_id=<id>: final report
```

Legacy quest messages remain accepted for compatibility:

```text
QUEST_ACK quest_id=<id>: started
QUEST_FINAL quest_id=<id>: final report
```

`peer_status` / `peer_watch` and `quest_status` / `quest_watch` read a small in-memory protocol ledger maintained by the adapter when inbound messages arrive. Canonical `PEER_* peer_run_id=...` and legacy `QUEST_* quest_id=...` snapshots are isolated by vocabulary even if a run id string collides, so a legacy quest final cannot satisfy a canonical peer watch. Replying to or clearing pending messages does not erase the ACK/FINAL snapshot. The ledger is runtime memory only and remains communication state, not AK evidence or workflow authority.

## Runtime dependencies

This package expects Pi host runtime APIs and declares them as peer dependencies:

- `@earendil-works/pi-coding-agent`
- `@earendil-works/pi-ai`

## Package checks

From the package directory:

```bash
npm install
npm run docs:list
npm run check
npm run release:check:quick
```

Full tarball + installed-package smoke path:

```bash
npm run release:check
```

From the monorepo root:

```bash
bash ./scripts/package-quality-gate.sh ci packages/pi-peer-messaging
npm run release:contracts:validate
```

## Docs discovery

```bash
npm run docs:list
npm run docs:list:workspace
npm run docs:list:json
```

Package-local contract note:

- [docs/project/intercom-adapter-contract.md](docs/project/intercom-adapter-contract.md)

## Release metadata

This package now ships a publishable component surface.
The bounded release proof comes from:

- `files[]` in `package.json`
- `scripts/release-check.sh`
- `scripts/release-smoke.sh`
- `x-pi-template.workspacePath`
- `x-pi-template.releaseComponent`
- `x-pi-template.releaseConfigMode`

Monorepo release automation stays root-owned.
This package only owns truthful package-local metadata and proof surfaces.

## Non-goals

This package does **not** approve:

- orchestration policy inside the transport primitive
- execution/runtime ownership changes
- dashboard or room semantics
- cross-machine transport
- treating message delivery or reply receipt as canonical completion
