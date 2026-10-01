---
summary: "Proposed cross-owner Society context reliability design for AK6391/AK6392, grounded in reproduced timeouts and durable-cache failure."
system4d:
  container: "Cross-owner context reliability architecture projection."
  compass: "Truthful source health and bounded recovery without authority drift."
  engine: "Inspect -> adopt -> implement -> check -> separately prove runtime."
  fog: "Accepted design is not implementation or deployed behavior proof."
read_when:
  - "Implementing or inspecting Society context health, freshness, collection and recovery."
---
# Society context reliability design packet

Status: architecture accepted by AK decision 169 (unblocked); implementation/publication/live proof remain pending. Execution owners: AK6391 (Pi consumer), AK6392 (AK producer). AK decision state is authoritative; this document is its RFC projection. Operator authorized end-to-end implementation, inspection, dogfood and publication on 2026-10-01.

## Problem brief and evidence

The real Pi packet builder with its 4 s per-command deadline reproduced four AK timeout warnings, yet returned `packetTier=full` / `fullRefreshStatus=complete`. Same-cwd full packets are reused indefinitely. An isolated installed-pin startup snapshot took 6.304 s. Isolated direction export/check/decision-list took 1.133/0.595/0.426 s. The same builder with an isolated 15 s setting completed in 8.458 s with no warnings. Traced concurrent reads confirmed exclusive admission queueing (one 9.15 s wait); tracing inflates latency. These are observations, not a throughput guarantee.

The installed AK gate serializes canonical reads AND writes and permits 30 s admission wait. The consumer assumes parallel reads improve latency and spends only 4 s on admission plus execution. Producer sampling bounds output after computing complete readiness. Current producer code additionally repeats successfully verified repository source admission for each task in the same readiness transaction.

## Goals, owner boundaries and non-goals

- Pi owns collection orchestration, command lifecycle, truthful health/freshness presentation and bounded recovery.
- AK owns readiness predicates, source admission, snapshot query cost, machine envelopes, runtime publication and database admission.
- Do not weaken the exclusive lock, bypass installed `ak`, import direction projections, repair databases, weaken task fact/budget checks, or turn failed authority reads into facts.
- Do not absorb generic multi-handler optimization AK6373 or engine repair AK6370. All discovered defects in THIS delivery path must be fixed or explicitly dispositioned in AK before closeout.
- No timer-driven continuous polling, shared shadow authority store, automatic database mutation or speculative source-owner semantics.

## Chosen consumer architecture

### Distinct state dimensions

Keep packet tier and collection completion for compatibility, but distinguish source health (`healthy`, `degraded`, `not_checked`) and freshness (`fresh`, `stale`). A finished collection with any unavailable required source is degraded. Ready/checkmark is reserved for healthy, fresh full packets. A packet being refreshed is explicitly labelled; expired prior facts may be shown only as stale orientation, never current authority. Absence of direction-check evidence is unknown, not drift. Required-source health is computed from semantically checked typed payloads, not envelope validity or truncated warnings. Validate direction node collections, checked direction reports and decision arrays/counts explicitly. Never consume payloads rejected for wrong envelope, nonzero process exit or schema/type mismatch. Applicability (unregistered/outside/disabled) is separate from health; an unregistered repo is degraded orientation, not a healthy canonical observation.

Report failures with provenance: timeout, cancellation, nonzero exit, launch failure or malformed machine envelope. Preserve envelope/process agreement checking. Include elapsed collection/command information sufficient to explain admission-plus-execution budget without claiming internal AK timing from an external clock.

### Admission-aware collection

Within one refresh, run AK calls serially through the unchanged installed wrapper. Git may proceed independently. Do not globally mutex all Pi sessions or create a consumer-owned database lock. Defaults: 45 s per AK command (30 s configured admission window plus 15 s execution allowance), 120 s whole-refresh wall-clock budget, 250 ms prompt wait. Explicit existing timeout overrides remain supported; expiry of the refresh budget aborts the current owned command and prevents later stages. This is bounded background collection, not a 120 s agent-response wait or a promise that every future workload fits.

### Single-flight, generation-safe lifecycle

One refresh per controller and context identity. All publication and consumption paths (automatic, manual, bounded wait, cwd/config change and shutdown) enforce generation and identity. A superseded result must neither overwrite newer cache nor appear in a current turn. Startup and manual refresh use the same controller. Manual concurrent refresh requests coalesce rather than repeatedly cancelling useful work.

Healthy packet freshness TTL defaults to 5 min. Degraded/failed refreshes become retryable on subsequent operator/agent activity after bounded exponential backoff (base 15 s, cap 120 s, jitter 0–25%). Retry is demand-driven, with no idle background polling. Only a healthy collection resets failure backoff. TTL begins at collection start (the earliest source observation), not completion; elapsed scheduling uses a monotonic clock. Apply jitter before clamping the resulting retry delay to 120 s. Manual refresh can bypass age/backoff once but still coalesces in-flight work. A changed cwd or relevant executable/database/config identity invalidates prior context immediately. Clock and random suppliers are injectable for deterministic tests; retry scheduling uses elapsed-time semantics. Snapshot effective configuration once per generation and fingerprint normalized cwd, resolved configured executable (including PATH lookup), inherited configured AK_DB, enable flag, sampling/limits and time/recovery budgets. AK_DB is merely caller configuration: the published AK gate selects its own database and unsets AK_DB. Recheck current identity after bounded waits and before publication/consumption.

