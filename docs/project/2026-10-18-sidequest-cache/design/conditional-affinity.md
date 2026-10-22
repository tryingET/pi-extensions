---
summary: "Conditional provider-scoped cache-affinity proposal; no shared logical session IDs, no assumed historical cause."
read_when:
  - "Considering cross-fork cache optimization after native attribution is qualified."
---

# Design C — conditional cache affinity

> **REDACTED historical derivative (AK7403), not byte-identical original evidence.**
> Historical AK7208 proposal only; no current implementation/adoption or live proof.
> Source statements refer to the historical inspection. See [public-copy provenance](../README.md).

**Deferred design option, not a selected implementation.** A2 final-attempt observation and a fresh owner-admitted experiment are prerequisites. The historical first-fork miss does not prove this is the remedy.

## Three identities, three purposes

| Identity | Meaning | Proposed fork rule |
|---|---|---|
| Logical session | Conversation lineage, persistence, peer address, lifecycle and user ownership | Always new; never borrow parent's ID |
| Connection/continuation | Adapter-local socket and prior-response state bound to one ordered conversation/account | Independent per fork; no sharing or copying of `previous_response_id` |
| Optional cache-affinity hint | Provider-specific placement hint for reusable prefix computations | May be shared only inside an explicitly qualified bounded family; never authority, history or guaranteed cache residency |

Current Codex derives cache key and several routing headers from session ID and maintains socket state by session/account. A future independent hint requires a careful adapter split, not simply replacing its existing `sessionId` argument. If the provider requires coupling these identities, retain independent sessions and abandon this optimization rather than invent a transport contract.

## Candidate admission predicates

Every predicate is required; unknown means do not apply the candidate:

1. Native per-attempt records confirm actual effective provider/API/model, account-route equality, model-overlay compatibility and final-prefix relationship.
2. An admitted single-factor experiment demonstrates a useful affinity contribution, not merely association or successful HTTP status.
3. Provider owner establishes the supported cache-hint/header contract. Local implementation source alone does not promise backend behavior.
4. Parent/child are in the same authorized company/security boundary; scoped target ownership and account route are independently verified. Unscoped/company-unknown paths are excluded initially.
5. Effective instruction/tool-schema family and confidentiality boundary are approved; material authority/capability changes are never suppressed to preserve a key.
6. Family lifetime, concurrent-request budget, token/cost cap and explicit rollback/expiry are approved. No global default or background warming follows from a successful pilot.

## Alternatives

| Option | Benefit | Cost/risk | Proposed disposition |
|---|---|---|---|
| Keep per-session affinity | Simple isolation; no undocumented cross-session coupling | May pay fresh prefix costs | Default until qualification |
| Continue parent rather than fork | Often reuses recent context/connection | Serializes work, less independent cognition, longer history | Task-specific choice, not hidden automatic replacement |
| Clean bounded helper | Avoid irrelevant inherited tokens | Needs selected evidence; loses history, may duplicate research | Prefer when context inheritance is unnecessary |
| Independent provider cache-family hint | Potential shared prefix locality with distinct sessions | Backend uncertainty, traffic concentration, privacy/compatibility complexity | Conditional experimental candidate |
| Shared logical ID / continuation socket | Superficially easy | Colliding lineage, state/response cross-talk, supervision errors | Reject |
| One global key or raw prefix-derived public key | Apparent reuse across unrelated work | Cross-company correlation, routing contention and sensitive-data linkage | Reject |
| Force prefix stability by freezing tools/authority | Inflates hit metric | Stale grants, wrong capabilities, lost freshness | Reject |
| Cache warming or padding every child | Better-looking ratio | Paid extra requests/tokens, quota pressure and greater latency | Not part of this design |

## Candidate construction, only if admitted

Use a random, opaque, short-lived family identifier scoped to verified provider/account/company and approved capture lineage. It is not derived from prompt text, credential material, filesystem paths or raw account IDs. Keep it within the provider's actual length/character constraints with collision-resistant encoding; do not rely on silent64-code-point truncation. Its secrecy/retention is bounded as routing metadata, not a grant.

