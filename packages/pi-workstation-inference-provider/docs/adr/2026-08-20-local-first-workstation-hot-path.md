---
summary: "Adopts workstation-first inference and removes contract/health I/O from ordinary provider requests."
read_when:
  - "Changing workstation provider startup, request routing, health checks, or cloud fallback posture."
---

# ADR: local workstation is the primary inference plane

## Status

Proposed implementation, validated in the accompanying patch bundle.

## Context

The owner operates a Threadripper workstation with an NVIDIA RTX 6000-class professional GPU and is a solo, local-first builder. The Pi package already exposes a provider over workstation-owned contracts. Adding Modal as a required intermediary would add network, queueing, authentication, deployment, and failure surfaces to the latency-critical voice path without creating value for the normal single-owner workload.

The existing adapter rereads and reparses contract files for every model request. Its health cache is bounded, but the first request after expiry performs a blocking probe and concurrent callers can converge on the same expiry boundary.

## Decision

1. Keep workstation `lane-op` as the runtime/model lifecycle authority.
2. Keep Pi as a read-only provider adapter for ordinary text inference.
3. Load contracts into immutable generations with an O(1) model index.
4. Refresh generations atomically and in the background after a TTL; explicit operator status/refresh waits for a fresh generation.
5. Prime endpoint health after provider registration.
6. Use stale-while-revalidate, singleflight health for ordinary text inference.
7. Preserve blocking health and all existing no-retry/authority constraints for governed audio.
8. Treat Modal only as optional overflow, travel, disaster-recovery, or larger-than-local-model capacity.

## Consequences

### Positive

- No contract filesystem I/O or JSON parsing on a ready ordinary request.
- No blocking health probe on the normal voice hot path.
- One probe per endpoint expiry instead of one probe per concurrent request.
- Contract refresh failures retain the previous known-good generation.
- The provider API and model identities stay stable.
- Local inference remains private and independent of internet availability.

### Negative

- Contract changes become visible after the bounded refresh TTL rather than on the next request.
- A stale healthy health verdict may allow one request to discover a newly failed endpoint through the actual provider transport.
- Warm local models consume power and VRAM even when idle.
- The runtime owner still needs separate admission control for concurrent voice and batch workloads.

## Rejected alternatives

### Modal as the default provider

Rejected for the primary path because it increases TTFT variance, recurring cost, and operational dependencies for a workstation that already has substantial local inference capacity.

### Health preflight on every request

Rejected because a preflight duplicates the real connection path, creates expiry stampedes, and can consume the entire voice latency budget when the endpoint is slow.

### Pi starts/stops or warms models

Rejected because runtime lifecycle remains owned by workstation `lane-op`; the adapter must not become a second scheduler.
