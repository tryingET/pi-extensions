---
summary: "Package-local contract note for the stable peer-messaging core, the intercom-compatible adapter, and the publish/release proof surface."
read_when:
  - "You need the package-local core-vs-adapter boundary without reopening the repo-level ADR."
  - "You are validating docs, examples, or publishable artifacts for @tryinget/pi-peer-messaging."
system4d:
  container: "Package-local contract note for the first bounded peer-messaging slice."
  compass: "Describe the core first, the intercom adapter second, and keep communication separate from authority."
  engine: "Read stable core -> read adapter constraints -> use the package validation and release-check commands."
  fog: "The main risk is letting intercom compatibility or examples drift into authority-bearing or orchestration-bearing claims."
---

# Intercom adapter contract — `@tryinget/pi-peer-messaging`

## Stable core first

The stable package contract is the same-machine communication primitive exported from `index.ts`:

- `PeerPresence`
- `PeerAttachment`
- `PeerMessage`
- `DeliveryResult`
- `PeerRuntimeStatus`
- `PeerMessagingRuntime`
- `createPeerMessagingRuntime()`
- `createStubPeerMessagingRuntime()`
- `PEER_MESSAGING_BOUNDARY`

These are the authority-bearing package semantics.
They define presence, addressing, direct `send`, bounded `ask`, reply correlation, and duplicate-name fail-closed behavior.
They do **not** define orchestration policy, execution ownership, or canonical evidence meaning.

## Adapter second

The `intercom` surface is a thin adapter over that core.
Its current public package-facing implementation lives at:

- `extensions/intercom.ts`
- `src/intercom-adapter.ts`

What the adapter adds:

- `intercom({ action: "list" })`
- `intercom({ action: "send" ... })`
- `intercom({ action: "ask" ... })`
- `intercom({ action: "reply" ... })`
- `intercom({ action: "pending" })`
- `intercom({ action: "status" })`, including a runtime-only `details.identityProof` that verifies the active peer session id is present in the broker presence list
- inbound message formatting plus exact reply hints

What the adapter must **not** do:

- redefine transport semantics
- turn message delivery into canonical completion
- smuggle orchestrator or ASC policy into the transport package
- widen the first slice into room, swarm, dashboard, or network semantics

## Handoff envelope ergonomics

The adapter-owned handoff preflight is deliberately small:

1. run `intercom({ action: "status" })`
2. require `details.identityProof.status === "verified"`
3. use `details.identityProof.exactPeerTarget` as the exact peer id in receiver preflight or delivery packets
4. send machine-readable envelopes as `context` or `file` attachments, preserving the bytes for owner commands that accept `--envelope-json` or stdin

The adapter may prove addressability and delivery metadata. It must not interpret a received envelope as task truth, evidence, closeout, or permission to mutate another owner surface.

## Operator examples

### Direct send

```ts
intercom({
  action: "send",
  to: "worker",
  message: "Please review src/runtime.ts before I commit.",
});
```

### Direct ask with bounded reply

```ts
intercom({
  action: "ask",
  to: "worker",
  message: "Should I keep the runtime adapter in this package or move it upward?",
});
```

### Duplicate-name disambiguation

When multiple peers share the same visible name, the adapter must fail closed and point the operator at exact ids:

```ts
intercom({ action: "send", to: "worker", message: "Need a decision." })
// → Message to "worker" was not delivered: Multiple peers matched "worker". Use the exact session id instead.
//   Matching peers: worker (worker-s) → worker-session-aaaaaaaa; worker (worker-s) → worker-session-bbbbbbbb
```

The corrective flow is:

1. `intercom({ action: "list" })`
2. pick the exact session id
3. retry with that exact id

```ts
intercom({
  action: "send",
  to: "worker-session-aaaaaaaa",
  message: "Need a decision.",
});
```

## Validation and release proof

From the package root:

```bash
npm run docs:list
npm run check
npm run release:check:quick
```

For the full tarball + installed-package smoke path:

```bash
npm run release:check
```

The publish/release surface is intentionally bounded:

- `files[]` declares the shipped artifact set
- `release:check:quick` proves the packed artifact and publish dry-run shape
- `release:check` additionally proves the installed package still exposes the `intercom` extension entry and its thin lifecycle/tool registration surface

## Non-goals

This package note does **not** approve:

- room/swarm semantics
- cross-machine transport
- treating replies as authority by convenience
- moving peer messaging ownership into ASC or orchestrator