Pass it only to the independently supported affinity field(s). Keep session-related headers and socket map keys unchanged unless the provider owner establishes a separate safe contract and tests it. Store a one-use derivation/selection receipt sufficient for diagnostics, not credential/token history. Do not mutate historical session headers.

A new family is required on company/account change, unresolved route identity, incompatible capability/serialization change, policy expiry or revoked trial approval. This can reduce hits; that is correct behavior. Fresh company snapshots, AGENTS and semantic preflight remain current and source-qualified. Cache reuse never certifies their authority. Prompt/tool changes must be transmitted faithfully even if they break reuse.

Connection concurrency stays independent. Multiple children may use a qualified affinity hint while each has its own response sequence and socket; no continuation map entry, previous-response reference or response item from another child may be reused. If the provider cannot support that separation, stop the candidate.

## What would distinguish causes

Start with unchanged-runtime actual manual fork and native attribution, not a key change. If final instructions/tools/prefix differ, identify that boundary first. If route/account/transport differs, the pair is not a key-only comparison. If matched fields and keys still alternate hits/misses, report backend variability and bound expected benefit rather than claiming a deterministic repair.

Only after this classification, compare independently identified children with identical effective content/route and either default per-session hint or the candidate family hint. Transport mode/previous-response state must be equal or explicitly stratified. Parent-relative prefix length and post-fork fresh observations must be recorded; do not freeze freshness to make the fixture pass. Token cost, latency, retry counts and task correctness are primary outcomes; first-child cache read is explanatory.

One paired result is a pilot, not causality proof under stochastic routing. Randomize order and repeat only under separately approved budget if needed; report variance and inconclusive results. No guaranteed hit ratio or universal TTL is proposed. Ordinary OpenAI Responses/Anthropic/xAI controls are not Codex guarantees.

## Multi-order intervention analysis

Actors: operator pays; controllers choose delegation and are measured; provider controls routing/eviction; maintainers own compatibility; companies/receivers bear privacy and correctness costs. Near horizon: next admitted trial/days. Medium: weeks of adaptation.

| Order | Favorable path | Adverse path / actor response |
|---|---|---|
| 1 | If hypothesis holds, fewer uncached tokens on useful forks | Shared affinity may do nothing or increase contention; implementation and observation overhead cost time |
| 2 | Controllers can afford independent inspection for important tasks | Cheap-looking forks encourage more spawning and full-history replay; cached input/output still costs money |
| 2 | Maintainers improve prefix representation without changing meaning | Agents pad static prompts, retain irrelevant history, freeze snapshots or tools to game the metric |
| 3 | Useful independent results improve receiver confidence | Fan-out increases verification work, queue delay and quota pressure; contaminated/stale context increases rework and authority risk |
| 3 | Bounded pilot identifies where not to optimize | A successful pilot becomes an unjustified global default, crossing companies/accounts and leaking equality metadata |

**R:** perceived cheaper fork → more forks → more high-cache requests → perceived success. Saturates at account/concurrency/context budget, not at zero cost.

**B:** more forks → output/verification cost and route contention → slower correct completion → reduced budget. Delay: end of task/billing interval; CH can remain high while the system worsens.

**R:** percentage target → larger static prefix → higher cached denominator → reward. Delayed **B:** context growth → compaction/rebuild → lost context and expensive rework.

Redesign: capped family/expiry, no automatic warming, no global key, receiver-quality checks, report total new-work tokens/cost/latency. Preserve independent inspection where its correctness benefit exceeds cost; do not minimize requests at the expense of safety. Drop the candidate if an equal-quality clean helper or no-change path is simpler/cheaper.

## Rollback and stop conditions

Disable the optional family selector for **future** requests and return to per-session hints. Do not rewrite persisted lineage, clear another process's sockets, replay requests or migrate credentials. Retain explicit incomplete accounting for already-started attempts. A changed hint may itself cause a temporary cold request; report that transition rather than hide it with retries.

Immediate stop: account/company ambiguity, any response/session cross-talk, stale authority accepted, tool declaration mismatch, signature/replay break, unmeasured retry effects, unauthorized retention or worse correctness. Performance stop: no meaningful total-cost/time improvement under receiver-agreed margins, or improvement requires more prompt/output/spawn load than it saves. Expiry returns to default even if nobody evaluates the pilot; continuation requires new owner approval.