### Owned subprocess lifecycle

Extract the process runner into a bounded module. Cancellation, command timeout and whole-refresh expiry have different recorded reasons. Check cancellation before starting each command. On Linux/POSIX launch each controlled reader in its own process group; stop its group on cancellation/deadline, escalate after 250 ms even if the direct child already exited, and drain direct-child completion. Group settlement is a separate condition: require the owned group to have no live members, not merely a closed pipe or child callback; bound cleanup verification to 2 s after escalation and report cleanup_failure if settlement cannot be established. Never publish cleanup as successful on that path. Process-group containment does not cover a descendant deliberately escaping into a new session; the supported controlled AK readers do not daemonize, and adversarial escape fixtures must be reported as a containment limitation. Never signal another controller or arbitrary pre-existing process. Windows uses the documented direct-child fallback and must not claim equivalent process-tree proof. No cleanup is inferred solely from a Promise being abandoned.

### Module and distribution boundaries

Separate collection/semantic projection from lifecycle and process transport. New modules stay within readability budgets; the large existing extension must not grow its brownfield exception. Include imported modules in `package.json#files` and verify the packed package, not only repository imports. Tests cover the registered extension adapters as well as pure scheduling logic.

## Chosen producer architecture

Optimize only the startup-readiness path using a transaction-local cache of SUCCESSFUL repository source-admission observations, keyed by the exact canonical registered repository path. Validate repository identity first. Do not cache refusals/errors, share across transactions, substitute `known_repo`, alter per-task budget charges, filter terminal tasks in SQL or stop after the output sample. Leave ordinary ready/claim/completion/historical paths unchanged. Introduce an explicit startup-specific entrypoint calling a shared evaluator whose ordinary default remains uncached. Allocate the successful-admission cache INSIDE the transaction retry closure, separately for every attempt. No successful authority observation crosses a retry snapshot. Tests force a retry with admission changing between attempts and prove the ordinary ready path is uncached.

Reason: status filtering and skipping non-ready tasks can change shared evaluation-budget consumption, legacy row decoding and later Ready/Unknown results. Source-admission observations already belong to the same authority read transaction; repeated successful reads add cost without new authority. Admission failure behavior still requires explicit proof: later hypothetical transient failures suppressed by successful-cache reuse are a design tradeoff, not byte-identical failure scheduling.

Expected reduction in common open-admission posture is roughly `3(M-R)` physical queries, for M evaluated matching tasks and R distinct admitted repos. This is a hypothesis, not measured speedup. Complete snapshot comparisons at fixed time, budget charges, source-admission mutations between calls, errors/refusals and physical-query observations are acceptance requirements. Document residual history-dependent decoding/sorting cost; do not describe the snapshot as constant-time.

## Alternatives rejected

- Merely raise 4 s to 15 s: mitigates this sample, leaves cache, race, retry and scaling defects.
- Parallel fanout without admission accounting: creates queues through a serialized resource.
- Aggressive automatic retries: turns degraded context into a load amplifier across controllers.
- Skip all non-pending task rows: may change budget, decoding and Unknown behavior.
- Cross-session cached canonical facts: introduces freshness/authority complications beyond this workstream.

## Verification and rollout/rollback

1. Inspect this RFC and the separate implementation plan before production code changes; resolve blocking findings.
2. Use deterministic clocks/barriers and real controlled subprocess fixtures for success, four-failure degradation, timeout versus abort, recovery, stale TTL, coalescing, manual/cwd/config supersession and shutdown. Test failure storms, no late-stage launches, group drain and packed-module closure.
3. Producer differential parent/candidate tests at fixed time and sample sizes 0/1/default/oversized. Preserve all existing budgets, predicates and malformed-row behavior; prove transaction/cache isolation and reduced repeated admission work. Measure parent and candidate on equivalent isolated data before attributing speedup.
4. Run each owner validation contract. Inspect implementation and inspect the dogfood protocol before executing it.
5. Prove exact AK commits on ak-dev, including rollback, before any AK live deployment. Rust proof MUST pass the built immutable candidate via `ak-dev prove --candidate <clean-X> --binary <candidate-pin>` (or an explicitly proven candidate-pin policy), recording source SHA, binary SHA-256 and build provenance; the default approved pin is not proof of the new Rust behavior. Runtime policy/pin deployment is separately scoped/authorized; source admission is not publication authorization.
6. Push Pi exact commit through its full gate, wait for every CI run, land only via `scripts/land-canonical.sh`. Reload a real Ghostty TUI and observe healthy source checks, induced failure/recovery, concurrency and fresh/stale presentation.
7. Activate only a validated AK runtime bundle using owner procedures; remeasure installed-pin startup and Pi collection. Roll back with AK owner publication mechanism or a gated Pi revert/landing, never DB replacement or manual canonical reset.

## Multi-order effects and residual risks

Longer budgets retain queued reads longer, so serial collection and demand/backoff are inseparable. Multiple independent Pi controllers still share AK capacity; no local retry policy can guarantee a deadline under arbitrary external holds. TTL trades freshness for load; cached packets remain orientation only and exact task/decision operations still read AK. A healthy status is source observation, not a decision authorization. Read-only SQL transactions and process-group ownership must remain safe under the current engine/admission contract. Producer and installed binary currently diverge: measure candidate parent separately from the installed pin to avoid attributing unrelated changes to AK6392.
