---
summary: "AK7208 design package: measurement-first sidequest attribution, consistent fork snapshots, and conditional cache affinity. Proposal only."
read_when:
  - "Deciding whether to authorize implementation or live qualification after AK7207."
---

# Sidequest cache and fork correctness — design package

> **REDACTED historical derivative (AK7403), not byte-identical original evidence.**
> This preserves the historical AK7208 proposal, not current implementation/adoption or live proof.
> Historical source/check/authority statements below are not fresh readbacks. See [public-copy provenance](../README.md).

**Status: proposed design, not implemented or adopted architecture.**
Task: **AK7208**, design-only successor to AK7207. No implementation, paid experiment, install/reload, auth/config change, canonical landing, publication or HOLD release is authorized here.

## Decision brief

Deliver three separable capabilities in this order:

1. **Trustworthy request/cache attribution:** native, content-free transport-attempt observations; distinguish a fork's new requests from copied historical usage. Resolve why a request missed before optimizing it.
2. **Consistent fork snapshots:** default manual `/sidequest` to cancellable waiting for local quiescence, followed by an atomic immutable snapshot. Explicit fork-now preserves pending operations as **outcome unknown**, never as proof they failed or may be retried.
3. **Conditional cache-affinity optimization:** investigate only after (1) identifies a controllable affinity contribution. Keep distinct logical session IDs, provider connection state, company boundaries and fresh instructions. Sharing session IDs is rejected.

Optimize **total cost and elapsed time per correct completed task**, not cache-hit percentage. A successful outcome may be better attribution and safe context inheritance with **no cache-affinity change**.

### Operator-selected design inputs

In this session's structured interview the operator selected:

- Measurement-first attribution and fork correctness; cache-affinity experiment only after evidence and separate approval.
- Wait for a quiescent, consistent snapshot by default; explicit fork-now with unknown-effect warning remains available.
- Lower total cost/time per correct task, preserving freshness and isolation.

These selections constrain this proposal. They do not approve its future implementation, live request budget, retention settings or architecture migration. Parent controller confirmed no design successor existed; AK7208 was created and claimed under the investigator's own session. Controller subsequently reiterated read-only/offline scope and required explicit detached-effect, wait/cancel and snapshot behavior.

## Evidence base and uncertainty

[REDACTED AK7207 report](../report.md), public-derivative SHA256 `ea7df20833573e9cd808d0ced52e6d3e424a3fe43351203d44815dcc13545887`; historical original provenance: evidence16099/16100. This digest identifies the public copy, not the original evidence:

- Actual HTML fork's first new response:144,389 uncached/cache0; next144,256 cached of148,968 input (96.84%).
- Current-adapter offline reconstruction preserves early instructions/tools and a large input prefix. Late divergence is an absent parent tool result, replaced by synthetic `No result provided`.
- Same parent also has warm→zero→warm without forking; offline tools change41,539→44,663 bytes. A miss pattern does not identify a unique cause.
- Fork copies history, not cached socket continuation; new ID changes Codex affinity identifiers. Neither fact proves it caused the historical miss.
- Historical final payload, loaded generation, account equality, transport, hooks, backend retention and TTFT remain unknown.

The original diagnostic files and hash manifest were immutable inputs to AK7208 and remain privately preserved. AK7403 redacts the public derivatives and regenerates their manifests; those new digests do not replace original evidence identities. No conclusion is rewritten to fit the proposal.

### New source-grounded design constraints

Independent static inspection `inspection-host-contract` of installed Pi1.1.0 found:

- `before_provider_request` is an ordered **transform chain**, not immutable final-wire observation. Codex subsequently selects transport, computes incremental input/`previous_response_id`, creates a WebSocket envelope and retries/falls back without rerunning that hook for every attempt.
- `after_provider_response` covers HTTP metadata, not WebSocket request sends or response completion; parsed provider events lack outgoing-attempt correlation.
- `waitForIdle()` checks limited local state, not a reservation. Settlement clears the active flag before awaited `agent_settled` handlers finish; deferred prompts may follow. Commands/preprocessing and independently running bash can race it.
- Session getters expose shallow arrays. Current `forkFrom()` reads a mutable file and copies non-header entries; no exact active-leaf snapshot transaction is promised.

Therefore **an extension-only logger plus `waitForIdle(); copyFile()` cannot implement the desired guarantees**. Details and source references are in the component designs.

## Package contents

| Document | Decision it supports |
|---|---|
| [Request attribution](request-attribution.md) | Native observation boundary, minimal record contract, privacy and metric semantics |
| [Fork correctness](fork-correctness.md) | Local quiescence, transactional snapshot, indefinite wait/cancel, explicit unknown-effects path |
| [Conditional affinity](conditional-affinity.md) | Alternatives, admission predicates, independent identity and isolation, reject conditions |
| [Verification and rollout](verification-rollout.md) | Falsifiers, traceable acceptance tests, owner stages, experiments and rollback |
| [Inspection record](inspection.md) | Independent findings and their disposition; design conformance is not runtime proof |

## Owner boundaries

