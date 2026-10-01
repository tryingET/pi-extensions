---
summary: "Operator-approved Society context reliability architecture; AK decision carries its runtime adoption state."
system4d:
  container: "Technical projection of AK decision 169."
  compass: "Preserve consumer/producer authority boundaries."
  engine: "Adopt architecture -> implement -> independently prove behavior."
  fog: "The ADR is not a runtime decision state store or delivery receipt."
read_when:
  - "Changing Society context health, freshness, scheduling, recovery or startup snapshot authority reuse."
---
# Society context reliability

Decision authority: AK decision 169, accepted and unblocked. Operator approved the independently inspected architecture on 2026-10-01. This ADR records the technical choice; implementation, publication and live verification remain separate obligations.

Adopt the [design packet](../project/2026-10-01-context-reliability-design.md) and [implementation/verification plan](../project/2026-10-01-context-reliability-plan.md), with the [inspection dispositions](../project/2026-10-01-context-reliability-inspection.md).

- Distinguish collection completion, source health and freshness; only healthy fresh context is ready.
- Serialize consumer AK reads through the unchanged published wrapper; keep prompt responsiveness independent of background read budgets.
- Use generation-safe single-flight publication/consumption, demand-driven degraded recovery with bounded jitter/backoff, and healthy TTL.
- Validate surface payload semantics and report unavailable authority as unknown, never drift or an empty verified queue.
- Own and drain reader process groups on cancellation/deadlines, with explicit cleanup-failure and containment limits.
- Optimize startup-only readiness by reusing successful canonical repository source admission inside each transaction attempt. Preserve all existing task fact checks, budgets, sorting, complete queue/count/sample semantics and ordinary uncached paths.
- Preserve source ownership: Pi owns its UX/lifecycle; AK owns authority/readiness and binary/policy publication. No database-lock bypass, engine rotation or direct live DB repair.

Consequences: initial healthy background collection can legitimately exceed the prompt wait; degraded results are no longer permanently cached as ready; retries and TTL deliberately trade freshness/load. Producer work remains history-dependent and must not be described as constant-time. Candidate and promoted proofs are separate and must bind exact binaries/packages. A design approval is not completed implementation behavior.
