## 14. Protocol, canonical identity, and call linearization

### 14.1 Transport versus semantics

Protocol Buffers over an owner-only Unix stream socket remain the transport. Generated messages are wire DTOs only. They are converted immediately to closed semantic domain types.

Protobuf bytes MUST NOT be used as persistent canonical digests because deterministic Protobuf serialization is not canonical across languages, builds, or schema evolution.

### 14.2 Canonical semantic encoding

Every hashed IR uses the package deterministic-CBOR profile:

```text
SHA256(
  UTF8("pi-tool-boundary/<artifact-kind>/v1\0")
  || deterministic_cbor(semantic_body_without_digest)
)
```

The profile permits only integers, byte strings, UTF-8 text already normalized by the relevant semantic type, arrays, maps with fixed integer field keys, booleans, and null. It forbids floating point, indefinite lengths, duplicate keys, tags unless explicitly assigned, and non-preferred integer encodings.

Golden vectors specify source JSON, normalized IR, CBOR hex, and SHA-256 and MUST pass independently in Rust and TypeScript.

### 14.3 Frame and version limits

Top-level Protobuf frames use a fixed unsigned length prefix and strict per-message size bounds. Unknown major versions and unknown security-significant enum values fail closed. Minor negotiation cannot remove a required plan feature.

### 14.4 D0 call state

D0 read calls use:

```text
RECEIVED
-> VALIDATED
-> VOLATILE_ACCEPTED
-> QUEUED
-> STARTED
-> TERMINAL
```

D0 acceptance may be lost on daemon crash. Re-execution is acceptable only because the operation is mechanically read-only and non-authoritative. D0 does not advance workspace generation and does not require per-call SQLite fsync. A bounded audit event is buffered and may be sampled according to policy.

### 14.5 D1 call state

D1 calls use:

```text
RECEIVED
-> VALIDATED
-> DURABLE_ADMISSION_COMMITTED
-> QUEUED
-> MUTATION_TOKEN_ACQUIRED
-> STARTED
-> DISPOSING
-> DURABLE_TERMINAL_COMMITTED
-> TERMINAL_RETURNED
```

The successful insert/commit of `(call_id, request_digest, client_epoch)` is the D1 admission linearization point. No effect begins before it.

### 14.6 D2 reservation

D2 schema and state names are reserved for future external dispatch. No Release 0.1 operation may construct D2. A future D2 plan must durably record pre-dispatch intent before external bytes can leave.

### 14.7 Idempotency and epochs

Call IDs are UUIDv7 and unique across sessions/restarts. Client epochs change whenever a Pi client process/session registration is replaced. Duplicate D1 call ID with identical request digest returns existing state; mismatch is a protocol-integrity fault. A new epoch cannot adopt a nonterminal effectful call without explicit recovery rules.

### 14.8 Streaming credits

Output chunks carry call ID, stream, monotonic sequence, bytes, and truncation state. The client grants bounded credits. The daemon and guest keep bounded buffers and backpressure the child where possible. Credit exhaustion cannot block cancellation, heartbeats, or terminal control messages.

### 14.9 Cancellation linearization

- already durable terminal: terminal wins;
- durable cancel request before terminal: cancellation owns cleanup;
- queued D0/D1 before start: pre-effect cancellation;
- started D1: known cancellation only after descendants empty and workspace disposition known;
- transport uncertainty: return unknown, never invented success.

D0 may be safely reissued with a new call ID after unknown transport if the operation remains mechanically read-only. D1 may not.