| Concern | Proposed accountable owner | Required acceptance |
|---|---|---|
| Final transport attempt, normalized response linkage, model/account-route identity | Pi host / pi-ai provider maintainer (`softwareco/contrib/pi-mono` owner path, confirm current upstream ownership before implementation) | Native seam and provider-specific coverage; no generic extension monkeypatch |
| Session mutation serialization, immutable branch snapshot, session ID creation | Pi host SessionManager/AgentSessionRuntime owner | Atomicity/reentrancy/queue contract |
| `/sidequest` UX and supported Ghostty launch | pi-extensions / pi-little-helpers | Default change, command/tool compatibility, exact HOLD applicability |
| Optional display/storage consumer | Pi footer and, only if accepted, pi-telemetry | New metadata purpose/retention; no payload or authority-store expansion |
| ASC dispatch usage | pi-autonomous-session-control | Invocation-vs-session wording and copied-usage exclusion; not ownership of `/sidequest` |
| Account isolation and temporary experimental budget | Account/operator + provider owner | Explicit trial permission; no global credential changes |
| Company and semantic freshness | Existing company/ROCS/AK owner surfaces | Never freeze authority or certify copied advisory results |
| Task direction, approval, evidence | AK task/decision owners | Fresh native records; documents do not grant adoption authority |

Ontology inspection searched repo semantics for session/fork/cache/request provenance with no hits. This is no completeness proof. Terms below are **provisional implementation labels**, not new ontology concepts or changes to governed meanings; no ontology write is proposed. If reusable cross-owner concepts are required, route an ontology proposal separately.

## Binding statements proposed for owner adoption

Each row is a *proposed requirement*, not a currently enforced rule.

| ID | Proposed shall | Owner | Acceptance |
|---|---|---|---|
| A1 | Distinguish logical request, transport attempt, copied history and first new child response | Host/provider + display | T-A1 |
| A2 | Observe serialized per-attempt dispatch arguments after all request transformations; report exact coverage and loss | Host/provider | T-A2/A3 |
| A3 | Never persist prompts, tokens, opaque reasoning, account IDs or response IDs in diagnostic records; bound campaign lifetime/storage and preserve safe-disposal custody | Host/provider + storage | T-A4/A6 |
| A4 | Report cache read/write/uncached/output and unknown usage without confusing estimates with invoices | Host/provider + display | T-A5 |
| F1 | Capture one immutable revision with distinct child identity and bounded snapshot storage/lifecycle | Host session | T-F1/F2/F9 |
| F2 | Default manual fork to cancellable local-quiescence wait; reject reentrant self-wait | LH + host | T-F3/F4 |
| F3 | Preserve unresolved outcomes and never imply retry safety or external settlement | LH + host | T-F5 |
| F4 | Admit source-history disclosure to exact destination independently of affinity; recheck identity/permission at bootstrap; never duplicate indeterminate launch | LH + host + source owner | T-F6/F7/F8 |
| C1 | Keep optional cache affinity separate from logical session and connection-continuation identity | Provider | T-C1 |
| C2 | Partition experiments by verified provider/account/company; retain freshness and tool truth | Provider + source owners | T-C2/C3 |
| C3 | Adopt an optimization only with matched useful-task cost/latency benefit and no correctness regression | Receiver/operator | T-C4 |

## Alternatives and decisions requested

- **Do nothing:** lowest immediate change risk; leaves first-fork charges unexplained and pending effects ambiguous. Retain as fallback, not the preferred design.
- **Extension-only instrumentation:** useful explicitly labelled pre-transport diagnostics; rejected as final-wire proof. May be a temporary read-only display, never a substitute for A2.
- **Serialize everything under a global lock:** rejected; holds across network/tools would stall the agent and create deadlocks. Snapshot transaction is short and host-local.
- **Freeze system/tools/company snapshots:** rejected. Cache percentage must not overrule fresh authority or accurate capabilities.
- **Share logical session ID or WebSocket continuation between forks:** rejected. Identity, routing affinity and continuation have different lifetimes and safety properties.
- **Always use clean workers:** useful for context-independent tasks, not a semantic replacement for history inheritance.

Requested later owner decisions: accept native contracts; approve manual/tool UX compatibility; resolve HOLD scope; admit bounded private telemetry retention; approve exact isolated live matrix/budget; only then consider an affinity candidate. No native architecture decision is marked accepted by this package. Codex live qualification has an additional unresolved budget decision: no supported wire output cap is established, so either retain a hard-cap block or separately accept soft targets, qualified attempt/request guards and possible in-flight overshoot. Never add an unsupported `max_output_tokens` field.

The proposed confidentiality and snapshot guarantees apply to cooperating admitted host/extension paths, not an OS sandbox against malicious same-user extensions. Existing extensions run with user permissions. Source transfer refusal, bounded retention and keyed metadata reduce exposure; they do not stop arbitrary local code reading accessible session files. Stronger adversarial isolation is a separate workstation/security-owner design, not silently claimed here. Initial pilots use classified synthetic history with explicit destinations; mixed legacy histories are not automatically admitted by CWD inference.

## Multi-order design conclusion

Near horizon (days): explicit new-request accounting and pending-result warnings improve diagnosis; waiting may reduce parallelism. Medium horizon (weeks): agents may overspawn when cache looks cheap, inflate static prompts to raise percentages, or avoid independent inspection to lower request counts. Instrumentation may become a sensitive shadow archive. Use bounded local retention, useful-task metrics, explicit receiver-quality checks and an off switch. Favorable telemetry does not permit more authority or mutation.

The design is complete when its contracts and falsifiers are coherent and inspected. Behavior is complete only after separately admitted implementation, receiver validation and live proof. AK7208 does not close AK7207, Decision151 or any package hold.
